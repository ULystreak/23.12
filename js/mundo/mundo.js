// Mundo: o renderer, a cena, a câmera, o laço e a caminhada (contrato 4.3).
//
// Unidades em metros. A câmera fica a 1,5 m do chão olhando para −Z, dentro de
// um `rig` que anda pelo mundo. Névoa branca: as coisas nascem do branco.
//
//   mundo.ok                       false → modo leve (js/mundo/leve.js), mesma API
//   mundo.THREE, .renderer, .cena, .camera, .rig, .canvas
//   mundo.aoQuadro(fn(dt, t))      → função que cancela
//   mundo.ligar() / mundo.desligar()
//   mundo.caminhar({ distancia, duracao, curva? }) → Promise
//   mundo.ponteiro                 { x, y } em −1..1, suavizado
//   mundo.telaParaMundo(xNdc, yNdc, distancia) → Vector3
//   mundo.mundoParaTela(v3)        → { x, y, visivel } em px de tela
//   mundo.retanguloParaPose(rect, obj, { distancia }?) → { pai, posicao, quaternion, escala }
//   mundo.petalas.rajada(posMundo, n) / .definirDensidade(k)
//   mundo.aoMudarNivel(fn(nivel))  → função que cancela
//
// Além do contrato: mundo.amb, mundo.aoRedimensionar(fn), mundo.tamanho { largura, altura, dpr },
// mundo.gpu (texto do renderer WebGL), mundo.ligado, mundo.recipienteLeve.

import { clamp, lerp, amortecer, debounce } from '../nucleo/util.js';
import { baixarNivel } from '../nucleo/ambiente.js';
import { curvas } from '../nucleo/movimento.js';
import { criarPetalas } from './petalas.js';

export const ALTURA_OLHOS = 1.5;
const FOV_EM_PE = 58;
const FOV_DEITADO = 42;
const COMPRIMENTO_PASSO = 0.74;      // metros por passo
const QUADRO_LENTO_MS = 22;          // acima disto por 2 s, a qualidade desce
const JANELA_MS = 2000;
const CARENCIA_MS = 1500;            // depois de (re)ligar, não mede (compilação de shaders etc.)
const AMOSTRAS_RITMO = 36;           // quadros iniciais usados para descobrir o ritmo natural do aparelho

/** FOV vertical conforme a proporção da tela: ~58° em pé, ~42° deitado. */
function fovPara(aspecto) {
  return lerp(FOV_EM_PE, FOV_DEITADO, clamp((aspecto - 0.8) / (1.35 - 0.8)));
}

/**
 * Ponteiro suavizado em −1..1.
 * Computador: posição do mouse. Toque: arrasto (volta ao centro ao soltar).
 * Android: também a inclinação do aparelho. iOS: nunca pede permissão de movimento.
 */
