/* ============================================================================
   ENVELOPE: a carta de envelope, em 3D e na variante leve
   ============================================================================
   Duas versões com a mesma API (`env`): a 3D (three.js com ShaderMaterial) e a
   leve (DOM, SVG e CSS), usada quando `mundo.ok` é falso. Cada uma monta o
   corpo fechado de washi, o forro anil com pétalas de ouro, a aba de cima, o
   cordão (ou o fio) com laço, o lacre de cera dourada, a carta dobrada em três
   dentro e a animação de abrir (com faíscas de ouro junto das pétalas), que
   termina com a entrega do papel à folha DOM (o pergaminho).

   Escala real: 23 × 16 cm, em metros, para a pose do papel (a 0,6 m da lente,
   com o FOV da câmera) bater com o tamanho real. A luz é falsa, toda no shader
   e fixa no espaço da câmera (a cena não tem luzes): a chama de uma lanterna
   de cima, o luar frio que preenche e o papel aceso por dentro, como uma
   lanterna de papel, com a borda mais quente. Ela respira, não pisca.

   O arquivo não ouve nada sozinho: quem chama `atualizar` (por mundo.aoQuadro),
   `pressionar`, `chegar`, `abrir`, `entregarPapel`, `irEmbora` e `dispose` é a
   cena. `modo`: 'espera' (flutua, segue o ponteiro, convite) → 'abrindo' →
   'aberto' → 'entregando' → 'indo'. Avisos: aoMarco('lacre') e depois
   aoMarco('papel') (o som da cena depende da ordem).

   Exporta: criarEnvelope(mundo, opcoes), aquecerEnvelope(mundo, opcoes) e
   imagemDoTema(tema, largura). Opções: lacre ('coracao' | 'estrela' | null),
   amarracao ('cordao' | 'fio'), tema (null | 'poppy' | 'yourname') e chegada
   (só na leve: segundos da entrada automática, padrão 2; false espera chegar()).
   ========================================================================== */

import { clamp, el, svg, objetoLeve, vetorLeve, semente } from '../nucleo/util.js';
import { curvas, comoPromise } from '../nucleo/movimento.js';

/* ---- medidas (metros) ----------------------------------------------------------- */

const W = 0.23; // largura
const H = 0.16; // altura
const ROLO = 0.0032; // raio da borda enrolada: a borda afunda 3,2 mm
const BOJO = 0.0024; // o envelope estufa no meio (tem papel dentro)
const FUNDO_Z = -0.0042; // o forro (e a frente do envelope)
const ABA_L = 0.104; // a ponta da aba de cima fica em y ≈ H/2 − 0,104 = −0,024
const ABA_RAIO = 0.012;
const BOCA_Y = 0.004; // a ponta de baixo da boca em V
const FUNDO_Y = -0.014; // a ponta da aba de baixo
const FUNDO_RAIO = 0.012;
const LACRE_Y = -0.016; // centro do lacre e linha do cordão
const LACRE_R = 0.0142; // ~2,8 cm de diâmetro: é o convite ao toque
const CAMADA = 0.0009; // espessura de uma folha
const PAPEL_L = 0.205; // a carta inteira, dobrada em três dentro
const PAPEL_A = 0.405;
const PAPEL_Z = -0.0025;
const PAPEL_Y = -0.004;
const ABERTA = Math.PI * 1.1; // ~198°: a aba passa um pouco do plano
const TAU = Math.PI * 2;
const LUZ_DENTRO = 0.55; // a lanterna dentro do papel; o resto da luz vem de fora

/* ---- cores ------------------------------------------------------------------------ */

// Os tokens de DESIGN.md: washi, anil, ouro e o vermelho do fio (só o cordão).
const COR_ENVELOPE = '#f7ecd6'; // washi
const COR_CARTA = '#f7ecd6'; // a folha; reserva de --papel
const COR_FORRO = '#18204a'; // anil
const COR_CORDAO = '#e3283c'; // --fio
const COR_CERA = '#b8873c'; // cera de ouro: a luz leva ao --ouro, a sombra ao --ouro-escuro
const PETALAS_FORRO = ['rgba(233,194,122,0.34)', 'rgba(242,182,198,0.2)', 'rgba(246,220,166,0.22)'];

// base: a cor chapada da frente do envelope (vista quando ele gira);
// borda: multiplica o brilho de borda.
const TEMAS = {
  poppy: { base: '#0d2534', cordao: ['#e3283c', '#f4c430'], cera: '#c0913f', borda: 0.35 },
  yourname: { base: '#2c2468', cordao: ['#e3283c', '#f39a3d'], cera: '#c98f2c', borda: 0.4 },
};

/* ---- o laço, em volta de (0, LACRE_Y); [x, y] relativos ao centro ----------------- */

const LACO_CORDAO = {
  alcas: [
    [[-0.004, 0.002], [-0.014, 0.010], [-0.027, 0.015], [-0.036, 0.010], [-0.035, 0.001], [-0.025, -0.002], [-0.012, -0.001], [-0.004, 0]],
    [[0.004, 0], [0.013, 0.009], [0.026, 0.013], [0.035, 0.007], [0.033, -0.002], [0.022, -0.003], [0.011, -0.001], [0.004, 0.002]],
  ],
  caudas: [
    [[-0.003, -0.003], [-0.010, -0.014], [-0.015, -0.026], [-0.013, -0.036]],
    [[0.003, -0.003], [0.011, -0.015], [0.019, -0.027], [0.025, -0.035]],
  ],
};
const LACO_FIO = {
  alcas: [
    [[0, 0.001], [-0.006, 0.006], [-0.016, 0.009], [-0.023, 0.004], [-0.019, -0.002], [-0.009, -0.001], [0, 0]],
    [[0, 0], [0.007, 0.007], [0.017, 0.010], [0.024, 0.005], [0.021, -0.002], [0.010, -0.001], [0, 0.001]],
  ],
  perna: [[-0.001, -0.001], [-0.006, -0.010], [-0.010, -0.019], [-0.009, -0.026]],
  // a cauda longa desce além da borda de baixo: é por ela que chega o fio do caminho
  cauda: [[0.001, -0.001], [0.005, -0.015], [0.004, -0.035], [0.002, -0.052]],
};
const relativo = (pts, y = LACRE_Y) => pts.map(([x, yy]) => [x, y + yy]);

/* ---- estado de módulo ----------------------------------------------------------- */

const telas = new Map(); // canvas das texturas, gerados uma vez por chave
const aquecidos = []; // { chave, mundo, env }: cartas 3D pré-aquecidas
const urlsTema = new Map(); // a face do tema em JPEG, para a leve
let contadorLeve = 0;

const temaValido = (t) => (t === 'poppy' || t === 'yourname' ? t : null);

// undefined vira o coração (o padrão); null, false ou '' tiram o lacre.
function normalizar(opcoes) {
  const l = opcoes?.lacre;
  return {
    lacre: l === undefined ? 'coracao' : l === 'estrela' ? 'estrela' : l ? 'coracao' : null,
    amarracao: opcoes?.amarracao === 'fio' ? 'fio' : 'cordao',
    tema: temaValido(opcoes?.tema),
  };
}

// Toda opção que muda a carta entra na chave; senão criarEnvelope entregaria a carta errada.
const chaveDe = (opcoes) => {
  const n = normalizar(opcoes);
  return `${n.lacre}|${n.amarracao}|${n.tema || ''}`;
};

/** A cor --papel do DOM: o papel 3D chega nela, e a troca com a folha fica invisível. */
function corDoPapelCss() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--papel').trim();
    if (/^#(?:[0-9a-f]{6}|[0-9a-f]{3})$/i.test(v)) return v;
  } catch {
    /* sem estilo calculado */
  }
  return COR_CARTA;
}

/* ---- a forma do verso ------------------------------------------------------------ */

/** Altura do verso no ponto: bojo parabólico e borda que afunda num arredondado. */
function zCorpo(x, y) {
  const u = (2 * x) / W;
  const v = (2 * y) / H;
  let z = BOJO * Math.max(0, 1 - u * u) * Math.max(0, 1 - v * v);
  const d = Math.min(W / 2 - Math.abs(x), H / 2 - Math.abs(y));
  if (d < ROLO) {
    const q = ROLO - Math.max(0, d);
    z -= ROLO - Math.sqrt(Math.max(0, ROLO * ROLO - q * q));
  }
  return z;
}

/** 0 a 1: quanto a aba de cima (fechada) cobre o ponto, com borda suave de 2 mm. */
function cobertoPelaAba(x, y) {
  const sx = Math.hypot(x, ABA_RAIO);
  const borda = ABA_L * (1 - (sx - ABA_RAIO) / (W / 2));
  return clamp((borda - (H / 2 - y)) / 0.002 + 0.5);
}

/** Onde o cordão deita: o verso mais uma folha onde a aba cobre. */
const zSuperficie = (x, y) => zCorpo(x, y) + cobertoPelaAba(x, y) * CAMADA;

/* ---- texturas de canvas (geradas uma vez, guardadas por chave) ------------------- */

function tela(chave, gerar) {
  if (!telas.has(chave)) telas.set(chave, gerar());
  return telas.get(chave);
}

function novaTela(largura, altura, lida = false) {
  const c = document.createElement('canvas');
  c.width = largura;
  c.height = altura;
  // A fibra lê o grão de volta na CPU.
  return { c, g: c.getContext('2d', lida ? { willReadFrequently: true } : undefined) };
}

/**
 * Chama desenhar(ox, oy) nas nove cópias do ladrilho, para o desenho repetir
 * sem costura. Com `alcance`, pula as cópias que cairiam fora (o resultado é o
 * mesmo pixel a pixel, e a fibra fica ~5x mais barata de gerar no iPhone).
 */
function emVolta(tam, desenhar, x = 0, y = 0, alcance) {
  for (const ox of [-tam, 0, tam]) {
    for (const oy of [-tam, 0, tam]) {
      if (alcance !== undefined) {
        const px = x + ox;
        const py = y + oy;
        if (px + alcance < 0 || px - alcance > tam || py + alcance < 0 || py - alcance > tam) continue;
      }
      desenhar(ox, oy);
    }
  }
}

/** A fibra do papel: relevo em tons de cinza; só o canal R entra no shader, como altura. */
function telaFibra(tam) {
  return tela(`fibra:${tam}`, () => {
    const { c, g } = novaTela(tam, tam, true);
    const rnd = semente(23);
    g.fillStyle = 'rgb(128,128,128)';
    g.fillRect(0, 0, tam, tam);

    for (let i = 0; i < 70; i++) {
      const x = rnd() * tam;
      const y = rnd() * tam;
      const r = (0.04 + 0.12 * rnd()) * tam;
      const claro = rnd() > 0.5;
      emVolta(tam, (ox, oy) => {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, claro ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)');
        gr.addColorStop(1, 'rgba(128,128,128,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }, x, y, r);
    }

    const n = Math.round(tam * tam * 0.012);
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = rnd() * tam;
      const y = rnd() * tam;
      const ang = rnd() * TAU;
      const comp = (0.008 + 0.03 * rnd()) * tam;
      const curva = (rnd() - 0.5) * comp * 0.6;
      const claro = rnd() > 0.45;
      const alfa = claro ? 0.08 + 0.12 * rnd() : 0.05 + 0.08 * rnd();
      const largura = 0.5 + 0.9 * rnd();
      const dx = Math.cos(ang) * comp;
      const dy = Math.sin(ang) * comp;
      const mx = x + dx / 2 - Math.sin(ang) * curva;
      const my = y + dy / 2 + Math.cos(ang) * curva;
      g.strokeStyle = claro ? `rgba(255,255,255,${alfa.toFixed(3)})` : `rgba(0,0,0,${alfa.toFixed(3)})`;
      g.lineWidth = largura;
      emVolta(tam, (ox, oy) => {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.quadraticCurveTo(mx + ox, my + oy, x + dx + ox, y + dy + oy);
        g.stroke();
      }, x, y, comp * 1.6 + 2);
    }

    // O grão: um sorteio por pixel, a alfa intacta.
    const imagem = g.getImageData(0, 0, tam, tam);
    const d = imagem.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] + (rnd() - 0.5) * 18;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
    g.putImageData(imagem, 0, 0);
    return c;
  });
}

/** Uma pétala com entalhe no topo, de (0, r) para cima, no canvas já posicionado. */
function caminhoPetala(g, r) {
  g.beginPath();
  g.moveTo(0, r);
  g.bezierCurveTo(-0.95 * r, 0.3 * r, -0.78 * r, -0.95 * r, -0.12 * r, -0.92 * r);
  g.lineTo(0, -0.7 * r);
  g.lineTo(0.12 * r, -0.92 * r);
  g.bezierCurveTo(0.78 * r, -0.95 * r, 0.95 * r, 0.3 * r, 0, r);
  g.closePath();
}

/** O forro: anil, como o céu da alameda, com pétalas de ouro e pontos de estrela, sem costura. */
function telaForro(tam) {
  return tela(`forro:${tam}`, () => {
    const { c, g } = novaTela(tam, tam);
    const rnd = semente(1223);
    g.fillStyle = COR_FORRO;
    g.fillRect(0, 0, tam, tam);
    for (let i = 0; i < 22; i++) {
      const x = rnd() * tam;
      const y = rnd() * tam;
      const r = (0.035 + 0.03 * rnd()) * tam;
      const ang = rnd() * TAU;
      const cor = PETALAS_FORRO[Math.floor(rnd() * PETALAS_FORRO.length)];
      emVolta(tam, (ox, oy) => {
        g.save();
        g.translate(x + ox, y + oy);
        g.rotate(ang);
        g.fillStyle = cor;
        caminhoPetala(g, r);
        g.fill();
        g.restore();
      });
    }
    for (let i = 0; i < 30; i++) {
      const x = rnd() * tam;
      const y = rnd() * tam;
      const r = (0.003 + 0.004 * rnd()) * tam;
      g.fillStyle = `rgba(246,220,166,${(0.35 + 0.4 * rnd()).toFixed(2)})`;
      emVolta(tam, (ox, oy) => {
        circulo(g, x + ox, y + oy, r);
        g.fill();
      }, x, y, r);
    }
    return c;
  });
}

function retArred(g, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

function circulo(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, Math.max(0, r), 0, TAU);
}

/** A face Poppy: uma fita de vídeo de brinquedo, com etiqueta colada. */
function desenharPoppy(g, w, h) {
  const rnd = semente(4411);
  const fundo = g.createLinearGradient(0, 0, 0, h);
  fundo.addColorStop(0, '#12334a');
  fundo.addColorStop(1, '#0a1d2a');
  g.fillStyle = fundo;
  g.fillRect(0, 0, w, h);

  // A "interferência" é parada: só linhas de varredura.
  const passo = Math.max(3, Math.round(h / 90));
  const faixa = Math.max(1, passo * 0.35);
  g.fillStyle = 'rgba(255,255,255,0.035)';
  for (let y = 0; y < h; y += passo) g.fillRect(0, y, w, faixa);

  retArred(g, 0.035 * w, 0.05 * h, 0.93 * w, 0.9 * h, 0.02 * w);
  g.strokeStyle = 'rgba(233,194,122,0.22)';
  g.lineWidth = Math.max(1, 0.004 * w);
  g.stroke();

  const cy = 0.6 * h;
  const jh = 0.36 * h;
  retArred(g, 0.1 * w, cy - jh / 2, 0.8 * w, jh, 0.05 * h);
  g.fillStyle = '#061521';
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.stroke();

  const r = 0.135 * h;
  for (const [lado, cheio, ate, giro] of [[-1, 1.18, 1.15, 0.3], [1, 0.98, 0.96, 0.9]]) {
    const cx = w / 2 + lado * 0.25 * w;
    g.fillStyle = '#1b1210';
    circulo(g, cx, cy, cheio * r);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = Math.max(1, 0.012 * r);
    for (let k = 0.78; k <= ate + 1e-6; k += 0.1) {
      circulo(g, cx, cy, k * r);
      g.stroke();
    }
    g.fillStyle = '#f3ead8';
    circulo(g, cx, cy, 0.7 * r);
    g.fill();
    g.fillStyle = '#061521';
    circulo(g, cx, cy, 0.3 * r);
    g.fill();
    for (let i = 0; i < 6; i++) {
      g.save();
      g.translate(cx, cy);
      g.rotate((i / 6) * TAU + giro);
      g.fillRect(0.3 * r, -0.045 * r, 0.2 * r, 0.09 * r);
      g.restore();
    }
  }

  const cores = ['#e23b3b', '#f4c430', '#2f86d9', '#3fae5a'];
  cores.forEach((cor, i) => {
    g.fillStyle = cor;
    g.fillRect(0.035 * w, 0.845 * h + i * 0.026 * h, 0.93 * w, 0.026 * h * 0.82);
  });

  const ex = 0.33 * w;
  const ey = 0.085 * h;
  const ew = 0.34 * w;
  const eh = 0.2 * h;
  g.save();
  g.translate(ex + ew / 2, ey + eh / 2);
  g.rotate(-0.02);
  g.translate(-(ex + ew / 2), -(ey + eh / 2));
  retArred(g, ex, ey, ew, eh, 0.018 * h);
  g.fillStyle = '#f3ead8';
  g.fill();
  g.fillStyle = 'rgba(13,37,52,0.75)';
  for (let i = 0; i < 2; i++) {
    g.fillRect(ex + 0.1 * ew, ey + eh * (0.5 + 0.2 * i), ew * (0.8 - 0.28 * i), Math.max(1, 0.045 * eh));
  }
  cores.forEach((cor, i) => {
    g.fillStyle = cor;
    circulo(g, ex + ew * (0.14 + 0.105 * i), ey + 0.27 * eh, 0.085 * eh);
    g.fill();
  });
  g.restore();

  for (let i = 0; i < 90; i++) {
    const alfa = 0.03 + 0.06 * rnd();
    const x = rnd() * w;
    const y = rnd() * h;
    const largura = 1 + 2 * rnd();
    g.fillStyle = `rgba(255,255,255,${alfa.toFixed(3)})`;
    g.fillRect(x, y, largura, 1);
  }
}

