// A alameda: o lugar onde as cartas acontecem, construído em 3D.
//
// Uma alameda de cerejeiras em flor numa manhã nublada: caminho de cascalho
// claro que curva de leve e some na névoa rosada, troncos escuros e retorcidos
// dos dois lados com as copas fechando um túnel por cima, postes baixos com
// correntes nas margens, sebes e um salgueiro à esquerda, um lago calmo à direita.
//
// Tudo é gerado aqui, sem nenhum arquivo: árvores por recursão (tubos de poucos
// lados), copas de cartões de flor instanciados (textura pintada num canvas, com
// alpha-to-coverage em vez de mistura: sem ordenar e sem pagar transparência),
// chão procedural num shader só (cascalho, pétalas, grama, meio-fio, lago com
// reflexo falso, sombras de contato e luz manchada das copas), céu e névoa
// próprios. Sem shadow maps e sem pós-processamento.
//
// O corredor é infinito para a frente: árvores, postes, sebes e capim moram em
// "vagas" calculadas pelo índice (a mesma árvore volta sempre igual no mesmo
// lugar) e só as vagas perto da câmera existem; a névoa esconde onde elas nascem.
//
//   const alameda = criarAlameda(mundo)
//   alameda.grupo                    o Object3D (já na cena)
//   alameda.pronta                   Promise: programas compilados e a alameda entrando
//   alameda.atualizar(dt, t)         a cada quadro, antes do render (mundo.js chama)
//   alameda.aplicarHora(estado)      a hora do dia (js/mundo/hora.js): luz, névoa, céu, estrelas e cometa
//   alameda.nivel(nivel)             'alto'|'medio'|'baixo' (qualidade adaptativa)
//   alameda.centro(z)                x do meio do caminho na profundidade z
//
// O chão é y = 0. O caminho tem 3,5 m de largura e o meio dele fica sempre a
// menos de 0,65 m de x = 0, onde a câmera anda: o fio da cena da mão corre por
// dentro dele sem chegar perto dos postes.

import { clamp, lerp, semente } from '../nucleo/util.js';
import { pintarCometa } from './hora.js';

// ---- o lugar ------------------------------------------------------------------------

const MEIA_PISTA = 1.75;            // metade da largura do caminho
const ESP_ARVORE = 4.6;             // entre duas cerejeiras do mesmo lado
const ESP_POSTE = 2.0;
const LAGO = 5.1;                   // a margem do lago à direita (do meio do caminho)
const ATRAS = 9;                    // metros atrás da câmera que ainda existem (ela olha para trás no fim da mão)
const ALCANCE = { alto: 46, medio: 42, baixo: 34 };      // metros à frente
const CARTOES = { alto: 1000, medio: 800, baixo: 520 };   // cartões de flor por árvore
const VARIANTES = 3;
const SALGUEIRO_A_CADA = 38;
// O atlas de flores: 4 × 2 ladrilhos de 512 px.
const ATLAS = { colunas: 4, linhas: 2 };
const LAD = { massas: [0, 1, 2], cachos: [3, 4, 7], salgueiro: 5, capim: 6 };

// Cores (sRGB, os shaders da alameda trabalham direto nesse espaço).
const NEVOA = [0.925, 0.878, 0.902];      // #ece0e6: a luz rosada no fundo do túnel
const CEU = [0.972, 0.962, 0.968];        // branco-perolado no alto
// (as cores das outras horas do dia estão em js/mundo/hora.js)

/** O meio do caminho em x, na profundidade z: uma curva longa e leve. */
export function centroCaminho(z) {
  const u = -z;
  return 0.45 * Math.sin(0.12 * u) + 0.18 * Math.sin(0.047 * u);
}
const CENTRO_GLSL = /* glsl */ `
float centro(float z) { float u = -z; return 0.45 * sin(0.12 * u) + 0.18 * sin(0.047 * u); }
`;

