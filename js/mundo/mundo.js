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
//   mundo.petalas.rajada(posMundo, n) / .definirDensidade(k) / .definirFoco(metros)
//   mundo.aoMudarNivel(fn(nivel))  → função que cancela
//   mundo.deriva                   metros que o chão já andou por baixo dela (passo de base)
//   mundo.hora(alvo, { duracao })  a hora do dia: 'manha'|'dia'|'entardecer'|'crepusculo'|'noite' (js/mundo/hora.js)
//
// O PASSO DE BASE. Ela está sempre andando: a alameda desliza por baixo do mundo
// o tempo todo (mundo.deriva cresce a cada quadro). O `rig`, a câmera e tudo o
// que as cenas põem no mundo (cartas, fio, folha) vivem num referencial que anda
// junto com ela; por isso o que está "parado" continua na frente dela sem que
// nenhuma cena precise compensar. Quem desliza é só o lugar: a alameda
// (js/mundo/alameda.js recebe a deriva) e as pétalas, que passam por ela.
// mundo.caminhar() acelera por cima disso: o rig avança no referencial, e
// enquanto ele anda mais depressa que o passo de base a deriva quase para
// (velocidade total = √(base² + caminhada²)): o chão fica preso ao fio que ela
// segue, e a volta ao passo de base não tem solavanco.
//
// Além do contrato: mundo.amb, mundo.aoRedimensionar(fn), mundo.tamanho { largura, altura, dpr },
// mundo.gpu (texto do renderer WebGL), mundo.ligado, mundo.recipienteLeve.

import { clamp, lerp, amortecer, debounce } from '../nucleo/util.js';
import { baixarNivel } from '../nucleo/ambiente.js';
import { curvas } from '../nucleo/movimento.js';
import { criarPetalas } from './petalas.js';
import { criarFundo, criarVeus } from './fundo.js';
import { criarAlameda } from './alameda.js';
import { criarHora } from './hora.js';

export const ALTURA_OLHOS = 1.5;
const FOV_EM_PE = 58;
const FOV_DEITADO = 42;
const CADENCIA_LENTA = 1.15;         // passos por segundo no passo de base (passeio)
const CADENCIA_RAPIDA = 1.9;         // ... e no meio da caminhada
const BALANCO_VERTICAL = 0.0125;     // ±1,25 cm: 2,5 cm de vale a pico
const BALANCO_LATERAL = 0.007;       // ±0,7 cm
const BALANCO_ROLAGEM = 0.0027;      // ±0,15°: 0,3° de um lado ao outro
const VELOCIDADE_CALMA = 0.28;       // m/s: o avanço contínuo no movimento reduzido
// O passo de base: ela está sempre andando. A alameda nunca para de vir ao
// encontro dela, em todas as cenas; as caminhadas (mundo.caminhar) são
// acelerações sobre este passo. Sereno: um passeio, não uma esteira.
const PASSO_BASE = 0.42;             // m/s
const PASSO_BASE_CALMO = 0.09;       // m/s no movimento reduzido (e sem balanço)
const QUADRO_LENTO_MS = 22;         // acima disto por 2 s, a qualidade desce
const JANELA_MS = 2000;
const CARENCIA_MS = 1500;            // depois de (re)ligar, não mede (compilação de shaders etc.)
const AMOSTRAS_RITMO = 36;           // quadros iniciais usados para descobrir o ritmo natural do aparelho

/**
 * Curva padrão da caminhada: sai devagar (o corpo tem inércia), anda em passo
 * quase constante e chega deslizando até parar. O pico de velocidade fica em
 * ~1,5× a média; uma curva em S comum passaria de 2× e a caminhada viraria corrida.
 */
export const curvaDaCaminhada = (() => {
  const N = 96;
  const ENTRADA = 0.26;              // fração do tempo para ganhar o passo
  const CHEGADA = 0.42;              // ... e para perdê-lo
  const s = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };
  const tabela = new Float32Array(N + 1);
  let soma = 0;
  for (let i = 1; i <= N; i++) {
    const t = (i - 0.5) / N;
    soma += s(t / ENTRADA) * s((1 - t) / CHEGADA);
    tabela[i] = soma;
  }
  for (let i = 1; i <= N; i++) tabela[i] /= soma;
  return (p) => {
    const x = clamp(p) * N;
    const i = Math.min(N - 1, Math.floor(x));
    return lerp(tabela[i], tabela[i + 1], x - i);
  };
})();

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

