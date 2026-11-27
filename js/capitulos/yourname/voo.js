/* ============================================================================
   O voo (capítulo 2): a cena 3D que a rolagem atravessa.
   ============================================================================
   criarVoo(T, opções) monta, num canvas próprio dentro do fundo do pergaminho,
   o céu (do dia à noite), o mar de nuvens e os tufos, o lago, os montes, a
   cidadezinha, as estrelas, o cometa que se divide e o cordão trançado que vai
   na frente até o botão de guardar. A posição no voo é `s`, em paradas: cada
   bloco do capítulo ocupa um trecho [a, b] e a câmera anda D unidades por
   parada.

   Uma âncora é um ponto do espaço para um texto ou um quadro: fica parada no
   mundo até a câmera chegar à distância de leitura (sh), segue com ela até so
   e então sobe e some. O HTML é posto na tela por projetar().

   Nada daqui sobrevive ao capítulo: destruir() libera geometrias, materiais,
   texturas e o contexto.
   ========================================================================== */

import { clamp, suave, lerp, semente } from '../../nucleo/util.js';
import * as G from './glsl.js';

export const D = 26; // unidades de mundo por parada
const FOV = 52;
const DV = 7; // distância de leitura
const MAR_A = -6;
const MAR_B = -9.5;
const BAIXO = -22; // a altura do voo depois das nuvens
const LAGO = -34;
const TAN = Math.tan((FOV * Math.PI) / 360);

// A hora do céu: 0 dia, 0,42 tarde dourada, 0,6 kataware-doki, 0,85 noite, 1 noite funda.
const HORAS = [0, 0.42, 0.6, 0.85, 1];
const CORES = {
  zen: ['#2f7fd6', '#3d63b6', '#2a2a7a', '#070b22', '#050818'],
  meio: ['#74b6ee', '#e9a38c', '#b95a9e', '#161b4c', '#0d1233'],
  hor: ['#cfe6f8', '#ffd29a', '#ff9468', '#40307a', '#2c2460'],
  luz: ['#ffffff', '#ffe6c8', '#ffb3a6', '#4c5590', '#363e72'],
  sombra: ['#9fbfe6', '#b98aa6', '#5d4a96', '#171c40', '#10142f'],
  agua: ['#2a5a8c', '#4c4276', '#30245c', '#0a0f2a', '#070b20'],
  solCor: ['#fff6dc', '#ffd9a0', '#ff9e6e', '#ff8a70', '#ff8a70'],
  tinta: ['#ffffff', '#ffe9d4', '#ffc9c0', '#aab0de', '#9aa2d6'],
};
const NUMEROS = {
  solF: [1, 1.15, 1, 0.12, 0],
  solY: [0.5, 0.17, 0.03, -0.1, -0.3],
  tufos: [0.97, 0.94, 0.85, 0.5, 0.36],
  teto: [0.44, 0.47, 0.5, 0.6, 0.66],
};
// Fração do voo → hora.
const TEMPO = [[0, 0], [0.3, 0], [0.47, 0.42], [0.63, 0.6], [0.8, 0.85], [1, 1]];

const saida = (t) => 1 - (1 - clamp(t)) ** 3;

function horaDe(f) {
  for (let i = 1; i < TEMPO.length; i++) {
    if (f <= TEMPO[i][0]) {
      const [f0, h0] = TEMPO[i - 1];
      const [f1, h1] = TEMPO[i];
      return lerp(h0, h1, suave((f - f0) / (f1 - f0)));
    }
  }
  return 1;
}

function trecho(h) {
  let i = 0;
  while (i < HORAS.length - 2 && h > HORAS[i + 1]) i++;
  return [i, clamp((h - HORAS[i]) / (HORAS[i + 1] - HORAS[i]))];
}

/* ---- texturas procedurais ---------------------------------------------------- */

