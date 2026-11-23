/* ============================================================================
   HORA: a noite que cai enquanto ela lê
   ============================================================================
   A hora é uma posição numa linha só, de 0 a 4. Os nomes internos são os da
   v1 (contrato), mas a luz é outra: manha = hora azul logo depois do pôr do
   sol, lanternas apagadas; dia = as primeiras lanternas; entardecer = todas
   acesas; crepusculo = noite; noite = noite estrelada com o cometa. Cada
   ponto de controle tem a sua paleta; entre dois vizinhos tudo é
   interpolado. Ir de uma hora a outra é andar pela linha (sine.inOut, sem
   quina no começo nem no fim), passando pelas horas do meio, nunca saltar.

   ligarHora liga o diretor ao mundo pelo ROTEIRO (cena:etapa → hora e
   segundos). html[data-hora] muda só quando a hora mais próxima muda, nunca a
   cada quadro. pintarCometa desenha o cometa uma vez: textura na alameda 3D e
   imagem sobre a foto no modo leve.
   ========================================================================== */

import { clamp, lerp } from '../nucleo/util.js';

const HORAS = ['manha', 'dia', 'entardecer', 'crepusculo', 'noite'];

// sRGB de 0 a 1. nevoa: o fundo do túnel; ceu: o alto; luz: a luz da hora
// (multiplica tudo; a das lanternas soma por cima); tarde: o escuro da figura
// dele; noite: o cometa e a noite da foto (0..1); dens: multiplica a névoa;
// petalas: a luz das pétalas da frente; lanternas: a fração acesa (a frente
// de luz anda de perto para longe); estrelas: quantas aparecem (as mais
// fortes primeiro); veu: o véu violeta no horizonte.
const PALETA = [
  { nevoa: [0.27, 0.25, 0.47], ceu: [0.075, 0.105, 0.27], luz: [0.5, 0.52, 0.78], tarde: 0.6, noite: 0, dens: 0.95, petalas: [0.7, 0.66, 0.88], lanternas: 0, estrelas: 0.3, veu: 1 },
  { nevoa: [0.22, 0.2, 0.4], ceu: [0.06, 0.085, 0.225], luz: [0.44, 0.45, 0.7], tarde: 0.72, noite: 0, dens: 1, petalas: [0.8, 0.68, 0.8], lanternas: 0.32, estrelas: 0.5, veu: 0.85 },
  { nevoa: [0.17, 0.155, 0.32], ceu: [0.045, 0.065, 0.18], luz: [0.37, 0.38, 0.62], tarde: 0.85, noite: 0, dens: 1.02, petalas: [0.92, 0.74, 0.76], lanternas: 1, estrelas: 0.7, veu: 0.7 },
  { nevoa: [0.13, 0.12, 0.26], ceu: [0.032, 0.046, 0.13], luz: [0.31, 0.32, 0.54], tarde: 0.95, noite: 0.12, dens: 1.04, petalas: [0.9, 0.72, 0.77], lanternas: 1, estrelas: 0.88, veu: 0.5 },
  { nevoa: [0.1, 0.1, 0.22], ceu: [0.022, 0.032, 0.1], luz: [0.27, 0.29, 0.5], tarde: 1, noite: 1, dens: 1.06, petalas: [0.86, 0.71, 0.8], lanternas: 1, estrelas: 1, veu: 0.38 },
];

// Enrolar e guardar o capítulo do filme dividem a mesma passagem: sendo o
// mesmo objeto, a segunda etapa não recomeça a curva no meio do caminho.
const ATE_A_TARDE = { hora: 1.5, s: 5 };