/** Número pseudoaleatório estável para uma vaga (k), um lado e um "sal". */
function h(k, lado, sal) {
  const x = Math.sin(k * 12.9898 + lado * 78.233 + sal * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

// ---- trechos de GLSL comuns ---------------------------------------------------------

const COMUM = /* glsl */ `
uniform vec3 uNevoa;
uniform vec3 uCeu;
uniform float uDens;
uniform float uTarde;
uniform vec3 uLuz;
uniform float uNoite;
uniform float uSurgir;
uniform float uTempo;

// Névoa da alameda: exponencial, longa (o túnel some a ~45 m), mais clara para o alto.
vec3 nevoar(vec3 cor, vec3 wp) {
  vec3 d = wp - cameraPosition;
  float dist = length(d);
  float f = 1.0 - exp(-pow(dist * uDens, 1.45));
  vec3 nc = mix(uNevoa, uCeu, smoothstep(0.0, 0.55, d.y / max(dist, 0.001)));
  return mix(cor, nc, f);
}
// A hora do dia (js/mundo/hora.js): a luz multiplica a cor de tudo; a névoa e o
// céu mudam por uniforme, no JS. (uTarde continua existindo para a figura dele.)
vec3 tardar(vec3 c) { return c * uLuz; }
// A alameda nasce do branco.
vec3 acabar(vec3 c) { return mix(vec3(1.0), c, uSurgir); }

// O vão do caminho: a câmera anda por baixo das pernadas, e um galho que passasse
// rente a ela viraria uma lâmina escura cruzando a tela. Tudo o que está dentro
// de um tubo em volta da linha dos olhos (uVao.xy: x da câmera, amortecido, e a
// altura; uVao.z: o raio livre) é empurrado para fora, sem dobra: o raio r vai
// para rMin + (rOut − rMin)·(r/rOut)^p, que vale rMin no eixo e tem derivada 1 em
// rOut. Só perto da câmera em z (uVaoZ): ao longe as copas fecham o túnel
// como na foto, e o galho sobe devagar enquanto ela se aproxima.
uniform vec3 uVao;
uniform float uVaoZ;
vec3 abrirVao(vec3 wp) {
  vec2 q = vec2(wp.x - uVao.x, wp.y - uVao.y);
  float rOut = uVao.z + 1.0;
  float r = length(q);
  if (r >= rOut || uVao.z <= 0.0) return wp;
  float p = rOut / (rOut - uVao.z);
  float r2 = uVao.z + (rOut - uVao.z) * pow(r / rOut, p);
  vec2 dir = r > 1e-4 ? q / r : vec2(0.0, 1.0);
  // o pé do tronco não sai do lugar
  q += dir * (r2 - r) * smoothstep(0.3, 1.1, wp.y) * (1.0 - smoothstep(2.5, 6.5, abs(wp.z - uVaoZ)));
  return vec3(q.x + uVao.x, q.y + uVao.y, wp.z);
}

// Vento: balanço lento com fase pela posição, e um tremor mais rápido nas pontas.
vec3 vento(vec3 wp, float flex, float semente, float forca) {
  float f = uTempo * 0.55 + wp.x * 0.19 + wp.z * 0.13;
  vec3 o = vec3(sin(f), 0.0, cos(f * 0.83 + 1.3)) * 0.05;
  o.y = sin(f * 1.1 + 0.6) * 0.012;
  o += vec3(sin(uTempo * 2.3 + semente * 41.0), 0.0, cos(uTempo * 1.9 + semente * 23.0)) * 0.012;
  return o * flex * forca;
}
`;

// ---- texturas pintadas no começo ------------------------------------------------------

/**
 * Ruído em ladrilho (256², RGBA): R e G são fbm de duas sementes, B é o valor de
 * cada célula de Voronoi (32 por lado: pedrinhas, pétalas no chão), A é a borda
 * entre células. Tudo se repete sem emenda.
 */
function texturaRuido(THREE) {
  const N = 256;
  const dados = new Uint8Array(N * N * 4);
  const grade = (f, s) => {
    const r = semente(s);
    const g = new Float32Array(f * f);
    for (let i = 0; i < g.length; i++) g[i] = r();
    return g;
  };
  const valor = (g, f, x, y) => {
    const xi = Math.floor(x); const yi = Math.floor(y);
    const fx = x - xi; const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx); const sy = fy * fy * (3 - 2 * fy);
    const a = g[((yi % f) * f) + (xi % f)];
    const b = g[((yi % f) * f) + ((xi + 1) % f)];
    const c = g[(((yi + 1) % f) * f) + (xi % f)];
    const d = g[(((yi + 1) % f) * f) + ((xi + 1) % f)];
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  };
  const oitavas = (base, s) => {
    const gs = [];
    for (let o = 0; o < 5; o++) gs.push({ f: base << o, g: grade(base << o, s + o * 7) });
    return gs;
  };
  const fbmR = oitavas(4, 11);
  const fbmG = oitavas(8, 53);
  const fbm = (gs, u, v) => {
    let soma = 0; let amp = 0.5; let norma = 0;
    for (const { f, g } of gs) { soma += valor(g, f, u * f, v * f) * amp; norma += amp; amp *= 0.5; }
    return soma / norma;
  };
  // Voronoi
  const C = 32;
  const rv = semente(97);
  const pontos = new Float32Array(C * C * 3);
  for (let i = 0; i < C * C; i++) { pontos[i * 3] = rv(); pontos[i * 3 + 1] = rv(); pontos[i * 3 + 2] = rv(); }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N; const v = y / N;
      const i = (y * N + x) * 4;
      const r = fbm(fbmR, u, v);
      const g = fbm(fbmG, u, v);
      // contraste: o fbm puro fica todo perto de 0,5
      dados[i] = clamp((r - 0.5) * 1.9 + 0.5) * 255;
      dados[i + 1] = clamp((g - 0.5) * 1.9 + 0.5) * 255;
      const cx = u * C; const cy = v * C;
      const ix = Math.floor(cx); const iy = Math.floor(cy);
      let d1 = 9; let d2 = 9; let id = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const qx = ix + ox; const qy = iy + oy;
          const k = (((qy + C) % C) * C + ((qx + C) % C)) * 3;
          const px = qx + pontos[k]; const py = qy + pontos[k + 1];
          const d = Math.hypot(cx - px, cy - py);
          if (d < d1) { d2 = d1; d1 = d; id = pontos[k + 2]; } else if (d < d2) d2 = d;
        }
      }
      dados[i + 2] = id * 255;
      dados[i + 3] = clamp((d2 - d1) * 1.6) * 255;
    }
  }
  const t = new THREE.DataTexture(dados, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/**
 * Atlas 4×2 (ladrilhos de 512²): três massas de flor (muitas flores pequenas em
 * cachos encostados), três cachos soltos (um deles num raminho), os ramos
 * pendentes do salgueiro e as folhas do capim (tingidos no shader). Cada flor:
 * cinco pétalas com o entalhe na ponta, base rosada, miolo escuro e estames;
 * algumas mais brancas, algumas mais rosadas, botões entre elas.
 */
function texturaFlores(THREE) {
  const T = 512;
  const tela = document.createElement('canvas');
  tela.width = T * ATLAS.colunas;
  tela.height = T * ATLAS.linhas;
  const g = tela.getContext('2d');
  const r = semente(2312);
  const noLadrilho = (i, fn) => {
    g.save();
    g.translate((i % ATLAS.colunas) * T, Math.floor(i / ATLAS.colunas) * T);
    g.scale(T / 256, T / 256);
    fn();
    g.restore();
  };

  function petala(raio) {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-raio * 0.5, raio * 0.22, -raio * 0.5, raio * 0.92, -raio * 0.13, raio * 1.0);
    g.lineTo(0, raio * 0.86);
    g.lineTo(raio * 0.13, raio * 1.0);
    g.bezierCurveTo(raio * 0.5, raio * 0.92, raio * 0.5, raio * 0.22, 0, 0);
    g.closePath();
  }

  // tom: 1 = flor da frente; < 1 = mais para dentro do cacho. branco: 0 = rosa, 1 = quase branca.
  function flor(x, y, raio, giro, achatar, tom, branco = 0.4) {
    g.save();
    g.translate(x, y);
    g.rotate(giro);
    g.scale(1, achatar);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, raio);
    const k = tom;
    const c = (rr, gg, bb) => `rgb(${Math.round(rr * k)}, ${Math.round(gg * k)}, ${Math.round(bb * k)})`;
    const b = (rosa, claro) => lerp(rosa, claro, branco);
    grad.addColorStop(0, c(228, 140, 172));
    grad.addColorStop(0.3, c(b(240, 248), b(178, 214), b(204, 228)));
    grad.addColorStop(0.72, c(b(247, 252), b(214, 240), b(228, 245)));
    grad.addColorStop(1, c(b(242, 250), b(200, 232), b(220, 240)));
    const e = raio / 14;                     // linhas e pontos acompanham o tamanho da flor
    for (let i = 0; i < 5; i++) {
      g.save();
      g.rotate((i / 5) * Math.PI * 2 + (r() - 0.5) * 0.3);
      petala(raio * (0.88 + r() * 0.22));
      g.fillStyle = grad;
      g.fill();
      g.lineWidth = 0.5 * e;
      g.strokeStyle = c(b(232, 242), b(186, 214), b(205, 228));
      g.stroke();
      g.restore();
    }
    // estames
    g.lineWidth = 0.75 * e;
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const l = raio * (0.22 + r() * 0.2);
      g.strokeStyle = c(206, 110, 142);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * l, Math.sin(a) * l); g.stroke();
      g.fillStyle = r() < 0.5 ? c(236, 196, 120) : c(226, 140, 168);
      g.beginPath(); g.arc(Math.cos(a) * l, Math.sin(a) * l, 1.0 * e, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = c(206, 118, 148);
    g.beginPath(); g.arc(0, 0, raio * 0.1, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // botão: uma gota rosa-forte, fechada
  function botao(x, y, raio, giro) {
    g.save();
    g.translate(x, y);
    g.rotate(giro);
    g.fillStyle = 'rgb(214, 108, 146)';
    g.beginPath(); g.ellipse(0, 0, raio * 0.55, raio, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(250, 205, 222, 0.7)';
    g.beginPath(); g.ellipse(-raio * 0.15, -raio * 0.25, raio * 0.2, raio * 0.45, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // Cachos de flor num ladrilho de 256 (escalado ×2 no canvas): `centros` são os
  // pontos de onde saem os pedúnculos; cada cacho tem o seu tom (uns mais brancos,
  // outros mais rosados), e há botões entre as flores.
  function cachos(centros, porCacho, raioFlor, raioEspalha) {
    const flores = [];
    for (const c of centros) {
      const n = porCacho + Math.floor(r() * 3);
      const branco = r();
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * raioEspalha;
        flores.push({
          x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d, raio: raioFlor * (0.78 + r() * 0.42),
          z: r(), cx: c.x, cy: c.y, branco: clamp(branco + (r() - 0.5) * 0.3), botao: r() < 0.12,
        });
      }
    }
    // pedúnculos: finos, marrom-avermelhados, saindo do mesmo ponto
    g.strokeStyle = 'rgb(104, 60, 58)';
    g.lineWidth = raioFlor * 0.075;
    for (const f of flores) {
      g.beginPath(); g.moveTo(f.cx, f.cy + raioFlor * 0.4); g.quadraticCurveTo((f.cx + f.x) / 2 + 2, (f.cy + f.y) / 2 + 3, f.x, f.y); g.stroke();
    }
    flores.sort((p, q) => p.z - q.z);
    for (const f of flores) {
      if (f.botao) botao(f.x, f.y, f.raio * 0.38, r() * 6.3);
      else flor(f.x, f.y, f.raio, r() * 6.3, 0.45 + r() * 0.55, 0.72 + f.z * 0.28, f.branco);
    }
  }
  // um disco de contorno irregular cheio de cachos pequenos (a casca da copa)
  function massa(nCachos, raio) {
    const centros = [];
    for (let c = 0; c < nCachos; c++) {
      const a = r() * Math.PI * 2;
      const d = raio * Math.sqrt(0.04 + 0.96 * r());
      centros.push({ x: 128 + Math.cos(a) * d, y: 128 + Math.sin(a) * d * 0.92 });
    }
    cachos(centros, 4, 9.5, 15);
  }
  noLadrilho(0, () => massa(26, 82));
  noLadrilho(1, () => massa(22, 76));
  noLadrilho(2, () => massa(30, 88));
  // cachos soltos, para as bordas e as pontas
  noLadrilho(3, () => cachos([{ x: 100, y: 112 }, { x: 156, y: 104 }, { x: 128, y: 158 }, { x: 84, y: 166 }], 5, 12, 21));
  noLadrilho(4, () => cachos([{ x: 128, y: 120 }, { x: 170, y: 150 }, { x: 92, y: 150 }], 6, 13, 22));
  // um raminho com flores: a madeira aparece entre os cachos
  noLadrilho(7, () => {
    const pts = [];
    for (let i = 0; i <= 6; i++) pts.push({ x: 30 + i * 33 + (r() - 0.5) * 10, y: 190 - i * 22 + (r() - 0.5) * 16 });
    g.strokeStyle = 'rgb(70, 50, 48)';
    g.lineCap = 'round';
    for (let i = 0; i < pts.length - 1; i++) {
      g.lineWidth = lerp(5, 1.6, i / 6);
      g.beginPath(); g.moveTo(pts[i].x, pts[i].y); g.lineTo(pts[i + 1].x, pts[i + 1].y); g.stroke();
    }
    cachos(pts.slice(1).map((p) => ({ x: p.x + (r() - 0.5) * 8, y: p.y - 6 })), 3, 10.5, 13);
  });

  // ramos pendentes (salgueiro): claros, tingidos no shader
  noLadrilho(LAD.salgueiro, () => {
    const T2 = 256;
    for (let i = 0; i < 9; i++) {
      const x0 = 18 + i * 26 + (r() - 0.5) * 10;
      const curva = (r() - 0.5) * 30;
      const tom = 170 + Math.floor(r() * 80);
      g.strokeStyle = `rgb(${tom}, ${tom}, ${tom - 20})`;
      g.fillStyle = `rgb(${tom}, ${tom}, ${tom - 18})`;
      g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x0, 2); g.quadraticCurveTo(x0 + curva, T2 * 0.5, x0 + curva * 0.6, T2 - 4); g.stroke();
      for (let y = 8; y < T2 - 8; y += 7) {
        const tt = y / T2;
        const xa = lerp(x0, x0 + curva * 0.6, tt) + Math.sin(tt * 3) * curva * 0.3;
        const lado = (y / 7) % 2 ? 1 : -1;
        g.beginPath();
        g.ellipse(xa + lado * 4, y, 2.2, 7.5, lado * 0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
  // capim: folhas finas e pontudas que nascem embaixo e se curvam (tom de 0,55 a 1, tingido no shader)
  noLadrilho(LAD.capim, () => {
    for (let i = 0; i < 26; i++) {
      const x0 = 20 + r() * 216;
      const curva = (r() - 0.5) * 70;
      const alt = 150 + r() * 100;
      const larg = 2.2 + r() * 2.2;
      const tom = 140 + Math.floor(r() * 115);
      g.fillStyle = `rgb(${tom}, ${tom}, ${Math.round(tom * 0.9)})`;
      g.beginPath();
      g.moveTo(x0 - larg, 256);
      g.quadraticCurveTo(x0 - larg * 0.6 + curva * 0.3, 256 - alt * 0.55, x0 + curva, 256 - alt);
      g.quadraticCurveTo(x0 + larg * 0.6 + curva * 0.3, 256 - alt * 0.55, x0 + larg, 256);
      g.closePath();
      g.fill();
    }
  });

  // Alfa pré-multiplicado: os mipmaps fazem a média só do que existe (sem clarear
  // nem escurecer as bordas ao longe); o shader divide de volta.
  const t = new THREE.CanvasTexture(tela);
  t.premultiplyAlpha = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  return t;
}

// ---- geometria: tubos (galhos) ---------------------------------------------------------

/**
 * Um tubo ao longo de uma polilinha com raios variáveis e referencial de
 * transporte paralelo (não torce). Escreve em `saida` (arrays planos).
 */
function tubo(THREE, pontos, raios, lados, flex, ao, saida, rugas = 0, fase = 0) {
  const n = pontos.length;
  const tang = [];
  for (let i = 0; i < n; i++) {
    const a = pontos[Math.max(0, i - 1)];
    const b = pontos[Math.min(n - 1, i + 1)];
    tang.push(new THREE.Vector3().subVectors(b, a).normalize());
  }
  let normal = new THREE.Vector3(0, 0, 1);
  if (Math.abs(tang[0].dot(normal)) > 0.9) normal.set(1, 0, 0);
  normal.sub(tang[0].clone().multiplyScalar(normal.dot(tang[0]))).normalize();
  const base = saida.pos.length / 3;
  let v = 0;
  const aux = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      // transporte paralelo
      const eixo = new THREE.Vector3().crossVectors(tang[i - 1], tang[i]);
      const s = eixo.length();
      if (s > 1e-5) {
        const ang = Math.asin(clamp(s, -1, 1));
        normal.applyAxisAngle(eixo.normalize(), ang);
      }
      v += pontos[i].distanceTo(pontos[i - 1]);
    }
    const binormal = new THREE.Vector3().crossVectors(tang[i], normal);
    for (let j = 0; j <= lados; j++) {
      const a = (j / lados) * Math.PI * 2;
      aux.copy(normal).multiplyScalar(Math.cos(a)).addScaledVector(binormal, Math.sin(a));
      const p = pontos[i];
      // seção retorcida: sulcos que torcem devagar ao longo do galho (casca velha)
      const ri = raios[i] * (1 + rugas * (0.6 * Math.sin(a * 3 + v * 1.7 + fase) + 0.4 * Math.sin(a * 5 - v * 2.9 + fase * 1.3)));
      saida.pos.push(p.x + aux.x * ri, p.y + aux.y * ri, p.z + aux.z * ri);
      saida.nor.push(aux.x, aux.y, aux.z);
      saida.uv.push(j / lados, v / 0.6);
      saida.flex.push(flex[i]);
      saida.ao.push(ao[i]);
    }
  }
  const anel = lados + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < lados; j++) {
      const a = base + i * anel + j;
      const b = a + anel;
      saida.idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
}

/** Catmull-Rom: deixa a polilinha do galho curva (sem quinas), com `sub` pontos por trecho. */
function suavizar(THREE, pts, listas, sub) {
  const n = pts.length;
  const novos = [];
  const outras = listas.map(() => []);
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]; const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < sub; k++) {
      const t = k / sub; const t2 = t * t; const t3 = t2 * t;
      const c = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      novos.push(new THREE.Vector3(c(p0.x, p1.x, p2.x, p3.x), c(p0.y, p1.y, p2.y, p3.y), c(p0.z, p1.z, p2.z, p3.z)));
      listas.forEach((l, j) => outras[j].push(lerp(l[i], l[i + 1], t)));
    }
  }
  novos.push(pts[n - 1].clone());
  listas.forEach((l, j) => outras[j].push(l[n - 1]));
  return [novos, ...outras];
}

function geometriaDeTubos(THREE, saida) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(saida.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(saida.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(saida.uv, 2));
  g.setAttribute('aFlex', new THREE.Float32BufferAttribute(saida.flex, 1));
  g.setAttribute('aAo', new THREE.Float32BufferAttribute(saida.ao, 1));
  g.setIndex(saida.idx);
  return g;
}

// ---- geometria: cartões (flores, salgueiro, capim) ---------------------------------------

/** Cada conjunto de cartões tem a sua semente: o mesmo layout a cada carregamento. */
function novosCartoes(s = 1) {
  return { pos: [], uv: [], centro: [], cor: [], dados: [], nor: [], canto: [], idx: [], r: semente(s * 7 + 3) };
}

/**
 * Um cartão: centro, tamanho (l × a), orientação (dois eixos), ladrilho do
 * atlas (ver ATLAS), cor (tinta), ao (0 = fundo do cacho, 1 = luz), flex embaixo e em cima.
 */
function cartao(saida, c, l, a, eixoX, eixoY, ladrilho, cor, ao, flexBaixo, flexCima, virar = 0, fracU = 1) {
  const base = saida.pos.length / 3;
  const u0 = (ladrilho % ATLAS.colunas) / ATLAS.colunas;
  const v0 = (ATLAS.linhas - 1 - Math.floor(ladrilho / ATLAS.colunas)) / ATLAS.linhas;   // o canvas tem y para baixo; a textura, flipY
  const lu = 1 / ATLAS.colunas; const lv = 1 / ATLAS.linhas;
  const cantos = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const sementeCartao = saida.r();
  const offU = (saida.r() - 0.5) * (1 - fracU);
  for (const [x, y] of cantos) {
    saida.pos.push(
      c.x + eixoX.x * x * l + eixoY.x * y * a,
      c.y + eixoX.y * x * l + eixoY.y * y * a,
      c.z + eixoX.z * x * l + eixoY.z * y * a,
    );
    // gira o uv dentro do ladrilho (cachos não ficam todos "em pé")
    const ux = x * fracU + offU; const uy = y;
    const m = 0.985;                       // um respiro para o filtro não pegar o vizinho
    saida.uv.push(u0 + lu * (0.5 + ux * m), v0 + lv * (0.5 + uy * m));
    saida.centro.push(c.x, c.y, c.z);
    saida.nor.push(eixoX.y * eixoY.z - eixoX.z * eixoY.y, eixoX.z * eixoY.x - eixoX.x * eixoY.z, eixoX.x * eixoY.y - eixoX.y * eixoY.x);
    saida.cor.push(cor[0], cor[1], cor[2]);
    saida.dados.push(ao, y < 0 ? flexBaixo : flexCima, sementeCartao, virar);
    // o canto no plano do cartão (para virá-lo para a câmera no shader), girado ao acaso
    const g = sementeCartao * 6.2832;
    saida.canto.push((x * Math.cos(g) - y * Math.sin(g)) * l, (x * Math.sin(g) + y * Math.cos(g)) * a);
  }
  saida.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function geometriaDeCartoes(THREE, saida) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(saida.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(saida.uv, 2));
  g.setAttribute('aCentro', new THREE.Float32BufferAttribute(saida.centro, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(saida.nor, 3));
  g.setAttribute('aCor', new THREE.Float32BufferAttribute(saida.cor, 3));
  g.setAttribute('aDados', new THREE.Float32BufferAttribute(saida.dados, 4));
  g.setAttribute('aCanto', new THREE.Float32BufferAttribute(saida.canto, 2));
  g.setIndex(saida.idx);
  return g;
}

// ---- a cerejeira ------------------------------------------------------------------------

/**
 * Uma cerejeira (espaço local: base do tronco na origem, +x aponta para o meio
 * do caminho). Tronco curto e grosso que se abre em três ou quatro pernadas
 * longas, que sobem e depois se arqueiam; galhos e raminhos em volta. As flores
 * nascem em cachos ao longo dos galhos finos.
 */
// Altura mínima de um galho conforme avança para o caminho (x local; o meio do
// caminho fica a ~3 m do tronco): livre perto do tronco, 3,3 m por cima do caminho.
function teto(x) {
  const t = clamp((x - 0.9) / 1.3);
  return 3.3 * t * t * (3 - 2 * t);
}

function gerarCerejeira(THREE, s, nCartoes) {
  const r = semente(s);
  const rand = (a, b) => a + (b - a) * r();
  const tubos = { pos: [], nor: [], uv: [], flex: [], ao: [], idx: [] };
  const nos = [];                          // onde nascem as flores: { p, peso }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  function galho(p0, dir, comp, r0, r1, nivel, flex0, peso = 1) {
    const segs = [6, 9, 5, 2][nivel];
    const lados = [8, 7, 4, 3][nivel];
    const torto = [0.16, 0.2, 0.26, 0.34][nivel];
    const arco = [0, 0.3, 0.14, 0.05][nivel];
    // ziguezague: a cerejeira cresce de gema em gema e o galho muda de rumo a cada nó
    const quebra = [0, 0.2, 0.24, 0.26][nivel];
    const pts = [p0.clone()];
    const raios = [r0 * (nivel === 0 ? 1.45 : 1)];
    const flex = [flex0];
    const ao = [];
    const d = dir.clone().normalize();
    const fase = r() * 6.28;
    const lateral = new THREE.Vector3().crossVectors(d, V(0, 1, 0));
    if (lateral.lengthSq() < 1e-4) lateral.set(1, 0, 0);
    lateral.normalize();
    let sinal = r() < 0.5 ? 1 : -1;
    let p = p0.clone();
    for (let i = 1; i <= segs; i++) {
      d.x += rand(-torto, torto); d.y += rand(-torto, torto) * 0.6; d.z += rand(-torto, torto);
      if (quebra > 0) {
        if (r() < 0.8) sinal = -sinal;
        d.addScaledVector(lateral, sinal * quebra * rand(0.5, 1.2));
        d.y += sinal * quebra * rand(-0.15, 0.35);
      }
      d.y = Math.max(-0.2, d.y - arco * (i / segs) * 1.4);   // o peso arqueia a pernada, sem despencar
      if (nivel === 1) {                    // e ela serpenteia (cerejeira velha)
        d.x += Math.sin(i * 1.7 + fase) * 0.16; d.z += Math.cos(i * 1.3 + fase) * 0.16;
      }
      d.normalize();
      p = p.clone().addScaledVector(d, (comp / segs) * rand(0.8, 1.2));
      // por cima do caminho o galho sobe: perto da linha dos olhos ele passaria
      // rente à câmera (o vão do shader só acerta o resto, de leve)
      const minY = teto(p.x);
      if (p.y < minY) {
        p.y = lerp(p.y, minY, 0.85);
        d.subVectors(p, pts[pts.length - 1]).normalize();
      }
      pts.push(p);
      const t = i / segs;
      // afina mais depressa no começo e vai até um fio; aqui e ali um nó (gema velha, corte)
      let rr = lerp(r0, r1, Math.pow(t, 0.7)) * (1 + (r() - 0.5) * 0.12);
      if (nivel <= 2 && i < segs && r() < 0.22) rr *= rand(1.15, 1.32);
      raios.push(rr);
      flex.push(flex0 + (nivel === 0 ? 0 : t * [0, 0.25, 0.45, 0.6][nivel]));
    }
    for (let i = 0; i < pts.length; i++) {
      // dentro da copa e embaixo dela é mais escuro
      ao.push(clamp(0.35 + pts[i].y * 0.09 + nivel * 0.1, 0.3, 1));
    }
    raios[raios.length - 1] *= 0.4;        // a ponta afina
    const [lp, lr, lf, la] = suavizar(THREE, pts, [raios, flex, ao], [2, 2, 2, 1][nivel]);
    if (nivel < 3) tubo(THREE, lp, lr, lados, lf, la, tubos, nivel === 1 ? 0.07 : 0.03, fase);   // os raminhos ficam por baixo das flores

    if (nivel >= 2 || (nivel === 1 && comp < 3)) {
      for (let i = 1; i < pts.length; i++) nos.push({ p: pts[i], peso: (nivel === 3 ? 1.4 : 1) * peso, flex: flex[i] });
    } else if (nivel === 1) {
      for (let i = Math.floor(pts.length * 0.3); i < pts.length; i++) nos.push({ p: pts[i], peso: (i === pts.length - 1 ? 2.5 : 0.9) * peso, flex: flex[i] });
    }
    if (nivel >= 3) return;

    const filhos = nivel === 0 ? 0 : nivel === 1 ? 5 + Math.floor(r() * 2) : 2 + Math.floor(r() * 2);
    for (let f = 0; f < filhos; f++) {
      const t = rand(0.3, 1);
      const i = Math.min(pts.length - 1, Math.max(1, Math.round(t * (pts.length - 1))));
      const base = pts[i];
      const local = new THREE.Vector3().subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[i - 1]).normalize();
      const lado = V(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize();
      const nd = local.clone().multiplyScalar(0.6).addScaledVector(lado, 0.75).normalize();
      if (nd.y < -0.2) nd.y = -0.2;
      const rb = lerp(r0, r1, t);
      galho(base, nd, comp * (nivel === 1 ? rand(0.3, 0.45) : rand(0.35, 0.55)), rb * 0.62, rb * 0.25, nivel + 1, flex[i], peso);
    }
  }

  // tronco: inclinado para o caminho, curto
  const inclina = rand(0.12, 0.34);
  const giroBase = rand(-0.35, 0.35);
  const dTronco = V(Math.sin(inclina) * Math.cos(giroBase), Math.cos(inclina), Math.sin(inclina) * Math.sin(giroBase));
  const altTronco = rand(1.6, 2.3);
  const rTronco = rand(0.2, 0.27);
  {
    const pts = [V(0, -0.15, 0)];
    const raios = [rTronco * 1.6];
    const d = dTronco.clone();
    let p = pts[0].clone();
    const segs = 6;
    for (let i = 1; i <= segs; i++) {
      d.x += rand(-0.12, 0.12); d.z += rand(-0.12, 0.12); d.normalize();
      p = p.clone().addScaledVector(d, altTronco / segs);
      pts.push(p);
      raios.push(lerp(rTronco * 1.15, rTronco * 0.82, i / segs) * (1 + (r() - 0.5) * 0.14));
    }
    // o tronco fecha num domo logo acima de onde as pernadas nascem (sem a boca do tubo aparecendo)
    const ptsT = [...pts, pts[segs].clone().addScaledVector(d, rTronco * 0.55)];
    const raiosT = [...raios, rTronco * 0.3];
    const [tp, tr, tf, ta] = suavizar(THREE, ptsT, [raiosT, ptsT.map(() => 0), ptsT.map((q) => clamp(0.4 + q.y * 0.18, 0.4, 0.85))], 2);
    tubo(THREE, tp, tr, 12, tf, ta, tubos, 0.13, r() * 6.28);
    // pernadas
    const topo = pts[pts.length - 1];
    const n = 3 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      // a primeira vai para o caminho, longa: é ela que fecha o túnel
      const az = i === 0 ? rand(-0.35, 0.35) : (i / n) * Math.PI * 2 + rand(-0.4, 0.4);
      const el = i === 0 ? rand(0.72, 0.92) : rand(0.6, 1.05);
      const dir = V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
      const comp = i === 0 ? rand(3.7, 4.4) : rand(2.6, 3.6);
      galho(topo.clone().addScaledVector(dir, rTronco * 0.3), dir, comp, rTronco * 0.62, rTronco * 0.16, 1, 0.08, i === 0 ? 1.7 : 1);
    }
  }

  // ---- cartões de flor ----
  const cartoes = novosCartoes(s);
  let pesoTotal = 0;
  for (const n of nos) pesoTotal += n.peso;
  // copa: centro e extensão, para a oclusão falsa
  const caixa = new THREE.Box3();
  for (const n of nos) caixa.expandByPoint(n.p);
  const centro = caixa.getCenter(new THREE.Vector3());
  const ext = caixa.getSize(new THREE.Vector3());
  const ex = V(); const ey = V(); const nrm = V();
  const rosaClaro = [1.0, 0.965, 0.98];
  const rosa = [0.97, 0.74, 0.85];
  for (let i = 0; i < nCartoes; i++) {
    let alvo = r() * pesoTotal;
    let no = nos[0];
    for (const n of nos) { alvo -= n.peso; if (alvo <= 0) { no = n; break; } }
    // gaussiana em volta do nó, um pouco para fora e para cima
    const g = () => (r() + r() + r() - 1.5) * 0.8;
    const c = V(no.p.x + g() * 0.5, no.p.y + g() * 0.32 + 0.12, no.p.z + g() * 0.5);
    if (c.y < 2.0) c.y = 2.0 + r() * 0.3;
    if (c.y < teto(c.x) - 0.25) c.y = teto(c.x) - 0.25 + r() * 0.3;
    // luz de céu nublado: o alto e a borda da copa claros, a barriga (o que se vê
    // de baixo) e o miolo em malva; dentro de cada cacho, de cima para baixo
    const fora = clamp(Math.hypot((c.x - centro.x) / (ext.x * 0.5 + 0.5), (c.z - centro.z) / (ext.z * 0.5 + 0.5)));
    const alto = clamp((c.y - caixa.min.y) / Math.max(0.5, ext.y));
    const local = clamp((c.y - no.p.y) / 0.45 * 0.5 + 0.5);
    const ao = clamp(0.06 + 0.5 * alto + 0.22 * fora + 0.26 * local + (r() - 0.5) * 0.14);
    // orientação: normal aleatória, com preferência por olhar para fora e para cima
    nrm.set(r() - 0.5, r() * 0.8, r() - 0.5).add(V(c.x - centro.x, 0, c.z - centro.z).multiplyScalar(0.12)).normalize();
    ex.set(-nrm.z, 0, nrm.x);
    if (ex.lengthSq() < 1e-4) ex.set(1, 0, 0);
    ex.normalize();
    ey.crossVectors(nrm, ex).normalize();
    // 60% massas grandes (casca da copa), 40% cachos pequenos (bordas e pontas)
    const massa = r() < 0.6;
    const tam = massa ? rand(0.56, 0.84) : rand(0.3, 0.42);
    const v = Math.pow(r(), 1.3);
    const cor = [lerp(rosaClaro[0], rosa[0], v), lerp(rosaClaro[1], rosa[1], v), lerp(rosaClaro[2], rosa[2], v)];
    cartao(cartoes, c, tam, tam, ex, ey, (massa ? LAD.massas : LAD.cachos)[Math.floor(r() * 3) % 3], cor, ao, no.flex + 0.35, no.flex + 0.45, 0.72);
  }
  // os cartões numa ordem qualquer: o nível baixo desenha só os primeiros
  return { tronco: geometriaDeTubos(THREE, tubos), copa: geometriaDeCartoes(THREE, cartoes) };
}

/** O salgueiro (à esquerda, longe): tronco alto e ramos verdes pendentes. */
function gerarSalgueiro(THREE, s) {
  const r = semente(s);
  const rand = (a, b) => a + (b - a) * r();
  const tubos = { pos: [], nor: [], uv: [], flex: [], ao: [], idx: [] };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const pontas = [];
  const tronco = [V(0, -0.1, 0), V(0.05, 1.2, 0.02), V(0.1, 2.4, -0.05), V(0.05, 3.2, 0)];
  tubo(THREE, tronco, [0.36, 0.28, 0.24, 0.2], 8, [0, 0, 0, 0.05], [0.4, 0.5, 0.6, 0.7], tubos);
  for (let i = 0; i < 6; i++) {
    const az = (i / 6) * Math.PI * 2 + rand(-0.3, 0.3);
    const el = rand(0.7, 1.1);
    const pts = [tronco[3].clone()];
    let p = pts[0].clone();
    const d = V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    for (let k = 1; k <= 5; k++) {
      d.y -= 0.12; d.normalize();
      p = p.clone().addScaledVector(d, 0.65);
      pts.push(p);
      pontas.push(p);
    }
    tubo(THREE, pts, pts.map((_, k) => lerp(0.13, 0.03, k / 5)), 5, pts.map((_, k) => k * 0.1), pts.map(() => 0.7), tubos);
  }
  const cartoes = novosCartoes(s);
  const ex = V(); const ey = V(0, 1, 0);
  for (let i = 0; i < 420; i++) {
    const o = pontas[Math.floor(r() * pontas.length)];
    const comp = rand(1.4, 2.6);
    const c = V(o.x + rand(-0.9, 0.9), o.y - comp * 0.5 + rand(-0.2, 0.3), o.z + rand(-0.9, 0.9));
    if (c.y - comp * 0.5 < 0.25) c.y = 0.25 + comp * 0.5;
    const az = r() * Math.PI;
    ex.set(Math.cos(az), 0, Math.sin(az));
    const v = r();
    const cor = [lerp(0.55, 0.72, v), lerp(0.66, 0.82, v), lerp(0.38, 0.5, v)];
    const alto = clamp((c.y + comp * 0.5) / 5);
    cartao(cartoes, c, rand(0.25, 0.4), comp, ex, ey, LAD.salgueiro, cor, 0.35 + alto * 0.55, 1.6, 0.4, 0, 0.45);
  }
  return { tronco: geometriaDeTubos(THREE, tubos), copa: geometriaDeCartoes(THREE, cartoes) };
}

/** Uma touceira de capim na margem do lago. */
function gerarCapim(THREE, s) {
  const r = semente(s);
  const cartoes = novosCartoes(s);
  const ex = new THREE.Vector3(); const ey = new THREE.Vector3();
  for (let i = 0; i < 36; i++) {
    const alt = 0.4 + r() * 0.55;
    const c = new THREE.Vector3((r() - 0.5) * 1.6, alt * 0.5 - 0.02, (r() - 0.5) * 1.6);
    const az = r() * Math.PI;
    ex.set(Math.cos(az), 0, Math.sin(az));
    ey.set((r() - 0.5) * 0.25, 1, (r() - 0.5) * 0.25).normalize();
    // verde-oliva com pontas palha (como os juncos da margem na foto)
    const v = r();
    const palha = r() < 0.35 ? 1 : 0;
    const cor = palha
      ? [lerp(0.5, 0.6, v), lerp(0.42, 0.5, v), lerp(0.26, 0.32, v)]
      : [lerp(0.3, 0.4, v), lerp(0.36, 0.44, v), lerp(0.17, 0.23, v)];
    cartao(cartoes, c, 0.26 + r() * 0.16, alt, ex, ey, LAD.capim, cor, 0.45 + r() * 0.35, 0, 1.2, 0, 0.5);
  }
  return geometriaDeCartoes(THREE, cartoes);
}

/** O poste baixo (preto, com a cabeça redonda), já com a base enterrada. */
function gerarPoste(THREE) {
  const corpo = new THREE.CylinderGeometry(0.038, 0.046, 0.62, 10, 1, true);
  corpo.translate(0, 0.29, 0);
  const anel = new THREE.CylinderGeometry(0.052, 0.052, 0.035, 10, 1, false);
  anel.translate(0, 0.47, 0);
  const cabeca = new THREE.SphereGeometry(0.048, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6);
  cabeca.translate(0, 0.585, 0);
  const partes = [corpo, anel, cabeca].map((g) => g.toNonIndexed());
  const pos = []; const nor = [];
  for (const g of partes) {
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/**
 * Um vão de corrente (de z = 0 a z = −ESP_POSTE), em catenária: elos pequenos,
 * alternando de pé e deitado. Cada elo é um cartão com um anel desenhado no shader.
 */
function gerarCorrente(THREE) {
  const pos = []; const uv = []; const nor = []; const idx = [];
  const L = ESP_POSTE;
  const ELO = 0.052;
  const n = Math.round(L / (ELO * 0.82));
  const yAlt = 0.44;
  const flecha = 0.15;
  const y = (t) => yAlt - flecha * (1 - (2 * t - 1) ** 2) - 0.012 * Math.sin(t * Math.PI);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const zc = -t * L;
    const yc = y(t);
    const dy = (y(Math.min(1, t + 0.01)) - y(Math.max(0, t - 0.01))) / (0.02 * L);
    const tz = new THREE.Vector3(0, dy, -1).normalize();
    const deitado = i % 2 === 1;
    const lado = deitado ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0).sub(tz.clone().multiplyScalar(tz.y)).normalize();
    const normal = new THREE.Vector3().crossVectors(tz, lado).normalize();
    const base = pos.length / 3;
    const cantos = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [a, b] of cantos) {
      const p = new THREE.Vector3(0, yc, zc).addScaledVector(tz, a * ELO * 0.5).addScaledVector(lado, b * ELO * 0.33);
      pos.push(p.x, p.y, p.z);
      uv.push(a * 0.5 + 0.5, b * 0.5 + 0.5);
      nor.push(normal.x, normal.y, normal.z);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/**
 * Arbusto / sebe podada: uma caixa de cantos bem redondos (superelipsoide) com
 * calombos de ramagem em duas escalas e a base achatada no chão. Cada instância
 * estica de um jeito (sebe comprida, touceira), então os calombos variam junto.
 */
function gerarArbusto(THREE) {
  const g = new THREE.SphereGeometry(1, 22, 14);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const e = 3.2;                              // expoente: 2 = esfera, maior = mais caixa
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.pow(Math.abs(v.x) ** e + Math.abs(v.y) ** e + Math.abs(v.z) ** e, 1 / e);
    v.divideScalar(Math.max(n, 1e-4));
    const k = 1
      + 0.09 * Math.sin(v.x * 4.1 + v.y * 2.3) * Math.cos(v.z * 3.7 - v.y * 2.9)
      + 0.06 * Math.sin(v.x * 9.3 + v.z * 7.1 + 1.7) * Math.sin(v.y * 8.2 - v.z * 3.3)
      + 0.035 * Math.sin(v.x * 17.0 - v.y * 13.0 + v.z * 15.0);
    v.multiplyScalar(k);
    if (v.y < -0.3) v.y = -0.3 - (v.y + 0.3) * 0.08;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// ---- shaders ---------------------------------------------------------------------------

const VERT_CHAO = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG_CHAO = /* glsl */ `
${COMUM}
${CENTRO_GLSL}
uniform sampler2D uRuido;
uniform vec4 uArvores[12];
uniform float uDetalhe;
varying vec3 vW;

void main() {
  vec2 p = vW.xz;
  vec3 V = vW - cameraPosition;
  float dist = length(V);
  float c = centro(p.y);
  float dx = p.x - c;
  float adx = abs(dx);

  vec4 nA = texture2D(uRuido, p * 0.045);
  vec4 nB = texture2D(uRuido, p * 0.19 + 0.31);
  vec4 nC = texture2D(uRuido, p * 0.83 + 0.67);
  vec4 g1 = texture2D(uRuido, p * 1.9 + 0.13);
  vec4 g2 = uDetalhe > 0.5 ? texture2D(uRuido, p * 4.3 + 0.71) : vec4(0.5);
  float longe = smoothstep(6.0, 22.0, dist);

  // ---- o caminho: cascalho claro com pétalas ----
  float W = ${MEIA_PISTA.toFixed(2)} + (nB.r - 0.5) * 0.16;
  float aa = fwidth(adx) * 1.2 + 0.006;
  float naPista = 1.0 - smoothstep(W - aa, W + aa, adx);
  vec3 cas = mix(vec3(0.62, 0.55, 0.5), vec3(0.74, 0.67, 0.61), nC.r * 0.6 + nB.g * 0.4);
  float grao = mix(0.93 + 0.14 * g1.b, 1.0, longe);
  cas *= grao * mix(mix(0.86, 1.0, smoothstep(0.0, 0.22, g1.a)), 1.0, longe);
  cas *= 0.95 + 0.1 * g2.b;
  cas *= mix(1.0, 0.86, smoothstep(W - 0.6, W, adx));      // as bordas mais úmidas
  // pétalas: acumuladas nas bordas e em manchas de tapete, mais visíveis ao longe
  float tapete = smoothstep(0.55, 0.8, nA.r * 0.7 + nB.g * 0.4);
  float dens = 0.07 + 0.55 * smoothstep(W - 0.8, W - 0.05, adx) + 0.4 * tapete + 0.35 * smoothstep(8.0, 30.0, dist);
  dens = clamp(dens + longe * 0.18 * tapete, 0.0, 0.94);
  float largo = 0.07 + fwidth(g2.b) * 0.5;
  float pet = smoothstep(1.0 - dens - largo, 1.0 - dens + largo, mix(g2.b, g1.b, 0.55));
  pet = mix(pet, dens, longe);                               // ao longe, só o tom
  vec3 rosa = mix(vec3(0.9, 0.68, 0.79), vec3(0.97, 0.85, 0.9), nC.g);
  vec3 cor = mix(cas, rosa, pet * 0.92);

  // ---- meio-fio de pedra escura ----
  float meio = smoothstep(W, W + aa, adx) * (1.0 - smoothstep(W + 0.12, W + 0.12 + aa, adx));
  float junta = smoothstep(0.03, 0.0, abs(fract(p.y * 1.9 + step(0.0, dx) * 0.5) - 0.5) - 0.47);
  vec3 pedra = mix(vec3(0.34, 0.33, 0.34), vec3(0.5, 0.48, 0.47), step(dx, 0.0)) * (0.85 + 0.3 * nC.b) * (1.0 - 0.3 * junta * (1.0 - longe));
  pedra = mix(pedra, rosa * 0.85, smoothstep(0.72, 0.9, g1.b) * 0.6);

  // ---- grama verde-acinzentada, com pétalas e terra ----
  vec3 grama = mix(vec3(0.3, 0.4, 0.2), vec3(0.47, 0.57, 0.3), nB.g);
  grama *= mix(0.78 + 0.4 * g2.r, 1.0, longe);
  grama = mix(grama, vec3(0.4, 0.34, 0.29), smoothstep(0.6, 0.8, nA.g) * 0.45);
  float dg = 0.2 + 0.4 * smoothstep(0.45, 0.8, nB.r) + 0.2 * (1.0 - smoothstep(W + 0.1, W + 1.4, adx));
  float petG = smoothstep(1.0 - dg - largo, 1.0 - dg + largo, g1.b);
  grama = mix(grama, rosa * 0.95, mix(petG, dg * 0.8, longe) * 0.85);

  float fora = 1.0 - naPista;
  cor = mix(grama, cor, naPista);
  cor = mix(cor, pedra, meio);

  // ---- árvores: terra em volta do tronco, sombra de contato e a sombra da copa ----
  float sh = 0.0;
  float terra = 0.0;
  for (int i = 0; i < 12; i++) {
    vec4 a = uArvores[i];
    vec2 d = p - a.xy;
    float r2 = dot(d, d);
    if (r2 > 14.0 * a.z) continue;          // longe: o que esta árvore somaria fica abaixo de 1/255
    sh += 0.5 * exp(-r2 / (0.35 * a.z)) + 0.16 * exp(-r2 / (3.0 * a.z));
    terra += exp(-r2 / (1.3 * a.z));
  }
  cor = mix(cor, vec3(0.27, 0.22, 0.2) * (0.8 + 0.4 * nC.r), clamp(terra, 0.0, 1.0) * fora * 0.75);

  // luz manchada das copas (manhã nublada: macia), mais forte no corredor
  float sob = 1.0 - smoothstep(4.2, 7.0, adx);
  float l1 = texture2D(uRuido, p * 0.29 + vec2(uTempo * 0.009, uTempo * 0.005)).r;
  float l2 = uDetalhe > 0.5 ? texture2D(uRuido, p * 0.61 - vec2(uTempo * 0.007, -uTempo * 0.004)).g : 0.5;
  float mancha = smoothstep(0.42, 0.68, l1 * 0.62 + l2 * 0.38);
  float ilum = mix(1.0, 0.93 + 0.1 * mancha, sob);
  ilum *= 1.0 - clamp(sh, 0.0, 0.5);
  // a borda do caminho fica sob as copas: meio-tom
  ilum *= 1.0 - 0.1 * smoothstep(W - 0.2, W + 1.5, adx) * sob;
  cor *= ilum;

  // ---- o lago à direita, logo atrás da fileira de troncos ----
  // O reflexo é o da outra margem: olhando a água num ângulo e abaixo do
  // horizonte, ela devolve o que está e acima dele (céu no alto, a faixa rosa
  // das copas da outra margem logo acima do horizonte, troncos e juncos na linha
  // d'água), com o ângulo em volta (azimute) desenhando colunas que as ondinhas tremem.
  float lx = dx - (${LAGO.toFixed(2)} + (nA.g - 0.5) * 1.5);
  if (lx > -0.8) {
    vec3 Vn = V / max(dist, 0.001);
    float rasante = 1.0 - clamp(-Vn.y, 0.0, 1.0);
    float fres = 0.15 + 0.85 * pow(rasante, 5.0);
    vec2 q = vec2(p.x * 0.45, p.y * 0.11) + vec2(uTempo * 0.006, uTempo * 0.018);
    float ond = texture2D(uRuido, q).g;
    float ond2 = texture2D(uRuido, vec2(p.x * 1.3, p.y * 0.4) - uTempo * 0.02).r;
    float tremor = (ond - 0.5) * 0.05 + (ond2 - 0.5) * 0.03;
    float e = -Vn.y + tremor * (0.4 + rasante);                 // o ângulo refletido acima do horizonte
    float az = atan(Vn.x, -Vn.z) + tremor * 0.25;
    float colA = texture2D(uRuido, vec2(az * 0.9, 0.17)).r;       // a silhueta das copas (altura por azimute)
    float colB = texture2D(uRuido, vec2(az * 3.1, 0.61)).b;       // troncos
    vec3 ceuR = mix(uNevoa, uCeu, smoothstep(0.05, 0.4, e));
    float topo = 0.09 + 0.13 * colA;                              // até onde vai a copa da outra margem
    float copa = 1.0 - smoothstep(topo - 0.02, topo + 0.02, e);
    vec3 rosaR = mix(vec3(0.8, 0.55, 0.68), vec3(0.9, 0.7, 0.8), colA);
    vec3 refl = mix(ceuR, rosaR, copa * 0.85);
    // linha d'água: juncos palha e troncos escuros
    float banco = 1.0 - smoothstep(0.012, 0.03, e);
    refl = mix(refl, mix(vec3(0.62, 0.52, 0.38), vec3(0.22, 0.19, 0.2), smoothstep(0.7, 0.85, colB)), banco * 0.8);
    refl = mix(refl, vec3(0.2, 0.17, 0.19), smoothstep(0.82, 0.92, colB) * (1.0 - smoothstep(0.02, 0.07, e)) * copa * 0.6);
    vec3 agua = mix(vec3(0.27, 0.3, 0.31), refl * 0.86, fres);   // a água devolve menos luz que o céu
    // brilho das ondinhas e a margem rasa, mais escura e terrosa
    agua *= 0.94 + 0.12 * smoothstep(0.55, 0.8, ond2);
    agua = mix(agua, vec3(0.34, 0.31, 0.27), (1.0 - smoothstep(0.0, 0.9, lx)) * 0.4 * (1.0 - longe));
    float margem = smoothstep(-0.8, -0.15, lx);
    float naAgua = smoothstep(-0.03, 0.03, lx);
    cor = mix(cor, vec3(0.3, 0.28, 0.22) * (0.8 + 0.4 * nC.r), margem * (1.0 - naAgua));
    cor = mix(cor, agua, naAgua);
  }

  cor = tardar(cor);
  cor = nevoar(cor, vW);
  gl_FragColor = vec4(acabar(cor), 1.0);
}
`;

const VERT_TRONCO = /* glsl */ `
${COMUM}
attribute float aFlex;
attribute float aAo;
uniform float uVento;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
varying float vAo;
varying float vFlex;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = m * instanceMatrix;
  #endif
  vec4 w = m * vec4(position, 1.0);
  w.xyz = abrirVao(w.xyz);
  w.xyz += vento(w.xyz, aFlex, 0.0, uVento);
  vW = w.xyz;
  vN = normalize(mat3(m) * normal);
  vUv = uv;
  vAo = aAo;
  vFlex = aFlex;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG_TRONCO = /* glsl */ `
${COMUM}
uniform sampler2D uRuido;
uniform vec3 uCasca;
uniform float uDetalhe;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
varying float vAo;
varying float vFlex;
void main() {
  // O vão (abrirVao) já tira os galhos de perto da câmera; se ainda assim algum
  // chegar a menos de ~1,6 m (a câmera sobe ou desvia), ele se dissolve em vez de
  // virar um recorte escuro: por cobertura (MSAA) ou pontilhado.
  float dist = length(vW - cameraPosition);
  // (acima da cabeça a dissolvência começa mais longe: de baixo, a pernada perto
  // é uma faixa larga e escura; ela se desfaz aos poucos, e as flores ficam)
  float perto = mix(smoothstep(1.05, 1.75, dist), smoothstep(1.4, 2.7, dist), smoothstep(2.1, 2.8, vW.y));
  perto = mix(1.0, perto, smoothstep(1.6, 2.2, vW.y));      // só os galhos acima da cabeça; o tronco fica
  #ifdef SEM_COBERTURA
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (perto < ign) discard;
  #else
    if (perto < 0.02) discard;
  #endif
  vec3 n0 = normalize(vN);
  vec3 n = n0;
  // uv: x dá a volta no galho, y corre ao longo dele (1 = 0,6 m)
  vec4 c1 = texture2D(uRuido, vec2(vUv.x * 0.5, vUv.y * 0.11));          // manchas largas
  vec4 c2 = texture2D(uRuido, vec2(vUv.x * 1.0, vUv.y * 1.6));           // lenticelas (riscos na horizontal)
  vec4 c3 = texture2D(uRuido, vec2(vUv.x * 1.5, vUv.y * 0.42) + 0.37);   // placas e fissuras
  float fissura = 1.0 - smoothstep(0.02, 0.24, c3.a);
  // aspereza: relevo da casca pelas derivadas da tela (sem mapa de normais)
  float relevo = uDetalhe * (1.0 - smoothstep(5.0, 16.0, dist));
  if (relevo > 0.01) {
    float alt = c3.r * 0.5 + (1.0 - fissura) * 0.5 + c2.b * 0.15;
    vec3 dpx = dFdx(vW); vec3 dpy = dFdy(vW);
    vec3 r1 = cross(dpy, n); vec3 r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(alt) * r1 + dFdy(alt) * r2) * 0.022 * relevo;
    n = normalize(abs(det) * n - grad);
  }
  // casca escura com variação: placas cinzentas, partes marrom-avermelhadas
  vec3 cor = uCasca * (0.62 + 0.75 * c1.r);
  cor = mix(cor, vec3(0.25, 0.165, 0.145), smoothstep(0.55, 0.85, c1.g) * 0.55);
  cor = mix(cor, vec3(0.36, 0.35, 0.34), smoothstep(0.62, 0.86, texture2D(uRuido, vUv * vec2(0.8, 0.25) + 0.13).r) * 0.5);
  cor *= mix(1.0, 0.5, fissura);
  cor = mix(cor, vec3(0.3, 0.27, 0.25), smoothstep(0.78, 0.95, c2.b) * 0.5);
  // musgo: em cima das pernadas grossas e no pé do tronco, onde a água escorre
  float musgo = smoothstep(0.48, 0.72, c1.b * 0.55 + c3.g * 0.45);
  float onde = max(smoothstep(0.2, 0.75, n0.y) * (1.0 - smoothstep(0.12, 0.35, vFlex)), 1.0 - smoothstep(0.25, 1.3, vW.y));
  cor = mix(cor, vec3(0.2, 0.26, 0.12) * (0.75 + 0.6 * c2.r), musgo * onde * 0.8);
  // céu nublado: luz de cima, um pouco do lado; o rosa das copas rebate embaixo
  float ceu = 0.45 + 0.55 * (n.y * 0.5 + 0.5);
  float lado = 0.85 + 0.25 * max(dot(n, normalize(vec3(-0.3, 0.4, 0.8))), 0.0);
  cor *= ceu * lado * mix(0.75, 1.25, vAo);
  // por baixo da copa o galho recebe o rosa que as flores rebatem (não é um recorte preto)
  cor += vec3(0.075, 0.04, 0.055) * max(-n.y, 0.0) * vAo;
  // dentro da copa a luz é a das flores: os galhos altos são malva-escuro, não recortes pretos
  cor = mix(cor, vec3(0.4, 0.31, 0.34) * (0.8 + 0.4 * c1.r), smoothstep(2.0, 3.8, vW.y) * 0.6);
  cor = tardar(cor);
  cor = nevoar(cor, vW);
  gl_FragColor = vec4(acabar(cor), perto);
}
`;

const VERT_CARTAO = /* glsl */ `
${COMUM}
attribute vec3 aCentro;
attribute vec3 aCor;
attribute vec4 aDados;
attribute vec2 aCanto;
uniform float uVento;
uniform float uEscala;
varying vec3 vW;
varying vec2 vUv;
varying vec3 vCor;
varying float vAo;
varying vec3 vN;
varying float vCy;
varying float vFlor;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = m * instanceMatrix;
  #endif
  vec3 c = abrirVao((m * vec4(aCentro, 1.0)).xyz);
  // Os cachos se viram em boa parte para a câmera (aDados.w): a copa fica cheia de
  // qualquer ângulo, e dois cartões grandes quase nunca se cruzam numa reta.
  float escalaM = length(m[0].xyz);
  vec3 paraCam = normalize(cameraPosition - c);
  vec3 dir = normalize(cross(vec3(0.0, 1.0, 0.0), paraCam));
  vec3 cima = cross(paraCam, dir);
  vec3 plano = mat3(m) * (position - aCentro);
  vec3 virado = (dir * aCanto.x + cima * aCanto.y) * escalaM;
  vec3 off = mix(plano, virado, aDados.w) * uEscala;
  vec4 w = vec4(c + off, 1.0);
  vN = normalize(mix(mat3(m) * normal, paraCam, aDados.w));
  w.xyz += vento(c, aDados.y, aDados.z, uVento);
  vW = w.xyz;
  vCy = c.y;
  vUv = uv;
  vCor = aCor;
  vAo = aDados.x;
  vFlor = step(0.01, aDados.w);               // só as flores se viram para a câmera
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG_CARTAO = /* glsl */ `
${COMUM}
uniform sampler2D uFlor;
uniform vec2 uPerto;
varying vec3 vW;
varying vec2 vUv;
varying vec3 vCor;
varying float vAo;
varying vec3 vN;
varying float vCy;
varying float vFlor;
void main() {
  vec4 t = texture2D(uFlor, vUv);
  // Desfazer o pré-multiplicado só onde o alfa tem informação: nos texels quase
  // transparentes (bordas e mipmaps) a divisão de valores de 8 bits estoura para o
  // branco e contorna cada cacho com um fio claro. Ali vale o tom médio da pétala.
  // (a folhagem, tingida, tem o seu tom médio: sem isso o capim ganhava um contorno rosa-claro)
  vec3 tomPetala = mix(vec3(0.78, 0.78, 0.72), vec3(0.93, 0.78, 0.85), vFlor);
  t.rgb = mix(tomPetala, min(t.rgb / max(t.a, 0.004), vec3(1.0)), smoothstep(0.12, 0.55, t.a));
  vec3 V = normalize(vW - cameraPosition);
  // rente à lente o cacho vira um borrão chapado: some antes (uPerto: de onde a onde;
  // a folha final empurra para trás de si, para nenhum cacho atravessar o papel)
  float pertoC = smoothstep(uPerto.x, uPerto.y, length(vW - cameraPosition));
  t.a *= pertoC;
  // de perfil o cartão viraria um risco: some antes disso
  float face = abs(dot(normalize(vN), V));
  t.a *= smoothstep(0.08, 0.32, face);
  // alfa afiado pela derivada: bordas nítidas a qualquer distância, sem sumir no mipmap
  float a = (t.a - 0.5) / max(fwidth(t.a), 0.0001) + 0.5;
  #ifdef SEM_COBERTURA
    if (a < 0.5) discard;
  #else
    if (a < 0.02) discard;
  #endif
  vec3 cor = t.rgb * vCor;
  // a borda de cada flor escurece um nada (separa as camadas, sem auréola clara)
  cor *= mix(0.8, 1.0, smoothstep(0.45, 0.95, t.a));
  // oclusão falsa: o fundo do cacho é malva; o alto da copa pega o céu
  // dentro de cada cartão também: o de cima pega mais céu (o cacho tem volume)
  float ao = clamp(vAo + (vW.y - vCy) * 0.9, 0.0, 1.0);
  cor *= mix(vec3(0.66, 0.47, 0.6), vec3(1.05, 1.03, 1.04), ao);
  // contra o céu (a casca de cima da copa), a pétala deixa a luz passar
  float ceu = smoothstep(0.1, 0.6, V.y) * smoothstep(0.45, 0.95, ao);
  cor = mix(cor, mix(cor, vec3(1.0, 0.96, 0.975), 0.6), ceu * 0.55);
  cor = tardar(cor);
  cor = nevoar(cor, vW);
  gl_FragColor = vec4(acabar(cor), clamp(a, 0.0, 1.0));
}
`;

const VERT_SIMPLES = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = m * instanceMatrix;
  #endif
  vec4 w = m * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(m) * normal);
  #ifdef COM_UV
    vUv = uv;
  #else
    vUv = vec2(0.0);
  #endif
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// postes e correntes: ferro preto com o brilho do céu nublado
const FRAG_FERRO = /* glsl */ `
${COMUM}
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
void main() {
  #ifdef ELO
    vec2 q = (vUv - 0.5) * vec2(1.0, 1.55);
    float r = length(q);
    if (abs(r - 0.36) > 0.12) discard;
  #endif
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 V = normalize(cameraPosition - vW);
  float ceu = n.y * 0.5 + 0.5;
  float fres = pow(1.0 - abs(dot(n, V)), 3.0);
  vec3 cor = vec3(0.07, 0.065, 0.075) * (0.7 + 0.5 * ceu);
  cor += vec3(0.5, 0.47, 0.5) * (fres * 0.55 + pow(max(n.y, 0.0), 6.0) * 0.25);
  cor = tardar(cor);
  cor = nevoar(cor, vW);
  gl_FragColor = vec4(acabar(cor), 1.0);
}
`;

const FRAG_ARBUSTO = /* glsl */ `
${COMUM}
uniform sampler2D uRuido;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  // projeção pelo eixo dominante da normal (o topo podado e os lados não esticam o desenho)
  vec3 an = abs(n);
  vec2 uv = an.y > max(an.x, an.z) ? vW.xz : (an.x > an.z ? vW.zy : vW.xy);
  vec4 tufo = texture2D(uRuido, uv * 0.3 + 0.21);    // tufos (~10 cm): b = cada um, a = a borda entre eles
  vec4 folha = texture2D(uRuido, uv * 1.7 + 0.57);   // folhas (~2 cm)
  vec4 manchas = texture2D(uRuido, uv * 0.11 + 0.83); // manchas maiores de luz e sombra
  float dist = length(vW - cameraPosition);
  float fino = 1.0 - smoothstep(7.0, 20.0, dist);
  // cada folha inclina para um lado: a luz pega umas e não outras
  n = normalize(n + (vec3(folha.b, 0.5, fract(folha.b * 7.3)) - 0.5) * 1.1 * fino);
  // verde de buxo: escuro no fundo dos tufos, amarelado onde a folha pega luz
  float tom = tufo.b * 0.3 + manchas.r * 0.3 + folha.b * 0.4 * fino;
  vec3 cor = mix(vec3(0.13, 0.2, 0.09), vec3(0.4, 0.5, 0.22), tom);
  cor *= mix(0.6, 1.0, smoothstep(0.0, 0.18, tufo.a) * 0.6 + manchas.g * 0.4);     // os vãos entre os tufos, macios
  cor *= mix(1.0, mix(0.62, 1.12, smoothstep(0.0, 0.22, folha.a)) * (0.85 + 0.3 * folha.g), fino);   // e entre as folhas
  float luz = 0.5 + 0.6 * (n.y * 0.5 + 0.5);
  cor *= luz * mix(0.5, 1.0, smoothstep(0.0, 0.6, vW.y));
  // pontas novas, verde-claro, nas folhas viradas para cima
  cor = mix(cor, vec3(0.55, 0.64, 0.3), smoothstep(0.7, 0.95, folha.b) * smoothstep(0.2, 0.8, n.y) * 0.6 * fino);
  // pétalas que caíram nas folhas (do tamanho de uma folha, esparsas)
  cor = mix(cor, vec3(0.93, 0.76, 0.84), step(0.93, folha.b) * smoothstep(0.75, 0.95, tufo.b) * smoothstep(0.3, 0.8, normalize(vN).y) * fino);
  // o contorno não é liso: no perfil, só as folhas de fora ficam
  float perfil = 1.0 - smoothstep(0.03, 0.22, abs(dot(normalize(vN), V)));
  float cheio = smoothstep(0.0, 0.25, tufo.a) * 0.6 + folha.b * 0.25 + 0.15;
  float a = cheio - perfil * 0.8 + 0.4;
  a = (a - 0.5) / max(fwidth(a), 0.0001) + 0.5;
  #ifdef SEM_COBERTURA
    if (a < 0.5) discard;
  #else
    if (a < 0.02) discard;
  #endif
  cor = tardar(cor);
  cor = nevoar(cor, vW);
  gl_FragColor = vec4(acabar(cor), clamp(a, 0.0, 1.0));
}
`;

const VERT_CEU = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * w;
  gl_Position.z = gl_Position.w * 0.99999;     // sempre no fundo
}
`;

const FRAG_CEU = /* glsl */ `
${COMUM}
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float alto = smoothstep(-0.02, 0.55, d.y);
  vec3 cor = mix(uNevoa, uCeu, alto);
  // um rosa quase nada logo acima do horizonte, para o lado do fundo do caminho
  cor = mix(cor, cor * vec3(1.0, 0.965, 0.985), (1.0 - smoothstep(0.0, 0.25, abs(d.y - 0.04))) * smoothstep(0.2, 1.0, -d.z) * 0.6);
  // à noite: estrelas (uma por célula de uma grade projetada do alto, piscando devagar)
  if (uNoite > 0.01 && d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.4) * 22.0;
    vec2 g = floor(uv);
    vec2 f = fract(uv) - 0.5;
    float h1 = fract(sin(dot(g, vec2(127.1, 311.7))) * 43758.5453);
    float h2 = fract(h1 * 91.7);
    float dist = length(f - (vec2(h2, fract(h1 * 37.3)) - 0.5) * 0.7);
    float brilho = step(0.5, h1) * (0.3 + 0.7 * fract(h1 * 13.1));
    float pisca = 0.72 + 0.28 * sin(uTempo * (0.7 + 2.0 * h2) + h1 * 40.0);
    float e = (1.0 - smoothstep(0.0, 0.085, dist)) * brilho * pisca * smoothstep(0.0, 0.2, d.y);
    cor += mix(vec3(0.8, 0.88, 1.0), vec3(1.0, 0.9, 0.86), h2) * e * uNoite;
  }
  // pontilhado contra faixas no degradê
  float r = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  cor += (r - 0.5) / 255.0;
  gl_FragColor = vec4(acabar(cor), 1.0);
}
`;

// pétalas de cerejeira soltas no ar, numa caixa que acompanha a câmera
const VERT_PETALAS = /* glsl */ `
${COMUM}
attribute vec4 aSemente;
uniform vec3 uCaixa;
uniform float uQueda;
uniform float uPx;
varying float vGiro;
varying float vAlfa;
varying vec3 vW;
void main() {
  vec3 base = cameraPosition + vec3(-uCaixa.x * 0.5, -1.4, -uCaixa.z * 0.82);
  float t = uTempo * uQueda;
  vec3 p = aSemente.xyz * uCaixa;
  p += vec3(t * 0.32 + sin(t * 0.7 + aSemente.w * 30.0) * 0.5, -t * (0.45 + aSemente.w * 0.35), t * 0.1 + cos(t * 0.5 + aSemente.w * 17.0) * 0.4);
  vec3 f = fract((p - base) / uCaixa);
  vec3 w = base + f * uCaixa;
  vec3 borda = min(f, 1.0 - f);
  vAlfa = smoothstep(0.0, 0.08, min(min(borda.x, borda.y), borda.z));
  vGiro = aSemente.w * 6.28 + t * (0.6 + aSemente.w);
  vW = w;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPx * (0.6 + aSemente.w * 0.6) / max(0.2, -mv.z);
}
`;

const FRAG_PETALAS = /* glsl */ `
${COMUM}
varying float vGiro;
varying float vAlfa;
varying vec3 vW;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float c = cos(vGiro); float s = sin(vGiro);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  q.y *= 1.0 + 0.6 * abs(sin(vGiro * 1.7));       // tombando: ora a face, ora o perfil
  float d = length(q * vec2(1.6, 1.0)) - 0.32 + 0.08 * smoothstep(0.0, 0.3, q.y) * (1.0 - smoothstep(0.0, 0.05, abs(q.x)));
  float a = (1.0 - smoothstep(-0.03, 0.02, d)) * vAlfa;
  if (a < 0.02) discard;
  vec3 cor = mix(vec3(0.97, 0.78, 0.86), vec3(1.0, 0.94, 0.96), smoothstep(0.2, -0.3, q.y));
  cor = tardar(cor);
  cor = nevoar(cor, vW);
  gl_FragColor = vec4(acabar(cor), a * 0.92);
}
`;

// ---- a alameda ---------------------------------------------------------------------------

export function criarAlameda(mundo) {
  const { THREE, renderer, cena, camera, amb } = mundo;
  let nivelAtual = amb.nivel || 'alto';
  const cobertura = amb.nivel !== 'baixo';           // MSAA ligado → alpha-to-coverage
  const grupo = new THREE.Group();
  grupo.name = 'alameda';
  grupo.visible = false;

  const ruido = texturaRuido(THREE);
  const flor = texturaFlores(THREE);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
  ruido.anisotropy = aniso;
  flor.anisotropy = Math.min(4, aniso);

  const corNevoa = new THREE.Color().setRGB(NEVOA[0], NEVOA[1], NEVOA[2], THREE.SRGBColorSpace);
  const comuns = {
    uNevoa: { value: new THREE.Vector3(...NEVOA) },
    uCeu: { value: new THREE.Vector3(...CEU) },
    uDens: { value: nivelAtual === 'baixo' ? 0.05 : 0.043 },
    uTarde: { value: 0 },
    uLuz: { value: new THREE.Vector3(1, 1, 1) },
    uNoite: { value: 0 },
    uSurgir: { value: 0 },
    uTempo: { value: 0 },
    uVao: { value: new THREE.Vector3(0, 1.6, 1.32) },
    uVaoZ: { value: 0 },
    uDeriva: { value: 0 },
  };
  const uVento = { value: amb.reduzido ? 0.25 : 1 };
  const uEscala = { value: 1 };
  const uPerto = { value: new THREE.Vector2(0.55, 1.25) };
  const uDetalhe = { value: nivelAtual === 'baixo' ? 0 : 1 };
  const arvoresU = Array.from({ length: 12 }, () => new THREE.Vector4(1e4, 1e4, 1, 0));

  // O passo de base (mundo.deriva): a alameda inteira desliza em +Z por baixo do
  // mundo. Os shaders continuam trabalhando nas coordenadas DA ALAMEDA (o desenho
  // do chão, o meio do caminho e as vagas não mudam); só a câmera é que é vista
  // de lá: a posição dela recua a deriva e a matriz de visão a devolve.
  const DERIVA_GLSL = `uniform float uDeriva;
