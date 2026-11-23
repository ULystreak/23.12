/* ============================================================================
   FIO: o fio vermelho (o akai ito da mão e o caminho que ela segue)
   ============================================================================
   criarFio(mundo, opcoes) escolhe a versão pelo mundo.ok:
     3D    uma fita de ShaderMaterial montada no espaço da câmera (sempre de
           frente para ela), com algodão torcido no shader, largura mínima e
           máxima em pixels (1,5 a 4 px, a bitola do cordão do envelope), halo
           aditivo, sombra de contato no chão, a estrela na ponta que desenha o
           fio, brasas e pólen em THREE.Points e um pulso de luz que corre.
     leve  o mesmo fio em SVG dentro de mundo.recipienteLeve: contorno com
           largura variável, torção por <pattern>, sombra deslocada, halo com
           desfoque e a estrela. Estilos inline: aparece sem o CSS da cena.

   O fio não se anuncia: nenhum texto, nenhum foco, aria-hidden. É uma peça de
   estado que a cena controla; ele não publica etapa nem toca no ctx.estado.
   O relógio (vento, respiro, estrela, brasas) vem de mundo.aoQuadro: ninguém
   precisa chamar atualizar().

   API (igual nas duas versões; a leve acrescenta `elemento`, o <svg>):
     objeto, comprimento (m; px na leve), progresso(p?), definirCurva(c, extras?),
     fase(m?), opacidade(v?), acender(v?), respirar(k = 0.22), rastro(v?),
     estrela(v?, taxa?, escala?), halo(v?), pulso({...}) → Promise,
     pontoEm(u?, saida?), faiscar(ponto, n = 18), atualizar(dt, t), dispose().
   Sem argumento, os ajustes devolvem o valor atual.

   Opções: curva (lista de pontos ou objeto com getPoint), largura (0,012 m),
   larguraInicio e larguraFim (= largura), crescerEm (2 m), afinarEm (1,2 m),
   maxPx (4) e sombra (false tira a sombra do chão); na leve, perfil
   ([[u, px], ...] ou uma largura em px por ponto da curva) e sombraDe (0,12),
   os mesmos extras de definirCurva.
   Com WebGL, quem cria põe `objeto` na cena; o SVG leve entra sozinho em
   mundo.recipienteLeve. dispose() tira os dois.

   Cor: o fio trabalha em sRGB cru (sem colorspace_fragment), para os hex e as
   constantes dos shaders saírem na tela exatamente como foram escolhidos.
   ========================================================================== */

import { clamp, svg, objetoLeve, vetorLeve, semente } from '../nucleo/util.js';

// Segmentos da fita por nível. Definem a suavidade da curva, a resolução da
// estrela e do pulso e o custo de definirCurva, que a mão chama a cada quadro.
const SEGMENTOS = { alto: 384, medio: 320, baixo: 224 };
const SEGMENTOS_LEVE = 120;
// Nunca mais fino que ~1,5 px na tela (aí ele clareia em vez de engrossar) nem
// mais grosso que ~4 px: a mesma bitola do cordão do envelope.
const MIN_PX = 1.5;
const MAX_PX = 4;
// Partículas por nível, mais a estrela (índice 0).
const LUZES = { alto: 140, medio: 96, baixo: 40 };

const CICLO_RESPIRO = 7.5; // s
const SEM_PULSO = -10; // m: o pulso estacionado longe do fio
const PERFIL_LEVE = [[0, 3], [0.28, 6.5], [1, 1.6]]; // px ao longo do fio leve

let contadorLeve = 0; // ids únicos do <pattern> de cada fio leve

/** O fio vermelho: 3D com WebGL, SVG sem. */
export function criarFio(mundo, opcoes = {}) {
  return mundo?.ok ? criarFio3D(mundo, opcoes || {}) : criarFioLeve(mundo, opcoes || {});
}

/* ---- apoios ------------------------------------------------------------------ */

const numero = (v, padrao) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);

// A luz SOMA sobre o que está atrás (a foto escurecida no entardecer), em vez
// de cobrir: é assim que luz se lê sobre um fundo claro. Os shaders devolvem a
// cor já multiplicada pelo alfa; o alfa diz quanto do fundo some.
function misturaDeLuz(THREE, material) {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.premultipliedAlpha = true;
  return material;
}

/* ---- amostrador ----------------------------------------------------------------
   Guarda a curva como seg + 1 pontos igualmente espaçados pelo comprimento de
   arco. Aceita lista de pontos ({x, y, z} no 3D, {px, py} no leve; pelo menos
   dois distintos) ou objeto com getPoint(t, alvo). Catmull-Rom centrípeta
   (α = 0,5) em 3·seg + 1 amostras densas, distribuídas pelo comprimento das
   cordas, e depois a reamostragem. Curva que não serve devolve false e não
   muda nada. Não aloca depois de aquecido: pode rodar a cada quadro.
   ---------------------------------------------------------------------------- */
function criarAmostrador(seg, alvoCurva, tela = false) {
  const M = seg * 3;
  const pontos = new Float32Array((seg + 1) * 3);
  const densas = new Float32Array((M + 1) * 3);
  const acum = new Float64Array(M + 1);
  let base = new Float64Array(0); // pontos aceitos nas casas 1..k; 0 e k+1 são os reflexos
  let nos = new Float64Array(0);

  const amostrador = { pontos, seg, total: 0, definir, pontoEm };

  // Barry-Goldman: a forma piramidal da Catmull-Rom com nós não uniformes.
  function catmull(i, u, saida, o) {
    const t0 = nos[i - 1];
    const t1 = nos[i];
    const t2 = nos[i + 1];
    const t3 = nos[i + 2];
    const t = t1 + (t2 - t1) * u;
    for (let c = 0; c < 3; c++) {
      const p0 = base[(i - 1) * 3 + c];
      const p1 = base[i * 3 + c];
      const p2 = base[(i + 1) * 3 + c];
      const p3 = base[(i + 2) * 3 + c];
      const a1 = ((t1 - t) * p0 + (t - t0) * p1) / (t1 - t0);
      const a2 = ((t2 - t) * p1 + (t - t1) * p2) / (t2 - t1);
      const a3 = ((t3 - t) * p2 + (t - t2) * p3) / (t3 - t2);
      const b1 = ((t2 - t) * a1 + (t - t0) * a2) / (t2 - t0);
      const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
      saida[o + c] = ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1);
    }
  }

  const distancia = (i, j) => Math.hypot(base[j * 3] - base[i * 3], base[j * 3 + 1] - base[i * 3 + 1], base[j * 3 + 2] - base[i * 3 + 2]);

  function deLista(lista) {
    const casas = lista.length + 2;
    if (base.length < casas * 3) {
      base = new Float64Array(casas * 6);
      nos = new Float64Array(casas * 2);
    }
    let k = 0;
    for (let j = 0; j < lista.length; j++) {
      const p = lista[j];
      if (!p || typeof p !== 'object') continue;
      const x = Number(tela ? (p.px ?? p.x) : (p.x ?? p.px));
      const y = Number(tela ? (p.py ?? p.y) : (p.y ?? p.py));
      const z = tela ? 0 : Number(p.z ?? 0);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      // Pontos repetidos dariam nó de largura zero (divisão por zero).
      if (k > 0) {
        const dx = x - base[k * 3];
        const dy = y - base[k * 3 + 1];
        const dz = z - base[k * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < 1e-12) continue;
      }
      k += 1;
      base[k * 3] = x;
      base[k * 3 + 1] = y;
      base[k * 3 + 2] = z;
    }
    if (k < 2) return false;

    // Vizinhos refletidos nas pontas.
    for (let c = 0; c < 3; c++) {
      base[c] = 2 * base[3 + c] - base[6 + c];
      base[(k + 1) * 3 + c] = 2 * base[k * 3 + c] - base[(k - 1) * 3 + c];
    }
    nos[0] = 0;
    for (let i = 0; i <= k; i++) nos[i + 1] = nos[i] + Math.sqrt(distancia(i, i + 1));

    let cordas = 0;
    for (let i = 1; i < k; i++) cordas += distancia(i, i + 1);
    let s = 1;
    let antes = 0;
    let corda = distancia(1, 2);
    for (let j = 0; j <= M; j++) {
      const c = (j / M) * cordas;
      while (s < k - 1 && antes + corda < c) {
        antes += corda;
        s += 1;
        corda = distancia(s, s + 1);
      }
      catmull(s, corda > 0 ? clamp((c - antes) / corda) : 0, densas, j * 3);
    }
    return reamostrar();
  }

  function deCurva(curva) {
    for (let j = 0; j <= M; j++) {
      const q = curva.getPoint(j / M, alvoCurva) || alvoCurva;
      const x = Number(tela ? (q.px ?? q.x) : q.x);
      const y = Number(tela ? (q.py ?? q.y) : q.y);
      const z = tela ? 0 : Number(q.z ?? 0);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
      densas[j * 3] = x;
      densas[j * 3 + 1] = y;
      densas[j * 3 + 2] = z;
    }
    return reamostrar();
  }

  function reamostrar() {
    acum[0] = 0;
    for (let j = 1; j <= M; j++) {
      const o = j * 3;
      acum[j] = acum[j - 1] + Math.hypot(densas[o] - densas[o - 3], densas[o + 1] - densas[o - 2], densas[o + 2] - densas[o - 1]);
    }
    const total = acum[M];
    if (!(total > 1e-9)) return false;
    let j = 0;
    for (let i = 0; i <= seg; i++) {
      const alvo = (i / seg) * total;
      while (j < M - 1 && acum[j + 1] < alvo) j += 1;
      const trecho = acum[j + 1] - acum[j];
      const t = trecho > 0 ? clamp((alvo - acum[j]) / trecho) : 0;
      const a = j * 3;
      const o = i * 3;
      pontos[o] = densas[a] + (densas[a + 3] - densas[a]) * t;
      pontos[o + 1] = densas[a + 1] + (densas[a + 4] - densas[a + 1]) * t;
      pontos[o + 2] = densas[a + 2] + (densas[a + 5] - densas[a + 2]) * t;
    }
    amostrador.total = total;
    return true;
  }

  function definir(c) {
    if (Array.isArray(c)) return deLista(c);
    if (c && typeof c.getPoint === 'function') return deCurva(c);
    return false;
  }

  /** O ponto a `s` (na unidade da curva) do começo. */
  function pontoEm(s, saida) {
    const total = amostrador.total;
    const f = total > 0 ? clamp(s / total) * seg : 0;
    const i = Math.min(seg - 1, Math.floor(f));
    const t = f - i;
    const o = i * 3;
    saida.x = pontos[o] + (pontos[o + 3] - pontos[o]) * t;
    saida.y = pontos[o + 1] + (pontos[o + 4] - pontos[o + 1]) * t;
    saida.z = pontos[o + 2] + (pontos[o + 5] - pontos[o + 2]) * t;
    return saida;
  }

  return amostrador;
}