// Ruído de valor em oitavas, que emenda nas bordas: R e G são dois sorteios.
function texturaRuido(T, rnd) {
  const N = 256;
  const dados = new Uint8Array(N * N * 4);
  const periodos = [4, 8, 16, 32, 64];
  const pesos = [0.5, 0.26, 0.13, 0.07, 0.04];
  for (let canal = 0; canal < 2; canal++) {
    const grades = periodos.map((p) => Float32Array.from({ length: p * p }, () => rnd()));
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let v = 0;
        for (let o = 0; o < periodos.length; o++) {
          const p = periodos[o];
          const g = grades[o];
          const fx = (x / N) * p;
          const fy = (y / N) * p;
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const tx = fx - x0;
          const ty = fy - y0;
          const sx = tx * tx * (3 - 2 * tx);
          const sy = ty * ty * (3 - 2 * ty);
          const x1 = (x0 + 1) % p;
          const y1 = (y0 + 1) % p;
          const a = g[y0 * p + x0];
          const b = g[y0 * p + x1];
          const c = g[y1 * p + x0];
          const d = g[y1 * p + x1];
          v += pesos[o] * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
        }
        dados[(y * N + x) * 4 + canal] = Math.round(clamp(v) * 255);
      }
    }
  }
  const t = new T.DataTexture(dados, N, N, T.RGBAFormat);
  t.wrapS = T.RepeatWrapping;
  t.wrapT = T.RepeatWrapping;
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// Dois cúmulos lado a lado: o alfa é a forma, o vermelho é a luz (clara em cima).
function texturaTufos(T, rnd) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  for (let v = 0; v < 2; v++) {
    const ox = v * 256;
    g.save();
    g.beginPath();
    g.rect(ox, 0, 256, 256);
    g.clip();
    const bolas = [];
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const x = 50 + t * 156 + (rnd() - 0.5) * 20;
      const arco = Math.sin(t * Math.PI);
      const r = 24 + arco * 30 + rnd() * 12;
      const y = 170 - arco * (40 + rnd() * 40) * (0.5 + rnd() * 0.5);
      bolas.push([x, y, r]);
    }
    for (let i = 0; i < 7; i++) bolas.push([74 + rnd() * 108, 174 + rnd() * 8, 28 + rnd() * 12]);
    // A sombra primeiro (vermelho baixo), depois a luz por cima, deslocada para o alto.
    for (const [x, y, r] of bolas) {
      const s = g.createRadialGradient(ox + x, y, r * 0.15, ox + x, y, r);
      s.addColorStop(0, 'rgba(70, 70, 70, 0.95)');
      s.addColorStop(0.6, 'rgba(70, 70, 70, 0.6)');
      s.addColorStop(1, 'rgba(70, 70, 70, 0)');
      g.fillStyle = s;
      g.fillRect(ox + x - r, y - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-atop';
    for (const [x, y, r] of bolas) {
      const cx = ox + x - r * 0.12;
      const cy = y - r * 0.34;
      const l = g.createRadialGradient(cx, cy, 0, cx, cy, r * 0.95);
      l.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
      l.addColorStop(0.55, 'rgba(255, 255, 255, 0.35)');
      l.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = l;
      g.fillRect(ox + x - r, y - r * 1.4, r * 2, r * 2.4);
    }
    g.restore();
    g.globalCompositeOperation = 'source-over';
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.NoColorSpace;
  return t;
}

// A trança: espinha de peixe em três vermelhos, que emenda ao longo do cordão.
function texturaTranca(T) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#8c0c1e';
  g.fillRect(0, 0, 64, 64);
  const faixa = (tom, largura, desloc) => {
    g.strokeStyle = tom;
    g.lineWidth = largura;
    for (let k = -2; k <= 3; k++) {
      const x = k * 32 + desloc;
      g.beginPath();
      g.moveTo(x - 32, 0);
      g.lineTo(x, 32);
      g.lineTo(x - 32, 64);
      g.stroke();
    }
  };
  faixa('#e3283c', 11, 8);
  faixa('#ff6a72', 2.5, 5);
  faixa('#c2162c', 9, 24);
  faixa('#6d0a18', 2, 16.5);
  faixa('#6d0a18', 2, 32.5);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = T.RepeatWrapping;
  t.wrapT = T.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function texturaBrilho(T) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255, 255, 255, 1)');
  r.addColorStop(0.18, 'rgba(255, 255, 255, 0.7)');
  r.addColorStop(0.45, 'rgba(255, 255, 255, 0.18)');
  r.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

/* ---- o voo ------------------------------------------------------------------- */

