// Pétalas (WebGL): uma malha instanciada que cai numa caixa em volta da câmera,
// mais um pequeno estoque de pétalas soltas para as rajadas.
//
//   petalas.rajada(posMundo, n)     pétalas que saltam de um ponto do mundo
//   petalas.definirDensidade(k)     0..1 (0 = nenhuma, 1 = todas); muda devagar
//   petalas.atualizar(dt, t)        chamado pelo mundo a cada quadro
//   petalas.objeto                  Object3D (já está na cena)
//   petalas.dispose()
//
// Versão do esqueleto: forma e movimento simples. A assinatura acima não muda.

import { clamp, amortecer } from '../nucleo/util.js';

const QUANTIDADE = { alto: 320, medio: 200, baixo: 110 };
const ESTOQUE_RAJADA = 96;

const VERTICE = /* glsl */ `
  attribute vec3 aSemente;   // posição inicial na caixa (0..1)
  attribute vec4 aFase;      // x: fase do giro, y: velocidade do giro, z: fase do vaivém, w: tamanho/peso
  attribute float aTom;      // mistura entre as duas cores
  attribute float aSorte;    // 0..1, para ligar/desligar pela densidade

  uniform float uTempo;
  uniform vec3 uCaixa;
  uniform float uDensidade;
  uniform float uQueda;
  uniform vec2 uVento;
  uniform float uTamanho;

  varying vec2 vUv;
  varying float vTom;
  varying float vProf;
  varying float vLuz;

  mat3 girarX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
  mat3 girarY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
  mat3 girarZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }

  void main() {
    vUv = uv;
    vTom = aTom;

    float peso = 0.6 + aFase.w * 0.8;

    // Deriva: cai, é levada pelo vento e balança de lado.
    vec3 p = aSemente * uCaixa;
    p.y -= uTempo * uQueda * peso;
    p.x += uTempo * uVento.x + sin(uTempo * 0.55 + aFase.z * 6.2831) * 0.28;
    p.z += uTempo * uVento.y + cos(uTempo * 0.4 + aFase.z * 6.2831) * 0.12;

    // A caixa acompanha a câmera: a pétala que sai por um lado volta pelo outro.
    vec3 centro = cameraPosition + vec3(0., 0.5, -uCaixa.z * 0.44);
    p = mod(p - centro + uCaixa * 0.5, uCaixa) - uCaixa * 0.5 + centro;

    // Some com suavidade nas bordas de cima e de baixo da caixa (sem estalo).
    float borda = smoothstep(0., 0.6, uCaixa.y * 0.5 - abs(p.y - centro.y));

    float a = uTempo * aFase.y + aFase.x * 6.2831;
    vec3 local = position;
    local.z += (local.x * local.x - 0.08) * 0.9;          // pétala levemente em concha
    float visivel = step(aSorte, uDensidade);
    local *= uTamanho * (0.7 + aFase.w * 0.9) * visivel * borda;
    mat3 giro = girarY(a * 0.7 + aFase.z * 3.) * girarX(a) * girarZ(aFase.x * 6.2831 + a * 0.3);
    local = giro * local;

    vLuz = abs((giro * vec3(0., 0., 1.)).z);              // de frente = mais clara
    vec4 mv = viewMatrix * vec4(p + local, 1.);
    vProf = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const VERTICE_RAJADA = /* glsl */ `
  attribute vec3 aPos;
  attribute vec4 aDados;     // x: ângulo, y: tamanho, z: opacidade, w: tom

  varying vec2 vUv;
  varying float vTom;
  varying float vProf;
  varying float vLuz;
  varying float vOpacidade;

  mat3 girarX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
  mat3 girarZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }

  void main() {
    vUv = uv;
    vTom = aDados.w;
    vOpacidade = aDados.z;
    vec3 local = position;
    local.z += (local.x * local.x - 0.08) * 0.9;
    local *= aDados.y;
    mat3 giro = girarX(aDados.x * 1.3) * girarZ(aDados.x);
    local = giro * local;
    vLuz = abs((giro * vec3(0., 0., 1.)).z);
    vec4 mv = viewMatrix * vec4(aPos + local, 1.);
    vProf = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENTO = /* glsl */ `
  uniform vec3 uCor1;
  uniform vec3 uCor2;
  uniform vec3 uNevoaCor;
  uniform float uNevoaPerto;
  uniform float uNevoaLonge;

  varying vec2 vUv;
  varying float vTom;
  varying float vProf;
  varying float vLuz;
  #ifdef RAJADA
  varying float vOpacidade;
  #endif

  void main() {
    // Forma de pétala: gota mais larga embaixo, com a ponta em cima.
    vec2 q = vUv * 2. - 1.;
    float d = length(vec2(q.x * (1.25 + 0.55 * q.y), q.y * 0.96));

    // Perto da câmera a borda amolece (parece fora de foco) e a pétala fica translúcida.
    float perto = 1. - smoothstep(0.35, 1.7, vProf);
    float maciez = mix(0.06, 0.55, perto);
    float alfa = 1. - smoothstep(0.92 - maciez, 0.92, d);
    alfa *= mix(1., 0.55, perto) * smoothstep(0.08, 0.3, vProf);

    vec3 cor = mix(uCor1, uCor2, vTom) * (0.82 + 0.26 * vLuz);
    cor += (1. - d) * 0.06;                                  // miolo um pouco mais claro

    float nevoa = smoothstep(uNevoaPerto, uNevoaLonge, vProf);
    cor = mix(cor, uNevoaCor, nevoa);
    alfa *= 1. - nevoa * 0.85;
    #ifdef RAJADA
    alfa *= vOpacidade;
    #endif

    if (alfa < 0.01) discard;
    gl_FragColor = vec4(cor, alfa);
    #include <colorspace_fragment>
  }
`;

export function criarPetalas(mundo, amb) {
  const { THREE, cena, camera } = mundo;

  // ---- geometria-base: um plano pequeno, com subdivisão para a concha -----------
  const base = new THREE.PlaneGeometry(1, 1, 2, 2);

  const uniformesComuns = () => ({
    uCor1: { value: new THREE.Color('#b3123a') },
    uCor2: { value: new THREE.Color('#d7264f') },
    uNevoaCor: { value: new THREE.Color(0xffffff) },
    uNevoaPerto: { value: 3.0 },
    uNevoaLonge: { value: 11.0 },
  });

  // ---- chuva de pétalas ---------------------------------------------------------
  const maximo = QUANTIDADE.alto;
  const geometria = new THREE.InstancedBufferGeometry();
  geometria.index = base.index;
  geometria.setAttribute('position', base.getAttribute('position'));
  geometria.setAttribute('uv', base.getAttribute('uv'));

  const sementes = new Float32Array(maximo * 3);
  const fases = new Float32Array(maximo * 4);
  const tons = new Float32Array(maximo);
  const sortes = new Float32Array(maximo);
  for (let i = 0; i < maximo; i++) {
    sementes[i * 3] = Math.random();
    sementes[i * 3 + 1] = Math.random();
    sementes[i * 3 + 2] = Math.random();
    fases[i * 4] = Math.random();
    fases[i * 4 + 1] = (0.5 + Math.random() * 1.6) * (Math.random() < 0.5 ? -1 : 1);
    fases[i * 4 + 2] = Math.random();
    fases[i * 4 + 3] = Math.random();
    tons[i] = Math.random();
    sortes[i] = Math.random();
  }
  geometria.setAttribute('aSemente', new THREE.InstancedBufferAttribute(sementes, 3));
  geometria.setAttribute('aFase', new THREE.InstancedBufferAttribute(fases, 4));
  geometria.setAttribute('aTom', new THREE.InstancedBufferAttribute(tons, 1));
  geometria.setAttribute('aSorte', new THREE.InstancedBufferAttribute(sortes, 1));
  geometria.instanceCount = QUANTIDADE[amb.nivel] || QUANTIDADE.medio;

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTICE,
    fragmentShader: FRAGMENTO,
    uniforms: {
      ...uniformesComuns(),
      uTempo: { value: 0 },
      uCaixa: { value: new THREE.Vector3(7, 6, 11) },
      uDensidade: { value: 0 },
      uQueda: { value: amb.reduzido ? 0.14 : 0.3 },
      uVento: { value: new THREE.Vector2(amb.reduzido ? 0.04 : 0.1, 0.03) },
      uTamanho: { value: 0.06 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const chuva = new THREE.Mesh(geometria, material);
  chuva.frustumCulled = false;
  chuva.renderOrder = 5;

  // ---- rajada: estoque de pétalas simuladas na CPU --------------------------------
  const geoRajada = new THREE.InstancedBufferGeometry();
  geoRajada.index = base.index;
  geoRajada.setAttribute('position', base.getAttribute('position'));
  geoRajada.setAttribute('uv', base.getAttribute('uv'));
  const rPos = new Float32Array(ESTOQUE_RAJADA * 3);
  const rDados = new Float32Array(ESTOQUE_RAJADA * 4);
  const atribPos = new THREE.InstancedBufferAttribute(rPos, 3).setUsage(THREE.DynamicDrawUsage);
  const atribDados = new THREE.InstancedBufferAttribute(rDados, 4).setUsage(THREE.DynamicDrawUsage);
  geoRajada.setAttribute('aPos', atribPos);
  geoRajada.setAttribute('aDados', atribDados);
  geoRajada.instanceCount = ESTOQUE_RAJADA;

  const matRajada = new THREE.ShaderMaterial({
    vertexShader: VERTICE_RAJADA,
    fragmentShader: FRAGMENTO,
    defines: { RAJADA: '' },
    uniforms: uniformesComuns(),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const rajadas = new THREE.Mesh(geoRajada, matRajada);
  rajadas.frustumCulled = false;
  rajadas.renderOrder = 6;
  rajadas.visible = false;

  const soltas = Array.from({ length: ESTOQUE_RAJADA }, () => ({
    viva: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, idade: 0, vida: 1, giro: 0, vGiro: 0, tam: 0.05, tom: 0,
  }));
  let vivas = 0;
  let cursor = 0;

  const objeto = new THREE.Group();
  objeto.name = 'petalas';
  objeto.add(chuva, rajadas);
  cena.add(objeto);

  // ---- densidade e caixa ----------------------------------------------------------
  const tetoDensidade = amb.reduzido ? 0.22 : 1;
  let densidadeAlvo = 1;

  function ajustarCaixa() {
    // A caixa precisa ser mais larga que o que a câmera vê lá no fundo (telas deitadas).
    const fundo = material.uniforms.uCaixa.value.z;
    const larguraVista = 2 * Math.tan((camera.fov * Math.PI) / 360) * fundo * camera.aspect;
    material.uniforms.uCaixa.value.x = Math.max(7, larguraVista * 1.05);
  }
  ajustarCaixa();
  const pararTamanho = mundo.aoRedimensionar(ajustarCaixa);
  const pararNivel = mundo.aoMudarNivel((nivel) => {
    geometria.instanceCount = QUANTIDADE[nivel] || QUANTIDADE.baixo;
  });

  const petalas = {
    objeto,

    definirDensidade(k) {
      densidadeAlvo = clamp(Number(k) || 0);
    },

    rajada(posMundo, n = 12) {
      if (!posMundo) return;
      const quantas = Math.min(amb.reduzido ? Math.ceil(n / 3) : n, ESTOQUE_RAJADA);
      for (let i = 0; i < quantas; i++) {
        const p = soltas[cursor];
        cursor = (cursor + 1) % ESTOQUE_RAJADA;
        const angulo = Math.random() * Math.PI * 2;
        const forca = 0.5 + Math.random() * 1.3;
        if (!p.viva) vivas++;
        p.viva = true;
        p.x = posMundo.x; p.y = posMundo.y; p.z = posMundo.z;
        p.vx = Math.cos(angulo) * forca;
        p.vy = Math.sin(angulo) * forca * 0.8 + 0.7;
        p.vz = 0.3 + Math.random() * 1.1;                  // saltam um pouco na direção dela
        p.idade = 0;
        p.vida = 1.6 + Math.random() * 1.4;
        p.giro = Math.random() * 6.28;
        p.vGiro = (Math.random() - 0.5) * 9;
        p.tam = 0.035 + Math.random() * 0.035;
        p.tom = Math.random();
      }
      rajadas.visible = true;
    },

    atualizar(dt, t) {
      const u = material.uniforms;
      u.uTempo.value = t;
      u.uDensidade.value = amortecer(u.uDensidade.value, densidadeAlvo * tetoDensidade, 0.9, dt);

      if (!vivas) {
        if (rajadas.visible) rajadas.visible = false;
        return;
      }
      const arrasto = Math.exp(-2.2 * dt);
      for (let i = 0; i < ESTOQUE_RAJADA; i++) {
        const p = soltas[i];
        if (!p.viva) { rDados[i * 4 + 1] = 0; continue; }
        p.idade += dt;
        if (p.idade >= p.vida) {
          p.viva = false;
          vivas--;
          rDados[i * 4 + 1] = 0;
          continue;
        }
        p.vx *= arrasto; p.vy = p.vy * arrasto - 0.55 * dt; p.vz *= arrasto;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.giro += p.vGiro * dt;
        rPos[i * 3] = p.x; rPos[i * 3 + 1] = p.y; rPos[i * 3 + 2] = p.z;
        rDados[i * 4] = p.giro;
        rDados[i * 4 + 1] = p.tam;
        rDados[i * 4 + 2] = 1 - clamp((p.idade / p.vida - 0.6) / 0.4);
        rDados[i * 4 + 3] = p.tom;
      }
      atribPos.needsUpdate = true;
      atribDados.needsUpdate = true;
    },

    dispose() {
      pararTamanho();
      pararNivel();
      cena.remove(objeto);
      geometria.dispose();
      geoRajada.dispose();
      base.dispose();
      material.dispose();
      matRajada.dispose();
    },
  };

  return petalas;
}
