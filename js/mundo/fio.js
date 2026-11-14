// O fio vermelho como fita 3D que se desenha (contrato 4.7).
//
//   const fio = criarFio(mundo, { curva, largura });
//   fio.objeto              Object3D; a cena põe em mundo.cena
//   fio.progresso(p)        0..1: quanto do fio já está desenhado (sem argumento, devolve)
//   fio.definirCurva(c)     troca o caminho
//   fio.atualizar(dt, t)
//   fio.dispose()
//
// `curva` pode ser uma lista de Vector3 (ou { x, y, z }) ou uma THREE.Curve.
// `largura` em metros; a fita nunca fica mais fina que ~2 px na tela.
//
// Sem WebGL, o fio é um traço SVG que sobe do pé da tela até o meio.
// Versão do esqueleto: fita de cor chapada com listras; sem sombra no chão.

import { clamp, svg, objetoLeve } from '../nucleo/util.js';

const SEGMENTOS = 220;

const VERTICE = /* glsl */ `
  attribute vec3 aAnterior;
  attribute vec3 aProximo;
  attribute float aLado;
  attribute float aU;

  uniform float uLargura;
  uniform float uMinPx;
  uniform vec2 uTela;

  varying float vU;
  varying float vLado;
  varying float vProf;

  void main() {
    vU = aU;
    vLado = aLado;
    mat4 pv = projectionMatrix * modelViewMatrix;
    vec4 atual = pv * vec4(position, 1.);
    vec4 antes = pv * vec4(aAnterior, 1.);
    vec4 depois = pv * vec4(aProximo, 1.);

    float aspecto = uTela.x / uTela.y;
    vec2 a = antes.xy / max(antes.w, 0.0001);
    vec2 b = depois.xy / max(depois.w, 0.0001);
    vec2 dir = (b - a) * vec2(aspecto, 1.);
    dir = length(dir) > 0.00001 ? normalize(dir) : vec2(1., 0.);
    vec2 normal = vec2(-dir.y, dir.x);
    normal.x /= aspecto;

    // Largura em NDC: a do mundo, projetada, com um mínimo em pixels.
    float larguraNdc = max(uLargura * projectionMatrix[1][1] / max(atual.w, 0.0001), uMinPx * 2. / uTela.y);
    atual.xy += normal * aLado * larguraNdc * 0.5 * atual.w;

    vProf = atual.w;
    gl_Position = atual;
  }
`;

const FRAGMENTO = /* glsl */ `
  uniform vec3 uCor;
  uniform vec3 uCorEscura;
  uniform float uProgresso;
  uniform float uComprimento;
  uniform vec3 uNevoaCor;
  uniform float uNevoaPerto;
  uniform float uNevoaLonge;

  varying float vU;
  varying float vLado;
  varying float vProf;

  void main() {
    if (vU > uProgresso) discard;

    // Trança simples: listras diagonais ao longo do comprimento.
    float tranca = sin((vU * uComprimento) * 90. + vLado * 2.2);
    vec3 cor = mix(uCorEscura, uCor, 0.62 + 0.38 * tranca);
    cor *= 1. - 0.18 * abs(vLado);                      // bordas um pouco mais escuras: dá volume

    float nevoa = smoothstep(uNevoaPerto, uNevoaLonge, vProf);
    cor = mix(cor, uNevoaCor, nevoa * 0.92);

    gl_FragColor = vec4(cor, 1.);
    #include <colorspace_fragment>
  }
`;

export function criarFio(mundo, opcoes = {}) {
  return mundo.ok ? criarFio3D(mundo, opcoes) : criarFioLeve(mundo, opcoes);
}

