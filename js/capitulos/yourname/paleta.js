// As horas do céu do capítulo 2.
//
// `hora` vai de 0 (dia claro) a 1 (noite fechada) e é guiada pela rolagem. Aqui
// ficam as cores de cada hora e a geometria do cometa, para que o céu em WebGL
// (ceu.js) e o céu sem WebGL (ceu-leve.js) mostrem exatamente a mesma coisa.
//
// O cometa tem o seu próprio relógio, `k`: 0 ainda não veio, 0→1 cruza o céu,
// 1 é o instante em que se divide, 1→2 os dois pedaços se afastam. Quem decide
// `k` é o capítulo (yourname.js), a partir do trecho de céu livre da página.

import { clamp, lerp, suave } from '../../nucleo/util.js';

const cor = (hex) => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

// Cada quadro: c0 horizonte → c3 zênite; luz/sombra/borda das nuvens; cobertura
// (quanto maior, menos nuvem); estica (nuvens viram faixas); serras; força do sol;
// estrelas; véu (opacidade do véu índigo atrás dos textos).
const QUADROS = [
  {
    t: 0.05,
    // O dia nasce da paleta da carta: papel morno no horizonte, um azul-lilás
    // no alto que já aponta para o #4a398c do crepúsculo.
    c0: cor('#fbf1e6'), c1: cor('#d9dff0'), c2: cor('#9fb0dc'), c3: cor('#5a5aa8'),
    luz: cor('#ffffff'), sombra: cor('#aeb1d8'), borda: cor('#ffffff'),
    sol: cor('#fff6dc'), solForca: 0.85,
    longe: cor('#aab2da'), perto: cor('#7274b0'),
    cobertura: 0.47, estica: 0, estrelas: 0, veu: 0.68,
  },
  {
    t: 0.27,
    c0: cor('#ffe1aa'), c1: cor('#f5a88c'), c2: cor('#7c84cd'), c3: cor('#2f3790'),
    luz: cor('#ffe9c8'), sombra: cor('#8468ac'), borda: cor('#fff3cf'),
    sol: cor('#ffd08c'), solForca: 1,
    longe: cor('#9079b2'), perto: cor('#4a396e'),
    cobertura: 0.5, estica: 0.45, estrelas: 0, veu: 0.66,
  },
  {
    t: 0.44,
    c0: cor('#ffd1a1'), c1: cor('#b25d9b'), c2: cor('#4a398c'), c3: cor('#171a56'),
    luz: cor('#ffa3aa'), sombra: cor('#3a2b72'), borda: cor('#ffcb9c'),
    sol: cor('#ff9a6a'), solForca: 0.6,
    longe: cor('#3a2a66'), perto: cor('#191340'),
    cobertura: 0.56, estica: 0.85, estrelas: 0.12, veu: 0.58,
  },
  {
    t: 0.64,
    c0: cor('#27407f'), c1: cor('#131c56'), c2: cor('#090e33'), c3: cor('#04061c'),
    luz: cor('#2c3d80'), sombra: cor('#0a0f33'), borda: cor('#4257a6'),
    sol: cor('#6f6fd0'), solForca: 0,
    longe: cor('#0c1238'), perto: cor('#05071c'),
    cobertura: 0.66, estica: 1, estrelas: 1, veu: 0.66,
  },
  {
    t: 1,
    c0: cor('#1f3672'), c1: cor('#101850'), c2: cor('#080c2e'), c3: cor('#030416'),
    luz: cor('#26357a'), sombra: cor('#080c2e'), borda: cor('#3b4f9c'),
    sol: cor('#6f6fd0'), solForca: 0,
    longe: cor('#0a1033'), perto: cor('#04061a'),
    cobertura: 0.7, estica: 1, estrelas: 1, veu: 0.66,
  },
];

const CAMPOS_COR = ['c0', 'c1', 'c2', 'c3', 'luz', 'sombra', 'borda', 'sol', 'longe', 'perto'];
const CAMPOS_NUM = ['solForca', 'cobertura', 'estica', 'estrelas', 'veu'];

