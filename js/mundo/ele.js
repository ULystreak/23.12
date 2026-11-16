// Ele, no fim do fio: um rapaz de pé, de costas, esperando, visto de longe na
// alameda ao entardecer. É para onde o fio leva na caminhada da cena da mão.
//
//   criarEle(mundo) → { grupo, ancora(saida?) → Vector3, mostrar(duracao), sair(duracao) → Promise, dispose() }
//
// Só existe com WebGL (sem ele a cena segue sem a figura). Não é imagem de
// arquivo: a figura é pintada uma vez num canvas (cabelo curto e arrepiado,
// casaco escuro de capuz com a pala cinza, calça, tênis; contraluz morna nas
// bordas) e vira a textura de um plano em pé no chão da alameda, com uma sombra
// de contato. O material usa a MESMA névoa e a mesma luz da hora da alameda
// (os uniformes dela, por referência): de longe ele é só um vulto na névoa, e
// ganha corpo conforme ela chega perto. Não é um adesivo: escurece com a tarde.
//
// `grupo` fica com os pés na origem (y = 0 é o chão); `ancora()` devolve, no
// mundo, a mão que segura o fio (a direita dele: à direita de quem o vê de costas).

const ALTURA = 1.74;                 // metros, do chão ao alto do cabelo
const TEX_L = 512;
const TEX_A = 1024;
const FIG = 960;                     // altura da figura na textura (px)
const TOPO = 32;                     // margem acima do cabelo (px)
const MAO = { x: 0.137, y: 0.535 };  // a mão do fio, em frações da altura (x a partir do eixo)

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

/** Caminho fechado e macio por uma lista de pontos (curvas pelos pontos médios). */
function macio(c, pts) {
  const n = pts.length;
  const meio = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = meio(pts[n - 1], pts[0]);
  c.beginPath();
  c.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const m = meio(pts[i], pts[(i + 1) % n]);
    c.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  c.closePath();
}

/** Caminho fechado de cantos vivos. */
function vivo(c, pts) {
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  c.closePath();
}

