// O cordão trançado (kumihimo), em SVG.
//
// O cordão é uma trança de três fios de verdade: cada fio serpenteia em volta
// da linha central com um terço de volta de diferença dos outros, e a cada
// quarto de volta alterna entre passar por cima e por baixo (num cordão de três,
// o fio 0 passa sempre por cima do 1, o 1 por cima do 2 e o 2 por cima do 0).
// Cada período da trança vira um <g> com os pedaços "de baixo" primeiro e os
// "de cima" (com uma casca escura que separa) depois. Revelar o cordão é
// acender esses <g> um a um, na ordem do comprimento: nada é redesenhado.
//
//   const cordao = criarCordao({ tras, frente })        // dois <svg>
//   cordao.construir(pontos, { linha })                  // pontos de passagem
//   cordao.revelar(rolagem) → { x, y, camada } | null    // ponta atual
//   amostrar(pontos, passo) → a linha central suave (o fio do par também usa)

import { clamp, suave } from '../../nucleo/util.js';

// A bitola é a do fio da carta: a trança inteira mede ~5 px (o cordão do
// envelope tem ~2,5), para ela reconhecer que é o mesmo fio.
const PERIODO = 15;        // px de cordão para uma volta completa da trança
const AMPLITUDE = 1.75;    // quanto cada fio se afasta da linha central
const ESPESSURA = 2.3;     // largura de cada fio
const PASSO = 2;           // px entre amostras da linha central
const DOIS_PI = Math.PI * 2;
const MEIO_PI = Math.PI / 2;

// Os três fios são o mesmo vermelho (--fio #d7192d); só a luz muda de um para outro.
const FIOS = [
  { cima: '#d7192d', baixo: '#a80f22' },
  { cima: '#e2303d', baixo: '#8f0b1d' },
  { cima: '#c3152a', baixo: '#8f0b1d' },
];
const CASCA = 'rgba(48, 3, 18, 0.66)';

