/* ============================================================================
   PALETA: as cores de cada hora do céu e a geometria do cometa
   ============================================================================
   Uma fonte só para os dois pintores: o céu em WebGL (ceu.js) e o céu sem
   WebGL (ceu-leve.js) leem daqui e mostram a mesma hora. `hora` vai de 0 (dia
   claro) a 1 (noite funda); entre dois quadros-chave tudo é interpolado com
   suave. `misturar` preenche um estado que já existe, sem criar objetos (roda
   a cada quadro).

   O cometa tem relógio próprio, k: 0 é antes de ele aparecer, 0→1 cruza o céu,
   1 é o instante da divisão e 1→2 os dois pedaços se afastam. Quem decide k é
   js/capitulos/yourname.js, pela rolagem.
   ========================================================================== */

import { clamp, lerp, suave } from '../../nucleo/util.js';

const CAMPOS_COR = ['c0', 'c1', 'c2', 'c3', 'luz', 'sombra', 'borda', 'sol', 'longe', 'perto'];
const CAMPOS_NUM = ['solForca', 'cobertura', 'estica', 'estrelas', 'veu'];

function cor(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

// c0 é o horizonte e c3 o zênite. Em ordem crescente de t: misturar supõe isso.
const QUADROS = [
  // O dia nasce da paleta da carta: papel morno no horizonte, um azul-lilás no
  // alto que já aponta para o #4a398c do crepúsculo.
  {
    t: 0.05, c0: '#fbf1e6', c1: '#d9dff0', c2: '#9fb0dc', c3: '#5a5aa8',
    luz: '#ffffff', sombra: '#aeb1d8', borda: '#ffffff', sol: '#fff6dc', solForca: 0.85,
    longe: '#aab2da', perto: '#7274b0', cobertura: 0.47, estica: 0, estrelas: 0, veu: 0.68,
  },
  // Pôr do sol: horizonte amarelo e rosa, nuvens esticando.
  {
    t: 0.27, c0: '#ffe1aa', c1: '#f5a88c', c2: '#7c84cd', c3: '#2f3790',
    luz: '#ffe9c8', sombra: '#8468ac', borda: '#fff3cf', sol: '#ffd08c', solForca: 1,
    longe: '#9079b2', perto: '#4a396e', cobertura: 0.5, estica: 0.45, estrelas: 0, veu: 0.66,
  },
  // Crepúsculo violeta: as primeiras estrelas, nuvens quase em faixas.
  {
    t: 0.44, c0: '#ffd1a1', c1: '#b25d9b', c2: '#4a398c', c3: '#171a56',
    luz: '#ffa3aa', sombra: '#3a2b72', borda: '#ffcb9c', sol: '#ff9a6a', solForca: 0.6,
    longe: '#3a2a66', perto: '#191340', cobertura: 0.56, estica: 0.85, estrelas: 0.12, veu: 0.58,
  },
  // Noite azul, estrelas plenas; o sol já se apagou.
  {
    t: 0.64, c0: '#27407f', c1: '#131c56', c2: '#090e33', c3: '#04061c',
    luz: '#2c3d80', sombra: '#0a0f33', borda: '#4257a6', sol: '#6f6fd0', solForca: 0,
    longe: '#0c1238', perto: '#05071c', cobertura: 0.66, estica: 1, estrelas: 1, veu: 0.66,
  },
  // Noite funda.
  {
    t: 1, c0: '#1f3672', c1: '#101850', c2: '#080c2e', c3: '#030416',
    luz: '#26357a', sombra: '#080c2e', borda: '#3b4f9c', sol: '#6f6fd0', solForca: 0,
    longe: '#0a1033', perto: '#04061a', cobertura: 0.7, estica: 1, estrelas: 1, veu: 0.66,
  },
].map((q) => {
  const pronto = { ...q };
  for (const nome of CAMPOS_COR) pronto[nome] = cor(q[nome]);
  return pronto;
});

function girar(v, graus) {
  const a = (graus * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}

function por(alvo, x, y) {
  alvo[0] = x;
  alvo[1] = y;
}

export function novoEstado() {
  const e = { hora: 0, tempo: 0, rol: 0, clarao: 0, fim: 0 };
  for (const nome of CAMPOS_COR) e[nome] = [0, 0, 0];
  for (const nome of CAMPOS_NUM) e[nome] = 0;
  e.solX = 0.72;
  e.solY = 1.2;
  e.terra = -0.125;
  e.cometa = { forca: 0, sep: 0, tronco: [0, 0], a: [0, 0], b: [0, 0], origem: [0, 0], divisao: [0, 0] };
  return e;
}

/** Preenche `e` (in place) com as cores e as medidas da hora. */
export function misturar(hora, e) {
  const h = clamp(hora);
  let i = 0;
  while (i < QUADROS.length - 2 && h > QUADROS[i + 1].t) i += 1;
  const a = QUADROS[i];
  const b = QUADROS[i + 1];
  const u = suave((h - a.t) / (b.t - a.t));
  for (const nome of CAMPOS_COR) {
    const ca = a[nome];
    const cb = b[nome];
    const d = e[nome];
    d[0] = lerp(ca[0], cb[0], u);
    d[1] = lerp(ca[1], cb[1], u);
    d[2] = lerp(ca[2], cb[2], u);
  }
  for (const nome of CAMPOS_NUM) e[nome] = lerp(a[nome], b[nome], u);
  e.hora = h;
  // O sol desce de fora do quadro (em cima) até atrás das serras.
  const desce = clamp(h / 0.47);
  e.solY = lerp(1.16, 0.1, desce);
  e.solX = lerp(0.74, 0.6, desce);
  // A paisagem sobe devagar: de dia só as serras ao longe; à noite, o lago inteiro.
  e.terra = lerp(-0.125, 0, suave((h - 0.14) / 0.46));
  return e;
}

/**
 * O cometa no instante k (0 a 2). Coordenadas do céu: x em alturas de tela a
 * partir do meio, y de 0 (pé) a 1 (alto). Entra pelo canto de cima à direita e,
 * em k = 1, se divide em dois pedaços que seguem lado a lado.
 */
export function cometa(k, aspecto, c) {
  // Aspecto inválido faria a origem e a divisão colapsarem no meio.
  const meia = (aspecto > 0 && Number.isFinite(aspecto) ? aspecto : 1) / 2;
  const ox = 1.16 * meia;
  const oy = 1.13;
  const dx = 0.24 * meia;
  const dy = 0.735;
  por(c.origem, ox, oy);
  por(c.divisao, dx, dy);
  if (!(k > 0)) {
    c.forca = 0;
    c.sep = 0;
    por(c.tronco, ox, oy);
    por(c.a, ox, oy);
    por(c.b, ox, oy);
    return c;
  }
  const antes = clamp(k);
  const anda0 = antes ** 0.86;
  c.forca = clamp(antes * 4);
  por(c.tronco, lerp(ox, dx, anda0), lerp(oy, dy, anda0));
  const depois = clamp(k - 1);
  c.sep = depois;
  if (depois <= 0) {
    por(c.a, c.tronco[0], c.tronco[1]);
    por(c.b, c.tronco[0], c.tronco[1]);
    return c;
  }
  // Rápido no começo, depois devagar: os dois ficam no céu até o fim.
  const anda = 1 - (1 - depois) ** 1.7;
  const comp = Math.hypot(dx - ox, dy - oy) || 1;
  const n = [(dx - ox) / comp, (dy - oy) / comp];
  const da = girar(n, 8);
  const db = girar(n, -21);
  por(c.a, dx + da[0] * 0.2 * anda, dy + da[1] * 0.2 * anda);
  por(c.b, dx + db[0] * 0.25 * anda, dy + db[1] * 0.25 * anda);
  return c;
}

/** [r, g, b] de 0 a 1 → 'rgb(...)' ou 'rgba(...)'. */
export function css(c, alfa) {
  const r = Math.round(clamp(c[0]) * 255);
  const g = Math.round(clamp(c[1]) * 255);
  const b = Math.round(clamp(c[2]) * 255);
  return alfa === undefined ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alfa})`;
}