function pintarFigura() {
  const tela = document.createElement('canvas');
  tela.width = TEX_L;
  tela.height = TEX_A;
  const c = tela.getContext('2d');
  if (!c) return null;
  // frações da altura → px (x a partir do eixo do corpo)
  const P = (x, y) => [TEX_L / 2 + x * FIG, TOPO + y * FIG];
  const L = (lista) => lista.map(([x, y]) => P(x, y));
  const espelho = (lista) => lista.map(([x, y]) => [-x, y]);

  const CASACO = '#252a3d';
  const CASACO_ESCURO = '#191c2b';
  const PALA = '#77737f';
  const CALCA = '#4a4148';
  const PELE = '#c59c8a';
  const CABELO = '#1b1519';
  const LUZ = 'rgb(255, 184, 140)';

  /** Preenche e dá a contraluz por dentro da borda (o sol está atrás dele). */
  const forma = (pts, cor, { suave = true, luz = 0, sombra = 0 } = {}) => {
    (suave ? macio : vivo)(c, pts);
    c.fillStyle = cor;
    c.fill();
    c.save();
    c.clip();
    if (sombra) {
      // o lado de baixo da peça escurece (volume simples, de pintura chapada)
      const ys = pts.map((p) => p[1]);
      const g = c.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
      g.addColorStop(0, 'rgba(10, 8, 20, 0)');
      g.addColorStop(1, `rgba(10, 8, 20, ${sombra})`);
      c.fillStyle = g;
      c.fill();
    }
    if (luz) {
      c.strokeStyle = LUZ;
      c.lineWidth = luz;
      c.lineJoin = 'round';
      c.stroke();
    }
    c.restore();
  };

  // ---- pernas e tênis --------------------------------------------------------
  const perna = [[0.099, 0.47], [0.101, 0.56], [0.096, 0.66], [0.089, 0.735], [0.086, 0.83], [0.08, 0.945], [0.03, 0.945], [0.027, 0.83], [0.02, 0.735], [0.012, 0.64], [0.003, 0.555], [0.0, 0.47]];
  const tenis = [[0.088, 0.925], [0.095, 0.965], [0.09, 0.995], [0.02, 0.995], [0.015, 0.965], [0.022, 0.925]];
  for (const lado of [espelho, (l) => l]) {
    forma(L(lado(tenis)), '#8d858e', { sombra: 0.35 });
    forma(L(lado(perna)), CALCA, { suave: false, sombra: 0.42 });
  }
  // a sola clara dos tênis
  c.fillStyle = 'rgba(226, 218, 214, 0.75)';
  for (const s of [-1, 1]) c.fillRect(...P(s * 0.055 - 0.036, 0.984), 0.072 * FIG, 0.011 * FIG);
  // pregas da calça: atrás dos joelhos e o tecido que pesa sobre o tênis
  c.strokeStyle = 'rgba(16, 12, 22, 0.38)';
  c.lineWidth = 2.5;
  c.lineCap = 'round';
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(...P(s * 0.028, 0.73)); c.quadraticCurveTo(...P(s * 0.055, 0.744), ...P(s * 0.084, 0.729));
    c.moveTo(...P(s * 0.04, 0.752)); c.quadraticCurveTo(...P(s * 0.058, 0.76), ...P(s * 0.074, 0.752));
    c.moveTo(...P(s * 0.036, 0.918)); c.quadraticCurveTo(...P(s * 0.055, 0.93), ...P(s * 0.078, 0.916));
    c.moveTo(...P(s * 0.058, 0.56)); c.quadraticCurveTo(...P(s * 0.052, 0.64), ...P(s * 0.056, 0.7));
    c.stroke();
  }

  // ---- mãos (pele), saindo das mangas -----------------------------------------
  const mao = [[0.12, 0.488], [0.117, 0.525], [0.122, 0.556], [0.136, 0.57], [0.149, 0.556], [0.154, 0.522], [0.152, 0.488]];
  forma(L(mao), PELE, { sombra: 0.4 });
  forma(L(espelho(mao)), PELE, { sombra: 0.4 });

  // ---- casaco: tronco, mangas, pala cinza e capuz -----------------------------
  const tronco = [[-0.04, 0.146], [-0.118, 0.168], [-0.114, 0.3], [-0.103, 0.42], [-0.108, 0.502], [-0.05, 0.512], [0, 0.514], [0.05, 0.512], [0.108, 0.502], [0.103, 0.42], [0.114, 0.3], [0.118, 0.168], [0.04, 0.146]];
  const manga = [[0.092, 0.156], [0.128, 0.166], [0.146, 0.2], [0.154, 0.28], [0.157, 0.38], [0.155, 0.5], [0.116, 0.503], [0.113, 0.4], [0.108, 0.3], [0.1, 0.22]];
  forma(L(tronco), CASACO, { suave: false, sombra: 0.5 });
  forma(L(manga), CASACO, { suave: false, sombra: 0.42 });
  forma(L(espelho(manga)), CASACO, { suave: false, sombra: 0.42 });
  // a pala: a faixa cinza de ombro a ombro (só por cima do casaco)
  c.save();
  c.globalCompositeOperation = 'source-atop';
  c.beginPath();
  c.rect(...P(-0.17, 0.14), 0.34 * FIG, 0.115 * FIG);
  c.clip();
  macio(c, L([[-0.18, 0.12], [-0.18, 0.226], [-0.09, 0.246], [0, 0.252], [0.09, 0.246], [0.18, 0.226], [0.18, 0.12]]));
  c.fillStyle = PALA;
  c.fill();
  c.restore();
  // as costuras: onde a manga encontra o tronco, a barra, o punho e as dobras do cotovelo
  c.strokeStyle = 'rgba(10, 10, 20, 0.5)';
  c.lineWidth = 2.5;
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(...P(s * 0.104, 0.2)); c.quadraticCurveTo(...P(s * 0.114, 0.3), ...P(s * 0.112, 0.47));
    c.moveTo(...P(s * 0.117, 0.484)); c.lineTo(...P(s * 0.155, 0.481));
    c.moveTo(...P(s * 0.124, 0.345)); c.quadraticCurveTo(...P(s * 0.138, 0.356), ...P(s * 0.153, 0.34));
    c.stroke();
  }
  c.beginPath();
  c.moveTo(...P(-0.106, 0.487)); c.quadraticCurveTo(...P(0, 0.497), ...P(0.106, 0.487));
  c.stroke();
  // o capuz, caído nas costas
  forma(L([[-0.058, 0.126], [-0.08, 0.162], [-0.062, 0.214], [0, 0.238], [0.062, 0.214], [0.08, 0.162], [0.058, 0.126], [0, 0.116]]), CASACO_ESCURO, { sombra: 0.3 });
  c.strokeStyle = 'rgba(70, 76, 104, 0.5)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(...P(-0.05, 0.15)); c.quadraticCurveTo(...P(0, 0.2), ...P(0.05, 0.15));
  c.stroke();

  // ---- pescoço, orelhas, cabelo -----------------------------------------------
  forma(L([[-0.024, 0.1], [-0.027, 0.15], [0.027, 0.15], [0.024, 0.1]]), PELE, { suave: false, sombra: 0.5 });
  for (const s of [-1, 1]) forma(L([[s * 0.046, 0.068], [s * 0.058, 0.074], [s * 0.057, 0.094], [s * 0.046, 0.1]]), PELE);
  // a cabeça vista de trás: uma massa arredondada e mechas soltas, poucas e
  // desiguais (no alto, dos lados e na nuca)
  forma(L([[0, 0.006], [0.034, 0.012], [0.054, 0.04], [0.058, 0.076], [0.05, 0.106], [0.03, 0.124], [0, 0.128], [-0.03, 0.124], [-0.05, 0.106], [-0.058, 0.076], [-0.054, 0.04], [-0.034, 0.012]]), CABELO);
  const mechas = [
    [[0.012, 0.016], [0.04, -0.002], [0.046, 0.034]], [[-0.034, 0.02], [-0.016, -0.006], [0.004, 0.014]],
    [[0.04, 0.022], [0.064, 0.026], [0.056, 0.056]], [[-0.046, 0.03], [-0.068, 0.04], [-0.056, 0.064]],
    [[0.054, 0.058], [0.07, 0.078], [0.054, 0.092]], [[-0.055, 0.07], [-0.069, 0.094], [-0.05, 0.1]],
    [[0.044, 0.098], [0.056, 0.124], [0.03, 0.118]], [[-0.046, 0.1], [-0.05, 0.128], [-0.028, 0.118]],
    [[0.008, 0.12], [0.022, 0.15], [0.034, 0.116]], [[-0.03, 0.118], [-0.018, 0.144], [-0.004, 0.122]],
    [[-0.008, 0.122], [0.003, 0.154], [0.014, 0.122]],
  ];
  for (const m of mechas) forma(L(m), CABELO, { suave: false });
  // algumas mechas por dentro, um tom acima
  c.strokeStyle = 'rgba(92, 70, 74, 0.5)';
  c.lineWidth = 2;
  for (const [x1, y1, x2, y2, x3, y3] of [
    [-0.004, 0.02, -0.03, 0.05, -0.036, 0.095], [0.006, 0.022, 0.03, 0.055, 0.034, 0.1],
    [0.0, 0.03, 0.006, 0.07, -0.004, 0.115], [-0.02, 0.03, -0.046, 0.06, -0.048, 0.085], [0.022, 0.03, 0.047, 0.058, 0.048, 0.088],
  ]) {
    c.beginPath();
    c.moveTo(...P(x1, y1)); c.quadraticCurveTo(...P(x2, y2), ...P(x3, y3));
    c.stroke();
  }

  // ---- a contraluz: o sol está atrás dele, e a silhueta inteira ganha um fio de
  // luz morna nas bordas de cima e dos lados (a figura menos ela mesma deslocada).
  const borda = (dx, dy, alfa) => {
    const luz = document.createElement('canvas');
    luz.width = TEX_L; luz.height = TEX_A;
    const l = luz.getContext('2d');
    l.drawImage(tela, 0, 0);
    l.globalCompositeOperation = 'source-in';
    l.fillStyle = LUZ;
    l.fillRect(0, 0, TEX_L, TEX_A);
    l.globalCompositeOperation = 'destination-out';
    l.drawImage(tela, dx, dy);
    c.save();
    c.globalCompositeOperation = 'source-atop';
    c.globalAlpha = alfa;
    c.drawImage(luz, 0, 0);
    c.restore();
  };
  borda(3, 5, 0.5);
  borda(-3, 5, 0.5);
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