/* ---- shaders da fita -------------------------------------------------------------
   s = metros ao longo do fio. A fita, o halo e a sombra são três malhas sobre a
   mesma geometria: dois vértices por ponto (aLado −1 e +1), com os vizinhos em
   aAnterior e aProximo.
   ---------------------------------------------------------------------------- */

const COMUM = /* glsl */ `
uniform float uComprimento;
uniform float uProgresso;
uniform float uLargura;
uniform float uLarguraInicio;
uniform float uLarguraFim;
uniform float uCrescer;
uniform float uAfinar;
uniform float uPonta;
uniform float uOpacidade;
uniform float uAceso;
uniform float uPulsoS;
uniform float uPulsoK;
uniform float uPulsoL;
uniform float uRastro;
uniform float uRastroL;
uniform float uHalo;
uniform float uFase;
uniform float uTranca;
uniform float uVento;
uniform float uTempo;
uniform float uPasso;
uniform vec2 uTela;
uniform float uMargemPx;
uniform float uNevoaPerto;
uniform float uNevoaLonge;
uniform vec3 uNevoaCor;

// A luz de dentro: o nível aceso, o pulso que corre e o rastro atrás da ponta.
float brilhoEm(float s) {
  float d = (s - uPulsoS) / max(uPulsoL, 0.001);
  float pulso = uPulsoK * exp(-d * d);
  float atras = uProgresso * uComprimento - s;
  float rastro = uRastro * exp(-max(atras, 0.0) / (uRastroL * 2.2 + 0.4)) * step(-0.02, atras);
  return clamp(uAceso + pulso + rastro, 0.0, 1.5);
}

// O trecho incandescente logo atrás da ponta: nasce quase branco e esfria
// para o vermelho em ~1 s; nasce um palmo depois do começo, e rente ao laço
// desenhado o fio é só vermelho.
float calorEm(float s) {
  float atras = uProgresso * uComprimento - s;
  return uRastro * exp(-max(atras, 0.0) / max(uRastroL, 0.05)) * step(-0.02, atras)
    * step(uProgresso, 0.9995) * smoothstep(0.08, 0.4, s);
}

// Cresce do começo fino até a bitola do chão, afina no fim e na ponta que desenha.
float larguraEm(float s) {
  float l = mix(uLarguraInicio, uLargura, smoothstep(0.0, max(uCrescer, 0.0001), s));
  l = mix(l, uLarguraFim, smoothstep(uComprimento - max(uAfinar, 0.0001), uComprimento, s));
  float atras = uProgresso * uComprimento - s;
  float ponta = mix(1.0, smoothstep(0.0, max(uPonta, 0.0001), atras), step(uProgresso, 0.9995));
  return l * mix(0.12, 1.0, ponta);
}
`;

const VERTICE_BASE = /* glsl */ `
attribute vec3 aAnterior;
attribute vec3 aProximo;
attribute float aLado;
attribute float aU;
attribute float aSolto;

// Vento só no ar: aSolto é zero no chão e perto das pontas presas.
vec3 balanco(vec3 p, float s, float solto) {
  float a = uVento * solto;
  p.x += (sin(1.13 * uTempo + 2.1 * s) * 0.016 + sin(0.47 * uTempo + 0.9 * s) * 0.014) * a;
  p.y += sin(0.83 * uTempo + 2.9 * s + 1.7) * 0.006 * a;
  p.z += cos(0.97 * uTempo + 1.6 * s) * 0.010 * a;
  return p;
}

// Montada no espaço da câmera, a fita não deforma nos trechos atrás dela: o
// lado é perpendicular ao fio e ao olhar, então ela sempre encara a câmera.
void naCamera(float s, out vec4 mv, out vec3 lado, out vec3 frente) {
  vec3 a = (modelViewMatrix * vec4(balanco(aAnterior, s - uPasso, aSolto), 1.0)).xyz;
  vec3 b = (modelViewMatrix * vec4(balanco(aProximo, s + uPasso, aSolto), 1.0)).xyz;
  mv = modelViewMatrix * vec4(balanco(position, s, aSolto), 1.0);
  vec3 tangente = b - a;
  lado = cross(tangente, mv.xyz);
  float l = length(lado);
  lado = l > 1e-10 ? lado / l : vec3(1.0, 0.0, 0.0);
  frente = cross(lado, tangente);
  l = length(frente);
  frente = l > 1e-10 ? frente / l : vec3(0.0, 0.0, 1.0);
  if (dot(frente, mv.xyz) > 0.0) frente = -frente;
}

// Quantos metros cabem num pixel CSS nesta profundidade.
float metroPorPxEm(float prof) {
  return prof * 2.0 / (projectionMatrix[1][1] * uTela.y);
}
`;

const VERTICE = /* glsl */ `
uniform float uMinPx;
uniform float uMaxPx;
uniform float uHaloPx;
uniform float uFuzzPx;
uniform vec3 uLuz;

varying float vS;
varying float vLado;
varying float vTotalPx;
varying float vMeiaPx;
varying float vFino;
varying float vPerto;
varying float vBrilho;
varying float vCalor;
varying float vLuzLado;
varying float vLuzFrente;
varying float vProf;

void main() {
  float s = aU * uComprimento;
  vec4 mv;
  vec3 lado;
  vec3 frente;
  naCamera(s, mv, lado, frente);
  float prof = max(-mv.z, 0.05);
  float mpp = metroPorPxEm(prof);
  float minimo = uMinPx * 0.5;
  float meiaPx = larguraEm(s) * 0.5 / mpp;
  vFino = clamp(meiaPx / minimo, 0.0, 1.0);
  vPerto = smoothstep(0.55, 1.1, meiaPx / (uMaxPx * 0.5));
  meiaPx = clamp(meiaPx, minimo, uMaxPx * 0.5);
  vBrilho = brilhoEm(s);
  vCalor = calorEm(s);
  meiaPx += vCalor * 0.7;
  // Penugem só de perto e o halo de dentro precisam de pixels além do fio.
  float total = meiaPx + uMargemPx + uFuzzPx * vPerto + uHaloPx * min(vBrilho, 1.0);
  mv.xyz += lado * aLado * total * mpp;
  vS = s;
  vLado = aLado;
  vTotalPx = total;
  vMeiaPx = meiaPx;
  vLuzLado = dot(lado, uLuz);
  vLuzFrente = dot(frente, uLuz);
  vProf = prof;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENTO = /* glsl */ `
uniform vec3 uCor;
uniform vec3 uCorEscura;
uniform vec3 uCorClara;
uniform vec3 uCorQuente;
uniform vec3 uCorHalo;
uniform vec3 uCorTrans;
uniform vec3 uCorBrasa;
uniform float uHaloPx;
uniform float uFuzzPx;

varying float vS;
varying float vLado;
varying float vTotalPx;
varying float vMeiaPx;
varying float vFino;
varying float vPerto;
varying float vBrilho;
varying float vCalor;
varying float vLuzLado;
varying float vLuzFrente;
varying float vProf;

float acaso(float n) {
  return fract(sin(n * 12.9898) * 43758.5453);
}

