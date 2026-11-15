// O fio vermelho como fita 3D que se desenha (contrato 4.7).
//
//   const fio = criarFio(mundo, { curva, largura });
//   fio.objeto              Object3D (fita + sombra); a cena põe em mundo.cena
//   fio.progresso(p)        0..1: quanto do fio já está desenhado (sem argumento, devolve)
//   fio.definirCurva(c)     troca o caminho (pode ser chamado a cada quadro: não aloca)
//   fio.atualizar(dt, t)    opcional: o fio já acompanha o relógio do mundo sozinho
//   fio.dispose()
//
// `curva`: lista de Vector3 (ou { x, y, z }), uma THREE.Curve, ou qualquer objeto
// com getPoint(t, alvo). `largura` em metros; a fita nunca fica mais fina que
// ~1,5 px na tela (aí ela clareia em vez de engrossar) nem mais grossa que ~4 px
// (opção `maxPx`), para ter a mesma bitola do cordão do envelope.
//
// Opções a mais (todas opcionais; sem elas o fio tem a mesma largura de ponta a ponta):
//   larguraInicio, larguraFim   largura nas duas pontas (m), para emendar num cordão mais fino
//   crescerEm, afinarEm         em quantos metros a largura vai de uma à outra (padrão 2 e 1,2)
//   sombra                      false tira a sombra do chão
// Extras do objeto devolvido: fio.comprimento (m), fio.fase(m) (desloca a trança ao
// longo do fio, para ela não escorregar quando o começo anda), fio.opacidade(v),
// e, só no modo leve, fio.elemento (o <svg>).
//
// A fita é montada no espaço da câmera (não deforma em trechos atrás dela), tem
// seção redonda, trança em espinha e uma segunda fita deitada no chão que faz a
// sombra. Trechos no ar balançam de leve; no chão, ficam parados.
//
// Sem WebGL, o fio é um traço SVG de largura variável. Os pontos são dados em
// px de tela ({ px, py } ou { x, y }).

import { clamp, svg, objetoLeve } from '../nucleo/util.js';

const SEGMENTOS = { alto: 384, medio: 320, baixo: 224 };
const SEGMENTOS_LEVE = 120;
// Largura máxima na tela (px CSS): o fio é um só do começo ao fim, com a bitola
// do cordão do envelope (~3 a 4 px). Perto da câmera ele não vira uma fita chapada.
const MAX_PX = 4;

// =============================================================================
// Amostragem: da curva dada para pontos igualmente espaçados, sem alocar
// =============================================================================

/**
 * Guarda uma curva como `seg + 1` pontos igualmente espaçados pelo comprimento.
 * Aceita lista de pontos (Catmull-Rom centrípeta) ou objeto com getPoint(t, alvo).
 */