function criarFio3D(mundo, { curva, largura = 0.012 } = {}) {
  const { THREE } = mundo;
  const n = SEGMENTOS + 1;

  const posicoes = new Float32Array(n * 2 * 3);
  const anteriores = new Float32Array(n * 2 * 3);
  const proximos = new Float32Array(n * 2 * 3);
  const lados = new Float32Array(n * 2);
  const us = new Float32Array(n * 2);
  const indices = [];
  for (let i = 0; i < n; i++) {
    lados[i * 2] = -1;
    lados[i * 2 + 1] = 1;
    us[i * 2] = us[i * 2 + 1] = i / SEGMENTOS;
    if (i < SEGMENTOS) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
  geometria.setAttribute('aAnterior', new THREE.BufferAttribute(anteriores, 3));
  geometria.setAttribute('aProximo', new THREE.BufferAttribute(proximos, 3));
  geometria.setAttribute('aLado', new THREE.BufferAttribute(lados, 1));
  geometria.setAttribute('aU', new THREE.BufferAttribute(us, 1));
  geometria.setIndex(indices);

  const nevoa = mundo.cena.fog;
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTICE,
    fragmentShader: FRAGMENTO,
    uniforms: {
      uLargura: { value: largura },
      uMinPx: { value: 2 },
      uTela: { value: new THREE.Vector2(mundo.tamanho.largura, mundo.tamanho.altura) },
      uCor: { value: new THREE.Color('#d7192d') },
      uCorEscura: { value: new THREE.Color('#a80f22') },
      uProgresso: { value: 0 },
      uComprimento: { value: 1 },
      uNevoaCor: { value: new THREE.Color(0xffffff) },
      uNevoaPerto: { value: nevoa ? nevoa.near : 3 },
      uNevoaLonge: { value: nevoa ? nevoa.far : 10 },
    },
    side: THREE.DoubleSide,
  });

  const objeto = new THREE.Mesh(geometria, material);
  objeto.name = 'fio';
  objeto.frustumCulled = false;
  objeto.renderOrder = 4;

  const pararTamanho = mundo.aoRedimensionar((t) => material.uniforms.uTela.value.set(t.largura, t.altura));

  function definirCurva(c) {
    if (!c) return;
    let caminho = c;
    if (Array.isArray(c)) {
      if (c.length < 2) return;
      caminho = new THREE.CatmullRomCurve3(c.map((p) => new THREE.Vector3(p.x, p.y, p.z)), false, 'centripetal');
    }
    const pontos = caminho.getSpacedPoints(SEGMENTOS);
    for (let i = 0; i < n; i++) {
      const p = pontos[i];
      const antes = pontos[Math.max(0, i - 1)];
      const depois = pontos[Math.min(n - 1, i + 1)];
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 3;
        posicoes[o] = p.x; posicoes[o + 1] = p.y; posicoes[o + 2] = p.z;
        anteriores[o] = antes.x; anteriores[o + 1] = antes.y; anteriores[o + 2] = antes.z;
        proximos[o] = depois.x; proximos[o + 1] = depois.y; proximos[o + 2] = depois.z;
      }
    }
    geometria.attributes.position.needsUpdate = true;
    geometria.attributes.aAnterior.needsUpdate = true;
    geometria.attributes.aProximo.needsUpdate = true;
    material.uniforms.uComprimento.value = caminho.getLength();
  }
  definirCurva(curva);

  return {
    objeto,
    progresso(p) {
      if (p === undefined) return material.uniforms.uProgresso.value;
      material.uniforms.uProgresso.value = clamp(p);
      return material.uniforms.uProgresso.value;
    },
    definirCurva,
    atualizar() {},
    dispose() {
      pararTamanho();
      if (objeto.parent) objeto.parent.remove(objeto);
      geometria.dispose();
      material.dispose();
    },
  };
}

function criarFioLeve(mundo) {
  // O desenho usa px de tela (viewBox = tamanho da janela): assim o traço tem
  // espessura constante e o tracejado do "desenhar" bate com o comprimento real.
  const desenho = svg(`
    <svg class="fio-leve" aria-hidden="true">
      <path fill="none" stroke="#d7192d" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`);
  const traco = desenho.querySelector('path');
  mundo.recipienteLeve.append(desenho);
  let atual = 0;
  let comprimento = 1;

  function aplicar() {
    traco.setAttribute('stroke-dasharray', `${comprimento} ${comprimento + 8}`);
    traco.setAttribute('stroke-dashoffset', String(comprimento * (1 - atual)));
    traco.style.visibility = atual > 0 ? '' : 'hidden';      // sem a ponta arredondada sobrando no zero
  }

  function tracar() {
    const l = Math.max(1, mundo.tamanho.largura);
    const a = Math.max(1, mundo.tamanho.altura);
    const x = (k) => (l * k).toFixed(1);
    const y = (k) => (a * k).toFixed(1);
    desenho.setAttribute('viewBox', `0 0 ${l} ${a}`);
    // Sobe do pé da tela, em curvas, até logo abaixo do meio (onde a carta fica).
    traco.setAttribute('d',
      `M${x(0.5)} ${y(1.02)} C ${x(0.38)} ${y(0.82)}, ${x(0.62)} ${y(0.7)}, ${x(0.5)} ${y(0.56)} S ${x(0.44)} ${y(0.4)}, ${x(0.5)} ${y(0.3)}`);
    comprimento = traco.getTotalLength ? Math.max(1, traco.getTotalLength()) : a;
    aplicar();
  }
  tracar();
  const pararTamanho = mundo.aoRedimensionar(tracar);

  return {
    objeto: objetoLeve(),
    progresso(p) {
      if (p === undefined) return atual;
      atual = clamp(p);
      aplicar();
      return atual;
    },
    definirCurva() {},
    atualizar() {},
    dispose() { pararTamanho(); desenho.remove(); },
  };
}