async function cairParaLeve(opcoes, fundo) {
  opcoes.amb.webgl = false;
  document.documentElement.classList.add('sem-webgl');
  const { criarMundoLeve } = await import('./leve.js');
  return criarMundoLeve({ ...opcoes, fundo });
}

/**
 * Cria o mundo. Se o WebGL faltar (ou ?webgl=0), devolve o mundo leve com a mesma API.
 * opcoes: { amb, canvas, recipienteLeve }
 */
export async function criarMundo(opcoes) {
  const { amb, canvas } = opcoes;
  // pagina.fundo (content.js): com WebGL, a alameda em 3D (js/mundo/alameda.js);
  // sem WebGL, a imagem dela, renderizada, atrás do mundo leve (js/mundo/fundo.js).
  const comAlameda = !!String(window.CONTEUDO?.pagina?.fundo || '').trim();
  const fundoLeve = () => criarFundo({ amb, antesDe: canvas || opcoes.recipienteLeve });
  if (!amb.webgl) return cairParaLeve(opcoes, fundoLeve());

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
    return cairParaLeve(opcoes, fundoLeve());
  }

  const gsap = window.gsap;
  renderer.setClearColor(0xffffff, 1);

  const cena = new THREE.Scene();
  cena.background = comAlameda ? null : new THREE.Color(0xffffff);
  cena.fog = new THREE.Fog(0xffffff, 2.5, 9.5);
  // Os véus claros atrás do texto (o mesmo desenho do modo leve), por cima do canvas.
  const fundo = comAlameda ? criarVeus({ depoisDe: canvas }) : criarVeus({ depoisDe: null });

  let alameda = null;
  const rig = new THREE.Group();
  rig.name = 'rig';
  const camera = new THREE.PerspectiveCamera(FOV_EM_PE, 1, 0.05, comAlameda ? 60 : 40);
  camera.position.set(0, ALTURA_OLHOS, 0);
  rig.add(camera);
  cena.add(rig);
  // Sem luzes na cena: todo material é ShaderMaterial (a luz vem da hora) ou
  // MeshBasicMaterial. Um material iluminado embutido (Lambert, Standard) sairia preto.

  // ---- tamanho ----------------------------------------------------------------

  const tamanho = { largura: 1, altura: 1, dpr: 1 };
  let dprAtual = Math.min(window.devicePixelRatio || 1, amb.dprMax);
  let dprAntesNitidez = null;             // ver nitidezMaxima()
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
  let deriva = 0;                         // metros de chão que já passaram por baixo dela
  const passoBase = amb.reduzido ? PASSO_BASE_CALMO : PASSO_BASE;

  function atualizarCamera(dt) {
    ponteiro.atualizar(dt);

    // Balanço de passo. A amplitude segue a velocidade real do rig (entra e sai
    // com suavidade); a cadência quase não muda: quem anda mais depressa alonga
    // o passo, não a frequência (~1,8 passo por segundo).
    // (um salto do rig, como uma cena que recomeça, não é andar: limitado a 4 m/s)
    const caminhada = dt > 0 ? Math.min(4, Math.abs(rig.position.z - passo.zAnterior) / dt) : 0;
    passo.zAnterior = rig.position.z;
    // O passo de base: o chão anda sempre. Enquanto uma caminhada corre mais
    // depressa que ele, quase todo o avanço é dela (soma em quadratura, sem quina).
    const base = Math.hypot(passoBase, caminhada) - caminhada;
    deriva += base * dt;
    const velocidade = caminhada + base;
    const alvoAmp = amb.reduzido ? 0 : clamp(velocidade / 0.9);
    passo.amplitude = amortecer(passo.amplitude, alvoAmp, alvoAmp > passo.amplitude ? 3.4 : 2.2, dt);
    const a = passo.amplitude;
    passo.fase += dt * lerp(CADENCIA_LENTA, CADENCIA_RAPIDA, clamp(velocidade / 1.8)) * clamp(a * 4);

    // Um ciclo vertical por passo (o corpo desce quando o pé toca o chão e sobe
    // no meio do apoio); lateral e rolagem a cada dois passos (o peso troca de perna).
    const ciclo = passo.fase * Math.PI * 2;
    const vertical = (Math.cos(ciclo) + 0.18 * Math.cos(ciclo * 2 + 0.7)) * BALANCO_VERTICAL * a;
    const lateral = Math.sin(ciclo * 0.5) * BALANCO_LATERAL * a;
    const rolagem = Math.sin(ciclo * 0.5 + 0.4) * BALANCO_ROLAGEM * a;
    const arfar = Math.sin(ciclo + 1.2) * 0.0016 * a;

    const forca = amb.reduzido ? 0.35 : 1;              // paralaxe do ponteiro
    camera.position.set(
      lateral + ponteiro.x * 0.035 * forca,
      ALTURA_OLHOS + vertical + ponteiro.y * 0.02 * forca,
      0,
    );
    camera.rotation.set(
      ponteiro.y * 0.018 * forca + arfar,
      -ponteiro.x * 0.03 * forca,
      rolagem,
    );
  }

  // ---- laço -------------------------------------------------------------------

  const ouvintes = new Set();
  const ouvintesNivel = new Set();
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

  // O laço é um ouvinte do ticker do GSAP (um rAF só por quadro): roda sempre
  // depois dos tweens, então o que o GSAP mexe no 3D sai no mesmo quadro. O tempo
  // é o performance.now(), em ms reais (sem o lagSmoothing do GSAP).
  function laco() {
    const agora = performance.now();
    const brutoMs = agora - ultimo;
    ultimo = agora;
    const dt = Math.min(Math.max(brutoMs, 0) / 1000, 0.05);   // dt limitado: aba que volta não dá salto
    tempo += dt;

    atualizarCamera(dt);
    for (const fn of ouvintes) {
      // Um ouvinte que quebra não pode parar o mundo: sai da lista e o quadro segue.
      try { fn(dt, tempo); } catch (erro) { ouvintes.delete(fn); console.error('[carta] aoQuadro falhou', erro); }
    }
    if (alameda) alameda.atualizar(dt, tempo, deriva);
    renderer.render(cena, camera);
    medir(brutoMs, agora);
  }

  function atualizarLaco() {
    const deve = ligado && !document.hidden && !contextoPerdido;
    if (deve === rodando) return;
    rodando = deve;
    if (!rodando) { gsap.ticker.remove(laco); return; }
    ultimo = performance.now();
    passo.zAnterior = rig.position.z;
    medidor.soma = 0;
    medidor.n = 0;
    medidor.desde = ultimo + CARENCIA_MS;
    medidor.carenciaAte = ultimo + CARENCIA_MS;
    gsap.ticker.add(laco);
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

      const z0 = rig.position.z;
      const estado = { p: 0 };

      if (amb.reduzido) {
        // Movimento reduzido: um avanço lento e contínuo, sem balanço. O grosso
        // da distância não é percorrido à vista: some dentro de uma dissolvência
        // no branco, no meio do caminho, e o mundo volta já mais adiante.
        const lento = Math.min(distancia, VELOCIDADE_CALMA * duracao);
        const salto = distancia - lento;
        let saltado = 0;
        const tl = gsap.timeline({ onComplete: resolver });
        tl.to(estado, {
          p: 1,
          duration: duracao,
          ease: curvas.branco.deriva,
          onUpdate() {
            rig.position.z = z0 - lento * estado.p - saltado;
            passo.zAnterior = rig.position.z;
          },
        }, 0);
        if (salto > 0.01) {
          const some = Math.min(0.7, duracao * 0.2);
          const meio = Math.max(some, duracao * 0.36);
          tl.to(canvas, { opacity: 0, duration: some, ease: 'none' }, meio - some)
            .add(() => { saltado = salto; }, meio)
            .to(canvas, { opacity: 1, duration: Math.min(1, duracao * 0.3), ease: 'none' }, meio + 0.04);
        }
        return;
      }

      gsap.to(estado, {
        p: 1,
        duration: duracao,
        ease: curva || curvaDaCaminhada,
        onUpdate() { rig.position.z = z0 - distancia * estado.p; },
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
    get deriva() { return deriva; },

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
    /**
     * A frase final é texto desenhado no WebGL: quando a cena para em 'fim' (só a
     * folha e as pétalas), paga-se a resolução cheia da tela (até 3x), mesmo que o
     * DPR tenha caído antes, na caminhada. O medidor continua valendo: se o
     * aparelho não aguentar, ele desce de novo meio ponto por vez.
     */
    nitidezMaxima(ligar = true) {
      if (ligar) {
        if (dprAntesNitidez === null) dprAntesNitidez = dprAtual;
        dprAtual = Math.min(window.devicePixelRatio || 1, 3);
      } else if (dprAntesNitidez !== null) {
        dprAtual = Math.min(dprAtual, dprAntesNitidez);
        dprAntesNitidez = null;
      }
      const agora = performance.now();
      medidor.soma = 0;
      medidor.n = 0;
      medidor.carenciaAte = agora + CARENCIA_MS;
      medidor.desde = agora + CARENCIA_MS;
      aplicarTamanho(true);
    },
    petalas: null,
    fundo,
    alameda: null,
  };

  aplicarTamanho(true);

  mundo.petalas = criarPetalas(mundo, amb);
  mundo.aoQuadro(mundo.petalas.atualizar);
  // Os três programas das pétalas compilam em paralelo (sem travar o primeiro
  // quadro, que antes esperava ~40 ms por programa). Até lá elas não são
  // desenhadas, mas nesse instante a abertura está com densidade zero: nada muda
  // na tela. A guarda de 1,5 s devolve as pétalas mesmo se a promessa não vier.
  if (typeof renderer.compileAsync === 'function') {
    const pet = mundo.petalas.objeto;
    pet.visible = false;
    const mostrar = () => { pet.visible = true; };
    try {
      Promise.race([renderer.compileAsync(pet, camera, cena), new Promise((ok) => setTimeout(ok, 1500))])
        .then(mostrar, mostrar);
    } catch { mostrar(); }
  }

  // A alameda: gerada agora, compilada em paralelo e mostrada só quando pronta,
  // nascendo do branco (até lá o mundo é o branco de sempre).
  if (comAlameda) {
    // Uma folga antes de gerá-la: a montagem do mundo vira duas tarefas em vez de uma
    // só (uns 0,1 + 0,2 s em CPU lenta), e o navegador pinta um quadro no meio.
    await new Promise((ok) => setTimeout(ok, 0));
    // ?cena=menu (Voltar ao menu, recarregar no menu) e ?volta=1 (o portão de uma parte, logo
    // depois de o menu dissolver na noite): em vez de nascer do branco (um clarão no meio do
    // escuro), o canvas inteiro dissolve sobre a página escura (html.entra-noite, no index.html).
    const daNoite = document.documentElement.classList.contains('entra-noite');
    if (daNoite) canvas.style.opacity = '0';
    try {
      alameda = criarAlameda(mundo);
      mundo.alameda = alameda;
      mundo.aoMudarNivel((nivel) => alameda.nivel(nivel));
      alameda.pronta.then(() => {
        alameda.surgir(daNoite ? 0 : amb.params?.has?.('cena') ? 0.6 : 1.8);
        if (daNoite) {
          if (gsap) gsap.to(canvas, { opacity: 1, duration: 0.6, ease: 'none', clearProps: 'opacity' });
          else canvas.style.opacity = '';
        }
        fundo.ligar();
      });
    } catch (erro) {
      console.error('[carta] alameda', erro);
      alameda = null;
      cena.background = new THREE.Color(0xffffff);
      canvas.style.opacity = '';
    }
  }

  // A hora do dia (js/mundo/hora.js): um ponto de controle só. A alameda recebe
  // a luz, a névoa, o céu e o cometa; as pétalas da frente, a luz.
  criarHora(mundo, amb, (e) => {
    if (alameda) alameda.aplicarHora(e);
    mundo.petalas.luzDaHora?.(e.petalas);
  });

  atualizarLaco();
  return mundo;
}
