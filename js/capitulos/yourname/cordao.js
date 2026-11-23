/* ============================================================================
   CORDÃO: a trança vermelha (kumihimo) que desce pelo capítulo
   ============================================================================
   Três fios serpenteiam em volta de uma linha central suave, cada um com um
   terço de volta de diferença, e a cada quarto de volta alternam entre passar
   por cima e por baixo. É essa ordem (baixo, casca, cima) dentro de cada
   período que faz a trança parecer trançada.

   A bitola é a do fio da carta: a trança inteira mede ~5 px (o cordão do
   envelope tem ~2,5), para ela reconhecer que é o mesmo fio. Os três fios são o
   mesmo vermelho (--fio); só a luz muda de um para outro.

   Cada período de 15 px vira um <g class="yn-c">, num dos dois SVG (o de trás
   do texto ou o da frente). Revelar o cordão é acender esses <g> um a um, na
   ordem do comprimento: nada é redesenhado.

   amostrar() é a linha central: Catmull-Rom centrípeta reamostrada por
   comprimento de arco. O fio do par (yourname.js) também usa.
   ========================================================================== */

import { clamp, suave } from '../../nucleo/util.js';

const PERIODO = 15; // px de cordão por volta completa da trança
const AMPLITUDE = 1.75; // quanto cada fio se afasta da linha central
const ESPESSURA = 2.3; // largura de cada fio
const PASSO = 2; // px entre amostras da linha central
const FIOS = [
  { cima: '#d7192d', baixo: '#a80f22' },
  { cima: '#e2303d', baixo: '#8f0b1d' },
  { cima: '#c3152a', baixo: '#8f0b1d' },
];
// A sombra que separa os trechos de cima; com a largura do fio, eles se fundiriam.
const CASCA = 'rgba(48, 3, 18, 0.66)';
const LARGURA_CASCA = ESPESSURA + 1.1;
const QUARTO = Math.PI / 2;
const VOLTA = Math.PI * 2;

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const f1 = (v) => String(Math.round(v * 10) / 10);

/**
 * Curva Catmull-Rom centrípeta pelos `pontos` ({ x, y }), reamostrada a cada
 * `passo` px. `seg[i]` é o índice (em `pontos`) do ponto que abre o segmento
 * de onde a amostra i veio.
 */
