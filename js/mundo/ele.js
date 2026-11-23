/* ============================================================================
   ELE: o rapaz de pé no fim do fio
   ============================================================================
   Visto de costas e de longe na alameda ao entardecer; de frente, sorrindo de
   olhos fechados e com a mão aberta, na entrega da última carta. Não é imagem
   de arquivo: é pintado uma vez num canvas 2D de 1024 × 2048 e posto como
   textura num plano em pé no chão, com uma sombra de contato deitada. O shader
   usa a névoa e a luz da hora da alameda (os mesmos uniformes, por referência):
   de longe ele é um vulto na névoa, ganha corpo conforme ela chega e escurece
   com a tarde, sem código extra. Um PNG seria um adesivo.

   Só existe com WebGL: sem ele, criarEle devolve null e a entrega usa
   pintarEleEntrega() como canvas no DOM (.ele-leve, em js/cenas/final.js).
   A pintura usa shadowBlur e getTransform, nunca ctx.filter, que o Safari do
   iPhone não tem.

   API de criarEle(mundo): grupo, prepararEntrega(), entregar(),
   ancoraCarta(olhos, saida), ancora(saida), mostrar(duracao), sair(duracao),
   dispose().
   ========================================================================== */

import { curvas, comoPromise } from '../nucleo/movimento.js';

const ALTURA = 1.74; // m, do chão ao alto do cabelo
// 1024 de largura: de perto ela chega a ~4 m dele, e 512 ficava mole.
const TEX_L = 1024;
const TEX_A = 2048;
const FIG = 1920; // altura da figura na textura (px)
const TOPO = 64; // margem acima do cabelo (px)
// A mão que segura o fio (o laço no dedinho) e a mão que segura a carta, em
// fração da figura: x a partir do eixo, y do alto do cabelo (0) às solas (1).
const MAO = { x: 0.124, y: 0.568 };
const MAO_CARTA = { x: 0.036, y: 0.352, frente: 0.14 };
const LUZ = 'rgb(255, 190, 150)'; // a contraluz morna da tarde