/** A face Your Name: o céu do entardecer, o cometa que se divide, as serras e o lago. */
function desenharYourName(g, w, h) {
  const rnd = semente(2016);
  const ceu = g.createLinearGradient(0, 0, 0, h);
  ceu.addColorStop(0, '#090e33');
  ceu.addColorStop(0.42, '#3b2f80');
  ceu.addColorStop(0.66, '#8a4c97');
  ceu.addColorStop(0.82, '#d5809a');
  ceu.addColorStop(1, '#ffd1a1');
  g.fillStyle = ceu;
  g.fillRect(0, 0, w, h);

  for (let i = 0; i < 150; i++) {
    const x = rnd() * w;
    const y = rnd() ** 1.5 * 0.72 * h;
    const r = (0.6 + 1.5 * rnd()) * (w / 1024);
    const alfa = (0.25 + 0.7 * rnd()) * (1 - y / (0.8 * h));
    g.fillStyle = `rgba(255,255,255,${Math.max(0, alfa).toFixed(3)})`;
    circulo(g, x, y, r);
    g.fill();
  }

  // A cauda afina até a cabeça (com uma barriga de 0,4 da largura no meio).
  const cauda = (x0, y0, x1, y1, largura, paradas) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L;
    const ny = dx / L;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    for (const [o, cor] of paradas) gr.addColorStop(o, cor);
    g.beginPath();
    g.moveTo(x0 + (nx * largura) / 2, y0 + (ny * largura) / 2);
    g.quadraticCurveTo(mx + nx * largura * 0.4, my + ny * largura * 0.4, x1, y1);
    g.quadraticCurveTo(mx - nx * largura * 0.4, my - ny * largura * 0.4, x0 - (nx * largura) / 2, y0 - (ny * largura) / 2);
    g.closePath();
    g.fillStyle = gr;
    g.fill();
  };
  cauda(1.02 * w, 0.02 * h, 0.2 * w, 0.47 * h, 0.022 * h, [
    [0, 'rgba(120,170,255,0)'], [0.45, 'rgba(140,190,255,0.5)'], [0.85, 'rgba(210,235,255,0.92)'], [1, '#ffffff'],
  ]);
  cauda(0.86 * w, 0.14 * h, 0.33 * w, 0.53 * h, 0.009 * h, [
    [0, 'rgba(255,170,200,0)'], [0.6, 'rgba(255,190,205,0.55)'], [1, 'rgba(255,240,235,0.95)'],
  ]);
  const cabeca = g.createRadialGradient(0.2 * w, 0.47 * h, 0, 0.2 * w, 0.47 * h, 0.12 * h);
  cabeca.addColorStop(0, 'rgba(255,255,255,0.95)');
  cabeca.addColorStop(0.25, 'rgba(200,225,255,0.5)');
  cabeca.addColorStop(1, 'rgba(160,200,255,0)');
  g.fillStyle = cabeca;
  g.fillRect(0.2 * w - 0.12 * h, 0.47 * h - 0.12 * h, 0.24 * h, 0.24 * h);

  const serra = (base, alt, cor, f) => {
    g.beginPath();
    g.moveTo(0, h);
    for (let i = 0; i <= 24; i++) {
      const y = base - alt * (0.5 + 0.5 * Math.sin(i * 0.9 + f) * Math.cos(i * 0.37 + 2 * f)) - 0.3 * alt * Math.sin(i * 2.3 + f);
      g.lineTo((i / 24) * w, y);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fillStyle = cor;
    g.fill();
  };
  serra(0.9 * h, 0.07 * h, 'rgba(74,45,110,0.75)', 0.6);

  const lago = g.createLinearGradient(0, 0.9 * h, 0, h);
  lago.addColorStop(0, 'rgba(255,214,170,0.85)');
  lago.addColorStop(1, 'rgba(214,128,154,0.7)');
  g.beginPath();
  g.ellipse(0.5 * w, 0.955 * h, 0.3 * w, 0.03 * h, 0, 0, TAU);
  g.fillStyle = lago;
  g.fill();

  serra(0.985 * h, 0.06 * h, '#1c1445', 2.1);
}

/**
 * O acabamento de noite das faces: a luz de uma lanterna que vem de baixo, um
 * canto de céu que escurece em cima e um filete de ouro, como papel dourado à mão.
 */
function acabamentoNoite(g, w, h) {
  const chama = g.createRadialGradient(0.5 * w, 1.15 * h, 0, 0.5 * w, 1.15 * h, 0.95 * h);
  chama.addColorStop(0, 'rgba(255,180,94,0.2)');
  chama.addColorStop(1, 'rgba(255,180,94,0)');
  g.fillStyle = chama;
  g.fillRect(0, 0, w, h);
  const ceu = g.createLinearGradient(0, 0, 0, 0.35 * h);
  ceu.addColorStop(0, 'rgba(6,9,20,0.28)');
  ceu.addColorStop(1, 'rgba(6,9,20,0)');
  g.fillStyle = ceu;
  g.fillRect(0, 0, w, 0.35 * h);
  const m = 0.022 * w;
  g.lineWidth = Math.max(1, 0.0035 * w);
  g.strokeStyle = 'rgba(233,194,122,0.78)';
  retArred(g, m, m, w - 2 * m, h - 2 * m, 0.014 * w);
  g.stroke();
  g.lineWidth = Math.max(1, 0.0015 * w);
  g.strokeStyle = 'rgba(246,220,166,0.42)';
  retArred(g, 1.6 * m, 1.6 * m, w - 3.2 * m, h - 3.2 * m, 0.01 * w);
  g.stroke();
}

/** A face de um tema, na proporção do envelope (altura = largura · H/W). */
function telaTema(tema, larg) {
  return tela(`tema:${tema}:${larg}`, () => {
    const alt = Math.round((larg * H) / W);
    const { c, g } = novaTela(larg, alt);
    if (tema === 'poppy') desenharPoppy(g, larg, alt);
    else desenharYourName(g, larg, alt);
    acabamentoNoite(g, larg, alt);
    return c;
  });
}

