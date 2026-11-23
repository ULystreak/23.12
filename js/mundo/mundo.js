/* ============================================================================
   MUNDO: o renderer, a câmera que anda, o laço e a qualidade
   ============================================================================
   Com WebGL monta o three de lib/, a cena na cor da noite, a câmera dentro
   de um `rig` que anda, o laço no ticker do GSAP, a qualidade adaptativa (DPR
   e nível), o passo de base que nunca para (`mundo.deriva`), as caminhadas
   (`mundo.caminhar`), o ponteiro suavizado e as conversões tela↔mundo. Monta
   as pétalas, a alameda, os véus atrás do texto e a hora da noite. Sem WebGL, ou
   se o three falhar, devolve o mundo leve de leve.js: mesma API, `ok` falso.

   Não há luz na cena: todo material é ShaderMaterial ou MeshBasicMaterial e a
   luz de cada hora entra por uniforme (hora.js). Um material iluminado, sem
   luz nenhuma, sairia preto.

   O passo de base: a alameda nunca para ("passeio, não esteira"). Uma
   caminhada acelera por cima dele, e a soma em quadratura não deixa quina
   quando ela começa ou acaba.
   ========================================================================== */

import { clamp, lerp, suave, amortecer, debounce } from '../nucleo/util.js';
import { baixarNivel } from '../nucleo/ambiente.js';
import { curvas, comoPromise } from '../nucleo/movimento.js';
import { criarPetalas } from './petalas.js';
import { criarFundo, criarVeus } from './fundo.js';
import { criarAlameda } from './alameda.js';
import { criarHora } from './hora.js';

export const ALTURA_OLHOS = 1.5;

// --noite de base.css (#0b1026): o fundo antes de a alameda surgir e sem ela.
const COR_DA_NOITE = 0x0b1026;

const FOV_EM_PE = 58;
const FOV_DEITADO = 42;

// Passo de base (m/s) e o do movimento reduzido.
const PASSO_BASE = 0.42;
const PASSO_BASE_CALMO = 0.09;
// Passos por segundo, do passeio à caminhada apressada.
const CADENCIA_LENTA = 1.15;
const CADENCIA_RAPIDA = 1.9;
// Balanço do passo, na amplitude cheia (m e rad).
const BALANCO_VERTICAL = 0.0125;
const BALANCO_LATERAL = 0.007;
const BALANCO_ROLAGEM = 0.0027;
const ARFAR = 0.0016;
// Movimento reduzido: o quanto ela anda de verdade antes da dissolvência.
const VELOCIDADE_CALMA = 0.28;

// Medidor de qualidade (ms).
const QUADRO_LENTO_MS = 22;
const JANELA_MS = 2000;
const CARENCIA_MS = 1500;
const CARENCIA_DEGRAU_MS = 600;
const AMOSTRAS_RITMO = 36;

/* ---- a curva da caminhada ---------------------------------------------------- */

// Arranca macia (26% do tempo) e chega devagar (42%): a velocidade é
// s(t/0,26)·s((1−t)/0,42), integrada e normalizada em 97 pontos. O pico fica
// em ~1,5× a média; uma curva em S comum passaria de 2× e a caminhada viraria
// corrida.
const TABELA_CAMINHADA = (() => {
  const N = 96;
  const ENTRADA = 0.26;
  const CHEGADA = 0.42;
  const velocidade = (t) => suave(t / ENTRADA) * suave((1 - t) / CHEGADA);
  const tabela = new Float64Array(N + 1);
  let anterior = velocidade(0);
  for (let i = 1; i <= N; i++) {
    const v = velocidade(i / N);
    tabela[i] = tabela[i - 1] + (anterior + v) / 2;
    anterior = v;
  }
  const total = tabela[N];
  for (let i = 1; i <= N; i++) tabela[i] /= total;
  return tabela;
})();

/** Ease da caminhada: 0..1 → 0..1. Serve direto como `ease` do GSAP. */
export function curvaDaCaminhada(p) {
  const N = TABELA_CAMINHADA.length - 1;
  const x = clamp(Number(p) || 0) * N;
  const i = Math.min(N - 1, Math.floor(x));
  return lerp(TABELA_CAMINHADA[i], TABELA_CAMINHADA[i + 1], x - i);
}

