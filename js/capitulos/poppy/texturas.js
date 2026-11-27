/* ============================================================================
   POPPY · texturas: tudo o que a fábrica veste, pintado em canvas 2D
   ============================================================================
   Cada função devolve um HTMLCanvasElement; quem chama (corredor.js) embrulha
   em CanvasTexture. Nenhuma textura tem letra: os textos do capítulo são HTML.
   ========================================================================== */

import { semente } from '../../nucleo/util.js';

export const CORES_TINTA = ['#d5503f', '#edb733', '#3b83c6', '#46a873']; // vermelho de brinquedo, amarelo, azul, verde

function tela(l, a) {
  const c = document.createElement('canvas');
  c.width = l;
  c.height = a;
  return [c, c.getContext('2d')];
}

function sujeira(g, l, a, acaso, n, cor = '20,26,30', forca = 0.05) {
  for (let i = 0; i < n; i += 1) {
    const x = acaso() * l;
    const y = acaso() * a;
    const r = 8 + acaso() * 60;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${cor},${forca + acaso() * forca})`);
    grad.addColorStop(1, `rgba(${cor},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
}

function coracao(g, x, y, t) {
  g.beginPath();
  g.moveTo(x, y + 0.34 * t);
  g.bezierCurveTo(x - 0.62 * t, y - 0.1 * t, x - 0.3 * t, y - 0.52 * t, x, y - 0.2 * t);
  g.bezierCurveTo(x + 0.3 * t, y - 0.52 * t, x + 0.62 * t, y - 0.1 * t, x, y + 0.34 * t);
  g.closePath();
}

function estrela(g, x, y, t) {
  g.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 ? 0.22 * t : 0.5 * t;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}

/** O piso xadrez: quatro ladrilhos (2 × 2 m), gastos. */
export function pintarPiso() {
  const [c, g] = tela(256, 256);
  const acaso = semente(11);
  for (let i = 0; i < 2; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      g.fillStyle = (i + j) % 2 ? '#e4dcc6' : '#33424d';
      g.fillRect(i * 128, j * 128, 128, 128);
    }
  }
  g.strokeStyle = 'rgba(12,18,22,0.5)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 128, 128);
  g.strokeRect(128, 128, 128, 128);
  g.strokeRect(128, 0, 128, 128);
  g.strokeRect(0, 128, 128, 128);
  sujeira(g, 256, 256, acaso, 26, '18,22,24', 0.07);
  for (let i = 0; i < 9; i += 1) {
    g.strokeStyle = `rgba(20,24,26,${0.12 + acaso() * 0.14})`;
    g.lineWidth = 1;
    g.beginPath();
    const x = acaso() * 256;
    const y = acaso() * 256;
    g.moveTo(x, y);
    g.lineTo(x + (acaso() - 0.5) * 50, y + (acaso() - 0.5) * 50);
    g.stroke();
  }
  return c;
}