/** O relevo do sinete: piso rebaixado, aro e a marca (coração ou estrela) por cima. */
function telaSinete(tipo, tam) {
  return tela(`sinete:${tipo}:${tam}`, () => {
    const { c, g } = novaTela(tam, tam);
    const m = tam / 2;
    g.fillStyle = 'rgb(90,90,90)';
    g.fillRect(0, 0, tam, tam);

    g.strokeStyle = 'rgba(255,255,255,0.09)';
    for (let i = 9; i >= 1; i--) {
      g.lineWidth = i * tam * 0.006;
      circulo(g, m, m, tam * 0.445);
      g.stroke();
    }

    const marca = () => {
      g.beginPath();
      if (tipo === 'estrela') {
        for (let i = 0; i < 10; i++) {
          const r = (i % 2 ? 0.2 : 0.47) * tam * 0.5;
          const a = (i / 10) * TAU - Math.PI / 2;
          const x = m + Math.cos(a) * r;
          const y = m + 0.02 * tam + Math.sin(a) * r;
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
      } else {
        const s = 0.27 * tam;
        const cy = m + 0.03 * tam;
        g.moveTo(m, cy + 0.95 * s);
        g.bezierCurveTo(m - 1.55 * s, cy + 0.05 * s, m - 1.05 * s, cy - 1.15 * s, m, cy - 0.42 * s);
        g.bezierCurveTo(m + 1.05 * s, cy - 1.15 * s, m + 1.55 * s, cy + 0.05 * s, m, cy + 0.95 * s);
      }
      g.closePath();
    };
    g.strokeStyle = 'rgba(255,255,255,0.075)';
    g.lineJoin = 'round';
    for (let i = 12; i >= 1; i--) {
      g.lineWidth = i * tam * 0.0065;
      marca();
      g.stroke();
    }
    g.fillStyle = 'rgb(236,236,236)';
    marca();
    g.fill();
    return c;
  });
}

/** A face do tema (para o bolso e a bolsa), cacheada por tema e largura; null se não der. */
export function imagemDoTema(tema, largura = 512) {
  if (!temaValido(tema)) return null;
  try {
    const larg = Math.max(16, Math.round(Number(largura) || 512));
    return telaTema(tema, larg);
  } catch (erro) {
    console.error('[carta] a face do tema', erro);
    return null;
  }
}

/* ============================================================================
   GLSL
   As medidas vêm do JS por `f()`; os literais dentro do GLSL (0.0014, 13, 38…)
   não mudam junto: quem mexer numa medida confere os dois lados.
   ========================================================================== */

const f = (n) => `(${n.toFixed(6)})`;

const GLSL_MEDIDAS = /* glsl */ `
#define W ${f(W)}
#define H ${f(H)}
#define ROLO ${f(ROLO)}
#define BOJO ${f(BOJO)}
#define CAMADA ${f(CAMADA)}
#define ABA_L ${f(ABA_L)}
#define ABA_RAIO ${f(ABA_RAIO)}
#define BOCA_Y ${f(BOCA_Y)}
#define FUNDO_Y ${f(FUNDO_Y)}
#define FUNDO_RAIO ${f(FUNDO_RAIO)}
#define LACRE_R ${f(LACRE_R)}
#define PAPEL_A ${f(PAPEL_A)}
`;

// Luz falsa, no espaço da câmera: a chama de uma lanterna pendurada acima e à
// esquerda (uLuzDir), o luar frio que preenche e o papel aceso por dentro.
// Cores lineares. Relevo por derivadas de tela; a fuga para a cor da névoa.
const GLSL_COMUM = /* glsl */ `
uniform vec3 uLuzDir;
uniform float uLuz;
uniform float uDentro;
uniform float uBranco;
uniform vec3 uCorBranco;
const vec2 LUZ2 = vec2(-0.54, 0.84);
const vec3 CHAMA = vec3(1.0, 0.7, 0.42);
const vec3 LUAR = vec3(0.6, 0.66, 0.95);
const vec3 DENTRO = vec3(1.0, 0.9, 0.76);
const vec3 BRASA = vec3(1.0, 0.42, 0.12);
const vec3 OURO = vec3(0.815, 0.539, 0.195);
const vec3 OURO_CLARO = vec3(0.922, 0.716, 0.381);
const vec3 FIO_BRILHO = vec3(1.0, 0.051, 0.076);

// De fora: o luar de cima e a chama, que também contorna o papel visto de lado.
vec3 luzPapel(vec3 N, vec3 V) {
  float ceu = 0.5 + 0.5 * N.y;
  float difusa = clamp((dot(N, uLuzDir) + 0.35) / 1.35, 0.0, 1.0);
  float rasante = pow(max(1.0 - abs(dot(N, V)), 0.0), 3.0);
  return LUAR * (0.2 + 0.14 * ceu) + uLuz * CHAMA * (0.5 * difusa + 0.3 * rasante);
}

// De dentro: contra a luz a fibra aparece (mais fibra, menos luz) e cada folha
// a mais segura um pouco dela (camadas = 1 é uma folha só).
vec3 luzDentro(float fibra, float camadas) {
  return DENTRO * uDentro * (0.86 + 1.6 * (fibra - 0.5)) * camadas;
}

// A beira acende quente, como a de uma lanterna de papel.
vec3 bordaQuente(vec2 p) {
  float d = min(W * 0.5 - abs(p.x), H * 0.5 - abs(p.y));
  return BRASA * uDentro * 0.32 * exp(-max(d, 0.0) / 0.006);
}

// As derivadas são tomadas no topo do main, antes de qualquer discard.
vec3 relevo(vec3 N, vec3 dpx, vec3 dpy, float dhx, float dhy) {
  vec3 r1 = cross(dpy, N);
  vec3 r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  if (abs(det) < 1e-24) return N;
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * N - grad);
}

float caimento(vec2 p) {
  float k = dot(p / vec2(W * 0.5, H * 0.5), vec2(-0.55, 0.83));
  return 0.95 + 0.065 * clamp(k * 0.5 + 0.5, 0.0, 1.0);
}

vec3 acabar(vec3 cor) { return mix(cor, uCorBranco, uBranco); }
float fotoAtras() { return smoothstep(0.02, 0.4, length(vec3(1.0) - uCorBranco)); }
float presenca() { return 1.0 - uBranco * fotoAtras(); }
`;

// Distâncias assinadas às bordas, em metros; `e` é a direção para fora.
const GLSL_FORMAS = /* glsl */ `
float boca(vec2 p, out vec2 e) {
  float m = (H * 0.5 - BOCA_Y) / (W * 0.5);
  float n = sqrt(1.0 + m * m);
  e = vec2(-m * sign(p.x), 1.0) / n;
  return (BOCA_Y + m * abs(p.x) - p.y) / n;
}

float abaFundo(vec2 p, out vec2 e) {
  float k = FUNDO_RAIO;
  float sx = sqrt(p.x * p.x + k * k);
  float alto = FUNDO_Y + H * 0.5;
  float yl = -H * 0.5 + alto * (1.0 - (sx - k) / (W * 0.5));
  float incl = -alto / (W * 0.5) * p.x / sx;
  float n = sqrt(1.0 + incl * incl);
  e = vec2(-incl, 1.0) / n;
  return (p.y - yl) / n;
}

// q = (x, s), s = distância da dobradiça; > 0 além da ponta.
float abaCima(vec2 q, out vec2 e) {
  float k = ABA_RAIO;
  float sx = sqrt(q.x * q.x + k * k);
  float borda = ABA_L * (1.0 - (sx - k) / (W * 0.5));
  float incl = -ABA_L / (W * 0.5) * q.x / sx;
  float n = sqrt(1.0 + incl * incl);
  e = vec2(-incl, 1.0) / n;
  return (q.y - borda) / n;
}
`;

// As sombras de contato do cordão (duas linhas) e do lacre, deslocadas pela luz.
const GLSL_SOMBRAS = /* glsl */ `
uniform vec4 uLinha0;
uniform vec4 uLinha1;
uniform float uSombraFio;
uniform float uSombraLacre;
uniform vec3 uLacre;

float sombraLinha(vec4 l, vec2 q) {
  if (l.w <= 0.0) return 0.0;
  return 0.26 * (1.0 - smoothstep(l.w * 0.4, l.w * 3.2, abs(dot(l.xy, q) + l.z)));
}

float sombrasDeCima(vec2 p) {
  vec2 q = p + LUZ2 * 0.0022;
  float s = (sombraLinha(uLinha0, q) + sombraLinha(uLinha1, q)) * uSombraFio;
  vec2 ql = p + LUZ2 * 0.0036;
  return s + uSombraLacre * 0.38 * (1.0 - smoothstep(LACRE_R * 0.7, LACRE_R * 1.55, length(ql - uLacre.xy)));
}

// O fio brilha: um halo vermelho leve no papel, ao longo das voltas; some com elas.
vec3 haloFio(vec2 p) {
  float d0 = uLinha0.w > 0.0 ? abs(dot(uLinha0.xy, p) + uLinha0.z) : 1.0;
  float d1 = uLinha1.w > 0.0 ? abs(dot(uLinha1.xy, p) + uLinha1.z) : 1.0;
  return FIO_BRILHO * 0.16 * exp(-min(d0, d1) / 0.0032) * uSombraFio;
}
`;

// Com a foto da alameda atrás, a carta longe na névoa some por transparência,
// em vez de virar um cartão chapado da cor da névoa por cima da foto.
const GLSL_SAIDA = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #ifdef USE_FOG
    gl_FragColor.a *= 1.0 - fogFactor * fotoAtras();
  #endif
`;

const VERT_PLANO = /* glsl */ `
varying vec3 vPosV;
varying vec3 vN;
varying vec2 vP;
varying vec3 vTx;
varying vec3 vTy;
#include <fog_pars_vertex>
void main() {
  vP = position.xy;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vPosV = mvPosition.xyz;
  vN = normalize(normalMatrix * normal);
  vTx = normalize(mat3(modelViewMatrix) * vec3(1.0, 0.0, 0.0));
  vTy = normalize(mat3(modelViewMatrix) * vec3(0.0, 1.0, 0.0));
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

// O verso fechado: a boca em V (vazada), as abas laterais com a costura no meio,
// a aba de baixo por cima delas e as sombras de contato.
const FRAG_CORPO = GLSL_MEDIDAS + GLSL_COMUM + GLSL_FORMAS + GLSL_SOMBRAS + /* glsl */ `
uniform sampler2D uFibra;
uniform float uAbertura;
#ifdef COM_TEMA
uniform sampler2D uTema;
uniform float uBordaTema;
#else
uniform vec3 uCorPapel;
#endif
varying vec3 vPosV;
varying vec3 vN;
varying vec2 vP;
varying vec3 vTx;
varying vec3 vTy;
#include <fog_pars_fragment>
void main() {
  vec2 p = vP;
  vec3 dpx = dFdx(vPosV);
  vec3 dpy = dFdy(vPosV);
  float h = texture(uFibra, p * 13.0).r;
  float dhx = dFdx(h) * 0.00011;
  float dhy = dFdy(h) * 0.00011;
#ifdef COM_TEMA
  vec3 base = texture(uTema, p / vec2(W, H) + 0.5).rgb;
#else
  vec3 base = uCorPapel;
#endif

  vec2 eM;
  float dM = boca(p, eM);
  if (dM < 0.0 && p.y > BOCA_Y - 0.001) discard;

  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(-vPosV);
  float sombra = 0.0;
  float brilhoBorda = 0.0;

  // a beira da boca pega luz
  float bm = 1.0 - smoothstep(0.0, 0.0012, dM);
  N += (eM.x * vTx + eM.y * vTy) * 0.85 * bm;
  brilhoBorda += 0.05 * bm;

  vec2 eB;
  float dB = abaFundo(p, eB);
  if (dB < 0.0) {
    // a aba de baixo, por cima das laterais
    float b = 1.0 - smoothstep(0.0, 0.0012, -dB);
    N += (eB.x * vTx + eB.y * vTy) * 0.85 * b;
    brilhoBorda += 0.05 * b;
  } else if (dM > 0.0) {
    float lanca = clamp(0.3 + dot(LUZ2, -eB), 0.0, 1.0);
    sombra += (0.06 + 0.16 * lanca) * exp(-dB / 0.0014);
    // as abas laterais: a direita passa por cima da esquerda
    if (p.x >= 0.0) {
      float bc = 1.0 - smoothstep(0.0, 0.0012, p.x);
      N -= vTx * 0.6 * bc;
      brilhoBorda += 0.05 * bc;
    } else {
      sombra += 0.07 * exp(-abs(p.x) / 0.0007);
    }
  }

  // a sombra da aba de cima fechada
  vec2 pf = p + LUZ2 * 0.0014;
  vec2 eF;
  float dF = abaCima(vec2(pf.x, H * 0.5 - pf.y), eF);
  sombra += (1.0 - uAbertura) * 0.2 * (1.0 - smoothstep(-0.0012, 0.0022, dF)) * smoothstep(0.003, 0.016, H * 0.5 - p.y);
  sombra += sombrasDeCima(p);

  N = relevo(normalize(N), dpx, dpy, dhx, dhy);
#ifdef COM_TEMA
  brilhoBorda *= uBordaTema;
#endif
  vec3 albedo = base * (0.975 + 0.05 * (h - 0.5));
  // a aba de baixo é uma folha a mais: contra a luz de dentro, fica um nada mais escura
  float camadas = dB < 0.0 ? 0.84 : 1.0;
  float sb = min(sombra, 0.6);
  vec3 luz = luzPapel(N, V) * caimento(p) * (1.0 - sb) + luzDentro(h, camadas) * (1.0 - 0.4 * sb) + bordaQuente(p);
  vec3 cor = albedo * luz + brilhoBorda * CHAMA + haloFio(p);
  gl_FragColor = vec4(acabar(cor), presenca());
` + GLSL_SAIDA + '}\n';

// O forro: por dentro, o vermelho com pétalas visto pela boca; por fora, a frente
// do envelope (a cor chapada do tema, vista quando ele gira).
const FRAG_FORRO = GLSL_MEDIDAS + GLSL_COMUM + GLSL_FORMAS + /* glsl */ `
uniform sampler2D uFibra;
uniform sampler2D uForro;
uniform vec3 uCorPapel;
varying vec3 vPosV;
varying vec3 vN;
varying vec2 vP;
#include <fog_pars_fragment>
void main() {
  vec2 p = vP;
  vec3 dpx = dFdx(vPosV);
  vec3 dpy = dFdy(vPosV);
  float h = texture(uFibra, p * 13.0).r;
  float dhx = dFdx(h);
  float dhy = dFdy(h);
  vec3 albedoForro = texture(uForro, p * 38.0).rgb;
  vec3 N = normalize(vN);
  vec3 V = normalize(-vPosV);
  vec3 cor;
  if (gl_FrontFacing) {
    N = relevo(N, dpx, dpy, dhx * 0.00008, dhy * 0.00008);
    vec2 e;
    float s = smoothstep(-0.0035, 0.0025, boca(p + LUZ2 * 0.0048, e));
    float fundo = mix(0.74, 1.0, smoothstep(BOCA_Y, H * 0.5, p.y));
    // por dentro mora a luz: o anil fica quente e as pétalas de ouro acendem
    cor = (albedoForro * (luzPapel(N, V) * (1.0 - 0.5 * s) + DENTRO * uDentro * 1.5) + CHAMA * uDentro * 0.05) * fundo;
  } else {
    N = relevo(-N, dpx, dpy, dhx * 0.00011, dhy * 0.00011);
    cor = uCorPapel * (0.975 + 0.05 * (h - 0.5)) * (luzPapel(N, V) + luzDentro(h, 1.0) + bordaQuente(p));
  }
  gl_FragColor = vec4(acabar(cor), presenca());
` + GLSL_SAIDA + '}\n';

// A aba de cima dobra no vertex shader: curva ao levantar e assenta sobre o bojo
// quando fechada (só assim os dois são possíveis).
const VERT_ABA = GLSL_MEDIDAS + /* glsl */ `
uniform float uTheta;
uniform float uCurva;
uniform float uDobraZ;
varying vec3 vPosV;
varying vec3 vN;
varying vec2 vQ;
varying vec2 vP;
varying vec3 vTx;
varying vec3 vTs;
#include <fog_pars_vertex>

float zCorpo(vec2 p) {
  float u = 2.0 * p.x / W;
  float v = 2.0 * p.y / H;
  float z = BOJO * max(0.0, 1.0 - u * u) * max(0.0, 1.0 - v * v);
  float d = min(W * 0.5 - abs(p.x), H * 0.5 - abs(p.y));
  if (d < ROLO) {
    float q = ROLO - max(0.0, d);
    z -= ROLO - sqrt(max(0.0, ROLO * ROLO - q * q));
  }
  return z;
}

void main() {
  float x = position.x;
  float s = -position.y;
  float th = uTheta;
  float k = uCurva;
  float phi = th + k * s;
  float y;
  float z;
  if (abs(k) < 0.001) {
    y = -cos(th) * s;
    z = sin(th) * s;
  } else {
    y = -(sin(phi) - sin(th)) / k;
    z = (cos(th) - cos(phi)) / k;
  }
  vec3 n = vec3(0.0, sin(phi), cos(phi));
  vec3 ts = vec3(0.0, -cos(phi), sin(phi));
  float assenta = 1.0 - smoothstep(0.0, 0.45, th);
  vec2 pc = vec2(x, H * 0.5 - s);
  float zc = zCorpo(pc) + CAMADA - uDobraZ;
  vec3 pos = vec3(x, H * 0.5 + y, uDobraZ + z) + n * zc * assenta;
  // fechada, a normal acompanha o bojo: o canto da aba não fica claro demais
  const float E = 0.0005;
  float gx = (zCorpo(pc + vec2(E, 0.0)) - zCorpo(pc - vec2(E, 0.0))) / (2.0 * E);
  float gy = (zCorpo(pc + vec2(0.0, E)) - zCorpo(pc - vec2(0.0, E))) / (2.0 * E);
  vec3 nn = normalize(n + vec3(-gx, -gy, 0.0) * assenta);

  vQ = vec2(x, s);
  vP = pc;
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vPosV = mvPosition.xyz;
  vN = normalize(normalMatrix * nn);
  vTx = normalize(mat3(modelViewMatrix) * vec3(1.0, 0.0, 0.0));
  vTs = normalize(mat3(modelViewMatrix) * ts);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG_ABA = GLSL_MEDIDAS + GLSL_COMUM + GLSL_FORMAS + GLSL_SOMBRAS + /* glsl */ `
uniform sampler2D uFibra;
uniform sampler2D uForro;
uniform float uTheta;
#ifdef COM_TEMA
uniform sampler2D uTema;
uniform float uBordaTema;
#else
uniform vec3 uCorPapel;
#endif
varying vec3 vPosV;
varying vec3 vN;
varying vec2 vQ;
varying vec2 vP;
varying vec3 vTx;
varying vec3 vTs;
#include <fog_pars_fragment>
void main() {
  vec2 p = vP;
  vec3 dpx = dFdx(vPosV);
  vec3 dpy = dFdy(vPosV);
  float h = texture(uFibra, p * 13.0 + 0.37).r;
  float dhx = dFdx(h);
  float dhy = dFdy(h);
  vec3 albedoForro = texture(uForro, p * 38.0 + 0.11).rgb;
#ifdef COM_TEMA
  vec3 base = texture(uTema, p / vec2(W, H) + 0.5).rgb;
#else
  vec3 base = uCorPapel;
#endif
  vec2 e;
  float d = abaCima(vQ, e);
  if (d > 0.0) discard;

  vec3 N = normalize(vN);
  vec3 V = normalize(-vPosV);
  vec3 cor;
  if (gl_FrontFacing) {
    float b = 1.0 - smoothstep(0.0, 0.0013, -d);
    N += (e.x * vTx + e.y * vTs) * 0.85 * b;
    float vinco = exp(-vQ.y / 0.0016);
    N += vTs * 0.5 * vinco;
    N = relevo(normalize(N), dpx, dpy, dhx * 0.00011, dhy * 0.00011);
    float fechada = 1.0 - smoothstep(0.02, 0.2, uTheta);
    float sombra = sombrasDeCima(p) * fechada;
    float brilhoBorda = 0.05 * b;
#ifdef COM_TEMA
    brilhoBorda *= uBordaTema;
#endif
    vec3 albedo = base * (0.975 + 0.05 * (h - 0.5));
    float sb = min(sombra, 0.6);
    // fechada, a aba soma uma folha ao verso: a luz de dentro passa um pouco menos
    vec3 luz = luzPapel(N, V) * caimento(p) * (1.0 - sb)
      + luzDentro(h, mix(1.0, 0.8, fechada)) * (1.0 - 0.4 * sb) + bordaQuente(p) * fechada;
    cor = albedo * luz + brilhoBorda * CHAMA + haloFio(p) * fechada;
  } else {
    // por dentro, o forro, com a beira dourada
    float b = 1.0 - smoothstep(0.0, 0.0015, -d);
    N = relevo(-N, dpx, dpy, dhx * 0.00008, dhy * 0.00008);
    cor = albedoForro * (luzPapel(N, V) * 0.97 + DENTRO * uDentro * 0.9) + OURO * 0.16 * b;
  }
  gl_FragColor = vec4(acabar(cor), presenca());
` + GLSL_SAIDA + '}\n';

// A carta dobrada em três: os terços de fora por cima do meio, a 1,6 e 0,8 mm.
const VERT_CARTA = GLSL_MEDIDAS + /* glsl */ `
uniform float uDobra;
uniform float uOnda;
varying vec3 vPosV;
varying vec3 vN;
varying vec2 vP;
varying float vVinco;
void main() {
  float y0 = PAPEL_A / 6.0;
  float a = 3.14159265 * uDobra;
  vec3 p = position;
  vec3 n = vec3(0.0, 0.0, 1.0);
  if (position.y > y0) {
    float r = position.y - y0;
    p.y = y0 + r * cos(a);
    p.z = r * sin(a) + 0.0016 * uDobra;
    n = vec3(0.0, -sin(a), cos(a));
  } else if (position.y < -y0) {
    float r = -y0 - position.y;
    p.y = -y0 - r * cos(a);
    p.z = r * sin(a) + 0.0008 * uDobra;
    n = vec3(0.0, sin(a), cos(a));
  }
  p.z += sin(position.x * 9.0 + position.y * 4.0) * uOnda;
  vVinco = min(abs(position.y - y0), abs(position.y + y0));
  vP = position.xy;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vPosV = mvPosition.xyz;
  vN = normalize(normalMatrix * n);
  gl_Position = projectionMatrix * mvPosition;
}
`;

// A folha sobe da luz de dentro do envelope e pega a chama; nunca passa de 1
// (o washi estouraria num branco amarelado) nem escurece como papelão. Com
// uPlano = 1 ela chega na cor exata da folha DOM, sem luz: a troca é invisível.
const FRAG_CARTA = GLSL_MEDIDAS + GLSL_COMUM + /* glsl */ `
uniform sampler2D uFibra;
uniform vec3 uCorPapel;
uniform vec3 uCorChapada;
uniform float uPlano;
uniform float uOpac;
uniform float uDobra;
varying vec3 vPosV;
varying vec3 vN;
varying vec2 vP;
varying float vVinco;
void main() {
  vec3 dpx = dFdx(vPosV);
  vec3 dpy = dFdy(vPosV);
  float h = texture(uFibra, vP * 11.0 + 0.71).r;
  float dhx = dFdx(h) * 0.00009;
  float dhy = dFdy(h) * 0.00009;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  N = relevo(N, dpx, dpy, dhx, dhy);
  vec3 V = normalize(-vPosV);
  float vinco = exp(-vVinco / 0.0012) * (0.35 + 0.65 * uDobra);
  vec3 luz = clamp(mix(luzPapel(N, V) + luzDentro(h, 0.6), vec3(1.0), 0.4), 0.88, 1.0);
  vec3 lit = uCorPapel * (0.98 + 0.04 * (h - 0.5)) * luz * (1.0 - 0.12 * vinco);
  gl_FragColor = vec4(mix(acabar(lit), uCorChapada, uPlano), uOpac);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// O cordão solto cede como corda, não como vareta: barriga para baixo, arco
// para o lado e ondulação.
const VERT_CORDAO = GLSL_MEDIDAS + /* glsl */ `
uniform float uSolta;
uniform float uLado;
varying vec2 vUv;
varying vec3 vPosV;
varying vec3 vN;
varying vec2 vP;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  if (uSolta > 0.0) {
    float u = clamp(position.x / (W * 0.5), -1.0, 1.0);
    float v = clamp(position.y / (H * 0.5), -1.0, 1.0);
    float barriga = 1.0 - u * u;
    float arco = 1.0 - v * v;
    p.y -= uSolta * (0.05 * barriga + 0.006 * sin(48.0 * position.x + 1.7 * uLado));
    p.x += uSolta * uLado * (0.032 * arco + 0.005 * sin(55.0 * position.y + 0.8));
    p.z += uSolta * (0.018 * barriga * arco + 0.004 * sin(37.0 * position.x + 29.0 * position.y));
  }
  vUv = uv;
  vP = position.xy;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vPosV = mvPosition.xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

// Dois fios torcidos (a perna escolhe a cor), sulco entre eles, fibra, um brilho
// que corre (o convite, só no fio) e o laço que acende.
const FRAG_CORDAO = GLSL_MEDIDAS + GLSL_COMUM + /* glsl */ `
uniform vec3 uCorFio;
uniform vec3 uCorFio2;
uniform float uBrilho;
uniform vec3 uCentroLaco;
uniform float uAlfa;
uniform float uAceso;
varying vec2 vUv;
varying vec3 vPosV;
varying vec3 vN;
varying vec2 vP;
#include <fog_pars_fragment>
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(-vPosV);
  float c = fract(vUv.x + 2.0 * vUv.y);
  float perfil = abs(2.0 * c - 1.0);
  float sulco = smoothstep(0.62, 1.0, perfil);
  float fibra = 0.5 + 0.5 * sin((7.0 * vUv.x + 13.0 * vUv.y) * 6.2831853);
  float difusa = clamp((dot(N, uLuzDir) + 0.4) / 1.4, 0.0, 1.0);
  float perna = mod(floor(vUv.x + 2.0 * vUv.y), 2.0);
  vec3 fio = mix(uCorFio, uCorFio2, perna);
  // o fio brilha por conta própria (metade da cor é dele) e a beira acende num halo
  vec3 cor = fio * (0.45 + 0.55 * difusa * uLuz) * (1.0 - 0.45 * sulco) * (0.94 + 0.06 * fibra);
  float beira = pow(max(1.0 - abs(dot(N, V)), 0.0), 2.0);
  cor += mix(fio, FIO_BRILHO, 0.6) * beira * 0.4;
  vec3 meio = normalize(uLuzDir + V);
  float esp = pow(max(dot(N, meio), 0.0), 18.0) * 0.14 * (1.0 - sulco);
  float t = (0.8 * vP.x + 0.6 * vP.y - uBrilho) / 0.004;
  float d = length(vP - uCentroLaco.xy);
  float faixa = exp(-t * t) * (1.0 - smoothstep(0.03, 0.05, d));
  cor += CHAMA * esp * uLuz + vec3(1.0, 0.8, 0.72) * faixa * 0.32 * (1.0 - sulco);
  if (uAceso > 0.001) {
    float e = d / 0.026;
    float k = uAceso * (0.28 + 0.72 * exp(-e * e));
    cor = mix(cor, vec3(1.0, 0.3, 0.32), 0.7 * k);
    cor += vec3(1.0, 0.78, 0.7) * k * 0.28 * (1.0 - sulco) * (0.5 + 0.5 * difusa);
  }
  gl_FragColor = vec4(acabar(cor), uAlfa * presenca());
` + GLSL_SAIDA + '}\n';

// vL é a coordenada da geometria do lacre (centrada no selo, antes do pivô).
const VERT_CERA = /* glsl */ `
varying vec3 vPosV;
varying vec3 vN;
varying vec3 vL;
#include <fog_pars_vertex>
void main() {
  vL = position;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vPosV = mvPosition.xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

// A cera de ouro: fosca e quente, devolve a chama num reflexo largo, tem um
// ponto de luz pequeno e a beira clara; o sinete se lê pelo relevo. Nunca fica preta.
const FRAG_CERA = GLSL_MEDIDAS + GLSL_COMUM + /* glsl */ `
uniform sampler2D uSinete;
uniform float uRaioSinete;
uniform float uComSinete;
uniform vec3 uCorCera;
uniform float uBrilho;
uniform float uAlfa;
varying vec3 vPosV;
varying vec3 vN;
varying vec3 vL;
#include <fog_pars_fragment>
void main() {
  vec3 dpx = dFdx(vPosV);
  vec3 dpy = dFdy(vPosV);
  float hs = texture(uSinete, vL.xy / (2.0 * uRaioSinete) + 0.5).r;
  float dentro = uComSinete * (1.0 - smoothstep(0.92, 1.0, length(vL.xy) / uRaioSinete));
  float hb = hs * dentro;
  float dhx = dFdx(hb) * 0.0005;
  float dhy = dFdy(hb) * 0.0005;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  N = relevo(N, dpx, dpy, dhx, dhy);
  vec3 V = normalize(-vPosV);
  float difusa = clamp((dot(N, uLuzDir) + 0.5) / 1.5, 0.0, 1.0);
  float frente = abs(dot(N, V));
  float reflexo = smoothstep(-0.3, 0.8, dot(reflect(-V, N), uLuzDir));
  vec3 cor = uCorCera * (0.3 + 0.62 * difusa + 0.45 * reflexo);
  cor *= mix(1.0, mix(0.52, 1.16, hs), dentro); // o ouro é claro: o sinete precisa de mais relevo que a cera vermelha
  vec3 meio = normalize(uLuzDir + V);
  cor += OURO_CLARO * pow(max(dot(N, meio), 0.0), 40.0) * 0.55;
  cor += OURO * 0.22 * (1.0 - frente) * (1.0 - frente);
  float t = (0.8 * vL.x + 0.6 * vL.y - uBrilho) / 0.004;
  cor += OURO_CLARO * exp(-t * t) * 0.35;
  gl_FragColor = vec4(acabar(cor * uLuz), uAlfa * presenca());
` + GLSL_SAIDA + '}\n';

// As faíscas de ouro ao abrir: pontos aditivos, um miolo claro e um halo de
// chama. aVida vai de 1 a 0; acendem rápido e se apagam devagar, sem piscar.
const VERT_FAISCA = /* glsl */ `
attribute float aVida;
attribute float aTam;
uniform float uEscala;
varying float vAlfa;
varying float vMiolo;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vAlfa = smoothstep(0.0, 0.6, aVida) * (1.0 - smoothstep(0.9, 1.0, aVida));
  vMiolo = aVida;
  gl_PointSize = aVida > 0.0 ? min(72.0, aTam * (0.65 + 0.35 * aVida) * uEscala / max(-mv.z, 0.05)) : 0.0;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG_FAISCA = /* glsl */ `
varying float vAlfa;
varying float vMiolo;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0) discard;
  float miolo = exp(-r * 22.0) * (0.5 + 0.5 * vMiolo);
  float halo = exp(-r * 4.5) * 0.5 * (1.0 - r);
  gl_FragColor = vec4(mix(vec3(1.0, 0.56, 0.2), vec3(1.0, 0.9, 0.7), miolo), 1.0);
  #include <colorspace_fragment>
  gl_FragColor.a = (miolo + halo) * vAlfa;
}
`;

/* ============================================================================
   A CARTA 3D
   ========================================================================== */

/**
 * O disco de cera, já trincado em três pedaços (cada um com o seu centro): ao
 * abrir, ele racha em zigue-zague e cada parte salta. A ordem do sorteio importa
 * (define o contorno e a rachadura): harmônicos, gotas, rachaduras.
 */
function geometriaLacre(THREE, rnd, baixo, afundar) {
  const R = LACRE_R;
  const H0 = 0.0026; // espessura da cera
  const RS = R * 0.64; // raio do sinete
  const aneis = baixo ? 14 : 24;
  const setores = baixo ? 44 : 84;

  const fases = [rnd(), rnd(), rnd(), rnd()].map((v) => v * TAU);
  const gotas = [];
  for (let i = 0; i < 4; i++) gotas.push({ a: rnd() * TAU, f: 0.08 + 0.14 * rnd(), w: 0.16 + 0.16 * rnd() });
  const base = rnd() * TAU;
  const angulos = [base, base + 2.1 + 0.3 * rnd(), base + 4.15 + 0.3 * rnd()];
  const zigues = [rnd(), rnd(), rnd()].map((v) => v * TAU);

  const raio = (a) => {
    let r = 1 + 0.035 * Math.sin(3 * a + fases[0]) + 0.025 * Math.sin(5 * a + fases[1])
      + 0.014 * Math.sin(11 * a + fases[2]) + 0.008 * Math.sin(19 * a + fases[3]);
    for (const g of gotas) {
      const d = Math.atan2(Math.sin(a - g.a), Math.cos(a - g.a));
      r += g.f * Math.exp(-((d / g.w) ** 2));
    }
    return R * 0.92 * r;
  };
  // O sinete é rebaixado no centro, com um aro, e a cera escorre até o papel.
  const altura = (rho, rn) => {
    const borda = (H0 + afundar) * Math.sqrt(clamp((1 - rn) / 0.36)) - afundar;
    const rs = rho / RS;
    const aro = 0.22 * H0 * Math.exp(-(((rs - 1.07) / 0.07) ** 2));
    const piso = 0.74 * H0;
    const m = clamp((rs - 0.97) / 0.07);
    return piso * (1 - m) + (borda + aro) * m;
  };

  const pos = [0, 0, altura(0, 0)];
  for (let i = 1; i <= aneis; i++) {
    const rn = i / aneis;
    for (let j = 0; j < setores; j++) {
      const a = (j / setores) * TAU;
      const rho = rn * raio(a);
      pos.push(Math.cos(a) * rho, Math.sin(a) * rho, altura(rho, rn));
    }
  }
  const vert = (i, j) => (i === 0 ? 0 : 1 + (i - 1) * setores + (j % setores));
  const triangulos = [];
  for (let j = 0; j < setores; j++) triangulos.push([0, vert(1, j), vert(1, j + 1)]);
  for (let i = 1; i < aneis; i++) {
    for (let j = 0; j < setores; j++) {
      triangulos.push([vert(i, j), vert(i + 1, j), vert(i + 1, j + 1)]);
      triangulos.push([vert(i, j), vert(i + 1, j + 1), vert(i, j + 1)]);
    }
  }

  // Cada triângulo vai para a fatia entre as rachaduras em que cai o seu centroide.
  const CX = 0.0014;
  const CY = -0.0009;
  const embrulhar = (v) => ((v % TAU) + TAU) % TAU;
  const zig = (k, r) => angulos[k]
    + (0.28 * Math.sin(r * 1500 + zigues[k]) + 0.12 * Math.sin(r * 4100 + 2 * zigues[k])) * Math.min(1, r / (R * 0.25));
  const fatia = (x, y) => {
    const r = Math.hypot(x - CX, y - CY);
    const z0 = zig(0, r);
    const t = embrulhar(Math.atan2(y - CY, x - CX) - z0);
    if (t < embrulhar(zig(1, r) - z0)) return 0;
    return t < embrulhar(zig(2, r) - z0) ? 1 : 2;
  };

  const partes = [0, 1, 2].map(() => ({ mapa: new Map(), pos: [], ind: [], soma: [0, 0, 0], n: 0 }));
  for (const tri of triangulos) {
    const cx = (pos[tri[0] * 3] + pos[tri[1] * 3] + pos[tri[2] * 3]) / 3;
    const cy = (pos[tri[0] * 3 + 1] + pos[tri[1] * 3 + 1] + pos[tri[2] * 3 + 1]) / 3;
    const cz = (pos[tri[0] * 3 + 2] + pos[tri[1] * 3 + 2] + pos[tri[2] * 3 + 2]) / 3;
    const parte = partes[fatia(cx, cy)];
    parte.soma[0] += cx;
    parte.soma[1] += cy;
    parte.soma[2] += cz;
    parte.n += 1;
    for (const v of tri) {
      let k = parte.mapa.get(v);
      if (k === undefined) {
        k = parte.pos.length / 3;
        parte.mapa.set(v, k);
        parte.pos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      }
      parte.ind.push(k);
    }
  }
  return partes.filter((p) => p.n > 0).map((p) => {
    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
    geometria.setIndex(p.ind);
    geometria.computeVertexNormals();
    return { geometria, centro: new THREE.Vector3(p.soma[0] / p.n, p.soma[1] / p.n, p.soma[2] / p.n) };
  });
}

function criarEnvelope3D(mundo, opcoes = {}) {
  const { THREE, amb, cena, camera, renderer } = mundo;
  const gsap = window.gsap;
  const { lacre, amarracao, tema } = normalizar(opcoes);
  const estilo = tema ? TEMAS[tema] : null;
  const fio = amarracao === 'fio';
  const baixo = amb?.nivel === 'baixo';
  const reduzido = !!amb?.reduzido;
  const calmo = reduzido ? 0.3 : 1;
  // Lacre, farelo e estouro sorteiam deste gerador, nessa ordem.
  const rnd = semente(lacre === 'estrela' ? 77 : lacre === 'coracao' ? 31 : 113);
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  const geometrias = new Set();
  const materiais = [];
  const texturas = [];
  const guardarGeo = (g) => {
    geometrias.add(g);
    return g;
  };

  const grupo = new THREE.Group();
  grupo.name = 'envelope';
  // Tudo que flutua e gira fica em `interno`; a cena posiciona `grupo`.
  const interno = new THREE.Group();
  grupo.add(interno);

  /* ---- texturas ---- */

  const textura = (canvas, { cor = false, repete = false } = {}) => {
    const t = new THREE.CanvasTexture(canvas);
    if (cor) t.colorSpace = THREE.SRGBColorSpace;
    if (repete) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
    }
    t.anisotropy = baixo ? 1 : 4;
    texturas.push(t);
    return t;
  };
  const texFibra = textura(telaFibra(baixo ? 256 : 512), { repete: true });
  const texForro = textura(telaForro(baixo ? 128 : 256), { cor: true, repete: true });
  const texTema = tema ? textura(telaTema(tema, baixo ? 512 : 1024), { cor: true }) : null;
  const texSinete = lacre ? textura(telaSinete(lacre, baixo ? 128 : 256)) : null;

  /* ---- uniformes e materiais ---- */

  const comum = {
    uLuzDir: { value: V3(-0.45, 0.7, 0.55).normalize() },
    uBranco: { value: 0 },
    // Por referência: a carta acompanha a cor da névoa que a alameda pinta.
    uCorBranco: { value: cena.fog ? cena.fog.color : new THREE.Color(1, 1, 1) },
    uLuz: { value: 1 },
    uDentro: { value: LUZ_DENTRO },
  };
  const nevoa = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  const shader = (vertexShader, fragmentShader, uniforms, extra = {}) => {
    const m = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { ...nevoa, ...comum, ...uniforms },
      fog: true,
      ...extra,
    });
    materiais.push(m);
    return m;
  };

  const uFibra = { value: texFibra };
  const uForro = { value: texForro };
  const definesTema = tema ? { COM_TEMA: '' } : {};
  // Com tema, o desenho inteiro cobre o verso e continua na aba.
  const pele = tema
    ? { uTema: { value: texTema }, uBordaTema: { value: estilo.borda } }
    : { uCorPapel: { value: new THREE.Color(COR_ENVELOPE) } };
  const sombras = {
    uLinha0: { value: new THREE.Vector4() },
    uLinha1: { value: new THREE.Vector4() },
    uSombraFio: { value: 1 },
    uSombraLacre: { value: lacre ? 1 : 0 },
    uLacre: { value: V3(0, LACRE_Y, 0) },
  };
  const uAbertura = { value: 0 };
  const uAba = { uTheta: { value: 0 }, uCurva: { value: 0 }, uDobraZ: { value: -ROLO * 0.5 } };
  const uCarta = {
    uFibra,
    uCorPapel: { value: new THREE.Color(COR_CARTA) },
    uCorChapada: { value: new THREE.Color(corDoPapelCss()) },
    uPlano: { value: 0 },
    uOpac: { value: 1 },
    uDobra: { value: 1 },
    uOnda: { value: 0 },
    // O papel não some junto com o envelope.
    uBranco: { value: 0 },
  };

  const matCorpo = shader(VERT_PLANO, FRAG_CORPO, { uFibra, uAbertura, ...pele, ...sombras }, { side: THREE.DoubleSide, defines: definesTema });
  const matForro = shader(VERT_PLANO, FRAG_FORRO, {
    uFibra,
    uForro,
    uCorPapel: { value: new THREE.Color(estilo ? estilo.base : COR_ENVELOPE) },
  }, { side: THREE.DoubleSide });
  const matAba = shader(VERT_ABA, FRAG_ABA, { uFibra, uForro, ...pele, ...sombras, ...uAba }, { side: THREE.DoubleSide, defines: definesTema });
  // Dos dois lados: dobrada, a carta mostra a face de fora dos terços.
  const matCarta = shader(VERT_CARTA, FRAG_CARTA, uCarta, {
    transparent: true, fog: false, toneMapped: false, side: THREE.DoubleSide,
  });

  /* ---- corpo, forro, aba e carta ---- */

  const geoCorpo = guardarGeo(new THREE.PlaneGeometry(1, 1, baixo ? 40 : 72, baixo ? 28 : 52));
  // Mais vértices nas bordas, onde o papel enrola.
  const adensar = (t) => Math.sign(t) * (1 - (1 - Math.abs(t)) ** 1.8);
  const vertices = geoCorpo.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = (adensar(2 * vertices.getX(i)) * W) / 2;
    const y = (adensar(2 * vertices.getY(i)) * H) / 2;
    vertices.setXYZ(i, x, y, zCorpo(x, y));
  }
  geoCorpo.computeVertexNormals();
  geoCorpo.computeBoundingBox();
  geoCorpo.computeBoundingSphere();
  const corpo = new THREE.Mesh(geoCorpo, matCorpo);

  const forro = new THREE.Mesh(guardarGeo(new THREE.PlaneGeometry(W - 0.002, H - 0.002)), matForro);
  forro.position.z = FUNDO_Z;

  const geoAba = guardarGeo(new THREE.PlaneGeometry(W, ABA_L + 0.004, baixo ? 24 : 40, baixo ? 18 : 32));
  geoAba.translate(0, -(ABA_L + 0.004) / 2, 0); // a dobradiça fica na linha y = 0
  const aba = new THREE.Mesh(geoAba, matAba);
  aba.renderOrder = 1;
  aba.frustumCulled = false;

  const geoCarta = guardarGeo(new THREE.PlaneGeometry(PAPEL_L, PAPEL_A, 4, baixo ? 48 : 90));
  geoCarta.computeBoundingBox(); // retanguloParaPose mede por ela
  const papel = new THREE.Mesh(geoCarta, matCarta);
  papel.position.set(0, PAPEL_Y, PAPEL_Z);
  papel.visible = false;
  papel.frustumCulled = false;

  interno.add(forro, papel, corpo, aba);

  /* ---- amarração ---- */

  const raioFio = fio ? 0.0008 : 0.0015;
  const passoTorcao = fio ? 0.0026 : 0.0042; // o comprimento de uma volta da torção
  const segTubo = baixo ? 0.6 : 1;
  const radiais = baixo ? 5 : 8;
  const alturaLaco = raioFio * (fio ? 3.4 : 2.6);
  const atras = FUNDO_Z - raioFio - 0.0003;
  const naSuperficie = (x, y, extra = 0) => V3(x, y, zSuperficie(x, y) + raioFio + 0.00025 + extra);
  const plano = (pts, extra = 0) => pts.map(([x, y]) => naSuperficie(x, y, extra));
  const geoPonta = guardarGeo(new THREE.SphereGeometry(1, 8, 6));

  const [cor1, cor2] = estilo ? estilo.cordao : [COR_CORDAO, COR_CORDAO];
  // O mesmo objeto no lacre e no fio: trocar por outro desliga o brilho de um deles.
  const brilho = { value: 99 };
  const uAcesoLaco = { value: 0 };
  const uAlfaFio = { value: 1 };
  const unifCordao = {
    uCorFio: { value: new THREE.Color(cor1) },
    uCorFio2: { value: new THREE.Color(cor2) },
    uBrilho: fio ? brilho : { value: 99 },
    uCentroLaco: { value: V3(0, LACRE_Y, 0) },
    uAlfa: uAlfaFio,
    uAceso: uAcesoLaco,
  };
  const matVolta = (lado) => shader(VERT_CORDAO, FRAG_CORDAO, {
    ...unifCordao, uSolta: { value: 0 }, uLado: { value: lado },
  }, { transparent: true });
  const matCordao = matVolta(0);

  const amarra = new THREE.Group();
  const laco = new THREE.Group();
  amarra.add(laco);
  interno.add(amarra);
  const voltas = [];
  // Cada volta tem o seu material (uSolta e uLado próprios): abrir lê userData.mat.
  const novaVolta = () => {
    const pai = new THREE.Group();
    pai.userData.mat = matVolta(voltas.length % 2 ? 1 : -1);
    amarra.add(pai);
    voltas.push(pai);
    return { pai, mat: pai.userData.mat };
  };

  const tubo = (pontos, { fechado = false, pai = laco, mat = matCordao } = {}) => {
    const curva = new THREE.CatmullRomCurve3(pontos, fechado, 'centripetal');
    const comp = curva.getLength();
    const segs = Math.max(12, Math.round((comp / 0.0012) * segTubo));
    const g = guardarGeo(new THREE.TubeGeometry(curva, segs, raioFio, radiais, fechado));
    const uv = g.attributes.uv;
    const voltasDaTorcao = comp / passoTorcao;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * voltasDaTorcao);
    const malha = new THREE.Mesh(g, mat);
    malha.frustumCulled = false; // o cordão solto sai da caixa da geometria
    pai.add(malha);
    if (!fechado) {
      for (const p of [pontos[0], pontos[pontos.length - 1]]) {
        const bola = new THREE.Mesh(geoPonta, mat);
        bola.position.copy(p);
        bola.scale.setScalar(raioFio);
        pai.add(bola);
      }
    }
  };

  // Uma volta inteira em torno do envelope: pela frente, sobre a superfície, e de volta por trás.
  const voltaHorizontal = (yDe, extra = 0) => {
    const pts = [];
    for (let i = 0; i <= 26; i++) {
      const x = -W / 2 + 0.002 + ((W - 0.004) * i) / 26;
      pts.push(naSuperficie(x, yDe(x), extra));
    }
    const yd = yDe(W / 2);
    const ye = yDe(-W / 2);
    pts.push(
      V3(W / 2 + 0.9 * raioFio, yd, -0.9 * ROLO),
      V3(W / 2 - 0.002, yd, atras),
      V3(0, (yd + ye) / 2, atras),
      V3(-W / 2 + 0.002, ye, atras),
      V3(-W / 2 - 0.9 * raioFio, ye, -0.9 * ROLO),
    );
    return pts;
  };
  // A vertical passa por cima da horizontal no cruzamento (uma bossa).
  const voltaVertical = (x) => {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const y = H / 2 - 0.002 - ((H - 0.004) * i) / 20;
      const bossa = Math.exp(-(((y - LACRE_Y) / 0.004) ** 2)) * raioFio * 1.6;
      pts.push(naSuperficie(x, y, bossa));
    }
    pts.push(
      V3(x, -H / 2 - 0.9 * raioFio, -0.9 * ROLO),
      V3(x, -H / 2 + 0.002, atras),
      V3(x, 0, atras),
      V3(x, H / 2 - 0.002, atras),
      V3(x, H / 2 + 0.9 * raioFio, -0.9 * ROLO + CAMADA),
    );
    return pts;
  };

  let pontoAncora;
  if (!fio) {
    // O cordão em cruz, com um laço pequeno e justo.
    tubo(voltaHorizontal(() => LACRE_Y), { fechado: true, ...novaVolta() });
    tubo(voltaVertical(0), { fechado: true, ...novaVolta() });
    sombras.uLinha0.value.set(0, 1, -LACRE_Y, raioFio);
    sombras.uLinha1.value.set(1, 0, 0, raioFio);
    const justo = ([x, y]) => [x * 0.86, LACRE_Y + (y - LACRE_Y) * 0.9];
    for (const alca of LACO_CORDAO.alcas) tubo(plano(relativo(alca).map(justo), alturaLaco), { fechado: true });
    for (const cauda of LACO_CORDAO.caudas) tubo(plano(relativo(cauda), alturaLaco * 0.8));
    pontoAncora = naSuperficie(0.025, LACRE_Y - 0.035, alturaLaco * 0.8);
  } else {
    // O fio: duas voltas quase paralelas que se cruzam, laço e uma cauda longa.
    tubo(voltaHorizontal(() => LACRE_Y + 0.0026), { fechado: true, ...novaVolta() });
    tubo(voltaHorizontal((x) => LACRE_Y - 0.0024 + 0.028 * x, raioFio * 1.2), { fechado: true, ...novaVolta() });
    const n = Math.hypot(1, 0.028);
    sombras.uLinha0.value.set(0, 1, -(LACRE_Y + 0.0026), raioFio);
    sombras.uLinha1.value.set(-0.028 / n, 1 / n, -(LACRE_Y - 0.0024) / n, raioFio);
    for (const alca of LACO_FIO.alcas) tubo(plano(relativo(alca), alturaLaco), { fechado: true });
    tubo(plano(relativo(LACO_FIO.perna), alturaLaco * 0.8));
    const cauda = [
      ...plano(relativo(LACO_FIO.cauda), alturaLaco * 0.6),
      V3(0.0018, -H / 2 + 0.001, zCorpo(0.0018, -H / 2 + 0.006) + 2 * raioFio),
      V3(0.0016, -H / 2 - 0.013, 2.5 * raioFio),
    ];
    tubo(cauda);
    pontoAncora = cauda[cauda.length - 1].clone();
    const no = new THREE.Mesh(geoPonta, matCordao);
    no.scale.set(2.2 * raioFio, 2 * raioFio, 1.8 * raioFio);
    no.position.copy(naSuperficie(0, LACRE_Y, alturaLaco + 0.4 * raioFio));
    laco.add(no);
  }
  // De onde sai o fio do caminho: segue a carta, não o laço que se desfaz.
  const ponta = new THREE.Object3D();
  ponta.position.copy(pontoAncora);
  interno.add(ponta);

  /* ---- lacre ---- */

  const pedacos = [];
  const farelo = [];
  const uAlfaCera = { value: 1 }; // o lacre e o farelo somem juntos
  let lacreGrupo = null;
  if (lacre) {
    const cera = (comSinete) => shader(VERT_CERA, FRAG_CERA, {
      uSinete: { value: texSinete },
      uRaioSinete: { value: LACRE_R * 0.64 },
      uComSinete: { value: comSinete },
      uCorCera: { value: new THREE.Color(estilo ? estilo.cera : COR_CERA) },
      uBrilho: comSinete ? brilho : { value: 99 },
      uAlfa: uAlfaCera,
    }, { transparent: true, side: THREE.DoubleSide, forceSinglePass: true });
    const matLacre = cera(1);
    const elevacao = alturaLaco + raioFio * 1.4; // por cima do cruzamento e do nó do laço
    lacreGrupo = new THREE.Group();
    lacreGrupo.position.set(0, LACRE_Y, zSuperficie(0, LACRE_Y) + elevacao);
    interno.add(lacreGrupo);
    for (const { geometria, centro } of geometriaLacre(THREE, rnd, baixo, elevacao - 0.0003)) {
      guardarGeo(geometria);
      const pivo = new THREE.Group();
      pivo.position.copy(centro);
      const malha = new THREE.Mesh(geometria, matLacre);
      malha.position.copy(centro).negate();
      pivo.add(malha);
      lacreGrupo.add(pivo);
      const dir = V3(centro.x, centro.y, 0);
      if (dir.lengthSq() > 1e-12) dir.normalize();
      pedacos.push({ pivo, centro: centro.clone(), dir });
    }
    if (!baixo && !reduzido) {
      const matFarelo = cera(0);
      const geoFarelo = guardarGeo(new THREE.IcosahedronGeometry(1, 0));
      for (let i = 0; i < 10; i++) {
        const ang = rnd() * TAU;
        const dist = (0.3 + 0.6 * rnd()) * LACRE_R;
        const lasca = new THREE.Mesh(geoFarelo, matFarelo);
        lasca.scale.set(0.0005 + 0.0007 * rnd(), 0.0004 + 0.0006 * rnd(), 0.0004 + 0.0005 * rnd());
        lasca.position.set(Math.cos(ang) * dist, Math.sin(ang) * dist, 0.002);
        lasca.visible = false;
        lacreGrupo.add(lasca);
        farelo.push(lasca);
      }
    }
  }

  /* ---- faíscas: luz falsa em pontos, nenhuma luz real ---- */

  const NF = baixo ? 14 : 26;
  const rndF = semente(1223);
  const posF = new Float32Array(NF * 3);
  const vidaF = new Float32Array(NF);
  const tamF = new Float32Array(NF);
  const faiscas = Array.from({ length: NF }, () => ({ vel: V3(), vida: 0, total: 1 }));
  const geoFaiscas = guardarGeo(new THREE.BufferGeometry());
  geoFaiscas.setAttribute('position', new THREE.BufferAttribute(posF, 3));
  geoFaiscas.setAttribute('aVida', new THREE.BufferAttribute(vidaF, 1));
  geoFaiscas.setAttribute('aTam', new THREE.BufferAttribute(tamF, 1));
  geoFaiscas.setDrawRange(0, 0); // nada desenha até abrir; o shader compila no preparo
  const uEscalaF = { value: 1000 };
  const matFaiscas = new THREE.ShaderMaterial({
    vertexShader: VERT_FAISCA,
    fragmentShader: FRAG_FAISCA,
    uniforms: { uEscala: uEscalaF },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  materiais.push(matFaiscas);
  const pontosF = new THREE.Points(geoFaiscas, matFaiscas);
  pontosF.frustumCulled = false;
  pontosF.renderOrder = 4;
  grupo.add(pontosF); // no grupo, não no `interno`: elas não acompanham o balanço da carta
  let faiscasVivas = false;

  /** Solta as faíscas do ponto (no mundo). Com movimento reduzido, poucas e paradas: só se apagam. */
  function soltarFaiscas(noMundoPonto) {
    grupo.updateWorldMatrix(true, false);
    const origem = grupo.worldToLocal(noMundoPonto.clone());
    const altura = renderer?.domElement?.height || innerHeight;
    uEscalaF.value = altura / (2 * Math.tan(((camera.fov || 58) * Math.PI) / 360));
    const n = reduzido ? Math.min(8, NF) : NF;
    for (let i = 0; i < n; i++) {
      const f = faiscas[i];
      const a = rndF() * TAU;
      const r = reduzido ? 0.004 + 0.02 * rndF() : 0.002 * rndF();
      posF[i * 3] = origem.x + Math.cos(a) * r;
      posF[i * 3 + 1] = origem.y + Math.sin(a) * r * 0.7;
      posF[i * 3 + 2] = origem.z + 0.004;
      const forca = reduzido ? 0 : 0.07 + 0.2 * rndF();
      f.vel.set(Math.cos(a) * forca, Math.sin(a) * forca * 0.6 + (reduzido ? 0 : 0.1 + 0.16 * rndF()), reduzido ? 0 : 0.04 + 0.1 * rndF());
      f.total = reduzido ? 0.9 + 0.4 * rndF() : 1.1 + 0.9 * rndF();
      f.vida = f.total;
      tamF[i] = 0.006 + 0.008 * rndF();
      vidaF[i] = 1;
    }
    geoFaiscas.setDrawRange(0, n);
    geoFaiscas.attributes.aTam.needsUpdate = true;
    faiscasVivas = true;
  }

  /** Por quadro: o ar segura as faíscas e o calor as leva um pouco para cima. */
  function moverFaiscas(passo) {
    let vivas = 0;
    const arrasto = Math.exp(-1.7 * passo);
    for (let i = 0; i < NF; i++) {
      const f = faiscas[i];
      if (f.vida <= 0) continue;
      f.vida -= passo;
      if (f.vida <= 0) {
        vidaF[i] = 0;
        continue;
      }
      vivas++;
      f.vel.multiplyScalar(arrasto);
      if (!reduzido) f.vel.y += 0.05 * passo;
      posF[i * 3] += f.vel.x * passo;
      posF[i * 3 + 1] += f.vel.y * passo;
      posF[i * 3 + 2] += f.vel.z * passo;
      vidaF[i] = f.vida / f.total;
    }
    geoFaiscas.attributes.position.needsUpdate = true;
    geoFaiscas.attributes.aVida.needsUpdate = true;
    if (!vivas) {
      faiscasVivas = false;
      geoFaiscas.setDrawRange(0, 0);
    }
  }

  /* ---- estado ---- */

  const luz = { dentro: 1 }; // multiplica a luz de dentro: acende ao chegar e ao abrir
  const tweens = new Set();
  // Um tween concluído sai do Set; os vivos morrem no dispose.
  const guardar = (t) => {
    tweens.add(t);
    comoPromise(t).then(() => tweens.delete(t));
    return t;
  };
  const mola = { x: 0, y: 0, vx: 0, vy: 0 };
  const pose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, flutua: 1, segue: 1, aperto: 0 };
  const entrada = { k: 0, z: 0 };
  const voando = [];
  const gravidade = 3.4; // m/s², para os pedaços
  const cantos = [V3(-W / 2, -H / 2, 0), V3(W / 2, -H / 2, 0), V3(W / 2, H / 2, 0), V3(-W / 2, H / 2, 0)];
  const ponto = V3();
  const naCamera = V3();
  let modo = 'espera';
  let tempoBrilho = 0;
  let descartado = false;
  let preparo = null;
  let sumindo = false;

  const noMundo = (x, y, z) => {
    grupo.updateWorldMatrix(true, true);
    return interno.localToWorld(V3(x, y, z));
  };

  // Com a foto atrás (névoa com cor), corpo, forro e aba ficam translúcidos só
  // enquanto somem ou estão longe na névoa: no Safari, a carta longe virava um
  // cartão claro sobre a foto. No resto do tempo são opacos, e as pétalas na
  // frente não são pintadas por cima.
  corpo.onBeforeRender = () => {
    const n = cena.fog;
    let agora = false;
    if (n && n.color.r < 0.995) {
      naCamera.setFromMatrixPosition(corpo.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      agora = comum.uBranco.value > 0.001 || -naCamera.z > n.near - 0.5;
    }
    if (agora === sumindo) return;
    sumindo = agora;
    for (const m of [matCorpo, matForro, matAba]) {
      m.transparent = agora;
      m.needsUpdate = true;
    }
  };

  /* ---- por quadro ---- */

  function atualizar(dt, tempo) {
    if (descartado) return;
    const passo = (Number(dt) || 0) * (amb?.rapido || 1);
    const t = Number(tempo) || 0;
    if (cena.fog && comum.uCorBranco.value !== cena.fog.color) comum.uCorBranco.value = cena.fog.color;

    // A mola segue o ponteiro (−1..1, já suavizado pelo mundo).
    const alvoY = (mundo.ponteiro?.x || 0) * 0.21 * calmo * pose.segue;
    const alvoX = -(mundo.ponteiro?.y || 0) * 0.17 * calmo * pose.segue;
    const h = Math.min(passo, 1 / 30) / 2;
    for (let i = 0; i < 2; i++) {
      mola.vx += ((alvoX - mola.x) * 34 - mola.vx * 6.2) * h;
      mola.vy += ((alvoY - mola.y) * 34 - mola.vy * 6.2) * h;
      mola.x += mola.vx * h;
      mola.y += mola.vy * h;
    }

    const fl = pose.flutua * calmo;
    const k = entrada.k;
    interno.position.set(
      pose.x,
      Math.sin(t * 0.9) * 0.009 * fl + pose.y + 0.18 * k,
      pose.z - 0.004 * pose.aperto - entrada.z,
    );
    interno.rotation.set(
      mola.x + Math.sin(t * 0.53 + 0.4) * 0.018 * fl + pose.rx - 0.62 * k,
      mola.y + Math.sin(t * 0.37) * 0.105 * fl + pose.ry + 0.4 * k,
      Math.sin(t * 0.6 + 1.3) * 0.02 * fl + pose.rz + 0.24 * k,
    );

    // O convite: a cada 5 s, por 1,1 s, um brilho atravessa o lacre (no fio, o nó).
    if (modo === 'espera' && !reduzido) {
      tempoBrilho += passo;
      const ciclo = tempoBrilho % 5;
      brilho.value = ciclo < 1.1 ? -0.03 + (ciclo / 1.1) * 0.05 + (fio ? LACRE_Y * 0.6 : 0) : 99;
    } else {
      brilho.value = 99;
    }

    // A luz respira devagar (a chama em 4,6 s, a de dentro em 3,4 s), nunca pisca.
    comum.uLuz.value = 1 + 0.035 * Math.sin(t * 1.366);
    comum.uDentro.value = luz.dentro * LUZ_DENTRO * (1 + 0.07 * Math.sin(t * 1.848 + 1.1));
    if (faiscasVivas) moverFaiscas(passo);

    for (let i = voando.length - 1; i >= 0; i--) {
      const v = voando[i];
      v.vida -= passo;
      if (v.vida <= 0) {
        v.obj.visible = false;
        v.obj.parent?.remove(v.obj);
        voando.splice(i, 1);
        continue;
      }
      v.vel.y -= gravidade * passo;
      v.obj.position.addScaledVector(v.vel, passo);
      v.obj.rotateOnAxis(v.eixo, v.giro * passo);
    }
  }

  /* ---- na tela ---- */

  function caixaNdc() {
    if (descartado) return null;
    grupo.updateWorldMatrix(true, true);
    camera.updateWorldMatrix(true, false);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of cantos) {
      ponto.copy(c).applyMatrix4(interno.matrixWorld).project(camera);
      if (ponto.z < -1 || ponto.z > 1) return null;
      minX = Math.min(minX, ponto.x);
      maxX = Math.max(maxX, ponto.x);
      minY = Math.min(minY, ponto.y);
      maxY = Math.max(maxY, ponto.y);
    }
    return { minX, maxX, minY, maxY };
  }

  /** O toque (em NDC) acertou a carta? Com 30 px de folga em cada lado. */
  function acertou(xNdc, yNdc) {
    if (!grupo.visible || descartado) return false;
    const c = caixaNdc();
    if (!c) return false;
    const mx = (30 / (mundo.tamanho?.largura || innerWidth)) * 2;
    const my = (30 / (mundo.tamanho?.altura || innerHeight)) * 2;
    return xNdc >= c.minX - mx && xNdc <= c.maxX + mx && yNdc >= c.minY - my && yNdc <= c.maxY + my;
  }

  function caixaTela() {
    const c = caixaNdc();
    if (!c) return null;
    const L = mundo.tamanho?.largura || innerWidth;
    const A = mundo.tamanho?.altura || innerHeight;
    const left = (c.minX * 0.5 + 0.5) * L;
    const right = (c.maxX * 0.5 + 0.5) * L;
    const top = (-c.maxY * 0.5 + 0.5) * A;
    const bottom = (-c.minY * 0.5 + 0.5) * A;
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  /* ---- preparo ---- */

  /**
   * Texturas na GPU e shaders compilados num momento parado, para o primeiro
   * quadro não engasgar. Compila as duas variantes de transparência (a troca
   * com a foto atrás); compileAsync compila na hora e só espera o fim depois,
   * então a transparência volta ao que era antes de qualquer quadro.
   */
  function preparar() {
    if (preparo) return preparo;
    preparo = new Promise((resolve) => {
      if (descartado || !renderer) {
        resolve();
        return;
      }
      for (const t of texturas) renderer.initTexture?.(t);
      const comMistura = [matCorpo, matForro, matAba, matCarta];
      const antes = comMistura.map((m) => m.transparent);
      const trocar = (invertido) => comMistura.forEach((m, i) => {
        m.transparent = invertido ? !antes[i] : antes[i];
        m.needsUpdate = true;
      });
      const primeira = renderer.compileAsync(grupo, camera, cena);
      let segunda;
      trocar(true);
      try {
        segunda = renderer.compileAsync(grupo, camera, cena);
      } finally {
        trocar(false);
      }
      resolve(Promise.all([primeira, segunda]));
    }).then(() => {}, (erro) => console.error('[carta] preparar envelope', erro));
    return preparo;
  }

  /* ---- ações ---- */

  function pressionar(apertado) {
    if (modo !== 'espera' || descartado) return;
    guardar(gsap.to(pose, apertado
      ? { aperto: 1, duration: 0.12, ease: curvas.ui.resposta, overwrite: 'auto' }
      : { aperto: 0, duration: 0.5, ease: curvas.branco.entrar, overwrite: 'auto' }));
  }

  /** A carta vem de `distancia` m atrás (na névoa) e se endireita. Resolve quando ela para. */
  function chegar({ duracao = 2.4, distancia = 2.4, atraso = 0 } = {}) {
    if (descartado) return Promise.resolve();
    if (reduzido) {
      comum.uBranco.value = 1;
      return comoPromise(guardar(gsap.to(comum.uBranco, {
        value: 0, duration: Math.min(1.4, duracao), delay: atraso, ease: 'none',
      })));
    }
    entrada.k = 1;
    entrada.z = distancia;
    const tl = gsap.timeline({ delay: atraso });
    // A lanterna dentro dela se acende enquanto ela sai da névoa.
    tl.to(entrada, { z: 0, duration: duracao, ease: curvas.branco.entrar }, 0)
      .to(entrada, { k: 0, duration: duracao * 1.15, ease: 'power3.out' }, 0)
      .fromTo(luz, { dentro: 0.3 }, { dentro: 1, duration: 0.9, ease: curvas.yourname.florescer }, duracao * 0.4);
    const chegou = new Promise((resolve) => {
      tl.call(resolve, null, duracao);
      tl.eventCallback('onInterrupt', resolve);
    });
    guardar(tl);
    return chegou;
  }

  function brilharLaco(k = 0.7, duracao = 0.9) {
    if (descartado) return Promise.resolve();
    return comoPromise(guardar(gsap.to(uAcesoLaco, {
      value: clamp(Number(k) || 0), duration: duracao, ease: curvas.branco.entrar, overwrite: 'auto',
    })));
  }

  /** O lacre salta em três pedaços (e o farelo), com faíscas de ouro e uma rajada de pétalas. */
  function estourarLacre() {
    if (descartado || !lacreGrupo) return;
    grupo.updateWorldMatrix(true, true);
    const centro = lacreGrupo.getWorldPosition(V3());
    soltarFaiscas(centro);
    mundo.petalas?.rajada?.(centro.add(V3(0, 0, -0.01)), reduzido ? 6 : 14);
    const giroEnv = interno.getWorldQuaternion(new THREE.Quaternion());
    const frente = V3(0, 0, 1).applyQuaternion(giroEnv); // a normal do envelope no mundo
    const itens = [...pedacos.map((p) => [p.pivo, true]), ...farelo.map((m) => [m, false])];
    for (const [obj, pedaco] of itens) {
      obj.visible = true;
      const dir = V3(obj.position.x, obj.position.y, 0);
      if (dir.lengthSq() > 1e-12) dir.normalize();
      else dir.set(rnd() - 0.5, rnd() - 0.5, 0).normalize();
      dir.applyQuaternion(giroEnv);
      const forca = reduzido ? 0.04 : pedaco ? 0.16 + 0.08 * rnd() : 0.2 + 0.22 * rnd();
      const vel = dir.multiplyScalar(forca).addScaledVector(frente, reduzido ? 0.02 : 0.12 + 0.12 * rnd());
      if (!reduzido) vel.y += 0.28 + 0.3 * rnd();
      cena.attach(obj);
      const eixo = V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
      if (eixo.lengthSq() < 1e-9) eixo.set(0, 0, 1);
      voando.push({ obj, vel, eixo: eixo.normalize(), giro: reduzido ? 1 : 7 + 9 * rnd(), vida: reduzido ? 0.7 : 1.8 });
    }
    if (reduzido) guardar(gsap.to(uAlfaCera, { value: 0, duration: 0.6, ease: 'none' }));
  }

  /**
   * Abre a carta: o lacre trinca e salta com faíscas de ouro, o laço se desfaz
   * no próprio cordão, as voltas escorregam cada uma para um lado, a aba levanta
   * com o forro anil e o papel sobe. Resolve { papel } em ~3,27 s (~3,17 sem lacre).
   * A segunda chamada resolve na hora, mesmo com a primeira em curso.
   */
  function abrir() {
    if (env.aberto) return Promise.resolve({ papel });
    env.aberto = true;
    modo = 'abrindo';
    brilho.value = 99;
    const comLacre = !!lacreGrupo;
    // Tempos acoplados (a cena e o som dependem deles): tPapel = tAba + 0,72.
    const tLaco = comLacre ? 0.42 : 0.24;
    const tAba = comLacre ? 0.95 : 0.85;
    const tPapel = tAba + 0.72;
    const avisar = (marco) => {
      try {
        env.aoMarco?.(marco);
      } catch (erro) {
        console.error('[carta] aviso do envelope', erro);
      }
    };

    const tl = gsap.timeline();
    tl.to(pose, { aperto: 1, duration: 0.12, ease: curvas.ui.resposta }, 0)
      .to(pose, { aperto: 0, duration: 0.5, ease: curvas.branco.entrar }, 0.12)
      .to(pose, { flutua: 0, segue: 0, duration: 1.1, ease: 'power2.out' }, 0)
      .to(mola, { x: 0, y: 0, vx: 0, vy: 0, duration: 0.8, ease: 'power2.out' }, 0.4)
      .call(avisar, ['lacre'], 0.14);

    if (comLacre) {
      for (const p of pedacos) {
        tl.to(p.pivo.position, {
          x: p.centro.x + p.dir.x * 0.0006, y: p.centro.y + p.dir.y * 0.0006, duration: 0.1, ease: curvas.ui.resposta,
        }, 0.14)
          .to(p.pivo.rotation, { x: -p.dir.y * 0.06, y: p.dir.x * 0.06, duration: 0.1, ease: curvas.ui.resposta }, 0.14);
      }
      const tEstouro = reduzido ? 0.5 : 0.34;
      tl.call(estourarLacre, null, tEstouro)
        .to(sombras.uSombraLacre, { value: 0, duration: 0.2, ease: 'none' }, tEstouro);
    } else {
      tl.call(() => {
        if (descartado) return;
        const no = noMundo(0, LACRE_Y, zSuperficie(0, LACRE_Y) + alturaLaco);
        soltarFaiscas(no);
        mundo.petalas?.rajada?.(no, reduzido ? 6 : 12);
      }, null, 0.3);
    }

    // O nó acende e o brilho cai.
    tl.to(uAcesoLaco, { value: 1, duration: 0.16, ease: curvas.ui.resposta, overwrite: 'auto' }, tLaco - 0.12)
      .to(uAcesoLaco, { value: 0, duration: reduzido ? 0.5 : 0.8, ease: 'power2.out' }, tLaco + 0.08);
    if (reduzido) {
      tl.to(uAlfaFio, { value: 0, duration: 0.6, ease: 'none' }, tLaco)
        .to(sombras.uSombraFio, { value: 0, duration: 0.5, ease: 'none' }, tLaco)
        .call(() => { amarra.visible = false; }, null, tLaco + 0.62);
    } else {
      tl.to(laco.scale, { x: 0.25, y: 0.55, z: 1, duration: 0.34, ease: 'power2.in' }, tLaco)
        .to(laco.position, { y: LACRE_Y * 0.75, duration: 0.34, ease: 'power2.in' }, tLaco)
        .to(amarra.scale, { x: 1.05, y: 1.08, z: 1.6, duration: 0.36, ease: 'power2.out' }, tLaco + 0.22)
        .to(sombras.uSombraFio, { value: 0, duration: 0.35, ease: 'none' }, tLaco + 0.25)
        .to(laco.scale, { x: 0.02, y: 0.05, z: 1, duration: 0.3, ease: 'power2.in' }, tLaco + 0.34)
        .call(() => { laco.visible = false; }, null, tLaco + 0.64)
        .to(uAlfaFio, { value: 0, duration: 0.4, ease: 'power1.in' }, tLaco + 0.78)
        .call(() => { amarra.visible = false; }, null, tLaco + 1.2);
      // As voltas escorregam cada uma para um lado, com um pequeno atraso entre
      // elas: corda solta, não uma peça só.
      const destinos = [
        { x: -0.03, y: -0.2, rx: -0.1, rz: 0.12 },
        { x: 0.03, y: -0.23, rx: -0.18, rz: -0.12 },
      ];
      voltas.forEach((g, i) => {
        const d = destinos[i % 2];
        const t0 = tLaco + 0.34 + 0.08 * i;
        tl.to(g.userData.mat.uniforms.uSolta, { value: 1, duration: 0.5, ease: 'power2.out' }, t0)
          .to(g.position, { x: d.x, y: d.y, duration: 0.8, ease: 'power2.in' }, t0 + 0.12)
          .to(g.rotation, { x: d.rx, z: d.rz, duration: 0.8, ease: 'power1.in' }, t0 + 0.12);
      });
    }

    // A aba levanta (dobra no meio do caminho e assenta reta, um pouco além do plano).
    const abaP = { p: 0 };
    const girarAba = () => {
      const th = abaP.p * ABERTA;
      uAba.uTheta.value = th;
      uAba.uCurva.value = -3.4 * Math.sin(Math.min(Math.PI, th));
    };
    // Aberta, a luz de dentro sai pela boca e cresce um pouco.
    tl.to(abaP, { p: 1, duration: reduzido ? 1 : 1.3, ease: 'power2.inOut', onUpdate: girarAba }, tAba)
      .to(uAbertura, { value: 1, duration: 0.45, ease: 'none' }, tAba)
      .to(luz, { dentro: 1.3, duration: 0.8, ease: curvas.yourname.florescer }, tAba + 0.2);

    // O papel sobe pela boca, o envelope afunda um pouco e o papel vem para a frente.
    tl.call(() => {
      if (descartado) return;
      papel.visible = true;
      avisar('papel');
    }, null, tPapel)
      .to(papel.position, { y: 0.165, duration: 1.15, ease: 'power3.inOut' }, tPapel)
      .fromTo(papel.rotation, { z: 0.035 }, { z: 0, duration: 1.4, ease: curvas.branco.entrar, immediateRender: false }, tPapel)
      .to(pose, { y: -0.05, rx: 0.03, duration: 1.3, ease: curvas.branco.entrar }, tPapel + 0.2)
      .to(papel.rotation, { x: -0.06, duration: 0.5, ease: 'power2.inOut' }, tPapel + 0.55)
      .to(papel.position, { z: 0.028, duration: 0.6, ease: curvas.branco.entrar }, tPapel + 0.85)
      .to(papel.rotation, { x: 0, duration: 0.6, ease: curvas.branco.entrar }, tPapel + 1);
    guardar(tl);
    return comoPromise(tl).then(() => {
      if (!descartado && modo === 'abrindo') modo = 'aberto';
      return { papel };
    });
  }

  /**
   * O papel voa até a folha DOM (rect, ou uma função que o devolve) e desdobra;
   * o envelope cai para trás e se dissolve. O papel chega plano, sem luz e na
   * cor exata da folha, e fica anexado à câmera (não treme com o passo).
   */
  function entregarPapel(rect) {
    const alvo = typeof rect === 'function' ? rect() : rect;
    if (descartado || !alvo || typeof mundo.retanguloParaPose !== 'function') return Promise.resolve();
    modo = 'entregando';
    papel.visible = true;
    grupo.updateWorldMatrix(true, true);
    camera.updateWorldMatrix(true, false);
    const pose3 = mundo.retanguloParaPose(alvo, papel);
    // No celular a folha cobre a tela: o papel pousa 1,5% maior (no mínimo 2 px
    // de sobra em cada borda) e nenhuma lasca do mundo nem pétala aparece na troca.
    if (alvo.width >= innerWidth - 2) {
      pose3.escala.x *= Math.max(1.015, 1 + 4 / alvo.width);
      pose3.escala.y *= Math.max(1.015, 1 + 4 / alvo.height);
    }
    pose3.pai.attach(papel);
    papel.renderOrder = 20;
    matCarta.depthTest = false;
    matCarta.transparent = true;
    const deQ = papel.quaternion.clone();
    const pousar = () => {
      papel.position.copy(pose3.posicao);
      papel.quaternion.copy(pose3.quaternion);
      papel.scale.set(pose3.escala.x, pose3.escala.y, 1);
      uCarta.uDobra.value = 0;
      uCarta.uOnda.value = 0;
      uCarta.uPlano.value = 1;
    };

    const tl = gsap.timeline();
    if (reduzido) {
      // Sem voo: o papel aparece no lugar, plano.
      tl.to(uCarta.uOpac, { value: 0, duration: 0.35, ease: 'none' }, 0)
        .to(comum.uBranco, { value: 1, duration: 0.45, ease: 'none' }, 0)
        .call(() => {
          grupo.visible = false;
          pousar();
        }, null, 0.45)
        .to(uCarta.uOpac, { value: 1, duration: 0.5, ease: 'none' }, 0.45);
    } else {
      const giro = { p: 0 };
      const { x, y, z } = pose3.posicao;
      tl.to(papel.position, { x, y, z, duration: 1.8, ease: curvas.branco.camera }, 0)
        .to(papel.scale, { x: pose3.escala.x, y: pose3.escala.y, z: 1, duration: 1.8, ease: curvas.branco.camera }, 0)
        .to(giro, {
          p: 1,
          duration: 1.53,
          ease: 'power3.inOut',
          onUpdate: () => papel.quaternion.slerpQuaternions(deQ, pose3.quaternion, giro.p),
        }, 0)
        .to(uCarta.uDobra, { value: 0, duration: 1.26, ease: 'power2.inOut' }, 0.12)
        .to(uCarta.uOnda, { value: 0.006, duration: 0.63, ease: 'power2.out' }, 0.1)
        // a onda acaba antes do último quarto: o papel pousa plano
        .to(uCarta.uOnda, { value: 0, duration: 0.68, ease: 'power2.inOut' }, 0.73)
        .to(uCarta.uPlano, { value: 1, duration: 0.9, ease: 'power1.inOut' }, 0.54)
        .to(pose, { z: -0.32, y: -0.16, rx: -1.1, duration: 1.62, ease: curvas.branco.sair }, 0.05)
        .to(comum.uBranco, { value: 1, duration: 1.35, ease: 'power1.in' }, 0.15)
        .call(() => { grupo.visible = false; }, null, 1.656);
    }
    guardar(tl);
    return comoPromise(tl).then(() => {
      if (!descartado) pousar();
    });
  }

  /** O envelope vai embora na névoa (para trás e para cima) e fica invisível. */
  function irEmbora() {
    modo = 'indo';
    if (descartado || !grupo.visible) return Promise.resolve();
    const tl = gsap.timeline({ onComplete: () => { grupo.visible = false; } });
    tl.to(pose, { flutua: 0, segue: 0, duration: 0.6, ease: 'power2.out' }, 0);
    if (reduzido) {
      tl.to(comum.uBranco, { value: 1, duration: 0.9, ease: 'none' }, 0);
    } else {
      tl.to(pose, { z: -9, y: 0.8, duration: 2.4, ease: curvas.branco.sair }, 0)
        .to(pose, { rx: -0.45, rz: 0.28, ry: 0.3, duration: 2.4, ease: curvas.branco.deriva }, 0)
        .to(comum.uBranco, { value: 1, duration: 1.2, ease: 'power1.in' }, 1.3);
    }
    guardar(tl);
    return comoPromise(tl);
  }

  /** Libera tudo; idempotente. O cache de telas fica para a próxima carta. */
  function dispose() {
    if (descartado) return;
    descartado = true;
    const vivos = [...tweens];
    tweens.clear();
    for (const t of vivos) t.kill();
    for (const v of voando) v.obj.parent?.remove(v.obj);
    voando.length = 0;
    grupo.parent?.remove(grupo);
    papel.parent?.remove(papel);
    for (const g of geometrias) g.dispose();
    for (const m of materiais) m.dispose();
    for (const t of texturas) t.dispose();
    const i = aquecidos.findIndex((a) => a.env === env);
    if (i >= 0) aquecidos.splice(i, 1);
  }

  const env = {
    grupo,
    papel,
    lacre,
    amarracao,
    tema,
    aberto: false,
    aoMarco: null,
    get descartado() { return descartado; },
    // No fio, a ponta que desce além da borda de baixo; no cordão, a perna direita do laço.
    get ancoraFio() {
      grupo.updateWorldMatrix(true, true);
      return ponta.getWorldPosition(V3());
    },
    atualizar,
    acertou,
    caixaTela,
    preparar,
    brilharLaco,
    pressionar,
    chegar,
    abrir,
    entregarPapel,
    irEmbora,
    dispose,
  };
  return env;
}

/* ============================================================================
   VARIANTE LEVE (sem WebGL): DOM, SVG e CSS, com a mesma API
   Escala de 2000 px por metro: o SVG tem 460 × 320 (23 × 16 cm) e as medidas
   saem das mesmas constantes da 3D.
   ========================================================================== */

const S = 2000;
const LW = 460;
const LH = 320;
const CX = LW / 2;
const ly = (y) => Math.round(LH / 2 - y * S);
const BY = ly(BOCA_Y); // 152: a ponta da boca
const FY = ly(FUNDO_Y); // 188: a ponta da aba de baixo
const AY = ly(H / 2 - ABA_L); // 208: a ponta da aba de cima
const CY = ly(LACRE_Y); // 192: o centro do lacre

const BLOB = 'M0-33C10-34 21-29 27-21 34-15 37-5 34 5 37 14 31 24 22 29 13 35 2 34-7 33-19 33-29 25-32 14-36 4-35-8-29-17-23-27-12-33 0-33Z';
const MARCAS = {
  coracao: 'M0 9.5C-15 0-10-13 0-5.5 10-13 15 0 0 9.5z',
  estrela: 'M0-12 3.5-4 12-3.7 5.2 1.8 7.6 10.3 0 5.3-7.6 10.3-5.2 1.8-12-3.7-3.5-4z',
};

// .cl é centrada por margem (e não por transform) porque a GSAP anima scale,
// yPercent e rotation nela. O transform inline de .cl-corpo é escrito a cada
// quadro: nada mais pode morar ali.
const ESTILO_LEVE = `
.cl {
  --cl-l: min(72vw, 400px, 88vh);
  position: absolute; left: 50%; top: 53%;
  width: var(--cl-l); height: calc(var(--cl-l) * 0.6956);
  margin: calc(var(--cl-l) * -0.3478) 0 0 calc(var(--cl-l) * -0.5);
  -webkit-perspective: 1100px; perspective: 1100px;
  pointer-events: none;
}
@media (orientation: landscape) and (max-height: 520px) {
  .cl { --cl-l: min(calc(62vh * 1.4375), 400px); }
}
.cl-corpo {
  position: absolute; inset: 0;
  -webkit-transform-origin: 50% 60%; transform-origin: 50% 60%;
  will-change: transform;
}
.cl-corpo > * { position: absolute; display: block; }
.cl svg { overflow: visible; }
/* A lanterna dentro do papel acende a noite em volta; respira, não pisca. */
.cl::before {
  content: ''; position: absolute; inset: -22% -16%;
  background: radial-gradient(closest-side, rgba(255, 180, 94, 0.2), rgba(255, 180, 94, 0.07) 55%, rgba(255, 180, 94, 0));
  animation: cl-respira 4.6s ease-in-out infinite alternate;
}
@keyframes cl-respira { from { opacity: 0.7; } to { opacity: 1; } }
.cl-sombra {
  position: absolute; left: 4%; right: 4%; bottom: -9%; height: 16%;
  background: radial-gradient(closest-side, rgba(3, 5, 18, 0.4), rgba(3, 5, 18, 0));
}
.cl-faisca {
  position: absolute; left: 50%; top: 60%;
  width: calc(var(--cl-l) * 0.04); height: calc(var(--cl-l) * 0.04);
  margin: calc(var(--cl-l) * -0.02) 0 0 calc(var(--cl-l) * -0.02);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 241, 214, 1) 0 16%, rgba(255, 180, 94, 0.85) 32%, rgba(255, 180, 94, 0) 70%);
  visibility: hidden; opacity: 0; pointer-events: none;
}
.cl-forro { left: 0.5%; top: 0.5%; width: 99%; height: 99%; }
.cl-frente, .cl-amarra { left: 0; top: 0; width: 100%; height: 100%; }
.cl-aba {
  left: 0; top: 0; width: 100%; height: 66.875%;
  -webkit-transform-origin: 50% 0; transform-origin: 50% 0;
}
.cl-lacre { left: 41.3%; top: 47.5%; width: 17.4%; height: 25%; }
.cl-papel {
  left: 5.5%; top: 5%; width: 89%; height: 84%;
  background: var(--papel);
  box-shadow: 0 0 0 1px rgba(169, 124, 53, 0.2), 0 0 18px rgba(255, 180, 94, 0.18);
  visibility: hidden;
}
.cl-papel::before, .cl-papel::after {
  content: ''; position: absolute; left: 0; right: 0; height: 1px;
  background: rgba(169, 124, 53, 0.2);
  transition: opacity 0.6s;
}
.cl-papel::before { top: 33.3%; }
.cl-papel::after { top: 66.6%; }
.cl-sem-vinco::before, .cl-sem-vinco::after { opacity: 0; }
.cl-papel-solto {
  position: fixed; margin: 0; box-shadow: none; pointer-events: none;
  z-index: calc(var(--z-pergaminho) - 1);
}
`;

function garantirEstiloLeve() {
  if (document.getElementById('estilo-carta-leve')) return;
  const s = document.createElement('style');
  s.id = 'estilo-carta-leve';
  s.textContent = ESTILO_LEVE;
  document.head.append(s);
}

const n1 = (v) => +v.toFixed(1);

/** Curva suave (Catmull-Rom em Bézier cúbicas) pelos pontos [x, y], aberta ou fechada. */
function curvaSvg(pts, fechado = false) {
  const n = pts.length;
  const P = (i) => pts[fechado ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${n1(pts[0][0])} ${n1(pts[0][1])}`;
  for (let i = 0; i < (fechado ? n : n - 1); i++) {
    const a = P(i - 1);
    const b = P(i);
    const c = P(i + 1);
    const e = P(i + 2);
    d += `C${n1(b[0] + (c[0] - a[0]) / 6)} ${n1(b[1] + (c[1] - a[1]) / 6)} ${n1(c[0] - (e[0] - b[0]) / 6)} ${n1(c[1] - (e[1] - b[1]) / 6)} ${n1(c[0])} ${n1(c[1])}`;
  }
  return fechado ? `${d}Z` : d;
}