export function amostrar(pontos, passo = 2) {
  const uteis = [];
  (pontos || []).forEach((p, i) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const ultimo = uteis[uteis.length - 1];
    if (ultimo && dist(ultimo.p, p) < 0.01) return;
    uteis.push({ p, i });
  });
  if (uteis.length < 2) {
    return { n: 0, x: new Float32Array(0), y: new Float32Array(0), tx: new Float32Array(0), ty: new Float32Array(0), seg: new Uint16Array(0), comprimento: 0, passo };
  }

  // 1. A curva densa, segmento a segmento (Barry–Goldman), com fantasmas nas pontas.
  const dx = [];
  const dy = [];
  const ds = [];
  for (let k = 0; k < uteis.length - 1; k++) {
    const p1 = uteis[k].p;
    const p2 = uteis[k + 1].p;
    const p0 = k > 0 ? uteis[k - 1].p : { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
    const p3 = k + 2 < uteis.length ? uteis[k + 2].p : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
    const t0 = 0;
    const t1 = Math.sqrt(dist(p0, p1)) || 1e-4;
    const t2 = t1 + Math.sqrt(dist(p1, p2));
    const t3 = t2 + (Math.sqrt(dist(p2, p3)) || 1e-4);
    const passos = Math.max(2, Math.ceil(dist(p1, p2) / 3));
    for (let s = 0; s < passos; s++) {
      const t = t1 + ((t2 - t1) * s) / passos;
      const a1x = ((t1 - t) * p0.x + (t - t0) * p1.x) / (t1 - t0);
      const a1y = ((t1 - t) * p0.y + (t - t0) * p1.y) / (t1 - t0);
      const a2x = ((t2 - t) * p1.x + (t - t1) * p2.x) / (t2 - t1);
      const a2y = ((t2 - t) * p1.y + (t - t1) * p2.y) / (t2 - t1);
      const a3x = ((t3 - t) * p2.x + (t - t2) * p3.x) / (t3 - t2);
      const a3y = ((t3 - t) * p2.y + (t - t2) * p3.y) / (t3 - t2);
      const b1x = ((t2 - t) * a1x + (t - t0) * a2x) / (t2 - t0);
      const b1y = ((t2 - t) * a1y + (t - t0) * a2y) / (t2 - t0);
      const b2x = ((t3 - t) * a2x + (t - t1) * a3x) / (t3 - t1);
      const b2y = ((t3 - t) * a2y + (t - t1) * a3y) / (t3 - t1);
      dx.push(((t2 - t) * b1x + (t - t1) * b2x) / (t2 - t1));
      dy.push(((t2 - t) * b1y + (t - t1) * b2y) / (t2 - t1));
      ds.push(uteis[k].i);
    }
  }
  const fim = uteis[uteis.length - 1];
  dx.push(fim.p.x);
  dy.push(fim.p.y);
  ds.push(uteis[uteis.length - 2].i);

  // 2. Comprimento de arco acumulado.
  const acum = new Float64Array(dx.length);
  for (let i = 1; i < dx.length; i++) acum[i] = acum[i - 1] + Math.hypot(dx[i] - dx[i - 1], dy[i] - dy[i - 1]);
  const comprimento = acum[acum.length - 1];
  if (!(comprimento > 0)) {
    return { n: 0, x: new Float32Array(0), y: new Float32Array(0), tx: new Float32Array(0), ty: new Float32Array(0), seg: new Uint16Array(0), comprimento: 0, passo };
  }

  // 3. Reamostragem a cada `passo` px de arco.
  const n = Math.floor(comprimento / passo) + 1;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const seg = new Uint16Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * passo;
    while (j < acum.length - 2 && acum[j + 1] < s) j += 1;
    const trecho = acum[j + 1] - acum[j] || 1;
    const f = clamp((s - acum[j]) / trecho);
    x[i] = dx[j] + (dx[j + 1] - dx[j]) * f;
    y[i] = dy[j] + (dy[j + 1] - dy[j]) * f;
    seg[i] = ds[j];
  }

  // 4. Tangente unitária por diferença central.
  const tx = new Float32Array(n);
  const ty = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const vx = x[b] - x[a];
    const vy = y[b] - y[a];
    const m = Math.hypot(vx, vy) || 1;
    tx[i] = n > 1 ? vx / m : 1;
    ty[i] = n > 1 ? vy / m : 0;
  }
  return { n, x, y, tx, ty, seg, comprimento, passo };
}

