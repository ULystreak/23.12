/* ============================================================================
   POPPY · corredor: a fábrica de brinquedos em 3D, vista em primeira pessoa
   ============================================================================
   criarCorredor({ THREE, recipiente, amb, n, desvios, olhares, cenas, aoFaiscar, aoPerder })
     → { el, medir(), acender(), quadro(dt, u, t), projetar(x, y, z, saida),
         ancoraFim, destruir() }  ou  null, se o WebGL não subir.
   n: quantas paradas tem o corredor (uma a cada D metros); u: a parada em que
   a câmera está (0 … n-1, fracionário). desvios[i]: para que lado a câmera
   pende na parada i (m); olhares[i]: para onde ela vira o rosto (rad).
   cenas = { maos, fita, esteira }: o índice da parada de cada cena (ou -1).
   Um renderer só deste capítulo, sem sombras e sem pós-processamento: três
   luzes pontuais que acompanham as lâmpadas mais próximas, o resto é textura.
   A resolução do desenho se adapta (vigiar): se os quadros ficam lentos de
   verdade com a folha aberta, o pixel ratio desce aos degraus, nunca abaixo
   de 1; se nem no piso ajudou (o gargalo não era o preenchimento), volta à
   resolução de antes e desiste. Ritmo certinho de 30 quadros não é lentidão, é
   o aparelho poupando bateria: aí nem tenta.
   ========================================================================== */

import { clamp, lerp, semente } from '../../nucleo/util.js';
import {
  CORES_TINTA, pintarBrilho, pintarEsteira, pintarFita, pintarParede, pintarPiso,
  pintarPorta, pintarPortao, pintarTeto,
} from './texturas.js';

export const D = 7; // metros entre duas paradas
export const DF = 2.7; // a que distância fica o suporte quando está em foco
export const OLHO = 1.55; // altura dos olhos
const LARG = 4;
const ALT = 3.4;
const NEVOA = 0x0a1a24;
const FIO = 0xe3283c;
const N_LUZES = 3;
// A resolução adaptativa: janelas de quadros, o que é "lento" e quanto tem de melhorar.
const JANELA_QUADROS = 40;
const QUADRO_LENTO = 21; // ms de média: abaixo de ~48 quadros por segundo
const JANELAS_LENTAS = 3; // seguidas, antes de descer
const JANELAS_PROVA = 2; // depois de descer, quantas janelas até julgar
const GANHO_MINIMO = 0.85; // no piso, a média tem de ter caído pelo menos 15%
const SALTO = 500; // ms: intervalo que não é quadro lento, é aba que voltou
// O Modo Pouca Energia do iPhone limita a página a 30 quadros: todo intervalo fica em ~33 ms.
const TETO_30 = [31, 36]; // ms: a média de quem está preso em 30 quadros
const QUADRO_CURTO = 27; // ms: quadro que chegou antes disso prova que o aparelho passa de 30
const CURTOS_TOLERADOS = 0.05; // dos quadros das janelas lentas (um quadro atrasado encurta o seguinte)