/** A pétala do forro (a mesma forma da textura 3D), em (x, y), raio r e ângulo em graus. */
function petalaSvg(x, y, r, ang, cor) {
  const k = (v) => n1(v * r);
  return `<path transform="translate(${x} ${y}) rotate(${ang})" fill="${cor}" d="M0 ${k(1)}C${k(-0.95)} ${k(0.3)} ${k(-0.78)} ${k(-0.95)} ${k(-0.12)} ${k(-0.92)}L0 ${k(-0.7)}L${k(0.12)} ${k(-0.92)}C${k(0.78)} ${k(-0.95)} ${k(0.95)} ${k(0.3)} 0 ${k(1)}Z"/>`;
}

/** A face do tema em JPEG (data:), para o pattern da leve; '' se não der. */
function urlDoTema(tema) {
  if (!urlsTema.has(tema)) {
    let url = '';
    try {
      url = telaTema(tema, 512).toDataURL('image/jpeg', 0.86);
    } catch (erro) {
      console.error('[carta] a face do tema', erro);
    }
    urlsTema.set(tema, url);
  }
  return urlsTema.get(tema);
}

/** As strings SVG da leve: forro, frente, aba, amarração e selo (null sem lacre). */
function desenhoLeve(lacre, amarracao, id, tema) {
  const url = tema ? urlDoTema(tema) : '';
  const pele = (nome) => (url ? `url(#${id}-tema)` : `url(#${id}-${nome})`);
  const claro = url ? 0.28 : 0.7; // com tema, realces mais discretos
  const fio = amarracao === 'fio';

  const forro = `<svg class="cl-forro" viewBox="0 0 ${LW} ${LH}" preserveAspectRatio="none" aria-hidden="true">
<defs><pattern id="${id}-petalas" width="46" height="46" patternUnits="userSpaceOnUse">
<rect width="46" height="46" fill="${COR_FORRO}"/>
${petalaSvg(12, 13, 7, 25, PETALAS_FORRO[0])}
${petalaSvg(33, 27, 6.2, -50, PETALAS_FORRO[1])}
${petalaSvg(17, 36, 5.4, 140, PETALAS_FORRO[2])}
<circle cx="38" cy="8" r="0.9" fill="#f6dca6" fill-opacity="0.6"/><circle cx="5" cy="27" r="0.7" fill="#f6dca6" fill-opacity="0.5"/>
</pattern></defs>
<rect width="${LW}" height="${LH}" rx="3" fill="url(#${id}-petalas)"/>
</svg>`;

  // O verso fechado: o corpo (com a boca em V aberta), a costura e a aba de baixo.
  const bocaV = `M0 0L${CX} ${BY}L${LW} 0`;
  const corpo = `M0 3Q0 0 3 0L${CX} ${BY}L${LW - 3} 0Q${LW} 0 ${LW} 3V${LH - 3}Q${LW} ${LH} ${LW - 3} ${LH}H3Q0 ${LH} 0 ${LH - 3}Z`;
  const beiraFundo = `M0 ${LH - 3}L${CX - 22} ${FY + 9}Q${CX} ${FY - 3} ${CX + 22} ${FY + 9}L${LW} ${LH - 3}`;
  const abaFundo = `${beiraFundo}Q${LW} ${LH} ${LW - 3} ${LH}H3Q0 ${LH} 0 ${LH - 3}Z`;
  const beiraAba = `M0 3L${CX - 22} ${AY - 14}Q${CX} ${AY + 4} ${CX + 22} ${AY - 14}L${LW} 3`;
  const abaCima = `M0 3Q0 0 3 0H${LW - 3}Q${LW} 0 ${LW} 3L${CX + 22} ${AY - 14}Q${CX} ${AY + 4} ${CX - 22} ${AY - 14}Z`;

  // O lume: o papel aceso por dentro (claro no meio) e a beira quente, como numa
  // lanterna de papel. Em coordenadas da carta, para a aba casar com o corpo.
  const lume = (nome) => `<radialGradient id="${id}-${nome}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(${CX} ${Math.round(LH * 0.56)}) scale(${Math.round(LW * 0.62)} ${Math.round(LH * 0.66)})">
<stop offset="0" stop-color="#fff6e2" stop-opacity="${url ? 0.22 : 0.6}"/><stop offset="0.55" stop-color="#fff6e2" stop-opacity="0"/>
<stop offset="0.8" stop-color="#ffb45e" stop-opacity="0.1"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0.34"/></radialGradient>`;
  const NOITE = '#03050f'; // sombra é noite, nunca preto puro

  const frente = `<svg class="cl-frente" viewBox="0 0 ${LW} ${LH}" aria-hidden="true">
<defs>
<linearGradient id="${id}-luz" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf2de"/><stop offset="1" stop-color="#ecd8b4"/></linearGradient>
<linearGradient id="${id}-luz2" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#f7ebd2"/><stop offset="1" stop-color="#e6cfa6"/></linearGradient>
${lume('lume')}
<clipPath id="${id}-boca"><path d="${bocaV}Z"/></clipPath>
${url ? `<pattern id="${id}-tema" width="${LW}" height="${LH}" patternUnits="userSpaceOnUse"><image href="${url}" width="${LW}" height="${LH}" preserveAspectRatio="none"/></pattern>` : ''}
</defs>
<g clip-path="url(#${id}-boca)" fill="none" stroke="${NOITE}">
<path d="${bocaV}" stroke-width="22" stroke-opacity="0.14" transform="translate(1 -4)"/>
<path d="${bocaV}" stroke-width="9" stroke-opacity="0.18" transform="translate(0.5 -1.5)"/>
</g>
<path d="${corpo}" fill="${pele('luz')}"/>
<path d="M${CX} ${BY}V${FY + 2}" stroke="#c9ae84" stroke-width="1"/>
<path d="${beiraFundo}" fill="none" stroke="${NOITE}" stroke-opacity="0.12" stroke-width="5"/>
<path d="${abaFundo}" fill="${pele('luz2')}"/>
<path d="${corpo}" fill="url(#${id}-lume)"/>
<g fill="none" stroke="#fff1d6" stroke-width="1.2" stroke-opacity="${claro}" stroke-linecap="round">
<path d="M1.5 1L${CX} ${BY - 0.8}L${LW - 1.5} 1"/>
<path d="${beiraFundo}" transform="translate(0 0.8)"/>
</g>
<g class="cl-sombra-aba" fill="none" stroke="${NOITE}" stroke-linejoin="round">
<path d="${beiraAba}" stroke-width="10" stroke-opacity="0.1" transform="translate(1.5 3)"/>
<path d="${beiraAba}" stroke-width="4" stroke-opacity="0.13" transform="translate(0.8 1.6)"/>
</g>
</svg>`;

  const aba = `<svg class="cl-aba" viewBox="0 0 ${LW} ${Math.round(LH * 0.66875)}" aria-hidden="true">
<defs><linearGradient id="${id}-aba" x1="0" y1="0" x2="0.25" y2="1"><stop offset="0" stop-color="#f9eed6"/><stop offset="1" stop-color="#e9d3ac"/></linearGradient>
${lume('lume-aba')}</defs>
<g class="cl-aba-fora" visibility="visible">
<path d="${abaCima}" fill="${pele('aba')}"/>
<path d="${abaCima}" fill="url(#${id}-lume-aba)"/>
<path d="M3 0.8H${LW - 3}" stroke="${NOITE}" stroke-opacity="0.1" stroke-width="1.6"/>
<path d="${beiraAba}" fill="none" stroke="${NOITE}" stroke-opacity="0.16" stroke-width="1"/>
<path d="${beiraAba}" fill="none" stroke="#fff1d6" stroke-opacity="${claro}" stroke-width="1.2" transform="translate(0 -1)"/>
</g>
<g class="cl-aba-dentro" visibility="hidden">
<path d="${abaCima}" fill="url(#${id}-petalas)"/>
<path d="${abaCima}" fill="#ffb45e" fill-opacity="0.06"/>
<path d="${beiraAba}" fill="none" stroke="#e9c27a" stroke-opacity="0.6" stroke-width="1.2"/>
</g>
</svg>`;

  // A amarração: torção em listras diagonais (as duas pernas) e sombra deslocada.
  const r = fio ? 1.7 : 3.2;
  const T = n1(2.6 * r);
  const [c1, c2] = tema ? TEMAS[tema].cordao : [COR_CORDAO, '#9d0c1f'];
  const traco = `fill="none" stroke="url(#${id}-torcao)" stroke-width="${n1(2 * r)}" stroke-linecap="round" stroke-linejoin="round"`;
  const sombraTraco = `class="cl-rastro" fill="none" stroke="${NOITE}" stroke-opacity="0.14" stroke-width="${n1(3 * r)}" stroke-linecap="round" transform="translate(2 4)"`;
  // O fio brilha: um halo vermelho largo e fraco por baixo do traço.
  const haloTraco = `class="cl-rastro" fill="none" stroke="#ff404e" stroke-opacity="0.16" stroke-width="${n1(6.5 * r)}" stroke-linecap="round" stroke-linejoin="round"`;
  const alca = (pts, justo) => curvaSvg(pts.map(([x, y]) => [CX + x * S * (justo ? 0.86 : 1), CY - y * S * (justo ? 0.9 : 1)]), true);
  const aberta = (pts) => curvaSvg(pts.map(([x, y]) => [CX + x * S, CY - y * S]));

  let voltas;
  let laco;
  let ponta = '';
  if (fio) {
    voltas = [`M-4 ${CY - 5}H${LW + 4}`, `M-4 ${CY + 1}L${LW + 4} ${CY + 9}`];
    laco = [...LACO_FIO.alcas.map((a) => alca(a, false)), aberta(LACO_FIO.perna)];
    // a cauda longa desce 24 px além da base: é por ela que chega o fio do caminho
    ponta = curvaSvg([...LACO_FIO.cauda.map(([x, y]) => [CX + x * S, CY - y * S]), [CX + 3.6, LH - 2], [CX + 3.2, LH + 24]]);
  } else {
    voltas = [`M-5 ${CY}H${LW + 5}`, `M${CX} -5V${LH + 5}`];
    laco = [...LACO_CORDAO.alcas.map((a) => alca(a, true)), ...LACO_CORDAO.caudas.map(aberta)];
  }
  const amarra = `<svg class="cl-amarra" viewBox="0 0 ${LW} ${LH}" aria-hidden="true">
<defs><pattern id="${id}-torcao" width="${T}" height="${T}" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
<rect width="${T}" height="${T}" fill="${c1}"/><rect width="${T}" height="${n1(T / 2)}" fill="${c2}"/>
<rect y="${n1(T / 2 - 0.35)}" width="${T}" height="0.7" fill="rgba(42,27,34,0.25)"/>
</pattern></defs>
<g class="cl-voltas">
<path d="${[...voltas, ponta].join('')}" ${sombraTraco}/>
<path d="${[...voltas, ponta].join('')}" ${haloTraco}/>
${voltas.map((v) => `<path class="cl-volta" d="${v}" ${traco}/>`).join('\n')}
</g>
${ponta ? `<path class="cl-ponta" d="${ponta}" ${traco}/>` : ''}
<g class="cl-laco">
<path d="${laco.join('')}" ${sombraTraco}/>
<path d="${laco.join('')}" ${haloTraco}/>
${laco.map((d) => `<path d="${d}" ${traco}/>`).join('\n')}
<circle cx="${CX}" cy="${CY}" r="${n1(1.6 * r)}" fill="${c1}"/>
<circle cx="${n1(CX - 0.5 * r)}" cy="${n1(CY - 0.6 * r)}" r="${n1(0.5 * r)}" fill="#fff" fill-opacity="0.25"/>
</g>
</svg>`;

  // O selo é sempre de cera de ouro (o vermelho cheio é só do fio), em duas metades pré-trincadas.
  let selo = null;
  if (lacre) {
    const m = MARCAS[lacre] || MARCAS.coracao;
    const metade = (corte) => `<g class="cl-metade" clip-path="url(#${id}-${corte})">
<path d="${BLOB}" fill="url(#${id}-cera)"/>
<circle r="21" fill="none" stroke="#6e4d18" stroke-width="2.4" stroke-opacity="0.55"/>
<circle r="21" fill="none" stroke="#fff0c8" stroke-width="1" stroke-opacity="0.55" transform="translate(-0.8 -1)"/>
<g transform="scale(1.25)">
<path d="${m}" fill="#fff3d0" fill-opacity="0.75" transform="translate(-0.4 -0.6)"/>
<path d="${m}" fill="#6e4d18" fill-opacity="0.6" transform="translate(0.6 0.9)"/>
<path d="${m}" fill="#c39446"/>
</g>
<ellipse cx="-12" cy="-16" rx="9" ry="4.5" fill="#fff6dc" fill-opacity="0.34" transform="rotate(-32 -12 -16)"/>
</g>`;
    selo = `<svg class="cl-lacre" viewBox="-40 -40 80 80" aria-hidden="true">
<defs>
<radialGradient id="${id}-cera" cx="0.38" cy="0.34" r="0.75"><stop offset="0" stop-color="#f6dca6"/><stop offset="0.55" stop-color="${COR_CERA}"/><stop offset="1" stop-color="#7d5a22"/></radialGradient>
<clipPath id="${id}-corte-a"><path d="M-40-40H3L-3-20 5-8-4 4 4 17-2 40H-40Z"/></clipPath>
<clipPath id="${id}-corte-b"><path d="M40-40H3L-3-20 5-8-4 4 4 17-2 40H40Z"/></clipPath>
</defs>
<path class="cl-sombra-lacre" d="${BLOB}" fill="#03050f" fill-opacity="0.28" transform="translate(2 4) scale(1.03)"/>
${metade('corte-a')}
${metade('corte-b')}
</svg>`;
  }

  return { forro, frente, aba, amarra, selo };
}