void main() {
  // As derivadas vêm antes do discard: depois dele, os vizinhos do quadrado
  // de pixels podem já ter saído, e o fwidth da ponta viria errado.
  float fase = (vS + uFase) / uTranca;
  float detalhe = 1.0 - smoothstep(0.18, 0.62, fwidth(fase));
  float hs = vS / 0.0021 + sign(vLado) * 31.0;
  float miudo = 1.0 - smoothstep(0.35, 0.9, fwidth(hs));
  if (vS > uProgresso * uComprimento) discard;

  // Borda macia de um pixel do aparelho.
  float distPx = abs(vLado) * vTotalPx;
  float cobertura = clamp((vMeiaPx - distPx) / uMargemPx + 0.5, 0.0, 1.0);
  float fora = max(distPx - vMeiaPx, 0.0);

  // Seção redonda.
  float v = clamp(vLado * vTotalPx / vMeiaPx, -1.0, 1.0);
  float altura = sqrt(max(1.0 - v * v, 0.0));
  float luz = 0.5 + 0.5 * (v * vLuzLado + altura * vLuzFrente);

  // Algodão torcido: uma hélice de passo uTranca, com um sulco por volta. O
  // detalhe some antes de cintilar, quando a volta fica menor que um pixel.
  float w = fase + v * 0.62;
  float f = fract(w);
  float sulco = 1.0 - smoothstep(0.0, 0.2, f) * (1.0 - smoothstep(0.8, 1.0, f));
  float relevo = 1.0 - detalhe * (0.4 * sulco - 0.08 * sin(3.14159265 * f));

  vec3 cor = mix(uCorEscura, uCor, smoothstep(0.18, 0.86, luz));
  cor *= relevo * (0.84 + 0.16 * altura);
  float q = (f - 0.42 + v * 0.18) / 0.13;
  float faixa = exp(-q * q) * smoothstep(0.25, 0.95, luz);
  cor += uCorClara * faixa * 0.32 * detalhe;
  float sorte = acaso(floor(w));
  float pisca = pow(max(0.0, sin(uTempo * (0.5 + sorte) + sorte * 40.0)), 36.0);
  cor += vec3(1.0, 0.9, 0.84) * faixa * pisca * 0.7 * detalhe * step(0.55, sorte);
  cor += uCorClara * pow(clamp(luz, 0.0, 1.0), 7.0) * 0.14 * detalhe;

  // Translucidez na borda, mais forte contra a luz.
  float borda = pow(1.0 - altura, 1.6);
  float contra = clamp(0.45 - vLuzFrente * 0.6, 0.0, 1.0);
  cor = mix(cor, uCorTrans, borda * (0.25 + 0.4 * contra));

  // Num mundo claro é a luz vermelha que se lê, não a laranja.
  float b = clamp(vBrilho, 0.0, 1.0);
  cor = mix(cor, uCorQuente, b * (0.35 + 0.35 * altura));
  cor += vec3(1.0, 0.88, 0.8) * b * 0.4 * pow(altura, 8.0);

  float calor = clamp(vCalor, 0.0, 1.0);
  vec3 brasa = mix(vec3(1.0, 0.42, 0.2), uCorBrasa, smoothstep(0.35, 0.95, calor) * (0.45 + 0.55 * altura));
  cor = mix(cor, brasa, smoothstep(0.02, 0.6, calor));

  // Penugem: fiapos curtos para fora da borda, só de perto.
  float fuzzPx = uFuzzPx * vPerto;
  float fuzz = 0.0;
  if (fuzzPx > 0.05) {
    float id = floor(hs);
    float h = acaso(id);
    float comp = (0.25 + 0.75 * h * h) * fuzzPx;
    float inclina = (acaso(id + 7.0) - 0.5) * 0.9;
    float d = abs(fract(hs) - 0.5 + inclina * fora / max(fuzzPx, 0.1));
    float pelo = (1.0 - smoothstep(0.05, 0.15, d)) * (1.0 - smoothstep(comp * 0.6, comp, fora));
    float penugem = 0.16 * exp(-fora / 0.6);
    fuzz = max(pelo * 0.5 * step(0.35, h), penugem) * miudo;
  }

  // O halo de dentro, rente ao fio, quando ele acende.
  float halo = b * (0.55 * exp(-fora / max(uHaloPx * 0.22, 0.5)) + 0.35 * exp(-fora / max(uHaloPx * 0.6, 0.8)));
  halo *= 1.0 - smoothstep(uHaloPx * b * 0.75, uHaloPx * b + 0.01, fora);

  // Halo, penugem e fio, um sobre o outro (alfa pré-multiplicado).
  float aHalo = halo * (1.0 - cobertura);
  float aPelo = fuzz * (1.0 - cobertura);
  float aFio = cobertura * mix(0.22, 1.0, vFino);
  vec3 rgb = uCorHalo * aHalo;
  float a = aHalo;
  rgb = mix(uCorEscura, uCor, 0.55) * aPelo + rgb * (1.0 - aPelo);
  a = aPelo + a * (1.0 - aPelo);
  rgb = cor * aFio + rgb * (1.0 - aFio);
  a = aFio + a * (1.0 - aFio);
  if (a < 0.003) discard;

  float nevoa = smoothstep(uNevoaPerto, uNevoaLonge, vProf);
  vec3 corFinal = mix(rgb / a, uNevoaCor, nevoa * 0.85);
  a *= (1.0 - 0.35 * nevoa) * uOpacidade;
  gl_FragColor = vec4(corFinal * a, a);
}
`;

const VERTICE_HALO = /* glsl */ `
uniform float uHaloLargo;

varying float vS;
varying float vLado;
varying float vK;
varying float vCalor;
varying float vProf;

void main() {
  float s = aU * uComprimento;
  vec4 mv;
  vec3 lado;
  vec3 frente;
  naCamera(s, mv, lado, frente);
  float prof = max(-mv.z, 0.05);
  float calor = calorEm(s);
  float k = uHalo + brilhoEm(s) + calor * 0.8;
  // Largo de perto, estreito longe (em px), e nada quando não há luz.
  float meia = uHaloLargo * mix(1.0, 0.42, smoothstep(1.5, 9.0, prof)) * (0.65 + 0.35 * min(k, 1.5));
  meia *= step(0.002, k);
  mv.xyz += lado * aLado * meia * metroPorPxEm(prof);
  vS = s;
  vLado = aLado;
  vK = k;
  vCalor = calor;
  vProf = prof;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENTO_HALO = /* glsl */ `
uniform vec3 uCorHaloA;
uniform vec3 uCorHaloB;
uniform float uAditivo;

varying float vS;
varying float vLado;
varying float vK;
varying float vCalor;
varying float vProf;

void main() {
  if (vS > uProgresso * uComprimento) discard;
  float l2 = vLado * vLado;
  float largo = exp(-4.2 * l2);
  float miolo = exp(-34.0 * l2);
  float a = min(vK, 1.6) * (0.46 * largo + 0.5 * miolo)
    * (1.0 - 0.7 * smoothstep(uNevoaPerto, uNevoaLonge, vProf)) * uOpacidade;
  if (a < 0.002) discard;
  vec3 cor = mix(uCorHaloA, uCorHaloB, clamp(miolo * (0.4 + 0.6 * min(vK, 1.0)) + vCalor * 0.5, 0.0, 1.0));
  gl_FragColor = vec4(cor * a, a * uAditivo);
}
`;

const VERTICE_SOMBRA = /* glsl */ `
varying float vS;
varying float vLado;
varying float vForca;
varying float vProf;

// A luz vem de cima, um pouco de lado e de trás: a sombra escorrega pelo chão
// conforme o fio sobe.
vec3 noChao(vec3 p) {
  float h = max(p.y, 0.0);
  return vec3(p.x + 0.4 * h + 0.004, 0.0015, p.z - 0.55 * h);
}

void main() {
  float s = aU * uComprimento;
  vec3 p = balanco(position, s, aSolto);
  vec3 a = noChao(balanco(aAnterior, s - uPasso, aSolto));
  vec3 b = noChao(balanco(aProximo, s + uPasso, aSolto));
  vec3 dir = b - a;
  vec3 lado = vec3(-dir.z, 0.0, dir.x);
  float l = length(lado);
  lado = l > 1e-10 ? lado / l : vec3(1.0, 0.0, 0.0);
  float h = max(p.y, 0.0);
  // Só sombra de contato: o que está no ar não marca o chão.
  vForca = exp(-12.0 * h) * (1.0 - smoothstep(0.06, 0.28, h));
  float largura = (larguraEm(s) * (2.6 + 5.0 * h) + 0.012 + 0.05 * h) * step(0.001, vForca);
  vec4 mv = modelViewMatrix * vec4(noChao(p) + lado * aLado * largura * 0.5, 1.0);
  vS = s;
  vLado = aLado;
  vProf = max(-mv.z, 0.05);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENTO_SOMBRA = /* glsl */ `
uniform vec3 uCorSombra;

varying float vS;
varying float vLado;
varying float vForca;
varying float vProf;

void main() {
  float atras = uProgresso * uComprimento - vS;
  if (atras < 0.0) discard;
  float borda = 1.0 - smoothstep(0.05, 1.0, abs(vLado));
  float a = 0.3 * borda * borda * vForca * smoothstep(0.0, 0.3, atras)
    * (1.0 - smoothstep(uNevoaPerto, uNevoaLonge, vProf)) * uOpacidade;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uCorSombra * a, a);
}
`;

/* ---- shaders das luzes (estrela, pólen e brasas) ------------------------------ */

const VERTICE_LUZ = /* glsl */ `
attribute vec4 aDados; // x: diâmetro (m), y: alfa, z: 1 na estrela, w: calor (rosa → ouro)

uniform vec2 uTela;
uniform float uDpr;
uniform float uEstrelaMin;
uniform vec2 uNevoa;
uniform float uPontoMax;