const suave = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function criarCorredor({ THREE, recipiente, amb = {}, n, desvios, olhares, cenas, aoFaiscar, aoPerder }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'pp-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  const dprTeto = Math.min(window.devicePixelRatio || 1, amb.toque ? 1.5 : 2);
  const dprPiso = Math.min(1, dprTeto);
  let dpr = dprTeto;
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(NEVOA, 1);
  recipiente.append(canvas);

  const acaso = semente(2312);
  const cena = new THREE.Scene();
  cena.fog = new THREE.Fog(NEVOA, 5, 30);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 70);
  camera.rotation.order = 'YXZ';

  const texturas = [];
  const textura = (tela, repetir = false) => {
    const t = new THREE.CanvasTexture(tela);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    texturas.push(t);
    return t;
  };
  const fosco = (opcoes) => new THREE.MeshLambertMaterial(opcoes);
  const luzPropria = (opcoes) => new THREE.MeshBasicMaterial(opcoes);
  const aditivo = (opcoes) => new THREE.MeshBasicMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, ...opcoes,
  });
  const por = (malha, x, y, z, pai = cena) => {
    malha.position.set(x, y, z);
    pai.add(malha);
    return malha;
  };

  const zFim = -(n - 1) * D; // onde a câmera para
  const zPortao = zFim - 6;
  const zInicio = 4.5;
  const comprimento = zInicio - zPortao;
  const zMeio = (zInicio + zPortao) / 2;

  /* ---- a casca: piso, teto, paredes ---------------------------------------- */
  const tBrilho = textura(pintarBrilho());
  const tPiso = textura(pintarPiso(), true);
  tPiso.repeat.set(LARG / 2, comprimento / 2);
  const piso = por(new THREE.Mesh(new THREE.PlaneGeometry(LARG, comprimento), fosco({ map: tPiso })), 0, 0, zMeio);
  piso.rotation.x = -Math.PI / 2;

  const tTeto = textura(pintarTeto(), true);
  tTeto.repeat.set(LARG, comprimento);
  const teto = por(new THREE.Mesh(new THREE.PlaneGeometry(LARG, comprimento), fosco({ map: tTeto })), 0, ALT, zMeio);
  teto.rotation.x = Math.PI / 2;

  const matParede = [0, 1, 2, 3].map((i) => fosco({ map: textura(pintarParede(i)) }));
  const geoParede = new THREE.PlaneGeometry(D, ALT);
  const trechos = []; // o que some quando fica longe
  const nTrechos = Math.ceil(comprimento / D);
  for (let k = 0; k < nTrechos; k += 1) {
    const z = zInicio - D * (k + 0.5);
    const esq = por(new THREE.Mesh(geoParede, matParede[k % 4]), -LARG / 2, ALT / 2, z);
    esq.rotation.y = Math.PI / 2;
    const dir = por(new THREE.Mesh(geoParede, matParede[(k + 2) % 4]), LARG / 2, ALT / 2, z);
    dir.rotation.y = -Math.PI / 2;
    trechos.push(esq, dir);
  }
  // A parede atrás dela: o corredor não é aberto para o nada.
  const fundoAtras = por(new THREE.Mesh(new THREE.PlaneGeometry(LARG, ALT), matParede[1]), 0, ALT / 2, zInicio);
  fundoAtras.rotation.y = Math.PI;

  /* ---- canos e portas laterais --------------------------------------------- */
  const canos = [
    [-1.8, 3.04, 0.1, '#c79c35'],
    [-1.86, 2.76, 0.05, '#4d7fa6'],
    [1.84, 3.0, 0.075, '#4f9470'],
  ];
  for (const [x, y, r, cor] of canos) {
    const cano = por(new THREE.Mesh(new THREE.CylinderGeometry(r, r, comprimento, 10, 1, true), fosco({ color: cor })), x, y, zMeio);
    cano.rotation.x = Math.PI / 2;
  }
  const nFlanges = Math.floor(comprimento / 3.5);
  const flanges = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 12), fosco({ color: '#8a6f2c' }), nFlanges);
  const mat4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const esc = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const euler = new THREE.Euler();
  quat.setFromEuler(euler.set(Math.PI / 2, 0, 0));
  for (let i = 0; i < nFlanges; i += 1) {
    flanges.setMatrixAt(i, mat4.compose(pos.set(-1.8, 3.04, zInicio - 1.75 - i * 3.5), quat, esc));
  }
  cena.add(flanges);

  const portas = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.15, 2.3), fosco({ map: textura(pintarPorta()) }), n);
  const corTmp = new THREE.Color();
  quat.setFromEuler(euler.set(0, Math.PI / 2, 0));
  for (let i = 0; i < n; i += 1) {
    portas.setMatrixAt(i, mat4.compose(pos.set(-LARG / 2 + 0.012, 1.15, -i * D + 2.6), quat, esc));
    portas.setColorAt(i, corTmp.set(CORES_TINTA[(i + 1) % 4]).lerp(new THREE.Color('#ffffff'), 0.35));
  }
  cena.add(portas);

  /* ---- lâmpadas penduradas --------------------------------------------------- */
  const geoCordao = new THREE.CylinderGeometry(0.012, 0.012, 0.78, 5);
  const geoCupula = new THREE.ConeGeometry(0.27, 0.2, 18, 1, true);
  const geoBulbo = new THREE.SphereGeometry(0.075, 12, 10);
  const geoPoca = new THREE.PlaneGeometry(1, 1);
  const matCordao = fosco({ color: '#1b2227' });
  const matCupula = fosco({ color: '#2f7468', side: THREE.DoubleSide, emissive: '#3a2a12' });
  const matBulbo = luzPropria({ color: '#ffe6b8', fog: false });
  const matHalo = new THREE.SpriteMaterial({
    map: tBrilho, color: '#ffbf73', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6,
  });
  const matPoca = aditivo({ map: tBrilho, color: '#ffab55', opacity: 0.34, fog: true });
  const lampadas = [];
  for (let i = 0; i < n + 1; i += 1) {
    const grupo = new THREE.Group();
    const x = i % 2 ? 0.55 : -0.55;
    const z = -i * D - 1.1;
    grupo.position.set(x, ALT, z);
    por(new THREE.Mesh(geoCordao, matCordao), 0, -0.39, 0, grupo);
    por(new THREE.Mesh(geoCupula, matCupula), 0, -0.8, 0, grupo);
    por(new THREE.Mesh(geoBulbo, matBulbo), 0, -0.9, 0, grupo);
    const halo = new THREE.Sprite(matHalo);
    halo.scale.setScalar(0.95);
    por(halo, 0, -0.92, 0, grupo);
    cena.add(grupo);
    const poca = por(new THREE.Mesh(geoPoca, matPoca), x, 0.012, z);
    poca.rotation.x = -Math.PI / 2;
    poca.scale.setScalar(4.4);
    lampadas.push({ grupo, poca, x, z, ax: 0, az: 0, vx: 0, vz: 0, fase: acaso() * 6.28, bulbo: new THREE.Vector3(x, ALT - 0.9, z) });
  }
  const luzes = [];
  for (let i = 0; i < N_LUZES; i += 1) {
    const luz = new THREE.PointLight('#ffc588', 0, 11, 1.7);
    cena.add(luz);
    luzes.push(luz);
  }
  const ceu = new THREE.HemisphereLight('#86abc2', '#3b2c20', 0.2);
  cena.add(ceu);

  /* ---- a esteira e os brinquedos ----------------------------------------------- */
  const zEstA = -1.5;
  const zEstB = zPortao + 2.2;
  const compEst = zEstA - zEstB;
  const xEst = 1.42;
  const yEst = 0.86;
  por(new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.16, compEst), fosco({ color: '#d9a630' })), xEst, yEst - 0.09, (zEstA + zEstB) / 2);
  const tLona = textura(pintarEsteira(), true);
  tLona.repeat.set(1, compEst / 0.7);
  const lona = por(new THREE.Mesh(new THREE.PlaneGeometry(0.7, compEst), fosco({ map: tLona })), xEst, yEst, (zEstA + zEstB) / 2);
  lona.rotation.x = -Math.PI / 2;
  const nPernas = Math.floor(compEst / 2.5) + 1;
  const pernas = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, yEst - 0.16, 0.08), fosco({ color: '#27323a' }), nPernas * 2);
  quat.identity();
  for (let i = 0; i < nPernas; i += 1) {
    const z = zEstA - 0.3 - i * 2.5;
    pernas.setMatrixAt(i * 2, mat4.compose(pos.set(xEst - 0.36, (yEst - 0.16) / 2, z), quat, esc));
    pernas.setMatrixAt(i * 2 + 1, mat4.compose(pos.set(xEst + 0.36, (yEst - 0.16) / 2, z), quat, esc));
  }
  cena.add(pernas);
  // As duas bocas por onde a esteira entra e sai da parede.
  const geoBoca = new THREE.BoxGeometry(1.1, 1.0, 0.5);
  const matBoca = fosco({ color: '#27323a' });
  por(new THREE.Mesh(geoBoca, matBoca), xEst, yEst + 0.3, zEstA + 0.2);
  por(new THREE.Mesh(geoBoca, matBoca), xEst, yEst + 0.3, zEstB - 0.2);

  const formaCoracao = new THREE.Shape();
  formaCoracao.moveTo(0, -0.34);
  formaCoracao.bezierCurveTo(-0.62, 0.1, -0.3, 0.52, 0, 0.2);
  formaCoracao.bezierCurveTo(0.3, 0.52, 0.62, 0.1, 0, -0.34);
  const geoCoracao = new THREE.ExtrudeGeometry(formaCoracao, {
    depth: 0.2, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 3, curveSegments: 10,
  });
  geoCoracao.center();
  const JANELA = 36;
  const PASSO_BRINQ = 2;
  const POR_TIPO = JANELA / PASSO_BRINQ / 3;
  const coresBrinq = ['#edb733', '#3b83c6', '#46a873', '#f2b6c6', '#e98a4a', '#8fd0e6'];
  const tipos = [
    { geo: new THREE.BoxGeometry(0.27, 0.27, 0.27), alto: 0.135 },
    { geo: new THREE.SphereGeometry(0.165, 18, 14), alto: 0.165 },
    { geo: geoCoracao, alto: 0.2, escala: 0.46 },
  ].map((tipo, k) => {
    const malha = new THREE.InstancedMesh(tipo.geo, fosco({ color: '#ffffff' }), POR_TIPO);
    for (let j = 0; j < POR_TIPO; j += 1) {
      malha.setColorAt(j, corTmp.set(k === 2 ? '#f2b6c6' : coresBrinq[(j * 2 + k) % coresBrinq.length]));
    }
    malha.frustumCulled = false;
    cena.add(malha);
    return { ...tipo, malha };
  });

  /* ---- o fio vermelho ------------------------------------------------------------ */
  const ancoraFim = { x: 0, y: 0.78, z: zFim - DF }; // o centro do suporte do botão
  const pontos = [[0.95, 0.03, zInicio - 0.4], [0.5, 0.03, 1.2]];
  const P = (x, y, z) => pontos.push([x, y, z]);
  for (let i = 0; i < n - 1; i += 1) {
    const z = -i * D;
    const lado = i % 2 ? 0.75 : -0.75;
    if (i === cenas.maos) {
      const zm = z - DF - 0.1;
      P(-0.55, 0.03, z - 1.0);
      P(-0.5, 0.5, zm + 0.5);
      P(0, 1.36, zm);
      P(0.45, 0.5, zm - 0.6);
      P(0.5, 0.03, zm - 1.7);
    } else {
      P(lado, 0.03, z - 2.4);
      P(-lado * 0.6, 0.03, z - 5.4);
    }
  }
  // No fim ele sobe até o botão (o nó) e segue para a luz.
  const k = 1.6 / DF;
  const no = [ancoraFim.x * k, OLHO + (ancoraFim.y + 0.2 - OLHO) * k, zFim - 1.6];
  P(-0.5, 0.03, zFim - 0.3);
  P(-0.3, 0.3, zFim - 1.0);
  P(...no);
  P(0.12, 0.62, zFim - 2.4);
  P(0.05, 0.03, zFim - 3.6);
  P(0, 0.03, zPortao - 1.5);
  const curva = new THREE.CatmullRomCurve3(pontos.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const nTubo = n * 46;
  const fio = new THREE.Mesh(new THREE.TubeGeometry(curva, nTubo, 0.02, 6), luzPropria({ color: FIO, fog: false }));
  const matHaloFio = aditivo({ color: '#ff3a4c', opacity: 0.16 });
  const haloFio = new THREE.Mesh(new THREE.TubeGeometry(curva, nTubo, 0.05, 6), matHaloFio);
  cena.add(fio, haloFio);
  // Uma centelha que corre no fio, sempre um pouco à frente dela.
  const trilha = curva.getSpacedPoints(n * 30);
  const centelha = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tBrilho, color: '#ff5566', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  centelha.scale.setScalar(0.5);
  cena.add(centelha);

  /* ---- as duas mãos ------------------------------------------------------------- */
  let maos = null;
  if (cenas.maos >= 0) {
    const z = -cenas.maos * D - DF - 0.1;
    const y = 1.42;
    const geoDedo = new THREE.CapsuleGeometry(0.036, 0.13, 4, 10);
    const geoPalma = new THREE.SphereGeometry(0.17, 20, 16);
    const geoPunho = new THREE.CylinderGeometry(0.1, 0.115, 0.13, 16);
    const geoAnel = new THREE.CylinderGeometry(0.122, 0.122, 0.04, 16);
    const geoCabo = new THREE.CylinderGeometry(0.022, 0.022, 1, 6);
    const matCabo = fosco({ color: '#1e262c' });
    const matAnel = fosco({ color: '#f1e9d2' });
    const fazer = (cor, lado) => { // lado: -1 vem da esquerda, +1 da direita
      const mat = fosco({ color: cor, emissive: cor, emissiveIntensity: 0.12 });
      const mao = new THREE.Group();
      const palma = por(new THREE.Mesh(geoPalma, mat), 0, 0, 0, mao);
      palma.scale.set(0.95, 1, 0.48);
      for (let d = 0; d < 4; d += 1) {
        const dedo = por(new THREE.Mesh(geoDedo, mat), 0.21 + (d === 1 || d === 2 ? 0.025 : 0), 0.105 - d * 0.07, 0, mao);
        dedo.rotation.z = -Math.PI / 2 + (1.5 - d) * 0.07;
      }
      const polegar = por(new THREE.Mesh(geoDedo, mat), 0.06, 0.2, 0.02, mao);
      polegar.rotation.z = -0.5;
      const punho = por(new THREE.Mesh(geoPunho, mat), -0.2, 0, 0, mao);
      punho.rotation.z = Math.PI / 2;
      const anel = por(new THREE.Mesh(geoAnel, matAnel), -0.25, 0, 0, mao);
      anel.rotation.z = Math.PI / 2;
      mao.scale.x = -lado; // a da direita aponta para a esquerda
      mao.position.set(lado * 2, y, z);
      cena.add(mao);
      const cabo = new THREE.Mesh(geoCabo, matCabo);
      cena.add(cabo);
      return { mao, cabo, lado, monte: new THREE.Vector3(lado * (LARG / 2), 2.5, z + 0.25) };
    };
    const coracaoMat = luzPropria({ color: '#ffd9a0', transparent: true, opacity: 0, fog: false });
    const coracao = por(new THREE.Mesh(geoCoracao, coracaoMat), 0, y + 0.3, z);
    coracao.scale.setScalar(0);
    const N_F = 44;
    const geoF = new THREE.BufferGeometry();
    const posF = new Float32Array(N_F * 3);
    geoF.setAttribute('position', new THREE.BufferAttribute(posF, 3));
    const matF = new THREE.PointsMaterial({
      map: tBrilho, color: '#ffd27a', size: 0.16, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const faiscas = new THREE.Points(geoF, matF);
    faiscas.frustumCulled = false;
    cena.add(faiscas);
    maos = {
      z, y, c: 0, v: 0, tocou: false, vida: 0, amor: 0,
      lados: [fazer('#3b83c6', -1), fazer('#d5503f', 1)],
      coracao, coracaoMat, faiscas, posF, velF: new Float32Array(N_F * 3), N_F, matF,
    };
  }

  /* ---- a fita pendurada -------------------------------------------------------- */
  let fita = null;
  if (cenas.fita >= 0) {
    const grupo = new THREE.Group();
    grupo.position.set(0, ALT, -cenas.fita * D - DF);
    const corpo = por(new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.575, 0.1), fosco({ color: '#1c2228' })), 0, -1.32, 0, grupo);
    const frente = por(new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.575), fosco({ map: textura(pintarFita()), emissive: '#2a2418' })), 0, 0, 0.052, corpo);
    frente.renderOrder = 1;
    const geoCorda = new THREE.CylinderGeometry(0.008, 0.008, 1.04, 4);
    por(new THREE.Mesh(geoCorda, matCordao), -0.36, -0.52, 0, grupo);
    por(new THREE.Mesh(geoCorda, matCordao), 0.36, -0.52, 0, grupo);
    cena.add(grupo);
    fita = { grupo, corpo, a: 0, v: 0 };
  }

  /* ---- o portão do fundo ---------------------------------------------------------- */
  const matMoldura = fosco({ color: '#33424d' });
  por(new THREE.Mesh(new THREE.BoxGeometry(0.75, ALT, 0.3), matMoldura), -1.625, ALT / 2, zPortao);
  por(new THREE.Mesh(new THREE.BoxGeometry(0.75, ALT, 0.3), matMoldura), 1.625, ALT / 2, zPortao);
  por(new THREE.Mesh(new THREE.BoxGeometry(LARG, 0.5, 0.3), matMoldura), 0, ALT - 0.25, zPortao);
  const geoFolha = new THREE.PlaneGeometry(1.25, 2.9);
  const folhas = [-1, 1].map((lado) => {
    const pivo = new THREE.Group();
    pivo.position.set(lado * 1.25, 0, zPortao + 0.16);
    por(new THREE.Mesh(geoFolha, fosco({ map: textura(pintarPortao(lado > 0)), side: THREE.DoubleSide })), -lado * 0.625, 1.45, 0, pivo);
    cena.add(pivo);
    return { pivo, lado };
  });
  por(new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.9), luzPropria({ color: '#fff3d4', fog: false })), 0, 1.45, zPortao - 0.1);
  const clarao = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tBrilho, color: '#ffe9b8', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, opacity: 0,
  }));
  clarao.position.set(0, 1.5, zPortao + 0.3);
  cena.add(clarao);
  const luzPortao = new THREE.PointLight('#fff0cc', 0, 18, 1.6);
  luzPortao.position.set(0, 1.7, zPortao + 1.6);
  cena.add(luzPortao);
  // Antes de abrir, uma fresta de luz por baixo e entre as folhas.
  const matFresta = aditivo({ color: '#ffe2a6', opacity: 0.8 });
  por(new THREE.Mesh(new THREE.PlaneGeometry(0.035, 2.9), matFresta), 0, 1.45, zPortao + 0.17);
  por(new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.04), matFresta), 0, 0.03, zPortao + 0.17);
  const portao = { a: 0, v: 0 };

  /* ---- poeira no ar --------------------------------------------------------------- */
  const N_POEIRA = amb.nivel === 'baixo' ? 110 : 240;
  const geoPoeira = new THREE.BufferGeometry();
  const posP = new Float32Array(N_POEIRA * 3);
  const semP = new Float32Array(N_POEIRA);
  for (let i = 0; i < N_POEIRA; i += 1) {
    posP[i * 3] = (acaso() - 0.5) * (LARG - 0.3);
    posP[i * 3 + 1] = 0.25 + acaso() * (ALT - 0.5);
    posP[i * 3 + 2] = -acaso() * 24;
    semP[i] = acaso();
  }
  geoPoeira.setAttribute('position', new THREE.BufferAttribute(posP, 3));
  geoPoeira.setAttribute('aS', new THREE.BufferAttribute(semP, 1));
  const matPoeira = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uZ: { value: 0 }, uTam: { value: 30 }, uMapa: { value: tBrilho }, uForca: { value: 1 } },
    vertexShader: `
      attribute float aS;
      uniform float uT; uniform float uZ; uniform float uTam;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uT * 0.21 + aS * 40.0) * 0.22;
        p.y += sin(uT * 0.17 + aS * 23.0) * 0.18 - fract(uT * 0.006 + aS) * 0.2;
        p.z = uZ + 2.0 - mod(uZ + 2.0 - p.z, 24.0);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uTam * (0.5 + aS) / max(d, 0.4);
        vA = smoothstep(0.3, 1.6, d) * (1.0 - smoothstep(9.0, 20.0, d)) * (0.35 + 0.65 * abs(sin(uT * 0.5 + aS * 60.0)));
      }`,
    fragmentShader: `
      uniform sampler2D uMapa; uniform float uForca;
      varying float vA;
      void main() {
        float a = texture2D(uMapa, gl_PointCoord).a * vA * uForca;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.64) * a, a);
      }`,
  });
  const poeira = new THREE.Points(geoPoeira, matPoeira);
  poeira.frustumCulled = false;
  cena.add(poeira);

  /* ---- medidas, câmera e projeção ---------------------------------------------- */
  let largura = 1;
  let altura = 1;
  function medir() {
    largura = Math.max(1, recipiente.clientWidth);
    altura = Math.max(1, recipiente.clientHeight);
    renderer.setSize(largura, altura, false);
    camera.aspect = largura / altura;
    camera.fov = camera.aspect < 1 ? 70 : 56;
    camera.updateProjectionMatrix();
    matPoeira.uniforms.uTam.value = 0.035 * altura * dpr;
  }

  /* ---- a resolução se adapta ao aparelho ----------------------------------------- */
  // Olha a média de janelas de quadros. Três janelas lentas seguidas: desce um degrau e
  // prova. Ficou rápido: fica ali. Continua lento: desce de novo, até o piso. No piso, se
  // nem assim melhorou (o gargalo não era o preenchimento), volta à resolução de antes e
  // não mexe mais. Antes de descer, confere se a lentidão não é o aparelho limitando a
  // página a 30 quadros para poupar bateria (ritmo certinho de ~33 ms, quase nenhum quadro
  // mais curto): aí baixar a resolução só borraria a imagem à toa, então trava sem mexer.
  const vigia = {
    ligado: false, travado: dprTeto <= dprPiso, pular: 0, soma: 0, n: 0, ultimo: 0,
    lentas: 0, base: Infinity, provando: false, janelas: 0, somaProva: 0, dprAntes: dprTeto,
    curtos: 0, curtosLentas: 0,
  };
  function aplicarDpr(novo) {
    dpr = novo;
    renderer.setPixelRatio(dpr); // refaz o buffer; o quadro é desenhado logo em seguida
    matPoeira.uniforms.uTam.value = 0.035 * altura * dpr;
  }
  function descer() {
    vigia.provando = true;
    vigia.janelas = 0;
    vigia.somaProva = 0;
    vigia.pular = 12;
    aplicarDpr(Math.max(dprPiso, dpr > 1.5 ? 1.5 : dpr > 1.25 ? 1.25 : 1));
  }
  /** Chamado uma vez por quadro, antes de desenhar. */
  function vigiar() {
    const instante = performance.now();
    const intervalo = instante - vigia.ultimo;
    vigia.ultimo = instante;
    if (!vigia.ligado || vigia.travado) return;
    if (vigia.pular > 0) {
      vigia.pular -= 1;
      return;
    }
    if (!(intervalo > 0) || intervalo > SALTO) return;
    vigia.soma += intervalo;
    vigia.n += 1;
    if (intervalo < QUADRO_CURTO) vigia.curtos += 1;
    if (vigia.n < JANELA_QUADROS) return;
    const media = vigia.soma / vigia.n;
    const curtos = vigia.curtos;
    vigia.soma = 0;
    vigia.n = 0;
    vigia.curtos = 0;

    if (vigia.provando) {
      vigia.somaProva += media;
      vigia.janelas += 1;
      if (vigia.janelas < JANELAS_PROVA) return;
      const prova = vigia.somaProva / vigia.janelas;
      if (prova <= QUADRO_LENTO) { // resolveu: fica neste degrau e segue olhando
        vigia.provando = false;
        vigia.lentas = 0;
        vigia.base = Infinity;
        vigia.curtosLentas = 0;
      } else if (dpr > dprPiso) {
        descer();
      } else {
        if (prova > vigia.base * GANHO_MINIMO) aplicarDpr(vigia.dprAntes);
        vigia.travado = true;
      }
      return;
    }

    if (media > QUADRO_LENTO) {
      vigia.lentas += 1;
      vigia.base = Math.min(vigia.base, media);
      vigia.curtosLentas += curtos;
    } else {
      vigia.lentas = 0;
      vigia.base = Infinity;
      vigia.curtosLentas = 0;
    }
    if (vigia.lentas < JANELAS_LENTAS) return;
    const preso30 = vigia.base > TETO_30[0] && vigia.base < TETO_30[1]
      && vigia.curtosLentas <= vigia.lentas * JANELA_QUADROS * CURTOS_TOLERADOS;
    if (dpr <= dprPiso || preso30) {
      vigia.travado = true;
      return;
    }
    vigia.dprAntes = dpr;
    descer();
  }

  const v = new THREE.Vector3();
  /** Um ponto do mundo na tela: saida = { x, y (px), prof (m à frente da câmera) }. */
  function projetar(x, y, z, saida) {
    v.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    saida.prof = -v.z;
    v.applyMatrix4(camera.projectionMatrix);
    saida.x = (v.x * 0.5 + 0.5) * largura;
    saida.y = (0.5 - v.y * 0.5) * altura;
    return saida;
  }

  const entre = (lista, u) => {
    const i = clamp(Math.floor(u), 0, n - 2);
    const f = clamp(u - i);
    return lerp(lista[i] || 0, lista[i + 1] || 0, f * f * (3 - 2 * f));
  };

  /* ---- o quadro ------------------------------------------------------------------- */
  let aceso = 0;
  let alvoAceso = 0;
  let uAnt = null;
  let perdido = false;
  const eixoY = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const ordem = lampadas.map((_, i) => i);
  let zOrdem = 0;
  const maisPerto = (a, b) => Math.abs(lampadas[a].z - zOrdem) - Math.abs(lampadas[b].z - zOrdem);
  let aquecido = false; // o primeiro quadro desenha tudo: os shaders compilam antes de a folha abrir

  function faiscar() {
    const m = maos;
    for (let i = 0; i < m.N_F; i += 1) {
      const a = acaso() * Math.PI * 2;
      const f = 0.6 + acaso() * 1.9;
      m.posF[i * 3] = 0;
      m.posF[i * 3 + 1] = m.y;
      m.posF[i * 3 + 2] = m.z + 0.05;
      m.velF[i * 3] = Math.cos(a) * f;
      m.velF[i * 3 + 1] = Math.sin(a) * f + 0.9;
      m.velF[i * 3 + 2] = (acaso() - 0.3) * 1.2;
    }
    m.vida = 1;
    m.amor = 0.001;
    aoFaiscar?.();
  }

  function quadro(dt, u, t) {
    if (perdido) return;
    if (uAnt === null) uAnt = u;
    const vel = dt > 0 ? ((u - uAnt) * D) / dt : 0; // m/s, positivo para a frente
    uAnt = u;
    aceso += (alvoAceso - aceso) * Math.min(1, dt * 1.6);

    const camZ = -u * D;
    const passo = u * D * 1.9;
    camera.position.set(entre(desvios, u) + Math.sin(t * 0.45) * 0.02, OLHO + Math.sin(passo) * 0.022, camZ);
    camera.rotation.set(Math.sin(t * 0.31) * 0.006 - 0.02, entre(olhares, u) + Math.sin(passo * 0.5) * 0.008, clamp(-vel * 0.004, -0.03, 0.03));
    camera.updateMatrixWorld();

    // Lâmpadas: pêndulo com mola; o vento de quem passa correndo empurra.
    for (const l of lampadas) {
      const perto = Math.abs(l.z - camZ) < 34;
      l.grupo.visible = perto;
      l.poca.visible = perto;
      if (!perto) continue;
      const sopro = clamp(1 - Math.abs(l.z - camZ) / 8) * vel;
      l.vx += (-9 * l.ax - 0.9 * l.vx + sopro * 0.55 + Math.sin(t * 0.9 + l.fase) * 0.18) * dt;
      l.vz += (-9 * l.az - 0.9 * l.vz + Math.cos(t * 0.7 + l.fase * 1.7) * 0.14) * dt;
      l.ax = clamp(l.ax + l.vx * dt, -0.5, 0.5);
      l.az = clamp(l.az + l.vz * dt, -0.4, 0.4);
      l.grupo.rotation.set(l.ax, 0, l.az);
      l.bulbo.set(l.x + Math.sin(l.az) * 0.9, ALT - 0.9 * Math.cos(l.ax) * Math.cos(l.az), l.z - Math.sin(l.ax) * 0.9);
      // A poça anda o triplo do bulbo: é a luz que varre o chão.
      l.poca.position.x = l.x + (l.bulbo.x - l.x) * 3.2;
      l.poca.position.z = l.z + (l.bulbo.z - l.z) * 3.2;
    }
    zOrdem = camZ - 2.5;
    ordem.sort(maisPerto);
    const respira = 1 + Math.sin(t * 1.3) * 0.04;
    for (let i = 0; i < N_LUZES; i += 1) {
      const l = lampadas[ordem[i]];
      luzes[i].position.copy(l.bulbo);
      // Some de mansinho antes de trocar de lâmpada: a troca não se vê.
      luzes[i].intensity = 17 * aceso * respira * suave(15, 10, Math.abs(l.z - camZ + 2.5));
    }
    ceu.intensity = 0.2 + 0.6 * aceso;
    matHalo.opacity = 0.6 * aceso;
    matPoca.opacity = 0.34 * aceso;
    matBulbo.color.setRGB(0.25 + 0.75 * aceso, 0.22 + 0.68 * aceso, 0.18 + 0.54 * aceso, THREE.SRGBColorSpace);

    for (const m of trechos) m.visible = Math.abs(m.position.z - camZ) < 38;

    // A esteira anda para a frente e leva os brinquedos.
    const andou = t * 0.55;
    tLona.offset.y = (andou / 0.7) % 1;
    for (let k2 = 0; k2 < tipos.length; k2 += 1) {
      const tipo = tipos[k2];
      for (let j = 0; j < POR_TIPO; j += 1) {
        const id = j * 3 + k2;
        const p = -(id * PASSO_BRINQ + andou);
        const z = camZ + 7 - ((((camZ + 7 - p) % JANELA) + JANELA) % JANELA);
        const dentro = z < zEstA - 0.4 && z > zEstB + 0.4 ? 1 : 0;
        const e = (tipo.escala || 1) * dentro;
        const pulo = Math.abs(Math.sin(t * 2.6 + id * 1.3)) * 0.035;
        if (k2 === 1) euler.set(-(andou + id) * 3, 0, 0);
        else euler.set(0, Math.sin(t * 0.8 + id) * 0.25 + id, k2 === 2 ? Math.sin(t * 1.4 + id) * 0.12 : 0);
        quat.setFromEuler(euler);
        tipo.malha.setMatrixAt(j, mat4.compose(pos.set(xEst + Math.sin(id * 2.1) * 0.1, yEst + tipo.alto + pulo, z), quat, esc.setScalar(e || 0.0001)));
      }
      tipo.malha.instanceMatrix.needsUpdate = true;
    }
    esc.setScalar(1);

    // O fio respira; a centelha corre à frente.
    matHaloFio.opacity = 0.16 + Math.sin(t * 1.1) * 0.05;
    const fr = clamp((zInicio - (camZ - 3.2 - (Math.sin(t * 0.6) + 1) * 0.6)) / comprimento, 0, 0.999);
    const pc = trilha[Math.floor(fr * (trilha.length - 1))];
    centelha.position.set(pc.x, pc.y + 0.02, pc.z);
    centelha.material.opacity = 0.75 + Math.sin(t * 2.2) * 0.2;

    if (maos) {
      const m = maos;
      const du = u - cenas.maos;
      const alvo = du > -0.3 && du < 0.45 ? 1.06 : 0;
      m.v += ((alvo - m.c) * 46 - m.v * 5.2) * dt;
      m.c += m.v * dt;
      if (m.c > 1) { // encostaram: quicam
        if (m.v > 0.5 && !m.tocou) {
          m.tocou = true;
          faiscar();
        }
        m.c = 1;
        m.v = -m.v * 0.42;
      }
      if (m.c < 0.5) m.tocou = false;
      for (const lado of m.lados) {
        const x = lado.lado * (0.385 + (1 - m.c) * 1.5);
        const yy = m.y + Math.sin(t * 1.5 + lado.lado) * 0.018 + (1 - m.c) * 0.35;
        lado.mao.position.set(x, yy, m.z);
        lado.mao.rotation.z = -lado.lado * ((1 - m.c) * 0.5 + Math.sin(t * 2.1 + lado.lado) * 0.03);
        dir.set(x + lado.lado * 0.24, yy, m.z).sub(lado.monte);
        const comp = dir.length();
        lado.cabo.position.copy(lado.monte).addScaledVector(dir, 0.5);
        lado.cabo.scale.set(1, comp, 1);
        lado.cabo.quaternion.setFromUnitVectors(eixoY, dir.normalize());
      }
      if (m.vida > 0) {
        m.vida = Math.max(0, m.vida - dt * 1.25);
        for (let i = 0; i < m.N_F; i += 1) {
          m.velF[i * 3 + 1] -= 3.4 * dt;
          m.posF[i * 3] += m.velF[i * 3] * dt;
          m.posF[i * 3 + 1] += m.velF[i * 3 + 1] * dt;
          m.posF[i * 3 + 2] += m.velF[i * 3 + 2] * dt;
        }
        m.faiscas.geometry.attributes.position.needsUpdate = true;
        m.matF.opacity = m.vida;
      }
      if (m.amor > 0) { // o coraçãozinho sobe e some
        m.amor = Math.min(1, m.amor + dt * 0.5);
        const pop = 1 - Math.exp(-m.amor * 9) * Math.cos(m.amor * 22);
        m.coracao.scale.setScalar(0.3 * pop);
        m.coracao.position.y = m.y + 0.34 + m.amor * 0.55;
        m.coracao.rotation.y = Math.sin(t * 1.6) * 0.5;
        m.coracaoMat.opacity = 1 - suave(0.55, 1, m.amor);
        if (m.amor >= 1) m.amor = 0;
      }
      // Faíscas apagadas e coração sumido não vão para a placa.
      m.faiscas.visible = !aquecido || m.vida > 0;
      m.coracao.visible = !aquecido || m.amor > 0;
    }

    if (fita) {
      const perto = clamp(1 - Math.abs(fita.grupo.position.z - camZ) / 9);
      fita.v += (-11 * fita.a - 1.1 * fita.v + perto * vel * 0.5 + Math.sin(t * 0.8) * 0.12) * dt;
      fita.a = clamp(fita.a + fita.v * dt, -0.45, 0.45);
      fita.grupo.rotation.x = fita.a;
      fita.corpo.rotation.y = Math.sin(t * 0.6) * 0.16;
    }

    // O portão abre com mola quando ela chega perto.
    const abre = suave(n - 1 - 0.75, n - 1 - 0.1, u) * 1.75;
    portao.v += ((abre - portao.a) * 30 - portao.v * 5) * dt;
    portao.a += portao.v * dt;
    for (const f of folhas) f.pivo.rotation.y = f.lado * Math.max(0, portao.a);
    const aberto = clamp(portao.a / 1.75);
    clarao.material.opacity = aberto * 0.5;
    clarao.scale.setScalar(2 + aberto * 6);
    clarao.visible = !aquecido || aberto > 0.002;
    luzPortao.intensity = aberto * 24 * aceso;

    matPoeira.uniforms.uT.value = t;
    matPoeira.uniforms.uZ.value = camZ;
    matPoeira.uniforms.uForca.value = 0.25 + 0.75 * aceso;
    vigiar();
    renderer.render(cena, camera);
    aquecido = true;
  }

  const aoPerderContexto = (e) => {
    e.preventDefault();
    perdido = true;
    aoPerder?.();
  };
  canvas.addEventListener('webglcontextlost', aoPerderContexto);
  medir();

  return {
    el: canvas,
    medir,
    quadro,
    projetar,
    ancoraFim,
    /** As lâmpadas acendem (a luz cresce devagar). */
    acender() {
      alvoAceso = 1;
      if (!vigia.ligado) { // só com a folha aberta: o desenrolar não conta como quadro lento
        vigia.ligado = true;
        vigia.pular = 45;
      }
    },
    destruir() {
      canvas.removeEventListener('webglcontextlost', aoPerderContexto);
      perdido = true;
      const materiais = new Set();
      const geometrias = new Set();
      cena.traverse((o) => {
        if (o.geometry) geometrias.add(o.geometry);
        for (const m of [].concat(o.material || [])) materiais.add(m);
        if (o.isInstancedMesh) o.dispose();
      });
      for (const g of geometrias) g.dispose();
      for (const m of materiais) m.dispose();
      for (const t of texturas) t.dispose();
      cena.clear();
      renderer.dispose();
      try {
        renderer.forceContextLoss();
      } catch {
        /* o contexto já tinha ido */
      }
      canvas.remove();
    },
  };
}
