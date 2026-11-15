// Envelope (contrato 4.4).
//
//   const env = criarEnvelope(mundo, { lacre: 'coracao' | 'estrela' | null, amarracao: 'cordao' | 'fio' });
//   env.grupo                       Object3D; a cena posiciona e põe em mundo.cena
//   env.papel                       Mesh do papel (no leve, a div do papel, com .visible)
//   env.atualizar(dt, t)            flutua, gira devagar, segue mundo.ponteiro com mola
//   env.acertou(xNdc, yNdc) → bool  o toque caiu na carta (ou perto dela)?
//   env.ancoraFio → Vector3         ponta solta do laço (variante 'fio'), onde o fio do caminho chega
//   env.abrir() → Promise<{ papel }>
//   env.entregarPapel(rect) → Promise   o papel voa e cobre exatamente o DOMRect, em cor chapada
//   env.irEmbora() → Promise
//   env.dispose()
//
// Extras (usados por js/cenas/carta.js; outras cenas podem usar):
//   env.lacre, env.amarracao        as opções com que foi criado
//   env.aberto                      true depois de abrir() começar
//   env.chegar({ duracao, distancia }) → Promise   nasce da névoa ao longe e pousa, com a inclinação se endireitando
//   env.pressionar(bool)            afunda 4 mm enquanto o dedo aperta
//   env.caixaTela() → { left, top, right, bottom, width, height } em px (o envelope, sem margem)
//   env.aoMarco = fn(nome)          avisado em 'lacre' (trincou) e 'papel' (o papel começa a subir)
//
// Sem WebGL (mundo.ok === false) a mesma API é servida por uma carta em SVG + CSS.
// Opção só da variante leve: `chegada` (segundos da entrada automática; false = esperar env.chegar()).
//
// O envelope tem 23 × 16 cm de verdade (unidades em metros). É visto pelo verso:
// as abas laterais e a de baixo são marcadas no shader do corpo (vincos, bordas
// que pegam luz, sombras de contato); a aba de cima é uma malha que dobra no
// vertex shader. A luz é própria, fixa no espaço da câmera (de cima, à esquerda),
// para o papel se ler contra o branco por sombreamento e não depender das luzes
// da cena.

import { amortecer, clamp, el, svg, objetoLeve, vetorLeve, semente } from '../nucleo/util.js';
import { curvas } from '../nucleo/movimento.js';

// ---- medidas (metros) ---------------------------------------------------------------
const W = 0.23;              // largura do envelope
const H = 0.16;              // altura
const ROLO = 0.0032;         // raio da borda dobrada (dá espessura)
const BOJO = 0.0024;         // o envelope estufa um pouco no meio (tem papel dentro)
const FUNDO_Z = -0.0042;     // face de dentro (forro) e frente do envelope
const ABA_L = 0.104;         // comprimento da aba de cima
const ABA_RAIO = 0.012;      // arredondado da ponta da aba
const BOCA_Y = 0.004;        // ponta de baixo da boca (onde as abas laterais se encontram)
const FUNDO_Y = -0.014;      // ponta da aba de baixo
const FUNDO_RAIO = 0.012;
const LACRE_Y = -0.016;      // centro do lacre (sobre a ponta da aba) e linha do cordão
const LACRE_R = 0.0142;      // ~2,8 cm de diâmetro (é o convite ao toque)
const CAMADA = 0.0009;       // espessura de uma folha de papel por cima da outra
const PAPEL_L = 0.205;       // a carta: folha inteira, dobrada em três dentro do envelope
const PAPEL_A = 0.405;
const PAPEL_Z = -0.0025;
const PAPEL_Y = -0.004;
const ABERTA = Math.PI * 1.1; // a aba aberta passa um pouco da vertical e encosta para trás

const COR_ENVELOPE = '#f7f2ea';
const COR_CARTA = '#fbf7f0';
const COR_FORRO = '#b3123a';
const COR_CORDAO = '#d7192d';
const COR_CERA = '#9c0d2b';

export function criarEnvelope(mundo, opcoes = {}) {
  if (!mundo.ok) return criarEnvelopeLeve(mundo, opcoes);
  // uma carta igual já preparada (aquecerEnvelope) é entregue no lugar de uma nova
  const chave = chaveDe(opcoes);
  const i = aquecidos.findIndex((a) => a.chave === chave && a.mundo === mundo && !a.env.descartado);
  if (i >= 0) return aquecidos.splice(i, 1)[0].env;
  return criarEnvelope3D(mundo, opcoes);
}

const aquecidos = [];
const chaveDe = ({ lacre = 'coracao', amarracao = 'cordao' } = {}) => `${lacre}|${amarracao}`;

/**
 * Extra: prepara de antemão a próxima carta (texturas geradas, shaders compilados
 * e texturas na GPU) num momento parado, para o primeiro passo da caminhada não
 * engasgar. O próximo criarEnvelope com as mesmas opções a recebe pronta.
 */
export function aquecerEnvelope(mundo, opcoes = {}) {
  if (!mundo?.ok) return Promise.resolve();
  const chave = chaveDe(opcoes);
  if (aquecidos.some((a) => a.chave === chave && a.mundo === mundo)) return Promise.resolve();
  try {
    const env = criarEnvelope3D(mundo, opcoes);
    aquecidos.push({ chave, mundo, env });
    return env.preparar();
  } catch (erro) {
    console.error('[carta] aquecer envelope', erro);
    return Promise.resolve();
  }
}

/** Promise que resolve quando a animação termina (ou é morta). */
function comoPromise(animacao) {
  return new Promise((resolver) => {
    animacao.eventCallback('onComplete', resolver);
    animacao.eventCallback('onInterrupt', resolver);
  });
}

/** Cor da folha DOM (variável CSS --papel), para a troca ser invisível. */
function corDoPapelCss() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--papel').trim();
    if (/^#[0-9a-f]{6}$/i.test(v) || /^#[0-9a-f]{3}$/i.test(v)) return v;
  } catch { /* sem CSS: usa a cor padrão */ }
  return COR_CARTA;
}

// =============================================================================
// Geometria compartilhada (forma das abas, altura da superfície)
// =============================================================================

/** Altura (z) da superfície do verso do envelope no ponto (x, y): bojo + borda enrolada. */
function zCorpo(x, y) {
  const u = (2 * x) / W;
  const v = (2 * y) / H;
  let z = BOJO * Math.max(0, 1 - u * u) * Math.max(0, 1 - v * v);
  const d = Math.min(W / 2 - Math.abs(x), H / 2 - Math.abs(y));
  if (d < ROLO) {
    const q = ROLO - Math.max(0, d);
    z -= ROLO - Math.sqrt(Math.max(0, ROLO * ROLO - q * q));
  }
  return z;
}

/** Quanto a aba de cima (fechada) cobre o ponto (0..1, borda suave). */
function cobertoPelaAba(x, y) {
  const s = H / 2 - y;
  if (s < 0 || s > ABA_L + 0.003) return 0;
  const sa = Math.sqrt(x * x + ABA_RAIO * ABA_RAIO) - ABA_RAIO;
  const borda = ABA_L * (1 - sa / (W / 2));
  return clamp((borda - s) / 0.002 + 0.5);
}

/** z do topo da superfície onde o cordão passa (corpo + aba, se houver). */
function zSuperficie(x, y) {
  return zCorpo(x, y) + cobertoPelaAba(x, y) * CAMADA;
}

// =============================================================================
// Texturas geradas uma vez (canvas)
// =============================================================================

const telas = new Map();

function tela(chave, gerar) {
  if (!telas.has(chave)) telas.set(chave, gerar());
  return telas.get(chave);
}

/** Desenha algo nas 9 posições vizinhas, para a textura repetir sem costura. */
function emVolta(tam, desenhar) {
  for (let ox = -tam; ox <= tam; ox += tam) {
    for (let oy = -tam; oy <= tam; oy += tam) desenhar(ox, oy);
  }
}

/** Fibra do papel: relevo miúdo (canal vermelho) para o shader. */
function telaFibra(tam) {
  return tela(`fibra${tam}`, () => {
    const c = document.createElement('canvas');
    c.width = c.height = tam;
    // o grão é lido de volta (getImageData): canvas na CPU, sem ida e volta à GPU
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = 'rgb(128,128,128)';
    g.fillRect(0, 0, tam, tam);
    const rnd = semente(23);
    // manchas largas e suaves (o papel nunca é liso)
    for (let i = 0; i < 70; i++) {
      const x = rnd() * tam; const y = rnd() * tam; const r = (0.04 + rnd() * 0.12) * tam;
      const claro = rnd() > 0.5;
      emVolta(tam, (ox, oy) => {
        const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grad.addColorStop(0, claro ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)');
        grad.addColorStop(1, 'rgba(128,128,128,0)');
        g.fillStyle = grad;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      });
    }
    // fibras: traços curtos e curvos
    const n = Math.round(tam * tam * 0.012);
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = rnd() * tam; const y = rnd() * tam;
      const ang = rnd() * Math.PI * 2;
      const comp = (0.008 + rnd() * 0.03) * tam;
      const curva = (rnd() - 0.5) * comp * 0.6;
      const claro = rnd() > 0.45;
      g.strokeStyle = claro ? `rgba(255,255,255,${0.08 + rnd() * 0.12})` : `rgba(0,0,0,${0.05 + rnd() * 0.08})`;
      g.lineWidth = 0.5 + rnd() * 0.9;
      const dx = Math.cos(ang) * comp; const dy = Math.sin(ang) * comp;
      emVolta(tam, (ox, oy) => {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.quadraticCurveTo(x + ox + dx / 2 - dy * curva / comp, y + oy + dy / 2 + dx * curva / comp, x + ox + dx, y + oy + dy);
        g.stroke();
      });
    }
    // grão
    const img = g.getImageData(0, 0, tam, tam);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = img.data[i] + (rnd() - 0.5) * 18;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    }
    g.putImageData(img, 0, 0);
    return c;
  });
}

/** Forro vermelho com pétalas miúdas quase tom sobre tom. */
function telaForro(tam) {
  return tela(`forro${tam}`, () => {
    const c = document.createElement('canvas');
    c.width = c.height = tam;
    const g = c.getContext('2d');
    g.fillStyle = COR_FORRO;
    g.fillRect(0, 0, tam, tam);
    const rnd = semente(1223);
    const petala = (x, y, r, ang, cor) => {
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      g.fillStyle = cor;
      g.beginPath();
      g.moveTo(0, r);
      g.bezierCurveTo(-r * 0.95, r * 0.35, -r * 0.7, -r * 0.8, -r * 0.12, -r * 0.92);
      g.lineTo(0, -r * 0.7);
      g.lineTo(r * 0.12, -r * 0.92);
      g.bezierCurveTo(r * 0.7, -r * 0.8, r * 0.95, r * 0.35, 0, r);
      g.fill();
      g.restore();
    };
    const n = 26;
    for (let i = 0; i < n; i++) {
      const x = rnd() * tam; const y = rnd() * tam;
      const r = (0.035 + rnd() * 0.03) * tam;
      const ang = rnd() * Math.PI * 2;
      const cor = rnd() > 0.4 ? 'rgba(120,6,32,0.32)' : 'rgba(214,52,88,0.22)';
      emVolta(tam, (ox, oy) => petala(x + ox, y + oy, r, ang, cor));
    }
    return c;
  });
}