export function criarVoo(T, { fundo, amb = {}, S, sFim, sDiv, sNo = null }) {
  const rnd = semente(2312);
  const tela = document.createElement('canvas');
  tela.className = 'yn-tela';
  tela.setAttribute('aria-hidden', 'true');
  const renderer = new T.WebGLRenderer({
    canvas: tela, antialias: amb.nivel !== 'baixo', alpha: false, stencil: false, powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x0b1026, 1);
  let dpr = Math.min(window.devicePixelRatio || 1, amb.toque ? 1.5 : 2, amb.dprMax || 2);
  renderer.setPixelRatio(dpr);
  fundo.append(tela);

  let morto = false;
  let W = 1;
  let H = 1;
  let aspecto = 1;
  const lixo = [];
  const guardar = (x) => {
    lixo.push(x);
    return x;
  };

  const cena = new T.Scene();
  const cam = new T.PerspectiveCamera(FOV, 1, 0.3, 2600);
  const base = new T.PerspectiveCamera(FOV, 1, 0.3, 2600); // a câmera sem a deriva: é a que o HTML lê
  const visH = (d) => 2 * d * TAN;
  const visW = (d) => visH(d) * aspecto;

  /* ---- a trilha da câmera -------------------------------------------------- */

  const alt = (s) => BAIXO * suave((s / S - 0.35) / 0.13);
  const xCam = (s) => 0.6 * Math.sin(s * 0.8);
  const m4 = new T.Matrix4();
  const alvo = new T.Vector3();
  const CIMA = new T.Vector3(0, 1, 0);
  const X = new T.Vector3(1, 0, 0);
  const Z = new T.Vector3(0, 0, 1);
  const p0 = new T.Vector3();
  const v0 = new T.Vector3();
  const v1 = new T.Vector3();
  const v2 = new T.Vector3();
  const qz = new T.Quaternion();

  function pose(s, pos, quat) {
    const y = alt(s);
    const dy = (alt(s + 0.05) - alt(s - 0.05)) / (0.1 * D);
    pos.set(xCam(s), y, -s * D);
    alvo.set(xCam(s + 0.35), y + (dy * 0.55 - 0.05) * 10, pos.z - 10);
    m4.lookAt(pos, alvo, CIMA);
    quat.setFromRotationMatrix(m4);
  }

  /* ---- âncoras --------------------------------------------------------------- */

  const ancoras = [];
  function ancorar({ a, b, fx = 0, fy = 0, d = DV, sh, so }) {
    const anc = {
      a, b, d, fx, fy,
      sh: sh ?? a + 0.3 * (b - a),
      so: so ?? b - 0.12,
      x: 0, y: 0, alfa: 0, e: 0,
      mundo: new T.Vector3(), quat: new T.Quaternion(),
      casa: new T.Vector3(), quatCasa: new T.Quaternion(),
    };
    anc.refazer = () => {
      anc.x = fx * visW(d);
      anc.y = fy * visH(d);
      pose(anc.sh, p0, anc.quatCasa);
      anc.casa.set(anc.x, anc.y, -d).applyQuaternion(anc.quatCasa).add(p0);
    };
    anc.atualizar = (s) => {
      if (s <= anc.sh) {
        anc.mundo.copy(anc.casa);
        anc.quat.copy(anc.quatCasa);
        anc.e = 0;
      } else {
        const e = suave((s - anc.so) / 0.3);
        anc.e = e;
        pose(s, p0, anc.quat);
        anc.mundo.set(anc.x, anc.y + 2.4 * e * e, -d - 1.5 * e).applyQuaternion(anc.quat).add(p0);
      }
      anc.alfa = suave((s - (anc.sh - 0.5)) / 0.38) * (1 - suave((s - anc.so) / 0.22));
    };
    ancoras.push(anc);
    return anc;
  }

  const ndc = new T.Vector3();
  /** Ponto do mundo → pixels do palco e distância até a câmera. */
  function projetar(v, out) {
    out.dist = v.distanceTo(base.position);
    ndc.copy(v).project(base);
    out.x = (ndc.x + 1) * 0.5 * W;
    out.y = (1 - ndc.y) * 0.5 * H;
    return out;
  }

  /* ---- uniformes da hora, partilhados ----------------------------------------- */

  const cor = {};
  for (const [nome, lista] of Object.entries(CORES)) cor[nome] = lista.map((h) => new T.Color(h));
  const U = {
    uZen: { value: new T.Color() }, uMeio: { value: new T.Color() }, uHor: { value: new T.Color() },
    uBaixo: { value: new T.Color() }, uSolCor: { value: new T.Color() }, uSol: { value: new T.Vector3(0.3, 0.5, -0.8) },
    uSolF: { value: 1 }, uLuz: { value: new T.Color() }, uSombra: { value: new T.Color() },
    uAgua: { value: new T.Color() }, uTinta: { value: new T.Color() }, uTempo: { value: 0 },
    uEstrelas: { value: 0 }, uDpr: { value: dpr }, uEsc: { value: 1000 },
  };
  const estado = { hora: 0, nevoa: 0, corNevoa: '#ffffff', k: 0, s: 0 };
  const corMonte = new T.Color();
  const NOITE = new T.Color('#070a1c');

  function acertarHora(h) {
    const [i, t] = trecho(h);
    const mistura = (nome, destino) => destino.copy(cor[nome][i]).lerp(cor[nome][i + 1], t);
    const numero = (nome) => lerp(NUMEROS[nome][i], NUMEROS[nome][i + 1], t);
    mistura('zen', U.uZen.value);
    mistura('meio', U.uMeio.value);
    mistura('hor', U.uHor.value);
    mistura('luz', U.uLuz.value);
    mistura('sombra', U.uSombra.value);
    mistura('agua', U.uAgua.value);
    mistura('solCor', U.uSolCor.value);
    mistura('tinta', U.uTinta.value);
    U.uBaixo.value.copy(U.uHor.value).lerp(U.uSombra.value, 0.55);
    U.uSolF.value = numero('solF');
    U.uSol.value.set(0.34 - 0.2 * h, numero('solY'), -0.9).normalize();
    U.uEstrelas.value = suave((h - 0.58) / 0.26);
    corMonte.copy(NOITE).lerp(U.uSombra.value, 0.45);
    return { tufos: numero('tufos'), teto: numero('teto') };
  }

  /* ---- céu, mar de nuvens, lago, montes ---------------------------------------- */

  const ruido = guardar(texturaRuido(T, rnd));

  const ceu = new T.Mesh(
    guardar(new T.SphereGeometry(1500, 24, 16)),
    guardar(new T.ShaderMaterial({
      uniforms: U, vertexShader: G.CEU_V, fragmentShader: G.CEU_F, side: T.BackSide, depthTest: false, depthWrite: false,
    })),
  );
  ceu.renderOrder = -10;
  ceu.frustumCulled = false;
  cena.add(ceu);

  const geoChao = guardar(new T.PlaneGeometry(1300, 1300).rotateX(-Math.PI / 2));
  const mar = [MAR_A, MAR_B].map((y, i) => {
    const mat = guardar(new T.ShaderMaterial({
      uniforms: {
        uRuido: { value: ruido }, uLuz: U.uLuz, uSombra: U.uSombra, uHor: U.uHor, uTempo: U.uTempo,
        uCob: { value: 0.4 }, uSolido: { value: 1 }, uTom: { value: 1 }, uOpac: { value: 1 },
        uDesvio: { value: new T.Vector2(i * 0.37, i * 0.21) },
      },
      vertexShader: G.MAR_V, fragmentShader: G.MAR_F, transparent: true, depthWrite: false, side: T.DoubleSide,
    }));
    const m = new T.Mesh(geoChao, mat);
    m.position.y = y;
    m.frustumCulled = false;
    cena.add(m);
    return m;
  });

  const lago = new T.Mesh(geoChao, guardar(new T.ShaderMaterial({
    uniforms: { ...U, uRuido: { value: ruido } }, vertexShader: G.LAGO_V, fragmentShader: G.LAGO_F,
  })));
  lago.position.y = LAGO;
  lago.frustumCulled = false;
  cena.add(lago);

  // Os montes: uma fita em volta do lago, mais baixa à frente (onde fica a cidade).
  const montes = (() => {
    const N = 180;
    const pos = new Float32Array((N + 1) * 6);
    const fases = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6];
    for (let i = 0; i <= N; i++) {
      const ang = (i / N) * Math.PI * 2;
      const perfil = 0.5 + 0.28 * Math.sin(ang * 3 + fases[0]) + 0.16 * Math.sin(ang * 7 + fases[1])
        + 0.09 * Math.sin(ang * 13 + fases[2]) + 0.05 * Math.sin(ang * 29 + fases[3]);
      // ang = π/2 é a frente (−z).
      const lados = Math.abs(Math.cos(ang));
      const h = 3 + Math.max(0, perfil) * (16 + 32 * lados);
      const x = Math.cos(ang) * 340;
      const z = -Math.sin(ang) * 340;
      pos.set([x, LAGO - 3, z, x, LAGO + h, z], i * 6);
    }
    const idx = [];
    for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    const geo = guardar(new T.BufferGeometry());
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const m = new T.Mesh(geo, guardar(new T.MeshBasicMaterial({ color: 0x0a0d24, side: T.DoubleSide })));
    m.frustumCulled = false;
    cena.add(m);
    return m;
  })();

  /* ---- pontos: estrelas longe, estrelas perto, cidade --------------------------- */

  function pontos(lista, { aten, ordem, profundidade = true }) {
    const n = lista.length;
    const pos = new Float32Array(n * 3);
    const tam = new Float32Array(n);
    const sem = new Float32Array(n);
    const cores = new Float32Array(n * 3);
    const c = new T.Color();
    lista.forEach((p, i) => {
      pos.set([p.x, p.y, p.z], i * 3);
      tam[i] = p.tam;
      sem[i] = rnd();
      c.set(p.cor);
      cores.set([c.r, c.g, c.b], i * 3);
    });
    const geo = guardar(new T.BufferGeometry());
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('aTam', new T.BufferAttribute(tam, 1));
    geo.setAttribute('aSem', new T.BufferAttribute(sem, 1));
    geo.setAttribute('aCor', new T.BufferAttribute(cores, 3));
    const mat = guardar(new T.ShaderMaterial({
      uniforms: { uTempo: U.uTempo, uDpr: U.uDpr, uEsc: U.uEsc, uOpac: { value: 0 }, uAten: { value: aten ? 1 : 0 } },
      vertexShader: G.PONTO_V, fragmentShader: G.PONTO_F,
      transparent: true, depthWrite: false, depthTest: profundidade, blending: T.AdditiveBlending,
    }));
    const obj = new T.Points(geo, mat);
    obj.frustumCulled = false;
    obj.renderOrder = ordem;
    cena.add(obj);
    return obj;
  }

  const corEstrela = () => {
    const r = rnd();
    return r < 0.62 ? '#eef2ff' : r < 0.82 ? '#bcd0ff' : r < 0.94 ? '#ffe9c4' : '#ffc9d8';
  };
  const longe = pontos(Array.from({ length: 1700 }, () => {
    const ang = rnd() * Math.PI * 2;
    const y = 0.02 + rnd() ** 1.25 * 0.98;
    const r = Math.sqrt(1 - y * y);
    return { x: Math.cos(ang) * r * 1200, y: y * 1200, z: Math.sin(ang) * r * 1200, tam: 1.1 + rnd() ** 3 * 2.4, cor: corEstrela() };
  }), { aten: false, ordem: 1 });

  const zCruza = -0.42 * S * D;
  const zFim = -sFim * D;
  const perto = pontos(Array.from({ length: 900 }, () => {
    let x = (rnd() - 0.5) * 240;
    const y = BAIXO - 7 + rnd() ** 1.4 * 74;
    if (Math.abs(x) < 7 && y < BAIXO + 6) x += x < 0 ? -9 : 9;
    return { x, y, z: lerp(zCruza - 20, zFim - 300, rnd()), tam: 0.07 + rnd() ** 2 * 0.13, cor: corEstrela() };
  }), { aten: true, ordem: 2 });

  // A cidadezinha na margem de lá: luzes quentes, e o seu reflexo espelhado no lago.
  const zCidade = zFim - 205;
  const casas = Array.from({ length: 190 }, () => {
    const gx = (rnd() + rnd() + rnd() - 1.5) * 95;
    const sobe = rnd() ** 2.2;
    const r = rnd();
    return {
      x: 6 + gx, y: LAGO + 0.5 + sobe * 11, z: zCidade - sobe * 30 + (rnd() - 0.5) * 16,
      tam: 0.5 + rnd() * 0.75, cor: r < 0.6 ? '#ffb45e' : r < 0.85 ? '#f6dca6' : r < 0.95 ? '#ff8a3d' : '#ffd0dc',
    };
  });
  const cidade = pontos(casas, { aten: true, ordem: 2 });
  const espelho = pontos(
    casas.map((p) => ({ ...p, y: 2 * LAGO - p.y - 0.4, tam: p.tam * 0.9 })),
    { aten: true, ordem: 2, profundidade: false },
  );

  /* ---- tufos de nuvem ----------------------------------------------------------- */

  const tufos = (() => {
    const lista = [];
    const zMar = -0.4 * S * D;
    // De dia: torres que nascem do mar de nuvens, dos dois lados do caminho.
    for (let i = 0; i < 78; i++) {
      const pertinho = i % 4 === 0;
      const esc = pertinho ? 2.6 + rnd() * 2.4 : 5 + rnd() ** 1.5 * 12;
      const lado = rnd() < 0.5 ? -1 : 1;
      const x = lado * (pertinho ? 3.6 + rnd() * 5 : 9 + rnd() ** 1.3 * 60);
      lista.push({ x, y: MAR_A - 1.2 + esc * 0.36, z: lerp(-6, zMar - 20, rnd()), esc });
    }
    // A travessia: voa-se por dentro delas.
    for (let i = 0; i < 26; i++) {
      lista.push({ x: (rnd() - 0.5) * 30, y: lerp(-2, -15, rnd()), z: lerp(zMar + 26, zMar - 44, rnd()), esc: 6 + rnd() * 7 });
    }
    // Por baixo: nuvens soltas no crepúsculo e na noite.
    for (let i = 0; i < 34; i++) {
      const lado = rnd() < 0.5 ? -1 : 1;
      lista.push({ x: lado * (9 + rnd() * 70), y: lerp(-19, -9, rnd()), z: lerp(zMar - 40, zFim - 150, rnd()), esc: 6 + rnd() * 9 });
    }
    lista.sort((a, b) => a.z - b.z);
    const n = lista.length;
    const aPos = new Float32Array(n * 3);
    const aDados = new Float32Array(n * 3);
    lista.forEach((p, i) => {
      aPos.set([p.x, p.y, p.z], i * 3);
      aDados.set([p.esc, (rnd() < 0.5 ? 1 : 2) * (rnd() < 0.5 ? -1 : 1), rnd() * 6.28], i * 3);
    });
    const plano = new T.PlaneGeometry(1, 1);
    const geo = guardar(new T.InstancedBufferGeometry());
    geo.index = plano.index;
    geo.setAttribute('position', plano.attributes.position);
    geo.setAttribute('uv', plano.attributes.uv);
    geo.setAttribute('aPos', new T.InstancedBufferAttribute(aPos, 3));
    geo.setAttribute('aDados', new T.InstancedBufferAttribute(aDados, 3));
    geo.instanceCount = n;
    const mat = guardar(new T.ShaderMaterial({
      uniforms: {
        uMapa: { value: guardar(texturaTufos(T, rnd)) }, uLuz: U.uLuz, uSombra: U.uSombra, uHor: U.uHor,
        uTempo: U.uTempo, uOpac: { value: 1 },
      },
      vertexShader: G.TUFO_V, fragmentShader: G.TUFO_F, transparent: true, depthWrite: false,
    }));
    const m = new T.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = 5;
    cena.add(m);
    return m;
  })();

  /* ---- o cordão trançado ---------------------------------------------------------- */

  const tranca = guardar(texturaTranca(T));
  const brilho = guardar(texturaBrilho(T));
  // O ponto onde o cordão acaba: é ali que o botão de guardar fica.
  const fimAnc = ancorar({ a: sFim - 0.5, b: sFim + 0.3, fy: -0.17, d: 6.5, sh: sFim, so: sFim + 9 });
  let cordao = null;

  function construirCordao() {
    if (cordao) {
      cordao.tubo.geometry.dispose();
      cordao.halo.geometry.dispose();
      cena.remove(cordao.tubo, cordao.halo);
    }
    const amp = clamp(aspecto * 1.5, 0.75, 2.2);
    const fim = fimAnc.casa;
    const pts = [];
    const zNo = sNo === null ? null : -sNo * D - DV * 0.6;
    const andar = 3.5;
    for (let z = 9; z > fim.z + 0.5; z -= andar) {
      const s = -z / D;
      const x = xCam(s) + amp * (Math.sin(z * 0.052) + 0.36 * Math.sin(z * 0.131 + 1));
      const y = alt(s) - 1.95 + 0.22 * Math.sin(z * 0.083);
      // O nó: uma volta inteira, de frente para quem vem.
      if (zNo !== null && z <= zNo + andar && z > zNo) {
        const r = clamp(amp * 0.7, 0.6, 1.1);
        for (let i = 1; i <= 9; i++) {
          const a = (i / 10) * Math.PI * 2;
          pts.push(new T.Vector3(x + Math.sin(a) * r, y + (1 - Math.cos(a)) * r, z - (i / 10) * andar * 0.8));
        }
        continue;
      }
      const p = new T.Vector3(x, y, z);
      // Os últimos metros se endireitam até o botão.
      const w = suave((fim.z + 16 - z) / 16);
      p.lerp(v0.set(fim.x, fim.y, z), w * w);
      pts.push(p);
    }
    pts.push(fim.clone());
    const curva = new T.CatmullRomCurve3(pts, false, 'centripetal');
    const comp = curva.getLength();
    const mat = cordao?.tubo.material ?? guardar(new T.ShaderMaterial({
      uniforms: {
        uTranca: { value: tranca }, uRep: { value: 1 }, uCorte: { value: 2 }, uPonta: { value: 0 }, uComp: { value: 1 }, uOpac: { value: 1 },
      },
      vertexShader: G.CORDAO_V, fragmentShader: G.CORDAO_F,
    }));
    const matHalo = cordao?.halo.material ?? guardar(new T.ShaderMaterial({
      uniforms: { uPonta: mat.uniforms.uPonta, uComp: mat.uniforms.uComp },
      vertexShader: G.CORDAO_V, fragmentShader: G.HALO_F, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    }));
    mat.uniforms.uRep.value = comp / 0.4;
    mat.uniforms.uComp.value = comp;
    const tubo = new T.Mesh(new T.TubeGeometry(curva, Math.round(comp / 0.4), 0.032, 7, false), mat);
    const halo = new T.Mesh(new T.TubeGeometry(curva, Math.round(comp / 1.2), 0.13, 6, false), matHalo);
    halo.renderOrder = 8;
    tubo.frustumCulled = false;
    halo.frustumCulled = false;
    cena.add(tubo, halo);
    cordao = { tubo, halo, curva, comp, z0: 9, z1: fim.z };
  }

  const ponta = new T.Sprite(guardar(new T.SpriteMaterial({
    map: brilho, color: 0xff5a66, blending: T.AdditiveBlending, depthWrite: false, transparent: true,
  })));
  ponta.scale.setScalar(0.6);
  ponta.renderOrder = 9;
  cena.add(ponta);

  /* ---- os quadros ------------------------------------------------------------------ */

  const geoPlano = guardar(new T.PlaneGeometry(1, 1));
  const figuras = [];
  const pares = [];

  function quadro(img) {
    const mat = guardar(new T.ShaderMaterial({
      uniforms: { uMapa: { value: null }, uOpac: { value: 0 }, uTam: { value: new T.Vector2(1, 1) }, uTinta: U.uTinta },
      vertexShader: G.QUADRO_V, fragmentShader: G.QUADRO_F, transparent: true, depthWrite: false,
    }));
    const mesh = new T.Mesh(geoPlano, mat);
    mesh.renderOrder = 7;
    mesh.visible = false;
    cena.add(mesh);
    const prop = (Number(img.getAttribute('width')) || img.naturalWidth || 16) / (Number(img.getAttribute('height')) || img.naturalHeight || 9);
    const q = { mesh, mat, prop, pronto: false, w: 1, h: 1, fase: rnd() * 6 };
    const tex = guardar(new T.Texture(img));
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    const chegou = () => {
      if (morto || !img.naturalWidth) return;
      tex.needsUpdate = true;
      mat.uniforms.uMapa.value = tex;
      q.pronto = true;
    };
    if (img.complete && img.naturalWidth) (img.decode?.() ?? Promise.resolve()).then(chegou, chegou);
    else img.addEventListener('load', chegou, { once: true });
    q.tamanho = (w) => {
      q.w = w;
      q.h = w / prop;
      mesh.scale.set(q.w, q.h, 1);
      mat.uniforms.uTam.value.set(q.w, q.h);
    };
    q.mostrar = (opac) => {
      const o = q.pronto ? opac : 0;
      mesh.visible = o > 0.003;
      mat.uniforms.uOpac.value = o;
    };
    return q;
  }

  /** Um quadro só, numa âncora. `base` é o ponto logo abaixo dele, para a legenda. */
  function figura(img, anc, { fw = 0.86, fh = 0.5 } = {}) {
    const f = { q: quadro(img), anc, fw, fh, base: new T.Vector3() };
    f.refazer = () => f.q.tamanho(Math.min(fw * visW(anc.d), fh * visH(anc.d) * f.q.prop));
    figuras.push(f);
    return f;
  }

  /** O par: dois quadros que se juntam quando o fio vai de um ao outro. */
  function par(imgA, imgB, anc, fioA, fioB) {
    const mat = guardar(new T.ShaderMaterial({
      uniforms: {
        uTranca: { value: tranca }, uRep: { value: 4 }, uCorte: { value: 0 }, uPonta: { value: 2 }, uComp: { value: 1 }, uOpac: { value: 1 },
      },
      vertexShader: G.CORDAO_V, fragmentShader: G.CORDAO_F, transparent: true, depthWrite: false,
    }));
    const arco = new T.QuadraticBezierCurve3(new T.Vector3(0, 0, 0), new T.Vector3(0.5, -0.2, 0.05), new T.Vector3(1, 0, 0));
    const fio = new T.Mesh(guardar(new T.TubeGeometry(arco, 40, 0.024, 7, false)), mat);
    fio.renderOrder = 8;
    fio.visible = false;
    fio.frustumCulled = false;
    cena.add(fio);
    const p = {
      a: quadro(imgA), b: quadro(imgB), anc, fioA, fioB, fio,
      baseA: new T.Vector3(), baseB: new T.Vector3(), junto: 0, vao: 0.14,
    };
    p.refazer = () => {
      const largura = Math.min((0.93 * visW(anc.d) - p.vao) / 2, 0.6 * visH(anc.d) * Math.min(p.a.prop, p.b.prop));
      p.a.tamanho(largura);
      p.b.tamanho(largura);
    };
    pares.push(p);
    return p;
  }

  const pa = new T.Vector3();
  const pb = new T.Vector3();

  function porQuadro(q, anc, lx, ly, lz, giro, t, opac) {
    q.mesh.position.set(lx, ly + Math.sin(t * 0.5 + q.fase) * 0.035, lz).applyQuaternion(anc.quat).add(anc.mundo);
    q.mesh.quaternion.copy(anc.quat).multiply(qz.setFromAxisAngle(Z, giro + Math.sin(t * 0.37 + q.fase) * 0.012));
    q.mostrar(opac);
  }

  function acertarQuadros(s, t) {
    for (const f of figuras) {
      const { anc, q } = f;
      porQuadro(q, anc, 0, 0, 0, 0, t, anc.alfa);
      f.base.set(0, -q.h / 2 - 0.16, 0).applyQuaternion(anc.quat).add(anc.mundo);
    }
    for (const p of pares) {
      const { anc, a, b } = p;
      const liga = suave((s - (anc.sh - 0.2)) / 0.3);
      const e = saida((s - (anc.sh + 0.08)) / 0.42);
      const r = 1 - e;
      p.junto = e;
      const meio = p.vao / 2;
      const ax = -(a.w / 2 + meio);
      const bx = b.w / 2 + meio;
      const sobe = Math.min(0.45, (visH(anc.d) - a.h) * 0.2);
      porQuadro(a, anc, ax, r * sobe, -r * 1.1, r * 0.06, t, anc.alfa);
      porQuadro(b, anc, bx, -r * sobe, -r * 0.5, -r * 0.06, t, anc.alfa);
      p.baseA.set(ax, r * sobe - a.h / 2 - 0.16, 0).applyQuaternion(anc.quat).add(anc.mundo);
      p.baseB.set(bx, -r * sobe - b.h / 2 - 0.16, 0).applyQuaternion(anc.quat).add(anc.mundo);
      // O fio vai da fita de uma foto à fita da outra.
      const visivel = anc.alfa > 0.02 && liga > 0.01 && a.pronto && b.pronto;
      p.fio.visible = visivel;
      if (!visivel) continue;
      pa.set((p.fioA.x - 0.5) * a.w, (0.5 - p.fioA.y) * a.h, 0.05).applyQuaternion(a.mesh.quaternion).add(a.mesh.position);
      pb.set((p.fioB.x - 0.5) * b.w, (0.5 - p.fioB.y) * b.h, 0.05).applyQuaternion(b.mesh.quaternion).add(b.mesh.position);
      const comp = pa.distanceTo(pb);
      p.fio.position.copy(pa);
      // Sem torcer: a barriga do fio fica sempre para baixo de quem olha.
      v0.copy(pb).sub(pa).normalize();
      v2.copy(Z).applyQuaternion(anc.quat);
      v1.crossVectors(v2, v0).normalize();
      v2.crossVectors(v0, v1);
      p.fio.quaternion.setFromRotationMatrix(m4.makeBasis(v0, v1, v2));
      p.fio.scale.set(comp, 1, 1);
      p.fio.material.uniforms.uCorte.value = liga;
      p.fio.material.uniforms.uRep.value = comp / 0.3;
      p.fio.material.uniforms.uOpac.value = anc.alfa;
    }
  }

  /* ---- o cometa ---------------------------------------------------------------------- */

  const cometa = (() => {
    const grupo = new T.Group();
    cena.add(grupo);
    const n = 300;
    const aR = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const ang = rnd() * 6.28;
      const r = rnd() ** 1.6;
      aR.set([rnd(), Math.cos(ang) * r, Math.sin(ang) * r, rnd()], i * 4);
    }
    const geo = guardar(new T.BufferGeometry());
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aR', new T.BufferAttribute(aR, 4));
    const P0 = new T.Vector3(96, 104, -250);
    const P1 = new T.Vector3(8, 60, -250);
    const destinos = [new T.Vector3(-82, 24, -250), new T.Vector3(-30, 14, -238)];
    const um = (tom, i) => {
      const mat = guardar(new T.ShaderMaterial({
        uniforms: {
          uCab: { value: new T.Vector3() }, uDir: { value: new T.Vector3(1, 0, 0) }, uLado: { value: new T.Vector3() },
          uCima: { value: new T.Vector3() }, uComp: { value: 70 }, uTempo: U.uTempo, uOpac: { value: 0 }, uDpr: U.uDpr,
        },
        vertexShader: G.CAUDA_V, fragmentShader: G.PONTO_F, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      }));
      const cauda = new T.Points(geo, mat);
      cauda.frustumCulled = false;
      cauda.renderOrder = 2;
      const cabeca = new T.Sprite(guardar(new T.SpriteMaterial({
        map: brilho, color: tom, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
      })));
      cabeca.renderOrder = 2;
      grupo.add(cauda, cabeca);
      return { mat, cauda, cabeca, i, pos: new T.Vector3(), antes: new T.Vector3() };
    };
    const A = um(0xdcecff, 0);
    const B = um(0xffe0ee, 1);
    const onde = (k, c, out) => {
      if (k <= 1) return out.lerpVectors(P0, P1, k);
      const kk = k - 1;
      out.lerpVectors(P1, destinos[c.i], kk);
      if (c.i === 1) out.y -= 12 * kk * kk;
      return out;
    };
    const por = (c, k, opac, clarao) => {
      onde(k, c, c.pos);
      onde(k + 0.02, c, c.antes);
      const u = c.mat.uniforms;
      u.uDir.value.copy(c.antes).sub(c.pos).normalize();
      u.uLado.value.crossVectors(u.uDir.value, Z).normalize();
      u.uCima.value.crossVectors(u.uDir.value, u.uLado.value).normalize();
      u.uCab.value.copy(c.pos);
      u.uOpac.value = opac;
      c.cabeca.position.copy(c.pos);
      c.cabeca.material.opacity = Math.min(1, opac * (1 + clarao));
      c.cabeca.scale.setScalar(11 + clarao * 16);
      c.cauda.visible = opac > 0.003;
      c.cabeca.visible = opac > 0.003;
    };
    return {
      grupo,
      definir(k, luz) {
        const opac = suave(k / 0.14) * (1 - suave((k - 1.72) / 0.28)) * luz;
        const clarao = Math.exp(-(((k - 1) / 0.07) ** 2));
        A.mat.uniforms.uComp.value = 74;
        B.mat.uniforms.uComp.value = 30 + 34 * clamp(k - 1);
        por(A, k, opac, clarao);
        por(B, k, k > 1 ? opac * suave((k - 1) / 0.08) : 0, clarao);
      },
    };
  })();

  /* ---- tamanho ------------------------------------------------------------------------- */

  function redimensionar(w, h) {
    W = Math.max(1, Math.round(w));
    H = Math.max(1, Math.round(h));
    aspecto = W / H;
    renderer.setSize(W, H, false);
    for (const c of [cam, base]) {
      c.aspect = aspecto;
      c.updateProjectionMatrix();
    }
    U.uEsc.value = (H * dpr) / (2 * TAN);
    for (const a of ancoras) a.refazer();
    for (const f of figuras) f.refazer();
    for (const p of pares) p.refazer();
    construirCordao();
  }

  /** Quadros pesados demais: a tela perde resolução, não o desenho. */
  function baixar() {
    if (dpr <= 1) return false;
    dpr = Math.max(1, dpr * 0.78);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    U.uDpr.value = dpr;
    U.uEsc.value = (H * dpr) / (2 * TAN);
    return true;
  }

  /* ---- um quadro do voo ------------------------------------------------------------------ */

  function passo(s, t, deriva = 1) {
    if (morto) return estado;
    const hora = horaDe(clamp(s / S));
    const n = acertarHora(hora);
    U.uTempo.value = t;
    estado.hora = hora;
    estado.s = s;

    pose(s, base.position, base.quaternion);
    base.updateMatrixWorld();
    cam.position.copy(base.position);
    cam.quaternion.copy(base.quaternion);
    if (deriva > 0) {
      v0.set(Math.sin(t * 0.31) * 0.13, Math.sin(t * 0.23 + 1) * 0.09, 0).multiplyScalar(deriva).applyQuaternion(cam.quaternion);
      cam.position.add(v0);
      cam.quaternion.multiply(qz.setFromAxisAngle(Z, Math.sin(t * 0.17) * 0.006 * deriva));
    }
    const cy = cam.position.y;
    const cx = cam.position.x;
    const cz = cam.position.z;

    ceu.position.copy(cam.position);
    longe.position.copy(cam.position);
    longe.rotation.y = t * 0.0035;
    longe.material.uniforms.uOpac.value = U.uEstrelas.value;
    longe.visible = U.uEstrelas.value > 0.01;
    perto.material.uniforms.uOpac.value = U.uEstrelas.value;
    perto.visible = longe.visible;

    // O mar de nuvens: maciço por cima; por baixo vira um teto que vai se abrindo.
    const meio = (MAR_A + MAR_B) / 2;
    const acima = cy > meio;
    const [alta, baixa] = mar;
    for (const m of mar) m.position.set(cx, m.position.y, cz);
    alta.material.uniforms.uCob.value = acima ? 0.4 : n.teto;
    alta.material.uniforms.uSolido.value = acima ? 1 : 0;
    baixa.material.uniforms.uCob.value = acima ? -1 : n.teto + 0.03;
    baixa.material.uniforms.uSolido.value = acima ? 1 : 0;
    baixa.material.uniforms.uTom.value = acima ? 0.5 : 0.85;
    alta.renderOrder = acima ? 4 : 3;
    baixa.renderOrder = acima ? 3 : 4;
    tufos.material.uniforms.uOpac.value = n.tufos;

    const embaixo = cy < MAR_B - 1;
    lago.visible = embaixo;
    montes.visible = embaixo;
    lago.position.set(cx, LAGO, cz);
    montes.position.set(cx, 0, cz);
    montes.material.color.copy(corMonte);
    const luzes = suave((hora - 0.4) / 0.25);
    cidade.visible = embaixo && luzes > 0.01;
    espelho.visible = cidade.visible;
    cidade.material.uniforms.uOpac.value = luzes;
    espelho.material.uniforms.uOpac.value = luzes * 0.4;

    // A travessia: por dentro da nuvem tudo fica da cor da luz.
    estado.nevoa = Math.exp(-(((cy - meio) / 3.4) ** 2));
    estado.corNevoa = `#${U.uLuz.value.getHexString()}`;

    for (const a of ancoras) a.atualizar(s);
    acertarQuadros(s, t);

    // A ponta de luz corre pelo cordão um pouco à frente dela.
    if (cordao) {
      const u = clamp((cordao.z0 - (cz - 7.5)) / (cordao.z0 - cordao.z1));
      cordao.tubo.material.uniforms.uPonta.value = u;
      cordao.curva.getPointAt(u, ponta.position);
      ponta.material.opacity = 0.75 + 0.2 * Math.sin(t * 1.3);
    }

    const k = s < sDiv ? clamp((s - (sDiv - 1.4)) / 1.4) : 1 + clamp((s - sDiv) / 1.4);
    estado.k = k;
    cometa.grupo.position.copy(cam.position);
    cometa.definir(k, suave((hora - 0.28) / 0.14));

    renderer.render(cena, cam);
    return estado;
  }

  function destruir() {
    if (morto) return;
    morto = true;
    cordao?.tubo.geometry.dispose();
    cordao?.halo.geometry.dispose();
    for (const x of lixo) x.dispose?.();
    renderer.dispose();
    renderer.forceContextLoss?.();
    tela.remove();
  }

  return { tela, estado, ancorar, fimAnc, figura, par, projetar, redimensionar, baixar, passo, destruir };
}