function criarAmostrador(seg, alvoCurva) {
  const nDenso = seg * 3 + 1;
  const denso = new Float32Array(nDenso * 3);
  const acumulado = new Float32Array(nDenso);
  const pontos = new Float32Array((seg + 1) * 3);
  let controle = new Float32Array(0);
  let cordas = new Float32Array(0);
  const alvo = alvoCurva || { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z || 0; return this; } };

  // Catmull-Rom centrípeta entre o ponto b e o c (a e d são os vizinhos).
  function catmull(a, b, c, d, u, saida, o) {
    const dist = (i, j) => Math.hypot(controle[i] - controle[j], controle[i + 1] - controle[j + 1], controle[i + 2] - controle[j + 2]);
    const t12 = Math.sqrt(dist(b, c));
    if (t12 < 1e-6) { saida[o] = controle[b]; saida[o + 1] = controle[b + 1]; saida[o + 2] = controle[b + 2]; return; }
    let t01 = Math.sqrt(dist(a, b));
    let t23 = Math.sqrt(dist(c, d));
    if (t01 < 1e-6) t01 = t12;
    if (t23 < 1e-6) t23 = t12;
    const t1 = t01;
    const t2 = t1 + t12;
    const t3 = t2 + t23;
    const t = t1 + u * t12;
    for (let k = 0; k < 3; k++) {
      const p0 = controle[a + k]; const p1 = controle[b + k]; const p2 = controle[c + k]; const p3 = controle[d + k];
      const a1 = ((t1 - t) * p0 + t * p1) / t1;
      const a2 = ((t2 - t) * p1 + (t - t1) * p2) / t12;
      const a3 = ((t3 - t) * p2 + (t - t2) * p3) / t23;
      const b1 = ((t2 - t) * a1 + t * a2) / t2;
      const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
      saida[o + k] = ((t2 - t) * b1 + (t - t1) * b2) / t12;
    }
  }

  function deLista(lista) {
    const n = lista.length;
    if (controle.length < (n + 2) * 3) { controle = new Float32Array((n + 2) * 3); cordas = new Float32Array(n); }
    for (let i = 0; i < n; i++) {
      const p = lista[i];
      const o = (i + 1) * 3;
      controle[o] = Number.isFinite(p.px) ? p.px : p.x;
      controle[o + 1] = Number.isFinite(p.py) ? p.py : p.y;
      controle[o + 2] = Number.isFinite(p.px) ? 0 : (p.z || 0);
    }
    // Vizinhos de mentira nas duas pontas (o reflexo do segundo ponto).
    const fim = n * 3;
    for (let k = 0; k < 3; k++) {
      controle[k] = 2 * controle[3 + k] - controle[6 + k];
      controle[fim + 3 + k] = 2 * controle[fim + k] - controle[fim - 3 + k];
    }
    // Distribui as amostras pelo comprimento das cordas: trecho longo ganha mais amostras.
    let total = 0;
    for (let i = 0; i < n - 1; i++) {
      const a = (i + 1) * 3; const b = a + 3;
      cordas[i] = Math.hypot(controle[b] - controle[a], controle[b + 1] - controle[a + 1], controle[b + 2] - controle[a + 2]);
      total += cordas[i];
    }
    let trecho = 0;
    let antes = 0;
    for (let j = 0; j < nDenso; j++) {
      const alvoDist = total * (j / (nDenso - 1));
      while (trecho < n - 2 && antes + cordas[trecho] < alvoDist) { antes += cordas[trecho]; trecho++; }
      const u = cordas[trecho] > 1e-9 ? clamp((alvoDist - antes) / cordas[trecho]) : 0;
      const b = (trecho + 1) * 3;
      catmull(b - 3, b, b + 3, b + 6, u, denso, j * 3);
    }
  }

  function deCurva(curva) {
    for (let j = 0; j < nDenso; j++) {
      const p = curva.getPoint(j / (nDenso - 1), alvo) || alvo;
      denso[j * 3] = p.x; denso[j * 3 + 1] = p.y; denso[j * 3 + 2] = p.z || 0;
    }
  }

  const amostrador = {
    pontos,
    comprimento: 0,
    /** Devolve false se a curva não servir (aí nada muda). */
    definir(c) {
      if (!c) return false;
      if (Array.isArray(c)) {
        if (c.length < 2) return false;
        deLista(c);
      } else if (typeof c.getPoint === 'function') {
        deCurva(c);
      } else {
        return false;
      }
      acumulado[0] = 0;
      for (let j = 1; j < nDenso; j++) {
        const o = j * 3;
        acumulado[j] = acumulado[j - 1] + Math.hypot(denso[o] - denso[o - 3], denso[o + 1] - denso[o - 2], denso[o + 2] - denso[o - 1]);
      }
      const total = acumulado[nDenso - 1];
      amostrador.comprimento = total;
      let j = 0;
      for (let i = 0; i <= seg; i++) {
        const dist = total * (i / seg);
        while (j < nDenso - 2 && acumulado[j + 1] < dist) j++;
        const vao = acumulado[j + 1] - acumulado[j];
        const u = vao > 1e-9 ? clamp((dist - acumulado[j]) / vao) : 0;
        const a = j * 3;
        const o = i * 3;
        pontos[o] = denso[a] + (denso[a + 3] - denso[a]) * u;
        pontos[o + 1] = denso[a + 1] + (denso[a + 4] - denso[a + 1]) * u;
        pontos[o + 2] = denso[a + 2] + (denso[a + 5] - denso[a + 2]) * u;
      }
      return true;
    },
  };
  return amostrador;
}