/** Relevo do sinete: piso rebaixado, aro e a marca (coração ou estrela) em relevo. */
function telaSinete(tipo, tam) {
  return tela(`sinete-${tipo}-${tam}`, () => {
    const c = document.createElement('canvas');
    c.width = c.height = tam;
    const g = c.getContext('2d');
    const m = tam / 2;
    g.fillStyle = 'rgb(90,90,90)';
    g.fillRect(0, 0, tam, tam);
    const caminho = () => {
      g.beginPath();
      if (tipo === 'estrela') {
        for (let i = 0; i < 10; i++) {
          const r = (i % 2 ? 0.2 : 0.47) * tam * 0.5;
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          const x = m + Math.cos(a) * r; const y = m + Math.sin(a) * r + tam * 0.02;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.closePath();
      } else {
        const s = tam * 0.27;
        const cy = m + tam * 0.03;
        g.moveTo(m, cy + s * 0.95);
        g.bezierCurveTo(m - s * 1.55, cy + s * 0.05, m - s * 1.05, cy - s * 1.15, m, cy - s * 0.42);
        g.bezierCurveTo(m + s * 1.05, cy - s * 1.15, m + s * 1.55, cy + s * 0.05, m, cy + s * 0.95);
        g.closePath();
      }
    };
    g.lineJoin = 'round';
    // aro do sinete: anel em relevo com rampa macia
    for (let i = 9; i >= 1; i--) {
      g.strokeStyle = `rgba(255,255,255,${0.09})`;
      g.lineWidth = i * tam * 0.006;
      g.beginPath();
      g.arc(m, m, tam * 0.445, 0, Math.PI * 2);
      g.stroke();
    }
    // a marca: rampa (traços largos e fracos) e o topo cheio
    for (let i = 12; i >= 1; i--) {
      g.strokeStyle = 'rgba(255,255,255,0.075)';
      g.lineWidth = i * tam * 0.0065;
      caminho();
      g.stroke();
    }
    g.fillStyle = 'rgb(236,236,236)';
    caminho();
    g.fill();
    return c;
  });
}

// =============================================================================
// Shaders
// =============================================================================

const f = (n) => n.toFixed(6);

const GLSL_COMUM = /* glsl */ `
#define W ${f(W)}
#define H ${f(H)}
#define ABA_L ${f(ABA_L)}
#define ABA_RAIO ${f(ABA_RAIO)}
#define BOCA_Y ${f(BOCA_Y)}
#define FUNDO_Y ${f(FUNDO_Y)}
#define FUNDO_RAIO ${f(FUNDO_RAIO)}
uniform vec3 uLuzDir;
uniform float uBranco;
uniform float uLuz;
const vec2 LUZ2 = vec2(-0.54, 0.84);

// Luz do papel: céu claro por cima, uma luz macia de cima-esquerda que "abraça"
// (wrap) e o escurecimento em ângulo rasante.
float luzPapel(vec3 N, vec3 V) {
  float nl = dot(N, uLuzDir);
  float difusa = clamp((nl + 0.5) / 1.5, 0.0, 1.0);
  float ceu = mix(0.74, 1.0, 0.5 + 0.5 * N.y);
  float rasante = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.5);
  return uLuz * (0.47 * ceu + 0.8 * difusa) * (1.0 - 0.22 * rasante);
}

// Relevo a partir de uma altura qualquer (derivadas de tela).
vec3 perturbar(vec3 posV, vec3 N, float h) {
  vec3 dpx = dFdx(posV);
  vec3 dpy = dFdy(posV);
  float dhx = dFdx(h);
  float dhy = dFdy(h);
  vec3 r1 = cross(dpy, N);
  vec3 r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * N - grad);
}

// Boca do envelope (entre as abas laterais): > 0 fora (sobre a aba lateral).
// e: direção (no plano) da aba lateral para a boca.
float boca(vec2 p, out vec2 e) {
  float m = (H * 0.5 - BOCA_Y) / (W * 0.5);
  float n = sqrt(1.0 + m * m);
  e = vec2(-m * sign(p.x), 1.0) / n;
  return (BOCA_Y + m * abs(p.x) - p.y) / n;
}

// Aba de baixo: > 0 fora (acima dela). e: da aba de baixo para fora.
float abaFundo(vec2 p, out vec2 e) {
  float k = FUNDO_RAIO;
  float sx = sqrt(p.x * p.x + k * k);
  float alto = FUNDO_Y + H * 0.5;
  float yl = -H * 0.5 + alto * (1.0 - (sx - k) / (W * 0.5));
  float incl = -alto / (W * 0.5) * p.x / sx;
  float n = sqrt(1.0 + incl * incl);
  e = vec2(-incl, 1.0) / n;
  return (p.y - yl) / n;
}

// Aba de cima em coordenadas (x, s), s = distância da dobra: > 0 fora (além da ponta).
float abaCima(vec2 q, out vec2 e) {
  float k = ABA_RAIO;
  float sx = sqrt(q.x * q.x + k * k);
  float borda = ABA_L * (1.0 - (sx - k) / (W * 0.5));
  float incl = -ABA_L / (W * 0.5) * q.x / sx;
  float n = sqrt(1.0 + incl * incl);
  e = vec2(-incl, 1.0) / n;                // (dx, ds) para fora
  return (q.y - borda) / n;
}

// A luz é uma janela grande, de cima-esquerda: o papel perto dela é um pouco mais claro.
float caimento(vec2 p) {
  float k = dot(p / vec2(W * 0.5, H * 0.5), vec2(-0.55, 0.83));
  return 0.95 + 0.065 * clamp(k * 0.5 + 0.5, 0.0, 1.0);
}

vec3 acabar(vec3 cor) {
  return mix(cor, vec3(1.0), uBranco);
}
`;

const VERT_SIMPLES = /* glsl */ `
varying vec2 vP;
varying vec3 vN;
varying vec3 vPosV;
varying vec3 vTx;
varying vec3 vTy;
#include <fog_pars_vertex>
void main() {
  vP = position.xy;
  vN = normalize(normalMatrix * normal);
  vTx = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
  vTy = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vPosV = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

// Sombras de contato do cordão e do lacre (usadas no corpo e na aba).
const GLSL_SOMBRAS = /* glsl */ `
uniform vec4 uLinha0;         // a, b, c (reta normalizada no plano) e raio; raio 0 = sem linha
uniform vec4 uLinha1;
uniform float uSombraFio;
uniform vec3 uLacre;          // x, y, raio
uniform float uSombraLacre;
float sombraLinha(vec4 l, vec2 q) {
  if (l.w <= 0.0) return 0.0;
  float d = abs(dot(l.xy, q) + l.z);
  return 0.26 * (1.0 - smoothstep(l.w * 0.4, l.w * 3.2, d));
}
float sombrasDeCima(vec2 p) {
  vec2 q = p + LUZ2 * 0.0022;
  float s = (sombraLinha(uLinha0, q) + sombraLinha(uLinha1, q)) * uSombraFio;
  vec2 ql = p + LUZ2 * 0.0036;
  float dl = length(ql - uLacre.xy);
  s += uSombraLacre * 0.38 * (1.0 - smoothstep(uLacre.z * 0.7, uLacre.z * 1.55, dl));
  return s;
}
`;

const FRAG_CORPO = /* glsl */ `
${GLSL_COMUM}
${GLSL_SOMBRAS}
uniform sampler2D uFibra;
uniform vec3 uCorPapel;
uniform float uAbertura;
varying vec2 vP;
varying vec3 vN;
varying vec3 vPosV;
varying vec3 vTx;
varying vec3 vTy;
#include <fog_pars_fragment>
void main() {
  vec2 p = vP;
  vec2 eM;
  float dM = boca(p, eM);
  if (dM < 0.0 && p.y > BOCA_Y - 0.001) discard;   // a boca é um vão: lá dentro está o forro

  vec3 V = normalize(-vPosV);
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float h = texture2D(uFibra, p * 13.0).r;
  float sombra = 0.0;
  float brilhoBorda = 0.0;

  vec2 eB;
  float dB = abaFundo(p, eB);
  if (dB < 0.0) {
    // aba de baixo (por cima das laterais): o corte pega luz
    float b = 1.0 - smoothstep(0.0, 0.0012, -dB);
    N = normalize(N + (eB.x * vTx + eB.y * vTy) * 0.85 * b);
    brilhoBorda += 0.05 * b;
  } else {
    // abas laterais: sombra de contato na beira da aba de baixo
    float lanca = clamp(0.3 + dot(LUZ2, -eB), 0.0, 1.0);
    sombra += (0.06 + 0.16 * lanca) * exp(-dB / 0.0014);
    // a lateral direita encosta por cima da esquerda (costura no meio)
    if (p.y < BOCA_Y) {
      float dc = abs(p.x);
      sombra += 0.07 * exp(-dc / 0.0007) * step(0.0, -p.x);
      float b = 1.0 - smoothstep(0.0, 0.0009, p.x);
      N = normalize(N - vTx * 0.6 * b * step(0.0, p.x));
    }
    // beira da boca: a aba lateral pega luz no corte
    float bm = 1.0 - smoothstep(0.0, 0.0012, dM);
    N = normalize(N + (eM.x * vTx + eM.y * vTy) * 0.85 * bm);
    brilhoBorda += 0.05 * bm;
  }

  // sombra da aba de cima, fechada (some quando ela levanta)
  vec2 eF;
  vec2 qF = p + LUZ2 * 0.0014;
  float dF = abaCima(vec2(qF.x, H * 0.5 - qF.y), eF);
  // (rente à dobra a aba encosta no corpo: sem sombra nos cantos de cima)
  sombra += (1.0 - uAbertura) * 0.2 * (1.0 - smoothstep(-0.0012, 0.0022, dF)) * smoothstep(0.003, 0.016, H * 0.5 - p.y);

  sombra += sombrasDeCima(p);

  N = perturbar(vPosV, N, h * 0.00011);
  vec3 albedo = uCorPapel * (0.975 + 0.05 * (h - 0.5));
  vec3 cor = albedo * luzPapel(N, V) * caimento(p) * (1.0 - clamp(sombra, 0.0, 0.6)) + brilhoBorda;
  gl_FragColor = vec4(acabar(cor), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const FRAG_FORRO = /* glsl */ `
${GLSL_COMUM}
uniform sampler2D uFibra;
uniform sampler2D uForro;
uniform vec3 uCorPapel;
varying vec2 vP;
varying vec3 vN;
varying vec3 vPosV;
varying vec3 vTx;
varying vec3 vTy;
#include <fog_pars_fragment>
void main() {
  vec2 p = vP;
  vec3 V = normalize(-vPosV);
  vec3 N = normalize(vN);
  float h = texture2D(uFibra, p * 13.0).r;
  vec3 cor;
  if (gl_FrontFacing) {
    // forro, visto pela boca: as abas laterais fazem sombra lá dentro
    vec2 e;
    float d = boca(p + LUZ2 * 0.0048, e);
    float s = smoothstep(-0.0035, 0.0025, d);
    float fundo = mix(0.74, 1.0, smoothstep(BOCA_Y, H * 0.5, p.y));
    vec3 albedo = texture2D(uForro, p * 38.0).rgb;
    N = perturbar(vPosV, N, h * 0.00008);
    cor = albedo * luzPapel(N, V) * (1.0 - 0.5 * s) * fundo * 0.92;
  } else {
    // frente do envelope (aparece quando ele gira para ir embora)
    N = -N;
    N = perturbar(vPosV, N, h * 0.00011);
    cor = uCorPapel * (0.975 + 0.05 * (h - 0.5)) * luzPapel(N, V);
  }
  gl_FragColor = vec4(acabar(cor), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const VERT_ABA = /* glsl */ `
#define W ${f(W)}
#define H ${f(H)}
#define ROLO ${f(ROLO)}
#define BOJO ${f(BOJO)}
#define CAMADA ${f(CAMADA)}
uniform float uTheta;     // 0 fechada, ~π aberta
uniform float uCurva;     // 1/m: o papel dobra enquanto levanta
uniform float uDobraZ;    // z da dobradiça
varying vec2 vQ;          // (x, s): s = distância da dobra
varying vec3 vN;
varying vec3 vPosV;
varying vec3 vTx;
varying vec3 vTs;
#include <fog_pars_vertex>
float zCorpo(vec2 p) {
  float u = 2.0 * p.x / W;
  float v = 2.0 * p.y / H;
  float z = BOJO * max(0.0, 1.0 - u * u) * max(0.0, 1.0 - v * v);
  float d = min(W * 0.5 - abs(p.x), H * 0.5 - abs(p.y));
  if (d < ROLO) {
    float q = ROLO - max(0.0, d);
    z -= ROLO - sqrt(max(0.0, ROLO * ROLO - q * q));
  }
  return z;
}
void main() {
  float x = position.x;
  float s = -position.y;
  float th = uTheta;
  float k = uCurva;
  float phi = th + k * s;
  float y; float z;
  if (abs(k) < 0.001) {
    y = -cos(th) * s;
    z = sin(th) * s;
  } else {
    y = -(sin(phi) - sin(th)) / k;
    z = (cos(th) - cos(phi)) / k;
  }
  vec3 n = vec3(0.0, sin(phi), cos(phi));
  vec3 d = vec3(0.0, -cos(phi), sin(phi));
  // fechada, a aba assenta sobre o bojo do corpo; ao levantar, fica lisa
  float assenta = 1.0 - smoothstep(0.0, 0.45, th);
  float zc = zCorpo(vec2(x, H * 0.5 - s)) + CAMADA - uDobraZ;
  vec3 pos = vec3(x, H * 0.5 + y, uDobraZ + z) + n * zc * assenta;
  // fechada, a normal acompanha a borda enrolada do corpo (senão o canto da aba
  // fica claro demais onde o corpo já está descendo)
  vec2 pc = vec2(x, H * 0.5 - s);
  const float E = 0.0005;
  float gx = (zCorpo(pc + vec2(E, 0.0)) - zCorpo(pc - vec2(E, 0.0))) / (2.0 * E);
  float gy = (zCorpo(pc + vec2(0.0, E)) - zCorpo(pc - vec2(0.0, E))) / (2.0 * E);
  n = normalize(n + vec3(-gx, -gy, 0.0) * assenta);
  vQ = vec2(x, s);
  vN = normalize(normalMatrix * n);
  vTx = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
  vTs = normalize(normalMatrix * d);
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vPosV = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG_ABA = /* glsl */ `
${GLSL_COMUM}
${GLSL_SOMBRAS}
uniform sampler2D uFibra;
uniform sampler2D uForro;
uniform vec3 uCorPapel;
uniform float uTheta;
varying vec2 vQ;
varying vec3 vN;
varying vec3 vPosV;
varying vec3 vTx;
varying vec3 vTs;
#include <fog_pars_fragment>
void main() {
  vec2 e;
  float d = abaCima(vQ, e);
  if (d > 0.0 || abs(vQ.x) > W * 0.5) discard;
  vec3 V = normalize(-vPosV);
  vec3 N = normalize(vN);
  vec2 p = vec2(vQ.x, H * 0.5 - vQ.y);
  float h = texture2D(uFibra, p * 13.0 + 0.37).r;
  vec3 cor;
  if (gl_FrontFacing) {
    float b = 1.0 - smoothstep(0.0, 0.0013, -d);
    N = normalize(N + (e.x * vTx + e.y * vTs) * 0.85 * b);
    // a dobra, rente à borda de cima, faz um vinco
    float vinco = exp(-vQ.y / 0.0016);
    N = normalize(N + vTs * 0.5 * vinco);
    float fechada = 1.0 - smoothstep(0.02, 0.2, uTheta);
    float sombra = sombrasDeCima(p) * fechada;
    N = perturbar(vPosV, N, h * 0.00011);
    vec3 albedo = uCorPapel * (0.975 + 0.05 * (h - 0.5));
    cor = albedo * luzPapel(N, V) * caimento(p) * (1.0 - clamp(sombra, 0.0, 0.6)) + 0.05 * b;
  } else {
    N = -N;
    N = perturbar(vPosV, N, h * 0.00008);
    vec3 albedo = texture2D(uForro, p * 38.0 + 0.11).rgb;
    float b = 1.0 - smoothstep(0.0, 0.0015, -d);
    cor = albedo * luzPapel(N, V) * 0.97 + vec3(0.1, 0.06, 0.06) * b;
  }
  gl_FragColor = vec4(acabar(cor), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const VERT_CARTA = /* glsl */ `
#define PAPEL_A ${f(PAPEL_A)}
uniform float uDobra;     // 1 dobrada em três, 0 aberta
uniform float uOnda;      // curvatura leve enquanto voa
varying vec2 vP;
varying vec3 vN;
varying vec3 vPosV;
varying float vVinco;
void main() {
  vec3 p = position;
  vec3 n = vec3(0.0, 0.0, 1.0);
  float y0 = PAPEL_A / 6.0;
  float a1 = 3.14159265 * uDobra;
  float a2 = 3.14159265 * uDobra;
  if (p.y > y0) {
    // terço de cima dobra para a frente, por cima
    float r = p.y - y0;
    p.y = y0 + r * cos(a1);
    p.z = r * sin(a1) + 0.0016 * uDobra;
    n = vec3(0.0, -sin(a1), cos(a1));
  } else if (p.y < -y0) {
    // terço de baixo dobra para a frente, por baixo do de cima
    float r = -y0 - p.y;
    p.y = -y0 - r * cos(a2);
    p.z = r * sin(a2) + 0.0008 * uDobra;
    n = vec3(0.0, sin(a2), cos(a2));
  }
  // o papel não é rígido: uma onda larga enquanto voa
  float onda = sin(position.x * 9.0 + position.y * 4.0) * uOnda;
  p.z += onda;
  vVinco = min(abs(position.y - y0), abs(position.y + y0));
  vP = position.xy;
  vN = normalize(normalMatrix * n);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vPosV = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG_CARTA = /* glsl */ `
${GLSL_COMUM}
uniform sampler2D uFibra;
uniform vec3 uCorPapel;
uniform vec3 uCorChapada;
uniform float uPlano;     // 1 = cor chapada, sem luz (igual à folha DOM)
uniform float uOpac;
uniform float uDobra;
varying vec2 vP;
varying vec3 vN;
varying vec3 vPosV;
varying float vVinco;
void main() {
  vec3 V = normalize(-vPosV);
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float h = texture2D(uFibra, vP * 11.0 + 0.71).r;
  N = perturbar(vPosV, N, h * 0.00009);
  float vinco = exp(-vVinco / 0.0012) * (0.35 + 0.65 * uDobra);
  // a folha é mais clara e reflete mais o céu do que o envelope (fica legível mesmo virada)
  // e nunca passa de 1 nem escurece como papelão quando um terço dobra contra a luz
  // (acima de 1 o creme estoura num branco amarelado; abaixo de ~0,9 vira cinza de papelão)
  float luz = clamp(mix(luzPapel(N, V), 1.0, 0.4), 0.92, 1.0);
  vec3 lit = uCorPapel * (0.98 + 0.04 * (h - 0.5)) * luz * (1.0 - 0.12 * vinco);
  vec3 cor = mix(acabar(lit), uCorChapada, uPlano);
  gl_FragColor = vec4(cor, uOpac);
  #include <colorspace_fragment>
}
`;

const VERT_CERA = /* glsl */ `
varying vec3 vL;
varying vec3 vN;
varying vec3 vPosV;
#include <fog_pars_vertex>
void main() {
  vL = position;
  vN = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vPosV = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG_CERA = /* glsl */ `
${GLSL_COMUM}
uniform sampler2D uSinete;
uniform float uRaioSinete;
uniform float uComSinete;
uniform vec3 uCorCera;
uniform float uBrilho;     // posição da faixa de brilho que atravessa o lacre
uniform float uAlfa;
varying vec3 vL;
varying vec3 vN;
varying vec3 vPosV;
#include <fog_pars_fragment>
void main() {
  vec3 V = normalize(-vPosV);
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float rs = length(vL.xy) / uRaioSinete;
  float dentro = (1.0 - smoothstep(0.93, 1.0, rs)) * uComSinete;
  float hs = texture2D(uSinete, vL.xy / (2.0 * uRaioSinete) + 0.5).r;
  N = perturbar(vPosV, N, hs * 0.0011 * dentro);
  // cera: difusa avermelhada que nunca fica preta, especular largo e macio
  float nl = dot(N, uLuzDir);
  float difusa = clamp((nl + 0.35) / 1.35, 0.0, 1.0);
  vec3 cor = uCorCera * (0.42 + 0.78 * difusa) * uLuz;
  float oclusao = mix(0.72, 1.0, mix(1.0, hs, dentro));
  cor *= oclusao;
  vec3 Hm = normalize(uLuzDir + V);
  float nh = max(dot(N, Hm), 0.0);
  float esp = pow(nh, 34.0) * 0.5 + pow(nh, 7.0) * 0.07;
  float borda = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.12;
  float faixa = exp(-pow((vL.x * 0.8 + vL.y * 0.6 - uBrilho) / 0.0035, 2.0));
  cor += vec3(1.0, 0.9, 0.88) * (esp * (1.0 + faixa * 2.5) + borda) + uCorCera * faixa * 0.35;
  gl_FragColor = vec4(acabar(cor), uAlfa);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const VERT_CORDAO = /* glsl */ `
#define W ${f(W)}
#define H ${f(H)}
uniform float uSolta;     // 0 justo no envelope, 1 frouxo: a volta cede como corda
uniform float uLado;      // para que lado esta volta escorrega
varying vec2 vUv;
varying vec3 vL;
varying vec3 vN;
varying vec3 vPosV;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vL = position;
  vec3 p = position;
  if (uSolta > 0.0) {
    // Solto, o trecho horizontal barriga para baixo (as pontas ainda presas nas
    // bordas), o vertical arqueia para o lado e tudo ondula um pouco: corda, não vareta.
    float u = clamp(position.x / (W * 0.5), -1.0, 1.0);
    float v = clamp(position.y / (H * 0.5), -1.0, 1.0);
    float barriga = 1.0 - u * u;
    float arco = 1.0 - v * v;
    p.y -= uSolta * (0.05 * barriga + 0.006 * sin(position.x * 48.0 + uLado * 1.7));
    p.x += uSolta * uLado * (0.032 * arco + 0.005 * sin(position.y * 55.0 + 0.8));
    p.z += uSolta * (0.018 * barriga * arco + 0.004 * sin(position.x * 37.0 + position.y * 29.0));
  }
  vN = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vPosV = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG_CORDAO = /* glsl */ `
${GLSL_COMUM}
uniform vec3 uCorFio;
uniform float uBrilho;
uniform vec3 uCentroLaco;
uniform float uAlfa;
varying vec2 vUv;
varying vec3 vL;
varying vec3 vN;
varying vec3 vPosV;
#include <fog_pars_fragment>
void main() {
  vec3 V = normalize(-vPosV);
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  // dois fios torcidos: listras em hélice, com sulco entre eles
  float c = fract(vUv.x + vUv.y * 2.0);
  float perfil = abs(c * 2.0 - 1.0);
  float sulco = smoothstep(0.62, 1.0, perfil);
  float fibra = 0.5 + 0.5 * sin((vUv.x * 7.0 + vUv.y * 13.0) * 6.2832);
  float nl = dot(N, uLuzDir);
  float difusa = clamp((nl + 0.4) / 1.4, 0.0, 1.0);
  vec3 cor = uCorFio * (0.38 + 0.8 * difusa) * uLuz;
  cor *= 1.0 - 0.5 * sulco;
  cor *= 0.94 + 0.06 * fibra;
  vec3 Hm = normalize(uLuzDir + V);
  float esp = pow(max(dot(N, Hm), 0.0), 18.0) * 0.16 * (1.0 - sulco);
  float faixa = exp(-pow((vL.x * 0.8 + vL.y * 0.6 - uBrilho) / 0.004, 2.0));
  faixa *= 1.0 - smoothstep(0.03, 0.05, length(vL.xy - uCentroLaco.xy));
  cor += vec3(1.0, 0.86, 0.84) * (esp + faixa * 0.32 * (1.0 - sulco));
  gl_FragColor = vec4(acabar(cor), uAlfa);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

// =============================================================================
// 3D
// =============================================================================

function criarEnvelope3D(mundo, { lacre = 'coracao', amarracao = 'cordao' }) {
  const { THREE, camera } = mundo;
  const gsap = window.gsap;
  const amb = mundo.amb;
  const baixo = amb.nivel === 'baixo';
  const reduzido = amb.reduzido;
  const rnd = semente(lacre === 'estrela' ? 77 : lacre ? 31 : 113);

  const grupo = new THREE.Group();
  grupo.name = 'envelope';
  const interno = new THREE.Group();     // flutua e gira aqui dentro, sem brigar com a posição dada pela cena
  grupo.add(interno);

  // ---- materiais ------------------------------------------------------------------
  const texturas = [];
  const textura = (canvas, srgb, repetir = true) => {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = baixo ? 1 : 4;
    texturas.push(t);
    return t;
  };
  const texFibra = textura(telaFibra(baixo ? 256 : 512), false);
  const texForro = textura(telaForro(baixo ? 128 : 256), true);

  const luzDir = new THREE.Vector3(-0.45, 0.7, 0.55).normalize();
  const comum = {
    uLuzDir: { value: luzDir },
    uBranco: { value: 0 },
    uLuz: { value: 1 },
  };
  const neblina = THREE.UniformsLib.fog;
  const corPapel = new THREE.Color(COR_ENVELOPE);
  const sombraLinhas = {
    uLinha0: { value: new THREE.Vector4() },
    uLinha1: { value: new THREE.Vector4() },
    uSombraFio: { value: 1 },
    uLacre: { value: new THREE.Vector3(0, LACRE_Y, LACRE_R) },
    uSombraLacre: { value: lacre ? 1 : 0 },
  };
  const uAbertura = { value: 0 };

  const materiais = [];
  const shader = (opcoes) => {
    const m = new THREE.ShaderMaterial({ fog: true, ...opcoes });
    materiais.push(m);
    return m;
  };
  const uniformesComuns = () => ({
    ...THREE.UniformsUtils.clone(neblina),
    ...comum,
  });

  const matCorpo = shader({
    uniforms: { ...uniformesComuns(), ...sombraLinhas, uFibra: { value: texFibra }, uCorPapel: { value: corPapel }, uAbertura },
    vertexShader: VERT_SIMPLES,
    fragmentShader: FRAG_CORPO,
    side: THREE.DoubleSide,
  });
  const matForro = shader({
    uniforms: { ...uniformesComuns(), uFibra: { value: texFibra }, uForro: { value: texForro }, uCorPapel: { value: corPapel } },
    vertexShader: VERT_SIMPLES,
    fragmentShader: FRAG_FORRO,
    side: THREE.DoubleSide,
  });
  const uAba = { uTheta: { value: 0 }, uCurva: { value: 0 }, uDobraZ: { value: -ROLO * 0.5 } };
  const matAba = shader({
    uniforms: { ...uniformesComuns(), ...sombraLinhas, ...uAba, uFibra: { value: texFibra }, uForro: { value: texForro }, uCorPapel: { value: corPapel } },
    vertexShader: VERT_ABA,
    fragmentShader: FRAG_ABA,
    side: THREE.DoubleSide,
  });
  const matCarta = shader({
    uniforms: {
      uLuzDir: comum.uLuzDir,
      uLuz: comum.uLuz,
      uBranco: { value: 0 },                 // o papel não some junto com o envelope
      uFibra: { value: texFibra },
      uCorPapel: { value: new THREE.Color(COR_CARTA) },
      uCorChapada: { value: new THREE.Color(corDoPapelCss()) },
      uPlano: { value: 0 },
      uOpac: { value: 1 },
      uDobra: { value: 1 },
      uOnda: { value: 0 },
    },
    vertexShader: VERT_CARTA,
    fragmentShader: FRAG_CARTA,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
    transparent: true,
  });
  const uBrilho = { value: 99 };
  const uAlfaFio = { value: 1 };
  const matCordao = shader({
    uniforms: {
      ...uniformesComuns(),
      uCorFio: { value: new THREE.Color(COR_CORDAO) },
      uBrilho: amarracao === 'fio' ? uBrilho : { value: 99 },
      uCentroLaco: { value: new THREE.Vector3(0, LACRE_Y, 0) },
      uAlfa: uAlfaFio,
    },
    vertexShader: VERT_CORDAO,
    fragmentShader: FRAG_CORDAO,
    transparent: true,
  });

  // ---- corpo (verso, com a boca aberta) -------------------------------------------
  const geometrias = [];
  const geo = (g) => { geometrias.push(g); return g; };

  const corpoGeo = geo(new THREE.PlaneGeometry(1, 1, baixo ? 40 : 72, baixo ? 28 : 52));
  {
    const pos = corpoGeo.attributes.position;
    const adensar = (t) => Math.sign(t) * (1 - Math.pow(1 - Math.abs(t), 1.8));
    for (let i = 0; i < pos.count; i++) {
      const x = adensar(pos.getX(i) * 2) * (W / 2);
      const y = adensar(pos.getY(i) * 2) * (H / 2);
      pos.setXYZ(i, x, y, zCorpo(x, y));
    }
    corpoGeo.computeVertexNormals();
    corpoGeo.computeBoundingBox();
    corpoGeo.computeBoundingSphere();
  }
  const corpo = new THREE.Mesh(corpoGeo, matCorpo);
  interno.add(corpo);

  // forro (dentro) + frente do envelope (por fora, do outro lado)
  const forro = new THREE.Mesh(geo(new THREE.PlaneGeometry(W - 0.002, H - 0.002)), matForro);
  forro.position.z = FUNDO_Z;
  interno.add(forro);

  // ---- a carta, dobrada em três lá dentro ------------------------------------------
  const papel = new THREE.Mesh(geo(new THREE.PlaneGeometry(PAPEL_L, PAPEL_A, 4, baixo ? 48 : 90)), matCarta);
  papel.geometry.computeBoundingBox();
  papel.position.set(0, PAPEL_Y, PAPEL_Z);
  papel.visible = false;
  papel.frustumCulled = false;
  interno.add(papel);

  // ---- aba de cima, articulada ------------------------------------------------------
  const abaGeo = geo(new THREE.PlaneGeometry(W, ABA_L + 0.004, baixo ? 24 : 40, baixo ? 18 : 32));
  abaGeo.translate(0, -(ABA_L + 0.004) / 2, 0);
  const aba = new THREE.Mesh(abaGeo, matAba);
  aba.frustumCulled = false;
  aba.renderOrder = 1;
  interno.add(aba);

  // ---- cordão / fio -------------------------------------------------------------------
  const amarra = new THREE.Group();
  amarra.name = 'amarracao';
  interno.add(amarra);
  const laco = new THREE.Group();          // o laço (fica sob o lacre, no cordão)
  amarra.add(laco);
  const ponta = new THREE.Object3D();      // ponta solta do laço: ancoraFio
  laco.add(ponta);

  const raioFio = amarracao === 'fio' ? 0.0008 : 0.0015;
  const passoTorcao = amarracao === 'fio' ? 0.0026 : 0.0042;
  const segTubo = baixo ? 0.6 : 1;
  const radiais = baixo ? 5 : 8;

  // cada volta tem o próprio material (mesmo programa): ela cede no seu tempo, para o seu lado
  const matVolta = (lado) => shader({
    uniforms: { ...matCordao.uniforms, ...uniformesComuns(), uSolta: { value: 0 }, uLado: { value: lado } },
    vertexShader: VERT_CORDAO,
    fragmentShader: FRAG_CORDAO,
    transparent: true,
  });

  function tubo(pontos, { fechado = false, pai = amarra, raio = raioFio, mat = matCordao } = {}) {
    const curva = new THREE.CatmullRomCurve3(pontos, fechado, 'centripetal');
    const comp = curva.getLength();
    const segs = Math.max(12, Math.round((comp / 0.0012) * segTubo));
    const g = geo(new THREE.TubeGeometry(curva, segs, raio, radiais, fechado));
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * comp) / passoTorcao);
    const m = new THREE.Mesh(g, mat);
    pai.add(m);
    if (!fechado) {
      // pontas arrematadas (sem o tubo oco aparecendo)
      for (const p of [pontos[0], pontos[pontos.length - 1]]) {
        const bola = new THREE.Mesh(geoPonta, matCordao);
        bola.scale.setScalar(raio);
        bola.position.copy(p);
        pai.add(bola);
      }
    }
    return { mesh: m, curva };
  }
  const geoPonta = geo(new THREE.SphereGeometry(1, 8, 6));

  /** Ponto do cordão deitado na superfície, com folga para cima. */
  const naSuperficie = (x, y, extra = 0) => new THREE.Vector3(x, y, zSuperficie(x, y) + raioFio + 0.00025 + extra);

  /** Volta inteira em torno do envelope, na horizontal (y em função de x). */
  function voltaHorizontal(yDe, extra = 0) {
    const pts = [];
    const n = 26;
    for (let i = 0; i <= n; i++) {
      const x = -W / 2 + 0.002 + ((W - 0.004) * i) / n;
      pts.push(naSuperficie(x, yDe(x), extra));
    }
    const yd = yDe(W / 2); const ye = yDe(-W / 2);
    const atras = FUNDO_Z - raioFio - 0.0003;
    pts.push(new THREE.Vector3(W / 2 + raioFio * 0.9, yd, -ROLO * 0.9));
    pts.push(new THREE.Vector3(W / 2 - 0.002, yd, atras));
    pts.push(new THREE.Vector3(0, (yd + ye) / 2, atras));
    pts.push(new THREE.Vector3(-W / 2 + 0.002, ye, atras));
    pts.push(new THREE.Vector3(-W / 2 - raioFio * 0.9, ye, -ROLO * 0.9));
    return pts;
  }

  function voltaVertical(x) {
    const pts = [];
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const y = H / 2 - 0.002 - ((H - 0.004) * i) / n;
      // por cima do cordão horizontal, no cruzamento
      const cruza = Math.exp(-Math.pow((y - LACRE_Y) / 0.004, 2)) * raioFio * 1.6;
      pts.push(naSuperficie(x, y, cruza));
    }
    const atras = FUNDO_Z - raioFio - 0.0003;
    pts.push(new THREE.Vector3(x, -H / 2 - raioFio * 0.9, -ROLO * 0.9));
    pts.push(new THREE.Vector3(x, -H / 2 + 0.002, atras));
    pts.push(new THREE.Vector3(x, 0, atras));
    pts.push(new THREE.Vector3(x, H / 2 - 0.002, atras));
    pts.push(new THREE.Vector3(x, H / 2 + raioFio * 0.9, -ROLO * 0.9 + CAMADA));
    return pts;
  }

  const plano = (pts2, extra) => pts2.map(([x, y]) => naSuperficie(x, y, extra));
  const linhas = [sombraLinhas.uLinha0.value, sombraLinhas.uLinha1.value];
  let alturaLaco = raioFio * 2.6;

  // cada volta num grupo próprio: ao soltar, elas se separam em vez de cair como uma cruz rígida
  const voltas = [];
  const novaVolta = () => {
    const g = new THREE.Group();
    amarra.add(g);
    g.userData.mat = matVolta(voltas.length % 2 ? 1 : -1);
    voltas.push(g);
    return g;
  };

  const naVolta = () => { const g = novaVolta(); return { pai: g, mat: g.userData.mat }; };

  if (amarracao === 'fio') {
    // duas voltas finas, quase paralelas, que se cruzam; laço simples no meio
    const incl = 0.028;
    tubo(voltaHorizontal(() => LACRE_Y + 0.0026), { fechado: true, ...naVolta() });
    tubo(voltaHorizontal((x) => LACRE_Y - 0.0024 + x * incl, raioFio * 1.2), { fechado: true, ...naVolta() });
    linhas[0].set(0, 1, -(LACRE_Y + 0.0026), raioFio);
    const n = Math.hypot(incl, 1);
    linhas[1].set(-incl / n, 1 / n, (LACRE_Y - 0.0024) * (-1 / n), raioFio);
    alturaLaco = raioFio * 3.4;
    const y = LACRE_Y;
    tubo(plano([[0, y + 0.001], [-0.006, y + 0.006], [-0.016, y + 0.009], [-0.023, y + 0.004], [-0.019, y - 0.002], [-0.009, y - 0.001], [0, y]], alturaLaco), { pai: laco, fechado: true });
    tubo(plano([[0, y], [0.007, y + 0.007], [0.017, y + 0.010], [0.024, y + 0.005], [0.021, y - 0.002], [0.01, y - 0.001], [0, y + 0.001]], alturaLaco), { pai: laco, fechado: true });
    tubo(plano([[-0.001, y - 0.001], [-0.006, y - 0.010], [-0.010, y - 0.019], [-0.009, y - 0.026]], alturaLaco * 0.8), { pai: laco });
    // a ponta comprida desce e passa da borda: é ali que o fio do caminho chega
    const pts = plano([[0.001, y - 0.001], [0.005, y - 0.015], [0.004, y - 0.035], [0.002, y - 0.052]], alturaLaco * 0.6);
    const fimY = -H / 2 - 0.013;
    pts.push(new THREE.Vector3(0.0018, -H / 2 + 0.001, zCorpo(0.0018, -H / 2 + 0.006) + raioFio * 2));
    pts.push(new THREE.Vector3(0.0016, fimY, raioFio * 2.5));
    tubo(pts, { pai: laco });
    ponta.position.copy(pts[pts.length - 1]);
    const no = new THREE.Mesh(geoPonta, matCordao);
    no.scale.set(raioFio * 2.2, raioFio * 2.0, raioFio * 1.8);
    no.position.copy(naSuperficie(0, y, alturaLaco + raioFio * 0.4));
    laco.add(no);
  } else {
    // cordão em cruz, passando sob o lacre, com um laço pequeno que escapa por baixo dele
    tubo(voltaHorizontal(() => LACRE_Y), { fechado: true, ...naVolta() });
    tubo(voltaVertical(0), { fechado: true, ...naVolta() });
    linhas[0].set(0, 1, -LACRE_Y, raioFio);
    linhas[1].set(1, 0, 0, raioFio);
    const y = LACRE_Y;
    const a = alturaLaco;
    // laço pequeno e justo: quem chama atenção é o lacre
    const justo = (pts) => pts.map(([x, yy]) => [x * 0.86, y + (yy - y) * 0.9]);
    tubo(plano(justo([[-0.004, y + 0.002], [-0.014, y + 0.010], [-0.027, y + 0.015], [-0.036, y + 0.010], [-0.035, y + 0.001], [-0.025, y - 0.002], [-0.012, y - 0.001], [-0.004, y]]), a), { pai: laco, fechado: true });
    tubo(plano(justo([[0.004, y], [0.013, y + 0.009], [0.026, y + 0.013], [0.035, y + 0.007], [0.033, y - 0.002], [0.022, y - 0.003], [0.011, y - 0.001], [0.004, y + 0.002]]), a), { pai: laco, fechado: true });
    tubo(plano([[-0.003, y - 0.003], [-0.010, y - 0.014], [-0.015, y - 0.026], [-0.013, y - 0.036]], a * 0.8), { pai: laco });
    tubo(plano([[0.003, y - 0.003], [0.011, y - 0.015], [0.019, y - 0.027], [0.025, y - 0.035]], a * 0.8), { pai: laco });
    ponta.position.copy(naSuperficie(0.025, y - 0.035, a * 0.8));
  }

  // ---- lacre de cera, já pré-fraturado em três ---------------------------------------
  let lacreGrupo = null;
  const pedacos = [];
  let farelo = [];
  let matCera = null;
  if (lacre) {
    const texSinete = textura(telaSinete(lacre, baixo ? 128 : 256), false, false);
    const uAlfaCera = { value: 1 };
    const cera = (comSinete) => shader({
      uniforms: {
        ...uniformesComuns(),
        uSinete: { value: texSinete },
        uRaioSinete: { value: LACRE_R * 0.64 },
        uComSinete: { value: comSinete },
        uCorCera: { value: new THREE.Color(COR_CERA) },
        uBrilho: comSinete ? uBrilho : { value: 99 },
        uAlfa: uAlfaCera,
      },
      vertexShader: VERT_CERA,
      fragmentShader: FRAG_CERA,
      transparent: true,
    });
    matCera = cera(1);
    lacreGrupo = new THREE.Group();
    // por cima do cruzamento do cordão e do nó do laço
    lacreGrupo.position.set(0, LACRE_Y, zSuperficie(0, LACRE_Y) + alturaLaco + raioFio * 1.4);
    interno.add(lacreGrupo);
    const { geometria, partes } = geometriaLacre(THREE, rnd, baixo, alturaLaco + raioFio * 1.4 - 0.0003);
    geo(geometria);
    for (const parte of partes) {
      const g = geo(new THREE.BufferGeometry());
      g.setAttribute('position', geometria.attributes.position);
      g.setAttribute('normal', geometria.attributes.normal);
      g.setIndex(parte.indices);
      g.computeBoundingSphere();
      const pivo = new THREE.Group();
      pivo.position.copy(parte.centro);
      const m = new THREE.Mesh(g, matCera);
      m.position.copy(parte.centro).multiplyScalar(-1);
      pivo.add(m);
      lacreGrupo.add(pivo);
      pedacos.push({ pivo, centro: parte.centro.clone() });
    }
    // farelo de cera (aparece só quando trinca)
    if (!baixo && !reduzido) {
      const matFarelo = cera(0);
      const geoFarelo = geo(new THREE.IcosahedronGeometry(1, 0));
      for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(geoFarelo, matFarelo);
        m.scale.set(0.0005 + rnd() * 0.0007, 0.0004 + rnd() * 0.0006, 0.0004 + rnd() * 0.0005);
        const a = rnd() * Math.PI * 2;
        const r = LACRE_R * (0.3 + rnd() * 0.6);
        m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.002);
        m.visible = false;
        lacreGrupo.add(m);
        farelo.push(m);
      }
    }
  } else {
    sombraLinhas.uSombraLacre.value = 0;
  }

  // ---- estado de animação -------------------------------------------------------------
  const tweens = new Set();
  const guardar = (a) => { tweens.add(a); a.eventCallback('onComplete', () => tweens.delete(a)); return a; };
  const t = (alvo, vars) => guardar(gsap.to(alvo, vars));

  const mola = { x: 0, y: 0, vx: 0, vy: 0 };
  const pose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, flutua: 1, segue: 1, aperto: 0 };
  const entrada = { k: 0, z: 0 };
  const voando = [];         // pedaços de cera e farelo soltos no mundo
  let modo = 'espera';
  let tempoBrilho = 0;
  let papelSolto = false;
  let descartado = false;
  let preparo = null;
  const vAux = new THREE.Vector3();
  const vAux2 = new THREE.Vector3();
  const gravidade = 3.4;

  const cantos = [
    new THREE.Vector3(-W / 2, -H / 2, 0),
    new THREE.Vector3(W / 2, -H / 2, 0),
    new THREE.Vector3(W / 2, H / 2, 0),
    new THREE.Vector3(-W / 2, H / 2, 0),
  ];

  function caixaNdc() {
    grupo.updateWorldMatrix(true, true);
    camera.updateWorldMatrix(true, false);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const canto of cantos) {
      vAux.copy(canto).applyMatrix4(interno.matrixWorld).project(camera);
      if (vAux.z > 1 || vAux.z < -1) return null;
      minX = Math.min(minX, vAux.x); maxX = Math.max(maxX, vAux.x);
      minY = Math.min(minY, vAux.y); maxY = Math.max(maxY, vAux.y);
    }
    return { minX, maxX, minY, maxY };
  }

  const env = {
    grupo,
    papel,
    lacre,
    amarracao,
    aberto: false,
    aoMarco: null,

    atualizar(dt, tempo) {
      if (descartado) return;
      const passo = dt * (amb.rapido || 1);
      const calmo = reduzido ? 0.3 : 1;

      // mola atrás do ponteiro: atraso e uma ultrapassagem leve (até ±12°)
      const alvoY = mundo.ponteiro.x * 0.21 * calmo * pose.segue;
      const alvoX = -mundo.ponteiro.y * 0.17 * calmo * pose.segue;
      const k = 34; const c = 6.2;
      const h = Math.min(passo, 1 / 30);
      for (let i = 0; i < 2; i++) {
        mola.vx += (k * (alvoX - mola.x) - c * mola.vx) * h * 0.5;
        mola.vy += (k * (alvoY - mola.y) - c * mola.vy) * h * 0.5;
        mola.x += mola.vx * h * 0.5;
        mola.y += mola.vy * h * 0.5;
      }

      const fl = pose.flutua * calmo;
      const ent = entrada.k;
      interno.position.set(
        pose.x,
        Math.sin(tempo * 0.9) * 0.009 * fl + pose.y + ent * 0.18,
        pose.z - pose.aperto * 0.004 - entrada.z,
      );
      interno.rotation.set(
        mola.x + Math.sin(tempo * 0.53 + 0.4) * 0.018 * fl + pose.rx - ent * 0.62,
        mola.y + Math.sin(tempo * 0.37) * 0.105 * fl + pose.ry + ent * 0.4,
        Math.sin(tempo * 0.6 + 1.3) * 0.02 * fl + pose.rz + ent * 0.24,
      );

      // convite: a cada ~5 s um brilho atravessa o lacre (ou o laço)
      if (modo === 'espera' && !reduzido) {
        tempoBrilho += passo;
        const ciclo = tempoBrilho % 5;
        uBrilho.value = ciclo < 1.1 ? -0.03 + (ciclo / 1.1) * 0.05 + (amarracao === 'fio' ? LACRE_Y * 0.6 : 0) : 99;
      } else {
        uBrilho.value = 99;
      }

      // pedaços de cera que caem com gravidade
      for (let i = voando.length - 1; i >= 0; i--) {
        const p = voando[i];
        p.vida -= passo;
        p.v.y -= gravidade * passo;
        p.obj.position.addScaledVector(p.v, passo);
        p.obj.rotateOnAxis(p.eixo, p.giro * passo);
        if (p.vida <= 0) {
          p.obj.visible = false;
          if (p.obj.parent) p.obj.parent.remove(p.obj);
          voando.splice(i, 1);
        }
      }
    },

    acertou(xNdc, yNdc) {
      if (!grupo.visible || descartado) return false;
      const c = caixaNdc();
      if (!c) return false;
      // margem generosa: ~30 px de cada lado
      const mx = (30 / Math.max(1, mundo.tamanho.largura)) * 2;
      const my = (30 / Math.max(1, mundo.tamanho.altura)) * 2;
      return xNdc >= c.minX - mx && xNdc <= c.maxX + mx && yNdc >= c.minY - my && yNdc <= c.maxY + my;
    },

    caixaTela() {
      const c = caixaNdc();
      const L = mundo.tamanho.largura; const A = mundo.tamanho.altura;
      if (!c) return null;
      const left = (c.minX * 0.5 + 0.5) * L; const right = (c.maxX * 0.5 + 0.5) * L;
      const top = (-c.maxY * 0.5 + 0.5) * A; const bottom = (-c.minY * 0.5 + 0.5) * A;
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    },

    /** Compila os programas e sobe as texturas antes de a carta entrar em cena (uma vez só). */
    preparar() {
      if (!preparo) {
        const { renderer } = mundo;
        preparo = Promise.resolve().then(() => {
          for (const tx of texturas) renderer.initTexture?.(tx);
          if (renderer.compileAsync) return renderer.compileAsync(grupo, camera, mundo.cena);
          renderer.compile?.(grupo, camera, mundo.cena);
          return null;
        }).catch((erro) => { console.error('[carta] preparar envelope', erro); });
      }
      return preparo;
    },

    get descartado() { return descartado; },

    get ancoraFio() {
      grupo.updateWorldMatrix(true, true);
      return ponta.getWorldPosition(new THREE.Vector3());
    },

    pressionar(apertado) {
      if (modo !== 'espera') return;
      t(pose, { aperto: apertado ? 1 : 0, duration: apertado ? 0.12 : 0.5, ease: apertado ? curvas.ui.resposta : curvas.branco.entrar, overwrite: 'auto' });
    },

    chegar({ duracao = 2.4, distancia = 2.4, atraso = 0 } = {}) {
      if (reduzido) {
        // sem grande deslocamento: nasce do branco no lugar
        comum.uBranco.value = 1;
        return comoPromise(t(comum.uBranco, { value: 0, duration: Math.min(1.4, duracao), delay: atraso, ease: 'none' }));
      }
      entrada.k = 1;
      entrada.z = distancia;
      const tl = guardar(gsap.timeline({ delay: atraso }));
      tl.to(entrada, { z: 0, duration: duracao, ease: curvas.branco.entrar }, 0)
        .to(entrada, { k: 0, duration: duracao * 1.15, ease: 'power3.out' }, 0);
      return comoPromise(tl);
    },

    abrir() {
      if (env.aberto) return Promise.resolve({ papel });
      env.aberto = true;
      modo = 'abrindo';
      const tl = guardar(gsap.timeline());
      const avisar = (nome) => { try { env.aoMarco?.(nome); } catch (erro) { console.error(erro); } };

      // resposta ao toque: afunda 4 mm e volta; a flutuação para devagar
      tl.to(pose, { aperto: 1, duration: 0.12, ease: curvas.ui.resposta }, 0)
        .to(pose, { aperto: 0, duration: 0.5, ease: curvas.branco.entrar }, 0.12)
        .to(pose, { flutua: 0, segue: 0, duration: 1.1, ease: 'power2.out' }, 0);

      // o lacre trinca, os pedaços saltam girando e caem
      if (lacreGrupo) {
        tl.add(() => {
          avisar('lacre');
          for (const p of pedacos) {
            const dir = vAux2.set(p.centro.x, p.centro.y, 0).normalize();
            t(p.pivo.position, { x: p.centro.x + dir.x * 0.0006, y: p.centro.y + dir.y * 0.0006, duration: 0.1, ease: curvas.ui.resposta });
            t(p.pivo.rotation, { x: -dir.y * 0.06, y: dir.x * 0.06, duration: 0.1, ease: curvas.ui.resposta });
          }
        }, 0.14);
        tl.add(() => estourarLacre(), reduzido ? 0.5 : 0.34);
        tl.to(sombraLinhas.uSombraLacre, { value: 0, duration: 0.2, ease: 'none' }, reduzido ? 0.5 : 0.34);
      } else {
        tl.add(() => avisar('lacre'), 0.14);
        tl.add(() => {
          laco.updateWorldMatrix(true, false);
          mundo.petalas.rajada(laco.localToWorld(new THREE.Vector3(0, LACRE_Y, 0.01)), reduzido ? 6 : 14);
        }, 0.3);
      }

      // o laço é puxado, as voltas afrouxam, escorregam e caem
      const tLaco = lacre ? 0.42 : 0.24;
      if (reduzido) {
        tl.to(uAlfaFio, { value: 0, duration: 0.6, ease: 'none' }, tLaco)
          .to(sombraLinhas.uSombraFio, { value: 0, duration: 0.5, ease: 'none' }, tLaco)
          .add(() => { amarra.visible = false; }, tLaco + 0.62);
      } else {
        tl.to(laco.scale, { x: 0.25, y: 0.55, z: 1, duration: 0.34, ease: 'power2.in' }, tLaco)
          .to(laco.position, { y: LACRE_Y * 0.75, duration: 0.34, ease: 'power2.in' }, tLaco)
          .to(amarra.scale, { x: 1.05, y: 1.08, z: 1.6, duration: 0.36, ease: 'power2.out' }, tLaco + 0.22)
          .to(sombraLinhas.uSombraFio, { value: 0, duration: 0.35, ease: 'none' }, tLaco + 0.25)
          // o laço puxado se desfaz no próprio cordão; as voltas escorregam cada uma para
          // um lado, com um pequeno atraso entre elas (corda solta, não uma peça só)
          .to(laco.scale, { x: 0.02, y: 0.05, duration: 0.3, ease: 'power2.in' }, tLaco + 0.34)
          .add(() => { laco.visible = false; }, tLaco + 0.64)
          .to(uAlfaFio, { value: 0, duration: 0.4, ease: 'power1.in' }, tLaco + 0.78)
          .add(() => { amarra.visible = false; }, tLaco + 1.2);
        // Cada volta afrouxa primeiro (cede, barriga, arqueia) e só então escorrega
        // para baixo e para o seu lado, quase sem girar: uma corda solta, não uma peça.
        voltas.forEach((g, i) => {
          const lado = i % 2 ? 1 : -1;
          const t0 = tLaco + 0.34 + i * 0.08;
          tl.to(g.userData.mat.uniforms.uSolta, { value: 1, duration: 0.5, ease: 'power2.out' }, t0)
            .to(g.position, { y: -0.2 - i * 0.03, x: lado * 0.03, duration: 0.8, ease: 'power2.in' }, t0 + 0.12)
            .to(g.rotation, { z: lado * -0.12, x: -0.1 - i * 0.08, duration: 0.8, ease: 'power1.in' }, t0 + 0.12);
        });
      }

      // a aba levanta (dobrando um pouco) e mostra o forro vermelho
      const tAba = lacre ? 0.95 : 0.85;
      const aba0 = { p: 0 };
      tl.to(aba0, {
        p: 1,
        duration: reduzido ? 1.0 : 1.3,
        ease: 'power2.inOut',
        onUpdate: () => {
          const th = aba0.p * ABERTA;
          uAba.uTheta.value = th;
          uAba.uCurva.value = -3.4 * Math.sin(Math.min(Math.PI, th));
        },
      }, tAba)
        .to(uAbertura, { value: 1, duration: 0.45, ease: 'none' }, tAba);

      // o papel sobe de dentro e vira de frente para ela
      const tPapel = tAba + 0.72;
      tl.add(() => { papel.visible = true; avisar('papel'); }, tPapel)
        .to(papel.position, { y: 0.165, duration: 1.15, ease: 'power3.inOut' }, tPapel)
        .to(papel.position, { z: 0.028, duration: 0.6, ease: curvas.branco.entrar }, tPapel + 0.85)
        .fromTo(papel.rotation, { z: 0.035 }, { z: 0, duration: 1.4, ease: curvas.branco.entrar }, tPapel)
        .to(papel.rotation, { x: -0.06, duration: 0.5, ease: 'power2.inOut' }, tPapel + 0.55)
        .to(papel.rotation, { x: 0, duration: 0.6, ease: curvas.branco.entrar }, tPapel + 1.0)
        .to(pose, { y: -0.05, rx: 0.03, duration: 1.3, ease: curvas.branco.entrar }, tPapel + 0.2)
        .to(mola, { x: 0, y: 0, vx: 0, vy: 0, duration: 0.8, ease: 'power2.out' }, 0.4);

      return comoPromise(tl).then(() => {
        modo = 'aberto';
        papel.position.set(0, 0.165, 0.028);
        papel.rotation.set(0, 0, 0);
        return { papel };
      });
    },

    entregarPapel(rect) {
      const alvo = typeof rect === 'function' ? rect() : rect;
      modo = 'entregando';
      papelSolto = true;
      papel.visible = true;
      const pose3 = mundo.retanguloParaPose(alvo, papel);
      // Quando a folha cobre a tela (celular), o papel pousa ~1,5% maior (no mínimo
      // ~2 px além de cada borda): nenhuma lasca do mundo nem pétala aparece no quadro da troca.
      if (alvo && alvo.width >= innerWidth - 2) {
        pose3.escala.x *= Math.max(1.015, 1 + 4 / Math.max(1, alvo.width));
        pose3.escala.y *= Math.max(1.015, 1 + 4 / Math.max(1, alvo.height));
      }
      pose3.pai.attach(papel);                             // agora no espaço da câmera: não treme com o passo
      papel.renderOrder = 20;
      matCarta.depthTest = false;                          // passa na frente de tudo enquanto cresce
      matCarta.transparent = true;
      const u = matCarta.uniforms;

      const tl = guardar(gsap.timeline());
      if (reduzido) {
        // sem voo: o papel e o envelope se dissolvem no branco e o papel reaparece já no
        // lugar (nada some de um quadro para o outro)
        tl.to(u.uOpac, { value: 0, duration: 0.35, ease: 'none' }, 0)
          .to(comum.uBranco, { value: 1, duration: 0.45, ease: 'none' }, 0)
          .add(() => {
            grupo.visible = false;
            papel.position.copy(pose3.posicao);
            papel.quaternion.copy(pose3.quaternion);
            papel.scale.copy(pose3.escala);
            u.uDobra.value = 0;
            u.uPlano.value = 1;
          }, 0.45)
          .to(u.uOpac, { value: 1, duration: 0.5, ease: 'none' }, 0.45);
        return comoPromise(tl);
      }

      const dur = 1.8;
      const deQ = papel.quaternion.clone();
      const giro = { p: 0 };
      tl.to(papel.position, { x: pose3.posicao.x, y: pose3.posicao.y, z: pose3.posicao.z, duration: dur, ease: curvas.branco.camera }, 0)
        .to(papel.scale, { x: pose3.escala.x, y: pose3.escala.y, z: 1, duration: dur, ease: curvas.branco.camera }, 0)
        .to(giro, { p: 1, duration: dur * 0.85, ease: 'power3.inOut', onUpdate: () => papel.quaternion.slerpQuaternions(deQ, pose3.quaternion, giro.p) }, 0)
        .to(u.uDobra, { value: 0, duration: dur * 0.7, ease: 'power2.inOut' }, 0.12)
        .to(u.uOnda, { value: 0.006, duration: dur * 0.35, ease: 'power2.out' }, 0.1)
        // a onda acaba antes do último quarto: o papel pousa plano
        .to(u.uOnda, { value: 0, duration: dur * 0.38, ease: 'power2.inOut' }, 0.1 + dur * 0.35)
        // a luz sai do papel enquanto ele ainda voa: os três terços que se desdobram
        // param de ter tons diferentes e ele chega já na cor exata da folha DOM
        .to(u.uPlano, { value: 1, duration: dur * 0.5, ease: 'power1.inOut' }, dur * 0.3)
        // o envelope cai para trás e se dissolve no branco
        .to(pose, { z: -0.32, y: -0.16, rx: -1.1, duration: dur * 0.9, ease: curvas.branco.sair }, 0.05)
        .to(comum.uBranco, { value: 1, duration: dur * 0.75, ease: 'power1.in' }, 0.15)
        .add(() => { grupo.visible = false; }, dur * 0.92);
      return comoPromise(tl).then(() => {
        u.uDobra.value = 0;
        u.uOnda.value = 0;
        u.uPlano.value = 1;
        papel.position.copy(pose3.posicao);
        papel.quaternion.copy(pose3.quaternion);
        papel.scale.copy(pose3.escala);
      });
    },

    irEmbora() {
      modo = 'indo';
      if (!grupo.visible) return Promise.resolve();
      const tl = guardar(gsap.timeline());
      tl.to(pose, { flutua: 0, segue: 0, duration: 0.6, ease: 'power2.out' }, 0);
      if (reduzido) {
        tl.to(comum.uBranco, { value: 1, duration: 0.9, ease: 'none' }, 0);
      } else {
        tl.to(pose, { z: -9, y: 0.8, duration: 2.4, ease: curvas.branco.sair }, 0)
          .to(pose, { rx: -0.45, rz: 0.28, ry: 0.3, duration: 2.4, ease: curvas.branco.deriva }, 0)
          .to(comum.uBranco, { value: 1, duration: 1.2, ease: 'power1.in' }, 1.3);
      }
      return comoPromise(tl).then(() => { grupo.visible = false; });
    },

    dispose() {
      if (descartado) return;
      descartado = true;
      for (const a of tweens) a.kill();
      tweens.clear();
      for (const p of voando) if (p.obj.parent) p.obj.parent.remove(p.obj);
      voando.length = 0;
      if (grupo.parent) grupo.parent.remove(grupo);
      if (papel.parent) papel.parent.remove(papel);
      for (const g of new Set(geometrias)) g.dispose();
      for (const m of materiais) m.dispose();
      for (const tx of texturas) tx.dispose();
    },
  };

  function estourarLacre() {
    lacreGrupo.updateWorldMatrix(true, true);
    const centroMundo = lacreGrupo.getWorldPosition(new THREE.Vector3());
    mundo.petalas.rajada(centroMundo.clone().add(new THREE.Vector3(0, 0, -0.01)), reduzido ? 6 : 18);
    interno.updateWorldMatrix(true, false);
    const rot = new THREE.Matrix3().setFromMatrix4(interno.matrixWorld);
    const frente = new THREE.Vector3(0, 0, 1).applyMatrix3(rot).normalize();
    const lista = [...pedacos.map((p) => ({ obj: p.pivo, centro: p.centro, grande: true })), ...farelo.map((m) => ({ obj: m, centro: m.position.clone(), grande: false }))];
    for (const item of lista) {
      const { obj } = item;
      obj.visible = true;
      mundo.cena.attach(obj);
      const dir = new THREE.Vector3(item.centro.x, item.centro.y, 0);
      if (dir.lengthSq() < 1e-8) dir.set(rnd() - 0.5, rnd() - 0.5, 0);
      dir.normalize().applyMatrix3(rot);
      const forca = reduzido ? 0.04 : item.grande ? 0.16 + rnd() * 0.08 : 0.2 + rnd() * 0.22;
      const v = dir.multiplyScalar(forca)
        .addScaledVector(frente, reduzido ? 0.02 : 0.12 + rnd() * 0.12)
        .add(new THREE.Vector3(0, reduzido ? 0 : 0.28 + rnd() * 0.3, 0));
      const eixo = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      voando.push({ obj, v, eixo, giro: reduzido ? 1 : 7 + rnd() * 9, vida: reduzido ? 0.7 : 1.8 });
    }
    if (reduzido && matCera) t(matCera.uniforms.uAlfa, { value: 0, duration: 0.6, ease: 'none' });
    lacreGrupo.visible = true;
  }

  return env;
}