#define camA (cameraPosition - vec3(0.0, 0.0, uDeriva))
#define viewA (viewMatrix * mat4(1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, uDeriva, 1.0))
`;
  const comDeriva = (glsl) => DERIVA_GLSL + glsl.replace(/cameraPosition/g, 'camA').replace(/viewMatrix/g, 'viewA');

  const material = (op) => {
    op.vertexShader = comDeriva(op.vertexShader);
    op.fragmentShader = comDeriva(op.fragmentShader);
    const m = new THREE.ShaderMaterial(op);
    if ('alphaToCoverage' in op) {           // (e sem cobertura, o alfa que passa do discard também vazaria)
      // Com alpha-to-coverage o alfa do fragmento serve só para a cobertura, mas o
      // navegador também o grava no canvas, e a página branca vaza por ele: cada
      // cacho ganhava um contorno branco. Cor substitui; o alfa do canvas fica 1.
      Object.assign(m, {
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor, blendDst: THREE.ZeroFactor,
        blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      });
    }
    return m;
  };

  // ---- céu ----
  const ceu = new THREE.Mesh(
    new THREE.SphereGeometry(50, 24, 12),
    material({ vertexShader: VERT_CEU, fragmentShader: FRAG_CEU, uniforms: { ...comuns }, side: THREE.BackSide, depthWrite: false }),
  );
  // Por último entre os opacos (depois do chão): o vertex shader já o põe no fundo, então
  // ele só pinta o que sobrou (~3% da tela no túnel), e não a tela inteira por baixo de tudo.
  ceu.renderOrder = 3;
  ceu.frustumCulled = false;
  grupo.add(ceu);

  // ---- chão ----
  const geoChao = new THREE.PlaneGeometry(96, 120, 1, 1);
  geoChao.rotateX(-Math.PI / 2);
  geoChao.translate(0, 0, -42);
  const chao = new THREE.Mesh(geoChao, material({
    vertexShader: VERT_CHAO,
    fragmentShader: FRAG_CHAO,
    uniforms: { ...comuns, uRuido: { value: ruido }, uArvores: { value: arvoresU }, uDetalhe },
  }));
  chao.frustumCulled = false;
  chao.renderOrder = 2;                      // depois das copas e troncos: a parte coberta não paga o shader
  grupo.add(chao);

  // ---- materiais instanciados ----
  const matTronco = material({
    vertexShader: VERT_TRONCO,
    fragmentShader: FRAG_TRONCO,
    uniforms: { ...comuns, uRuido: { value: ruido }, uVento, uCasca: { value: new THREE.Vector3(0.15, 0.12, 0.112) }, uDetalhe },
    alphaToCoverage: cobertura,
    defines: cobertura ? {} : { SEM_COBERTURA: '' },
  });
  const matCartao = material({
    vertexShader: VERT_CARTAO,
    fragmentShader: FRAG_CARTAO,
    uniforms: { ...comuns, uFlor: { value: flor }, uVento, uEscala, uPerto },
    side: THREE.DoubleSide,
    alphaToCoverage: cobertura,
    defines: cobertura ? {} : { SEM_COBERTURA: '' },
  });
  const matPoste = material({ vertexShader: VERT_SIMPLES, fragmentShader: FRAG_FERRO, uniforms: { ...comuns } });
  const matElo = material({
    vertexShader: VERT_SIMPLES,
    fragmentShader: FRAG_FERRO,
    uniforms: { ...comuns },
    side: THREE.DoubleSide,
    defines: { ELO: '', COM_UV: '' },
  });
  const matArbusto = material({
    vertexShader: VERT_SIMPLES,
    fragmentShader: FRAG_ARBUSTO,
    uniforms: { ...comuns, uRuido: { value: ruido } },
    alphaToCoverage: cobertura,
    defines: cobertura ? {} : { SEM_COBERTURA: '' },
  });

  // ---- as árvores: algumas variantes, reaproveitadas por instância ----
  const MAX_ARVORES = 2 * Math.ceil((ATRAS + ALCANCE.alto) / ESP_ARVORE + 2);
  const variantes = [];
  for (let v = 0; v < VARIANTES; v++) {
    const geo = gerarCerejeira(THREE, 101 + v * 37, CARTOES.alto);
    const tronco = new THREE.InstancedMesh(geo.tronco, matTronco, MAX_ARVORES);
    const copa = new THREE.InstancedMesh(geo.copa, matCartao, MAX_ARVORES);
    for (const m of [tronco, copa]) { m.frustumCulled = false; m.count = 0; grupo.add(m); }
    copa.renderOrder = 1;
    variantes.push({ tronco, copa, indices: geo.copa.index.count });
  }
  const sal = gerarSalgueiro(THREE, 7);
  const salTronco = new THREE.InstancedMesh(sal.tronco, matTronco, 3);
  const salCopa = new THREE.InstancedMesh(sal.copa, matCartao, 3);
  const capim = new THREE.InstancedMesh(gerarCapim(THREE, 5), matCartao, 40);
  const MAX_POSTES = 2 * Math.ceil((ATRAS + ALCANCE.alto) / ESP_POSTE + 2);
  const postes = new THREE.InstancedMesh(gerarPoste(THREE), matPoste, MAX_POSTES);
  const correntes = new THREE.InstancedMesh(gerarCorrente(THREE), matElo, MAX_POSTES);
  const arbustos = new THREE.InstancedMesh(gerarArbusto(THREE), matArbusto, 48);
  for (const m of [salTronco, salCopa, capim, postes, correntes, arbustos]) { m.frustumCulled = false; m.count = 0; grupo.add(m); }
  salCopa.renderOrder = 1;
  capim.renderOrder = 1;

  // ---- pétalas de cerejeira no ar ----
  const N_PET = amb.reduzido ? 60 : { alto: 220, medio: 160, baixo: 80 }[nivelAtual] || 160;
  const sem = new Float32Array(N_PET * 4);
  const rp = semente(77);
  for (let i = 0; i < sem.length; i++) sem[i] = rp();
  const geoPet = new THREE.BufferGeometry();
  geoPet.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_PET * 3), 3));
  geoPet.setAttribute('aSemente', new THREE.BufferAttribute(sem, 4));
  const uPx = { value: 60 };
  const petalasAr = new THREE.Points(geoPet, material({
    vertexShader: VERT_PETALAS,
    fragmentShader: FRAG_PETALAS,
    uniforms: { ...comuns, uCaixa: { value: new THREE.Vector3(9, 6, 18) }, uQueda: { value: amb.reduzido ? 0.35 : 1 }, uPx },
    transparent: true,
    depthWrite: false,
  }));
  petalasAr.frustumCulled = false;
  petalasAr.renderOrder = 4;
  grupo.add(petalasAr);

  // ---- o cometa (noite) ----
  // Um plano só, com a textura pintada uma vez (js/mundo/hora.js), somando luz.
  // As copas fecham o túnel quase inteiro: um cometa lá no céu de verdade ficaria
  // escondido. Então a luz dele fica a 3,2 m, no alto, somada por cima das flores
  // (lê como o clarão do cometa atravessando as copas); a carta e a folha, que
  // ficam mais perto, passam na frente. Só existe (e só é desenhado) à noite.
  const COMETA_Z = 3.2;
  let cometa = null;
  let cometaDesde = 0;
  function criarCometa() {
    const tex = new THREE.CanvasTexture(pintarCometa(512, 512));
    tex.colorSpace = THREE.SRGBColorSpace;
    cometa = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }),
    );
    cometa.frustumCulled = false;
    cometa.renderOrder = -5;                   // logo depois do céu: tudo o que é transparente e está mais perto (a carta se desfazendo, ele, as pétalas) é desenhado por cima
    cometa.visible = false;
    grupo.add(cometa);
  }

  cena.add(grupo);

  // ---- colocar as vagas perto da câmera -----------------------------------------------

  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eixoY = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const esc = new THREE.Vector3();
  let ultimaVaga = null;
  const proximas = [];

  function por(m, i, x, y, z, giro, s, sy = s) {
    pos.set(x, y, z);
    q.setFromAxisAngle(eixoY, giro);
    esc.set(s, sy, s);
    mat.compose(pos, q, esc);
    m.setMatrixAt(i, mat);
  }

  function colocar(zc) {
    const longe = ALCANCE[nivelAtual] || ALCANCE.alto;
    const zPerto = zc + ATRAS;
    const zLonge = zc - longe;
    // árvores
    for (const v of variantes) v.n = 0;
    proximas.length = 0;
    const k0 = Math.floor(-zPerto / ESP_ARVORE) - 1;
    const k1 = Math.ceil(-zLonge / ESP_ARVORE) + 1;
    for (let k = k0; k <= k1; k++) {
      for (const lado of [-1, 1]) {
        const z = -(k * ESP_ARVORE + (lado > 0 ? ESP_ARVORE * 0.5 : 0)) + (h(k, lado, 1) - 0.5) * 1.4;
        if (z > zPerto || z < zLonge) continue;
        const x = centroCaminho(z) + lado * (MEIA_PISTA + 1.0 + h(k, lado, 2) * 0.75);
        const v = variantes[Math.floor(h(k, lado, 3) * VARIANTES) % VARIANTES];
        const giro = (lado > 0 ? Math.PI : 0) + (h(k, lado, 4) - 0.5) * 0.6;
        const s = 0.86 + h(k, lado, 5) * 0.3;
        por(v.tronco, v.n, x, 0, z, giro, s);
        por(v.copa, v.n, x, 0, z, giro, s);
        v.n++;
        if (z < zc + 5 && z > zc - 28) proximas.push({ x, z, s, d: Math.abs(z - (zc - 8)) });
      }
    }
    for (const v of variantes) {
      v.tronco.count = v.n; v.copa.count = v.n;
      v.tronco.instanceMatrix.needsUpdate = true; v.copa.instanceMatrix.needsUpdate = true;
    }
    proximas.sort((a, b) => a.d - b.d);
    for (let i = 0; i < arvoresU.length; i++) {
      const a = proximas[i];
      if (a) arvoresU[i].set(a.x, a.z, a.s * a.s, 0);
      else arvoresU[i].set(1e4, 1e4, 1, 0);
    }

    // salgueiros (à esquerda, longe da pista)
    let n = 0;
    const s0 = Math.floor(-zPerto / SALGUEIRO_A_CADA) - 1;
    for (let k = s0; k <= s0 + 3; k++) {
      const z = -(k * SALGUEIRO_A_CADA + 14) + (h(k, 9, 1) - 0.5) * 8;
      if (z > zPerto || z < zLonge || n >= 3) continue;
      const x = centroCaminho(z) - (9 + h(k, 9, 2) * 3);
      por(salTronco, n, x, 0, z, h(k, 9, 3) * 6.28, 0.9 + h(k, 9, 4) * 0.3);
      por(salCopa, n, x, 0, z, h(k, 9, 3) * 6.28, 0.9 + h(k, 9, 4) * 0.3);
      n++;
    }
    salTronco.count = salCopa.count = n;
    salTronco.instanceMatrix.needsUpdate = salCopa.instanceMatrix.needsUpdate = true;

    // postes e correntes
    n = 0;
    const j0 = Math.floor(-zPerto / ESP_POSTE);
    const j1 = Math.ceil(-zLonge / ESP_POSTE);
    for (let j = j0; j <= j1 && n < MAX_POSTES - 1; j++) {
      for (const lado of [-1, 1]) {
        const z = -j * ESP_POSTE;
        const z2 = z - ESP_POSTE;
        const afast = MEIA_PISTA + 0.24;
        const x = centroCaminho(z) + lado * afast;
        const x2 = centroCaminho(z2) + lado * afast;
        por(postes, n, x, 0, z, h(j, lado, 6) * 6.28, 1);
        const giro = Math.atan2(-(x2 - x), -(z2 - z)) + Math.PI;
        pos.set(x, 0, z);
        q.setFromAxisAngle(eixoY, giro);
        esc.set(1, 1, Math.hypot(x2 - x, z2 - z) / ESP_POSTE);
        mat.compose(pos, q, esc);
        correntes.setMatrixAt(n, mat);
        n++;
      }
    }
    postes.count = correntes.count = n;
    postes.instanceMatrix.needsUpdate = correntes.instanceMatrix.needsUpdate = true;

    // arbustos (sebe à esquerda; à direita, poucos e baixos: entre os troncos aparece o lago)
    n = 0;
    const b0 = Math.floor(-zPerto / 2.6);
    for (let k = b0; k <= b0 + Math.ceil((zPerto - zLonge) / 2.6) && n < 48; k++) {
      const z = -k * 2.6 + (h(k, 3, 1) - 0.5) * 1.2;
      const esq = h(k, 3, 2) < 0.78;
      if (!esq && h(k, 3, 7) < 0.75) continue;
      const x = centroCaminho(z) + (esq ? -(4.3 + h(k, 3, 3) * 2.2) : 3.9 + h(k, 3, 3) * 0.4);
      const s = esq ? 0.45 + h(k, 3, 4) * 0.4 : 0.3 + h(k, 3, 4) * 0.2;
      pos.set(x, 0.1, z);
      // à esquerda, sebes podadas compridas ao longo do caminho; à direita, touceiras
      q.setFromAxisAngle(eixoY, esq ? (h(k, 3, 5) - 0.5) * 0.5 : h(k, 3, 5) * 6.28);
      esc.set(s * (1.0 + h(k, 3, 6) * 0.5), s * (0.68 + h(k, 3, 9) * 0.2), s * (esq ? 1.3 + h(k, 3, 8) * 0.9 : 1.1 + h(k, 3, 8) * 0.5));
      mat.compose(pos, q, esc);
      arbustos.setMatrixAt(n++, mat);
    }
    arbustos.count = n;
    arbustos.instanceMatrix.needsUpdate = true;

    // capim na margem do lago
    n = 0;
    const c0 = Math.floor(-zPerto / 2.3);
    for (let k = c0; k <= c0 + Math.ceil((zPerto - zLonge) / 2.3) && n < 40; k++) {
      if (h(k, 4, 1) < 0.25) continue;
      const z = -k * 2.3 + (h(k, 4, 2) - 0.5) * 1.5;
      const x = centroCaminho(z) + LAGO - 0.3 + h(k, 4, 3) * 1.1;
      por(capim, n++, x, 0, z, h(k, 4, 4) * 6.28, 0.8 + h(k, 4, 5) * 0.5);
    }
    capim.count = n;
    capim.instanceMatrix.needsUpdate = true;
  }

  // ---- nível de qualidade --------------------------------------------------------------

  let densHora = 1;                          // a hora do dia adensa ou afina a névoa (aplicarHora)
  function aplicarNivel(nivel) {
    nivelAtual = nivel;
    const parte = (CARTOES[nivel] || CARTOES.alto) / CARTOES.alto;
    for (const v of variantes) v.copa.geometry.setDrawRange(0, Math.floor((v.indices * parte) / 6) * 6);
    uEscala.value = 1 / Math.sqrt(Math.max(0.4, parte)) * (parte < 1 ? 0.92 : 1);   // menos cartões, um pouco maiores
    uDetalhe.value = nivel === 'baixo' ? 0 : 1;
    comuns.uDens.value = (nivel === 'baixo' ? 0.05 : 0.043) * densHora;
    ultimaVaga = null;
  }
  aplicarNivel(nivelAtual);

  // ---- o quadro ------------------------------------------------------------------------

  const camPos = new THREE.Vector3();
  let vaoIniciado = false;
  let derivaAtual = 0;
  function atualizar(dt, t, deriva = 0) {
    comuns.uTempo.value = t;
    derivaAtual = deriva;
    comuns.uDeriva.value = deriva;
    camera.getWorldPosition(camPos);
    camPos.z -= deriva;                    // daqui em diante, a câmera nas coordenadas da alameda
    // o vão acompanha o x da câmera devagar (o balanço do passo não mexe nos galhos)
    const vao = comuns.uVao.value;
    vao.x = vaoIniciado ? lerp(vao.x, camPos.x, 1 - Math.exp(-Math.min(dt, 0.1) * 0.8)) : camPos.x;
    vaoIniciado = true;
    comuns.uVaoZ.value = camPos.z;
    ceu.position.copy(camPos);
    chao.position.set(Math.round(camPos.x), 0, Math.round(camPos.z));
    const vaga = Math.floor(camPos.z / 2);
    if (vaga !== ultimaVaga) { ultimaVaga = vaga; colocar(camPos.z); }
    uPx.value = 0.055 * mundo.tamanho.altura * mundo.tamanho.dpr;
    // o cometa: no alto do fim do túnel, do tamanho que a tela pede, descendo muito devagar
    const noite = comuns.uNoite.value;
    if (noite > 0.2 && !cometa) { criarCometa(); cometaDesde = t; }
    if (cometa) {
      cometa.visible = noite > 0.2;
      if (cometa.visible) {
        const meiaA = Math.tan((camera.fov * Math.PI) / 360) * COMETA_Z;
        const meiaL = meiaA * camera.aspect;
        const lado = Math.min(meiaA * 1.12, meiaL * 2.05);
        const anda = amb.reduzido ? 0 : 1 - Math.exp(-(t - cometaDesde) / 70);     // 0..1 em alguns minutos
        cometa.scale.set(lado, lado, 1);
        cometa.position.set(
          camPos.x + meiaL * 0.06 + lado * 0.07 * anda,
          camera.position.y + meiaA * 0.55 - lado * 0.06 * anda,
          camPos.z + deriva - COMETA_Z,          // (material comum: coordenadas do mundo, não as da alameda)
        );
        const k = clamp((noite - 0.2) / 0.8);
        cometa.material.opacity = k * k * (amb.reduzido ? 0.9 : 0.9 + 0.06 * Math.sin(t * 0.9));
      }
    }
  }

  // ---- entardecer -----------------------------------------------------------------------

  const aux = new THREE.Color();
  const densBase = () => (nivelAtual === 'baixo' ? 0.05 : 0.043);
  /** A hora do dia: recebe o estado de js/mundo/hora.js (estadoDaHora). */
  function aplicarHora(e) {
    comuns.uTarde.value = e.tarde;
    comuns.uNoite.value = e.noite;
    comuns.uLuz.value.set(e.luz[0], e.luz[1], e.luz[2]);
    comuns.uNevoa.value.set(e.nevoa[0], e.nevoa[1], e.nevoa[2]);
    comuns.uCeu.value.set(e.ceu[0], e.ceu[1], e.ceu[2]);
    densHora = e.dens;
    comuns.uDens.value = densBase() * densHora;
    aux.setRGB(e.nevoa[0], e.nevoa[1], e.nevoa[2], THREE.SRGBColorSpace);
    corNevoa.copy(aux);
    if (cena.fog && surgido) cena.fog.color.copy(aux);
  }

  // ---- entrada: compilar antes de aparecer, e nascer do branco ---------------------------

  let surgido = false;
  colocar(0);
  const pronta = (async () => {
    try {                               // (compile percorre também o que está invisível)
      if (renderer.compileAsync) {
        await Promise.race([renderer.compileAsync(grupo, camera, cena), new Promise((ok) => setTimeout(ok, 2500))]);
      } else renderer.compile(grupo, camera, cena);
    } catch { /* compila no primeiro desenho */ }
  })();

  function surgir(duracao = 1.8) {
    const gsap = window.gsap;
    const branco = new THREE.Color(0xffffff);
    const k = { v: 0 };
    surgido = true;
    grupo.visible = true;
    const pintar = () => {
      comuns.uSurgir.value = k.v;
      if (cena.fog) cena.fog.color.copy(branco).lerp(corNevoa, k.v);
    };
    if (gsap && duracao > 0) gsap.to(k, { v: 1, duration: duracao, ease: 'none', onUpdate: pintar });
    else { k.v = 1; pintar(); }
  }

  return {
    grupo,
    pronta,
    surgir,
    atualizar,
    aplicarHora,
    nivel: aplicarNivel,
    /** Nenhum cacho mais perto da câmera que `metros` (a folha final); devagar. 0 volta ao padrão. */
    afastar(metros = 0, duracao = 1.2) {
      const alvo = metros > 0 ? [metros, metros + 0.45] : [0.55, 1.25];
      const v = uPerto.value;
      if (window.gsap && duracao > 0) window.gsap.to(v, { x: alvo[0], y: alvo[1], duration: duracao, ease: 'power2.out', overwrite: true });
      else v.set(alvo[0], alvo[1]);
    },
    /** Os uniformes da névoa e da hora (uNevoa, uCeu, uDens, uTarde, e também uLuz e uNoite): quem entra na alameda usa os mesmos (js/mundo/ele.js). */
    uniformes: comuns,
    /** x do meio do caminho na profundidade z DO MUNDO (a deriva do passo de base já descontada). */
    centro: (z) => centroCaminho(z - derivaAtual),
  };
}