// Cena ou "cena:etapa" → hora (nome ou posição) e segundos. Uma etapa sem
// chave própria cai na chave da cena: etapa nova precisa ser conferida aqui.
const ROTEIRO = {
  senha: { hora: 'manha', s: 0 },
  musica: { hora: 'manha', s: 0 },
  inicio: { hora: 'manha', s: 4 },
  poppy: { hora: 'manha', s: 4 },
  'poppy:guardando': { hora: 0.5, s: 6 },
  carta2: { hora: 'dia', s: 9 },
  yourname: { hora: 'dia', s: 4 },
  'yourname:enrolando': ATE_A_TARDE,
  'yourname:guardando': ATE_A_TARDE,
  mao: { hora: 'entardecer', s: 3.4 },
  'mao:correndo': { hora: 'crepusculo', s: 'corrida' },
  cartas: { hora: 'crepusculo', s: 3 },
  encontro: { hora: 'crepusculo', s: 3 },
  // A noite chega atrás dos quadros do encontro.
  'encontro:planos': { hora: 'noite', s: 16 },
  'encontro:maos': { hora: 'noite', s: 6 },
  'encontro:carta': { hora: 'noite', s: 3 },
  final: { hora: 'noite', s: 3 },
  menu: { hora: 'noite', s: 3 },
};

// No movimento reduzido a passagem é só a troca de cor, e curta.
const PASSAGEM_CALMA = 2.4;

/** Número finito vira posição (0..4); nome vira índice; o resto, null. */
function posicaoDe(alvo) {
  if (typeof alvo === 'number') return Number.isFinite(alvo) ? clamp(alvo, 0, 4) : null;
  const i = HORAS.indexOf(alvo);
  return i >= 0 ? i : null;
}

function mix3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Tudo o que muda com a hora, na posição `p` (limitada a 0..4). */
export function estadoDaHora(p) {
  const q = clamp(Number(p) || 0, 0, 4);
  const i = Math.min(3, Math.floor(q));
  const t = q - i;
  const a = PALETA[i];
  const b = PALETA[i + 1];
  return {
    p: q,
    nevoa: mix3(a.nevoa, b.nevoa, t),
    ceu: mix3(a.ceu, b.ceu, t),
    luz: mix3(a.luz, b.luz, t),
    petalas: mix3(a.petalas, b.petalas, t),
    tarde: lerp(a.tarde, b.tarde, t),
    noite: lerp(a.noite, b.noite, t),
    dens: lerp(a.dens, b.dens, t),
    lanternas: lerp(a.lanternas, b.lanternas, t),
    estrelas: lerp(a.estrelas, b.estrelas, t),
    veu: lerp(a.veu, b.veu, t),
  };
}

/* ---- o cometa ---------------------------------------------------------------- */

const rgba = ([r, g, b], alfa) => `rgba(${r}, ${g}, ${b}, ${clamp(alfa).toFixed(4)})`;

/**
 * O cometa partido, em canvas de fundo transparente: cabeça em (0,8; 0,8) e
 * duas caudas (azul e rosa) com um miolo claro, abrindo para o alto à
 * esquerda. Tudo somado ('lighter'), como luz.
 */
