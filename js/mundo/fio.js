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
// A luz do fio (todas existem nas duas variantes; chame com ?.):
//   fio.acender(v)            brilho de dentro do fio inteiro (0..1)
//   fio.respirar(k)           de tempos em tempos acende devagar e apaga (0 desliga)
//   fio.rastro(v)             rastro de luz atrás da ponta que se desenha
//   fio.estrela(v, taxa)      estrela na ponta que se desenha, soltando `taxa` brasas/s
//   fio.pulso({ de, ate, duracao, forca, largura, brasas }) → Promise   luz que corre pelo fio
//   fio.pontoEm(u, saida)     ponto do fio a uma fração u (sem u: a ponta atual)
//   fio.faiscar(ponto, n)     poeira de luz que se solta de um ponto
// Movimento reduzido: sem estrela e sem brasas; o pulso vira o fio inteiro acendendo.
//
// O fio é de algodão torcido: três pernas em hélice com sulco, brilho especular
// que corre com a torção (e pisca quando uma perna pega a luz), borda mais clara
// e quente contra a luz (translucidez), penugem de fibras soltas de perto.
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
  let raizes = new Float64Array(0);      // raizes[i] = raiz da distância entre os controles i e i + 1
  const alvo = alvoCurva || { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z || 0; return this; } };

  // Catmull-Rom centrípeta entre o ponto b e o c (a e d são os vizinhos).
  // Os nós (raiz da distância entre vizinhos) vêm prontos de deLista(): são os
  // mesmos para todas as amostras de um trecho (antes eram refeitos a cada uma,
  // ~1150 vezes por curva). Mesmas contas, na mesma ordem: resultado idêntico.
  function catmull(a, b, c, d, u, saida, o) {
    const t12 = raizes[b / 3];
    if (t12 < 1e-6) { saida[o] = controle[b]; saida[o + 1] = controle[b + 1]; saida[o + 2] = controle[b + 2]; return; }
    let t01 = raizes[a / 3];
    let t23 = raizes[c / 3];
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
    if (controle.length < (n + 2) * 3) { controle = new Float32Array((n + 2) * 3); cordas = new Float32Array(n); raizes = new Float64Array(n + 1); }
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
    // nós da centrípeta (ver catmull)
    for (let i = 0; i <= n; i++) {
      const a = i * 3; const b = a + 3;
      raizes[i] = Math.sqrt(Math.hypot(controle[a] - controle[b], controle[a + 1] - controle[b + 1], controle[a + 2] - controle[b + 2]));
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
  uniform float uAceso;     // brilho de dentro do fio inteiro (0..1)
  uniform float uPulsoS;    // onde está o pulso de luz que corre pelo fio (m)
  uniform float uPulsoK;    // força do pulso
  uniform float uPulsoL;    // comprimento do pulso (m)
  uniform float uRastro;    // rastro que a ponta deixa enquanto se desenha

  // Quanto o fio brilha por dentro a "s" metros do começo.
  float brilhoEm(float s) {
    float d = (s - uPulsoS) / uPulsoL;
    float pulso = uPulsoK * exp(-d * d);
    float atras = uProgresso * uComprimento - s;
    float rastro = uRastro * exp(-max(atras, 0.) / 1.6) * step(-0.02, atras);
    return clamp(uAceso + pulso + rastro, 0., 1.5);
  }

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
  uniform float uHaloPx;
  uniform float uFuzzPx;
  ${COMUM}

  varying float vS;
  varying float vLado;
  varying float vProf;
  varying float vMeiaPx;
  varying float vFino;
  varying float vLuzLado;
  varying float vLuzFrente;
  varying float vBrilho;
  varying float vExtraPx;
  varying float vPerto;

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
    // perto: o fio de verdade seria mais largo que a bitola; é aí que a penugem aparece
    vPerto = smoothstep(0.55, 1.1, meiaPx / (uMaxPx * 0.5));
    meiaPx = clamp(meiaPx, minimo, uMaxPx * 0.5);               // a mesma bitola do cordão da carta, perto ou longe
    vBrilho = brilhoEm(s);
    // espaço além da borda: a penugem (de perto) e o halo quando o fio acende
    vExtraPx = uFuzzPx * vPerto + uHaloPx * min(vBrilho, 1.);
    mv.xyz += lado * aLado * (meiaPx + uMargemPx + vExtraPx) * metroPorPx;   // a margem é o espaço da borda macia

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
  uniform float uTempo;
  uniform float uHaloPx;
  uniform float uFuzzPx;
  uniform vec3 uCorQuente;    // a luz de dentro (ouro morno)
  uniform vec3 uCorHalo;      // o halo em volta (rosa-ouro)
  uniform vec3 uCorTrans;     // vermelho atravessado pela luz (bordas contra a luz)

  varying float vS;
  varying float vLado;
  varying float vProf;
  varying float vMeiaPx;
  varying float vFino;
  varying float vLuzLado;
  varying float vLuzFrente;
  varying float vBrilho;
  varying float vExtraPx;
  varying float vPerto;

  float acaso(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

  void main() {
    if (vS > uProgresso * uComprimento) discard;

    // Borda macia calculada em px (não depende do antialias do aparelho).
    float total = vMeiaPx + uMargemPx + vExtraPx;
    float distPx = abs(vLado) * total;
    float cobertura = clamp((vMeiaPx - distPx) / uMargemPx + 0.5, 0., 1.);
    float fora = max(distPx - vMeiaPx, 0.);

    // Penugem: fibrinhas soltas que escapam da torção (só de perto, e somem
    // antes de cintilar quando ficam menores que um pixel).
    float fuzz = 0.;
    float fuzzPx = uFuzzPx * vPerto;
    if (fuzzPx > 0.05 && fora > 0.) {
      float hs = vS / 0.0021 + sign(vLado) * 31.;
      float id = floor(hs);
      float h = acaso(id);
      float comp = (0.25 + 0.75 * h * h) * fuzzPx;
      float inclina = (acaso(id + 7.) - 0.5) * 0.9;
      float d = abs(fract(hs) - 0.5 - inclina * fora / fuzzPx);
      float fio = (1. - smoothstep(0.05, 0.15, d)) * (1. - smoothstep(comp * 0.6, comp, fora));
      float penugem = 0.16 * exp(-fora / 0.6);
      fuzz = max(fio * 0.5 * step(0.35, h), penugem) * (1. - smoothstep(0.35, 0.9, fwidth(hs)));
    }
    // Halo: a luz que vaza quando o fio acende.
    float halo = 0.;
    if (vBrilho > 0.002 && uHaloPx > 0.) {
      float b = min(vBrilho, 1.);
      halo = b * (0.55 * exp(-fora / max(uHaloPx * 0.22, 0.5)) + 0.35 * exp(-fora / max(uHaloPx * 0.6, 0.8)));
      halo *= 1. - smoothstep(uHaloPx * b * 0.75, uHaloPx * b + 0.01, fora);
    }
    if (cobertura <= 0.003 && fuzz < 0.004 && halo < 0.004) discard;

    // Seção redonda: v vai de -1 a 1 de um lado ao outro do fio.
    float v = clamp(vLado * total / vMeiaPx, -1., 1.);
    float altura = sqrt(max(0., 1. - v * v));
    float luz = 0.5 + 0.5 * (v * vLuzLado + altura * vLuzFrente);

    // Torção: três pernas que sobem em hélice (listras inclinadas, sempre para
    // o mesmo lado), com o sulco escuro entre elas. Some com suavidade quando
    // fica menor que um pixel (senão cintila ao longe).
    float fase = (vS + uFase) / uTranca;
    float detalhe = 1. - smoothstep(0.18, 0.62, fwidth(fase));
    float w = fase + v * 0.62;
    float f = fract(w);
    float sulco = 1. - smoothstep(0., 0.2, f) * (1. - smoothstep(0.8, 1., f));
    float bojo = sin(3.14159 * f);
    float relevo = 1. - detalhe * (0.4 * sulco - 0.08 * bojo);

    vec3 cor = mix(uCorEscura, uCor, smoothstep(0.18, 0.86, luz));
    cor *= relevo * (0.84 + 0.16 * altura);
    // brilho especular de cada perna: corre junto com a torção
    float faixa = exp(-pow((f - 0.42 + v * 0.18) / 0.13, 2.)) * smoothstep(0.25, 0.95, luz);
    cor += uCorClara * faixa * 0.32 * detalhe;
    // de vez em quando uma perna pega a luz de cheio (cintila e passa)
    float idp = floor(w);
    float sorte = acaso(idp);
    float pisca = pow(max(0., sin(uTempo * (0.5 + sorte) + sorte * 40.)), 36.);
    cor += vec3(1., 0.9, 0.84) * faixa * pisca * 0.7 * detalhe * step(0.55, sorte);
    cor += uCorClara * pow(clamp(luz, 0., 1.), 7.) * 0.14 * detalhe;   // brilho de seda
    // translucidez: a borda contra a luz fica mais clara e mais quente
    float borda = pow(1. - altura, 1.6);
    float contra = clamp(0.45 - vLuzFrente * 0.6, 0., 1.);
    cor = mix(cor, uCorTrans, borda * (0.25 + 0.4 * contra));
    cor = mix(uCor, cor, 0.3 + 0.7 * detalhe);                        // ao longe é só "o vermelho do fio"
    // a luz de dentro: o miolo esquenta e clareia
    float b = clamp(vBrilho, 0., 1.);
    // (o vermelho do fio fica luminoso, não laranja: num mundo claro a luz vermelha é que se lê)
    cor = mix(cor, uCorQuente, b * (0.35 + 0.35 * altura));
    cor += vec3(1., 0.88, 0.8) * b * 0.4 * pow(altura, 8.);

    float nevoa = smoothstep(uNevoaPerto, uNevoaLonge, vProf);
    float aCor = cobertura * mix(0.5, 1., vFino);
    vec3 corFora = fuzz > halo * 0.6 ? mix(uCor, uCorClara, 0.45) : mix(uCorHalo, uCorQuente, exp(-fora / 1.2) * b);
    float aFora = max(fuzz, halo * 0.6) * (1. - aCor);
    float alfa = aCor + aFora;
    cor = (cor * aCor + corFora * aFora) / max(alfa, 1e-4);
    cor = mix(cor, uNevoaCor, nevoa);

    gl_FragColor = vec4(cor, alfa * uOpacidade);
    #include <colorspace_fragment>
  }
`;

// =============================================================================
// Luzes do fio: a estrela que desenha a ponta e a poeira de luz (brasas) que
// se solta dele. Um único THREE.Points (uma chamada de desenho), simulado na CPU.
// =============================================================================

const VERTICE_LUZ = /* glsl */ `
  attribute vec4 aDados;     // x: tamanho (m), y: opacidade, z: tipo (0 brasa, 1 estrela), w: calor (0 rosa, 1 ouro)
  uniform vec2 uTela;
  uniform float uDpr;
  uniform vec2 uNevoa;
  varying vec4 vD;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.);
    float prof = max(-mv.z, 0.05);
    float px = aDados.x * projectionMatrix[1][1] * uTela.y * 0.5 / prof;
    px = aDados.z > 0.5 ? clamp(px, 44., 120.) : clamp(px, 5., 12.);
    float a = aDados.y * (1. - smoothstep(uNevoa.x, uNevoa.y, prof));
    vD = vec4(px, a, aDados.z, aDados.w);
    if (a < 0.003) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; return; }
    gl_PointSize = px * uDpr;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENTO_LUZ = /* glsl */ `
  uniform vec3 uOuro;
  uniform vec3 uRosa;
  uniform vec3 uBranco;
  varying vec4 vD;
  void main() {
    vec2 q = gl_PointCoord * 2. - 1.;
    float r2 = dot(q, q);
    vec3 tom = mix(uRosa, uOuro, vD.w);
    float a; vec3 cor;
    if (vD.z > 0.5) {
      // estrela: miolo branco-quente, halo e quatro raios finos (dois maiores)
      float miolo = exp(-r2 * 60.);
      float halo = exp(-r2 * 5.) * 0.62 + exp(-r2 * 1.8) * 0.26;
      float raios = exp(-abs(q.x) * 34.) * exp(-q.y * q.y * 2.2) + exp(-abs(q.y) * 34.) * exp(-q.x * q.x * 4.) * 0.75;
      vec2 d = vec2(q.x + q.y, q.x - q.y) * 0.7071;
      raios += (exp(-abs(d.x) * 44.) * exp(-d.y * d.y * 12.) + exp(-abs(d.y) * 44.) * exp(-d.x * d.x * 12.)) * 0.35;
      raios *= 1. - smoothstep(0.6, 1., sqrt(r2));
      a = clamp(miolo + halo + raios, 0., 1.) * (1. - smoothstep(0.75, 1., sqrt(r2)));
      cor = mix(tom, uBranco, clamp(miolo * 1.6 + raios * 0.55 + halo * 0.3, 0., 1.));
    } else {
      // um ponto macio e cheio (sem miolo branco: no papel claro ele virava um anel)
      float miolo = exp(-r2 * 14.);
      a = min(1., exp(-r2 * 5.) * 1.25) * (1. - smoothstep(0.8, 1., sqrt(r2)));
      cor = mix(tom, mix(tom, uBranco, 0.45), miolo);
    }
    a *= vD.y;
    if (a < 0.004) discard;
    gl_FragColor = vec4(cor, a);
    #include <colorspace_fragment>
  }
`;

const LUZES = { alto: 140, medio: 96, baixo: 40 };

function criarLuzes(mundo, amostrador, comuns) {
  const { THREE, amb } = mundo;
  const N = (LUZES[amb.nivel] || LUZES.medio) + 1;     // o 0 é a estrela
  const pos = new Float32Array(N * 3);
  const dados = new Float32Array(N * 4);
  const vel = new Float32Array(N * 3);
  const vida = new Float32Array(N);
  const idade = new Float32Array(N);
  const base = new Float32Array(N);                    // tamanho de nascença
  const geo = new THREE.BufferGeometry();
  const atribPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const atribDados = new THREE.BufferAttribute(dados, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', atribPos);
  geo.setAttribute('aDados', atribDados);
  const nevoa = mundo.cena.fog;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERTICE_LUZ,
    fragmentShader: FRAGMENTO_LUZ,
    uniforms: {
      uTela: { value: new THREE.Vector2(mundo.tamanho.largura, mundo.tamanho.altura) },
      uDpr: { value: mundo.tamanho.dpr || 1 },
      uNevoa: { value: new THREE.Vector2(nevoa ? nevoa.near + 1 : 3.5, nevoa ? nevoa.far * 1.15 : 11) },
      uOuro: { value: new THREE.Color('#ffb04a') },
      uRosa: { value: new THREE.Color('#ff3352') },
      uBranco: { value: new THREE.Color('#fff6e4') },
    },
    transparent: true,
    depthWrite: false,
  });
  const pontos = new THREE.Points(geo, mat);
  pontos.name = 'fio-luzes';
  pontos.frustumCulled = false;
  pontos.renderOrder = 6;
  pontos.visible = false;

  let vivas = 0;
  let proxima = 1;
  const estado = { estrela: 0, taxaPonta: 0, taxaPulso: 0, acumPonta: 0, acumPulso: 0, t: 0 };
  const aux = { x: 0, y: 0, z: 0 };

  function pontoEm(s, saida) {
    const total = amostrador.comprimento;
    const seg = (amostrador.pontos.length / 3) - 1;
    const u = clamp(total > 0 ? s / total : 0) * seg;
    const i = Math.min(seg - 1, Math.floor(u));
    const r = u - i;
    const p = amostrador.pontos;
    const o = i * 3;
    saida.x = p[o] + (p[o + 3] - p[o]) * r;
    saida.y = p[o + 1] + (p[o + 4] - p[o + 1]) * r;
    saida.z = p[o + 2] + (p[o + 5] - p[o + 2]) * r;
    return saida;
  }

  function soltar(x, y, z, forca = 1) {
    if (amb.reduzido) return;
    const i = proxima;
    proxima = proxima + 1 >= N ? 1 : proxima + 1;
    if (vida[i] <= 0) vivas++;
    const ang = Math.random() * Math.PI * 2;
    const v = (0.03 + Math.random() * 0.1) * forca;
    pos[i * 3] = x + (Math.random() - 0.5) * 0.01;
    pos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.01;
    pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.01;
    vel[i * 3] = Math.cos(ang) * v;
    vel[i * 3 + 1] = 0.05 + Math.random() * 0.12 * forca;
    vel[i * 3 + 2] = Math.sin(ang) * v;
    vida[i] = 1.4 + Math.random() * 1.8;
    idade[i] = 0;
    base[i] = 0.006 + Math.random() * 0.008;
    dados[i * 4 + 2] = 0;
    dados[i * 4 + 3] = Math.random() < 0.35 ? 1 : Math.random() * 0.35;
    pontos.visible = true;
  }

  function atualizar(dt, t) {
    estado.t = t;
    const total = amostrador.comprimento;
    // a estrela, na ponta que se desenha
    if (estado.estrela > 0.002 && total > 0) {
      const sPonta = comuns.uProgresso.value * total;
      pontoEm(sPonta, aux);
      pos[0] = aux.x; pos[1] = aux.y + 0.004; pos[2] = aux.z;
      const cintila = 0.86 + 0.14 * Math.sin(t * 9.3) * Math.sin(t * 5.1 + 1);
      dados[0] = 0.09 * cintila; dados[1] = estado.estrela * comuns.uOpacidade.value; dados[2] = 1; dados[3] = 0.3;
      estado.acumPonta += dt * estado.taxaPonta * estado.estrela;
      while (estado.acumPonta >= 1) { estado.acumPonta -= 1; soltar(aux.x, aux.y, aux.z, 1); }
      pontos.visible = true;
    } else {
      dados[1] = 0;
    }
    // brasas que se soltam do pulso de luz
    if (comuns.uPulsoK.value > 0.05 && estado.taxaPulso > 0 && total > 0) {
      estado.acumPulso += dt * estado.taxaPulso * comuns.uPulsoK.value;
      while (estado.acumPulso >= 1) {
        estado.acumPulso -= 1;
        pontoEm(comuns.uPulsoS.value + (Math.random() - 0.5) * comuns.uPulsoL.value, aux);
        if (comuns.uPulsoS.value <= comuns.uProgresso.value * total) soltar(aux.x, aux.y, aux.z, 0.7);
      }
    }
    if (vivas) {
      let restam = 0;
      const amortece = Math.exp(-1.6 * dt);
      for (let i = 1; i < N; i++) {
        if (vida[i] <= 0) { dados[i * 4 + 1] = 0; continue; }
        idade[i] += dt;
        const k = idade[i] / vida[i];
        if (k >= 1) { vida[i] = 0; dados[i * 4 + 1] = 0; continue; }
        restam++;
        const o = i * 3;
        // sobem devagar, o ar segura, e um sopro leve as faz ondular
        vel[o] = vel[o] * amortece + Math.sin(t * 1.7 + i) * 0.02 * dt;
        vel[o + 1] = vel[o + 1] * amortece + 0.06 * dt;
        vel[o + 2] = vel[o + 2] * amortece + Math.cos(t * 1.3 + i * 0.7) * 0.02 * dt;
        pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
        const piscar = 0.75 + 0.25 * Math.sin(t * (6 + (i % 5)) + i);
        dados[i * 4] = base[i] * (1 - k * 0.5);
        dados[i * 4 + 1] = Math.min(1, idade[i] / 0.18) * (1 - k * k) * piscar * comuns.uOpacidade.value;
      }
      vivas = restam;
    }
    atribPos.needsUpdate = true;
    atribDados.needsUpdate = true;
    if (!vivas && estado.estrela <= 0.002) pontos.visible = false;
  }

  function ajustar(tamanho) {
    mat.uniforms.uTela.value.set(tamanho.largura, tamanho.altura);
    mat.uniforms.uDpr.value = tamanho.dpr || 1;
  }

  return {
    objeto: pontos,
    estado,
    pontoEm,
    soltar,
    rajada(x, y, z, n = 16) { for (let i = 0; i < n; i++) soltar(x, y, z, 1.6); },
    atualizar,
    ajustar,
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

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
    uAceso: { value: 0 },
    uPulsoS: { value: -10 },
    uPulsoK: { value: 0 },
    uPulsoL: { value: 0.5 },
    uRastro: { value: 0 },
  };
  const baixo = mundo.amb.nivel === 'baixo';

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
      uHaloPx: { value: baixo ? 5 : 9 },
      uFuzzPx: { value: baixo ? 0 : 2.2 },
      uCorQuente: { value: new THREE.Color('#ff4a4e') },
      uCorHalo: { value: new THREE.Color('#ff3d55') },
      uCorTrans: { value: new THREE.Color('#ff5b46') },
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

  // Estrela da ponta e poeira de luz (fora do movimento reduzido: lá só o brilho).
  const luzes = mundo.amb.reduzido ? null : criarLuzes(mundo, amostrador, comuns);
  if (luzes) objeto.add(luzes.objeto);

  function ajustarTela(t) {
    material.uniforms.uTela.value.set(t.largura, t.altura);
    material.uniforms.uMargemPx.value = 1 / Math.max(1, t.dpr || 1);
    if (luzes) luzes.ajustar(t);
  }
  ajustarTela(mundo.tamanho);
  const pararTamanho = mundo.aoRedimensionar(ajustarTela);

  // Respiração (a folha final): de tempos em tempos o fio acende devagar e apaga.
  let acesoBase = 0;
  let respiro = 0;
  let respiroDesde = 0;

  // O relógio do vento vem do mundo, sem ninguém precisar chamar atualizar().
  const pararQuadro = mundo.aoQuadro((dt, t) => {
    material.uniforms.uTempo.value = t;
    if (respiro) {
      const c = ((t - respiroDesde) % 7.5) / 7.5;
      const onda = Math.pow(Math.sin(Math.PI * c), 4);
      comuns.uAceso.value = acesoBase + respiro * onda;
    }
    if (luzes) luzes.atualizar(dt, t);
  });

  const gsap = window.gsap;
  let pulsoAtual = null;

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
    /** Brilho de dentro do fio inteiro (0..1). */
    acender(v) {
      if (v !== undefined) { acesoBase = clamp(Number(v) || 0); if (!respiro) comuns.uAceso.value = acesoBase; }
      return acesoBase;
    },
    /** O fio respira um brilho muito sutil de tempos em tempos (k 0 desliga). */
    respirar(k = 0.22) {
      respiro = clamp(Number(k) || 0);
      respiroDesde = material.uniforms.uTempo.value;
      if (!respiro) comuns.uAceso.value = acesoBase;
    },
    /** Rastro de luz que a ponta deixa enquanto se desenha (0..1). */
    rastro(v) {
      if (v !== undefined) comuns.uRastro.value = clamp(Number(v) || 0);
      return comuns.uRastro.value;
    },
    /** A estrela na ponta que se desenha (0..1) e quantas brasas ela solta por segundo. */
    estrela(v, taxa) {
      if (!luzes) return 0;
      if (v !== undefined) luzes.estado.estrela = clamp(Number(v) || 0);
      if (taxa !== undefined) luzes.estado.taxaPonta = Math.max(0, Number(taxa) || 0);
      return luzes.estado.estrela;
    },
    /**
     * Um pulso de luz quente corre pelo fio de `de` a `ate` (frações do comprimento).
     * Resolve quando chega. Movimento reduzido: o fio só acende e apaga, parado.
     */
    pulso({ de = 0, ate = 1, duracao = 2.2, forca = 1, largura = 0.55, brasas = 22, curva = 'sine.inOut' } = {}) {
      if (!gsap) return Promise.resolve();
      if (pulsoAtual) pulsoAtual.kill();
      const total = Math.max(amostrador.comprimento, 1e-3);
      if (mundo.amb.reduzido) {
        const o = { k: 0 };
        return new Promise((ok) => {
          pulsoAtual = gsap.timeline({ onComplete: ok })
            .to(o, { k: forca * 0.6, duration: duracao * 0.4, ease: 'none', onUpdate: () => { comuns.uAceso.value = acesoBase + o.k; } })
            .to(o, { k: 0, duration: duracao * 0.6, ease: 'none', onUpdate: () => { comuns.uAceso.value = acesoBase + o.k; } });
        });
      }
      comuns.uPulsoL.value = largura;
      comuns.uPulsoS.value = de * total;
      if (luzes) luzes.estado.taxaPulso = brasas;
      return new Promise((ok) => {
        pulsoAtual = gsap.timeline({ onComplete: () => { comuns.uPulsoK.value = 0; ok(); } })
          .to(comuns.uPulsoK, { value: forca, duration: Math.min(0.5, duracao * 0.25), ease: 'power2.out' }, 0)
          .to(comuns.uPulsoS, { value: ate * total, duration: duracao, ease: curva }, 0)
          .to(comuns.uPulsoK, { value: 0, duration: Math.min(0.7, duracao * 0.3), ease: 'power1.in' }, duracao * 0.82);
      });
    },
    /** Ponto do fio a uma fração do comprimento (sem argumento: a ponta que se desenha). */
    pontoEm(u = comuns.uProgresso.value, saida = new THREE.Vector3()) {
      const p = amostrador.pontos;
      const k = clamp(u) * seg;
      const i = Math.min(seg - 1, Math.floor(k));
      const r = k - i;
      const o = i * 3;
      saida.x = p[o] + (p[o + 3] - p[o]) * r;
      saida.y = p[o + 1] + (p[o + 4] - p[o + 1]) * r;
      saida.z = p[o + 2] + (p[o + 5] - p[o + 2]) * r;
      return saida;
    },
    /** Poeira de luz que se solta de um ponto do mundo (o laço que se desfaz). */
    faiscar(ponto, n = 18) {
      if (!luzes || !ponto) return;
      luzes.rajada(ponto.x, ponto.y, ponto.z, n);
    },
    atualizar(dt, t) {
      if (Number.isFinite(t)) material.uniforms.uTempo.value = t;
    },
    dispose() {
      pararTamanho();
      pararQuadro();
      if (pulsoAtual) pulsoAtual.kill();
      if (objeto.parent) objeto.parent.remove(objeto);
      geometria.dispose();
      material.dispose();
      if (materialSombra) materialSombra.dispose();
      if (luzes) luzes.dispose();
    },
  };
}