/** FOV vertical: 58° com o celular em pé, 42° na tela deitada, linear entre os dois. */
function fovPara(aspecto) {
  return lerp(FOV_EM_PE, FOV_DEITADO, clamp((aspecto - 0.8) / 0.55));
}

/* ---- o ponteiro ---------------------------------------------------------------- */

/**
 * Para onde ela olha, em −1..1 (y para cima), suavizado em `atualizar(dt)`.
 * Mouse: a posição do cursor. Toque e caneta: o arrasto desde onde o dedo
 * pousou, que volta ao centro quando ele sai. Android: a inclinação do
 * aparelho, somada por cima (o iPhone pediria permissão; não pedimos).
 */
export function criarPonteiro(amb) {
  const alvo = { x: 0, y: 0 };
  const inclinacao = { x: 0, y: 0 };
  let dedo = null;

  const ponteiro = {
    x: 0,
    y: 0,
    ativo: false,
    atualizar(dt) {
      ponteiro.x = amortecer(ponteiro.x, clamp(alvo.x + inclinacao.x * 0.6, -1, 1), 4.5, dt);
      ponteiro.y = amortecer(ponteiro.y, clamp(alvo.y + inclinacao.y * 0.6, -1, 1), 4.5, dt);
    },
  };

  const largura = () => Math.max(1, innerWidth);
  const altura = () => Math.max(1, innerHeight);
  const centrar = () => {
    alvo.x = 0;
    alvo.y = 0;
    ponteiro.ativo = false;
  };
  const passivo = { passive: true };

  addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    dedo = { id: e.pointerId, x: e.clientX, y: e.clientY };
    ponteiro.ativo = true;
  }, passivo);

  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      alvo.x = clamp((e.clientX / largura()) * 2 - 1, -1, 1);
      alvo.y = clamp(1 - (e.clientY / altura()) * 2, -1, 1);
      ponteiro.ativo = true;
    } else if (dedo && e.pointerId === dedo.id) {
      // O dedo percorre pouco da tela: o arrasto vale 3,2× a fração andada.
      alvo.x = clamp(((e.clientX - dedo.x) / largura()) * 3.2, -1, 1);
      alvo.y = clamp((-(e.clientY - dedo.y) / altura()) * 3.2, -1, 1);
    }
  }, passivo);

  const soltar = (e) => {
    if (!dedo || e.pointerId !== dedo.id) return;
    dedo = null;
    centrar();
  };
  addEventListener('pointerup', soltar, passivo);
  addEventListener('pointercancel', soltar, passivo);
  document.documentElement.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') centrar();
  }, passivo);

  if (amb?.android && !amb.reduzido && 'DeviceOrientationEvent' in window) {
    // A base acompanha devagar o jeito como ela segura o celular.
    let base = null;
    addEventListener('deviceorientation', (e) => {
      if (typeof e.gamma !== 'number' || typeof e.beta !== 'number') return;
      base ||= { g: e.gamma, b: e.beta };
      base.g += (e.gamma - base.g) * 0.01;
      base.b += (e.beta - base.b) * 0.01;
      inclinacao.x = clamp((e.gamma - base.g) / 22, -1, 1);
      inclinacao.y = clamp(-(e.beta - base.b) / 22, -1, 1);
    }, passivo);
  }

  return ponteiro;
}

/* ---- sem WebGL ------------------------------------------------------------------ */

async function cairParaLeve(opcoes, fundo) {
  opcoes.amb.webgl = false;
  document.documentElement.classList.add('sem-webgl');
  const { criarMundoLeve } = await import('./leve.js');
  return criarMundoLeve({ ...opcoes, fundo });
}

function nomeDaGpu(renderer) {
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch {
    return '';
  }
}

/* ---- o mundo ---------------------------------------------------------------------- */