/**
 * Lacre de cera: disco irregular com borda derramada, rebaixo do sinete com aro,
 * e três pedaços cujas bordas seguem rachaduras em zigue-zague.
 */
function geometriaLacre(THREE, rnd, baixo, afundar = 0) {
  const NA = baixo ? 14 : 24;           // anéis
  const NS = baixo ? 44 : 84;           // segmentos
  const R = LACRE_R;
  const H0 = 0.0026;
  const fases = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const gotas = Array.from({ length: 4 }, () => ({ a: rnd() * Math.PI * 2, f: 0.08 + rnd() * 0.14, w: 0.16 + rnd() * 0.16 }));
  const raio = (a) => {
    let r = 1 + 0.035 * Math.sin(3 * a + fases[0]) + 0.025 * Math.sin(5 * a + fases[1]) + 0.014 * Math.sin(11 * a + fases[2]) + 0.008 * Math.sin(19 * a + fases[3]);
    for (const g of gotas) {
      let d = Math.abs(((a - g.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      r += g.f * Math.exp(-(d * d) / (g.w * g.w));
    }
    return R * 0.92 * r;
  };
  const RS = R * 0.64;
  const altura = (rho, rn) => {
    // a cera escorre até encostar no papel (a base fica acima do cordão)
    const borda = (H0 + afundar) * Math.pow(clamp((1 - rn) / 0.36), 0.5) - afundar;
    const rs = rho / RS;
    const lab = H0 * 0.22 * Math.exp(-Math.pow((rs - 1.07) / 0.07, 2));
    const piso = H0 * 0.74;
    const m = clamp((rs - 0.97) / 0.07);
    return piso * (1 - m) + (borda + lab) * m;
  };

  const pos = [];
  pos.push(0, 0, altura(0, 0));
  for (let i = 1; i <= NA; i++) {
    const rn = i / NA;
    for (let j = 0; j < NS; j++) {
      const a = (j / NS) * Math.PI * 2;
      const rho = rn * raio(a);
      pos.push(Math.cos(a) * rho, Math.sin(a) * rho, altura(rho, rn));
    }
  }
  const idx = (i, j) => (i === 0 ? 0 : 1 + (i - 1) * NS + (((j % NS) + NS) % NS));
  const tris = [];
  for (let j = 0; j < NS; j++) tris.push([0, idx(1, j), idx(1, j + 1)]);
  for (let i = 1; i < NA; i++) {
    for (let j = 0; j < NS; j++) {
      tris.push([idx(i, j), idx(i + 1, j), idx(i + 1, j + 1)]);
      tris.push([idx(i, j), idx(i + 1, j + 1), idx(i, j + 1)]);
    }
  }
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometria.setIndex(tris.flat());
  geometria.computeVertexNormals();

  // rachaduras: três linhas do centro (um pouco deslocado) até a borda
  const c0 = { x: 0.0014, y: -0.0009 };
  const base = rnd() * Math.PI * 2;
  const angulos = [base, base + 2.1 + rnd() * 0.3, base + 4.15 + rnd() * 0.3];
  const fasesR = angulos.map(() => rnd() * 6.28);
  const norm = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const partes = angulos.map(() => ({ indices: [], soma: new THREE.Vector3(), n: 0 }));
  for (const tri of tris) {
    let cx = 0; let cy = 0; let cz = 0;
    for (const v of tri) { cx += pos[v * 3]; cy += pos[v * 3 + 1]; cz += pos[v * 3 + 2]; }
    cx /= 3; cy /= 3; cz /= 3;
    const dx = cx - c0.x; const dy = cy - c0.y;
    const r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const zig = (k) => angulos[k] + (0.28 * Math.sin(r * 1500 + fasesR[k]) + 0.12 * Math.sin(r * 4100 + fasesR[k] * 2)) * Math.min(1, r / (R * 0.25));
    const cortes = angulos.map((_, k) => norm(zig(k)));
    const an = norm(a);
    // em que fatia (entre dois cortes) o triângulo caiu
    const ordem = cortes.map((v, k) => ({ v, k })).sort((p, q) => p.v - q.v);
    let parte = ordem[ordem.length - 1].k;
    for (let k = 0; k < ordem.length; k++) {
      if (an >= ordem[k].v) parte = ordem[k].k;
    }
    partes[parte].indices.push(...tri);
    partes[parte].soma.add(new THREE.Vector3(cx, cy, cz));
    partes[parte].n++;
  }
  return {
    geometria,
    partes: partes.filter((p) => p.n > 0).map((p) => ({ indices: p.indices, centro: p.soma.divideScalar(p.n) })),
  };
}

// =============================================================================
// Leve (SVG + DOM)
// =============================================================================

// Estilos da carta leve, aplicados pelo próprio módulo (uma vez).
const ESTILO_LEVE = `
.cl {
  --cl-l: min(72vw, 400px, 88vh);
  position: absolute;
  left: 50%;
  top: 53%;
  width: var(--cl-l);
  height: calc(var(--cl-l) * 0.6956);
  margin: calc(var(--cl-l) * -0.3478) 0 0 calc(var(--cl-l) * -0.5);
  -webkit-perspective: 1100px;
  perspective: 1100px;
}
@media (orientation: landscape) and (max-height: 520px) {
  .cl { --cl-l: min(62vh * 1.4375, 400px); }
}
.cl-corpo {
  position: absolute;
  inset: 0;
  -webkit-transform-origin: 50% 60%;
  transform-origin: 50% 60%;
  will-change: transform;
}
.cl-sombra {
  position: absolute;
  left: 4%; right: 4%;
  bottom: -9%;
  height: 16%;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(42, 27, 34, 0.14), rgba(42, 27, 34, 0));
}
.cl-forro, .cl-frente, .cl-aba, .cl-amarra, .cl-lacre {
  position: absolute;
  overflow: visible;
}
.cl-forro { left: 0.5%; top: 0.5%; width: 99%; height: 99%; }
.cl-frente, .cl-amarra { left: 0; top: 0; width: 100%; height: 100%; }
.cl-aba {
  left: 0; top: 0;
  width: 100%;
  height: 66.875%;
  -webkit-transform-origin: 50% 0;
  transform-origin: 50% 0;
}
.cl-lacre {
  width: 17.4%;
  left: 41.3%;
  top: 47.5%;
}
.cl-papel {
  position: absolute;
  left: 5.5%;
  width: 89%;
  top: 5%;
  height: 84%;
  background: var(--papel);
  box-shadow: 0 0 0 1px rgba(150, 128, 104, 0.18);
  visibility: hidden;
}
.cl-papel::before, .cl-papel::after {
  content: "";
  position: absolute;
  left: 0; right: 0;
  height: 1px;
  background: rgba(120, 100, 80, 0.16);
  transition: opacity 0.6s;
}
.cl-papel::before { top: 33.3%; }
.cl-papel::after { top: 66.6%; }
.cl-papel.cl-sem-vinco::before, .cl-papel.cl-sem-vinco::after { opacity: 0; }
.cl-papel-solto {
  position: fixed;
  margin: 0;
  box-shadow: none;
  z-index: calc(var(--z-pergaminho) - 1);
}
`;

function garantirEstiloLeve() {
  if (document.getElementById('estilo-carta-leve')) return;
  const estilo = document.createElement('style');
  estilo.id = 'estilo-carta-leve';
  estilo.textContent = ESTILO_LEVE;
  document.head.append(estilo);
}

// Desenho na escala de 2000 px por metro: 460 × 320 = 23 × 16 cm.
const S = 2000;
const LW = W * S; const LH = H * S;
const ly = (y) => LH / 2 - y * S;              // y do mundo → y do SVG
const BY = ly(BOCA_Y); const FY = ly(FUNDO_Y); const AY = ABA_L * S; const CY = ly(LACRE_Y);

const MARCAS_LEVE = {
  coracao: 'M0 9.5C-15 0-10-13 0-5.5 10-13 15 0 0 9.5z',
  estrela: 'M0-12 3.5-4 12-3.7 5.2 1.8 7.6 10.3 0 5.3-7.6 10.3-5.2 1.8-12-3.7-3.5-4z',
};

function desenhoLeve(lacre, amarracao, id) {
  const cx = LW / 2;
  const boca = `M0 0 L${cx} ${BY} L${LW} 0`;
  const fundo = `M0 ${LH} L${cx - 22} ${FY + 9} Q${cx} ${FY - 3} ${cx + 22} ${FY + 9} L${LW} ${LH}`;
  // cantos de cima arredondados como os do corpo (rx 3): senão a ponta da aba escapa do contorno
  const aba = `M0 3 Q0 0 3 0 H${LW - 3} Q${LW} 0 ${LW} 3 L${cx + 22} ${AY - 14} Q${cx} ${AY + 4} ${cx - 22} ${AY - 14} Z`;
  const forro = `
    <svg class="cl-forro" viewBox="0 0 ${LW} ${LH}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id="${id}-petalas" width="46" height="46" patternUnits="userSpaceOnUse">
          <rect width="46" height="46" fill="${COR_FORRO}"/>
          <path d="M10 14c-5-3-4-9 0-9s5 6 0 9z" fill="rgba(120,6,32,0.35)"/>
          <path d="M33 34c-5-3-4-9 0-9s5 6 0 9z" fill="rgba(214,52,88,0.25)" transform="rotate(130 33 30)"/>
          <path d="M36 12c-4-2-3-7 0-7s4 5 0 7z" fill="rgba(120,6,32,0.28)" transform="rotate(70 36 9)"/>
        </pattern>
      </defs>
      <rect width="${LW}" height="${LH}" rx="3" fill="url(#${id}-petalas)"/>
    </svg>`;
  const frente = `
    <svg class="cl-frente" viewBox="0 0 ${LW} ${LH}" aria-hidden="true">
      <defs>
        <linearGradient id="${id}-luz" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fbf8f3"/>
          <stop offset="1" stop-color="#ebe3d6"/>
        </linearGradient>
        <linearGradient id="${id}-luz2" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stop-color="#fcfaf6"/>
          <stop offset="1" stop-color="#efe8dc"/>
        </linearGradient>
        <clipPath id="${id}-boca"><path d="${boca} Z"/></clipPath>
      </defs>
      <g clip-path="url(#${id}-boca)" fill="none" stroke="#2a1b22" stroke-linejoin="round">
        <path d="${boca}" stroke-width="22" opacity="0.07" transform="translate(-3 4)"/>
        <path d="${boca}" stroke-width="9" opacity="0.1" transform="translate(-2 3)"/>
      </g>
      <path d="M3 0 H${LW - 3} Q${LW} 0 ${LW} 3 V${LH - 3} Q${LW} ${LH} ${LW - 3} ${LH} H3 Q0 ${LH} 0 ${LH - 3} V3 Q0 0 3 0 Z ${boca} Z" fill-rule="evenodd" fill="url(#${id}-luz)"/>
      <path d="M${cx} ${BY} V${FY + 2}" stroke="#b9ab96" stroke-width="0.8" opacity="0.6"/>
      <path d="${fundo}" fill="none" stroke="#2a1b22" stroke-width="5" opacity="0.045" transform="translate(0 2)"/>
      <path d="${fundo} Z" fill="url(#${id}-luz2)"/>
      <path d="${fundo}" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.9"/>
      <path d="${boca}" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.85"/>
      <path class="cl-sombra-aba" d="${aba}" fill="none" stroke="#2a1b22" stroke-width="6" opacity="0.06" transform="translate(2 4)"/>
      <rect x="0.5" y="0.5" width="${LW - 1}" height="${LH - 1}" rx="3" fill="none" stroke="#2a1b22" stroke-width="1" opacity="0.06"/>
    </svg>`;
  const abaSvg = `
    <svg class="cl-aba" viewBox="0 0 ${LW} ${AY + 6}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="${id}-aba" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="#fdfbf7"/>
          <stop offset="1" stop-color="#f1ebe1"/>
        </linearGradient>
      </defs>
      <g class="cl-aba-fora">
        <path d="${aba}" fill="url(#${id}-aba)"/>
        <path d="M0 0 L${cx - 22} ${AY - 14}" stroke="#ffffff" stroke-width="1.2" opacity="0.9"/>
        <path d="M${LW} 0 L${cx + 22} ${AY - 14}" stroke="#d8cdbb" stroke-width="1" opacity="0.8"/>
      </g>
      <g class="cl-aba-dentro" visibility="hidden">
        <path d="${aba}" fill="url(#${id}-petalas)"/>
        <path d="${aba}" fill="#2a1b22" opacity="0.12"/>
      </g>
    </svg>`;

  const r = amarracao === 'fio' ? 1.7 : 3.2;
  const torcao = `
    <pattern id="${id}-torcao" width="${r * 2.6}" height="${r * 2.6}" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
      <rect width="${r * 2.6}" height="${r * 2.6}" fill="${COR_CORDAO}"/>
      <rect width="${r * 0.7}" height="${r * 2.6}" fill="#9d0c1f" opacity="0.55"/>
      <rect x="${r * 1.2}" width="${r * 0.5}" height="${r * 2.6}" fill="#ff6a6a" opacity="0.3"/>
    </pattern>`;
  const laco = amarracao === 'fio'
    ? `<path d="M${cx} ${CY} c-8 -12 -32 -18 -42 -8 c-6 8 6 12 42 8 z M${cx} ${CY} c10 -13 34 -18 44 -7 c5 8 -8 12 -44 7 z" fill="none" stroke="url(#${id}-torcao)" stroke-width="${r * 2}" stroke-linejoin="round"/>
       <path d="M${cx - 2} ${CY + 1} c-6 12 -10 26 -16 40" fill="none" stroke="url(#${id}-torcao)" stroke-width="${r * 2}" stroke-linecap="round"/>
       <path class="cl-ponta" d="M${cx + 2} ${CY + 1} c8 22 6 60 4 ${LH - CY + 24}" fill="none" stroke="url(#${id}-torcao)" stroke-width="${r * 2}" stroke-linecap="round"/>
       <circle cx="${cx}" cy="${CY}" r="${r * 1.6}" fill="${COR_CORDAO}"/>`
    : `<path d="M${cx} ${CY} c-10 -16 -44 -30 -66 -18 c-10 8 -2 20 66 18 z M${cx} ${CY} c12 -16 46 -26 66 -14 c8 10 -4 18 -66 14 z" fill="none" stroke="url(#${id}-torcao)" stroke-width="${r * 2}" stroke-linejoin="round"/>
       <path d="M${cx - 4} ${CY + 4} c-10 18 -18 34 -22 46 M${cx + 4} ${CY + 4} c12 20 26 36 32 44" fill="none" stroke="url(#${id}-torcao)" stroke-width="${r * 2}" stroke-linecap="round"/>`;
  const voltas = amarracao === 'fio'
    ? `<path class="cl-volta" d="M-4 ${CY - 5} H${LW + 4}" stroke="url(#${id}-torcao)" stroke-width="${r * 2}"/>
       <path class="cl-volta" d="M-4 ${CY + 1} L${LW + 4} ${CY + 9}" stroke="url(#${id}-torcao)" stroke-width="${r * 2}"/>`
    : `<path class="cl-volta" d="M-5 ${CY} H${LW + 5}" stroke="url(#${id}-torcao)" stroke-width="${r * 2}"/>
       <path class="cl-volta" d="M${cx} -5 V${LH + 5}" stroke="url(#${id}-torcao)" stroke-width="${r * 2}"/>`;
  const sombraVoltas = amarracao === 'fio'
    ? `<path d="M0 ${CY - 5} H${LW} M0 ${CY + 1} L${LW} ${CY + 9}" stroke="#2a1b22" stroke-width="${r * 3}" opacity="0.08" transform="translate(2 4)"/>`
    : `<path d="M0 ${CY} H${LW} M${cx} 0 V${LH}" stroke="#2a1b22" stroke-width="${r * 3}" opacity="0.08" transform="translate(2 4)"/>`;
  const amarra = `
    <svg class="cl-amarra" viewBox="0 0 ${LW} ${LH}" aria-hidden="true">
      <defs>${torcao}</defs>
      <g class="cl-voltas">${sombraVoltas}${voltas}</g>
      <g class="cl-laco">${laco}</g>
    </svg>`;

  let selo = '';
  if (lacre) {
    const blob = 'M0-33C10-34 21-29 27-21 34-15 37-5 34 5 37 14 31 24 22 29 13 35 2 34-7 33-19 33-29 25-32 14-36 4-35-8-29-17-23-27-12-33 0-33Z';
    const marca = MARCAS_LEVE[lacre] || MARCAS_LEVE.coracao;
    const metade = (lado) => `
      <g class="cl-metade" clip-path="url(#${id}-corte-${lado})">
        <path d="${blob}" fill="url(#${id}-cera)"/>
        <circle r="21" fill="none" stroke="#6e0820" stroke-width="2.4" opacity="0.55"/>
        <circle r="21" fill="none" stroke="#e0526f" stroke-width="1" opacity="0.5" transform="translate(-0.8 -1)"/>
        <g transform="scale(1.25)">
          <path d="${marca}" fill="#7a0a24" opacity="0.6" transform="translate(0.6 0.9)"/>
          <path d="${marca}" fill="#c11a42"/>
          <path d="${marca}" fill="none" stroke="#f07a92" stroke-width="0.7" opacity="0.7" transform="translate(-0.4 -0.6)"/>
        </g>
        <ellipse cx="-12" cy="-16" rx="9" ry="4.5" fill="#ffffff" opacity="0.22" transform="rotate(-32 -12 -16)"/>
      </g>`;
    selo = `
      <svg class="cl-lacre" viewBox="-40 -40 80 80" aria-hidden="true">
        <defs>
          <radialGradient id="${id}-cera" cx="0.38" cy="0.32" r="0.75">
            <stop offset="0" stop-color="#c8183f"/>
            <stop offset="0.6" stop-color="#9c0d2b"/>
            <stop offset="1" stop-color="#6d0820"/>
          </radialGradient>
          <clipPath id="${id}-corte-a"><path d="M-40-40H3L-3-20 5-8-4 4 4 17-2 40H-40Z"/></clipPath>
          <clipPath id="${id}-corte-b"><path d="M40-40H3L-3-20 5-8-4 4 4 17-2 40H40Z"/></clipPath>
        </defs>
        <path class="cl-sombra-lacre" d="${blob}" fill="#2a1b22" opacity="0.18" transform="translate(2 4) scale(1.03)"/>
        ${metade('a')}${metade('b')}
      </svg>`;
  }
  return { forro, frente, aba: abaSvg, amarra, selo };
}

let contadorLeve = 0;

function criarEnvelopeLeve(mundo, { lacre = 'coracao', amarracao = 'cordao', chegada = 2 }) {
  const gsap = window.gsap;
  const amb = mundo.amb;
  const reduzido = amb.reduzido;
  const recipiente = mundo.recipienteLeve;
  garantirEstiloLeve();

  const id = `cl${++contadorLeve}`;
  const d = desenhoLeve(lacre, amarracao, id);
  const forro = svg(d.forro);
  const frente = svg(d.frente);
  const aba = svg(d.aba);
  const amarra = svg(d.amarra);
  const selo = lacre ? svg(d.selo) : null;
  const papel = el('div', 'cl-papel');
  papel.style.visibility = 'hidden';
  const sombra = el('div', 'cl-sombra');
  // ordem de cima para baixo muda quando a aba vira (ver abrir)
  forro.style.zIndex = '0';
  papel.style.zIndex = '1';
  frente.style.zIndex = '2';
  aba.style.zIndex = '3';
  amarra.style.zIndex = '4';
  if (selo) selo.style.zIndex = '5';
  const corpo = el('div', 'cl-corpo', [forro, papel, frente, aba, amarra, ...(selo ? [selo] : [])]);
  const carta = el('div', 'cl', [sombra, corpo]);
  recipiente.append(carta);

  const tweens = new Set();
  const guardar = (a) => { tweens.add(a); a.eventCallback('onComplete', () => tweens.delete(a)); return a; };
  const mola = { x: 0, y: 0, vx: 0, vy: 0 };
  const pose = { flutua: 1, segue: 1, aperto: 0, y: 0 };
  let modo = 'espera';
  let descartado = false;

  const entrar = (duracao, atraso = 0) => {
    if (!gsap) return Promise.resolve();
    if (reduzido) return comoPromise(guardar(gsap.fromTo(carta, { autoAlpha: 0 }, { autoAlpha: 1, duration: Math.min(1.2, duracao), delay: atraso, ease: 'none' })));
    return comoPromise(guardar(gsap.fromTo(carta,
      { autoAlpha: 0, scale: 0.42, yPercent: -18, rotation: -5 },
      { autoAlpha: 1, scale: 1, yPercent: 0, rotation: 0, duration: Math.max(0.8, duracao), delay: atraso, ease: curvas.branco.entrar, immediateRender: true })));
  };
  if (typeof chegada === 'number' && chegada > 0) entrar(chegada);
  else if (gsap) gsap.set(carta, { autoAlpha: 0 });

  const env = {
    grupo: objetoLeve(),
    papel,
    lacre,
    amarracao,
    aberto: false,
    aoMarco: null,

    atualizar(dt, tempo) {
      if (descartado) return;
      const calmo = reduzido ? 0.3 : 1;
      const k = 30; const c = 6;
      const h = Math.min(dt, 1 / 30);
      const ax = -mundo.ponteiro.y * 9 * calmo * pose.segue;
      const ay = mundo.ponteiro.x * 11 * calmo * pose.segue;
      mola.vx += (k * (ax - mola.x) - c * mola.vx) * h;
      mola.vy += (k * (ay - mola.y) - c * mola.vy) * h;
      mola.x += mola.vx * h;
      mola.y += mola.vy * h;
      const fl = pose.flutua * calmo;
      const ty = Math.sin(tempo * 0.9) * 5 * fl + pose.y + pose.aperto * 2;
      const rz = Math.sin(tempo * 0.6 + 1.3) * 1.1 * fl;
      const ry = mola.y + Math.sin(tempo * 0.37) * 4 * fl;
      const s = 1 - pose.aperto * 0.015;
      corpo.style.transform = `translate3d(0, ${ty.toFixed(2)}px, 0) rotateX(${mola.x.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotate(${rz.toFixed(2)}deg) scale(${s.toFixed(4)})`;
    },

    acertou(xNdc, yNdc) {
      if (descartado) return false;
      const r = carta.getBoundingClientRect();
      const x = (xNdc * 0.5 + 0.5) * innerWidth;
      const y = (-yNdc * 0.5 + 0.5) * innerHeight;
      const folga = 30;
      return x >= r.left - folga && x <= r.right + folga && y >= r.top - folga && y <= r.bottom + folga;
    },

    caixaTela() {
      const r = carta.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    },

    get ancoraFio() {
      const alvo = amarra.querySelector('.cl-ponta');
      const r = (alvo || carta).getBoundingClientRect();
      const v = vetorLeve(0, 0, 0);
      v.px = r.left + r.width / 2;
      v.py = r.bottom;
      return v;
    },

    pressionar(apertado) {
      if (modo !== 'espera' || !gsap) return;
      guardar(gsap.to(pose, { aperto: apertado ? 1 : 0, duration: apertado ? 0.12 : 0.45, ease: apertado ? curvas.ui.resposta : curvas.branco.entrar, overwrite: 'auto' }));
    },

    chegar({ duracao = 2.4, atraso = 0 } = {}) {
      return entrar(duracao, atraso);
    },

    abrir() {
      if (env.aberto) return Promise.resolve({ papel });
      env.aberto = true;
      modo = 'abrindo';
      const avisar = (nome) => { try { env.aoMarco?.(nome); } catch (erro) { console.error(erro); } };
      const tl = guardar(gsap.timeline());
      const r = carta.getBoundingClientRect();
      tl.to(pose, { aperto: 1, duration: 0.12, ease: curvas.ui.resposta }, 0)
        .to(pose, { aperto: 0, duration: 0.45, ease: curvas.branco.entrar }, 0.12)
        .to(pose, { flutua: 0, segue: 0, duration: 1, ease: 'power2.out' }, 0)
        .to(mola, { x: 0, y: 0, vx: 0, vy: 0, duration: 0.8, ease: 'power2.out' }, 0.3);

      const metades = selo ? selo.querySelectorAll('.cl-metade') : [];
      tl.add(() => {
        avisar('lacre');
        mundo.petalas.rajada({ px: r.left + r.width / 2, py: r.top + r.height * 0.6 }, 14);
      }, 0.16);
      if (metades.length === 2) {
        if (reduzido) {
          tl.to(selo, { autoAlpha: 0, duration: 0.5, ease: 'none' }, 0.2);
        } else {
          tl.to(selo.querySelector('.cl-sombra-lacre'), { autoAlpha: 0, duration: 0.18, ease: 'none' }, 0.28)
            .to(metades[0], { x: -3, rotation: -6, svgOrigin: '0 10', duration: 0.12, ease: curvas.ui.resposta }, 0.14)
            .to(metades[1], { x: 3, rotation: 6, svgOrigin: '0 10', duration: 0.12, ease: curvas.ui.resposta }, 0.14)
            .to(metades[0], { x: -60, y: 260, rotation: -160, duration: 1.2, ease: 'power2.in' }, 0.3)
            .to(metades[1], { x: 70, y: 280, rotation: 190, duration: 1.25, ease: 'power2.in' }, 0.3)
            .to(selo, { autoAlpha: 0, duration: 0.3, ease: 'none' }, 1.2);
        }
      }
      const laco = amarra.querySelector('.cl-laco');
      if (reduzido) {
        tl.to(amarra, { autoAlpha: 0, duration: 0.5, ease: 'none' }, 0.3);
      } else {
        tl.to(laco, { scaleX: 0.3, scaleY: 0.6, svgOrigin: `${LW / 2} ${CY}`, autoAlpha: 0.0, duration: 0.4, ease: 'power2.in' }, 0.4)
          .to(amarra, { scaleX: 1.04, scaleY: 1.06, duration: 0.35, ease: 'power2.out' }, 0.6)
          .to(amarra.querySelector('.cl-voltas > path'), { autoAlpha: 0, duration: 0.3, ease: 'none' }, 0.7);
        // as voltas escorregam cada uma para um lado, com um pequeno atraso entre elas
        amarra.querySelectorAll('.cl-volta').forEach((volta, i) => {
          const lado = i % 2 ? 1 : -1;
          tl.to(volta, { x: lado * 14, y: LH * (0.75 + i * 0.1), rotation: lado * -9, svgOrigin: `${LW / 2} ${CY}`, duration: 0.85, ease: 'power2.in' }, 0.9 + i * 0.1);
        });
        tl.to(amarra, { autoAlpha: 0, duration: 0.3, ease: 'none' }, 1.5);
      }
      const sombraAba = frente.querySelector('.cl-sombra-aba');
      const fora = aba.querySelector('.cl-aba-fora');
      const dentro = aba.querySelector('.cl-aba-dentro');
      const giro = { a: 0 };
      tl.to(sombraAba, { autoAlpha: 0, duration: 0.3, ease: 'none' }, 0.95)
        .to(giro, {
          a: 180,
          duration: reduzido ? 0.9 : 1.2,
          ease: 'power2.inOut',
          onUpdate: () => {
            const virada = giro.a > 90;
            aba.style.transform = `rotateX(${(-giro.a).toFixed(2)}deg)`;
            fora.setAttribute('visibility', virada ? 'hidden' : 'visible');
            dentro.setAttribute('visibility', virada ? 'visible' : 'hidden');
            aba.style.zIndex = virada ? '0' : '3';
          },
        }, 0.95);
      tl.add(() => { papel.style.visibility = 'visible'; avisar('papel'); }, 1.65)
        .fromTo(papel, { yPercent: 0 }, { yPercent: -104, duration: 1.3, ease: 'power3.inOut' }, 1.65)
        .to(papel, { zIndex: 6, duration: 0.01 }, 2.9)
        .to(pose, { y: 26, duration: 1.4, ease: curvas.branco.entrar }, 1.8);
      return comoPromise(tl).then(() => { modo = 'aberto'; return { papel }; });
    },

    entregarPapel(rect) {
      const alvo = typeof rect === 'function' ? rect() : rect;
      modo = 'entregando';
      // O papel sai da carta e vira um retângulo fixo que cresce até o DOMRect pedido.
      const de = papel.getBoundingClientRect();
      document.body.append(papel);
      papel.classList.add('cl-papel-solto');
      papel.style.zIndex = '';
      gsap.set(papel, { clearProps: 'transform' });
      gsap.set(papel, { left: de.left, top: de.top, width: de.width, height: de.height, autoAlpha: 1 });
      const tl = guardar(gsap.timeline());
      if (reduzido) {
        gsap.set(papel, { left: alvo.left, top: alvo.top, width: alvo.width, height: alvo.height, autoAlpha: 0 });
        papel.classList.add('cl-sem-vinco');
        tl.to(papel, { autoAlpha: 1, duration: 0.6, ease: 'none' }, 0)
          .to(carta, { autoAlpha: 0, duration: 0.6, ease: 'none' }, 0);
        return comoPromise(tl);
      }
      tl.add(() => papel.classList.add('cl-sem-vinco'), 0.5)
        .to(papel, { left: alvo.left, top: alvo.top, width: alvo.width, height: alvo.height, duration: 1.5, ease: curvas.branco.camera }, 0)
        .to(carta, { autoAlpha: 0, scale: 0.86, yPercent: 8, duration: 1.1, ease: curvas.branco.sair }, 0.05);
      return comoPromise(tl);
    },

    irEmbora() {
      modo = 'indo';
      return comoPromise(guardar(gsap.to(carta, reduzido
        ? { autoAlpha: 0, duration: 0.9, ease: 'none' }
        : { autoAlpha: 0, scale: 0.5, yPercent: -16, rotation: 4, duration: 1.6, ease: curvas.branco.sair })));
    },

    dispose() {
      if (descartado) return;
      descartado = true;
      for (const a of tweens) a.kill();
      tweens.clear();
      carta.remove();
      papel.remove();
    },
  };

  // `papel.visible = false` funciona nos dois modos.
  Object.defineProperty(papel, 'visible', {
    configurable: true,
    get() { return papel.style.visibility !== 'hidden'; },
    set(v) { papel.style.visibility = v ? 'visible' : 'hidden'; },
  });

  return env;
}