// =============================================================================
// Leve (SVG)
// =============================================================================

function criarFioLeve(mundo, opcoes) {
  // Sem viewBox: uma unidade do desenho é um px de tela.
  // A torção é um padrão de listras inclinadas (as pernas do fio) por cima da cor;
  // o halo, um contorno largo e morno que só aparece quando o fio acende.
  const id = `fio-torcao-${++contadorLeve}`;
  const desenho = svg(`
    <svg class="fio-leve" aria-hidden="true">
      <defs>
        <pattern id="${id}" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
          <rect width="1.15" height="3.2" fill="#8f0b1d" fill-opacity="0.5"/>
          <rect x="1.6" width="0.55" height="3.2" fill="#ff8f8a" fill-opacity="0.45"/>
        </pattern>
      </defs>
      <path class="fio-leve-halo"/>
      <path class="fio-leve-sombra"/>
      <path class="fio-leve-fita"/>
      <path class="fio-leve-torcao"/>
      <circle class="fio-leve-estrela" r="0"/>
    </svg>`);
  const halo = desenho.querySelector('.fio-leve-halo');
  const sombra = desenho.querySelector('.fio-leve-sombra');
  const fita = desenho.querySelector('.fio-leve-fita');
  const torcao = desenho.querySelector('.fio-leve-torcao');
  const estrelaEl = desenho.querySelector('.fio-leve-estrela');
  // Estilo no próprio elemento: o fio precisa aparecer mesmo se o CSS da cena não tiver carregado.
  fita.setAttribute('fill', '#d7192d');
  torcao.setAttribute('fill', `url(#${id})`);
  sombra.setAttribute('fill', '#2a1b22');
  sombra.setAttribute('fill-opacity', '0.1');
  halo.setAttribute('fill', '#ffb27a');
  halo.setAttribute('fill-opacity', '0');
  estrelaEl.setAttribute('fill', '#fff3dc');
  estrelaEl.setAttribute('stroke', '#ffb04a');
  estrelaEl.setAttribute('stroke-opacity', '0.55');
  estrelaEl.setAttribute('stroke-width', '3');
  mundo.recipienteLeve.append(desenho);
  let brilho = 0;
  let estrelaK = 0;
  let respiro = 0;
  let pararRespiro = null;
  const gsapLeve = window.gsap;
  const aplicarBrilho = () => { halo.setAttribute('fill-opacity', (Math.min(1, brilho) * 0.5).toFixed(3)); };

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
      torcao.setAttribute('d', '');
      sombra.setAttribute('d', '');
      halo.setAttribute('d', '');
      estrelaEl.setAttribute('r', '0');
      return;
    }
    const d = contorno(0, atual, 1, 0, 0);
    fita.setAttribute('d', d);
    torcao.setAttribute('d', d);
    sombra.setAttribute('d', atual > chao ? contorno(chao, atual, 2.6, 2, 3) : '');
    halo.setAttribute('d', brilho > 0.01 ? contorno(0, atual, 3.4, 0, 0) : '');
    if (estrelaK > 0.01) {
      const p = amostrador.pontos;
      const k = Math.min(seg, Math.round(atual * seg)) * 3;
      estrelaEl.setAttribute('cx', p[k].toFixed(1));
      estrelaEl.setAttribute('cy', p[k + 1].toFixed(1));
      estrelaEl.setAttribute('r', (3.2 * estrelaK).toFixed(2));
      estrelaEl.setAttribute('opacity', estrelaK.toFixed(2));
    } else {
      estrelaEl.setAttribute('r', '0');
    }
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
    acender(v) {
      if (v !== undefined) { brilho = clamp(Number(v) || 0); aplicarBrilho(); desenhar(); }
      return brilho;
    },
    respirar(k = 0.22) {
      respiro = clamp(Number(k) || 0);
      if (pararRespiro) { pararRespiro(); pararRespiro = null; }
      if (!respiro) return;
      let desde = null;
      pararRespiro = mundo.aoQuadro((dt, t) => {
        if (desde === null) desde = t;
        const c = ((t - desde) % 7.5) / 7.5;
        brilho = respiro * Math.pow(Math.sin(Math.PI * c), 4);
        aplicarBrilho();
        if (brilho > 0.01 && !halo.getAttribute('d')) desenhar();
      });
    },
    rastro() { return 0; },
    estrela(v) {
      if (v !== undefined && !mundo.amb.reduzido) { estrelaK = clamp(Number(v) || 0); desenhar(); }
      return estrelaK;
    },
    pulso({ duracao = 2.2, forca = 1 } = {}) {
      // sem WebGL o pulso é o fio inteiro que acende e apaga
      if (!gsapLeve) return Promise.resolve();
      const o = { k: brilho };
      return new Promise((ok) => {
        gsapLeve.timeline({ onComplete: ok })
          .to(o, { k: forca * 0.8, duration: duracao * 0.4, ease: 'none', onUpdate: () => { brilho = o.k; aplicarBrilho(); desenhar(); } })
          .to(o, { k: 0, duration: duracao * 0.6, ease: 'none', onUpdate: () => { brilho = o.k; aplicarBrilho(); } });
      });
    },
    pontoEm(u = atual, saida = { x: 0, y: 0, z: 0 }) {
      const p = amostrador.pontos;
      const k = Math.min(seg, Math.round(clamp(u) * seg)) * 3;
      saida.px = saida.x = p[k]; saida.py = saida.y = p[k + 1]; saida.z = 0;
      return saida;
    },
    faiscar() {},
    atualizar() {},
    dispose() { pararTamanho(); if (pararRespiro) pararRespiro(); desenho.remove(); },
  };
}

let contadorLeve = 0;