// =============================================================================
// 3D
// =============================================================================

const COMUM = /* glsl */ `
  uniform float uLargura;
  uniform float uLarguraInicio;
  uniform float uLarguraFim;
  uniform float uCrescer;
  uniform float uAfinar;
  uniform float uComprimento;
  uniform float uProgresso;
  uniform float uPonta;

  // Largura do fio (m) a "s" metros do começo, já com a ponta que se desenha afinando.
  float larguraEm(float s) {
    float l = mix(uLarguraInicio, uLargura, smoothstep(0., uCrescer, s));
    l = mix(l, uLarguraFim, smoothstep(uComprimento - uAfinar, uComprimento, s));
    float atras = uProgresso * uComprimento - s;                 // metros atrás da ponta
    float ponta = mix(1., smoothstep(0., uPonta, atras), step(uProgresso, 0.9995));
    return l * mix(0.12, 1., ponta);
  }
`;

const VERTICE = /* glsl */ `
  attribute vec3 aAnterior;
  attribute vec3 aProximo;
  attribute float aLado;
  attribute float aU;
  attribute float aSolto;

  uniform float uMinPx;
  uniform float uMaxPx;
  uniform float uMargemPx;
  uniform vec2 uTela;
  uniform float uTempo;
  uniform float uVento;
  uniform float uPasso;
  uniform vec3 uLuz;
  ${COMUM}

  varying float vS;
  varying float vLado;
  varying float vProf;
  varying float vMeiaPx;
  varying float vFino;
  varying float vLuzLado;
  varying float vLuzFrente;

  // Vento: só mexe no que está no ar (aSolto vai de 0, no chão ou preso, a 1).
  vec3 balanco(vec3 p, float s, float solto) {
    float a = uVento * solto;
    p.x += (sin(uTempo * 1.13 + s * 2.1) * 0.016 + sin(uTempo * 0.47 + s * 0.9) * 0.014) * a;
    p.y += sin(uTempo * 0.83 + s * 2.9 + 1.7) * 0.006 * a;
    p.z += cos(uTempo * 0.97 + s * 1.6) * 0.010 * a;
    return p;
  }

  void main() {
    float s = aU * uComprimento;
    float passo = uPasso;
    vec4 mv = modelViewMatrix * vec4(balanco(position, s, aSolto), 1.);
    vec3 antes = (modelViewMatrix * vec4(balanco(aAnterior, s - passo, aSolto), 1.)).xyz;
    vec3 depois = (modelViewMatrix * vec4(balanco(aProximo, s + passo, aSolto), 1.)).xyz;

    // Fita voltada para a câmera, montada no espaço da câmera: o lado é
    // perpendicular ao fio e ao raio de visão. Trechos atrás da câmera não deformam.
    vec3 lado = cross(depois - antes, mv.xyz);
    float tamanho = length(lado);
    lado = tamanho > 1e-7 ? lado / tamanho : vec3(1., 0., 0.);

    float prof = max(-mv.z, 0.05);
    float metroPorPx = prof * 2. / (projectionMatrix[1][1] * uTela.y);
    float meiaPx = larguraEm(s) * 0.5 / metroPorPx;               // meia largura real, em px
    float minimo = uMinPx * 0.5;
    vFino = clamp(meiaPx / minimo, 0., 1.);                        // fino demais: clareia em vez de engrossar
    meiaPx = clamp(meiaPx, minimo, uMaxPx * 0.5);               // a mesma bitola do cordão da carta, perto ou longe
    mv.xyz += lado * aLado * (meiaPx + uMargemPx) * metroPorPx;   // a margem é o espaço da borda macia

    vec3 luz = normalize(mat3(viewMatrix) * uLuz);
    vLuzLado = dot(lado, luz);
    vLuzFrente = dot(normalize(-mv.xyz), luz);

    vS = s;
    vLado = aLado;
    vProf = prof;
    vMeiaPx = meiaPx;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENTO = /* glsl */ `
  uniform vec3 uCor;
  uniform vec3 uCorEscura;
  uniform vec3 uCorClara;
  uniform float uProgresso;
  uniform float uComprimento;
  uniform float uMargemPx;
  uniform float uFase;
  uniform float uTranca;
  uniform float uOpacidade;
  uniform vec3 uNevoaCor;
  uniform float uNevoaPerto;
  uniform float uNevoaLonge;

  varying float vS;
  varying float vLado;
  varying float vProf;
  varying float vMeiaPx;
  varying float vFino;
  varying float vLuzLado;
  varying float vLuzFrente;

  void main() {
    if (vS > uProgresso * uComprimento) discard;

    // Borda macia calculada em px (não depende do antialias do aparelho).
    float distPx = abs(vLado) * (vMeiaPx + uMargemPx);
    float cobertura = clamp((vMeiaPx - distPx) / uMargemPx + 0.5, 0., 1.);
    if (cobertura <= 0.003) discard;

    // Seção redonda: v vai de -1 a 1 de um lado ao outro do fio.
    float v = clamp(vLado * (vMeiaPx + uMargemPx) / vMeiaPx, -1., 1.);
    float altura = sqrt(max(0., 1. - v * v));
    float luz = 0.5 + 0.5 * (v * vLuzLado + altura * vLuzFrente);

    // Trança em espinha: os fios descem dos dois lados para o meio. Some com
    // suavidade quando fica menor que um pixel (senão cintila ao longe).
    float fase = (vS + uFase) / uTranca;
    float detalhe = 1. - smoothstep(0.18, 0.62, fwidth(fase));
    float espinha = fract(fase + abs(v) * 0.9);
    float sulco = 1. - smoothstep(0., 0.2, espinha) * (1. - smoothstep(0.8, 1., espinha));
    float meio = 1. - smoothstep(0., 0.16, abs(v));
    float relevo = 1. - detalhe * (0.34 * sulco + 0.2 * meio);

    vec3 cor = mix(uCorEscura, uCor, smoothstep(0.18, 0.86, luz));
    cor *= relevo * (0.84 + 0.16 * altura);
    cor += uCorClara * pow(clamp(luz, 0., 1.), 7.) * 0.2 * detalhe;   // brilho de seda
    cor = mix(uCor, cor, 0.3 + 0.7 * detalhe);                        // ao longe é só "o vermelho do fio"

    float nevoa = smoothstep(uNevoaPerto, uNevoaLonge, vProf);
    cor = mix(cor, uNevoaCor, nevoa);

    gl_FragColor = vec4(cor, cobertura * mix(0.5, 1., vFino) * uOpacidade);
    #include <colorspace_fragment>
  }