/** Um estado vazio do céu, para ser preenchido por `misturar`. */
export function novoEstado() {
  const e = { hora: 0, tempo: 0, rol: 0, clarao: 0, fim: 0 };
  for (const campo of CAMPOS_COR) e[campo] = [0, 0, 0];
  for (const campo of CAMPOS_NUM) e[campo] = 0;
  e.solX = 0.72;
  e.solY = 1.2;
  e.terra = -0.125;
  e.cometa = { forca: 0, sep: 0, tronco: [0, 0], a: [0, 0], b: [0, 0], origem: [0, 0], divisao: [0, 0] };
  return e;
}

/** Preenche `e` com as cores e medidas da hora (sem criar objetos novos). */
export function misturar(hora, e) {
  const h = clamp(hora);
  let i = 0;
  while (i < QUADROS.length - 2 && h > QUADROS[i + 1].t) i++;
  const a = QUADROS[i];
  const b = QUADROS[i + 1];
  const u = suave((h - a.t) / (b.t - a.t));

  for (const campo of CAMPOS_COR) {
    const ca = a[campo];
    const cb = b[campo];
    const alvo = e[campo];
    alvo[0] = lerp(ca[0], cb[0], u);
    alvo[1] = lerp(ca[1], cb[1], u);
    alvo[2] = lerp(ca[2], cb[2], u);
  }
  for (const campo of CAMPOS_NUM) e[campo] = lerp(a[campo], b[campo], u);

  e.hora = h;
  // O sol desce de fora do quadro (em cima) até atrás das serras.
  e.solY = lerp(1.16, 0.1, clamp(h / 0.47));
  e.solX = lerp(0.74, 0.6, clamp(h / 0.47));
  // A paisagem sobe devagar: de dia só as serras ao longe; à noite, o lago inteiro.
  e.terra = lerp(-0.125, 0, suave((h - 0.14) / 0.46));

  return e;
}

// ---------------------------------------------------------------------------
// O cometa. Coordenadas "p": x em alturas de tela a partir do centro, y de 0
// (base) a 1 (topo). Entra pelo canto de cima à direita e, em k = 1, se divide
// em dois pedaços que seguem lado a lado.
// ---------------------------------------------------------------------------

const girar = (v, graus) => {
  const r = (graus * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
};

/** Preenche `c` (estado.cometa) para o instante `k` (0..2). */
export function cometa(k, aspecto, c) {
  const meia = aspecto / 2;
  const ox = 1.16 * meia;
  const oy = 1.13;
  const dx = 0.24 * meia;
  const dy = 0.735;
  c.origem[0] = ox; c.origem[1] = oy;
  c.divisao[0] = dx; c.divisao[1] = dy;

  if (!(k > 0)) {
    c.forca = 0; c.sep = 0;
    c.tronco[0] = ox; c.tronco[1] = oy;
    c.a[0] = ox; c.a[1] = oy; c.b[0] = ox; c.b[1] = oy;
    return;
  }

  const antes = clamp(k);
  const anda0 = Math.pow(antes, 0.86);
  c.forca = clamp(antes * 4);
  c.tronco[0] = lerp(ox, dx, anda0);
  c.tronco[1] = lerp(oy, dy, anda0);

  const depois = clamp(k - 1);
  c.sep = depois;
  if (depois <= 0) {
    c.a[0] = c.tronco[0]; c.a[1] = c.tronco[1];
    c.b[0] = c.tronco[0]; c.b[1] = c.tronco[1];
    return;
  }
  // Depois da divisão: rápido no começo, depois devagar (os dois ficam no céu até o fim).
  const anda = 1 - Math.pow(1 - depois, 1.7);
  let nx = dx - ox;
  let ny = dy - oy;
  const n = Math.hypot(nx, ny) || 1;
  nx /= n; ny /= n;
  const da = girar([nx, ny], 8);
  const db = girar([nx, ny], -21);
  c.a[0] = dx + da[0] * 0.2 * anda;
  c.a[1] = dy + da[1] * 0.2 * anda;
  c.b[0] = dx + db[0] * 0.25 * anda;
  c.b[1] = dy + db[1] * 0.25 * anda;
}

/** Cor [r,g,b] 0..1 → 'rgb(r, g, b)'. */
export function css(c, alfa) {
  const r = Math.round(clamp(c[0]) * 255);
  const g = Math.round(clamp(c[1]) * 255);
  const b = Math.round(clamp(c[2]) * 255);
  return alfa === undefined ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

export { QUADROS };
