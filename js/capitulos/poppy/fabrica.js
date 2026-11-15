// A fábrica desenhada (canvas 2D): um galpão comprido de uma fábrica de
// brinquedos abandonada, visto de dentro, em perspectiva de um ponto.
//
//   desenharFabrica(largura, altura) → HTMLCanvasElement
//
// É a imagem que o shader de VHS degrada quando `conteudo.poppy.fundo` não
// existe. Tudo é posto em metros num corredor 3D e projetado (assim piso,
// paredes, esteira e luminárias concordam entre si). Nada aqui tem texto nem
// personagem: só o lugar.
//
// O fio vermelho também mora aqui: um cabo fino corre pela parede da direita
// até sumir no fundo.

import { semente } from '../../nucleo/util.js';

/** Onde fica o ponto de fuga na imagem (0..1, y a partir do topo). O zoom do shader gira em volta dele. */
export const FUGA = { x: 0.5, y: 0.46 };

const NEVOA = [9, 27, 39];
const PAREDE = [24, 60, 78];
const REBOCO = [44, 70, 76];
const TETO = [9, 24, 33];
const PISO_CLARO = [34, 74, 92];
const PISO_ESCURO = [11, 30, 42];
const CREME = [214, 204, 180];
const FIO = [215, 25, 45];
// Tinta de brinquedo já gasta: as cores do capítulo puxadas para o cinza do galpão.
const TINTA = [
  [176, 58, 52],   // vermelho
  [196, 158, 58],  // amarelo
  [52, 116, 164],  // azul
  [62, 140, 96],   // verde
];