const VERT = `
varying vec2 vUv;
varying vec3 vWp;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// A mesma névoa da alameda (expoente 1.45), um nada mais rala (uLonge 0.8) para
// o vulto se ler de longe. Como a alameda, escreve a cor em sRGB, sem a conversão
// de espaço de cor do three: a textura do canvas fica sem colorSpace de propósito.
const FRAG = `
precision highp float;
uniform sampler2D uMapa;
uniform vec3 uNevoa;
uniform vec3 uCeu;
uniform float uDens;
uniform float uTarde;
uniform float uOpacidade;
uniform float uLonge;
varying vec2 vUv;
varying vec3 vWp;
void main() {
  vec4 t = texture2D(uMapa, vUv);
  float a = t.a * uOpacidade;
  if (a < 0.004) discard;
  vec3 c = mix(t.rgb, t.rgb * vec3(0.5, 0.47, 0.64), uTarde);
  vec3 d = vWp - cameraPosition;
  float dist = length(d);
  float f = 1.0 - exp(-pow(dist * uDens * uLonge, 1.45));
  vec3 nc = mix(uNevoa, uCeu, smoothstep(0.0, 0.55, d.y / max(dist, 0.001)));
  c = mix(c, nc, f);
  gl_FragColor = vec4(c, a * (1.0 - 0.3 * f));
}
`;

/* ---- a pintura -------------------------------------------------------------- */

/**
 * Pinta a figura em `ctx` (w × h). A ordem dos desenhos é a figura: cada chamada
 * cobre as anteriores. Unidades: a altura da figura (S px); x a partir do eixo
 * (positivo = direita de quem o vê de costas), y de 0 (alto do cabelo) a 1 (solas).
 */
function pintar(ctx, w, h, pose = 'costas') {
  const doc = ctx.canvas?.ownerDocument || document;
  const entrega = pose === 'entrega';
  const S = (h * 960) / 1024;
  const topo = (h * 32) / 1024;
  const k = S / 960; // px por unidade de desfoque

  const nova = () => {
    const t = doc.createElement('canvas');
    t.width = w;
    t.height = h;
    return t;
  };
  const tela = nova();
  const c = tela.getContext('2d');
  c.translate(w / 2, topo);
  c.scale(S, S);

  // Contorno fechado que passa pelos pontos (Catmull-Rom em bézier, tensão t).
  const curva = (pts, t = 1) => {
    const n = pts.length;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      c.bezierCurveTo(
        p1[0] + ((p2[0] - p0[0]) * t) / 6, p1[1] + ((p2[1] - p0[1]) * t) / 6,
        p2[0] - ((p3[0] - p1[0]) * t) / 6, p2[1] - ((p3[1] - p1[1]) * t) / 6,
        p2[0], p2[1],
      );
    }
    c.closePath();
  };
  // Cada cor é [posição, cor] ou só a cor (posições iguais).
  const grad = (x0, y0, x1, y1, cores) => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    cores.forEach((cor, i) => g.addColorStop(
      Array.isArray(cor) ? cor[0] : i / (cores.length - 1),
      Array.isArray(cor) ? cor[1] : cor,
    ));
    return g;
  };
  // Preenche o contorno; `dentro` pinta recortado por ele.
  const forma = (pts, cor, dentro, t = 1) => {
    curva(pts, t);
    c.fillStyle = cor;
    c.fill();
    if (dentro) {
      c.save();
      c.clip();
      dentro();
      c.restore();
    }
  };
  // Pincel macio: a forma vai para fora do canvas e só a sombra dela volta.
  // O translate desconta a escala atual (getTransform().a): não troque a ordem
  // de translate e scale lá em cima.
  const mancha = (pts, cor, desfoque, t = 1) => {
    c.save();
    c.shadowColor = cor;
    c.shadowBlur = desfoque * k;
    c.shadowOffsetX = 3 * w;
    c.translate((-3 * w) / c.getTransform().a, 0);
    curva(pts, t);
    c.fillStyle = '#000';
    c.fill();
    c.restore();
  };
  // Pincelada afilada nas duas pontas (quadrática pelos dois lados).
  const traco = (x1, y1, cx, cy, x2, y2, larg, cor, desfoque = 0) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const d = Math.hypot(dx, dy) || 1;
    const nx = (-dy / d) * larg;
    const ny = (dx / d) * larg;
    c.save();
    if (desfoque) {
      c.shadowColor = cor;
      c.shadowBlur = desfoque * k;
    }
    c.beginPath();
    c.moveTo(x1, y1);
    c.quadraticCurveTo(cx + nx, cy + ny, x2, y2);
    c.quadraticCurveTo(cx - nx, cy - ny, x1, y1);
    c.fillStyle = cor;
    c.fill();
    c.restore();
  };
  // Mecha de cabelo: um traço com o meio deslocado por `curv`.
  const mecha = (x0, y0, x, y, curv, larg, cor, d = 1) => {
    const mx = (x0 + x) / 2;
    const my = (y0 + y) / 2;
    traco(x0, y0, mx + (y - y0) * curv, my - (x - x0) * curv, x, y, larg, cor, d);
  };
  const tenis = (pts, sola) => {
    forma(pts, grad(0, 0.94, 0, 1, ['#cfc6cf', '#a79fae', '#7b748a']), () => {
      c.fillStyle = 'rgba(240, 232, 226, 0.9)';
      c.fillRect(-0.2, 0.985, 0.4, 0.02);
      c.fillStyle = 'rgba(40, 34, 56, 0.45)';
      c.fillRect(-0.2, 0.981, 0.4, 0.0035);
      mancha([[-0.2, 0.925], [0.2, 0.925], [0.2, 0.953], [-0.2, 0.953]], 'rgba(52, 46, 76, 0.6)', 4);
      if (sola) sola();
    });
  };
  // Abre o save do braço direito; quem chama faz o restore.
  const bracoDir = () => {
    c.save();
    c.translate(0, 0.175);
    c.scale(0.93, 1.05);
    c.translate(0, -0.175);
  };
  // Tufo de cabelo (CABELO é definido junto da cabeça, antes do primeiro tufo).
  const ponta = ([a, p, b]) => {
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.quadraticCurveTo((a[0] + p[0]) / 2 + (p[1] - a[1]) * 0.16, (a[1] + p[1]) / 2 - (p[0] - a[0]) * 0.16, p[0], p[1]);
    c.quadraticCurveTo((b[0] + p[0]) / 2 + (p[1] - b[1]) * 0.08, (b[1] + p[1]) / 2 - (p[0] - b[0]) * 0.08, b[0], b[1]);
    c.closePath();
    c.fillStyle = CABELO;
    c.fill();
  };

  const CALCA = grad(0, 0.47, 0, 0.96, ['#5d5a72', '#4a475f', '#343246']);
  const CASACO = grad(-0.12, 0.15, 0.1, 0.52, ['#3b3c5a', '#2c2d47', '#1f2034']);
  const MANGA = grad(0, 0.17, 0, 0.5, ['#3a3b59', '#2a2b44', '#202135']);
  const SOMBRA = 'rgba(14, 12, 28, 0.55)';
  const SOMBRA_F = 'rgba(14, 12, 28, 0.32)';
  const CLARO = 'rgba(120, 124, 170, 0.34)';
  const ESC = 'rgba(10, 7, 14, 0.5)';
  const CLA = 'rgba(120, 82, 74, 0.45)';

  // Os tênis: o esquerdo (longe) aponta para a esquerda; o direito (de apoio) só mostra o calcanhar.
  tenis([[-0.05, 0.935], [-0.043, 0.97], [-0.048, 0.992], [-0.08, 0.999], [-0.118, 0.997], [-0.138, 0.99], [-0.14, 0.978], [-0.126, 0.964], [-0.108, 0.952], [-0.1, 0.935]], () => {
    traco(-0.1, 0.955, -0.118, 0.962, -0.136, 0.978, 0.004, 'rgba(255,255,255,0.4)', 2);
    mancha([[-0.036, 0.94], [-0.036, 0.99], [-0.062, 0.99], [-0.066, 0.94]], SOMBRA_F, 6);
  });
  tenis([[0.014, 0.935], [0.008, 0.972], [0.013, 0.992], [0.046, 0.999], [0.079, 0.992], [0.084, 0.972], [0.078, 0.935]], () => {
    mancha([[0.054, 0.94], [0.09, 0.94], [0.09, 1], [0.062, 1]], SOMBRA_F, 6);
    traco(0.046, 0.955, 0.045, 0.966, 0.046, 0.98, 0.003, 'rgba(60,52,80,0.4)', 1);
  });
  // As pernas: a esquerda (longe) solta e aberta; a direita desce reta sob o corpo.
  forma([[0.0, 0.5], [-0.05, 0.492], [-0.092, 0.5], [-0.101, 0.57], [-0.103, 0.66], [-0.104, 0.735], [-0.104, 0.8], [-0.101, 0.88], [-0.1, 0.948], [-0.075, 0.958], [-0.05, 0.948], [-0.049, 0.88], [-0.045, 0.8], [-0.037, 0.735], [-0.021, 0.65], [-0.006, 0.585]], CALCA, () => {
    mancha([[-0.03, 0.52], [0.02, 0.52], [-0.012, 0.7], [-0.034, 0.95], [-0.06, 0.95], [-0.05, 0.72]], SOMBRA, 14);
    mancha([[-0.11, 0.55], [-0.088, 0.55], [-0.088, 0.7], [-0.092, 0.94], [-0.11, 0.94]], CLARO, 9);
    traco(-0.096, 0.742, -0.066, 0.76, -0.034, 0.744, 0.006, SOMBRA_F, 3);
    traco(-0.09, 0.765, -0.068, 0.777, -0.044, 0.767, 0.004, SOMBRA_F, 3);
    traco(-0.1, 0.905, -0.074, 0.924, -0.048, 0.9, 0.006, SOMBRA_F, 3);
    traco(-0.1, 0.932, -0.076, 0.942, -0.05, 0.93, 0.004, SOMBRA_F, 2);
    traco(-0.062, 0.59, -0.07, 0.66, -0.07, 0.73, 0.004, 'rgba(150,150,190,0.2)', 4);
    mancha([[-0.12, 0.47], [0.02, 0.47], [0.02, 0.548], [-0.12, 0.545]], SOMBRA_F, 8);
  });
  forma([[-0.014, 0.5], [0.04, 0.49], [0.094, 0.5], [0.099, 0.57], [0.093, 0.66], [0.084, 0.735], [0.085, 0.8], [0.079, 0.88], [0.072, 0.948], [0.046, 0.958], [0.02, 0.948], [0.018, 0.88], [0.014, 0.8], [0.012, 0.735], [0.005, 0.65], [-0.008, 0.575]], CALCA, () => {
    mancha([[0.056, 0.52], [0.11, 0.52], [0.1, 0.7], [0.09, 0.95], [0.058, 0.95], [0.066, 0.72]], SOMBRA, 14);
    mancha([[-0.02, 0.56], [0.006, 0.56], [0.024, 0.7], [0.032, 0.94], [0.014, 0.94]], CLARO, 9);
    traco(0.014, 0.742, 0.046, 0.762, 0.083, 0.742, 0.006, SOMBRA_F, 3);
    traco(0.024, 0.768, 0.05, 0.78, 0.074, 0.768, 0.004, SOMBRA_F, 3);
    traco(0.02, 0.9, 0.046, 0.922, 0.076, 0.9, 0.006, SOMBRA_F, 3);
    traco(0.022, 0.93, 0.046, 0.941, 0.072, 0.928, 0.004, SOMBRA_F, 2);
    traco(0.036, 0.59, 0.04, 0.66, 0.036, 0.73, 0.004, 'rgba(150,150,190,0.2)', 4);
    mancha([[-0.05, 0.47], [0.12, 0.47], [0.12, 0.548], [-0.05, 0.55]], SOMBRA_F, 8);
  });

  // O braço esquerdo (longe): cotovelo para fora, a mão some no bolso do casaco.
  // Tronco e braço esquerdo saem um pouco mais longos, em torno de (0, 0.15).
  c.save();
  c.translate(0, 0.15);
  c.scale(0.93, 1.05);
  c.translate(0, -0.15);
  forma([[-0.078, 0.17], [-0.108, 0.182], [-0.126, 0.215], [-0.136, 0.28], [-0.142, 0.345], [-0.14, 0.39], [-0.128, 0.435], [-0.108, 0.47], [-0.085, 0.47], [-0.08, 0.4], [-0.08, 0.3]], MANGA, () => {
    mancha([[-0.15, 0.2], [-0.128, 0.2], [-0.134, 0.3], [-0.132, 0.44], [-0.15, 0.44]], CLARO, 8);
    traco(-0.139, 0.372, -0.12, 0.392, -0.098, 0.378, 0.006, SOMBRA_F, 3);
    traco(-0.134, 0.352, -0.118, 0.366, -0.1, 0.356, 0.004, SOMBRA_F, 3);
    traco(-0.126, 0.43, -0.112, 0.44, -0.096, 0.43, 0.004, SOMBRA_F, 2);
  });
  c.restore();

  // A mão direita, solta ao lado do corpo, vista pelo lado do dedinho; o laço do
  // fio vermelho amarrado no dedinho. É daqui que o fio sai (MAO).
  bracoDir();
  if (!entrega) {
    forma([[0.121, 0.49], [0.119, 0.515], [0.12, 0.538], [0.123, 0.556], [0.129, 0.567], [0.136, 0.569], [0.142, 0.561], [0.146, 0.54], [0.147, 0.515], [0.146, 0.49]], grad(0.118, 0, 0.148, 0, ['#b98674', '#e2b196', '#c99680']), () => {
      mancha([[0.115, 0.49], [0.15, 0.49], [0.15, 0.512], [0.115, 0.512]], 'rgba(70, 40, 50, 0.5)', 5);
      traco(0.126, 0.535, 0.1245, 0.552, 0.128, 0.565, 0.0016, 'rgba(120, 70, 66, 0.55)', 1);
      traco(0.14, 0.53, 0.1405, 0.548, 0.138, 0.563, 0.0014, 'rgba(120, 70, 66, 0.4)', 1);
      traco(0.132, 0.525, 0.1335, 0.546, 0.132, 0.565, 0.003, 'rgba(255, 224, 200, 0.4)', 2);
    });
    traco(0.1275, 0.549, 0.133, 0.5525, 0.1385, 0.549, 0.0022, '#d6243a', 1);
  }
  c.restore();

  // O tronco: casaco escuro (na entrega, aberto, com zíper e a camiseta clara no decote).
  c.save();
  c.translate(0, 0.15);
  c.scale(0.93, 1.05);
  c.translate(0, -0.15);
  forma([[-0.04, 0.152], [-0.078, 0.166], [-0.104, 0.186], [-0.104, 0.25], [-0.098, 0.33], [-0.098, 0.41], [-0.106, 0.465], [-0.098, 0.5], [-0.06, 0.512], [0.0, 0.517], [0.06, 0.513], [0.101, 0.5], [0.11, 0.46], [0.104, 0.38], [0.107, 0.29], [0.113, 0.22], [0.112, 0.186], [0.085, 0.166], [0.045, 0.152]], CASACO, () => {
    mancha([[-0.09, 0.2], [-0.02, 0.19], [-0.01, 0.3], [-0.04, 0.44], [-0.09, 0.45]], CLARO, 22);
    mancha([[0.05, 0.22], [0.13, 0.2], [0.13, 0.52], [0.06, 0.52], [0.04, 0.38]], SOMBRA, 20);
    mancha([[-0.07, 0.2], [0.08, 0.2], [0.07, 0.262], [0.0, 0.282], [-0.06, 0.262]], SOMBRA, 9);
    traco(0.004, 0.27, 0.0, 0.38, 0.004, 0.5, 0.0022, SOMBRA_F, 2);
    traco(-0.096, 0.27, -0.06, 0.31, -0.034, 0.37, 0.006, SOMBRA_F, 4);
    traco(0.1, 0.28, 0.07, 0.32, 0.046, 0.385, 0.006, SOMBRA_F, 4);
    traco(-0.09, 0.455, -0.04, 0.475, 0.012, 0.462, 0.007, SOMBRA_F, 4);
    traco(0.03, 0.47, 0.065, 0.482, 0.1, 0.462, 0.006, SOMBRA_F, 4);
    traco(-0.06, 0.345, -0.045, 0.39, -0.052, 0.44, 0.004, 'rgba(130,134,180,0.25)', 4);
    mancha([[-0.12, 0.492], [0.12, 0.49], [0.12, 0.53], [-0.12, 0.53]], 'rgba(12, 10, 24, 0.5)', 5);
    traco(-0.1, 0.488, 0.0, 0.5, 0.106, 0.487, 0.0022, 'rgba(120,124,170,0.3)', 2);
    traco(-0.097, 0.405, -0.082, 0.43, -0.08, 0.468, 0.004, 'rgba(12,10,24,0.6)', 2);
    if (entrega) {
      traco(0.004, 0.2, 0.001, 0.35, 0.004, 0.505, 0.0022, 'rgba(150, 154, 196, 0.42)', 1);
      forma([[-0.034, 0.146], [-0.012, 0.19], [0.003, 0.212], [0.018, 0.19], [0.038, 0.146], [0.002, 0.15]], grad(0, 0.15, 0, 0.21, ['#b9b3c4', '#e4dfe6']), null, 0.5);
      mancha([[-0.04, 0.14], [0.04, 0.14], [0.03, 0.172], [-0.03, 0.172]], 'rgba(40, 30, 60, 0.55)', 6);
    }
  });
  c.restore();

  // O braço direito (perto): cai solto, cotovelo um pouco dobrado, a manga encostada no tronco.
  bracoDir();
  if (!entrega) {
    forma([[0.088, 0.168], [0.118, 0.18], [0.137, 0.21], [0.147, 0.27], [0.153, 0.335], [0.155, 0.385], [0.152, 0.445], [0.15, 0.498], [0.134, 0.504], [0.117, 0.498], [0.115, 0.44], [0.111, 0.37], [0.104, 0.3], [0.095, 0.235]], MANGA, () => {
      mancha([[0.13, 0.2], [0.17, 0.2], [0.17, 0.51], [0.138, 0.51], [0.142, 0.36]], SOMBRA, 9);
      mancha([[0.108, 0.2], [0.126, 0.2], [0.134, 0.3], [0.134, 0.49], [0.124, 0.49], [0.122, 0.33]], 'rgba(120, 124, 170, 0.2)', 7);
      traco(0.112, 0.37, 0.132, 0.385, 0.154, 0.366, 0.006, SOMBRA_F, 3);
      traco(0.116, 0.395, 0.134, 0.406, 0.152, 0.394, 0.004, SOMBRA_F, 3);
      traco(0.108, 0.345, 0.126, 0.353, 0.146, 0.338, 0.004, SOMBRA_F, 3);
      traco(0.117, 0.468, 0.133, 0.478, 0.15, 0.466, 0.004, SOMBRA_F, 2);
      traco(0.117, 0.487, 0.134, 0.493, 0.151, 0.486, 0.0025, 'rgba(12,10,24,0.55)', 1);
      traco(0.1, 0.215, 0.118, 0.24, 0.124, 0.29, 0.004, 'rgba(130,134,180,0.3)', 4);
    });
    traco(0.094, 0.22, 0.106, 0.32, 0.114, 0.47, 0.0035, 'rgba(12,10,24,0.5)', 3);
  }
  c.restore();

  // O pescoço e a gola alta dos dois lados.
  forma([[-0.03, 0.105], [-0.032, 0.16], [0.03, 0.16], [0.027, 0.105]], grad(-0.03, 0, 0.03, 0, ['#d2a088', '#b98674', '#8f6460']), null, 0.6);
  forma([[-0.036, 0.132], [-0.056, 0.14], [-0.07, 0.165], [-0.05, 0.178], [-0.03, 0.17]], '#262740', null, 0.8);
  forma([[0.034, 0.13], [0.054, 0.138], [0.07, 0.165], [0.05, 0.178], [0.03, 0.17]], '#1d1e33', null, 0.8);

  // O capuz cinza: caído nas costas, com a boca em V; na entrega, duas abas, uma de cada lado do pescoço.
  c.save();
  c.scale(0.95, 1);
  if (entrega) {
    const CAPUZ = grad(-0.08, 0.13, 0.08, 0.2, ['#c9c7d2', '#a9a7b8', '#7f7d93']);
    forma([[-0.032, 0.128], [-0.058, 0.134], [-0.082, 0.156], [-0.08, 0.18], [-0.056, 0.196], [-0.03, 0.206], [-0.022, 0.18], [-0.03, 0.155]], CAPUZ, () => {
      mancha([[-0.05, 0.15], [-0.02, 0.15], [-0.016, 0.21], [-0.04, 0.21]], 'rgba(50, 46, 78, 0.5)', 6);
      traco(-0.076, 0.16, -0.06, 0.18, -0.036, 0.198, 0.003, 'rgba(255, 244, 236, 0.4)', 2);
    });
    forma([[0.034, 0.128], [0.06, 0.134], [0.084, 0.156], [0.082, 0.18], [0.058, 0.196], [0.032, 0.206], [0.024, 0.18], [0.032, 0.155]], CAPUZ, () => {
      mancha([[0.02, 0.15], [0.09, 0.14], [0.09, 0.21], [0.03, 0.21]], 'rgba(50, 46, 78, 0.55)', 7);
    });
    traco(-0.02, 0.2, -0.023, 0.24, -0.019, 0.282, 0.0017, '#cfcdd8', 1);
    traco(0.024, 0.2, 0.027, 0.236, 0.023, 0.272, 0.0017, '#b6b4c4', 1);
  } else {
    forma([[-0.03, 0.14], [-0.052, 0.148], [-0.07, 0.172], [-0.07, 0.205], [-0.052, 0.235], [-0.02, 0.256], [0.008, 0.262], [0.038, 0.254], [0.066, 0.232], [0.08, 0.2], [0.078, 0.17], [0.058, 0.148], [0.034, 0.14], [0.002, 0.15]], grad(-0.07, 0.14, 0.07, 0.26, ['#c9c7d2', '#a9a7b8', '#7f7d93']), () => {
      forma([[-0.03, 0.138], [-0.04, 0.155], [-0.03, 0.178], [0.002, 0.19], [0.034, 0.178], [0.044, 0.155], [0.034, 0.138], [0.002, 0.146]], grad(0, 0.14, 0, 0.19, ['#4c4a62', '#6a687f']));
      mancha([[0.03, 0.17], [0.09, 0.16], [0.09, 0.26], [0.02, 0.27], [0.036, 0.215]], 'rgba(50, 46, 78, 0.55)', 10);
      mancha([[-0.068, 0.16], [-0.04, 0.16], [-0.036, 0.22], [-0.056, 0.22]], 'rgba(255, 240, 232, 0.45)', 7);
      traco(-0.05, 0.19, -0.02, 0.232, 0.008, 0.25, 0.005, 'rgba(60, 56, 88, 0.4)', 3);
      traco(0.062, 0.188, 0.036, 0.23, 0.01, 0.25, 0.005, 'rgba(60, 56, 88, 0.45)', 3);
      traco(-0.03, 0.185, -0.004, 0.212, 0.004, 0.238, 0.003, 'rgba(60, 56, 88, 0.3)', 3);
      traco(-0.064, 0.2, -0.05, 0.225, -0.026, 0.246, 0.003, 'rgba(255, 244, 236, 0.4)', 2);
    });
  }
  c.restore();

  // A cabeça, 1,2× em torno de (0, 0.135): proporção de anime, perto de sete cabeças.
  // De costas não há rosto: só um resto de perfil (bochecha e queixo, virados um
  // pouco para a esquerda) e a orelha. O cabelo castanho desfiado cobre o resto.
  c.save();
  c.translate(0, 0.135);
  c.scale(1.2, 1.2);
  c.translate(0, -0.135);
  if (!entrega) {
    forma([[-0.04, 0.068], [-0.052, 0.08], [-0.0565, 0.096], [-0.053, 0.111], [-0.044, 0.124], [-0.031, 0.131], [-0.014, 0.126], [-0.004, 0.105], [-0.012, 0.075]], grad(-0.058, 0.07, -0.01, 0.125, ['#f3c8a8', '#dca98f', '#b07f70']), () => {
      mancha([[-0.036, 0.112], [0.01, 0.1], [0.01, 0.14], [-0.04, 0.14]], 'rgba(110, 60, 70, 0.5)', 6);
    });
  }
  const CABELO = grad(-0.06, 0.0, 0.05, 0.13, ['#3e2a2a', '#291b1f', '#191116']);
  // Os quatro primeiros tufos são da nuca: de frente não aparecem.
  [
    [[0.046, 0.106], [0.051, 0.138], [0.033, 0.122]],
    [[0.037, 0.118], [0.031, 0.151], [0.017, 0.123]],
    [[0.021, 0.122], [0.011, 0.147], [0.001, 0.121]],
    [[0.005, 0.118], [-0.008, 0.139], [-0.015, 0.11]],
    [[0.054, 0.058], [0.066, 0.09], [0.053, 0.094]],
    [[0.053, 0.088], [0.061, 0.118], [0.043, 0.112]],
    [[-0.05, 0.06], [-0.058, 0.092], [-0.04, 0.074]],
    [[-0.058, 0.044], [-0.071, 0.074], [-0.052, 0.07]],
    [[-0.057, 0.03], [-0.069, 0.05], [-0.058, 0.056]],
    [[-0.014, 0.009], [0.001, -0.001], [0.014, 0.009]],
    [[0.018, 0.01], [0.04, 0.009], [0.045, 0.032]],
    [[-0.032, 0.014], [-0.049, 0.013], [-0.054, 0.032]],
  ].forEach((p, i) => {
    if (!entrega || i > 3) ponta(p);
  });
  forma([[-0.006, 0.006], [0.022, 0.01], [0.042, 0.026], [0.054, 0.05], [0.057, 0.076], [0.052, 0.1], [0.04, 0.118], [0.022, 0.126], [0.004, 0.124], [-0.012, 0.116], [-0.018, 0.1], [-0.015, 0.086], [-0.024, 0.076], [-0.034, 0.078], [-0.044, 0.076], [-0.054, 0.066], [-0.06, 0.048], [-0.054, 0.028], [-0.036, 0.012]], CABELO, () => {
    mancha([[0.024, 0.05], [0.07, 0.04], [0.07, 0.14], [-0.01, 0.14], [0.006, 0.1]], 'rgba(8, 6, 14, 0.6)', 11);
    mancha([[-0.056, 0.04], [-0.03, 0.03], [0.0, 0.032], [0.022, 0.044], [0.022, 0.052], [0.0, 0.043], [-0.03, 0.042], [-0.054, 0.052]], 'rgba(214, 150, 120, 0.55)', 4);
  });
  // Mechas em cruz: escuras por baixo, as mornas por cima.
  mecha(0.02, 0.03, 0.05, 0.132, -0.2, 0.004, ESC);
  mecha(0.014, 0.036, 0.03, 0.145, -0.1, 0.004, ESC);
  mecha(0.006, 0.04, 0.01, 0.142, 0.06, 0.0035, ESC);
  mecha(0.026, 0.026, 0.063, 0.088, -0.24, 0.004, ESC);
  mecha(-0.004, 0.04, -0.01, 0.132, 0.12, 0.003, ESC);
  mecha(-0.01, 0.028, -0.057, 0.086, 0.26, 0.004, ESC);
  mecha(-0.004, 0.034, -0.03, 0.078, 0.2, 0.003, ESC);
  mecha(-0.016, 0.022, -0.068, 0.07, 0.24, 0.0035, ESC);
  mecha(0.03, 0.05, 0.042, 0.116, -0.12, 0.0025, CLA);
  mecha(0.012, 0.06, 0.02, 0.128, -0.04, 0.0025, CLA);
  mecha(-0.02, 0.036, -0.048, 0.07, 0.2, 0.003, CLA);
  mecha(0.036, 0.036, 0.057, 0.078, -0.2, 0.0025, CLA);
  // A orelha esquerda e o tufo que cai por cima dela.
  forma([[-0.031, 0.084], [-0.022, 0.079], [-0.015, 0.088], [-0.017, 0.102], [-0.025, 0.11], [-0.031, 0.101]], grad(-0.032, 0, -0.014, 0, ['#e8b598', '#bb8473']), () => {
    traco(-0.027, 0.086, -0.019, 0.09, -0.024, 0.104, 0.002, 'rgba(110, 60, 60, 0.5)', 1);
  });
  ponta([[-0.04, 0.074], [-0.037, 0.107], [-0.027, 0.077]]);
  // De frente: o rosto, sorrindo de olhos fechados (arcos), nariz de uma
  // sombrinha, bochechas rosadas e a franja caindo na testa.
  if (entrega) {
    forma([[-0.043, 0.058], [-0.046, 0.082], [-0.042, 0.103], [-0.03, 0.121], [-0.012, 0.131], [0.004, 0.133], [0.02, 0.131], [0.036, 0.121], [0.047, 0.103], [0.05, 0.082], [0.046, 0.058], [0.002, 0.046]], grad(-0.05, 0.06, 0.05, 0.13, ['#f3c8a8', '#e3b196', '#b98674']), () => {
      mancha([[-0.06, 0.04], [0.06, 0.04], [0.06, 0.086], [-0.06, 0.086]], 'rgba(96, 54, 62, 0.5)', 7);
      mancha([[0.03, 0.06], [0.06, 0.06], [0.06, 0.14], [0.022, 0.14], [0.036, 0.1]], 'rgba(110, 60, 70, 0.42)', 7);
      mancha([[-0.036, 0.106], [-0.02, 0.104], [-0.018, 0.113], [-0.034, 0.115]], 'rgba(236, 120, 120, 0.4)', 4);
      mancha([[0.022, 0.104], [0.038, 0.106], [0.036, 0.115], [0.02, 0.113]], 'rgba(236, 120, 120, 0.34)', 4);
    });
    forma([[-0.047, 0.084], [-0.054, 0.08], [-0.057, 0.092], [-0.053, 0.105], [-0.046, 0.106]], '#d9a68d', null, 0.8);
    forma([[0.051, 0.084], [0.058, 0.08], [0.061, 0.092], [0.057, 0.105], [0.05, 0.106]], '#b98674', null, 0.8);
    const TRACO = 'rgba(46, 26, 32, 0.9)';
    traco(-0.031, 0.1005, -0.02, 0.0925, -0.009, 0.1005, 0.0016, TRACO);
    traco(0.013, 0.1005, 0.024, 0.0925, 0.035, 0.1005, 0.0016, TRACO);
    traco(0.003, 0.106, 0.0055, 0.111, 0.002, 0.1135, 0.0009, 'rgba(140, 80, 76, 0.6)');
    traco(-0.012, 0.1195, 0.002, 0.127, 0.016, 0.1195, 0.0013, 'rgba(120, 52, 58, 0.85)');
    forma([[-0.05, 0.03], [-0.02, 0.022], [0.02, 0.022], [0.052, 0.032], [0.054, 0.062], [0.03, 0.066], [0.0, 0.064], [-0.03, 0.066], [-0.052, 0.062]], CABELO, null, 0.7);
    [
      [[-0.054, 0.052], [-0.05, 0.104], [-0.04, 0.06]],
      [[-0.046, 0.058], [-0.036, 0.094], [-0.026, 0.06]],
      [[-0.032, 0.058], [-0.019, 0.088], [-0.01, 0.058]],
      [[-0.016, 0.058], [-0.003, 0.097], [0.007, 0.058]],
      [[0.002, 0.058], [0.016, 0.086], [0.022, 0.058]],
      [[0.018, 0.058], [0.032, 0.093], [0.038, 0.06]],
      [[0.034, 0.058], [0.046, 0.088], [0.05, 0.058]],
      [[0.046, 0.052], [0.058, 0.102], [0.056, 0.056]],
    ].forEach(ponta);
    mecha(-0.01, 0.026, -0.036, 0.09, 0.14, 0.0028, ESC);
    mecha(0.0, 0.026, -0.004, 0.092, 0.05, 0.0028, ESC);
    mecha(0.012, 0.026, 0.03, 0.088, -0.12, 0.0028, ESC);
    mecha(-0.022, 0.03, -0.046, 0.08, 0.16, 0.0026, CLA);
    mecha(0.02, 0.03, 0.044, 0.082, -0.14, 0.0024, CLA);
  }
  c.restore();

  // A entrega: o braço direito vem para a frente em escorço, a mão aberta de palma
  // para cima, dedos juntos apontando para ela, o polegar por fora e o laço do fio
  // no dedinho.
  if (entrega) {
    forma([[0.084, 0.172], [0.114, 0.184], [0.132, 0.214], [0.138, 0.268], [0.132, 0.322], [0.114, 0.362], [0.09, 0.39], [0.062, 0.398], [0.04, 0.386], [0.036, 0.362], [0.05, 0.338], [0.07, 0.314], [0.084, 0.27], [0.086, 0.215]], MANGA, () => {
      mancha([[0.112, 0.2], [0.15, 0.2], [0.15, 0.38], [0.11, 0.4], [0.122, 0.3]], SOMBRA, 9);
      mancha([[0.086, 0.21], [0.1, 0.21], [0.104, 0.29], [0.09, 0.33], [0.07, 0.35], [0.08, 0.3]], 'rgba(120, 124, 170, 0.24)', 7);
      traco(0.092, 0.3, 0.112, 0.318, 0.134, 0.3, 0.005, SOMBRA_F, 3);
      traco(0.086, 0.326, 0.106, 0.342, 0.128, 0.328, 0.004, SOMBRA_F, 3);
      mancha([[0.034, 0.35], [0.066, 0.344], [0.08, 0.37], [0.066, 0.402], [0.036, 0.396]], 'rgba(10, 8, 22, 0.62)', 5);
    });
    const PELE = grad(0.0, 0.36, 0.07, 0.42, ['#f1c6a8', '#e0ad92', '#b98674']);
    forma([[0.006, 0.378], [0.014, 0.366], [0.034, 0.36], [0.056, 0.362], [0.07, 0.372], [0.074, 0.39], [0.068, 0.408], [0.05, 0.418], [0.026, 0.418], [0.01, 0.408], [0.004, 0.393]], PELE, () => {
      mancha([[0.0, 0.4], [0.08, 0.4], [0.08, 0.43], [0.0, 0.43]], 'rgba(110, 60, 66, 0.5)', 5);
      traco(0.022, 0.398, 0.021, 0.408, 0.022, 0.417, 0.0011, 'rgba(120, 70, 66, 0.6)');
      traco(0.037, 0.4, 0.037, 0.41, 0.037, 0.418, 0.0011, 'rgba(120, 70, 66, 0.6)');
      traco(0.052, 0.398, 0.053, 0.408, 0.052, 0.416, 0.0011, 'rgba(120, 70, 66, 0.6)');
      traco(0.018, 0.378, 0.036, 0.386, 0.06, 0.378, 0.0012, 'rgba(150, 90, 84, 0.45)');
      mancha([[0.016, 0.364], [0.05, 0.364], [0.05, 0.376], [0.016, 0.376]], 'rgba(255, 236, 216, 0.45)', 4);
    });
    forma([[0.064, 0.366], [0.076, 0.358], [0.086, 0.364], [0.086, 0.38], [0.078, 0.394], [0.068, 0.39]], grad(0.064, 0.36, 0.088, 0.39, ['#e3b196', '#b98674']), null, 0.8);
    traco(0.008, 0.401, 0.013, 0.4045, 0.019, 0.402, 0.0024, '#d6243a', 1);
  }

  // A luz da hora: contraluz morna nas bordas (a silhueta menos ela mesma
  // deslocada) e o corpo que esfria para o chão.
  c.setTransform(1, 0, 0, 1, 0, 0);
  const borda = (dx, dy, alfa) => {
    const luz = nova();
    const l = luz.getContext('2d');
    l.drawImage(tela, 0, 0);
    l.globalCompositeOperation = 'source-in';
    l.fillStyle = LUZ;
    l.fillRect(0, 0, w, h);
    l.globalCompositeOperation = 'destination-out';
    l.drawImage(tela, dx * k, dy * k);
    l.drawImage(tela, dx * k * 0.5, dy * k * 0.5);
    c.save();
    c.globalCompositeOperation = 'source-atop';
    c.globalAlpha = alfa;
    c.drawImage(luz, 0, 0);
    c.restore();
    // O Safari do iPhone conta a memória de canvas por página: o auxiliar sai já.
    luz.width = 0;
    luz.height = 0;
  };
  borda(5, 3, 0.7);
  borda(-3, 4, 0.28);
  c.save();
  c.globalCompositeOperation = 'source-atop';
  const frio = c.createLinearGradient(0, topo, 0, topo + S);
  frio.addColorStop(0, 'rgba(255, 170, 130, 0.08)');
  frio.addColorStop(0.5, 'rgba(40, 30, 70, 0.0)');
  frio.addColorStop(1, 'rgba(24, 18, 48, 0.3)');
  c.fillStyle = frio;
  c.fillRect(0, 0, w, h);
  c.restore();

  // Composição: um halo de quatro cópias nas diagonais (a 0,25) amacia a
  // silhueta, e a figura vem inteira por cima.
  const o = 0.45 * k;
  ctx.save();
  ctx.globalAlpha = 0.25;
  for (const [dx, dy] of [[-o, -o], [o, -o], [-o, o], [o, o]]) ctx.drawImage(tela, dx, dy);
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.drawImage(tela, 0, 0);
  tela.width = 0;
  tela.height = 0;
}

/** Canvas TEX_L × TEX_A com a figura na pose pedida, ou null sem contexto 2D. */
function pintarFigura(pose = 'costas') {
  const tela = document.createElement('canvas');
  tela.width = TEX_L;
  tela.height = TEX_A;
  const ctx = tela.getContext('2d');
  if (!ctx) return null;
  pintar(ctx, TEX_L, TEX_A, pose);
  return tela;
}

/** A sombra de contato no chão: uma elipse macia de tinta, 128 × 64. */
function pintarSombra() {
  const tela = document.createElement('canvas');
  tela.width = 128;
  tela.height = 64;
  const c = tela.getContext('2d');
  if (!c) return null;
  c.translate(64, 32);
  c.scale(1, 0.5);
  const g = c.createRadialGradient(0, 0, 4, 0, 0, 62);
  g.addColorStop(0, 'rgba(22, 14, 30, 0.62)');
  g.addColorStop(0.55, 'rgba(22, 14, 30, 0.26)');
  g.addColorStop(1, 'rgba(22, 14, 30, 0)');
  c.fillStyle = g;
  c.fillRect(-64, -64, 128, 128);
  return tela;
}

/**
 * A pose de entrega como canvas solto (1024 × 2048), ou null. Não depende de
 * WebGL: sem ele, js/cenas/final.js põe este canvas em #mundo-leve (.ele-leve).
 */
export function pintarEleEntrega() {
  try {
    return pintarFigura('entrega');
  } catch {
    return null;
  }
}

/**
 * Ele no mundo 3D: o grupo 'ele' (invisível até mostrar, pés em y = 0; quem chama
 * põe só x e z) e a API. null sem WebGL ou se a pintura falhar.
 */
export function criarEle(mundo) {
  if (!mundo || !mundo.ok) return null;
  const THREE = mundo.THREE;

  let figura = null;
  let chao = null;
  try {
    figura = pintarFigura('costas');
    chao = pintarSombra();
  } catch {
    return null;
  }
  if (!figura || !chao) return null;

  const calmo = !!mundo.amb?.reduzido;
  let fora = false;
  let tween = null;
  let telaEntrega = null;
  let mapaEntrega = null;
  let entregaFalhou = false;

  const textura = (tela) => {
    const t = new THREE.CanvasTexture(tela);
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4; // o three limita ao máximo do aparelho
    return t;
  };
  const mapaFigura = textura(figura);
  const mapaSombra = textura(chao);

  // A névoa e a luz da hora são os mesmos objetos da alameda: ela muda de hora e
  // ele muda junto. Sem alameda, o mundo branco.
  const comuns = mundo.alameda?.uniformes;
  const hora = comuns?.uNevoa && comuns.uCeu && comuns.uDens && comuns.uTarde
    ? { uNevoa: comuns.uNevoa, uCeu: comuns.uCeu, uDens: comuns.uDens, uTarde: comuns.uTarde }
    : {
      uNevoa: { value: new THREE.Vector3(1, 1, 1) },
      uCeu: { value: new THREE.Vector3(1, 1, 1) },
      uDens: { value: 0.043 },
      uTarde: { value: 0 },
    };
  // Corpo e sombra aparecem e somem juntos.
  const uOpacidade = { value: 0 };
  const uLonge = { value: 0.8 };
  const material = (mapa) => new THREE.ShaderMaterial({
    uniforms: { uMapa: { value: mapa }, ...hora, uOpacidade, uLonge },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: false,
  });

  // 1,74 m de figura em 1920 px: o plano tem 0,928 × 1,856 m. A geometria nasce
  // com a origem nas solas (a margem de baixo da textura fica abaixo do chão),
  // para os pés ficarem em y = 0 e a respiração balançar o corpo a partir deles.
  const escala = ALTURA / FIG;
  const geoCorpo = new THREE.PlaneGeometry(TEX_L * escala, TEX_A * escala);
  geoCorpo.translate(0, (TEX_A / 2 - (TEX_A - TOPO - FIG)) * escala, 0);
  const corpo = new THREE.Mesh(geoCorpo, material(mapaFigura));
  corpo.renderOrder = -1;

  const geoSombra = new THREE.PlaneGeometry(0.95, 0.5);
  const sombra = new THREE.Mesh(geoSombra, material(mapaSombra));
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.set(0, 0.012, 0.04);
  sombra.renderOrder = -2;

  const grupo = new THREE.Group();
  grupo.name = 'ele';
  grupo.visible = false;
  grupo.add(sombra, corpo);

  // Quem espera de pé nunca está parado de todo. No movimento reduzido, fica quieto.
  const pararRespiro = calmo ? null : mundo.aoQuadro?.((dt, t) => {
    if (!grupo.visible) return;
    corpo.rotation.z = Math.sin(t * 0.55) * 0.004;
    corpo.scale.y = 1 + Math.sin(t * 0.9 + 1) * 0.0022;
  });

  // Sobe a textura e compila o programa agora, com ele invisível: senão o engasgo
  // cai no primeiro quadro em que ele aparece, no meio da corrida.
  let compilado = Promise.resolve();
  try {
    mundo.renderer?.initTexture?.(mapaFigura);
    const compilando = mundo.renderer?.compileAsync?.(grupo, mundo.camera, mundo.cena);
    if (compilando) compilado = compilando.catch(() => {});
  } catch {
    /* sobe no primeiro quadro, como de costume */
  }

  // Cada pedido de opacidade ganha um número: sair só descarta se nenhum outro
  // pedido (mostrar, ou outro sair) veio por cima do dele.
  let pedido = 0;
  // Leva a opacidade ao alvo; sem GSAP, ou sem duração, troca na hora.
  const ir = (alvo, duracao) => {
    pedido++;
    tween?.kill();
    tween = null;
    const gsap = window.gsap;
    if (!gsap || !(duracao > 0)) {
      uOpacidade.value = alvo;
      return Promise.resolve();
    }
    tween = gsap.to(uOpacidade, { value: alvo, duration: duracao, ease: curvas.branco.deriva });
    return comoPromise(tween);
  };

  const api = {
    grupo,

    /** Pinta a pose de entrega uma vez (cedo, longe do clarão) e já a sobe para a GPU. */
    prepararEntrega() {
      if (fora || mapaEntrega || entregaFalhou) return;
      telaEntrega = pintarEleEntrega();
      if (!telaEntrega) {
        entregaFalhou = true;
        return;
      }
      mapaEntrega = textura(telaEntrega);
      try {
        mundo.renderer?.initTexture?.(mapaEntrega);
      } catch {
        /* sobe no primeiro quadro */
      }
    },

    /** Troca a figura pela pose de entrega (de frente, mão aberta). Não volta para a de costas. */
    entregar() {
      if (fora) return false;
      api.prepararEntrega();
      if (!mapaEntrega) return false;
      corpo.material.uniforms.uMapa.value = mapaEntrega;
      return true;
    },

    /** Onde pousar a carta: logo acima da palma dele, puxada 14% na direção dos olhos dela. */
    ancoraCarta(olhos, saida = new THREE.Vector3()) {
      grupo.updateWorldMatrix(true, false);
      grupo.localToWorld(saida.set(MAO_CARTA.x * ALTURA, (1 - MAO_CARTA.y) * ALTURA, 0));
      if (olhos) saida.lerp(olhos, MAO_CARTA.frente);
      return saida;
    },

    /** A mão que segura o fio (o laço no dedinho), no mundo. Se o grupo se mover, reancore o fio. */
    ancora(saida = new THREE.Vector3()) {
      grupo.updateWorldMatrix(true, false);
      return grupo.localToWorld(saida.set(MAO.x * ALTURA, (1 - MAO.y) * ALTURA, 0.03));
    },

    mostrar(duracao = 3) {
      if (fora) return Promise.resolve();
      grupo.visible = true;
      return ir(1, duracao);
    },

    sair(duracao = 0.8) {
      if (fora) return Promise.resolve();
      const saida = ir(0, duracao);
      const vez = pedido;
      return saida.then(() => {
        if (vez === pedido) api.dispose();
      });
    },

    dispose() {
      if (fora) return;
      fora = true;
      tween?.kill();
      tween = null;
      pararRespiro?.();
      grupo.parent?.remove(grupo);
      geoCorpo.dispose();
      geoSombra.dispose();
      // O three confere o programa a cada 10 ms até compilar; material liberado
      // antes disso derruba a conferência (erro no console). Libera depois.
      compilado.then(() => {
        corpo.material.dispose();
        sombra.material.dispose();
      });
      mapaFigura.dispose();
      mapaSombra.dispose();
      mapaEntrega?.dispose();
      // O Safari do iPhone conta a memória de canvas por página: devolve já.
      for (const tela of [figura, chao, telaEntrega]) {
        if (!tela) continue;
        tela.width = 0;
        tela.height = 0;
      }
    },
  };

  return api;
}
