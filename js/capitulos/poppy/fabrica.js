/* ============================================================================
   POPPY / FÁBRICA: o galpão desenhado à mão (em código)
   ============================================================================
   Um galpão de fábrica de brinquedos abandonada, visto de dentro, em
   perspectiva de um ponto. Tudo é posto em metros num corredor 3D e projetado
   por P(x, y, z), assim piso, paredes, esteira e luminárias concordam entre
   si. Nada aqui tem texto nem personagem: só o lugar. É a textura que o
   shader de VHS (fundo.js) degrada quando conteudo.poppy.fundo está vazio.
   É pesado (milhares de fillRect): roda no aquecimento, nunca no quadro de montagem.
   ========================================================================== */

import { semente } from '../../nucleo/util.js';

// O ponto de fuga, em fração da imagem (y contado do topo; o shader usa 1 − y).
export const FUGA = { x: 0.5, y: 0.46 };

const OLHO = 1.55; // altura da câmera, m
const MEIA = 2.3; // meia largura do corredor
const ALT = 4.6; // pé-direito
const Z0 = 1.1; // o mais perto que se desenha
const SEG = 2.4; // vão entre pilastras
const N = 16; // vãos
const ZF = Z0 + N * SEG; // parede do fundo (39,5 m)
const LAMPADAS = [[5.9, 0.5], [10.7, 1], [15.5, 0.8], [20.3, 0.16], [27.5, 0.9], [34.7, 0.6]];

const NEVOA = [9, 27, 39];
const PAREDE = [24, 60, 78];
const REBOCO = [44, 70, 76];
const TETO = [9, 24, 33];
const PISO_CLARO = [34, 74, 92];
const PISO_ESCURO = [11, 30, 42];
const CREME = [214, 204, 180];
const FIO = [215, 25, 45];
const MADEIRA = [70, 56, 46];
// Tinta de brinquedo já gasta: as cores do capítulo puxadas para o cinza do galpão.
const TINTA = [[176, 58, 52], [196, 158, 58], [52, 116, 164], [62, 140, 96]];
// Esteira do galpão (lado direito do corredor)
const EX1 = 0.95;
const EX2 = 1.98;
const EY = 0.95;
const EZ0 = 4.3;
const EZ1 = 31;