/** `opcoes = { amb, canvas, recipienteLeve }` → Promise do mundo (3D com `ok: true`, ou o leve). */
export async function criarMundo(opcoes) {
  const { amb, canvas, recipienteLeve } = opcoes;
  const leve = () => cairParaLeve(opcoes, criarFundo({ amb, antesDe: canvas || recipienteLeve }));
  if (!amb.webgl || !canvas) return leve();

  let THREE;
  let renderer;
  try {
    THREE = await import('../../lib/three.module.min.js');
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: amb.nivel !== 'baixo',
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
  } catch (erro) {
    console.warn('[carta] o WebGL não abriu; o mundo vai leve', erro);
    return leve();
  }
  renderer.setClearColor(COR_DA_NOITE, 1);

  const gsap = window.gsap;
  const raiz = document.documentElement;
  // Só o texto vazio desliga a alameda; sem a chave, ela fica.
  const enderecoFundo = window.CONTEUDO?.pagina?.fundo;
  const comAlameda = enderecoFundo === undefined || (typeof enderecoFundo === 'string' && enderecoFundo.trim() !== '');
  // Entrada noturna (?volta=1, ?cena=menu): o canvas fica invisível desde o
  // primeiro desenho e dissolve sobre a página escura quando a alameda fica
  // pronta, sem clarão.
  const noturna = comAlameda && raiz.classList.contains('entra-noite');
  if (noturna) canvas.style.opacity = '0';

  const cena = new THREE.Scene();
  cena.background = comAlameda ? null : new THREE.Color(COR_DA_NOITE);
  // A névoa visível da alameda é nevoar(), nos shaders dela. Este fog guarda a
  // cor que a alameda pinta e as pétalas leem por referência, e vale para os
  // materiais com fog: true.
  cena.fog = new THREE.Fog(COR_DA_NOITE, 2.5, 9.5);
  const fundo = criarVeus({ depoisDe: comAlameda ? canvas : null });

  const camera = new THREE.PerspectiveCamera(FOV_EM_PE, 1, 0.05, comAlameda ? 60 : 40);
  camera.position.set(0, ALTURA_OLHOS, 0);
  const rig = new THREE.Group();
  rig.name = 'rig';
  rig.add(camera);
  cena.add(rig);

  const ouvintes = new Set();
  const aoTamanho = new Set();
  const aoNivel = new Set();
  const tamanho = { largura: 1, altura: 1, dpr: 1 };
  const ponteiro = criarPonteiro(amb);
  const ponto = new THREE.Vector3();
  // ?nivel= trava a qualidade: o medidor nem começa.
  const medidor = { parado: !!amb.forcado, inicio: 0, soma: 0, n: 0, carenciaAte: 0, amostras: [], limite: QUADRO_LENTO_MS };

  let dprAtual = Math.min(window.devicePixelRatio || 1, amb.dprMax);
  let dprGuardado = null;
  let ligado = true;
  let rodando = false;
  let contextoPerdido = false;
  let ultimo = 0;
  let tempo = 0;
  let deriva = 0;
  let zAnterior = 0;
  let amplitude = 0;
  let fase = 0;
  let filaCaminhada = Promise.resolve();
  let alameda = null;
  let horaAtual = null;
  let quadroFalhou = false;

  /* ---- tamanho ------------------------------------------------------------------ */

  function aplicarTamanho(forcar = false) {
    const largura = Math.max(1, Math.round(canvas.clientWidth || innerWidth));
    const altura = Math.max(1, Math.round(canvas.clientHeight || innerHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, dprAtual);
    if (!forcar && largura === tamanho.largura && altura === tamanho.altura && dpr === tamanho.dpr) return;
    tamanho.largura = largura;
    tamanho.altura = altura;
    tamanho.dpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(largura, altura, false);
    camera.aspect = largura / altura;
    camera.fov = fovPara(camera.aspect);
    camera.updateProjectionMatrix();
    for (const fn of aoTamanho) {
      try {
        fn(tamanho);
      } catch (erro) {
        console.error('[carta] aoRedimensionar falhou', erro);
      }
    }
    // setSize apaga o desenho: redesenha já, senão o canvas fica vazio até o
    // próximo quadro (ou até religar, se o mundo está desligado atrás da folha).
    // Um erro aqui não pode subir para o ticker do GSAP (baixarQualidade roda
    // dentro do laço) nem para o debounce.
    if (contextoPerdido) return;
    try {
      renderer.render(cena, camera);
    } catch (erro) {
      avisarFalha(erro);
    }
  }

  // A barra do Safari muda o 100dvh várias vezes por segundo: um tamanho por pausa.
  const pedirTamanho = debounce(() => aplicarTamanho(), 140);

  /* ---- câmera e passo ------------------------------------------------------------- */

  function atualizarCamera(dt) {
    ponteiro.atualizar(dt);

    const z = rig.position.z;
    const caminhada = dt > 0 ? Math.min(4, Math.abs(z - zAnterior) / dt) : 0;
    zAnterior = z;
    const passo = amb.reduzido ? PASSO_BASE_CALMO : PASSO_BASE;
    const base = Math.hypot(passo, caminhada) - caminhada;
    deriva += base * dt;
    const velocidade = caminhada + base;

    const alvo = amb.reduzido ? 0 : clamp(velocidade / 0.9);
    amplitude = amortecer(amplitude, alvo, alvo > amplitude ? 3.4 : 2.2, dt);
    fase += dt * lerp(CADENCIA_LENTA, CADENCIA_RAPIDA, clamp(velocidade / 1.8)) * clamp(4 * amplitude);
    const c = fase * Math.PI * 2;
    const a = amplitude;
    const forca = amb.reduzido ? 0.35 : 1;

    camera.position.set(
      Math.sin(c / 2) * BALANCO_LATERAL * a + ponteiro.x * 0.035 * forca,
      ALTURA_OLHOS + (Math.cos(c) + 0.18 * Math.cos(2 * c + 0.7)) * BALANCO_VERTICAL * a + ponteiro.y * 0.02 * forca,
      0,
    );
    camera.rotation.set(
      ponteiro.y * 0.018 * forca + Math.sin(c + 1.2) * ARFAR * a,
      -ponteiro.x * 0.03 * forca,
      Math.sin(c / 2 + 0.4) * BALANCO_ROLAGEM * a,
    );
  }

  /* ---- qualidade -------------------------------------------------------------------- */

  function reiniciarMedidor(agora, carencia) {
    medidor.inicio = 0;
    medidor.soma = 0;
    medidor.n = 0;
    medidor.janela = [];
    medidor.carenciaAte = agora + carencia;
  }

  // O iPhone que entra no modo de economia no meio da carta (bateria abaixo de
  // 20%) passa de 60 a 30 Hz sem estar lento. Uma janela cujo ritmo estável
  // (a mediana: a janela da virada mistura quadros de 16 e de 33 ms) cai entre
  // 28 e 38 ms e cuja média cabe em 1,4 × esse ritmo
  // é esse teto: a régua sobe para ele, em vez de a nitidez cair. Quadros que
  // pesam de verdade passam de 38 ms e continuam baixando a qualidade.
  function tetoDe30Hz(media) {
    const ordenado = [...medidor.janela].sort((x, y) => x - y);
    const ritmo = ordenado[Math.floor(ordenado.length / 2)];
    if (!(ritmo >= 28 && ritmo <= 38) || media > 1.4 * ritmo) return false;
    medidor.limite = Math.max(medidor.limite, 1.4 * ritmo);
    return true;
  }

  // O ritmo natural do aparelho: iPhone em economia e telas de 30 Hz rodam a
  // ~33 ms sem estar lentos. O 20º percentil dos primeiros 36 quadros (de 0 a
  // 250 ms, carência incluída) vira a régua.
  function calibrar(bruto) {
    if (medidor.amostras.length >= AMOSTRAS_RITMO || !(bruto > 0 && bruto < 250)) return;
    medidor.amostras.push(bruto);
    if (medidor.amostras.length < AMOSTRAS_RITMO) return;
    const ordenado = [...medidor.amostras].sort((x, y) => x - y);
    medidor.limite = Math.max(QUADRO_LENTO_MS, 1.4 * ordenado[Math.floor(AMOSTRAS_RITMO * 0.2)]);
  }

  function medir(bruto, agora) {
    if (medidor.parado) return;
    calibrar(bruto);
    // A frase final é escrita em DPR 3 e não perde nitidez no meio da escrita:
    // enquanto ela é escrita, o medidor só espera. Depois volta a medir, com
    // carência, para um aparelho lento não ficar preso em DPR 3 até o menu.
    if (dprGuardado !== null && raiz.dataset.etapa === 'escrevendo') {
      reiniciarMedidor(agora, CARENCIA_MS);
      return;
    }
    if (agora < medidor.carenciaAte) return;
    medidor.inicio ||= agora;
    medidor.soma += Math.min(bruto, 100);
    medidor.n += 1;
    (medidor.janela ||= []).push(Math.min(bruto, 100));
    if (agora - medidor.inicio < JANELA_MS) return;
    const media = medidor.soma / medidor.n;
    const teto = media > medidor.limite && tetoDe30Hz(media);
    reiniciarMedidor(agora, 0);
    if (media > medidor.limite && !teto) baixarQualidade(agora);
  }

  // Primeiro a nitidez (DPR −0,5 até 1), depois o nível, depois 0,75. Daqui
  // nunca sobe; a única subida é a de nitidezMaxima, e só até ela desligar.
  function baixarQualidade(agora) {
    const efetivo = Math.min(window.devicePixelRatio || 1, dprAtual);
    if (efetivo > 1) {
      dprAtual = Math.max(1, efetivo - 0.5);
    } else if (baixarNivel(amb)) {
      dprAtual = Math.min(dprAtual, amb.dprMax);
      for (const fn of aoNivel) {
        try {
          fn(amb.nivel);
        } catch (erro) {
          console.error('[carta] aoMudarNivel falhou', erro);
        }
      }
    } else if (efetivo > 0.75) {
      dprAtual = 0.75;
    } else {
      medidor.parado = true;
      return;
    }
    aplicarTamanho(true);
    reiniciarMedidor(agora, CARENCIA_DEGRAU_MS);
  }

  /** A frase final é escrita na nitidez da tela (DPR até 3); `false` devolve o que era. */
  function nitidezMaxima(ligar = true) {
    if (ligar) {
      if (dprGuardado === null) dprGuardado = dprAtual;
      dprAtual = Math.min(window.devicePixelRatio || 1, 3);
    } else {
      if (dprGuardado === null) return;
      dprAtual = Math.min(dprAtual, dprGuardado);
      dprGuardado = null;
    }
    reiniciarMedidor(performance.now(), CARENCIA_MS);
    aplicarTamanho(true);
  }

  /* ---- o laço ------------------------------------------------------------------------ */

  // No ticker do GSAP: um rAF por quadro, e os tweens sempre andam antes do
  // render (some o quadro de atraso no 3D). O dt é tempo real: ?rapido acelera
  // as caminhadas e as horas, não o passo de base nem o balanço.
  function laco() {
    const agora = performance.now();
    const bruto = agora - ultimo;
    ultimo = agora;
    const dt = Math.min(Math.max(bruto, 0) / 1000, 0.05);
    tempo += dt;

    atualizarCamera(dt);
    for (const fn of ouvintes) {
      try {
        fn(dt, tempo);
      } catch (erro) {
        ouvintes.delete(fn);
        console.error('[carta] aoQuadro falhou', erro);
      }
    }
    // Uma alameda que falha não congela o quadro: o render segue sem ela.
    try {
      alameda?.atualizar(dt, tempo, deriva);
    } catch (erro) {
      avisarFalha(erro);
    }
    try {
      renderer.render(cena, camera);
    } catch (erro) {
      avisarFalha(erro);
    }
    medir(bruto, agora);
  }

  // Um erro que se repete a cada quadro viraria uma enxurrada no console.
  function avisarFalha(erro) {
    if (!quadroFalhou) console.error('[carta] o quadro do mundo falhou', erro);
    quadroFalhou = true;
  }

  function atualizarLaco() {
    const deve = ligado && !document.hidden && !contextoPerdido;
    if (deve === rodando) return;
    rodando = deve;
    if (deve) {
      ultimo = performance.now();
      zAnterior = rig.position.z;
      reiniciarMedidor(ultimo, CARENCIA_MS);
      gsap.ticker.add(laco);
    } else {
      gsap.ticker.remove(laco);
    }
  }

  /* ---- caminhadas -------------------------------------------------------------------- */

  /** Anda `distancia` metros para a frente em `duracao` s. As caminhadas entram em fila. */
  function caminhar(opcoes = {}) {
    const andar = () => andarJa(opcoes);
    filaCaminhada = filaCaminhada.then(andar, andar);
    return filaCaminhada;
  }

  function andarJa({ distancia = 6, duracao = 5, curva } = {}) {
    const d = Number(distancia) || 0;
    const dur = Math.max(0, Number(duracao) || 0);
    const z0 = rig.position.z;
    if (!d || !dur || !gsap) {
      rig.position.z = z0 - d;
      return Promise.resolve();
    }
    if (amb.reduzido) return andarCalmo(z0, d, dur);
    const estado = { p: 0 };
    return comoPromise(gsap.to(estado, {
      p: 1,
      duration: dur,
      ease: curva || curvaDaCaminhada,
      onUpdate: () => {
        rig.position.z = z0 - d * estado.p;
      },
    }));
  }

  // A cor do fundo do túnel naquela hora (a da noite, sem alameda).
  function corDaNevoa() {
    if (!alameda || !horaAtual) return '#0b1026';
    const [r, g, b] = horaAtual.nevoa.map((c) => Math.round(clamp(c) * 255));
    return `rgb(${r}, ${g}, ${b})`;
  }

  // Movimento reduzido: um avanço lento, sem balanço; o grosso do caminho
  // acontece dentro de uma dissolvência e o mundo volta mais adiante. O canvas
  // se dissolve na cor do fundo do túnel, para não piscar outra cor.
  function andarCalmo(z0, d, dur) {
    const lento = Math.sign(d) * Math.min(Math.abs(d), VELOCIDADE_CALMA * dur);
    const salto = d - lento;
    const estado = { p: 0, s: 0 };
    const tl = gsap.timeline({
      onUpdate: () => {
        rig.position.z = z0 - lento * estado.p - salto * estado.s;
      },
    });
    tl.to(estado, { p: 1, duration: dur, ease: curvas.branco.deriva }, 0);
    if (Math.abs(salto) > 0.01) {
      const some = Math.min(0.7, 0.2 * dur);
      const meio = Math.max(some, 0.36 * dur);
      document.body.style.backgroundColor = corDaNevoa();
      tl.to(canvas, { opacity: 0, duration: some, ease: curvas.branco.deriva }, meio - some)
        .set(estado, { s: 1 }, meio)
        .to(canvas, { opacity: 1, duration: Math.min(1, 0.3 * dur), ease: curvas.branco.deriva, clearProps: 'opacity' }, meio + 0.04);
    }
    return comoPromise(tl).then(() => {
      document.body.style.backgroundColor = '';
    });
  }

  /* ---- conversões tela ↔ mundo ------------------------------------------------------- */

  function meiaAlturaEm(d) {
    return Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * d;
  }

  /** Ponto do mundo a `distancia` m da lente, sob o ponto (xNdc, yNdc) da tela. */
  function telaParaMundo(xNdc, yNdc, distancia = 1) {
    const meia = meiaAlturaEm(distancia);
    rig.updateMatrixWorld(true);
    return new THREE.Vector3(xNdc * meia * camera.aspect, yNdc * meia, -distancia).applyMatrix4(camera.matrixWorld);
  }

  /** Ponto do mundo → px de tela; `visivel` quando está entre os planos da câmera. */
  function mundoParaTela(v) {
    rig.updateMatrixWorld(true);
    ponto.copy(v).project(camera);
    return {
      x: (ponto.x * 0.5 + 0.5) * tamanho.largura,
      y: (-ponto.y * 0.5 + 0.5) * tamanho.altura,
      visivel: ponto.z > -1 && ponto.z < 1,
    };
  }

  /**
   * A pose que põe `obj` exatamente sobre o retângulo `rect` (px da tela), no
   * espaço da câmera, a `distancia` m: quem a usa anexa o objeto à câmera e ele
   * não treme com o passo. A escala parte da caixa da geometria de `obj`.
   */
  function retanguloParaPose(rect, obj, { distancia = 0.6 } = {}) {
    const mpp = (2 * meiaAlturaEm(distancia)) / tamanho.altura;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const geo = obj?.geometry;
    if (geo && !geo.boundingBox) geo.computeBoundingBox();
    const caixa = geo?.boundingBox;
    const baseL = caixa ? caixa.max.x - caixa.min.x || 1 : 1;
    const baseA = caixa ? caixa.max.y - caixa.min.y || 1 : 1;
    return {
      posicao: new THREE.Vector3((cx - tamanho.largura / 2) * mpp, -(cy - tamanho.altura / 2) * mpp, -distancia),
      escala: new THREE.Vector3((rect.width * mpp) / baseL, (rect.height * mpp) / baseA, 1),
      quaternion: new THREE.Quaternion(),
      pai: camera,
    };
  }

  /* ---- o objeto -------------------------------------------------------------------- */

  const mundo = {
    ok: true,
    amb,
    recipienteLeve,
    THREE,
    renderer,
    cena,
    camera,
    rig,
    canvas,
    gpu: nomeDaGpu(renderer),
    tamanho,
    ponteiro,
    get ligado() { return ligado; },
    get deriva() { return deriva; },
    aoQuadro(fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },
    // O canvas fica no DOM com o último quadro quando o mundo desliga.
    ligar() {
      ligado = true;
      canvas.style.visibility = '';
      atualizarLaco();
    },
    desligar() {
      ligado = false;
      atualizarLaco();
    },
    caminhar,
    telaParaMundo,
    mundoParaTela,
    retanguloParaPose,
    aoMudarNivel(fn) {
      aoNivel.add(fn);
      return () => aoNivel.delete(fn);
    },
    aoRedimensionar(fn) {
      aoTamanho.add(fn);
      return () => aoTamanho.delete(fn);
    },
    nitidezMaxima,
    petalas: null,
    fundo,
    alameda: null,
  };

  aplicarTamanho(true);
  addEventListener('resize', pedirTamanho);
  addEventListener('orientationchange', pedirTamanho);
  window.visualViewport?.addEventListener('resize', pedirTamanho);
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => pedirTamanho()).observe(canvas);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    contextoPerdido = true;
    atualizarLaco();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextoPerdido = false;
    aplicarTamanho(true);
    atualizarLaco();
  });
  document.addEventListener('visibilitychange', atualizarLaco);

  /* ---- pétalas ----------------------------------------------------------------------- */

  const petalas = criarPetalas(mundo, amb);
  mundo.petalas = petalas;
  mundo.aoQuadro(petalas.atualizar);
  // Invisíveis até o programa compilar (senão o primeiro desenho engasga), com guarda de 1,5 s.
  petalas.objeto.visible = false;
  let petalasProntas = false;
  const mostrarPetalas = () => {
    if (petalasProntas) return;
    petalasProntas = true;
    petalas.objeto.visible = true;
  };
  renderer.compileAsync(petalas.objeto, camera, cena).then(mostrarPetalas, mostrarPetalas);
  setTimeout(mostrarPetalas, 1500);

  /* ---- alameda ------------------------------------------------------------------------ */

  if (comAlameda) {
    // Um respiro antes de gerar a alameda: texturas e árvores são trabalho síncrono pesado.
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      alameda = criarAlameda(mundo);
      mundo.alameda = alameda;
      mundo.aoMudarNivel((nivel) => alameda?.nivel(nivel));
      // Nasce da noite em 1,8 s; entrando por ?cena=, em 0,6 s; na entrada noturna, já pronta.
      const duracao = noturna ? 0 : amb.params?.has('cena') ? 0.6 : 1.8;
      alameda.pronta
        .then(() => {
          alameda?.surgir(duracao);
          if (noturna) gsap.to(canvas, { opacity: 1, duration: 0.6, clearProps: 'opacity' });
          fundo.ligar();
        })
        .catch((erro) => {
          canvas.style.opacity = '';
          console.error('[carta] a alameda não surgiu', erro);
        });
    } catch (erro) {
      console.error('[carta] a alameda não montou; o mundo segue na cor da noite', erro);
      alameda = null;
      mundo.alameda = null;
      cena.background = new THREE.Color(COR_DA_NOITE);
      canvas.style.opacity = '';
    }
  }

  /* ---- hora --------------------------------------------------------------------------- */

  criarHora(mundo, amb, (e) => {
    horaAtual = e;
    alameda?.aplicarHora(e);
    petalas.luzDaHora?.(e.petalas);
  });

  atualizarLaco();
  return mundo;
}