`;

// A sombra: a mesma curva, deitada no chão (y = 0), deslocada para longe da luz.
// Quanto mais alto o fio, mais larga, mais fraca e mais afastada ela fica.
const VERTICE_SOMBRA = /* glsl */ `
  attribute vec3 aAnterior;
  attribute vec3 aProximo;
  attribute float aLado;
  attribute float aU;

  uniform vec2 uSombraDir;
  ${COMUM}

  varying float vS;
  varying float vLado;
  varying float vProf;
  varying float vForca;

  vec3 noChao(vec3 p) {
    float h = max(p.y, 0.);
    return vec3(p.x + uSombraDir.x * h + 0.004, 0.0015, p.z + uSombraDir.y * h);
  }

  void main() {
    float s = aU * uComprimento;
    float h = max(position.y, 0.);
    vec3 p = noChao(position);
    vec2 dir = (noChao(aProximo) - noChao(aAnterior)).xz;
    float tamanho = length(dir);
    dir = tamanho > 1e-7 ? dir / tamanho : vec2(0., -1.);
    float largura = larguraEm(s) * (2.6 + h * 5.) + 0.012 + h * 0.05;
    p.xz += vec2(-dir.y, dir.x) * aLado * largura * 0.5;

    vec4 mv = modelViewMatrix * vec4(p, 1.);
    vS = s;
    vLado = aLado;
    vProf = -mv.z;
    // Só sombra de contato: o trecho no ar não projeta um risco solto no chão.
    vForca = exp(-h * 12.) * (1. - smoothstep(0.06, 0.28, h));
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENTO_SOMBRA = /* glsl */ `
  uniform vec3 uCor;
  uniform float uForca;
  uniform float uProgresso;
  uniform float uComprimento;
  uniform float uOpacidade;
  uniform float uNevoaPerto;
  uniform float uNevoaLonge;

  varying float vS;
  varying float vLado;
  varying float vProf;
  varying float vForca;

  void main() {
    float atras = uProgresso * uComprimento - vS;
    if (atras < 0.) discard;
    float borda = 1. - smoothstep(0.05, 1., abs(vLado));
    float alfa = uForca * borda * borda * vForca * smoothstep(0., 0.3, atras);
    alfa *= (1. - smoothstep(uNevoaPerto, uNevoaLonge, vProf)) * uOpacidade;
    if (alfa <= 0.002) discard;
    gl_FragColor = vec4(uCor, alfa);
    #include <colorspace_fragment>
  }
`;

export function criarFio(mundo, opcoes = {}) {
  return mundo.ok ? criarFio3D(mundo, opcoes || {}) : criarFioLeve(mundo, opcoes || {});
}

function criarFio3D(mundo, opcoes) {
  const { THREE } = mundo;
  const largura = opcoes.largura > 0 ? opcoes.largura : 0.012;
  const larguraInicio = opcoes.larguraInicio > 0 ? opcoes.larguraInicio : largura;
  const larguraFim = opcoes.larguraFim > 0 ? opcoes.larguraFim : largura;
  const seg = SEGMENTOS[mundo.amb.nivel] || SEGMENTOS.medio;
  const n = seg + 1;

  const amostrador = criarAmostrador(seg, new THREE.Vector3());

  const posicoes = new Float32Array(n * 2 * 3);
  const anteriores = new Float32Array(n * 2 * 3);
  const proximos = new Float32Array(n * 2 * 3);
  const lados = new Float32Array(n * 2);
  const us = new Float32Array(n * 2);
  const soltos = new Float32Array(n * 2);
  const indices = [];
  for (let i = 0; i < n; i++) {
    lados[i * 2] = -1;
    lados[i * 2 + 1] = 1;
    us[i * 2] = us[i * 2 + 1] = i / seg;
    if (i < seg) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const dinamico = (dados, tamanho) => new THREE.BufferAttribute(dados, tamanho).setUsage(THREE.DynamicDrawUsage);
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', dinamico(posicoes, 3));
  geometria.setAttribute('aAnterior', dinamico(anteriores, 3));
  geometria.setAttribute('aProximo', dinamico(proximos, 3));
  geometria.setAttribute('aSolto', dinamico(soltos, 1));
  geometria.setAttribute('aLado', new THREE.BufferAttribute(lados, 1));
  geometria.setAttribute('aU', new THREE.BufferAttribute(us, 1));
  geometria.setIndex(indices);

  const nevoa = mundo.cena.fog;
  const perto = nevoa ? nevoa.near : 2.5;
  const longe = nevoa ? nevoa.far : 9.5;

  // Uniformes que a fita e a sombra dividem (o mesmo objeto nos dois materiais).
  const comuns = {
    uLargura: { value: largura },
    uLarguraInicio: { value: larguraInicio },
    uLarguraFim: { value: larguraFim },
    uCrescer: { value: opcoes.crescerEm > 0 ? opcoes.crescerEm : 2 },
    uAfinar: { value: opcoes.afinarEm > 0 ? opcoes.afinarEm : 1.2 },
    uComprimento: { value: 1 },
    uProgresso: { value: 0 },
    uPonta: { value: 0.3 },
    uOpacidade: { value: 1 },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTICE,
    fragmentShader: FRAGMENTO,
    uniforms: {
      ...comuns,
      uMinPx: { value: 1.5 },
      uMaxPx: { value: opcoes.maxPx > 0 ? opcoes.maxPx : MAX_PX },
      uMargemPx: { value: 1 },
      uTela: { value: new THREE.Vector2(mundo.tamanho.largura, mundo.tamanho.altura) },
      uTempo: { value: 0 },
      uVento: { value: mundo.amb.reduzido ? 0.35 : 1 },
      uPasso: { value: 0.04 },
      uLuz: { value: new THREE.Vector3(-0.35, 0.72, 0.6).normalize() },
      uCor: { value: new THREE.Color('#d7192d') },
      uCorEscura: { value: new THREE.Color('#8f0b1d') },
      uCorClara: { value: new THREE.Color('#ff8f8a') },
      uFase: { value: 0 },
      uTranca: { value: largura * 1.25 },
      uNevoaCor: { value: nevoa ? nevoa.color : new THREE.Color(0xffffff) },   // acompanha a névoa da cena
      uNevoaPerto: { value: perto },
      uNevoaLonge: { value: longe * 1.2 },      // o fio some um pouco depois de tudo: ele é o caminho
    },
    transparent: true,
    side: THREE.DoubleSide,
  });

  const fita = new THREE.Mesh(geometria, material);
  fita.name = 'fio';
  fita.frustumCulled = false;
  fita.renderOrder = 4;

  const objeto = new THREE.Group();
  objeto.name = 'fio';
  objeto.add(fita);

  let materialSombra = null;
  if (opcoes.sombra !== false) {
    materialSombra = new THREE.ShaderMaterial({
      vertexShader: VERTICE_SOMBRA,
      fragmentShader: FRAGMENTO_SOMBRA,
      uniforms: {
        ...comuns,
        uSombraDir: { value: new THREE.Vector2(0.4, -0.55) },
        uCor: { value: new THREE.Color('#3a1820') },
        uForca: { value: 0.3 },
        uNevoaPerto: { value: perto },
        uNevoaLonge: { value: longe },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const sombra = new THREE.Mesh(geometria, materialSombra);
    sombra.name = 'fio-sombra';
    sombra.frustumCulled = false;
    sombra.renderOrder = 3;
    objeto.add(sombra);
  }

  function ajustarTela(t) {
    material.uniforms.uTela.value.set(t.largura, t.altura);
    material.uniforms.uMargemPx.value = 1 / Math.max(1, t.dpr || 1);
  }
  ajustarTela(mundo.tamanho);
  const pararTamanho = mundo.aoRedimensionar(ajustarTela);

  // O relógio do vento vem do mundo, sem ninguém precisar chamar atualizar().
  const pararQuadro = mundo.aoQuadro((dt, t) => { material.uniforms.uTempo.value = t; });

  function definirCurva(c) {
    if (!amostrador.definir(c)) return;
    const p = amostrador.pontos;
    const total = amostrador.comprimento;
    const ultimo = seg * 3;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const a = i > 0 ? o - 3 : o;
      const d = i < seg ? o + 3 : o;
      // Nas pontas, o vizinho que falta é o reflexo do outro (mantém a direção).
      const ax = i > 0 ? p[a] : 2 * p[0] - p[3];
      const ay = i > 0 ? p[a + 1] : 2 * p[1] - p[4];
      const az = i > 0 ? p[a + 2] : 2 * p[2] - p[5];
      const dx = i < seg ? p[d] : 2 * p[ultimo] - p[ultimo - 3];
      const dy = i < seg ? p[d + 1] : 2 * p[ultimo + 1] - p[ultimo - 2];
      const dz = i < seg ? p[d + 2] : 2 * p[ultimo + 2] - p[ultimo - 1];

      // Quanto este ponto pode balançar: nada no chão, nada perto das pontas presas.
      const s = total * (i / seg);
      const noAr = clamp((p[o + 1] - 0.05) / 0.45);
      const preso = clamp(Math.min(s, total - s) / 0.5);
      const solto = noAr * noAr * (3 - 2 * noAr) * preso;

      for (let k = 0; k < 2; k++) {
        const v = (i * 2 + k) * 3;
        posicoes[v] = p[o]; posicoes[v + 1] = p[o + 1]; posicoes[v + 2] = p[o + 2];
        anteriores[v] = ax; anteriores[v + 1] = ay; anteriores[v + 2] = az;
        proximos[v] = dx; proximos[v + 1] = dy; proximos[v + 2] = dz;
        soltos[i * 2 + k] = solto;
      }
    }
    geometria.attributes.position.needsUpdate = true;
    geometria.attributes.aAnterior.needsUpdate = true;
    geometria.attributes.aProximo.needsUpdate = true;
    geometria.attributes.aSolto.needsUpdate = true;
    comuns.uComprimento.value = Math.max(total, 1e-4);
    material.uniforms.uPasso.value = Math.max(total, 1e-4) / seg;
    comuns.uPonta.value = Math.min(0.3, total * 0.2);
  }
  definirCurva(opcoes.curva);

  return {
    objeto,
    get comprimento() { return amostrador.comprimento; },
    progresso(p) {
      if (p === undefined) return comuns.uProgresso.value;
      comuns.uProgresso.value = clamp(Number(p) || 0);
      return comuns.uProgresso.value;
    },
    definirCurva,
    fase(metros) {
      if (metros !== undefined) material.uniforms.uFase.value = Number(metros) || 0;
      return material.uniforms.uFase.value;
    },
    opacidade(v) {
      if (v !== undefined) comuns.uOpacidade.value = clamp(Number(v) || 0);
      return comuns.uOpacidade.value;
    },
    atualizar(dt, t) {
      if (Number.isFinite(t)) material.uniforms.uTempo.value = t;
    },
    dispose() {
      pararTamanho();
      pararQuadro();
      if (objeto.parent) objeto.parent.remove(objeto);
      geometria.dispose();
      material.dispose();
      if (materialSombra) materialSombra.dispose();
    },
  };
}

// =============================================================================
// Leve (SVG)
// =============================================================================

function criarFioLeve(mundo, opcoes) {
  // Sem viewBox: uma unidade do desenho é um px de tela.
  const desenho = svg(`
    <svg class="fio-leve" aria-hidden="true">
      <path class="fio-leve-sombra"/>
      <path class="fio-leve-fita"/>
    </svg>`);
  const sombra = desenho.querySelector('.fio-leve-sombra');
  const fita = desenho.querySelector('.fio-leve-fita');
  // Estilo no próprio elemento: o fio precisa aparecer mesmo se o CSS da cena não tiver carregado.
  fita.setAttribute('fill', '#d7192d');
  sombra.setAttribute('fill', '#2a1b22');
  sombra.setAttribute('fill-opacity', '0.1');
  mundo.recipienteLeve.append(desenho);

  const seg = SEGMENTOS_LEVE;
  const amostrador = criarAmostrador(seg);
  let atual = 0;
  let padrao = !opcoes.curva;
  // Largura em px ao longo do fio: fina onde sai do pulso, cheia "perto" e
  // afinando para longe (é o que faz as vezes de perspectiva).
  let perfil = Array.isArray(opcoes.perfil) ? opcoes.perfil : [[0, 3], [0.28, 6.5], [1, 1.6]];
  let chao = Number.isFinite(opcoes.sombraDe) ? opcoes.sombraDe : 0.12;
  const maxPx = opcoes.maxPx > 0 ? opcoes.maxPx : MAX_PX;

  function larguraEm(u) {
    for (let i = 1; i < perfil.length; i++) {
      if (u <= perfil[i][0]) {
        const [u0, l0] = perfil[i - 1];
        const [u1, l1] = perfil[i];
        const k = clamp((u - u0) / Math.max(1e-6, u1 - u0));
        return l0 + (l1 - l0) * k * k * (3 - 2 * k);
      }
    }
    return perfil[perfil.length - 1][1];
  }

  function contorno(de, ate, engrossar, dx, dy) {
    const p = amostrador.pontos;
    const total = amostrador.comprimento;
    const esquerda = [];
    const direita = [];
    const ultimo = Math.min(seg, Math.ceil(ate * seg));
    for (let i = Math.floor(de * seg); i <= ultimo; i++) {
      const u = Math.min(ate, i / seg);
      // posição (interpolada no último ponto, para o fio crescer sem saltos)
      const base = Math.min(seg, Math.floor(u * seg));
      const resto = u * seg - base;
      const o = base * 3;
      const o2 = Math.min(seg, base + 1) * 3;
      const x = p[o] + (p[o2] - p[o]) * resto;
      const y = p[o + 1] + (p[o2 + 1] - p[o + 1]) * resto;
      // direção
      const a = Math.max(0, base - 1) * 3;
      const b = Math.min(seg, base + 1) * 3;
      let tx = p[b] - p[a];
      let ty = p[b + 1] - p[a + 1];
      const t = Math.hypot(tx, ty) || 1;
      tx /= t; ty /= t;
      // largura, com a ponta que se desenha afinando
      const atras = (ate - u) * total;
      const ponta = ate >= 0.9995 ? 1 : clamp(atras / 26);
      const meia = Math.min(larguraEm(u), maxPx) * engrossar * 0.5 * (0.15 + 0.85 * ponta * (2 - ponta));
      esquerda.push(`${(x - ty * meia + dx).toFixed(1)} ${(y + tx * meia + dy).toFixed(1)}`);
      direita.push(`${(x + ty * meia + dx).toFixed(1)} ${(y - tx * meia + dy).toFixed(1)}`);
    }
    if (esquerda.length < 2) return '';
    return `M${esquerda.join('L')}L${direita.reverse().join('L')}Z`;
  }

  function desenhar() {
    if (atual <= 0.0005 || amostrador.comprimento <= 0) {
      fita.setAttribute('d', '');
      sombra.setAttribute('d', '');
      return;
    }
    fita.setAttribute('d', contorno(0, atual, 1, 0, 0));
    sombra.setAttribute('d', atual > chao ? contorno(chao, atual, 2.6, 2, 3) : '');
  }

  function tracarPadrao() {
    const l = Math.max(1, mundo.tamanho.largura);
    const a = Math.max(1, mundo.tamanho.altura);
    // Entra pelo pé da tela e sobe, em curvas, até logo abaixo do meio (onde a carta fica).
    amostrador.definir([
      { x: l * 0.56, y: a * 1.04 }, { x: l * 0.4, y: a * 0.84 }, { x: l * 0.6, y: a * 0.7 },
      { x: l * 0.47, y: a * 0.6 }, { x: l * 0.5, y: a * 0.55 },
    ]);
  }

  if (padrao) tracarPadrao();
  else amostrador.definir(opcoes.curva);
  desenhar();

  const pararTamanho = mundo.aoRedimensionar(() => {
    if (!padrao) return;                      // quem deu a curva em px é quem a refaz
    tracarPadrao();
    desenhar();
  });

  return {
    objeto: objetoLeve(),
    elemento: desenho,
    get comprimento() { return amostrador.comprimento; },
    progresso(p) {
      if (p === undefined) return atual;
      const novo = clamp(Number(p) || 0);
      if (novo !== atual) { atual = novo; desenhar(); }
      return atual;
    },
    definirCurva(c, extras) {
      if (extras && Array.isArray(extras.perfil)) perfil = extras.perfil;
      if (extras && Number.isFinite(extras.sombraDe)) chao = extras.sombraDe;
      if (!amostrador.definir(c)) return;
      padrao = false;
      desenhar();
    },
    fase() { return 0; },
    opacidade(v) {
      if (v !== undefined) desenho.style.opacity = String(clamp(Number(v) || 0));
      return desenho.style.opacity === '' ? 1 : Number(desenho.style.opacity);
    },
    atualizar() {},
    dispose() { pararTamanho(); desenho.remove(); },
  };
}
