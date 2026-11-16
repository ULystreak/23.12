// Ele, no fim do fio: um rapaz de pé, de costas, esperando, visto de longe na
// alameda ao entardecer. É para onde o fio leva na caminhada da cena da mão.
//
//   criarEle(mundo) → { grupo, ancora(saida?) → Vector3, mostrar(duracao), sair(duracao) → Promise, dispose() }
//
// Só existe com WebGL (sem ele a cena segue sem a figura). Não é imagem de
// arquivo: a figura é pintada uma vez num canvas (de três quartos de costas, cabelo castanho
// desfiado, casaco escuro com o capuz cinza caído, mão no bolso, calça, tênis;
// contraluz morna nas bordas) e vira a textura de um plano em pé no chão da alameda, com uma sombra
// de contato. O material usa a MESMA névoa e a mesma luz da hora da alameda
// (os uniformes dela, por referência): de longe ele é só um vulto na névoa, e
// ganha corpo conforme ela chega perto. Não é um adesivo: escurece com a tarde.
//
// `grupo` fica com os pés na origem (y = 0 é o chão); `ancora()` devolve, no
// mundo, a mão que segura o fio (a direita dele: à direita de quem o vê de costas).

const ALTURA = 1.74;                 // metros, do chão ao alto do cabelo
const TEX_L = 1024;                 // de perto ela chega a ~4 m: 512 ficava mole
const TEX_A = 2048;
const FIG = 1920;                    // altura da figura na textura (px)
const TOPO = 64;                     // margem acima do cabelo (px)
const MAO = { x: 0.124, y: 0.568 };  // o dedinho da mão do fio, em frações da altura (x a partir do eixo)

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWp;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
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
  // a hora: a mesma conta da alameda (escurece e esfria), um pouco mais funda
  // nele, que está contra a luz
  vec3 c = mix(t.rgb, t.rgb * vec3(0.5, 0.47, 0.64), uTarde);
  // a névoa da alameda (mesma curva; um nada mais rala para o vulto se ler de longe)
  vec3 d = vWp - cameraPosition;
  float dist = length(d);
  float f = 1.0 - exp(-pow(dist * uDens * uLonge, 1.45));
  vec3 nc = mix(uNevoa, uCeu, smoothstep(0.0, 0.55, d.y / max(dist, 0.001)));
  c = mix(c, nc, f);
  gl_FragColor = vec4(c, a * (1.0 - 0.3 * f));
}`;

const LUZ = 'rgb(255, 190, 150)';

/**
 * Pinta a figura num canvas 2D transparente de proporção 1:2. As coordenadas são
 * frações da ALTURA DA FIGURA: x a partir do eixo (positivo = direita de quem o
 * vê de costas), y de 0 (alto do cabelo) a 1 (solas). Pintura suave, sem linha:
 * formas em degradê, sombras de pincel macio (shadowBlur, sem ctx.filter, que o
 * Safari do iPhone não tem), dobras afiladas e contraluz morna.
 */
function pintar(ctx, w, h) {
  const S = h * 960 / 1024;            // altura da figura em px
  const TOPO = h * 32 / 1024;
  const k = S / 960;                   // px por "px de referência" (para desfoques)
  const doc = ctx.canvas.ownerDocument || document;
  const nova = () => { const t = doc.createElement('canvas'); t.width = w; t.height = h; return t; };

  const tela = nova();
  const c = tela.getContext('2d');
  c.translate(w / 2, TOPO);
  c.scale(S, S);
  c.lineCap = 'round';
  c.lineJoin = 'round';

  // ---- ferramentas -----------------------------------------------------------
  /** Curva fechada e macia que PASSA pelos pontos (Catmull-Rom). */
  const curva = (pts, t = 1) => {
    const n = pts.length;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      c.bezierCurveTo(
        p1[0] + (p2[0] - p0[0]) * t / 6, p1[1] + (p2[1] - p0[1]) * t / 6,
        p2[0] - (p3[0] - p1[0]) * t / 6, p2[1] - (p3[1] - p1[1]) * t / 6,
        p2[0], p2[1]);
    }
    c.closePath();
  };
  const grad = (x0, y0, x1, y1, cores) => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    cores.forEach((cor, i) => g.addColorStop(Array.isArray(cor) ? cor[0] : i / (cores.length - 1), Array.isArray(cor) ? cor[1] : cor));
    return g;
  };
  /** Forma cheia; `dentro` pinta por cima, recortado nela. */
  const forma = (pts, cor, dentro, t = 1) => {
    curva(pts, t);
    c.fillStyle = cor;
    c.fill();
    if (dentro) { c.save(); c.clip(); dentro(); c.restore(); }
  };
  /** Mancha desfocada (só a sombra da forma aparece): o pincel macio. */
  const mancha = (pts, cor, desfoque, t = 1) => {
    c.save();
    c.shadowColor = cor;
    c.shadowBlur = desfoque * k;
    c.shadowOffsetX = 3 * w;
    c.translate(-3 * w / c.getTransform().a, 0);
    curva(pts, t);
    c.fillStyle = '#000';
    c.fill();
    c.restore();
  };
  /** Pincelada afilada nas duas pontas (dobra de pano, mecha). */
  const traco = (x1, y1, cx, cy, x2, y2, larg, cor, desfoque = 0) => {
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d * larg, ny = dx / d * larg;
    c.save();
    if (desfoque) { c.shadowColor = cor; c.shadowBlur = desfoque * k; }
    c.beginPath();
    c.moveTo(x1, y1);
    c.quadraticCurveTo(cx + nx, cy + ny, x2, y2);
    c.quadraticCurveTo(cx - nx, cy - ny, x1, y1);
    c.fillStyle = cor;
    c.fill();
    c.restore();
  };

  // ---- cores (entardecer: sombra azul-arroxeada, luz morna) --------------------
  const CALCA = grad(0, 0.47, 0, 0.96, ['#5d5a72', '#4a475f', '#343246']);
  const CASACO = grad(-0.12, 0.15, 0.1, 0.52, ['#3b3c5a', '#2c2d47', '#1f2034']);
  const MANGA = grad(0, 0.17, 0, 0.5, ['#3a3b59', '#2a2b44', '#202135']);
  const SOMBRA = 'rgba(14, 12, 28, 0.55)';
  const SOMBRA_F = 'rgba(14, 12, 28, 0.32)';
  const CLARO = 'rgba(120, 124, 170, 0.34)';

  // =============================================================================
  // 1. Tênis (vistos de trás; o esquerdo aberto para fora)
  // =============================================================================
  const tenis = (pts, sola) => {
    forma(pts, grad(0, 0.94, 0, 1, ['#cfc6cf', '#a79fae', '#7b748a']), () => {
      // a sola clara embaixo
      c.fillStyle = 'rgba(240, 232, 226, 0.9)';
      c.fillRect(-0.2, 0.985, 0.4, 0.02);
      c.fillStyle = 'rgba(40, 34, 56, 0.45)';
      c.fillRect(-0.2, 0.981, 0.4, 0.0035);
      // o colarinho escuro do tênis, embaixo da barra da calça
      mancha([[-0.2, 0.925], [0.2, 0.925], [0.2, 0.953], [-0.2, 0.953]], 'rgba(52, 46, 76, 0.6)', 4);
      sola && sola();
    });
  };
  // esquerdo (longe): aberto para fora, a ponta aponta para a esquerda
  tenis([[-0.05, 0.935], [-0.043, 0.97], [-0.048, 0.992], [-0.08, 0.999], [-0.118, 0.997], [-0.138, 0.99], [-0.14, 0.978], [-0.126, 0.964], [-0.108, 0.952], [-0.1, 0.935]], () => {
    traco(-0.1, 0.955, -0.118, 0.962, -0.136, 0.978, 0.004, 'rgba(255,255,255,0.4)', 2);
    mancha([[-0.036, 0.94], [-0.036, 0.99], [-0.062, 0.99], [-0.066, 0.94]], SOMBRA_F, 6);
  });
  // direito (apoio): só o calcanhar
  tenis([[0.014, 0.935], [0.008, 0.972], [0.013, 0.992], [0.046, 0.999], [0.079, 0.992], [0.084, 0.972], [0.078, 0.935]], () => {
    mancha([[0.054, 0.94], [0.09, 0.94], [0.09, 1], [0.062, 1]], SOMBRA_F, 6);
    traco(0.046, 0.955, 0.045, 0.966, 0.046, 0.98, 0.003, 'rgba(60,52,80,0.4)', 1);
  });

  // =============================================================================
  // 2. Pernas (calça um pouco solta; peso na direita, a esquerda relaxada)
  // =============================================================================
  // esquerda (longe): solta, aberta um pouco para fora
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
  // direita (perto, de apoio): reta embaixo do corpo
  forma([[-0.014, 0.5], [0.04, 0.49], [0.094, 0.5], [0.099, 0.57], [0.093, 0.66], [0.084, 0.735], [0.085, 0.8], [0.079, 0.88], [0.072, 0.948], [0.046, 0.958], [0.02, 0.948], [0.018, 0.88], [0.014, 0.8], [0.012, 0.735], [0.005, 0.65], [-0.008, 0.575]], CALCA, () => {
    mancha([[0.056, 0.52], [0.11, 0.52], [0.1, 0.7], [0.09, 0.95], [0.058, 0.95], [0.066, 0.72]], SOMBRA, 14);
    mancha([[-0.02, 0.56], [0.006, 0.56], [0.024, 0.7], [0.032, 0.94], [0.014, 0.94]], CLARO, 9);
    traco(0.014, 0.742, 0.046, 0.762, 0.083, 0.742, 0.006, SOMBRA_F, 3);
    traco(0.024, 0.768, 0.05, 0.78, 0.074, 0.768, 0.004, SOMBRA_F, 3);
    traco(0.02, 0.9, 0.046, 0.922, 0.076, 0.9, 0.006, SOMBRA_F, 3);
    traco(0.022, 0.93, 0.046, 0.941, 0.072, 0.928, 0.004, SOMBRA_F, 2);
    traco(0.036, 0.59, 0.04, 0.66, 0.036, 0.73, 0.004, 'rgba(150,150,190,0.2)', 4);
    // a sombra do casaco no alto da calça
    mancha([[-0.05, 0.47], [0.12, 0.47], [0.12, 0.548], [-0.05, 0.55]], SOMBRA_F, 8);
  });

  // =============================================================================
  // 3. Braço esquerdo (longe), mão no bolso: o cotovelo aponta para fora
  // =============================================================================
  c.save(); c.translate(0, 0.15); c.scale(0.93, 1.05); c.translate(0, -0.15);   // tronco e braço esquerdo um pouco mais longos
  forma([[-0.078, 0.17], [-0.108, 0.182], [-0.126, 0.215], [-0.136, 0.28], [-0.142, 0.345], [-0.14, 0.39], [-0.128, 0.435], [-0.108, 0.47], [-0.085, 0.47], [-0.08, 0.4], [-0.08, 0.3]], MANGA, () => {
    mancha([[-0.15, 0.2], [-0.128, 0.2], [-0.134, 0.3], [-0.132, 0.44], [-0.15, 0.44]], CLARO, 8);
    traco(-0.139, 0.372, -0.12, 0.392, -0.098, 0.378, 0.006, SOMBRA_F, 3);
    traco(-0.134, 0.352, -0.118, 0.366, -0.1, 0.356, 0.004, SOMBRA_F, 3);
    traco(-0.126, 0.43, -0.112, 0.44, -0.096, 0.43, 0.004, SOMBRA_F, 2);
  });

  c.restore();

  // =============================================================================
  // 4. Mão direita: solta ao lado do corpo, vista pelo lado do dedinho
  // =============================================================================
  const bracoDir = () => { c.save(); c.translate(0, 0.175); c.scale(0.93, 1.05); c.translate(0, -0.175); };
  bracoDir();
  forma([[0.121, 0.49], [0.119, 0.515], [0.12, 0.538], [0.123, 0.556], [0.129, 0.567], [0.136, 0.569], [0.142, 0.561], [0.146, 0.54], [0.147, 0.515], [0.146, 0.49]], grad(0.118, 0, 0.148, 0, ['#b98674', '#e2b196', '#c99680']), () => {
    mancha([[0.115, 0.49], [0.15, 0.49], [0.15, 0.512], [0.115, 0.512]], 'rgba(70, 40, 50, 0.5)', 5);
    // os dedos, meio fechados: o dedinho por fora, os outros atrás
    traco(0.126, 0.535, 0.1245, 0.552, 0.128, 0.565, 0.0016, 'rgba(120, 70, 66, 0.55)', 1);
    traco(0.14, 0.53, 0.1405, 0.548, 0.138, 0.563, 0.0014, 'rgba(120, 70, 66, 0.4)', 1);
    traco(0.132, 0.525, 0.1335, 0.546, 0.132, 0.565, 0.003, 'rgba(255, 224, 200, 0.4)', 2);
  });
  // o laço do fio no dedinho
  traco(0.1275, 0.549, 0.133, 0.5525, 0.1385, 0.549, 0.0022, '#d6243a', 1);
  c.restore();

  // =============================================================================
  // 5. Casaco: o tronco
  // =============================================================================
  c.save(); c.translate(0, 0.15); c.scale(0.93, 1.05); c.translate(0, -0.15);
  forma([[-0.04, 0.152], [-0.078, 0.166], [-0.104, 0.186], [-0.104, 0.25], [-0.098, 0.33], [-0.098, 0.41], [-0.106, 0.465], [-0.098, 0.5], [-0.06, 0.512], [0.0, 0.517], [0.06, 0.513], [0.101, 0.5], [0.11, 0.46], [0.104, 0.38], [0.107, 0.29], [0.113, 0.22], [0.112, 0.186], [0.085, 0.166], [0.045, 0.152]], CASACO, () => {
    // luz fria do céu nas costas, do lado de onde vem o sol (esquerda)
    mancha([[-0.09, 0.2], [-0.02, 0.19], [-0.01, 0.3], [-0.04, 0.44], [-0.09, 0.45]], CLARO, 22);
    // sombra do lado direito e embaixo do capuz
    mancha([[0.05, 0.22], [0.13, 0.2], [0.13, 0.52], [0.06, 0.52], [0.04, 0.38]], SOMBRA, 20);
    mancha([[-0.07, 0.2], [0.08, 0.2], [0.07, 0.262], [0.0, 0.282], [-0.06, 0.262]], SOMBRA, 9);
    // a costura do meio das costas
    traco(0.004, 0.27, 0.0, 0.38, 0.004, 0.5, 0.0022, SOMBRA_F, 2);
    // dobras: o pano puxa da axila para a cintura e junta em cima da barra
    traco(-0.096, 0.27, -0.06, 0.31, -0.034, 0.37, 0.006, SOMBRA_F, 4);
    traco(0.1, 0.28, 0.07, 0.32, 0.046, 0.385, 0.006, SOMBRA_F, 4);
    traco(-0.09, 0.455, -0.04, 0.475, 0.012, 0.462, 0.007, SOMBRA_F, 4);
    traco(0.03, 0.47, 0.065, 0.482, 0.1, 0.462, 0.006, SOMBRA_F, 4);
    traco(-0.06, 0.345, -0.045, 0.39, -0.052, 0.44, 0.004, 'rgba(130,134,180,0.25)', 4);
    // a barra do casaco (elástico) e a sombra dela
    mancha([[-0.12, 0.492], [0.12, 0.49], [0.12, 0.53], [-0.12, 0.53]], 'rgba(12, 10, 24, 0.5)', 5);
    traco(-0.1, 0.488, 0.0, 0.5, 0.106, 0.487, 0.0022, 'rgba(120,124,170,0.3)', 2);
    // o bolso do lado esquerdo, onde a mão entra
    traco(-0.097, 0.405, -0.082, 0.43, -0.08, 0.468, 0.004, 'rgba(12,10,24,0.6)', 2);
  });

  c.restore();

  // =============================================================================
  // 6. Braço direito (perto): cai solto, um pouco dobrado no cotovelo
  // =============================================================================
  bracoDir();
  forma([[0.088, 0.168], [0.118, 0.18], [0.137, 0.21], [0.147, 0.27], [0.153, 0.335], [0.155, 0.385], [0.152, 0.445], [0.15, 0.498], [0.134, 0.504], [0.117, 0.498], [0.115, 0.44], [0.111, 0.37], [0.104, 0.3], [0.095, 0.235]], MANGA, () => {
    mancha([[0.13, 0.2], [0.17, 0.2], [0.17, 0.51], [0.138, 0.51], [0.142, 0.36]], SOMBRA, 9);
    mancha([[0.108, 0.2], [0.126, 0.2], [0.134, 0.3], [0.134, 0.49], [0.124, 0.49], [0.122, 0.33]], 'rgba(120, 124, 170, 0.2)', 7);
    // dobras do cotovelo e do punho
    traco(0.112, 0.37, 0.132, 0.385, 0.154, 0.366, 0.006, SOMBRA_F, 3);
    traco(0.116, 0.395, 0.134, 0.406, 0.152, 0.394, 0.004, SOMBRA_F, 3);
    traco(0.108, 0.345, 0.126, 0.353, 0.146, 0.338, 0.004, SOMBRA_F, 3);
    traco(0.117, 0.468, 0.133, 0.478, 0.15, 0.466, 0.004, SOMBRA_F, 2);
    traco(0.117, 0.487, 0.134, 0.493, 0.151, 0.486, 0.0025, 'rgba(12,10,24,0.55)', 1);
    traco(0.1, 0.215, 0.118, 0.24, 0.124, 0.29, 0.004, 'rgba(130,134,180,0.3)', 4);
  });
  // a sombra onde a manga encosta no tronco
  traco(0.094, 0.22, 0.106, 0.32, 0.114, 0.47, 0.0035, 'rgba(12,10,24,0.5)', 3);
  c.restore();

  // =============================================================================
  // 7. Pescoço, gola alta do casaco e o capuz cinza caído nas costas
  // =============================================================================
  forma([[-0.03, 0.105], [-0.032, 0.16], [0.03, 0.16], [0.027, 0.105]], grad(-0.03, 0, 0.03, 0, ['#d2a088', '#b98674', '#8f6460']), null, 0.6);
  // a gola do casaco, em pé dos dois lados do pescoço
  forma([[-0.036, 0.132], [-0.056, 0.14], [-0.07, 0.165], [-0.05, 0.178], [-0.03, 0.17]], '#262740', null, 0.8);
  forma([[0.034, 0.13], [0.054, 0.138], [0.07, 0.165], [0.05, 0.178], [0.03, 0.17]], '#1d1e33', null, 0.8);
  // o capuz
  c.save(); c.scale(0.95, 1);
  forma([[-0.03, 0.14], [-0.052, 0.148], [-0.07, 0.172], [-0.07, 0.205], [-0.052, 0.235], [-0.02, 0.256], [0.008, 0.262], [0.038, 0.254], [0.066, 0.232], [0.08, 0.2], [0.078, 0.17], [0.058, 0.148], [0.034, 0.14], [0.002, 0.15]], grad(-0.07, 0.14, 0.07, 0.26, ['#c9c7d2', '#a9a7b8', '#7f7d93']), () => {
    // a boca do capuz: o vão escuro logo atrás da nuca
    forma([[-0.03, 0.138], [-0.04, 0.155], [-0.03, 0.178], [0.002, 0.19], [0.034, 0.178], [0.044, 0.155], [0.034, 0.138], [0.002, 0.146]], grad(0, 0.14, 0, 0.19, ['#4c4a62', '#6a687f']));
    mancha([[0.03, 0.17], [0.09, 0.16], [0.09, 0.26], [0.02, 0.27], [0.036, 0.215]], 'rgba(50, 46, 78, 0.55)', 10);
    mancha([[-0.068, 0.16], [-0.04, 0.16], [-0.036, 0.22], [-0.056, 0.22]], 'rgba(255, 240, 232, 0.45)', 7);
    // o pano dobra em V, pesando para baixo
    traco(-0.05, 0.19, -0.02, 0.232, 0.008, 0.25, 0.005, 'rgba(60, 56, 88, 0.4)', 3);
    traco(0.062, 0.188, 0.036, 0.23, 0.01, 0.25, 0.005, 'rgba(60, 56, 88, 0.45)', 3);
    traco(-0.03, 0.185, -0.004, 0.212, 0.004, 0.238, 0.003, 'rgba(60, 56, 88, 0.3)', 3);
    traco(-0.064, 0.2, -0.05, 0.225, -0.026, 0.246, 0.003, 'rgba(255, 244, 236, 0.4)', 2);
  });
  c.restore();

  // =============================================================================
  // 8. Cabeça: virada um pouco para a esquerda, um resto de rosto de perfil
  // =============================================================================
  c.save();
  // a cabeça cresce um pouco em torno da nuca (proporção de anime: ~7 cabeças)
  c.translate(0, 0.135); c.scale(1.2, 1.2); c.translate(0, -0.135);
  // rosto: só a bochecha e o queixo, sem detalhe
  forma([[-0.04, 0.068], [-0.052, 0.08], [-0.0565, 0.096], [-0.053, 0.111], [-0.044, 0.124], [-0.031, 0.131], [-0.014, 0.126], [-0.004, 0.105], [-0.012, 0.075]], grad(-0.058, 0.07, -0.01, 0.125, ['#f3c8a8', '#dca98f', '#b07f70']), () => {
    mancha([[-0.036, 0.112], [0.01, 0.1], [0.01, 0.14], [-0.04, 0.14]], 'rgba(110, 60, 70, 0.5)', 6);
  });

  const CABELO = grad(-0.06, 0.0, 0.05, 0.13, ['#3e2a2a', '#291b1f', '#191116']);
  const ponta = ([a, p, b]) => {
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.quadraticCurveTo((a[0] + p[0]) / 2 + (p[1] - a[1]) * 0.16, (a[1] + p[1]) / 2 - (p[0] - a[0]) * 0.16, p[0], p[1]);
    c.quadraticCurveTo((b[0] + p[0]) / 2 + (p[1] - b[1]) * 0.08, (b[1] + p[1]) / 2 - (p[0] - b[0]) * 0.08, b[0], b[1]);
    c.closePath();
    c.fillStyle = CABELO;
    c.fill();
  };
  // as pontas caem (nuca, lado, franja); no alto só dois tufos baixos
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
  ].forEach(ponta);
  forma([[-0.006, 0.006], [0.022, 0.01], [0.042, 0.026], [0.054, 0.05], [0.057, 0.076], [0.052, 0.1], [0.04, 0.118], [0.022, 0.126], [0.004, 0.124], [-0.012, 0.116], [-0.018, 0.1], [-0.015, 0.086], [-0.024, 0.076], [-0.034, 0.078], [-0.044, 0.076], [-0.054, 0.066], [-0.06, 0.048], [-0.054, 0.028], [-0.036, 0.012]], CABELO, () => {
    // volume: escuro embaixo e à direita, e a faixa de brilho no alto, do lado do sol
    mancha([[0.024, 0.05], [0.07, 0.04], [0.07, 0.14], [-0.01, 0.14], [0.006, 0.1]], 'rgba(8, 6, 14, 0.6)', 11);
    mancha([[-0.056, 0.04], [-0.03, 0.03], [0.0, 0.032], [0.022, 0.044], [0.022, 0.052], [0.0, 0.043], [-0.03, 0.042], [-0.054, 0.052]], 'rgba(214, 150, 120, 0.55)', 4);
  });
  // mechas: nascem em volta do redemoinho e caem para as pontas
  const mecha = (x0, y0, x, y, curv, larg, cor, d = 1) => {
    const mx = (x0 + x) / 2, my = (y0 + y) / 2;
    traco(x0, y0, mx + (y - y0) * curv, my - (x - x0) * curv, x, y, larg, cor, d);
  };
  const ESC = 'rgba(10, 7, 14, 0.5)';
  const CLA = 'rgba(120, 82, 74, 0.45)';
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
  // orelha, e a costeleta caindo na frente dela
  forma([[-0.031, 0.084], [-0.022, 0.079], [-0.015, 0.088], [-0.017, 0.102], [-0.025, 0.11], [-0.031, 0.101]], grad(-0.032, 0, -0.014, 0, ['#e8b598', '#bb8473']), () => {
    traco(-0.027, 0.086, -0.019, 0.09, -0.024, 0.104, 0.002, 'rgba(110, 60, 60, 0.5)', 1);
  });
  ponta([[-0.04, 0.074], [-0.037, 0.107], [-0.027, 0.077]]);
  c.restore();

  // =============================================================================
  // 9. A luz da hora: contraluz morna nas bordas (o sol baixo, atrás e à esquerda)
  //    e o corpo esfriando para o chão
  // =============================================================================
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
  };
  borda(5, 3, 0.7);
  borda(-3, 4, 0.28);
  c.save();
  c.globalCompositeOperation = 'source-atop';
  const frio = c.createLinearGradient(0, TOPO, 0, TOPO + S);
  frio.addColorStop(0, 'rgba(255, 170, 130, 0.08)');
  frio.addColorStop(0.5, 'rgba(40, 30, 70, 0.0)');
  frio.addColorStop(1, 'rgba(24, 18, 48, 0.3)');
  c.fillStyle = frio;
  c.fillRect(0, 0, w, h);
  c.restore();

  // ---- para o canvas de destino, com a borda um nada macia ---------------------
  const o = 0.45 * k;
  ctx.save();
  ctx.globalAlpha = 0.25;
  for (const [dx, dy] of [[-o, -o], [o, -o], [-o, o], [o, o]]) ctx.drawImage(tela, dx, dy);
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.drawImage(tela, 0, 0);
}

function pintarFigura() {
  const tela = document.createElement('canvas');
  tela.width = TEX_L;
  tela.height = TEX_A;
  const c = tela.getContext('2d');
  if (!c) return null;
  pintar(c, TEX_L, TEX_A);
  return tela;
}

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

export function criarEle(mundo) {
  if (!mundo || !mundo.ok) return null;
  const { THREE } = mundo;
  const figura = pintarFigura();
  const mancha = pintarSombra();
  if (!figura || !mancha) return null;

  // A névoa e a hora são as da alameda (por referência: mudam junto com ela).
  // Sem alameda (mundo branco), uma névoa branca fixa com a mesma curva.
  const dela = mundo.alameda && mundo.alameda.uniformes;
  const comuns = dela
    ? { uNevoa: dela.uNevoa, uCeu: dela.uCeu, uDens: dela.uDens, uTarde: dela.uTarde }
    : { uNevoa: { value: new THREE.Vector3(1, 1, 1) }, uCeu: { value: new THREE.Vector3(1, 1, 1) }, uDens: { value: 0.043 }, uTarde: { value: 0 } };
  const uOpacidade = { value: 0 };

  const textura = (tela) => {
    const t = new THREE.CanvasTexture(tela);
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    return t;
  };
  const material = (mapa, longe) => new THREE.ShaderMaterial({
    uniforms: { ...comuns, uMapa: { value: mapa }, uOpacidade, uLonge: { value: longe } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: false,
  });

  const grupo = new THREE.Group();
  grupo.name = 'ele';
  const escala = ALTURA / FIG;                              // metros por px da textura
  const mapaFigura = textura(figura);
  const corpo = new THREE.Mesh(new THREE.PlaneGeometry(TEX_L * escala, TEX_A * escala), material(mapaFigura, 0.8));
  corpo.position.y = (TEX_A / 2 - (TEX_A - TOPO - FIG)) * escala;   // as solas no chão
  corpo.renderOrder = -1;
  const mapaSombra = textura(mancha);
  const sombra = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.5), material(mapaSombra, 0.8));
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.set(0, 0.012, 0.04);
  sombra.renderOrder = -2;
  grupo.add(sombra, corpo);
  grupo.visible = false;

  // Vivo: respira um nada (quem espera de pé nunca está parado de todo).
  const calmo = mundo.amb && mundo.amb.reduzido;
  const pararQuadro = mundo.aoQuadro((dt, t) => {
    if (!grupo.visible || calmo) return;
    corpo.rotation.z = Math.sin(t * 0.55) * 0.004;
    corpo.scale.y = 1 + Math.sin(t * 0.9 + 1) * 0.0022;
  });

  const gsap = window.gsap;
  let tween = null;
  let fora = false;
  const ir = (alvo, duracao) => new Promise((ok) => {
    if (tween) tween.kill();
    if (!gsap || !(duracao > 0)) { uOpacidade.value = alvo; ok(); return; }
    tween = gsap.to(uOpacidade, { value: alvo, duration: duracao, ease: 'sine.inOut', onComplete: ok });
  });

  function dispose() {
    if (fora) return;
    fora = true;
    if (tween) tween.kill();
    pararQuadro();
    grupo.removeFromParent();
    for (const m of [corpo, sombra]) { m.geometry.dispose(); m.material.dispose(); }
    mapaFigura.dispose();
    mapaSombra.dispose();
  }

  return {
    grupo,
    /** A mão que segura o fio, no mundo. */
    ancora(saida = new THREE.Vector3()) {
      return saida.set(grupo.position.x + MAO.x * ALTURA, grupo.position.y + (1 - MAO.y) * ALTURA, grupo.position.z + 0.03);
    },
    mostrar(duracao = 3) { if (fora) return Promise.resolve(); grupo.visible = true; return ir(1, duracao); },
    sair(duracao = 0.8) { if (fora) return Promise.resolve(); return ir(0, duracao).then(dispose); },
    dispose,
  };
}