varying float vAlfa;
varying float vEstrela;
varying float vCalor;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float prof = max(-mv.z, 0.05);
  float px = aDados.x * projectionMatrix[1][1] * uTela.y * 0.5 / prof;
  float estrela = step(0.5, aDados.z);
  px = estrela > 0.5 ? clamp(px, uEstrelaMin, uEstrelaMin * 2.8) : clamp(px, 4.0, 13.0);
  vAlfa = aDados.y * (1.0 - smoothstep(uNevoa.x, uNevoa.y, prof) * (estrela > 0.5 ? 0.35 : 1.0));
  vEstrela = estrela;
  vCalor = aDados.w;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aDados.y > 0.001 ? min(px * uDpr, uPontoMax) : 0.0;
}
`;

const FRAGMENTO_LUZ = /* glsl */ `
uniform float uGiro;
uniform float uOpacidade;
uniform float uAditivo;
uniform vec3 uOuro;
uniform vec3 uRosa;
uniform vec3 uBranco;

varying float vAlfa;
varying float vEstrela;
varying float vCalor;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float r = sqrt(r2);
  vec3 cor;
  float a;
  if (vEstrela > 0.5) {
    float c = cos(uGiro);
    float s = sin(uGiro);
    vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    float miolo = exp(-140.0 * r2);
    float coroa = exp(-26.0 * r2) * 0.85;
    float halo = exp(-7.0 * r2) * 0.42 + exp(-2.4 * r2) * 0.2;
    // Quatro raios finos (os dois de pé maiores) e quatro curtos na diagonal.
    float raios = exp(-abs(q.y) * 70.0) * pow(max(1.0 - abs(q.x), 0.0), 2.0)
      + exp(-abs(q.x) * 70.0) * pow(max(1.0 - abs(q.y) * 1.25, 0.0), 2.0) * 0.8;
    vec2 d = vec2(q.x + q.y, q.x - q.y) * 0.7071;
    raios += (exp(-abs(d.y) * 90.0) * pow(max(1.0 - abs(d.x) * 2.2, 0.0), 2.0)
      + exp(-abs(d.x) * 90.0) * pow(max(1.0 - abs(d.y) * 2.2, 0.0), 2.0)) * 0.45;
    a = clamp(miolo + coroa + halo + raios * 0.9, 0.0, 1.0) * (1.0 - smoothstep(0.82, 1.0, r));
    vec3 tom = mix(uRosa, mix(uRosa, uOuro, 0.55), clamp(coroa * 1.4, 0.0, 1.0));
    cor = mix(tom, uBranco, clamp(miolo * 2.0 + raios * 0.8 + coroa * 0.35, 0.0, 1.0));
  } else {
    float miolo = exp(-22.0 * r2);
    a = min(1.0, exp(-6.0 * r2) * 1.2) * (1.0 - smoothstep(0.8, 1.0, r));
    cor = mix(mix(uRosa, uOuro, vCalor), uBranco, miolo * 0.7);
  }
  a *= vAlfa * uOpacidade;
  if (a < 0.002) discard;
  gl_FragColor = vec4(cor * a, a * uAditivo);
}
`;

// Cor em sRGB cru: o three converteria o hex para linear, e sem
// colorspace_fragment o vermelho sairia mais escuro que o escolhido.
function cru(THREE, hex) {
  return new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace ?? 'srgb-linear');
}

/* ---- luzes: a estrela na ponta, o pólen e as brasas -----------------------------
   Um THREE.Points com LUZES[nível] + 1 partículas simuladas na CPU; a de índice
   0 é a estrela. O pólen que a estrela deixa para trás desce devagar, balança e
   pisca quando pega a luz; sem ele, sobe (a luz do pulso, o laço que se
   desfaz). Só existe com WebGL e sem movimento reduzido.
   ---------------------------------------------------------------------------- */
function criarLuzes(mundo, pontoVivo, comuns) {
  const THREE = mundo.THREE;
  const N = (LUZES[mundo.amb?.nivel] ?? LUZES.alto) + 1;
  const pos = new Float32Array(N * 3);
  const dados = new Float32Array(N * 4);
  const vel = new Float32Array(N * 3);
  const idade = new Float32Array(N);
  const vida = new Float32Array(N);
  const peso = new Float32Array(N);
  const base = new Float32Array(N);
  dados[2] = 1; // a estrela
  const sorte = semente(2312);
  const tmp = new THREE.Vector3();
  const estado = { estrela: 0, taxaPonta: 0, escala: 1, taxaPulso: 0 };
  let proxima = 1;
  let acumPonta = 0;
  let acumPulso = 0;

  const geometria = new THREE.BufferGeometry();
  const atributoPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const atributoDados = new THREE.BufferAttribute(dados, 4).setUsage(THREE.DynamicDrawUsage);
  geometria.setAttribute('position', atributoPos);
  geometria.setAttribute('aDados', atributoDados);

  // A estrela chega a ~150 px CSS × DPR: o ponto não pode passar do teto da GPU.
  let pontoMax = 256;
  try {
    const gl = mundo.renderer?.getContext?.();
    pontoMax = Number(gl?.getParameter(gl.ALIASED_POINT_SIZE_RANGE)?.[1]) || 256;
  } catch {
    /* fica o teto conservador */
  }

  const u = {
    uTela: comuns.uTela,
    uOpacidade: comuns.uOpacidade,
    uDpr: { value: 1 },
    uEstrelaMin: { value: 54 },
    uNevoa: { value: new THREE.Vector2(3.5, 11) },
    uPontoMax: { value: pontoMax },
    uGiro: { value: 0 },
    uAditivo: { value: 0.5 },
    uOuro: { value: cru(THREE, 0xffb04a) },
    uRosa: { value: cru(THREE, 0xff2a3e) },
    uBranco: { value: cru(THREE, 0xfff8ec) },
  };
  const material = misturaDeLuz(THREE, new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: VERTICE_LUZ,
    fragmentShader: FRAGMENTO_LUZ,
    transparent: true,
    depthWrite: false,
  }));
  // Escondido pelo material: o three pula o desenho, e o compileAsync de quem
  // chama compila o programa junto com o grupo (a primeira estrela não engasga).
  material.visible = false;
  const objeto = new THREE.Points(geometria, material);
  objeto.name = 'fio-luzes';
  objeto.renderOrder = 6;
  objeto.frustumCulled = false;

  function soltar(x, y, z, forca = 1, cair = false) {
    const i = proxima;
    proxima = proxima + 1 >= N ? 1 : proxima + 1;
    const o = i * 3;
    const d = i * 4;
    const angulo = sorte() * Math.PI * 2;
    const v = (cair ? 0.02 + 0.05 * sorte() : 0.03 + 0.1 * sorte()) * forca;
    pos[o] = x + (sorte() - 0.5) * 0.02;
    pos[o + 1] = y + (sorte() - 0.5) * 0.02;
    pos[o + 2] = z + (sorte() - 0.5) * 0.02;
    vel[o] = Math.cos(angulo) * v;
    vel[o + 1] = cair ? -0.01 + 0.05 * sorte() : 0.05 + 0.12 * sorte() * forca;
    vel[o + 2] = Math.sin(angulo) * v;
    vida[i] = cair ? 2.2 + 2.4 * sorte() : 1.4 + 1.8 * sorte();
    peso[i] = cair ? 0.05 + 0.04 * sorte() : -0.06;
    base[i] = cair ? 0.007 + 0.01 * sorte() : 0.006 + 0.008 * sorte();
    idade[i] = 0;
    dados[d] = 0;
    dados[d + 1] = 0;
    dados[d + 2] = 0;
    dados[d + 3] = sorte() < 0.4 ? 1 : 0.35 * sorte(); // 40% saem ouro
  }

  function rajada(x, y, z, quantas) {
    for (let k = 0; k < Math.min(quantas, N - 1); k++) soltar(x, y, z, 1.3, false);
  }

  function atualizar(dt, t, sDe, sAte, ligado) {
    let algo = false;

    // A estrela na ponta, deixando pólen pelo trecho que ela acabou de percorrer.
    if (ligado && estado.estrela > 0.002) {
      pontoVivo(sAte, tmp);
      pos[0] = tmp.x;
      pos[1] = tmp.y;
      pos[2] = tmp.z;
      const cintila = 0.88 + 0.12 * Math.sin(9.3 * t) * Math.sin(5.1 * t + 1);
      dados[0] = 0.13 * cintila * estado.escala;
      dados[1] = estado.estrela;
      u.uEstrelaMin.value = 54 * Math.max(0.6, estado.escala);
      u.uGiro.value = 0.35 * t;
      acumPonta = Math.min(acumPonta + dt * estado.taxaPonta * estado.estrela, 8);
      while (acumPonta >= 1) {
        acumPonta -= 1;
        pontoVivo(sAte > sDe ? sDe + (sAte - sDe) * sorte() : sAte, tmp);
        soltar(tmp.x, tmp.y, tmp.z, 1, true);
      }
      algo = true;
    } else {
      dados[0] = 0;
      dados[1] = 0;
      acumPonta = 0;
    }

    // As brasas que sobem de onde o pulso está passando.
    const sPulso = comuns.uPulsoS.value;
    const fim = comuns.uProgresso.value * comuns.uComprimento.value;
    if (ligado && comuns.uPulsoK.value > 0.05 && estado.taxaPulso > 0 && sPulso >= 0 && sPulso <= fim) {
      acumPulso = Math.min(acumPulso + dt * estado.taxaPulso, 8);
      while (acumPulso >= 1) {
        acumPulso -= 1;
        pontoVivo(clamp(sPulso + (sorte() - 0.5) * comuns.uPulsoL.value, 0, fim), tmp);
        soltar(tmp.x, tmp.y, tmp.z, 0.7, false);
      }
    } else {
      acumPulso = 0;
    }

    const amortece = Math.exp(-1.6 * dt);
    for (let i = 1; i < N; i++) {
      if (vida[i] <= 0) continue;
      const d = i * 4;
      idade[i] += dt;
      const k = idade[i] / vida[i];
      if (k >= 1) {
        vida[i] = 0;
        dados[d] = 0;
        dados[d + 1] = 0;
        continue;
      }
      const o = i * 3;
      vel[o] = vel[o] * amortece + Math.sin(1.7 * t + i) * 0.03 * dt;
      vel[o + 2] = vel[o + 2] * amortece + Math.cos(1.3 * t + 0.7 * i) * 0.03 * dt;
      vel[o + 1] = vel[o + 1] * amortece - peso[i] * dt;
      pos[o] += vel[o] * dt;
      pos[o + 1] += vel[o + 1] * dt;
      pos[o + 2] += vel[o + 2] * dt;
      if (pos[o + 1] < 0.01) {
        pos[o + 1] = 0.01;
        vel[o + 1] = 0;
      }
      const piscar = 0.62 + 0.25 * Math.sin(t * (6 + (i % 5)) + i)
        + 0.5 * Math.max(0, Math.sin(t * (2.2 + (i % 7) * 0.4) + 1.7 * i)) ** 14;
      dados[d] = base[i] * (1 - 0.45 * k);
      dados[d + 1] = Math.min(1, idade[i] / 0.25) * (1 - k * k) * piscar;
      algo = true;
    }

    // Sem estrela e sem partícula viva, o Points nem é desenhado.
    material.visible = algo;
    if (algo) {
      atributoPos.needsUpdate = true;
      atributoDados.needsUpdate = true;
    }
  }

  return {
    objeto,
    soltar,
    rajada,
    atualizar,
    estrela(v, taxa, escala) {
      if (v !== undefined) estado.estrela = clamp(Number(v) || 0);
      if (taxa !== undefined) estado.taxaPonta = Math.max(0, Number(taxa) || 0);
      if (escala !== undefined) estado.escala = Math.max(0.1, Number(escala) || 0);
      return estado.estrela;
    },
    taxaPulso(v) {
      estado.taxaPulso = v;
    },
    nevoa(perto, longe) {
      u.uNevoa.value.set(perto, longe);
    },
    ajustar(tamanho) {
      u.uDpr.value = Math.max(0.5, Number(tamanho?.dpr) || 1);
    },
    dispose() {
      geometria.dispose();
      material.dispose();
    },
  };
}

/* ---- o fio 3D ----------------------------------------------------------------- */
function criarFio3D(mundo, opcoes) {
  const THREE = mundo.THREE;
  const amb = mundo.amb || {};
  const reduzido = !!amb.reduzido;
  const seg = SEGMENTOS[amb.nivel] ?? SEGMENTOS.alto;
  const n = seg + 1;
  const amostrador = criarAmostrador(seg, new THREE.Vector3());

  const largura = numero(opcoes.largura, 0.012);
  const baixo = amb.nivel === 'baixo';

  // Uniforms compartilhados (os mesmos objetos) por fita, halo e sombra.
  const u = {
    uComprimento: { value: 1e-4 },
    uProgresso: { value: 0 },
    uLargura: { value: largura },
    uLarguraInicio: { value: numero(opcoes.larguraInicio, largura) },
    uLarguraFim: { value: numero(opcoes.larguraFim, largura) },
    uCrescer: { value: numero(opcoes.crescerEm, 2) },
    uAfinar: { value: numero(opcoes.afinarEm, 1.2) },
    uPonta: { value: 0.3 },
    uOpacidade: { value: 1 },
    uAceso: { value: 0 },
    uPulsoS: { value: SEM_PULSO },
    uPulsoK: { value: 0 },
    uPulsoL: { value: 0.5 },
    uRastro: { value: 0 },
    uRastroL: { value: 0.4 },
    uHalo: { value: 0 },
    uFase: { value: 0 },
    // A torção nasce com a largura da criação: mudar a largura depois não a acompanha.
    uTranca: { value: largura * 1.25 },
    uVento: { value: reduzido ? 0.35 : 1 },
    uTempo: { value: 0 },
    uPasso: { value: 1e-4 / seg },
    uTela: { value: new THREE.Vector2(1, 1) },
    uMargemPx: { value: 1 },
    uNevoaCor: { value: new THREE.Color(1, 1, 1) },
  };
  const novaNevoa = () => ({ uNevoaPerto: { value: 2.5 }, uNevoaLonge: { value: 9.5 } });
  const nevoaFita = novaNevoa();
  const nevoaHalo = novaNevoa();
  const nevoaSombra = novaNevoa();
  const uHaloPx = { value: baixo ? 5 : 9 };
  const uFuzzPx = { value: baixo ? 0 : 2.2 };
  const uHaloLargo = { value: baixo ? 13 : 19 };

  // A geometria: dois vértices por ponto, dois triângulos por segmento.
  const posicoes = new Float32Array(n * 6);
  const anteriores = new Float32Array(n * 6);
  const proximos = new Float32Array(n * 6);
  const lados = new Float32Array(n * 2);
  const us = new Float32Array(n * 2);
  const soltosV = new Float32Array(n * 2);
  const soltos = new Float32Array(n);
  const indices = new Uint16Array(seg * 6);
  for (let i = 0; i < n; i++) {
    lados[i * 2] = -1;
    lados[i * 2 + 1] = 1;
    us[i * 2] = i / seg;
    us[i * 2 + 1] = i / seg;
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    const o = i * 6;
    indices[o] = a;
    indices[o + 1] = a + 1;
    indices[o + 2] = a + 2;
    indices[o + 3] = a + 1;
    indices[o + 4] = a + 3;
    indices[o + 5] = a + 2;
  }
  const dinamico = (dados, k) => new THREE.BufferAttribute(dados, k).setUsage(THREE.DynamicDrawUsage);
  const atributoPos = dinamico(posicoes, 3);
  const atributoAnt = dinamico(anteriores, 3);
  const atributoProx = dinamico(proximos, 3);
  const atributoSolto = dinamico(soltosV, 1);
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', atributoPos);
  geometria.setAttribute('aAnterior', atributoAnt);
  geometria.setAttribute('aProximo', atributoProx);
  geometria.setAttribute('aSolto', atributoSolto);
  geometria.setAttribute('aLado', new THREE.BufferAttribute(lados, 1));
  geometria.setAttribute('aU', new THREE.BufferAttribute(us, 1));
  geometria.setIndex(new THREE.BufferAttribute(indices, 1));

  // A fita vira de lado conforme o caminho, por isso DoubleSide; forceSinglePass
  // evita que o three desenhe cada malha transparente duas vezes (verso e frente).
  const comum = { transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true };
  const materialFita = misturaDeLuz(THREE, new THREE.ShaderMaterial({
    ...comum,
    uniforms: {
      ...u,
      ...nevoaFita,
      uHaloPx,
      uFuzzPx,
      uMinPx: { value: MIN_PX },
      uMaxPx: { value: Math.max(MIN_PX, numero(opcoes.maxPx, MAX_PX)) },
      uLuz: { value: new THREE.Vector3(-0.35, 0.72, 0.6).normalize() },
      uCor: { value: cru(THREE, 0xd7192d) },
      uCorEscura: { value: cru(THREE, 0x8f0b1d) },
      uCorClara: { value: cru(THREE, 0xff8f8a) },
      uCorQuente: { value: cru(THREE, 0xff4a4e) },
      uCorHalo: { value: cru(THREE, 0xff3d55) },
      uCorTrans: { value: cru(THREE, 0xff5b46) },
      uCorBrasa: { value: cru(THREE, 0xfff3e2) },
    },
    vertexShader: COMUM + VERTICE_BASE + VERTICE,
    fragmentShader: COMUM + FRAGMENTO,
  }));
  const materialHalo = misturaDeLuz(THREE, new THREE.ShaderMaterial({
    ...comum,
    uniforms: {
      ...u,
      ...nevoaHalo,
      uHaloLargo,
      uAditivo: { value: 0.3 },
      uCorHaloA: { value: cru(THREE, 0xff1f3a) },
      uCorHaloB: { value: cru(THREE, 0xffb070) },
    },
    vertexShader: COMUM + VERTICE_BASE + VERTICE_HALO,
    fragmentShader: COMUM + FRAGMENTO_HALO,
  }));
  const materialSombra = opcoes.sombra === false ? null : misturaDeLuz(THREE, new THREE.ShaderMaterial({
    ...comum,
    // 1,5 mm acima do chão: o deslocamento evita a briga de profundidade ao longe.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    uniforms: { ...u, ...nevoaSombra, uCorSombra: { value: cru(THREE, 0x3a1820) } },
    vertexShader: COMUM + VERTICE_BASE + VERTICE_SOMBRA,
    fragmentShader: COMUM + FRAGMENTO_SOMBRA,
  }));

  // Ordem: sombra (3), halo (3,5), fita (4), luzes (6). Trocar faz o brilho
  // sumir atrás da fita.
  const malha = (material, nome, ordem) => {
    const m = new THREE.Mesh(geometria, material);
    m.name = nome;
    m.renderOrder = ordem;
    m.frustumCulled = false;
    return m;
  };
  const grupo = new THREE.Group();
  grupo.name = 'fio';
  grupo.add(malha(materialHalo, 'fio-halo', 3.5), malha(materialFita, 'fio', 4));
  if (materialSombra) grupo.add(malha(materialSombra, 'fio-sombra', 3));
  const luzes = reduzido ? null : criarLuzes(mundo, pontoVivo, u);
  if (luzes) grupo.add(luzes.objeto);

  const tmp = new THREE.Vector3();
  const calma = { k: 0 }; // o pulso no movimento reduzido: o fio inteiro acende, parado
  const trilha = { u: 0, ativa: false };
  let acesoBase = 0;
  let respiro = 0;
  let desde = 0;
  let pulsoAtual = null;
  let fimPulso = null;
  let sAnterior = NaN;
  let velocidade = 0;
  let corNevoa = -1;
  let descartado = false;

  /** Recalcula os vértices. Não aloca: a mão chama a cada quadro. */
  function definirCurva(c) {
    if (descartado || !amostrador.definir(c)) return false;
    const p = amostrador.pontos;
    const total = amostrador.total;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const v = o * 2;
      for (let k = 0; k < 3; k++) {
        const atual = p[o + k];
        // Nas pontas, o reflexo do segundo ponto.
        const antes = i > 0 ? p[o - 3 + k] : 2 * atual - p[o + 3 + k];
        const depois = i < seg ? p[o + 3 + k] : 2 * atual - p[o - 3 + k];
        posicoes[v + k] = atual;
        posicoes[v + 3 + k] = atual;
        anteriores[v + k] = antes;
        anteriores[v + 3 + k] = antes;
        proximos[v + k] = depois;
        proximos[v + 3 + k] = depois;
      }
      // Vento só no ar: nada no chão, nada perto das pontas presas.
      const s = (total * i) / seg;
      const noAr = clamp((p[o + 1] - 0.05) / 0.45);
      const preso = clamp(Math.min(s, total - s) / 0.5);
      const solto = noAr * noAr * (3 - 2 * noAr) * preso;
      soltos[i] = solto;
      soltosV[i * 2] = solto;
      soltosV[i * 2 + 1] = solto;
    }
    atributoPos.needsUpdate = true;
    atributoAnt.needsUpdate = true;
    atributoProx.needsUpdate = true;
    atributoSolto.needsUpdate = true;
    const comprimento = Math.max(total, 1e-4);
    u.uComprimento.value = comprimento;
    u.uPasso.value = comprimento / seg;
    u.uPonta.value = Math.min(0.3, total * 0.2);
    return true;
  }

  /** O ponto a `s` metros, com o mesmo vento do vertex shader (local ao grupo). */
  function pontoVivo(s, saida) {
    amostrador.pontoEm(s, saida);
    const total = amostrador.total;
    const f = total > 0 ? clamp(s / total) * seg : 0;
    const i = Math.min(seg - 1, Math.floor(f));
    const a = u.uVento.value * (soltos[i] + (soltos[i + 1] - soltos[i]) * (f - i));
    if (a > 0) {
      const t = u.uTempo.value;
      saida.x += (Math.sin(1.13 * t + 2.1 * s) * 0.016 + Math.sin(0.47 * t + 0.9 * s) * 0.014) * a;
      saida.y += Math.sin(0.83 * t + 2.9 * s + 1.7) * 0.006 * a;
      saida.z += Math.cos(0.97 * t + 1.6 * s) * 0.01 * a;
    }
    return saida;
  }

  function ajustarTela() {
    const t = mundo.tamanho || {};
    u.uTela.value.set(Number(t.largura) || innerWidth, Number(t.altura) || innerHeight);
    // Borda macia de um pixel do aparelho, medida em pixels CSS.
    u.uMargemPx.value = 1 / Math.max(1, Number(t.dpr) || 1);
    luzes?.ajustar(t);
  }

  // No nível baixo o halo encolhe e a penugem some (os buffers ficam como estão).
  function aplicarNivel(nivel) {
    const b = nivel === 'baixo';
    uHaloPx.value = b ? 5 : 9;
    uFuzzPx.value = b ? 0 : 2.2;
    uHaloLargo.value = b ? 13 : 19;
  }

  // Na alameda o caminho segue visível muito além da névoa das cartas.
  function lerNevoa() {
    const fog = mundo.cena?.fog;
    let perto = 2.5;
    let longe = 9.5;
    let luzPerto = 3.5;
    let luzLonge = 11;
    if (mundo.alameda) {
      perto = 7;
      longe = 24;
      luzPerto = 8;
      luzLonge = 28;
    } else if (fog) {
      perto = numero(fog.near, 2.5);
      longe = numero(fog.far, 9.5);
      luzPerto = perto + 1;
      luzLonge = longe * 1.15;
    }
    nevoaFita.uNevoaPerto.value = perto;
    nevoaFita.uNevoaLonge.value = longe * 1.2;
    nevoaHalo.uNevoaPerto.value = perto;
    nevoaHalo.uNevoaLonge.value = longe * 1.25;
    nevoaSombra.uNevoaPerto.value = perto;
    nevoaSombra.uNevoaLonge.value = longe;
    luzes?.nevoa(luzPerto, luzLonge);
    const hex = typeof fog?.color?.getHex === 'function' ? fog.color.getHex() : 0xffffff;
    if (hex !== corNevoa) {
      corNevoa = hex;
      u.uNevoaCor.value.setHex(hex, THREE.LinearSRGBColorSpace ?? 'srgb-linear');
    }
  }

  function aplicarAceso() {
    let onda = 0;
    if (respiro > 0) {
      const c = ((((u.uTempo.value - desde) % CICLO_RESPIRO) + CICLO_RESPIRO) % CICLO_RESPIRO) / CICLO_RESPIRO;
      onda = Math.sin(Math.PI * c) ** 4;
    }
    u.uAceso.value = acesoBase + respiro * onda + calma.k;
  }

  function quadro(dt, t) {
    u.uTempo.value = t;
    lerNevoa();
    const total = amostrador.total;
    const sAgora = u.uProgresso.value * total;
    if (!Number.isFinite(sAnterior)) sAnterior = sAgora;
    // O rastro alonga com a velocidade da ponta (m/s, até 12).
    if (dt > 0) {
      const v = Math.max(0, (sAgora - sAnterior) / dt);
      velocidade += (Math.min(v, 12) - velocidade) * (1 - Math.exp(-3 * dt));
      u.uRastroL.value = clamp(velocidade * 0.9, 0.12, 1.5);
    }
    if (trilha.ativa) u.uPulsoS.value = trilha.u * total;
    aplicarAceso();
    const visivel = u.uOpacidade.value > 0.001;
    const desenhado = visivel && sAgora > 1e-4;
    materialFita.visible = desenhado;
    if (materialSombra) materialSombra.visible = desenhado;
    materialHalo.visible = desenhado && (u.uHalo.value > 0.001 || u.uAceso.value > 0.001
      || u.uPulsoK.value > 0.001 || u.uRastro.value > 0.001);
    luzes?.atualizar(dt, t, sAnterior, sAgora, visivel);
    sAnterior = sAgora;
  }

  function pararPulso() {
    pulsoAtual?.kill();
    pulsoAtual = null;
    trilha.ativa = false;
    const resolver = fimPulso;
    fimPulso = null;
    resolver?.();
  }

  // Um pulso novo corta o anterior, cuja Promise resolve na hora.
  function pulso({ de = 0, ate = 1, duracao = 2.4, forca = 1, largura: larguraPulso = 0.5, brasas = 0, curva = 'power1.inOut' } = {}) {
    const gsap = window.gsap;
    pararPulso();
    if (!gsap || descartado) return Promise.resolve();
    const d = Math.max(0.05, numero(duracao, 2.4));
    const k = Math.max(0, numero(forca, 1));
    return new Promise((resolve) => {
      fimPulso = resolve;
      const terminar = () => {
        if (fimPulso === resolve) {
          fimPulso = null;
          pulsoAtual = null;
          trilha.ativa = false;
        }
        resolve();
      };
      if (reduzido) {
        pulsoAtual = gsap.timeline({ onComplete: terminar })
          .to(calma, { k: k * 0.6, duration: d * 0.4, ease: 'sine.inOut' })
          .to(calma, { k: 0, duration: d * 0.6, ease: 'sine.inOut' });
        return;
      }
      u.uPulsoL.value = Math.max(0.05, numero(larguraPulso, 0.5));
      luzes?.taxaPulso(Math.max(0, numero(brasas, 0)));
      trilha.ativa = true;
      pulsoAtual = gsap.timeline({
        onComplete: () => {
          u.uPulsoS.value = SEM_PULSO;
          terminar();
        },
      })
        .fromTo(trilha, { u: numero(de, 0) }, { u: numero(ate, 1), duration: d, ease: curva || 'none' }, 0)
        .to(u.uPulsoK, { value: k, duration: Math.min(0.5, 0.25 * d), ease: 'power2.out' }, 0)
        .to(u.uPulsoK, { value: 0, duration: Math.min(0.7, 0.3 * d), ease: 'power1.in' }, 0.82 * d);
    });
  }

  ajustarTela();
  lerNevoa();
  if (opcoes.curva) definirCurva(opcoes.curva);
  const pararTela = mundo.aoRedimensionar?.(ajustarTela);
  const pararNivel = mundo.aoMudarNivel?.(aplicarNivel);
  const pararQuadro = mundo.aoQuadro?.(quadro);

  function dispose() {
    if (descartado) return;
    descartado = true;
    pararPulso();
    for (const parar of [pararQuadro, pararTela, pararNivel]) {
      if (typeof parar === 'function') parar();
    }
    grupo.parent?.remove(grupo);
    geometria.dispose();
    materialFita.dispose();
    materialHalo.dispose();
    materialSombra?.dispose();
    luzes?.dispose();
  }

  return {
    objeto: grupo,
    get comprimento() {
      return amostrador.total;
    },
    progresso(p) {
      if (p !== undefined && Number.isFinite(Number(p))) u.uProgresso.value = clamp(Number(p));
      return u.uProgresso.value;
    },
    // definirCurva(c, extras?): os `extras` (perfil, sombraDe) só valem na versão leve.
    definirCurva,
    fase(m) {
      if (m !== undefined && Number.isFinite(Number(m))) u.uFase.value = Number(m);
      return u.uFase.value;
    },
    // Uma só opacidade para fita, halo, sombra e luzes.
    opacidade(v) {
      if (v !== undefined) u.uOpacidade.value = clamp(Number(v) || 0);
      return u.uOpacidade.value;
    },
    acender(v) {
      if (v !== undefined) {
        acesoBase = Math.max(0, Number(v) || 0);
        aplicarAceso();
      }
      return acesoBase;
    },
    respirar(k = 0.22) {
      respiro = Math.max(0, Number(k) || 0);
      desde = u.uTempo.value;
      aplicarAceso();
    },
    rastro(v) {
      if (v !== undefined) u.uRastro.value = clamp(Number(v) || 0, 0, 1.5);
      return u.uRastro.value;
    },
    // Sem as luzes (movimento reduzido) não há estrela: devolve 0.
    estrela(v, taxa, escala) {
      return luzes ? luzes.estrela(v, taxa, escala) : 0;
    },
    halo(v) {
      if (v !== undefined) u.uHalo.value = Math.max(0, Number(v) || 0);
      return u.uHalo.value;
    },
    pulso,
    /** O ponto do fio na fração `u` (padrão: a ponta), em coordenadas do mundo. */
    pontoEm(fracao, saida = new THREE.Vector3()) {
      const f = fracao === undefined ? u.uProgresso.value : clamp(Number(fracao) || 0);
      pontoVivo(f * amostrador.total, saida);
      if (typeof saida.applyMatrix4 !== 'function') return saida;
      grupo.updateWorldMatrix(true, false);
      return grupo.localToWorld(saida);
    },
    /** Uma faísca de brasas num ponto do mundo (a âncora dele, o laço da carta). */
    faiscar(ponto, quantas = 18) {
      if (!luzes || descartado || !ponto) return;
      const x = Number(ponto.x);
      const y = Number(ponto.y);
      const z = Number(ponto.z ?? 0);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
      grupo.updateWorldMatrix(true, false);
      grupo.worldToLocal(tmp.set(x, y, z));
      luzes.rajada(tmp.x, tmp.y, tmp.z, Math.max(0, Math.round(numero(Number(quantas), 18))));
    },
    // O fio anda sozinho pelo mundo.aoQuadro; fica aqui pela API comum.
    atualizar() {},
    dispose,
  };
}

/* ---- o fio leve (SVG) ------------------------------------------------------------
   O mesmo fio em pixels de tela, dentro de mundo.recipienteLeve. A curva chega
   como lista de {px, py} (a mão projeta com a câmera leve) e a largura de cada
   trecho vem do perfil [[u, px], ...] (ou uma largura por ponto). Mesma API:
   pulso só acende e apaga o fio inteiro; rastro e fase devolvem 0; faiscar e
   atualizar não fazem nada; a estrela não existe no movimento reduzido.
   ---------------------------------------------------------------------------- */
function criarFioLeve(mundo, opcoes) {
  const seg = SEGMENTOS_LEVE;
  const amostrador = criarAmostrador(seg, vetorLeve(), true);
  const reduzido = !!mundo?.amb?.reduzido || document.documentElement.classList.contains('reduzido');
  const maxPx = Math.max(MIN_PX, numero(opcoes.maxPx, MAX_PX));
  contadorLeve += 1;
  const id = `fio-torcao-${contadorLeve}`;

  // Estilos inline: o fio aparece mesmo sem o CSS da cena.
  const raiz = svg(`
    <svg class="fio-leve" aria-hidden="true" focusable="false"
      style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none">
      <defs>
        <pattern id="${id}" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
          <rect width="1.15" height="3.2" fill="#8f0b1d" fill-opacity="0.5"/>
          <rect x="1.6" width="0.55" height="3.2" fill="#ff8f8a" fill-opacity="0.45"/>
        </pattern>
        <filter id="${id}-brilho" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
          <feGaussianBlur stdDeviation="3.2"/>
        </filter>
      </defs>
      <path class="fio-leve-halo" fill="#ff4a3a" filter="url(#${id}-brilho)" display="none"/>
      <path class="fio-leve-sombra" fill="#2a1b22" fill-opacity="0.1" style="fill:var(--tinta, #2a1b22)"/>
      <path class="fio-leve-fita" fill="#d7192d" style="fill:var(--fio, #d7192d)"/>
      <path class="fio-leve-torcao" fill="url(#${id})"/>
      <g class="fio-leve-estrela-g" display="none">
        <circle class="fio-leve-coroa" r="14" fill="#ff5a3c" fill-opacity="0.28" filter="url(#${id}-brilho)"/>
        <path class="fio-leve-raios" d="M-22 0H22M0-15V15" fill="none" stroke="#ffd9b0" stroke-opacity="0.8"
          stroke-width="1.2" stroke-linecap="round"/>
        <circle class="fio-leve-estrela" r="3.2" fill="#fff3dc" stroke="#ffb04a" stroke-opacity="0.55" stroke-width="3"/>
      </g>
    </svg>`);
  const halo = raiz.querySelector('.fio-leve-halo');
  const sombra = raiz.querySelector('.fio-leve-sombra');
  const fita = raiz.querySelector('.fio-leve-fita');
  const torcao = raiz.querySelector('.fio-leve-torcao');
  const estrelaG = raiz.querySelector('.fio-leve-estrela-g');
  (mundo?.recipienteLeve || document.getElementById('mundo-leve'))?.append(raiz);

  const tmp = vetorLeve();
  const luzPulso = { k: 0 };
  let atual = 0;
  // O perfil em dois vetores (fração u, largura em px), reaproveitados: a mão
  // troca o perfil a cada quadro.
  let perfilU = new Float64Array(16);
  let perfilW = new Float64Array(16);
  let perfilN = 0;
  let cursor = 1;
  let chao = clamp(numero(opcoes.sombraDe, 0.12)); // até aqui o fio ainda cai do pulso: sem sombra
  let curvaPropria = false;
  let haloBase = 0;
  let haloVisivel = false;
  let acesoBase = 0;
  let respiro = 0;
  let desde = null;
  let tempo = 0;
  let estrelaK = 0;
  let opacidadeAtual = 1;
  let pulsoAtual = null;
  let fimPulso = null;
  let pararQuadro = null;
  let descartado = false;

  /**
   * Troca o perfil. Aceita pares [[u, px], ...] ou uma largura por ponto da
   * `lista`: cada largura vai para a fração do comprimento em que o seu ponto
   * está (os pontos que a mão projeta não são equidistantes na tela). Sem a
   * lista do mesmo tamanho, as larguras se espalham por frações iguais. Perfil
   * sem nenhum valor que sirva não muda nada.
   */
  function definirPerfil(p, lista) {
    if (!Array.isArray(p) || p.length === 0) return;
    if (perfilU.length < p.length) {
      const nu = new Float64Array(p.length * 2);
      const nw = new Float64Array(p.length * 2);
      nu.set(perfilU);
      nw.set(perfilW);
      perfilU = nu;
      perfilW = nw;
    }
    let n = 0;
    if (typeof p[0] === 'number') {
      const comLista = Array.isArray(lista) && lista.length === p.length;
      let acum = 0;
      let ax = NaN;
      let ay = NaN;
      for (let i = 0; i < p.length; i++) {
        if (comLista) {
          const q = lista[i];
          const x = Number(q?.px ?? q?.x);
          const y = Number(q?.py ?? q?.y);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            if (Number.isFinite(ax)) acum += Math.hypot(x - ax, y - ay);
            ax = x;
            ay = y;
          }
        }
        perfilU[i] = comLista ? acum : i;
        perfilW[i] = Number(p[i]);
      }
      n = p.length;
      const fim = perfilU[n - 1];
      for (let i = 0; i < n; i++) perfilU[i] = fim > 0 ? perfilU[i] / fim : n > 1 ? i / (n - 1) : 0;
    } else {
      for (const par of p) {
        const u = Number(par?.[0]);
        const w = Number(par?.[1]);
        if (!Number.isFinite(u) || !Number.isFinite(w)) continue;
        perfilU[n] = u;
        perfilW[n] = w;
        n += 1;
      }
      if (n === 0) return;
    }
    perfilN = n;
    cursor = 1;
  }

  /** Largura em px na fração `u`, interpolada pelo perfil com k²(3 − 2k). */
  function larguraEm(u) {
    const n = perfilN;
    let w;
    if (n === 1 || u <= perfilU[0]) {
      w = perfilW[0];
    } else if (u >= perfilU[n - 1]) {
      w = perfilW[n - 1];
    } else {
      // u cresce dentro de um contorno: o cursor anda junto e não volta ao começo.
      let i = cursor > 0 && cursor < n && perfilU[cursor - 1] <= u ? cursor : 1;
      while (i < n - 1 && perfilU[i] < u) i += 1;
      cursor = i;
      const a = perfilU[i - 1];
      const b = perfilU[i];
      const k = b > a ? clamp((u - a) / (b - a)) : 1;
      w = perfilW[i - 1] + (perfilW[i] - perfilW[i - 1]) * k * k * (3 - 2 * k);
    }
    return Number.isFinite(w) ? Math.max(0, w) : 0;
  }

  /** Contorno fechado do trecho [de, ate], com a ponta que desenha afinando. */
  function contorno(de, ate, engrossar, dx, dy) {
    const total = amostrador.total;
    if (!(total > 0) || ate <= de) return '';
    const p = amostrador.pontos;
    const fi = de * seg;
    const ff = ate * seg;
    const i0 = Math.floor(fi);
    const i1 = Math.ceil(ff);
    let ida = '';
    let volta = '';
    for (let i = i0; i <= i1; i++) {
      const f = i === i0 ? fi : i === i1 ? ff : i;
      const a = Math.min(seg - 1, Math.floor(f));
      const t = f - a;
      const o = a * 3;
      const x = p[o] + (p[o + 3] - p[o]) * t;
      const y = p[o + 1] + (p[o + 4] - p[o + 1]) * t;
      const c = Math.round(f);
      const ca = Math.max(0, c - 1) * 3;
      const cb = Math.min(seg, c + 1) * 3;
      const tx = p[cb] - p[ca];
      const ty = p[cb + 1] - p[ca + 1];
      const l = Math.hypot(tx, ty) || 1;
      const u = f / seg;
      const ponta = ate >= 0.9995 ? 1 : clamp(((ate - u) * total) / 26);
      const w = Math.min(larguraEm(u), maxPx) * engrossar * 0.5 * (0.15 + 0.85 * ponta * (2 - ponta));
      const nx = (-ty / l) * w;
      const ny = (tx / l) * w;
      ida += `${ida ? 'L' : 'M'}${(x + nx + dx).toFixed(1)} ${(y + ny + dy).toFixed(1)}`;
      volta = `L${(x - nx + dx).toFixed(1)} ${(y - ny + dy).toFixed(1)}${volta}`;
    }
    return `${ida}${volta}Z`;
  }

  function onda() {
    if (respiro <= 0 || desde === null) return 0;
    const c = ((((tempo - desde) % CICLO_RESPIRO) + CICLO_RESPIRO) % CICLO_RESPIRO) / CICLO_RESPIRO;
    return Math.sin(Math.PI * c) ** 4;
  }

  const luzLeve = () => Math.min(1, Math.max(acesoBase + respiro * onda() + luzPulso.k, haloBase));

  function desenharEstrela() {
    const k = reduzido ? 0 : estrelaK;
    if (k > 0.002 && amostrador.total > 0) {
      const o = Math.round(atual * seg) * 3;
      const p = amostrador.pontos;
      estrelaG.setAttribute('transform', `translate(${p[o].toFixed(1)} ${p[o + 1].toFixed(1)}) scale(${(0.6 + 0.4 * k).toFixed(3)})`);
      estrelaG.setAttribute('opacity', Math.min(1, k).toFixed(3));
      estrelaG.removeAttribute('display');
    } else {
      estrelaG.setAttribute('display', 'none');
    }
  }

  function desenhar() {
    if (descartado) return;
    const pronto = amostrador.total > 0 && atual > 0;
    const d = pronto ? contorno(0, atual, 1, 0, 0) : '';
    fita.setAttribute('d', d);
    torcao.setAttribute('d', d);
    sombra.setAttribute('d', pronto && atual > chao ? contorno(chao, atual, 2.6, 2, 3) : '');
    const luz = luzLeve();
    haloVisivel = pronto && luz > 0.01;
    if (haloVisivel) {
      halo.setAttribute('d', contorno(0, atual, 4.2, 0, 0));
      halo.setAttribute('opacity', (luz * 0.55).toFixed(3));
      halo.removeAttribute('display');
    } else {
      halo.setAttribute('display', 'none');
    }
    desenharEstrela();
  }

  // O brilho muda sem mexer no caminho: só a opacidade do halo, salvo quando
  // ele aparece ou some.
  function aplicarBrilho() {
    if (descartado) return;
    const luz = luzLeve();
    if ((amostrador.total > 0 && atual > 0 && luz > 0.01) !== haloVisivel) {
      desenhar();
      return;
    }
    if (haloVisivel) halo.setAttribute('opacity', (luz * 0.55).toFixed(3));
  }

  // Sem curva própria: o fio entra pelo pé da tela e sobe em curvas.
  function tracarPadrao() {
    const l = Number(mundo?.tamanho?.largura) || innerWidth;
    const a = Number(mundo?.tamanho?.altura) || innerHeight;
    amostrador.definir([
      { px: 0.56 * l, py: 1.04 * a },
      { px: 0.4 * l, py: 0.84 * a },
      { px: 0.6 * l, py: 0.7 * a },
      { px: 0.47 * l, py: 0.6 * a },
      { px: 0.5 * l, py: 0.55 * a },
    ]);
    desenhar();
  }

  function definirCurva(c, extras) {
    if (descartado || !amostrador.definir(c)) return false;
    curvaPropria = true;
    if (extras) {
      definirPerfil(extras.perfil, c);
      if (extras.sombraDe !== undefined && Number.isFinite(Number(extras.sombraDe))) chao = clamp(Number(extras.sombraDe));
    }
    desenhar();
    return true;
  }

  function pararPulso() {
    pulsoAtual?.kill();
    pulsoAtual = null;
    const resolver = fimPulso;
    fimPulso = null;
    resolver?.();
  }

  function pulso({ duracao = 2.4, forca = 1 } = {}) {
    const gsap = window.gsap;
    pararPulso();
    if (!gsap || descartado) return Promise.resolve();
    const d = Math.max(0.05, numero(duracao, 2.4));
    const k = Math.max(0, numero(forca, 1));
    return new Promise((resolve) => {
      fimPulso = resolve;
      pulsoAtual = gsap.timeline({
        onUpdate: aplicarBrilho,
        onComplete: () => {
          if (fimPulso === resolve) {
            fimPulso = null;
            pulsoAtual = null;
          }
          aplicarBrilho();
          resolve();
        },
      })
        .to(luzPulso, { k: k * 0.8, duration: d * 0.4, ease: 'sine.inOut' })
        .to(luzPulso, { k: 0, duration: d * 0.6, ease: 'sine.inOut' });
    });
  }

  definirPerfil(PERFIL_LEVE);
  // O perfil e a sombra das opções valem também sem curva própria.
  if (!(opcoes.curva && definirCurva(opcoes.curva, opcoes))) {
    definirPerfil(opcoes.perfil);
    tracarPadrao();
  }
  const pararTela = mundo?.aoRedimensionar?.(() => (curvaPropria ? desenhar() : tracarPadrao()));

  return {
    objeto: objetoLeve(),
    elemento: raiz,
    get comprimento() {
      return amostrador.total;
    },
    progresso(p) {
      if (p !== undefined && Number.isFinite(Number(p))) {
        const novo = clamp(Number(p));
        if (novo !== atual) {
          atual = novo;
          desenhar();
        }
      }
      return atual;
    },
    definirCurva,
    fase() {
      return 0;
    },
    opacidade(v) {
      if (v !== undefined) {
        const o = clamp(Number(v) || 0);
        if (o !== opacidadeAtual) {
          opacidadeAtual = o;
          raiz.style.opacity = String(o);
        }
      }
      return opacidadeAtual;
    },
    acender(v) {
      if (v !== undefined) {
        acesoBase = Math.max(0, Number(v) || 0);
        aplicarBrilho();
      }
      return acesoBase;
    },
    respirar(k = 0.22) {
      respiro = Math.max(0, Number(k) || 0);
      desde = null;
      if (respiro > 0 && !pararQuadro && typeof mundo?.aoQuadro === 'function') {
        pararQuadro = mundo.aoQuadro((dt, t) => {
          tempo = t;
          if (desde === null) desde = t;
          aplicarBrilho();
        });
      } else if (respiro === 0 && typeof pararQuadro === 'function') {
        pararQuadro();
        pararQuadro = null;
      }
      aplicarBrilho();
    },
    rastro() {
      return 0;
    },
    estrela(v) {
      if (reduzido) return 0;
      if (v !== undefined) {
        estrelaK = clamp(Number(v) || 0);
        desenharEstrela();
      }
      return estrelaK;
    },
    halo(v) {
      if (v !== undefined) {
        haloBase = Math.max(0, Number(v) || 0);
        desenhar();
      }
      return haloBase;
    },
    pulso,
    /** O ponto na fração `u` (padrão: a ponta), em px de tela: x = px, y = py, z = 0. */
    pontoEm(fracao, saida = {}) {
      const f = fracao === undefined ? atual : clamp(Number(fracao) || 0);
      amostrador.pontoEm(f * amostrador.total, tmp);
      saida.x = tmp.x;
      saida.px = tmp.x;
      saida.y = tmp.y;
      saida.py = tmp.y;
      saida.z = 0;
      return saida;
    },
    faiscar() {},
    atualizar() {},
    dispose() {
      if (descartado) return;
      descartado = true;
      pararPulso();
      for (const parar of [pararQuadro, pararTela]) {
        if (typeof parar === 'function') parar();
      }
      pararQuadro = null;
      raiz.remove();
    },
  };
}