export function desenharFabrica(largura = 640, altura = 1280) {
  const W = largura;
  const H = altura;
  const tela = document.createElement('canvas');
  tela.width = W;
  tela.height = H;
  const g = tela.getContext('2d');
  if (!g) return tela;
  const r = semente(2312); // a mesma imagem sempre
  const entre = (a, b) => a + (b - a) * r();

  const f = W * 0.8;
  const cx = W * FUGA.x;
  const cy = H * FUGA.y;
  const P = (x, y, z) => [cx + (f * x) / z, cy - (f * (y - OLHO)) / z];
  const nevoa = (z) => 1 - Math.exp(-Math.max(0, z - 2) * 0.062);
  const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
  const tom = (base, z, l = 1, a = 1) => {
    const n = nevoa(z);
    return css(base.map((v, i) => Math.min(255, v * l) * (1 - n) + NEVOA[i] * n), a);
  };
  const mistura = (a, b, k) => a.map((v, i) => v * k + b[i] * (1 - k));
  const luzPiso = (x, z) => 0.38 + LAMPADAS.reduce((s, [zl, i]) => s + 1.2 * i * Math.exp(-(x * x + (z - zl) ** 2) / 4.5), 0);
  const luzParede = (z, y) => (0.62 + LAMPADAS.reduce((s, [zl, i]) => s + 0.8 * i * Math.exp(-((z - zl) ** 2) / 6.5), 0))
    * (0.6 + 0.4 * Math.exp(-((y - 2.4) ** 2) / 3.5));

  function poligono(pts, cor) {
    g.fillStyle = cor;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fill();
  }
  function linha(a, b, cor, larg) {
    g.strokeStyle = cor;
    g.lineWidth = larg;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
  }
  const naParede = (x, y0, y1, z0, z1, cor) => poligono([P(x, y0, z0), P(x, y0, z1), P(x, y1, z1), P(x, y1, z0)], cor);
  const deFrente = (x0, x1, y0, y1, z, cor) => poligono([P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)], cor);
  const deitado = (x0, x1, z0, z1, y, cor) => poligono([P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)], cor);

  // Uma forma grande pintada na parede (círculo, triângulo ou quadrado), no plano x.
  function formaNaParede(x, zc, tipo, cor, a) {
    const R = 0.78;
    const yc = 2.3;
    const n = tipo === 0 ? 24 : tipo === 1 ? 3 : 4;
    const giro = tipo === 1 ? -Math.PI / 2 : Math.PI / 4;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = giro + (i / n) * Math.PI * 2;
      pts.push(P(x, yc + Math.sin(t) * R, zc + Math.cos(t) * R));
    }
    poligono(pts, tom(cor, zc, luzParede(zc, yc), a));
  }
  // Uma mancha irregular (reboco que caiu, tinta lascada), no plano x.
  function lasca(x, zc, yc, tam, cor, a) {
    const pts = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const rr = tam * (0.55 + 0.45 * r());
      pts.push(P(x, yc + Math.sin(t) * rr * 0.7, zc + Math.cos(t) * rr));
    }
    poligono(pts, tom(cor, zc, luzParede(zc, yc), a));
  }
  // Caixa com as faces que a câmera vê: frente, topo (abaixo do olho) e o lado voltado ao corredor.
  function caixa(x0, x1, y0, y1, z0, z1, cor, l) {
    const zm = (z0 + z1) / 2;
    if (x0 > 0) naParede(x0, y0, y1, z0, z1, tom(cor, zm, l * 0.7));
    if (x1 < 0) naParede(x1, y0, y1, z0, z1, tom(cor, zm, l * 0.7));
    if (y1 < OLHO) deitado(x0, x1, z0, z1, y1, tom(cor, zm, l * 1.15));
    deFrente(x0, x1, y0, y1, z0, tom(cor, z0, l * 0.92));
  }
  function caixote(x0, x1, y0, y1, z0, z1, faixa) {
    const l = luzPiso((x0 + x1) / 2, z0);
    caixa(x0, x1, y0, y1, z0, z1, MADEIRA, l);
    const ripa = tom([40, 31, 26], z0, l);
    for (let i = 1; i < 4; i++) {
      const y = y0 + ((y1 - y0) * i) / 4;
      linha(P(x0, y, z0), P(x1, y, z0), ripa, Math.max(0.8, (f * 0.018) / z0));
    }
    linha(P(x0, y0, z0), P(x1, y1, z0), ripa, Math.max(0.8, (f * 0.022) / z0));
    deFrente(x0, x1, y0 + (y1 - y0) * 0.42, y0 + (y1 - y0) * 0.58, z0 - 0.001, tom(faixa, z0, l * 0.9, 0.85));
  }

  const coisas = [];
  const por = (z, desenhar) => coisas.push({ z, desenhar });

  /* (1) O escuro do fundo e a porta de luz fria */
  g.fillStyle = css(NEVOA);
  g.fillRect(0, 0, W, H);
  deFrente(-MEIA, MEIA, 0, ALT, ZF, css([20, 48, 62]));
  deFrente(-0.95, 0.95, 0, 2.8, ZF - 0.01, 'rgba(126,176,176,0.5)');

  /* (2) Teto e piso */
  for (let i = 0; i < N; i++) {
    const z0 = Z0 + i * SEG;
    deitado(-MEIA, MEIA, z0, z0 + SEG, ALT, tom(TETO, z0 + SEG / 2, 0.9 + 0.25 * luzParede(z0 + SEG / 2, 4.4)));
  }
  const LADO = (2 * MEIA) / 6;
  for (let zi = 0, z = 0.62; z < ZF; zi++, z += LADO) {
    for (let xi = 0; xi < 6; xi++) {
      const x0 = -MEIA + xi * LADO;
      const gasto = 0.84 + 0.3 * r();
      const base = (xi + zi) % 2 ? PISO_ESCURO : PISO_CLARO;
      const zm = z + LADO / 2;
      deitado(x0, x0 + LADO, z, Math.min(ZF, z + LADO), 0, tom(base, zm, luzPiso(x0 + LADO / 2, zm) * gasto));
    }
    // As faixas amarelas de segurança, gastas: às vezes falta um pedaço.
    for (const xf of [-1.62, 0.76]) {
      if (r() < 0.2) continue;
      deitado(xf, xf + 0.09, z, Math.min(ZF, z + LADO * 0.92), 0.002, tom(TINTA[1], z + LADO / 2, luzPiso(xf, z + LADO / 2), 0.72));
    }
  }

  /* (3) Paredes e pilastras, do fundo para a frente; vigas e treliças no teto */
  for (let i = N - 1; i >= 0; i--) {
    const z0 = Z0 + i * SEG;
    const z1 = z0 + SEG;
    const zm = (z0 + z1) / 2;
    for (const lado of [-1, 1]) {
      const x = lado * MEIA;
      const d = lado > 0 ? 1 : 0;
      const tinta = TINTA[(i + d * 2) % 4];
      naParede(x, 1.27, 3.1, z0, z1, tom(mistura(tinta, PAREDE, 0.32), zm, luzParede(zm, 2.2)));
      naParede(x, 3.1, ALT, z0, z1, tom(PAREDE, zm, luzParede(zm, 3.8)));
      naParede(x, 0, 1.15, z0, z1, tom(tinta, zm, luzParede(zm, 0.6)));
      naParede(x, 1.15, 1.27, z0, z1, tom(CREME, zm, luzParede(zm, 1.2)));
      naParede(x, 0, 0.16, z0, z1, tom([6, 16, 22], zm, 1, 0.55));
      if ((i + d) % 2 === 1 && i < 12) {
        const tipo = (Math.floor(i / 2) + d) % 3;
        formaNaParede(x, zm, tipo, TINTA[(i + 1 + d) % 4], 0.62);
        for (let k = 0; k < 7; k++) {
          const t = r() * Math.PI * 2;
          lasca(x, zm + Math.cos(t) * 0.8, 2.3 + Math.sin(t) * 0.6, 0.06 + r() * 0.1, REBOCO, 0.85);
        }
      }
      const lascas = i < 9 ? 12 : 5;
      for (let k = 0; k < lascas; k++) {
        lasca(x, entre(z0 + 0.2, z1 - 0.2), entre(0.3, 4.2), 0.05 + r() * 0.18, REBOCO, 0.7 + r() * 0.3);
      }
      // Escorridos: a infiltração desce pela parede.
      for (let k = 0; k < 3; k++) {
        const zc = entre(z0 + 0.2, z1 - 0.2);
        const larg = 0.05 + r() * 0.07;
        const topo = entre(2.6, 4.4);
        naParede(x, topo - entre(0.6, 2.2), topo, zc, zc + larg, tom([8, 20, 27], zc, 1, 0.35));
      }
      if (lado < 0 && i === 3) {
        // A porta da sala de manutenção, com a janelinha acesa.
        naParede(x, 0, 2.3, z0 + 0.6, z0 + 1.6, tom([16, 34, 44], zm, luzParede(zm, 1.2)));
        naParede(x, 0.05, 2.22, z0 + 0.68, z0 + 1.52, tom([30, 58, 70], zm, luzParede(zm, 1.2)));
        naParede(x, 1.42, 1.92, z0 + 0.92, z0 + 1.28, 'rgba(240,190,120,0.75)');
      }
      // A pilastra no limite do vão: duas faces, a de frente e a voltada ao corredor.
      const za = z1;
      const xi = lado * (MEIA - 0.16);
      poligono([P(xi, 0, za - 0.13), P(x, 0, za - 0.13), P(x, ALT, za - 0.13), P(xi, ALT, za - 0.13)], tom(REBOCO, za, luzParede(za, 2.4) * 0.95));
      naParede(xi, 0, ALT, za - 0.13, za + 0.13, tom(PAREDE, za, luzParede(za, 2.4) * 0.72));
    }
    // Viga e treliça na linha da pilastra
    const za = z1;
    const viga = tom([14, 32, 42], za, 0.9);
    linha(P(-MEIA, ALT - 0.06, za), P(MEIA, ALT - 0.06, za), viga, Math.max(0.8, (f * 0.07) / za));
    const trelica = [];
    for (let k = 0; k <= 8; k++) trelica.push(P(-MEIA + (k / 8) * 2 * MEIA, k % 2 ? ALT - 0.42 : ALT - 0.08, za));
    g.strokeStyle = viga;
    g.lineWidth = Math.max(0.6, (f * 0.025) / za);
    g.beginPath();
    g.moveTo(trelica[0][0], trelica[0][1]);
    for (const p of trelica.slice(1)) g.lineTo(p[0], p[1]);
    g.stroke();
    linha(P(-MEIA, ALT - 0.42, za), P(MEIA, ALT - 0.42, za), viga, Math.max(0.6, (f * 0.03) / za));
  }

  /* (4) Objetos, do mais longe para o mais perto */
  for (let i = 0; i < N; i++) {
    const z0 = Z0 + i * SEG;
    const z1 = z0 + SEG;
    const zm = (z0 + z1) / 2;
    // Canos no alto, à esquerda, com a braçadeira até o teto
    por(zm + 0.01, () => {
      const xc = -MEIA + 0.24;
      linha(P(xc, 4.02, z0), P(xc, 4.02, z1), tom(TINTA[1], zm, luzParede(zm, 4)), Math.max(1, (f * 0.24) / zm));
      linha(P(xc + 0.04, 4.2, z0), P(xc + 0.04, 4.2, z1), tom([70, 96, 104], zm, luzParede(zm, 4.2)), Math.max(0.8, (f * 0.15) / zm));
      linha(P(xc, 4.02, z0 + 0.05), P(xc, ALT, z0 + 0.05), tom([30, 44, 50], z0, 1), Math.max(0.6, (f * 0.04) / z0));
    });
    // O fio vermelho também mora aqui: um cabo fino corre pela parede da direita até sumir no fundo.
    por(zm, () => {
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push(P(MEIA - 0.2, 3.34 - Math.sin(t * Math.PI) * 0.16, z0 + t * SEG));
      }
      g.strokeStyle = tom(FIO, zm, luzParede(zm, 3.3));
      g.lineWidth = Math.max(1.1, (f * 0.03) / zm);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
      g.stroke();
    });
  }

  for (const [zl, i] of LAMPADAS) {
    por(zl, () => {
      linha(P(0, ALT, zl), P(0, 3.78, zl), tom([8, 18, 24], zl, 1), Math.max(0.6, (f * 0.014) / zl));
      poligono([P(-0.12, 3.78, zl), P(0.12, 3.78, zl), P(0.34, 3.5, zl), P(-0.34, 3.5, zl)], tom([18, 40, 50], zl, 1));
      poligono([P(-0.12, 3.8, zl), P(0.12, 3.8, zl), P(0.3, 3.56, zl), P(-0.3, 3.56, zl)], tom([6, 16, 22], zl, 1));
      const [hx, hy] = P(0, 3.47, zl);
      const raio = (f * 0.11) / zl;
      g.fillStyle = `rgba(255,232,186,${Math.min(1, 0.25 + 0.7 * i)})`;
      g.beginPath();
      g.ellipse(hx, hy, raio * 1.6, raio * 0.42, 0, 0, Math.PI * 2);
      g.fill();
    });
  }

  // A esteira do galpão, em segmentos de 1,2 m
  for (let z = EZ1; z > EZ0; z -= 1.2) {
    const z0 = Math.max(EZ0, z - 1.2);
    const z1 = z;
    const zm = (z0 + z1) / 2;
    por(zm, () => {
      const l = luzPiso(1.4, zm);
      naParede(EX1, 0.55, EY, z0, z1, tom([44, 96, 84], zm, l * 0.8));
      naParede(EX1, EY - 0.08, EY, z0, z1, tom(TINTA[1], zm, l));
      deitado(EX1, EX2, z0, z1, EY, tom([16, 30, 38], zm, l));
      for (let k = 0; k < 6; k++) {
        const zr = z0 + ((k + 0.5) / 6) * (z1 - z0);
        linha(P(EX1, EY + 0.001, zr), P(EX2, EY + 0.001, zr), tom([24, 42, 50], zr, l), Math.max(0.5, (f * 0.012) / zr));
      }
      const [rx, ry] = P(EX1, 0.66, zm);
      g.fillStyle = tom(CREME, zm, l * 0.85);
      g.beginPath();
      g.arc(rx, ry, Math.max(0.8, (f * 0.07) / zm), 0, Math.PI * 2);
      g.fill();
      linha(P(EX1 + 0.12, 0, zm), P(EX1 + 0.12, 0.55, zm), tom([20, 34, 40], zm, l), Math.max(0.6, (f * 0.05) / zm));
    });
  }
  por(EZ0 - 0.01, () => {
    const l = luzPiso(1.4, EZ0);
    deFrente(EX1, EX2, 0.55, EY, EZ0, tom([44, 96, 84], EZ0, l * 0.9));
    deFrente(EX1, EX2, EY - 0.08, EY, EZ0 - 0.001, tom(TINTA[1], EZ0, l));
  });

  // As peças paradas na esteira (uma delas é uma bola)
  for (let k = 0; k < 8; k++) {
    const z = 5.2 + k * 3;
    const x = entre(1.3, 1.6);
    if (k === 3) {
      por(z, () => {
        const [bx, by] = P(x, EY + 0.24, z + 0.24);
        const raio = (f * 0.24) / (z + 0.24);
        g.fillStyle = tom(TINTA[2], z, luzPiso(x, z));
        g.beginPath();
        g.arc(bx, by, raio, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = tom(CREME, z, luzPiso(x, z), 0.5);
        g.beginPath();
        g.ellipse(bx - raio * 0.3, by - raio * 0.35, raio * 0.3, raio * 0.18, -0.5, 0, Math.PI * 2);
        g.fill();
      });
      continue;
    }
    const s = entre(0.36, 0.56);
    const cor = TINTA[k % 4];
    por(z, () => caixa(x - s / 2, x + s / 2, EY, EY + s, z, z + s, cor, luzPiso(x, z)));
  }

  // Caixotes de madeira, perto, à esquerda
  por(5.6, () => caixote(-2.05, -1.38, 0, 0.62, 4.95, 5.6, TINTA[0]));
  por(5.55, () => caixote(-1.98, -1.44, 0.62, 1.14, 5.02, 5.55, TINTA[2]));
  por(7.65, () => caixote(-2.12, -1.46, 0, 0.6, 7.0, 7.65, TINTA[3]));

  // A máquina grande: funil, painel com três luzes, mostrador e a calha que desce ao corredor
  por(11.3, () => {
    const z0 = 11.3;
    const z1 = 14.6;
    const za = (z0 + z1) / 2;
    const l = luzParede(za, 1.6);
    caixa(-2.28, -1.12, 0, 2.9, z0, z1, [28, 52, 62], l);
    poligono([P(-2.18, 2.9, z0 + 0.4), P(-1.22, 2.9, z0 + 0.4), P(-1.02, 3.55, z0 + 0.4), P(-2.38, 3.55, z0 + 0.4)], tom(TINTA[0], z0, l));
    naParede(-1.12, 1.1, 2.25, 11.8, 13.7, tom([12, 30, 38], za, 1));
    [[255, 96, 80], [246, 193, 45], [96, 220, 140]].forEach((cor, k) => {
      const zl = 12.1 + k * 0.32;
      const [lx, ly] = P(-1.119, 2.0, zl);
      g.fillStyle = css(cor, 0.9);
      g.beginPath();
      g.arc(lx, ly, Math.max(1, (f * 0.05) / zl), 0, Math.PI * 2);
      g.fill();
    });
    const [mx, my] = P(-1.119, 1.5, 13.15);
    const rm = (f * 0.24) / za;
    g.fillStyle = tom(CREME, za, l);
    g.beginPath();
    g.ellipse(mx, my, rm * 0.55, rm, 0, 0, Math.PI * 2);
    g.fill();
    linha([mx, my], [mx + rm * 0.3, my - rm * 0.6], tom([30, 20, 20], za, 1), Math.max(0.8, rm * 0.08));
    poligono([P(-1.12, 1.05, 13.75), P(-1.12, 1.05, 14.25), P(-0.42, 0.32, 14.25), P(-0.42, 0.32, 13.75)], tom(TINTA[1], 14, l));
  });

  coisas.sort((a, b) => b.z - a.z);
  for (const c of coisas) c.desenhar();
  g.lineCap = 'butt';

  /* (5) Luz: halos, cones de poeira, poças e o brilho frio do fundo */
  g.globalCompositeOperation = 'lighter';
  for (const [zl, i] of LAMPADAS) {
    const [hx, hy] = P(0, 3.47, zl);
    const raio = (f * 1.25) / zl;
    const halo = g.createRadialGradient(hx, hy, 0, hx, hy, raio);
    halo.addColorStop(0, `rgba(255,214,150,${0.5 * i})`);
    halo.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = halo;
    g.fillRect(hx - raio, hy - raio, raio * 2, raio * 2);

    const [, chao] = P(0, 0, zl);
    const cone = g.createLinearGradient(0, hy, 0, chao);
    cone.addColorStop(0, `rgba(220,210,170,${0.12 * i})`);
    cone.addColorStop(1, 'rgba(220,210,170,0)');
    poligono([P(-0.3, 3.47, zl), P(0.3, 3.47, zl), P(1.7, 0, zl), P(-1.7, 0, zl)], cone);

    const [px, py] = P(0, 0, zl);
    const rx = (f * 2.3) / zl;
    const ry = (rx * OLHO) / zl;
    g.save();
    g.translate(px, py);
    g.scale(1, Math.max(0.05, ry / rx));
    const poca = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    poca.addColorStop(0, `rgba(255,220,160,${0.35 * i})`);
    poca.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = poca;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
  }
  const [fx, fy] = P(0, 1.4, ZF);
  const frio = g.createRadialGradient(fx, fy, 0, fx, fy, W * 0.3);
  frio.addColorStop(0, 'rgba(120,176,178,0.34)');
  frio.addColorStop(1, 'rgba(120,176,178,0)');
  g.fillStyle = frio;
  g.fillRect(fx - W * 0.3, fy - W * 0.3, W * 0.6, W * 0.6);
  g.globalCompositeOperation = 'source-over';

  /* (6) Textura: poeira, riscos e manchas */
  for (let i = 0; i < 9000; i++) {
    const claro = r() < 0.5;
    g.fillStyle = claro ? `rgba(200,220,218,${0.02 + r() * 0.05})` : `rgba(2,8,12,${0.05 + r() * 0.1})`;
    const s = 1 + r() * 1.4;
    g.fillRect(r() * W, r() * H, s, s);
  }
  for (let i = 0; i < 46; i++) {
    const x = r() * W;
    const y = r() * H;
    const comp = 8 + r() * 46;
    const ang = -Math.PI / 2 + (r() - 0.5) * 0.5;
    linha([x, y], [x + Math.cos(ang) * comp, y + Math.sin(ang) * comp], `rgba(220,232,230,${0.02 + r() * 0.04})`, 1);
  }
  for (let i = 0; i < 14; i++) {
    const x = r() * W;
    const y = r() * H;
    const raio = 30 + r() * 110;
    g.save();
    g.translate(x, y);
    g.scale(1, 0.3);
    const mancha = g.createRadialGradient(0, 0, 0, 0, 0, raio);
    mancha.addColorStop(0, `rgba(3,10,15,${0.12 + r() * 0.14})`);
    mancha.addColorStop(1, 'rgba(3,10,15,0)');
    g.fillStyle = mancha;
    g.fillRect(-raio, -raio, raio * 2, raio * 2);
    g.restore();
  }

  /* (7) Vinheta: escurece as bordas; o texto vai por cima e o meio fica mais calmo */
  const vinheta = g.createRadialGradient(cx, cy, W * 0.3, cx, cy, H * 0.78);
  vinheta.addColorStop(0, 'rgba(3,10,15,0)');
  vinheta.addColorStop(1, 'rgba(3,10,15,0.74)');
  g.fillStyle = vinheta;
  g.fillRect(0, 0, W, H);
  const topo = g.createLinearGradient(0, 0, 0, H * 0.2);
  topo.addColorStop(0, 'rgba(3,10,15,0.55)');
  topo.addColorStop(1, 'rgba(3,10,15,0)');
  g.fillStyle = topo;
  g.fillRect(0, 0, W, H * 0.2);
  const pe = g.createLinearGradient(0, H * 0.78, 0, H);
  pe.addColorStop(0, 'rgba(3,10,15,0)');
  pe.addColorStop(1, 'rgba(3,10,15,0.6)');
  g.fillStyle = pe;
  g.fillRect(0, H * 0.78, W, H * 0.22);

  return tela;
}