/** A carta sem WebGL: a mesma API do env da 3D, em DOM. */
function criarEnvelopeLeve(mundo, opcoes = {}) {
  const gsap = window.gsap;
  const { lacre, amarracao, tema } = normalizar(opcoes);
  const reduzido = !!mundo?.amb?.reduzido;
  const calmo = reduzido ? 0.3 : 1;
  const chegada = opcoes?.chegada ?? 2;
  const recipiente = mundo?.recipienteLeve || document.getElementById('mundo-leve') || document.body;
  garantirEstiloLeve();
  const id = `cl${++contadorLeve}`;
  const d = desenhoLeve(lacre, amarracao, id, tema);

  const carta = el('div', 'cl');
  const sombra = el('div', 'cl-sombra');
  const corpo = el('div', 'cl-corpo');
  const forro = svg(d.forro);
  const frente = svg(d.frente);
  const aba = svg(d.aba);
  const amarra = svg(d.amarra);
  const selo = d.selo ? svg(d.selo) : null;
  const papel = el('div', { class: 'cl-papel', 'aria-hidden': 'true' });
  // Empilhamento: forro 0, papel 1, frente 2, aba 3, amarração 4 e selo 5.
  [forro, papel, frente, aba, amarra, selo].forEach((n, i) => {
    if (!n) return;
    n.style.zIndex = String(i);
    corpo.append(n);
  });
  carta.append(sombra, corpo);
  recipiente.append(carta);
  // A cena usa papel.visible nos dois modos.
  Object.defineProperty(papel, 'visible', {
    get: () => papel.style.visibility !== 'hidden',
    set: (v) => { papel.style.visibility = v ? 'visible' : 'hidden'; },
  });
  papel.style.visibility = 'hidden';

  const tweens = new Set();
  const guardar = (t) => {
    tweens.add(t);
    comoPromise(t).then(() => tweens.delete(t));
    return t;
  };
  const mola = { x: 0, y: 0, vx: 0, vy: 0 }; // graus
  const pose = { y: 0, flutua: 1, segue: 1, aperto: 0 };
  const luzLaco = { k: 0 };
  let modo = 'espera';
  let descartado = false;
  let env = null;

  const avisar = (marco) => {
    try {
      env.aoMarco?.(marco);
    } catch (erro) {
      console.error('[carta] aviso do envelope', erro);
    }
  };

  function entrar(duracao = 2, atraso = 0) {
    if (descartado || !gsap) return Promise.resolve();
    const tw = reduzido
      ? gsap.fromTo(carta, { autoAlpha: 0 }, { autoAlpha: 1, duration: Math.min(1.2, duracao), delay: atraso, ease: 'none' })
      : gsap.fromTo(carta, { autoAlpha: 0, scale: 0.42, yPercent: -18, rotation: -5 }, {
        autoAlpha: 1, scale: 1, yPercent: 0, rotation: 0,
        duration: Math.max(0.8, duracao), delay: atraso, ease: curvas.branco.entrar, immediateRender: true,
      });
    return comoPromise(guardar(tw));
  }

  // O dt não é multiplicado por amb.rapido aqui: só as timelines da GSAP aceleram.
  function atualizar(dt, tempo) {
    if (descartado) return;
    const t = Number(tempo) || 0;
    const h = Math.min(Number(dt) || 0, 1 / 30);
    const alvoX = -(mundo?.ponteiro?.y || 0) * 9 * calmo * pose.segue;
    const alvoY = (mundo?.ponteiro?.x || 0) * 11 * calmo * pose.segue;
    mola.vx += ((alvoX - mola.x) * 30 - mola.vx * 6) * h;
    mola.vy += ((alvoY - mola.y) * 30 - mola.vy * 6) * h;
    mola.x += mola.vx * h;
    mola.y += mola.vy * h;
    const fl = pose.flutua * calmo;
    const ty = Math.sin(t * 0.9) * 5 * fl + pose.y + pose.aperto * 2;
    const ry = mola.y + Math.sin(t * 0.37) * 4 * fl;
    const rz = Math.sin(t * 0.6 + 1.3) * 1.1 * fl;
    const s = 1 - pose.aperto * 0.015;
    corpo.style.transform = `translate3d(0, ${ty.toFixed(2)}px, 0) rotateX(${mola.x.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) rotate(${rz.toFixed(3)}deg) scale(${s.toFixed(4)})`;
  }

  /** O toque (em NDC) acertou a carta? Com 30 px de folga em cada lado. */
  function acertou(xNdc, yNdc) {
    if (descartado || carta.style.visibility === 'hidden') return false;
    const x = (xNdc * 0.5 + 0.5) * innerWidth;
    const y = (-yNdc * 0.5 + 0.5) * innerHeight;
    const r = carta.getBoundingClientRect();
    return x >= r.left - 30 && x <= r.right + 30 && y >= r.top - 30 && y <= r.bottom + 30;
  }

  function caixaTela() {
    const r = carta.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }

  function pressionar(apertado) {
    if (modo !== 'espera' || descartado || !gsap) return;
    guardar(gsap.to(pose, apertado
      ? { aperto: 1, duration: 0.12, ease: curvas.ui.resposta, overwrite: 'auto' }
      : { aperto: 0, duration: 0.45, ease: curvas.branco.entrar, overwrite: 'auto' }));
  }

  // A distância não se aplica aqui: a carta cresce no lugar.
  function chegar({ duracao = 2.4, atraso = 0 } = {}) {
    return entrar(duracao, atraso);
  }

  function brilharLaco(k = 0.7, duracao = 0.9) {
    const laco = carta.querySelector('.cl-laco');
    if (!laco || !gsap || descartado) return Promise.resolve();
    luzLaco.k = Number(laco.dataset.brilho) || 0;
    return comoPromise(guardar(gsap.to(luzLaco, {
      k: clamp(Number(k) || 0),
      duration: duracao,
      ease: curvas.branco.entrar,
      overwrite: 'auto',
      onUpdate: () => {
        const v = luzLaco.k;
        laco.dataset.brilho = v.toFixed(3);
        laco.style.filter = v > 0.01 ? `drop-shadow(0 0 ${(v * 7).toFixed(2)}px rgba(255, 186, 110, ${v.toFixed(3)}))` : '';
      },
    })));
  }

  /** Faíscas de ouro saem do lacre e sobem; com movimento reduzido, ficam paradas e só se apagam. */
  function soltarFaiscas(largura) {
    const l = largura || 300;
    const rnd = semente(1223);
    for (let i = 0; i < (reduzido ? 6 : 14); i++) {
      const f = el('span', 'cl-faisca');
      carta.append(f);
      const a = rnd() * TAU;
      const tam = 0.6 + 0.6 * rnd();
      const vida = 1.1 + 0.8 * rnd();
      const tl = gsap.timeline({ onComplete: () => f.remove() });
      if (reduzido) {
        gsap.set(f, { x: Math.cos(a) * 0.08 * l, y: Math.sin(a) * 0.05 * l, scale: tam });
        tl.to(f, { autoAlpha: 1, duration: 0.25, ease: 'none' }).to(f, { autoAlpha: 0, duration: 0.8, ease: 'none' }, 0.5);
      } else {
        const forca = (0.12 + 0.3 * rnd()) * l;
        tl.fromTo(f, { x: 0, y: 0, scale: tam }, {
          x: Math.cos(a) * forca, y: Math.sin(a) * forca * 0.55 - (0.1 + 0.12 * rnd()) * l, scale: tam * 0.55,
          duration: vida, ease: 'power3.out',
        }, 0)
          .to(f, { autoAlpha: 1, duration: 0.12, ease: 'none' }, 0)
          .to(f, { autoAlpha: 0, duration: vida * 0.6, ease: 'power1.in' }, vida * 0.4);
      }
      guardar(tl);
    }
  }

  /**
   * Abre a carta: o selo trinca em duas metades que caem (com faíscas de ouro),
   * o laço se desfaz, as voltas escorregam, a aba vira mostrando o forro anil e
   * o papel sobe. ~3,2 s. A segunda chamada resolve na hora.
   */
  function abrir() {
    if (env.aberto) return Promise.resolve({ papel });
    env.aberto = true;
    modo = 'abrindo';
    const q = (s) => carta.querySelector(s);
    const tl = gsap.timeline();
    tl.to(pose, { aperto: 1, duration: 0.12, ease: curvas.ui.resposta }, 0)
      .to(pose, { aperto: 0, duration: 0.45, ease: curvas.branco.entrar }, 0.12)
      .to(pose, { flutua: 0, segue: 0, duration: 1, ease: 'power2.out' }, 0)
      .to(mola, { x: 0, y: 0, vx: 0, vy: 0, duration: 0.8, ease: 'power2.out' }, 0.3)
      .call(() => {
        if (descartado) return;
        avisar('lacre');
        const r = carta.getBoundingClientRect();
        soltarFaiscas(r.width);
        // Sempre 12: com movimento reduzido, as pétalas leves já tiram dois terços sozinhas.
        mundo?.petalas?.rajada?.({ px: r.left + r.width / 2, py: r.top + r.height * 0.6 }, 12);
      }, null, 0.16);

    if (selo && reduzido) {
      tl.to(selo, { autoAlpha: 0, duration: 0.5, ease: 'none' }, 0.2);
    } else if (selo) {
      const [a, b] = selo.querySelectorAll('.cl-metade');
      tl.to(a, { x: -3, rotation: -6, svgOrigin: '0 10', duration: 0.12, ease: curvas.ui.resposta }, 0.14)
        .to(b, { x: 3, rotation: 6, svgOrigin: '0 10', duration: 0.12, ease: curvas.ui.resposta }, 0.14)
        .to(q('.cl-sombra-lacre'), { autoAlpha: 0, duration: 0.18, ease: 'none' }, 0.28)
        .to(a, { x: -60, y: 260, rotation: -160, duration: 1.2, ease: 'power2.in' }, 0.3)
        .to(b, { x: 70, y: 280, rotation: 190, duration: 1.25, ease: 'power2.in' }, 0.3)
        .to(selo, { autoAlpha: 0, duration: 0.3, ease: 'none' }, 1.2);
    }

    if (reduzido) {
      tl.to(amarra, { autoAlpha: 0, duration: 0.5, ease: 'none' }, 0.3);
    } else {
      const origem = `${CX} ${CY}`;
      tl.to(q('.cl-laco'), { scaleX: 0.3, scaleY: 0.6, svgOrigin: origem, autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, 0.4)
        .to(amarra, { scaleX: 1.04, scaleY: 1.06, duration: 0.35, ease: 'power2.out' }, 0.6)
        .to(carta.querySelectorAll('.cl-voltas > .cl-rastro'), { autoAlpha: 0, duration: 0.3, ease: 'none' }, 0.7);
      // Cada volta escorrega para um lado, com um pequeno atraso entre elas.
      carta.querySelectorAll('.cl-volta').forEach((v, i) => {
        const lado = i % 2 ? 1 : -1;
        tl.to(v, {
          x: lado * 14, y: LH * (0.75 + 0.1 * i), rotation: lado * -9, svgOrigin: origem, duration: 0.85, ease: 'power2.in',
        }, 0.9 + 0.1 * i);
      });
      tl.to(amarra, { autoAlpha: 0, duration: 0.3, ease: 'none' }, 1.5);
    }

    // A aba vira na dobradiça (vem na direção dela e passa para cima); a 90° o
    // lado de fora dá lugar ao forro e ela desce para trás do papel.
    const fora = aba.querySelector('.cl-aba-fora');
    const dentro = aba.querySelector('.cl-aba-dentro');
    const giro = { a: 0 };
    let virada = false;
    tl.to(q('.cl-sombra-aba'), { autoAlpha: 0, duration: 0.3, ease: 'none' }, 0.95)
      .to(giro, {
        a: 180,
        duration: reduzido ? 0.9 : 1.2,
        ease: 'power2.inOut',
        onUpdate: () => {
          aba.style.transform = `perspective(1100px) rotateX(${giro.a.toFixed(2)}deg)`;
          const agora = giro.a >= 90;
          if (agora === virada) return;
          virada = agora;
          fora.setAttribute('visibility', agora ? 'hidden' : 'visible');
          dentro.setAttribute('visibility', agora ? 'visible' : 'hidden');
          aba.style.zIndex = agora ? '0' : '3';
        },
      }, 0.95);

    tl.call(() => {
      if (descartado) return;
      papel.visible = true;
      avisar('papel');
    }, null, 1.65)
      .fromTo(papel, { yPercent: 0 }, { yPercent: -104, duration: 1.3, ease: 'power3.inOut', immediateRender: false }, 1.65)
      .call(() => { papel.style.zIndex = '6'; }, null, 2.9)
      .to(pose, { y: 26, duration: 1.4, ease: curvas.branco.entrar }, 1.8);
    guardar(tl);
    return comoPromise(tl).then(() => {
      if (!descartado && modo === 'abrindo') modo = 'aberto';
      return { papel };
    });
  }

  /**
   * O papel sai da carta para o body e voa até a folha DOM (rect, ou uma função
   * que o devolve); as dobras somem. O voo é por transform (FLIP): o papel já
   * fica no retângulo final e parte do lugar de onde saiu. Fica no body até o dispose.
   */
  function entregarPapel(rect) {
    const alvo = typeof rect === 'function' ? rect() : rect;
    if (descartado || !alvo || !gsap) return Promise.resolve();
    modo = 'entregando';
    const de = papel.getBoundingClientRect();
    document.body.append(papel);
    papel.classList.add('cl-papel-solto');
    papel.style.zIndex = '';
    gsap.set(papel, { clearProps: 'transform' });
    gsap.set(papel, { left: alvo.left, top: alvo.top, width: alvo.width, height: alvo.height, transformOrigin: '0 0', autoAlpha: 1 });
    const tl = gsap.timeline();
    if (reduzido) {
      gsap.set(papel, { autoAlpha: 0 });
      papel.classList.add('cl-sem-vinco');
      tl.to(papel, { autoAlpha: 1, duration: 0.6, ease: 'none' }, 0)
        .to(carta, { autoAlpha: 0, duration: 0.6, ease: 'none' }, 0);
    } else {
      const w = alvo.width || 1;
      const h = alvo.height || 1;
      tl.fromTo(papel, {
        x: de.left - alvo.left, y: de.top - alvo.top, scaleX: de.width / w, scaleY: de.height / h,
      }, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: 1.5, ease: curvas.branco.camera }, 0)
        .call(() => papel.classList.add('cl-sem-vinco'), null, 0.5)
        .to(carta, { autoAlpha: 0, scale: 0.86, yPercent: 8, duration: 1.1, ease: curvas.branco.sair }, 0.05);
    }
    return comoPromise(guardar(tl));
  }

  function irEmbora() {
    modo = 'indo';
    if (descartado || !gsap) return Promise.resolve();
    const tw = reduzido
      ? gsap.to(carta, { autoAlpha: 0, duration: 0.9, ease: 'none' })
      : gsap.to(carta, { autoAlpha: 0, scale: 0.5, yPercent: -16, rotation: 4, duration: 1.6, ease: curvas.branco.sair });
    return comoPromise(guardar(tw));
  }

  /** Libera tudo; idempotente. O <style> fica (é de todas as cartas leves). */
  function dispose() {
    if (descartado) return;
    descartado = true;
    const vivos = [...tweens];
    tweens.clear();
    for (const t of vivos) t.kill();
    carta.remove();
    papel.remove();
  }

  env = {
    grupo: objetoLeve(), // a cena pode escrever em grupo.position sem erro
    papel,
    lacre,
    amarracao,
    tema,
    aberto: false,
    aoMarco: null,
    get descartado() { return descartado; },
    // Em px de tela: o centro de baixo da ponta do fio (no cordão, da carta).
    get ancoraFio() {
      const r = (carta.querySelector('.cl-ponta') || carta).getBoundingClientRect();
      const v = vetorLeve(0, 0, 0);
      v.px = r.left + r.width / 2;
      v.py = r.bottom;
      return v;
    },
    atualizar,
    acertou,
    caixaTela,
    brilharLaco,
    pressionar,
    chegar,
    abrir,
    entregarPapel,
    irEmbora,
    dispose,
  };

  if (typeof chegada === 'number' && chegada > 0) entrar(chegada);
  else gsap?.set(carta, { autoAlpha: 0 });
  return env;
}