export function criarPonteiro(amb) {
  const ponteiro = { x: 0, y: 0, ativo: false };
  const alvo = { x: 0, y: 0 };
  const inclinacao = { x: 0, y: 0, base: null };
  let arrasto = null;

  const aoMover = (e) => {
    if (e.pointerType === 'mouse') {
      alvo.x = clamp((e.clientX / innerWidth) * 2 - 1, -1, 1);
      alvo.y = clamp(-((e.clientY / innerHeight) * 2 - 1), -1, 1);
      ponteiro.ativo = true;
    } else if (arrasto && e.pointerId === arrasto.id) {
      // No toque o arrasto vale mais (1,6×): o dedo anda pouco.
      alvo.x = clamp(((e.clientX - arrasto.x) / innerWidth) * 3.2, -1, 1);
      alvo.y = clamp((-(e.clientY - arrasto.y) / innerHeight) * 3.2, -1, 1);
    }
  };
  const aoApertar = (e) => {
    if (e.pointerType === 'mouse') return;
    arrasto = { id: e.pointerId, x: e.clientX, y: e.clientY };
    ponteiro.ativo = true;
  };
  const aoSoltar = (e) => {
    if (!arrasto || e.pointerId !== arrasto.id) return;
    arrasto = null;
    alvo.x = 0;
    alvo.y = 0;
    ponteiro.ativo = false;
  };
  const aoSair = () => { if (!arrasto) { alvo.x = 0; alvo.y = 0; ponteiro.ativo = false; } };
  const aoInclinar = (e) => {
    if (e.gamma === null || e.beta === null) return;
    if (!inclinacao.base) inclinacao.base = { gamma: e.gamma, beta: e.beta };
    // A base acompanha devagar, para a pose natural da mão virar o "zero".
    inclinacao.base.gamma = lerp(inclinacao.base.gamma, e.gamma, 0.01);
    inclinacao.base.beta = lerp(inclinacao.base.beta, e.beta, 0.01);
    inclinacao.x = clamp((e.gamma - inclinacao.base.gamma) / 22, -1, 1);
    inclinacao.y = clamp(-(e.beta - inclinacao.base.beta) / 22, -1, 1);
  };

  const passivo = { passive: true };
  window.addEventListener('pointermove', aoMover, passivo);
  window.addEventListener('pointerdown', aoApertar, passivo);
  window.addEventListener('pointerup', aoSoltar, passivo);
  window.addEventListener('pointercancel', aoSoltar, passivo);
  document.documentElement.addEventListener('pointerleave', aoSair, passivo);
  if (amb.android && !amb.reduzido && 'DeviceOrientationEvent' in window) {
    window.addEventListener('deviceorientation', aoInclinar, passivo);
  }

  ponteiro.atualizar = (dt) => {
    const ax = clamp(alvo.x + inclinacao.x * 0.6, -1, 1);
    const ay = clamp(alvo.y + inclinacao.y * 0.6, -1, 1);
    ponteiro.x = amortecer(ponteiro.x, ax, 4.5, dt);
    ponteiro.y = amortecer(ponteiro.y, ay, 4.5, dt);
  };
  return ponteiro;
}

async function cairParaLeve(opcoes) {
  opcoes.amb.webgl = false;
  document.documentElement.classList.add('sem-webgl');
  const { criarMundoLeve } = await import('./leve.js');
  return criarMundoLeve(opcoes);
}

/**
 * Cria o mundo. Se o WebGL faltar (ou ?webgl=0), devolve o mundo leve com a mesma API.
 * opcoes: { amb, canvas, recipienteLeve }
 */