export function criarCordao({ tras, frente }) {
  const camadas = { tras, frente };
  let grupos = [];
  let limiares = [];
  let pontas = [];
  let mostrados = 0;
  // A última rolagem revelada: uma remedição refaz a trança já acesa até ali,
  // sem apagar e reacender (senão o cordão inteiro piscaria a cada resize).
  let ultimaRolagem = -Infinity;

  function limpar() {
    tras.textContent = '';
    frente.textContent = '';
    grupos = [];
    limiares = [];
    pontas = [];
    mostrados = 0;
  }

  /** `pontos`: [{ x, y, camada: 'tras' | 'frente' }]; `linha`: a linha de leitura em px. */
  function construir(pontos, { linha = 0 } = {}) {
    limpar();
    const c = amostrar(pontos, PASSO);
    if (c.n < 2) return;
    const L = c.comprimento;
    // O cordão nasce e morre suave nas pontas.
    const amp = (s) => AMPLITUDE * suave(s / 40) * suave((L - s) / 64);
    const alvo = { x: 0, y: 0 };

    // A posição de um fio (fase) no comprimento s.
    function ponto(s, fase) {
      const pos = clamp(s / c.passo, 0, c.n - 1);
      const i = Math.min(c.n - 2, Math.floor(pos));
      const f = pos - i;
      const cx = c.x[i] + (c.x[i + 1] - c.x[i]) * f;
      const cy = c.y[i] + (c.y[i + 1] - c.y[i]) * f;
      const tx = c.tx[i] + (c.tx[i + 1] - c.tx[i]) * f;
      const ty = c.ty[i] + (c.ty[i + 1] - c.ty[i]) * f;
      const lado = Math.sin((s / PERIODO) * VOLTA + fase) * amp(s);
      alvo.x = cx - ty * lado;
      alvo.y = cy + tx * lado;
      return alvo;
    }

    // Um trecho de um fio, amostrado a cada 1,4 px.
    function trecho(a, b, fase) {
      const passos = Math.max(1, Math.ceil((b - a) / 1.4));
      let d = '';
      for (let i = 0; i <= passos; i++) {
        const p = ponto(a + ((b - a) * i) / passos, fase);
        d += `${i ? 'L' : 'M'}${f1(p.x)} ${f1(p.y)}`;
      }
      return d;
    }

    const html = { tras: [], frente: [] };
    const ordem = [];
    const periodos = Math.ceil(L / PERIODO);
    let limiar = -Infinity;
    for (let k = 0; k < periodos; k++) {
      const s0 = k * PERIODO;
      const s1 = Math.min(L, s0 + PERIODO);
      const meio = Math.min(c.n - 1, Math.round((s0 + s1) / 2 / c.passo));
      const ref = pontos[c.seg[meio]];
      const camada = ref?.camada === 'frente' ? 'frente' : 'tras';

      const cima = ['', '', ''];
      const baixo = ['', '', ''];
      let casca = '';
      for (let j = 0; j < 3; j++) {
        const fase = (j * VOLTA) / 3;
        let a = s0;
        while (a < s1 - 1e-6) {
          // Corta o fio em quartos de volta: quarto par passa por cima, ímpar por baixo.
          const u = (a / PERIODO) * VOLTA + fase;
          const quarto = Math.floor(u / QUARTO + 1e-6);
          const b = Math.min(s1, ((quarto + 1) * QUARTO - fase) * (PERIODO / VOLTA));
          const porCima = quarto % 2 === 0;
          const sobra = porCima ? 0.35 : 0.9;
          const d = trecho(Math.max(0, a - sobra), Math.min(L, b + sobra), fase);
          if (porCima) {
            cima[j] += d;
            casca += d;
          } else {
            baixo[j] += d;
          }
          a = b;
        }
      }

      // Os limiares não podem descer: a busca binária de revelar depende disso.
      limiar = Math.max(limiar, c.y[meio] - linha);
      limiares.push(limiar);
      // Já passou da linha antes desta remedição: nasce aceso, sem transição.
      const aceso = limiar <= ultimaRolagem;
      if (aceso) mostrados += 1;

      let g = `<g class="yn-c${aceso ? ' v' : ''}">`;
      for (let j = 0; j < 3; j++) if (baixo[j]) g += `<path stroke="${FIOS[j].baixo}" d="${baixo[j]}"/>`;
      if (casca) g += `<path stroke="${CASCA}" stroke-width="${LARGURA_CASCA}" d="${casca}"/>`;
      for (let j = 0; j < 3; j++) if (cima[j]) g += `<path stroke="${FIOS[j].cima}" d="${cima[j]}"/>`;
      html[camada].push(`${g}</g>`);
      ordem.push(camada);
      const fimK = Math.min(c.n - 1, Math.round(s1 / c.passo));
      pontas.push({ x: c.x[fimK], y: c.y[fimK], camada });
    }

    const abre = `<g fill="none" stroke-width="${ESPESSURA}" stroke-linecap="butt" stroke-linejoin="round">`;
    for (const nome of ['tras', 'frente']) {
      if (html[nome].length) camadas[nome].innerHTML = `${abre}${html[nome].join('')}</g>`;
    }
    const filas = { tras: [...tras.querySelectorAll('.yn-c')], frente: [...frente.querySelectorAll('.yn-c')] };
    const usados = { tras: 0, frente: 0 };
    grupos = ordem.map((nome) => filas[nome][usados[nome]++]);
  }

  // Quantos períodos já passaram da linha de leitura (busca binária).
  function ate(rolagem) {
    let lo = 0;
    let hi = limiares.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (limiares[m] <= rolagem) lo = m + 1;
      else hi = m;
    }
    return lo;
  }

  /** Acende os períodos até a rolagem; devolve a ponta acesa ({ x, y, camada }) ou null. */
  function revelar(rolagem) {
    ultimaRolagem = rolagem;
    const alvo = ate(rolagem);
    while (mostrados < alvo) grupos[mostrados++].classList.add('v');
    while (mostrados > alvo) grupos[--mostrados].classList.remove('v');
    if (mostrados === 0 || mostrados === grupos.length) return null;
    return pontas[mostrados - 1];
  }

  return { construir, revelar, destruir: limpar };
}