export function pintarCometa(largura = 512, altura = 512) {
  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const g = tela.getContext('2d');
  if (!g) return tela;

  const L = largura;
  const cx = 0.8 * largura;
  const cy = 0.8 * altura;
  const base = -0.76 * Math.PI;
  // [cor, ângulo, comprimento, curvatura, largura, força]
  const azul = [[96, 170, 255], base - 0.035, 0.86 * L, -0.2, 0.05, 1];
  const rosa = [[255, 120, 190], base + 0.115, 0.7 * L, 0.16, 0.058, 1];
  const miolo = [[200, 225, 255], base + 0.03, 0.52 * L, 0, 0.016, 1.3];

  g.globalCompositeOperation = 'lighter';

  for (const [cor, angulo, comp, curva, larg, forca] of [azul, rosa, miolo]) {
    for (let i = 0; i < 90; i++) {
      const s = i / 89;
      const a = angulo + curva * s * s;
      const x = cx + Math.cos(a) * comp * s;
      const y = cy + Math.sin(a) * comp * s;
      const r = (0.012 + larg * s ** 0.8) * L;
      const alfa = forca * (1 - s) ** 1.5 * (0.16 + 0.3 * (1 - s));
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, rgba(cor, alfa));
      grad.addColorStop(0.5, rgba(cor, alfa * 0.36));
      grad.addColorStop(1, rgba(cor, 0));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Os fragmentos que se soltam ao longo das caudas (gerador de Park-Miller,
  // semente 7: o mesmo cometa em toda abertura).
  let semente = 7;
  const sorte = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {
    const naAzul = sorte() < 0.5;
    const [, angulo, comp, curva, larg] = naAzul ? azul : rosa;
    const s = 0.08 + 0.8 * sorte();
    const a = angulo + curva * s * s;
    const lado = (sorte() - 0.5) * 2 * larg * s ** 0.8 * L;
    const x = cx + Math.cos(a) * comp * s - Math.sin(a) * lado;
    const y = cy + Math.sin(a) * comp * s + Math.cos(a) * lado;
    const r = (0.4 + 0.9 * sorte()) * (L / 512) * (1.4 - s);
    g.fillStyle = rgba(naAzul ? [190, 220, 255] : [255, 200, 228], 0.3 + 0.55 * (1 - s));
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  const raio = 0.13 * L;
  const halo = g.createRadialGradient(cx, cy, 0, cx, cy, raio);
  halo.addColorStop(0, 'rgba(255, 255, 255, 1)');
  halo.addColorStop(0.1, 'rgba(225, 240, 255, 0.9)');
  halo.addColorStop(0.32, 'rgba(140, 190, 255, 0.3)');
  halo.addColorStop(1, 'rgba(120, 160, 255, 0)');
  g.fillStyle = halo;
  g.beginPath();
  g.arc(cx, cy, raio, 0, Math.PI * 2);
  g.fill();

  g.globalCompositeOperation = 'source-over';
  return tela;
}

/* ---- a hora do mundo ---------------------------------------------------------- */

/**
 * Cria `mundo.hora(alvo, { duracao = 4 })` → Promise, que leva a posição até
 * `alvo` (nome de HORAS ou número de 0 a 4). Sem argumento, devolve o nome da
 * hora atual. Pinta já a hora azul e chama `aplicar(estado)` a cada passo.
 */
export function criarHora(mundo, amb, aplicar) {
  const atual = { p: 0 };
  let tween = null;
  let fim = null;
  let nomeAtual = null;

  function pintar() {
    const e = estadoDaHora(atual.p);
    const nome = HORAS[Math.round(e.p)];
    if (nome !== nomeAtual) {
      nomeAtual = nome;
      document.documentElement.dataset.hora = nome;
    }
    try {
      aplicar?.(e);
    } catch (erro) {
      console.error('[carta] hora', erro);
    }
  }

  function hora(alvo, { duracao = 4 } = {}) {
    if (alvo === undefined) return nomeAtual;
    const p = posicaoDe(alvo);
    if (p === null) return Promise.resolve();

    // A passagem anterior é interrompida; quem esperava por ela não fica preso.
    const anterior = fim;
    fim = null;
    tween?.kill();
    tween = null;
    anterior?.();

    let s = Math.max(0, Number(duracao) || 0);
    if (amb?.reduzido) s = Math.min(s, PASSAGEM_CALMA);
    const gsap = window.gsap;
    if (!s || !gsap || Math.abs(p - atual.p) < 1e-4) {
      atual.p = p;
      pintar();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      fim = resolve;
      tween = gsap.to(atual, {
        p,
        duration: s,
        ease: 'sine.inOut',
        onUpdate: pintar,
        onComplete: resolve,
        onInterrupt: resolve,
      });
    });
  }

  mundo.hora = hora;
  pintar();
  return hora;
}

/** A corrida da mão leva ao crepúsculo em 92% do tempo dela (5 a 10 s; 7 por padrão). */
function corrida() {
  return clamp(Number(window.CONTEUDO?.corrida?.segundos) || 7, 5, 10) * 0.92;
}

/** Liga as etapas do diretor às passagens de hora do mundo. */
export function ligarHora({ mundo, diretor }) {
  if (typeof mundo?.hora !== 'function' || !diretor) return;
  const para = (cena, etapa) => ROTEIRO[`${cena}:${etapa}`] || ROTEIRO[cena];

  // Entrando por ?cena=, a hora nasce já na hora daquela cena, sem passagem.
  const entrada = ROTEIRO[diretor.cenaInicial?.()];
  if (entrada) mundo.hora(entrada.hora, { duracao: 0 });

  let ultimo = null;
  diretor.aoMudar((cena, etapa) => {
    const r = para(cena, etapa);
    if (!r || r === ultimo) return;
    ultimo = r;
    mundo.hora(r.hora, { duracao: r.s === 'corrida' ? corrida() : r.s });
  });
}