/* ============================================================================
   API pública
   ========================================================================== */

const pronta = (mundo, chave) => aquecidos.findIndex((a) => a.chave === chave && a.mundo === mundo && !a.env.descartado);

/** A carta: leve sem WebGL; com WebGL, a pré-aquecida de mesma chave ou uma 3D nova. */
export function criarEnvelope(mundo, opcoes = {}) {
  if (!mundo?.ok) return criarEnvelopeLeve(mundo, opcoes);
  const i = pronta(mundo, chaveDe(opcoes));
  if (i >= 0) return aquecidos.splice(i, 1)[0].env;
  return criarEnvelope3D(mundo, opcoes);
}

/**
 * Pré-cria a próxima carta 3D num momento parado (texturas geradas, shaders
 * compilados, texturas na GPU), para o primeiro passo dela não engasgar.
 */
export function aquecerEnvelope(mundo, opcoes = {}) {
  if (!mundo?.ok) return Promise.resolve();
  const chave = chaveDe(opcoes);
  if (pronta(mundo, chave) >= 0) return Promise.resolve();
  try {
    const env = criarEnvelope3D(mundo, opcoes);
    aquecidos.push({ chave, mundo, env });
    return Promise.resolve(env.preparar()).catch((erro) => console.error('[carta] aquecer envelope', erro));
  } catch (erro) {
    console.error('[carta] aquecer envelope', erro);
    return Promise.resolve();
  }
}