export async function criarMundo(opcoes) {
  const { amb, canvas } = opcoes;
  if (!amb.webgl) return cairParaLeve(opcoes);

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
  } catch {
    return cairParaLeve(opcoes);
  }

  const gsap = window.gsap;
  renderer.setClearColor(0xffffff, 1);

  const cena = new THREE.Scene();
  cena.background = new THREE.Color(0xffffff);
  cena.fog = new THREE.Fog(0xffffff, 2.5, 9.5);

  const rig = new THREE.Group();
  rig.name = 'rig';
  const camera = new THREE.PerspectiveCamera(FOV_EM_PE, 1, 0.05, 40);
  camera.position.set(0, ALTURA_OLHOS, 0);
  rig.add(camera);
  cena.add(rig);

  // Luz simples e barata (sem sombras): céu claro + um sol de frente, do alto.
  const luzCeu = new THREE.HemisphereLight(0xffffff, 0xf1e6ea, 2.6);
  const luzSol = new THREE.DirectionalLight(0xffffff, 1.1);
  luzSol.position.set(-1.2, 2.4, 2.2);
  cena.add(luzCeu, luzSol);

  // ---- tamanho ----------------------------------------------------------------

  const tamanho = { largura: 1, altura: 1, dpr: 1 };
  let dprAtual = Math.min(window.devicePixelRatio || 1, amb.dprMax);
  const ouvintesTamanho = new Set();

  function aplicarTamanho(forcar = false) {
    const largura = Math.max(1, canvas.clientWidth || innerWidth);
    const altura = Math.max(1, canvas.clientHeight || innerHeight);
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
    for (const fn of ouvintesTamanho) fn(tamanho);
    // Trocar o tamanho limpa o canvas: desenha já, para não piscar branco.
    if (rodando) renderer.render(cena, camera);
  }

  // Debounce: no iPhone a barra do Safari muda o 100dvh várias vezes por segundo.
  const pedirTamanho = debounce(() => aplicarTamanho(), 140);
  window.addEventListener('resize', pedirTamanho, { passive: true });
  window.addEventListener('orientationchange', pedirTamanho, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', pedirTamanho, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(pedirTamanho).observe(canvas);

  // ---- ponteiro, passo e câmera -------------------------------------------------

  const ponteiro = criarPonteiro(amb);
  const passo = { fase: 0, amplitude: 0, zAnterior: 0 };

  function atualizarCamera(dt) {
    ponteiro.atualizar(dt);

    // Balanço de passo: proporcional à velocidade real do rig.
    const velocidade = dt > 0 ? Math.abs(rig.position.z - passo.zAnterior) / dt : 0;
    passo.zAnterior = rig.position.z;
    const alvoAmp = amb.reduzido ? 0 : clamp(velocidade / 1.1);
    passo.amplitude = amortecer(passo.amplitude, alvoAmp, 5, dt);

    const a = passo.amplitude;
    const ciclo = passo.fase * Math.PI;                 // um ciclo lateral a cada dois passos
    const forca = amb.reduzido ? 0.35 : 1;              // paralaxe do ponteiro
    camera.position.set(
      Math.sin(ciclo) * 0.016 * a + ponteiro.x * 0.035 * forca,
      ALTURA_OLHOS + Math.sin(ciclo * 2) * 0.02 * a + ponteiro.y * 0.02 * forca,
      0,
    );
    camera.rotation.set(
      ponteiro.y * 0.018 * forca + Math.sin(ciclo * 2 + 0.6) * 0.0035 * a,
      -ponteiro.x * 0.03 * forca,
      Math.sin(ciclo) * 0.0045 * a,
    );
  }

  // ---- laço -------------------------------------------------------------------

  const ouvintes = new Set();
  const ouvintesNivel = new Set();
  let idQuadro = 0;
  let ultimo = 0;
  let tempo = 0;
  let ligado = true;
  let rodando = false;
  let contextoPerdido = false;

  // medidor de qualidade
  const medidor = { soma: 0, n: 0, desde: 0, carenciaAte: 0, parado: !!amb.forcado, limite: QUADRO_LENTO_MS, ritmo: [] };

  /**
   * Ritmo natural: iPhone em modo de pouca energia e telas de 30 Hz entregam um
   * quadro a cada ~33 ms mesmo sem peso nenhum. Isso não é lentidão, e baixar a
   * qualidade não mudaria nada. Os primeiros quadros (a abertura começa com o
   * mundo vazio) dizem qual é esse ritmo: usa-se o intervalo dos quadros mais
   * rápidos (percentil 20), porque um aparelho travado em 30 quadros nunca
   * entrega um quadro mais rápido que isso, e um aparelho só engasgado entrega.
   * O limite de "quadro lento" passa a ser relativo a esse ritmo.
   */
  function calibrar(brutoMs) {
    if (brutoMs > 0 && brutoMs < 250) medidor.ritmo.push(brutoMs);
    if (medidor.ritmo.length < AMOSTRAS_RITMO) return;
    const ordenado = medidor.ritmo.sort((a, b) => a - b);
    const ritmo = ordenado[Math.floor(ordenado.length * 0.2)];
    medidor.limite = Math.max(QUADRO_LENTO_MS, ritmo * 1.4);
    medidor.ritmo = null;
  }

  function medir(brutoMs, agora) {
    if (medidor.parado) return;
    if (medidor.ritmo) calibrar(brutoMs);
    if (agora < medidor.carenciaAte) return;
    medidor.soma += Math.min(brutoMs, 100);   // um engasgo isolado não derruba o nível
    medidor.n++;
    if (agora - medidor.desde < JANELA_MS) return;
    const media = medidor.soma / Math.max(1, medidor.n);
    medidor.soma = 0;
    medidor.n = 0;
    medidor.desde = agora;
    if (media > medidor.limite) baixarQualidade(agora);
  }

  function baixarQualidade(agora) {
    // Primeiro o DPR, depois o nível. Nunca sobe de volta.
    if (dprAtual > 1) {
      dprAtual = Math.max(1, dprAtual - 0.5);
      aplicarTamanho(true);
    } else {
      const novo = baixarNivel(amb);
      if (novo) {
        dprAtual = Math.min(dprAtual, amb.dprMax);
        aplicarTamanho(true);
        for (const fn of ouvintesNivel) {
          try { fn(novo); } catch (erro) { console.error(erro); }
        }
      } else if (dprAtual > 0.75) {
        dprAtual = 0.75;                      // último recurso
        aplicarTamanho(true);
      } else {
        medidor.parado = true;
      }
    }
    medidor.carenciaAte = agora + 600;
    medidor.desde = agora + 600;
  }

  function laco(agora) {
    idQuadro = requestAnimationFrame(laco);
    const brutoMs = agora - ultimo;
    ultimo = agora;
    const dt = Math.min(Math.max(brutoMs, 0) / 1000, 0.05);   // dt limitado: aba que volta não dá salto
    tempo += dt;

    atualizarCamera(dt);
    for (const fn of ouvintes) {
      // Um ouvinte que quebra não pode parar o mundo: sai da lista e o quadro segue.
      try { fn(dt, tempo); } catch (erro) { ouvintes.delete(fn); console.error('[carta] aoQuadro falhou', erro); }
    }
    renderer.render(cena, camera);
    medir(brutoMs, agora);
  }

  function atualizarLaco() {
    const deve = ligado && !document.hidden && !contextoPerdido;
    if (deve === rodando) return;
    rodando = deve;
    cancelAnimationFrame(idQuadro);
    if (rodando) {
      ultimo = performance.now();
      passo.zAnterior = rig.position.z;
      medidor.soma = 0;
      medidor.n = 0;
      medidor.desde = ultimo + CARENCIA_MS;
      medidor.carenciaAte = ultimo + CARENCIA_MS;
      idQuadro = requestAnimationFrame(laco);
    }
  }

  document.addEventListener('visibilitychange', atualizarLaco);

  // ---- contexto WebGL perdido / devolvido ----------------------------------------

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();                       // sem isto o navegador não devolve o contexto
    contextoPerdido = true;
    atualizarLaco();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextoPerdido = false;
    aplicarTamanho(true);
    atualizarLaco();
  });

  // ---- caminhada ----------------------------------------------------------------

  let filaCaminhada = Promise.resolve();

  function caminhar({ distancia = 6, duracao = 5, curva } = {}) {
    const andar = () => new Promise((resolver) => {
      if (!(distancia > 0) || !gsap) { rig.position.z -= Math.max(0, distancia); resolver(); return; }

      if (amb.reduzido) {
        // Sem deslocamento de câmera: o mundo dissolve no branco e volta já no lugar.
        gsap.timeline({ onComplete: resolver })
          .to(canvas, { opacity: 0, duration: 0.7, ease: 'none' })
          .add(() => { rig.position.z -= distancia; passo.zAnterior = rig.position.z; })
          .to(canvas, { opacity: 1, duration: 0.9, ease: 'none' });
        return;
      }

      const z0 = rig.position.z;
      const estado = { p: 0 };
      let anterior = 0;
      gsap.to(estado, {
        p: 1,
        duration: duracao,
        ease: curva || curvas.branco.camera,
        onUpdate() {
          rig.position.z = z0 - distancia * estado.p;
          passo.fase += (distancia * (estado.p - anterior)) / COMPRIMENTO_PASSO;
          anterior = estado.p;
        },
        onComplete: resolver,
      });
    });
    filaCaminhada = filaCaminhada.then(andar, andar);
    return filaCaminhada;
  }

  // ---- conversões ---------------------------------------------------------------

  const vAux = new THREE.Vector3();

  function meiaAlturaEm(distancia) {
    return Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distancia;
  }

  /** Ponto do mundo que aparece em (xNdc, yNdc) a `distancia` metros de profundidade da câmera. */
  function telaParaMundo(xNdc, yNdc, distancia = 1) {
    camera.updateWorldMatrix(true, false);
    const meia = meiaAlturaEm(distancia);
    return new THREE.Vector3(xNdc * meia * camera.aspect, yNdc * meia, -distancia)
      .applyMatrix4(camera.matrixWorld);
  }

  /** Posição em px de tela de um ponto do mundo. `visivel` é false atrás da câmera ou fora do alcance. */
  function mundoParaTela(v3) {
    camera.updateWorldMatrix(true, false);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    vAux.copy(v3).project(camera);
    return {
      x: (vAux.x * 0.5 + 0.5) * tamanho.largura,
      y: (-vAux.y * 0.5 + 0.5) * tamanho.altura,
      visivel: vAux.z > -1 && vAux.z < 1,
    };
  }

  /**
   * Pose para um plano cobrir exatamente um DOMRect na tela.
   * A pose é dada NO ESPAÇO DA CÂMERA (por isso não treme com o balanço): faça
   * `pose.pai.attach(obj)` e leve position/quaternion/scale até os valores devolvidos.
   * O tamanho-base do plano é lido da geometria de `obj` (largura × altura locais).
   */
  function retanguloParaPose(rect, obj, { distancia = 0.6 } = {}) {
    const metroPorPx = (2 * meiaAlturaEm(distancia)) / tamanho.altura;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let baseL = 1;
    let baseA = 1;
    const geometria = obj && obj.geometry;
    if (geometria) {
      if (!geometria.boundingBox) geometria.computeBoundingBox();
      baseL = Math.max(1e-6, geometria.boundingBox.max.x - geometria.boundingBox.min.x);
      baseA = Math.max(1e-6, geometria.boundingBox.max.y - geometria.boundingBox.min.y);
    }

    return {
      pai: camera,
      distancia,
      posicao: new THREE.Vector3((cx - tamanho.largura / 2) * metroPorPx, -(cy - tamanho.altura / 2) * metroPorPx, -distancia),
      quaternion: new THREE.Quaternion(),
      escala: new THREE.Vector3((rect.width * metroPorPx) / baseL, (rect.height * metroPorPx) / baseA, 1),
    };
  }

  // ---- montagem do objeto público -------------------------------------------------

  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch { /* só informativo */ }

  const mundo = {
    ok: true,
    amb,
    recipienteLeve: opcoes.recipienteLeve || null,
    THREE,
    renderer,
    cena,
    camera,
    rig,
    canvas,
    gpu,
    tamanho,
    ponteiro,
    get ligado() { return ligado; },

    aoQuadro(fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },
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
      ouvintesNivel.add(fn);
      return () => ouvintesNivel.delete(fn);
    },
    aoRedimensionar(fn) {
      ouvintesTamanho.add(fn);
      return () => ouvintesTamanho.delete(fn);
    },
    petalas: null,
  };

  aplicarTamanho(true);

  mundo.petalas = criarPetalas(mundo, amb);
  mundo.aoQuadro(mundo.petalas.atualizar);

  atualizarLaco();
  return mundo;
}