// ---------------------------------------------------------------------------
// Linha central: spline de Catmull-Rom centrípeta pelos pontos de passagem,
// reamostrada a cada PASSO px.
// ---------------------------------------------------------------------------
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/** Curva suave pelos pontos; devolve { n, x, y, tx, ty, seg, comprimento }. */
export function amostrar(pontos, passo = PASSO) {
  const bruto = [];
  const n = pontos.length;
  for (let i = 0; i < n - 1; i++) {
    const p1 = pontos[i];
    const p2 = pontos[i + 1];
    const p0 = pontos[i - 1] || { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
    const p3 = pontos[i + 2] || { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
    const d = dist(p1, p2);
    if (d < 0.01) continue;
    const t1 = Math.sqrt(dist(p0, p1)) || 0.001;
    const t2 = t1 + Math.sqrt(d);
    const t3 = t2 + (Math.sqrt(dist(p2, p3)) || 0.001);
    const passos = Math.max(2, Math.ceil(d / 3));
    for (let j = 0; j < passos; j++) {
      const t = t1 + ((t2 - t1) * j) / passos;
      const a1x = (p0.x * (t1 - t) + p1.x * t) / t1;
      const a1y = (p0.y * (t1 - t) + p1.y * t) / t1;
      const a2x = (p1.x * (t2 - t) + p2.x * (t - t1)) / (t2 - t1);
      const a2y = (p1.y * (t2 - t) + p2.y * (t - t1)) / (t2 - t1);
      const a3x = (p2.x * (t3 - t) + p3.x * (t - t2)) / (t3 - t2);
      const a3y = (p2.y * (t3 - t) + p3.y * (t - t2)) / (t3 - t2);
      const b1x = (a1x * (t2 - t) + a2x * t) / t2;
      const b1y = (a1y * (t2 - t) + a2y * t) / t2;
      const b2x = (a2x * (t3 - t) + a3x * (t - t1)) / (t3 - t1);
      const b2y = (a2y * (t3 - t) + a3y * (t - t1)) / (t3 - t1);
      bruto.push({
        x: (b1x * (t2 - t) + b2x * (t - t1)) / (t2 - t1),
        y: (b1y * (t2 - t) + b2y * (t - t1)) / (t2 - t1),
        seg: i,
      });
    }
  }
  if (n) bruto.push({ x: pontos[n - 1].x, y: pontos[n - 1].y, seg: Math.max(0, n - 2) });
  if (bruto.length < 2) return { n: 0, x: [], y: [], tx: [], ty: [], seg: [], comprimento: 0, passo };

  // comprimento acumulado e reamostragem uniforme
  const acum = [0];
  for (let i = 1; i < bruto.length; i++) acum.push(acum[i - 1] + dist(bruto[i - 1], bruto[i]));
  const comprimento = acum[acum.length - 1];
  const total = Math.max(2, Math.floor(comprimento / passo) + 1);
  const x = new Float32Array(total);
  const y = new Float32Array(total);
  const tx = new Float32Array(total);
  const ty = new Float32Array(total);
  const seg = new Uint16Array(total);
  let j = 0;
  for (let i = 0; i < total; i++) {
    const s = Math.min(comprimento, i * passo);
    while (j < acum.length - 2 && acum[j + 1] < s) j++;
    const vao = acum[j + 1] - acum[j] || 1;
    const u = clamp((s - acum[j]) / vao);
    x[i] = bruto[j].x + (bruto[j + 1].x - bruto[j].x) * u;
    y[i] = bruto[j].y + (bruto[j + 1].y - bruto[j].y) * u;
    seg[i] = bruto[j].seg;
  }
  for (let i = 0; i < total; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(total - 1, i + 1);
    const dx = x[b] - x[a];
    const dy = y[b] - y[a];
    const m = Math.hypot(dx, dy) || 1;
    tx[i] = dx / m;
    ty[i] = dy / m;
  }
  return { n: total, x, y, tx, ty, seg, comprimento, passo };
}

const f1 = (v) => (Math.round(v * 10) / 10).toString();

// ---------------------------------------------------------------------------
// O cordão trançado
// ---------------------------------------------------------------------------
export function criarCordao({ tras, frente }) {
  const camadas = { tras, frente };
  let grupos = [];          // <g> de cada período, na ordem do comprimento
  let limiares = [];        // rolagem a partir da qual cada período aparece
  let pontas = [];          // { x, y, camada } do fim de cada período (coordenadas do próprio svg)
  let mostrados = 0;

  function limpar() {
    for (const svgEl of Object.values(camadas)) svgEl.textContent = '';
    grupos = []; limiares = []; pontas = []; mostrados = 0;
  }

  /**
   * @param pontos  [{ x, y, camada: 'tras'|'frente' }] em px dentro do capítulo
   * @param opcoes  { linha: px da tela em que a ponta do cordão fica }
   */
  function construir(pontos, { linha } = {}) {
    limpar();
    const c = amostrar(pontos);
    if (c.n < 2) return;
    const L = c.comprimento;
    const html = { tras: '', frente: '' };
    const ordem = [];

    // posição do fio j no comprimento s
    const ponto = (s, fase, alvo) => {
      const pos = clamp(s, 0, L) / c.passo;
      const i = Math.min(c.n - 2, Math.floor(pos));
      const u = pos - i;
      const amp = AMPLITUDE * suave(s / 40) * suave((L - s) / 64);
      const lado = Math.sin((s / PERIODO) * DOIS_PI + fase) * amp;
      const txi = c.tx[i] + (c.tx[i + 1] - c.tx[i]) * u;
      const tyi = c.ty[i] + (c.ty[i + 1] - c.ty[i]) * u;
      alvo.x = c.x[i] + (c.x[i + 1] - c.x[i]) * u - tyi * lado;
      alvo.y = c.y[i] + (c.y[i + 1] - c.y[i]) * u + txi * lado;
      return alvo;
    };
    const tmp = { x: 0, y: 0 };

    const periodos = Math.max(1, Math.ceil(L / PERIODO));
    for (let k = 0; k < periodos; k++) {
      const s0 = k * PERIODO;
      const s1 = Math.min(L, s0 + PERIODO);
      const meio = Math.min(c.n - 1, Math.round(((s0 + s1) / 2) / c.passo));
      const ref = pontos[c.seg[meio]] || pontos[0];
      const camada = camadas[ref.camada] ? ref.camada : 'tras';

      const baixo = ['', '', ''];
      const cima = ['', '', ''];
      let casca = '';
      for (let j = 0; j < 3; j++) {
        const fase = (j * DOIS_PI) / 3;
        let a = s0;
        while (a < s1 - 0.01) {
          const u = (a / PERIODO) * DOIS_PI + fase;
          const quarto = Math.floor(u / MEIO_PI + 1e-6);
          const sQuarto = (((quarto + 1) * MEIO_PI - fase) / DOIS_PI) * PERIODO;
          const b = Math.min(s1, sQuarto);
          const porCima = quarto % 2 === 0;
          // Os de baixo avançam um pouco para dentro dos vizinhos (a emenda fica escondida).
          const sobra = porCima ? 0.35 : 0.9;
          const ini = Math.max(0, a - sobra);
          const ate = Math.min(L, b + sobra);
          const passos = Math.max(2, Math.ceil((ate - ini) / 1.4));
          let d = '';
          for (let q = 0; q <= passos; q++) {
            ponto(ini + ((ate - ini) * q) / passos, fase, tmp);
            d += `${q ? 'L' : 'M'}${f1(tmp.x)} ${f1(tmp.y)}`;
          }
          if (porCima) { cima[j] += d; casca += d; } else baixo[j] += d;
          a = b;
        }
      }

      let g = '<g class="yn-c">';
      for (let j = 0; j < 3; j++) if (baixo[j]) g += `<path stroke="${FIOS[j].baixo}" d="${baixo[j]}"/>`;
      if (casca) g += `<path stroke="${CASCA}" stroke-width="${ESPESSURA + 1.1}" d="${casca}"/>`;
      for (let j = 0; j < 3; j++) if (cima[j]) g += `<path stroke="${FIOS[j].cima}" d="${cima[j]}"/>`;
      g += '</g>';
      html[camada] += g;
      ordem.push(camada);

      // onde este período aparece, em rolagem
      const lim = c.y[meio] - linha;
      limiares.push(k ? Math.max(lim, limiares[k - 1]) : lim);

      const iFim = Math.min(c.n - 1, Math.round(s1 / c.passo));
      pontas.push({ x: c.x[iFim], y: c.y[iFim], camada });
    }

    const atributos = `fill="none" stroke-width="${ESPESSURA}" stroke-linecap="butt" stroke-linejoin="round"`;
    const iter = {};
    for (const nome of Object.keys(camadas)) {
      const svgEl = camadas[nome];
      svgEl.innerHTML = html[nome] ? `<g ${atributos}>${html[nome]}</g>` : '';
      iter[nome] = { lista: svgEl.querySelectorAll('.yn-c'), i: 0 };
    }
    grupos = ordem.map((nome) => iter[nome].lista[iter[nome].i++]);
  }

  /** Quantos períodos a rolagem já alcançou. */
  function ate(rolagem) {
    let a = 0;
    let b = limiares.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (limiares[m] <= rolagem) a = m + 1; else b = m;
    }
    return a;
  }

  function revelar(rolagem) {
    const alvo = ate(rolagem);
    while (mostrados < alvo) grupos[mostrados++].classList.add('v');
    while (mostrados > alvo) grupos[--mostrados].classList.remove('v');
    return mostrados > 0 && mostrados < grupos.length ? pontas[mostrados - 1] : null;
  }

  return { construir, revelar, destruir: limpar };
}