/** Um trecho de parede (7 × 3,4 m): reboco creme, faixa de tinta descascando e um desenho de brinquedo desbotado. */
export function pintarParede(indice) {
  const L = 1024;
  const A = 512;
  const [c, g] = tela(L, A);
  const acaso = semente(31 + indice * 7);
  const cor = CORES_TINTA[indice % 4];

  const reboco = g.createLinearGradient(0, 0, 0, A);
  reboco.addColorStop(0, '#a9a48f');
  reboco.addColorStop(0.55, '#c9c2aa');
  reboco.addColorStop(1, '#b3ac95');
  g.fillStyle = reboco;
  g.fillRect(0, 0, L, A);

  // Painéis do reboco e escorridos.
  g.strokeStyle = 'rgba(40,44,40,0.16)';
  g.lineWidth = 2;
  for (let x = 0; x <= L; x += 256) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, A);
    g.stroke();
  }
  for (let i = 0; i < 16; i += 1) {
    const x = acaso() * L;
    const h = 60 + acaso() * 200;
    const esc = g.createLinearGradient(0, 0, 0, h);
    esc.addColorStop(0, 'rgba(46,44,36,0.2)');
    esc.addColorStop(1, 'rgba(46,44,36,0)');
    g.fillStyle = esc;
    g.fillRect(x, 0, 3 + acaso() * 9, h);
  }

  // O desenho desbotado, um por cor.
  const dx = 180 + acaso() * 600;
  const dy = 130;
  g.save();
  g.globalAlpha = 0.5;
  g.fillStyle = cor;
  g.strokeStyle = 'rgba(40,36,30,0.55)';
  g.lineWidth = 5;
  g.lineJoin = 'round';
  if (indice % 4 === 0) coracao(g, dx, dy, 130);
  else if (indice % 4 === 1) estrela(g, dx, dy, 140);
  else if (indice % 4 === 2) {
    g.beginPath();
    g.arc(dx, dy, 62, 0, Math.PI * 2);
  } else {
    g.beginPath();
    g.roundRect(dx - 58, dy - 58, 116, 116, 16);
  }
  g.fill();
  g.stroke();
  if (indice % 4 === 2) { // a bola sorri
    g.globalAlpha = 0.6;
    g.fillStyle = 'rgba(40,36,30,0.8)';
    g.beginPath();
    g.arc(dx - 20, dy - 12, 6, 0, Math.PI * 2);
    g.arc(dx + 20, dy - 12, 6, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(dx, dy + 6, 26, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  }
  g.restore();

  // A faixa de tinta: do rodapé até 1,25 m, com um filete por cima.
  const topo = A * (1 - 1.25 / 3.4);
  g.fillStyle = cor;
  g.fillRect(0, topo, L, A - topo);
  const sombra = g.createLinearGradient(0, topo, 0, A);
  sombra.addColorStop(0, 'rgba(255,255,255,0.12)');
  sombra.addColorStop(0.5, 'rgba(0,0,0,0)');
  sombra.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = sombra;
  g.fillRect(0, topo, L, A - topo);
  g.fillStyle = '#f1e9d2';
  g.fillRect(0, topo - 14, L, 8);
  g.fillStyle = cor;
  g.fillRect(0, topo - 30, L, 10);

  // A tinta descasca: manchas de reboco e de cimento por baixo.
  for (let i = 0; i < 46; i += 1) {
    const x = acaso() * L;
    const y = topo - 30 + acaso() * (A - topo + 20);
    const n = 5 + Math.floor(acaso() * 5);
    const r = 5 + acaso() * 26;
    g.fillStyle = acaso() < 0.6 ? '#c4bda5' : '#8d8a7c';
    g.beginPath();
    for (let k = 0; k < n; k += 1) {
      const a = (k / n) * Math.PI * 2;
      const rr = r * (0.55 + acaso() * 0.6);
      g.lineTo(x + Math.cos(a) * rr * 1.5, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.16)';
    g.lineWidth = 1;
    g.stroke();
  }

  // Rodapé escuro.
  g.fillStyle = '#27323a';
  g.fillRect(0, A - 22, L, 22);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(0, A - 22, L, 2);
  sujeira(g, L, A, acaso, 44, '22,26,28', 0.05);
  return c;
}

/** O teto: placas escuras. */
export function pintarTeto() {
  const [c, g] = tela(128, 128);
  const acaso = semente(5);
  g.fillStyle = '#39454d';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(8,12,16,0.7)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 128, 128);
  sujeira(g, 128, 128, acaso, 10, '10,14,18', 0.1);
  return c;
}

/** Uma porta lateral, clara para ser tingida por instância. */
export function pintarPorta() {
  const [c, g] = tela(256, 512);
  g.fillStyle = '#3a454c';
  g.fillRect(0, 0, 256, 512);
  g.fillStyle = '#efe9da';
  g.beginPath();
  g.roundRect(14, 14, 228, 498, [18, 18, 0, 0]);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(36, 230, 184, 250, 10);
  g.stroke();
  // Janelinha redonda, acesa por dentro.
  const luz = g.createRadialGradient(128, 120, 4, 128, 120, 56);
  luz.addColorStop(0, '#fff1c4');
  luz.addColorStop(1, '#c78f3c');
  g.fillStyle = luz;
  g.beginPath();
  g.arc(128, 120, 52, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#3a454c';
  g.lineWidth = 10;
  g.stroke();
  g.fillStyle = '#3a454c';
  g.fillRect(124, 68, 8, 104);
  g.fillRect(76, 116, 104, 8);
  // Maçaneta.
  g.fillStyle = '#d9b565';
  g.beginPath();
  g.arc(206, 300, 11, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** Uma folha do portão do fundo: listras de aviso embaixo e uma janela em arco. */
export function pintarPortao(espelhada) {
  const [c, g] = tela(256, 512);
  const acaso = semente(espelhada ? 71 : 53);
  g.fillStyle = espelhada ? '#3b83c6' : '#edb733';
  g.fillRect(0, 0, 256, 512);
  g.save();
  g.beginPath();
  g.rect(0, 420, 256, 92);
  g.clip();
  g.fillStyle = '#f1e9d2';
  g.fillRect(0, 420, 256, 92);
  g.fillStyle = '#27323a';
  for (let x = -120; x < 300; x += 64) {
    g.beginPath();
    g.moveTo(x, 512);
    g.lineTo(x + 92, 420);
    g.lineTo(x + 124, 420);
    g.lineTo(x + 32, 512);
    g.fill();
  }
  g.restore();
  g.fillStyle = '#fff3cf';
  g.beginPath();
  g.roundRect(64, 70, 128, 190, [64, 64, 12, 12]);
  g.fill();
  g.strokeStyle = '#27323a';
  g.lineWidth = 12;
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 5;
  g.strokeRect(10, 10, 236, 492);
  for (const [x, y] of [[26, 26], [230, 26], [26, 400], [230, 400], [26, 300], [230, 300]]) {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill();
  }
  sujeira(g, 256, 512, acaso, 16, '20,24,26', 0.07);
  return c;
}

/** A lona da esteira: setas apontando para a frente. */
export function pintarEsteira() {
  const [c, g] = tela(64, 64);
  g.fillStyle = '#2b3238';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#4b565e';
  g.lineWidth = 5;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(12, 40);
  g.lineTo(32, 20);
  g.lineTo(52, 40);
  g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 0, 64, 3);
  return c;
}

/** O brilho redondo de tudo o que é luz (halos, poças, poeira, faíscas). */
export function pintarBrilho() {
  const [c, g] = tela(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/** A frente da fita cassete de vídeo: etiqueta em branco e os dois carretéis. */
export function pintarFita() {
  const [c, g] = tela(512, 300);
  g.fillStyle = '#1c2228';
  g.fillRect(0, 0, 512, 300);
  g.strokeStyle = 'rgba(255,255,255,0.1)';
  g.lineWidth = 4;
  g.strokeRect(8, 8, 496, 284);
  g.fillStyle = '#f7ecd6';
  g.beginPath();
  g.roundRect(46, 28, 420, 96, 8);
  g.fill();
  g.fillStyle = '#edb733';
  g.fillRect(46, 28, 420, 16);
  g.strokeStyle = 'rgba(42,27,34,0.28)';
  g.lineWidth = 2;
  for (const y of [70, 96]) {
    g.beginPath();
    g.moveTo(66, y);
    g.lineTo(446, y);
    g.stroke();
  }
  g.fillStyle = '#0d1114';
  g.beginPath();
  g.roundRect(96, 150, 320, 112, 14);
  g.fill();
  for (const x of [176, 336]) {
    g.fillStyle = '#e8e2d2';
    g.beginPath();
    g.arc(x, 206, 40, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0d1114';
    for (let i = 0; i < 6; i += 1) {
      const a = (i * Math.PI) / 3;
      g.beginPath();
      g.arc(x + Math.cos(a) * 22, 206 + Math.sin(a) * 22, 6, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.arc(x, 206, 10, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}