export function desenharFabrica(largura = 640, altura = 1280) {
  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const c = tela.getContext('2d');
  const r = semente(2312);

  const W = largura;
  const H = altura;
  const cx = W * FUGA.x;
  const cy = H * FUGA.y;
  const f = W * 0.8;                  // distância focal em px
  const OLHO = 1.55;                  // altura dos olhos (m)
  const MEIA = 2.3;                   // meia largura do corredor
  const ALT = 4.6;                    // pé-direito
  const Z0 = 1.1;
  const SEG = 2.4;                    // um vão entre pilastras
  const N = 16;
  const ZF = Z0 + N * SEG;            // parede do fundo

  const LAMPADAS = [
    { z: 5.9, i: 0.5 }, { z: 10.7, i: 1 }, { z: 15.5, i: 0.8 },
    { z: 20.3, i: 0.16 }, { z: 27.5, i: 0.9 }, { z: 34.7, i: 0.6 },
  ];

  const P = (x, y, z) => [cx + (f * x) / z, cy - (f * (y - OLHO)) / z];
  const nevoa = (z) => 1 - Math.exp(-Math.max(0, z - 2) * 0.062);
  const css = (cor, a = 1) => `rgba(${cor[0] | 0},${cor[1] | 0},${cor[2] | 0},${a})`;
  /** A cor `base` com a luz `l` do lugar e a névoa da distância `z`. */
  const tom = (base, z, l = 1, a = 1) => {
    const n = nevoa(z);
    return css([
      Math.min(255, base[0] * l) * (1 - n) + NEVOA[0] * n,
      Math.min(255, base[1] * l) * (1 - n) + NEVOA[1] * n,
      Math.min(255, base[2] * l) * (1 - n) + NEVOA[2] * n,
    ], a);
  };
  const luzPiso = (x, z) => {
    let s = 0.38;
    for (const l of LAMPADAS) s += 1.2 * l.i * Math.exp(-(x * x + (z - l.z) * (z - l.z)) / 4.5);
    return s;
  };
  const luzParede = (z, y = 2) => {
    let s = 0.62;
    for (const l of LAMPADAS) s += 0.8 * l.i * Math.exp(-((z - l.z) * (z - l.z)) / 6.5);
    return s * (0.6 + 0.4 * Math.exp(-((y - 2.4) * (y - 2.4)) / 3.5));
  };

  const poligono = (pts, cor, borda = true) => {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
    c.fillStyle = cor;
    c.fill();
    if (borda) {                       // fecha as frestas entre vizinhos
      c.strokeStyle = cor;
      c.lineWidth = 0.8;
      c.stroke();
    }
  };
  const linha = (a, b, cor, espessura) => {
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
    c.strokeStyle = cor;
    c.lineWidth = espessura;
    c.lineCap = 'round';
    c.stroke();
  };
  /** Um retângulo numa parede lateral (plano x fixo), entre z e y dados. */
  const naParede = (x, za, zb, y0, y1, cor) => poligono([P(x, y0, za), P(x, y1, za), P(x, y1, zb), P(x, y0, zb)], cor);
  /** Um retângulo de frente para a câmera (plano z fixo). */
  const deFrente = (xa, xb, y0, y1, z, cor) => poligono([P(xa, y0, z), P(xb, y0, z), P(xb, y1, z), P(xa, y1, z)], cor);
  /** Um retângulo deitado (plano y fixo). */
  const deitado = (xa, xb, y, za, zb, cor) => poligono([P(xa, y, za), P(xb, y, za), P(xb, y, zb), P(xa, y, zb)], cor);

  // ---- 1. o escuro do fundo ----------------------------------------------------
  c.fillStyle = css(NEVOA);
  c.fillRect(0, 0, W, H);

  // Parede do fundo com uma porta que deixa passar uma luz fria.
  deFrente(-MEIA, MEIA, 0, ALT, ZF, tom([20, 48, 62], ZF, 1));
  deFrente(-0.95, 0.95, 0, 2.8, ZF, 'rgba(126, 176, 176, 0.5)');

  // ---- 2. teto e piso ---------------------------------------------------------
  for (let i = N - 1; i >= 0; i--) {
    const za = Z0 + i * SEG;
    const zb = za + SEG;
    const zc = (za + zb) / 2;
    deitado(-MEIA, MEIA, ALT, za, zb, tom(TETO, zc, 0.7 + 0.5 * luzParede(zc, 4.4)));
  }

  const COLUNAS = 6;
  const LADO = (MEIA * 2) / COLUNAS;  // lado do ladrilho
  const zPerto = 0.62;
  for (let zi = Math.ceil((ZF - zPerto) / LADO) - 1; zi >= 0; zi--) {
    const za = zPerto + zi * LADO;
    const zb = Math.min(ZF, za + LADO);
    for (let xi = 0; xi < COLUNAS; xi++) {
      const xa = -MEIA + xi * LADO;
      const xb = xa + LADO;
      const claro = (xi + zi) % 2 === 0;
      const gasto = 0.84 + r() * 0.3;
      const l = luzPiso((xa + xb) / 2, (za + zb) / 2) * gasto;
      deitado(xa, xb, 0, za, zb, tom(claro ? PISO_CLARO : PISO_ESCURO, (za + zb) / 2, l));
    }
    // Faixas de segurança amarelas, já comidas pelo tempo.
    for (const x of [-1.62, 0.76]) {
      if (r() < 0.2) continue;
      const largura = 0.09;
      const ini = za + r() * 0.12;
      const fim = zb - r() * 0.16;
      deitado(x, x + largura, 0, ini, fim, tom(TINTA[1], (za + zb) / 2, luzPiso(x, za) * 0.95, 0.72));
    }
  }

  // ---- 3. paredes, vão por vão, do fundo para a frente -------------------------
  const formaNaParede = (x, zc, yc, raio, tipo, cor) => {
    const pts = [];
    if (tipo === 0) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        pts.push(P(x, yc + Math.sin(a) * raio, zc + Math.cos(a) * raio));
      }
    } else if (tipo === 1) {
      pts.push(P(x, yc + raio, zc), P(x, yc - raio * 0.8, zc + raio), P(x, yc - raio * 0.8, zc - raio));
    } else {
      const m = raio * 0.86;
      pts.push(P(x, yc - m, zc - m), P(x, yc + m, zc - m), P(x, yc + m, zc + m), P(x, yc - m, zc + m));
    }
    poligono(pts, cor, false);
  };
  const lasca = (x, z, y, raio, cor) => {
    const pts = [];
    const n = 5 + Math.floor(r() * 3);
    const giro = r() * 6.28;
    for (let k = 0; k < n; k++) {
      const a = giro + (k / n) * Math.PI * 2;
      const d = raio * (0.5 + r() * 0.7);
      pts.push(P(x, y + Math.sin(a) * d * 0.8, z + Math.cos(a) * d * 1.5));
    }
    poligono(pts, cor, false);
  };

  for (let i = N - 1; i >= 0; i--) {
    const za = Z0 + i * SEG;
    const zb = za + SEG;
    const zc = (za + zb) / 2;
    for (const lado of [-1, 1]) {
      const x = lado * MEIA;
      const variacao = 0.9 + r() * 0.2;
      const lAlta = luzParede(zc, 3) * variacao;
      const lBaixa = luzParede(zc, 0.8) * variacao;
      const reboco = tom(REBOCO, zc, lBaixa * 0.9);

      // parede alta: painéis que um dia tiveram cor de brinquedo, e o resto no petróleo
      const painel = TINTA[(i * 2 + (lado > 0 ? 3 : 1)) % 4];
      const corPainel = [PAREDE[0] * 0.68 + painel[0] * 0.32, PAREDE[1] * 0.68 + painel[1] * 0.32, PAREDE[2] * 0.68 + painel[2] * 0.32];
      naParede(x, za, zb, 1.27, 3.1, tom(corPainel, zc, lAlta));
      naParede(x, za, zb, 3.1, ALT, tom(PAREDE, zc, lAlta * 0.72));
      // barrado pintado com cor de brinquedo
      const cor = TINTA[(i + (lado > 0 ? 2 : 0)) % 4];
      naParede(x, za, zb, 0, 1.15, tom(cor, zc, lBaixa));
      naParede(x, za, zb, 1.15, 1.27, tom(CREME, zc, lBaixa * 0.62));
      // rodapé sujo
      naParede(x, za, zb, 0, 0.16, tom([8, 20, 28], zc, 1, 0.55));

      // forma grande pintada na parede alta (círculo, triângulo, quadrado)
      if ((i + (lado > 0 ? 1 : 0)) % 2 === 1 && i < 12) {
        const tipo = (Math.floor(i / 2) + (lado > 0 ? 1 : 0)) % 3;
        const corForma = TINTA[(i * 3 + (lado > 0 ? 1 : 3)) % 4];
        formaNaParede(x, zc, 2.3, 0.78, tipo, tom(corForma, zc, lAlta * 1.05, 0.62));
        for (let k = 0; k < 7; k++) {
          lasca(x, zc + (r() - 0.5) * 1.3, 2.3 + (r() - 0.5) * 1.3, 0.05 + r() * 0.13, tom(corPainel, zc, lAlta));
        }
      }

      // tinta descascada no barrado: aparece o reboco
      const lascas = i < 9 ? 12 : 5;
      for (let k = 0; k < lascas; k++) {
        lasca(x, za + r() * SEG, 0.12 + r() * 1.0, 0.03 + r() * 0.1, reboco);
      }
      // escorridos de umidade
      for (let k = 0; k < 3; k++) {
        const z = za + r() * SEG;
        const topo = 1.3 + r() * 2.6;
        naParede(x, z, z + 0.05 + r() * 0.07, topo - (0.5 + r() * 1.4), topo, tom([6, 16, 22], zc, 1, 0.3));
      }

      // porta com uma janelinha acesa (só uma, à esquerda)
      if (lado < 0 && i === 3) {
        naParede(x, za + 0.55, za + 1.75, 0, 2.25, tom([14, 34, 44], zc, lBaixa));
        naParede(x, za + 0.62, za + 1.68, 0.06, 2.18, tom([20, 46, 58], zc, lBaixa));
        naParede(x, za + 0.92, za + 1.38, 1.42, 1.92, tom([240, 190, 120], zc, 1, 0.75));
      }

      // pilastra que salta da parede
      const xp = lado * (MEIA - 0.16);
      const zn = za - 0.13;
      const zl = za + 0.13;
      poligono([P(xp, 0, zn), P(x, 0, zn), P(x, ALT, zn), P(xp, ALT, zn)], tom(PAREDE, za, luzParede(za, 2.4) * 1.12));
      poligono([P(xp, 0, zn), P(xp, ALT, zn), P(xp, ALT, zl), P(xp, 0, zl)], tom(PAREDE, za, luzParede(za, 2.4) * 0.58));
    }

    // viga e treliça no teto, na linha das pilastras
    const zv = za;
    const esp = Math.max(0.8, (f * 0.07) / zv);
    const corViga = tom([13, 32, 44], zv, 0.8 + 0.5 * luzParede(zv, 4));
    deitado(-MEIA, MEIA, ALT, zv - 0.13, zv + 0.13, tom([6, 18, 26], zv, 1));
    linha(P(-MEIA, ALT - 0.55, zv), P(MEIA, ALT - 0.55, zv), corViga, esp);
    const passos = 8;
    for (let k = 0; k < passos; k++) {
      const xa = -MEIA + (k / passos) * MEIA * 2;
      const xb = -MEIA + ((k + 1) / passos) * MEIA * 2;
      const sobe = k % 2 === 0;
      linha(P(xa, sobe ? ALT - 0.55 : ALT, zv), P(xb, sobe ? ALT : ALT - 0.55, zv), corViga, esp * 0.6);
    }
  }

  // ---- 4. o que há dentro do galpão, do fundo para a frente ---------------------
  const coisas = [];
  const por = (z, desenhar) => coisas.push({ z, desenhar });

  /** Uma caixa: frente, a lateral que dá para o meio do corredor e o tampo. */
  const caixa = (xa, xb, y0, y1, za, zb, cor, { luz = 1, tampo = 1.25, lateral = 0.62 } = {}) => {
    const zc = (za + zb) / 2;
    const xLat = (xa + xb) / 2 > 0 ? xa : xb;      // a face virada para o centro
    if (y1 < OLHO) deitado(xa, xb, y1, za, zb, tom(cor, zc, luz * tampo));
    poligono([P(xLat, y0, za), P(xLat, y1, za), P(xLat, y1, zb), P(xLat, y0, zb)], tom(cor, zc, luz * lateral));
    deFrente(xa, xb, y0, y1, za, tom(cor, za, luz));
  };

  // canos no alto, à esquerda
  for (let i = N - 1; i >= 0; i--) {
    const za = Math.max(0.7, Z0 + i * SEG - 0.02);
    const zb = Z0 + (i + 1) * SEG;
    const zc = (za + zb) / 2;
    por(zc + 0.9, () => {
      const l = 0.6 + 0.5 * luzParede(zc, 4);
      for (const cano of [
        { x: -1.86, y: 4.02, raio: 0.12, cor: TINTA[1] },
        { x: -1.5, y: 4.2, raio: 0.075, cor: [70, 96, 104] },
      ]) {
        poligono([
          P(cano.x, cano.y - cano.raio, za), P(cano.x, cano.y + cano.raio, za),
          P(cano.x, cano.y + cano.raio, zb), P(cano.x, cano.y - cano.raio, zb),
        ], tom(cano.cor, zc, l * 0.62));
        poligono([
          P(cano.x, cano.y + cano.raio * 0.1, za), P(cano.x, cano.y + cano.raio * 0.62, za),
          P(cano.x, cano.y + cano.raio * 0.62, zb), P(cano.x, cano.y + cano.raio * 0.1, zb),
        ], tom(cano.cor, zc, l * 1.05), false);
        // braçadeira
        linha(P(cano.x, ALT, za + 0.2), P(cano.x, cano.y + cano.raio, za + 0.2), tom([8, 20, 28], za, 1), Math.max(0.8, (f * 0.03) / za));
      }
    });
  }

  // o cabo vermelho na parede da direita, preso de pilastra em pilastra
  for (let i = N - 1; i >= 0; i--) {
    const za = Math.max(0.8, Z0 + i * SEG);
    const zb = Z0 + (i + 1) * SEG;
    por((za + zb) / 2 + 0.6, () => {
      const x = MEIA - 0.2;
      c.beginPath();
      for (let k = 0; k <= 24; k++) {
        const t = k / 24;
        const z = za + (zb - za) * t;
        const y = 3.34 - Math.sin(t * Math.PI) * 0.16;
        const p = P(x, y, z);
        if (k === 0) c.moveTo(p[0], p[1]);
        else c.lineTo(p[0], p[1]);
      }
      c.strokeStyle = tom(FIO, (za + zb) / 2, 0.55 + 0.5 * luzParede((za + zb) / 2, 3.3));
      c.lineWidth = Math.max(1.1, (f * 0.03) / ((za + zb) / 2));
      c.lineCap = 'round';
      c.stroke();
    });
  }

  // luminárias penduradas no eixo do corredor
  for (const l of LAMPADAS) {
    por(l.z, () => {
      const esp = Math.max(0.8, (f * 0.02) / l.z);
      linha(P(0, ALT, l.z), P(0, 3.78, l.z), tom([6, 16, 22], l.z, 1), esp);
      poligono([P(-0.1, 3.78, l.z), P(0.1, 3.78, l.z), P(0.36, 3.5, l.z), P(-0.36, 3.5, l.z)], tom([18, 40, 50], l.z, 0.9 + l.i * 0.5));
      const b = P(0, 3.47, l.z);
      const raio = (f * 0.11) / l.z;
      c.beginPath();
      c.ellipse(b[0], b[1], raio * 1.6, raio * 0.7, 0, 0, Math.PI * 2);
      c.fillStyle = `rgba(255, 232, 186, ${0.25 + l.i * 0.7})`;
      c.fill();
    });
  }

  // esteira comprida à direita
  const EX1 = 0.95;
  const EX2 = 1.98;
  const EY = 0.95;
  const EZ0 = 4.3;
  const EZ1 = 31;
  for (let z = EZ1 - 1.2; z >= EZ0 - 0.01; z -= 1.2) {
    const za = z;
    const zb = Math.min(EZ1, z + 1.2);
    por(za + 0.6, () => {
      const zc = (za + zb) / 2;
      const l = luzPiso(1.2, zc) * 0.9 + 0.2;
      // pés
      naParede(EX1 + 0.04, za + 0.08, za + 0.2, 0, 0.6, tom([10, 24, 32], zc, 1));
      // lona
      deitado(EX1, EX2, EY, za, zb, tom([16, 30, 38], zc, l * 1.25));
      for (let k = 0; k < 3; k++) {
        const zr = za + (k + 0.5) * 0.4;
        linha(P(EX1 + 0.04, EY, zr), P(EX2 - 0.04, EY, zr), tom([60, 84, 92], zr, l, 0.45), Math.max(0.6, (f * 0.012) / zr));
      }
      // lateral pintada de verde, com friso amarelo
      naParede(EX1, za, zb, 0.6, EY, tom([44, 96, 84], zc, l));
      naParede(EX1, za, zb, 0.86, EY, tom(TINTA[1], zc, l * 0.9));
      for (let k = 0; k < 2; k++) {
        const zr = za + (k + 0.5) * 0.6;
        const p = P(EX1, 0.73, zr);
        const raio = (f * 0.07) / zr;
        if (raio < 0.9) continue;
        c.beginPath();
        c.arc(p[0], p[1], raio, 0, Math.PI * 2);
        c.fillStyle = tom(CREME, zr, l * 0.55);
        c.fill();
      }
      for (let k = 0; k < 4; k++) lasca(EX1, za + r() * 1.2, 0.63 + r() * 0.2, 0.02 + r() * 0.05, tom([20, 44, 50], zc, l));
    });
  }
  // a ponta da esteira, de frente
  por(EZ0, () => {
    const l = luzPiso(1.7, EZ0) * 0.9 + 0.2;
    deFrente(EX1, EX2, 0.6, EY, EZ0, tom([36, 80, 70], EZ0, l * 0.8));
    deFrente(EX1 + 0.08, EX2 - 0.08, 0.68, 0.9, EZ0, tom([12, 24, 30], EZ0, l));
    deFrente(EX1 + 0.1, EX1 + 0.22, 0, 0.6, EZ0, tom([10, 24, 32], EZ0, 1));
    deFrente(EX2 - 0.22, EX2 - 0.1, 0, 0.6, EZ0, tom([10, 24, 32], EZ0, 1));
  });

  // brinquedos esquecidos em cima da esteira (blocos, uma bola)
  const naEsteira = [
    { z: 5.2, lado: 0.5, cor: TINTA[0], x: 1.42 },
    { z: 6.25, bola: 0.24, cor: TINTA[2], x: 1.58 },
    { z: 8.4, lado: 0.56, cor: TINTA[1], x: 1.5 },
    { z: 9.15, lado: 0.36, cor: TINTA[3], x: 1.32 },
    { z: 12.6, lado: 0.5, cor: TINTA[2], x: 1.46 },
    { z: 16.8, lado: 0.54, cor: TINTA[0], x: 1.5 },
    { z: 21.5, lado: 0.5, cor: TINTA[3], x: 1.44 },
    { z: 26.2, lado: 0.5, cor: TINTA[1], x: 1.48 },
  ];
  for (const b of naEsteira) {
    por(b.z, () => {
      const l = luzPiso(b.x, b.z) * 0.85 + 0.3;
      if (b.bola) {
        const p = P(b.x, EY + b.bola, b.z);
        const raio = (f * b.bola) / b.z;
        const g = c.createRadialGradient(p[0] - raio * 0.35, p[1] - raio * 0.4, raio * 0.1, p[0], p[1], raio);
        g.addColorStop(0, tom(b.cor, b.z, l * 1.5));
        g.addColorStop(1, tom(b.cor, b.z, l * 0.5));
        c.beginPath();
        c.arc(p[0], p[1], raio, 0, Math.PI * 2);
        c.fillStyle = g;
        c.fill();
        return;
      }
      const m = b.lado / 2;
      caixa(b.x - m, b.x + m, EY, EY + b.lado, b.z - m, b.z + m, b.cor, { luz: l });
      // a face da frente tem uma moldura mais clara, como bloco de montar
      deFrente(b.x - m * 0.62, b.x + m * 0.62, EY + b.lado * 0.19, EY + b.lado * 0.81, b.z - m, tom(b.cor, b.z, l * 1.28));
    });
  }

  // caixotes empilhados à esquerda, perto
  const MADEIRA = [70, 56, 46];
  const caixote = (xa, xb, y0, y1, za, zb, faixa) => {
    const l = luzPiso(xb, za) * 0.8 + 0.35;
    caixa(xa, xb, y0, y1, za, zb, MADEIRA, { luz: l });
    // ripas
    const n = 4;
    for (let k = 1; k < n; k++) {
      const y = y0 + ((y1 - y0) * k) / n;
      linha(P(xa, y, za), P(xb, y, za), tom([30, 24, 20], za, 1, 0.8), Math.max(0.8, (f * 0.012) / za));
    }
    deFrente(xa, xb, y0 + (y1 - y0) * 0.38, y0 + (y1 - y0) * 0.62, za, tom(faixa, za, l * 0.9, 0.85));
  };
  por(5.4, () => caixote(-2.26, -1.3, 0, 0.96, 4.95, 5.91, TINTA[2]));
  por(5.35, () => caixote(-2.16, -1.58, 0.96, 1.52, 5.05, 5.63, TINTA[0]));
  por(7.3, () => caixote(-2.24, -1.56, 0, 0.7, 6.95, 7.65, TINTA[3]));

  // uma máquina grande à esquerda, mais ao fundo, com funil e calha
  por(12.9, () => {
    const za = 11.3;
    const zb = 14.6;
    const xa = -2.28;
    const xb = -1.12;
    const l = luzParede(12.5, 1.6) + 0.15;
    const corpo = [22, 52, 62];
    caixa(xa, xb, 0, 2.9, za, zb, corpo, { luz: l, lateral: 0.7 });
    // funil no topo
    poligono([P(xa + 0.1, 2.9, za), P(xb - 0.1, 2.9, za), P(xb + 0.15, 3.7, za), P(xa - 0.1, 3.7, za)], tom(TINTA[0], za, l * 0.62));
    poligono([P(xb - 0.1, 2.9, za), P(xb + 0.15, 3.7, za), P(xb + 0.15, 3.7, za + 1.2), P(xb - 0.1, 2.9, za + 1.2)], tom(TINTA[0], za, l * 0.42));
    // painel, luzes e um mostrador
    deFrente(xa + 0.2, xb - 0.2, 1.3, 2.5, za, tom([12, 30, 38], za, l));
    const luzes = [[255, 96, 80], [246, 193, 45], [96, 220, 140]];
    luzes.forEach((cor, k) => {
      const p = P(xa + 0.42 + k * 0.22, 2.25, za);
      c.beginPath();
      c.arc(p[0], p[1], Math.max(1.2, (f * 0.045) / za), 0, Math.PI * 2);
      c.fillStyle = tom(cor, za, k === 2 ? 1 : 0.5);
      c.fill();
    });
    const m = P((xa + xb) / 2, 1.72, za);
    c.beginPath();
    c.arc(m[0], m[1], (f * 0.24) / za, 0, Math.PI * 2);
    c.fillStyle = tom(CREME, za, l * 0.5);
    c.fill();
    linha(m, P((xa + xb) / 2 + 0.13, 1.86, za), tom([20, 20, 24], za, 1), Math.max(0.8, (f * 0.02) / za));
    // calha que desce para o corredor
    poligono([P(xb, 1.5, za + 0.9), P(xb, 1.75, za + 0.9), P(xb + 0.9, 0.95, za + 0.9), P(xb + 0.9, 0.75, za + 0.9)], tom(TINTA[1], za, l * 0.7));
    poligono([P(xb, 1.5, za + 0.9), P(xb + 0.9, 0.75, za + 0.9), P(xb + 0.9, 0.75, za + 1.5), P(xb, 1.5, za + 1.5)], tom(TINTA[1], za, l * 0.42));
  });

  coisas.sort((a, b) => b.z - a.z);
  for (const coisa of coisas) coisa.desenhar();

  // ---- 5. luz: lâmpadas que mal acendem, poças no chão, poeira no ar ------------
  c.globalCompositeOperation = 'lighter';
  for (const l of LAMPADAS) {
    const b = P(0, 3.45, l.z);
    const raio = (f * 1.25) / l.z;
    const halo = c.createRadialGradient(b[0], b[1], 0, b[0], b[1], raio);
    halo.addColorStop(0, `rgba(255, 220, 160, ${0.5 * l.i})`);
    halo.addColorStop(0.25, `rgba(210, 190, 140, ${0.16 * l.i})`);
    halo.addColorStop(1, 'rgba(120, 150, 150, 0)');
    c.fillStyle = halo;
    c.fillRect(b[0] - raio, b[1] - raio, raio * 2, raio * 2);

    // cone de poeira iluminada
    const chaoA = P(-1.7, 0, l.z);
    const chaoB = P(1.7, 0, l.z);
    const cone = c.createLinearGradient(0, b[1], 0, chaoA[1]);
    cone.addColorStop(0, `rgba(190, 200, 170, ${0.1 * l.i})`);
    cone.addColorStop(1, 'rgba(150, 180, 170, 0)');
    poligono([P(-0.3, 3.5, l.z), P(0.3, 3.5, l.z), chaoB, chaoA], cone, false);

    // poça de luz no piso
    const centro = P(0, 0, l.z);
    const rx = (f * 2.3) / l.z;
    const ry = Math.max(2, (P(0, 0, l.z - 1.5)[1] - P(0, 0, l.z + 1.5)[1]) / 2);
    c.save();
    c.translate(centro[0], centro[1]);
    c.scale(1, ry / rx);
    const poca = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    poca.addColorStop(0, `rgba(170, 200, 190, ${0.2 * l.i})`);
    poca.addColorStop(1, 'rgba(120, 160, 160, 0)');
    c.fillStyle = poca;
    c.fillRect(-rx, -rx, rx * 2, rx * 2);
    c.restore();
  }
  // a luz fria do fundo vaza para o corredor
  const fundo = c.createRadialGradient(cx, cy + H * 0.012, 0, cx, cy + H * 0.012, W * 0.3);
  fundo.addColorStop(0, 'rgba(120, 176, 178, 0.34)');
  fundo.addColorStop(0.35, 'rgba(70, 120, 130, 0.12)');
  fundo.addColorStop(1, 'rgba(40, 80, 90, 0)');
  c.fillStyle = fundo;
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'source-over';

  // ---- 6. textura: poeira, riscos, manchas -------------------------------------
  for (let k = 0; k < 9000; k++) {
    const claro = r() < 0.5;
    c.fillStyle = claro ? `rgba(200, 220, 220, ${0.02 + r() * 0.05})` : `rgba(0, 6, 10, ${0.05 + r() * 0.12})`;
    c.fillRect(r() * W, r() * H, 1 + r() * 1.4, 1 + r() * 1.4);
  }
  for (let k = 0; k < 46; k++) {
    const x = r() * W;
    const y = r() * H;
    const a = (r() - 0.5) * 0.5 + (r() < 0.5 ? 0 : Math.PI / 2);
    const comp = 8 + r() * 46;
    linha([x, y], [x + Math.cos(a) * comp, y + Math.sin(a) * comp], `rgba(190, 214, 214, ${0.02 + r() * 0.04})`, 0.7);
  }
  for (let k = 0; k < 14; k++) {
    const x = r() * W;
    const y = H * 0.55 + r() * H * 0.45;
    const raio = 30 + r() * 110;
    const g = c.createRadialGradient(x, y, 0, x, y, raio);
    g.addColorStop(0, `rgba(2, 10, 14, ${0.14 + r() * 0.16})`);
    g.addColorStop(1, 'rgba(2, 10, 14, 0)');
    c.save();
    c.translate(x, y);
    c.scale(1, 0.3);
    c.translate(-x, -y);
    c.fillStyle = g;
    c.fillRect(x - raio, y - raio, raio * 2, raio * 2);
    c.restore();
  }

  // ---- 7. escurece as bordas: o texto vai por cima e o meio fica mais calmo -----
  const vinheta = c.createRadialGradient(cx, H * 0.5, W * 0.3, cx, H * 0.5, H * 0.78);
  vinheta.addColorStop(0, 'rgba(3, 10, 15, 0)');
  vinheta.addColorStop(1, 'rgba(3, 10, 15, 0.74)');
  c.fillStyle = vinheta;
  c.fillRect(0, 0, W, H);
  const topo = c.createLinearGradient(0, 0, 0, H * 0.2);
  topo.addColorStop(0, 'rgba(3, 10, 15, 0.55)');
  topo.addColorStop(1, 'rgba(3, 10, 15, 0)');
  c.fillStyle = topo;
  c.fillRect(0, 0, W, H * 0.2);
  const base = c.createLinearGradient(0, H * 0.78, 0, H);
  base.addColorStop(0, 'rgba(3, 10, 15, 0)');
  base.addColorStop(1, 'rgba(3, 10, 15, 0.6)');
  c.fillStyle = base;
  c.fillRect(0, H * 0.78, W, H * 0.22);

  return tela;
}
