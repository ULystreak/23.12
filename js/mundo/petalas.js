/* ============================================================================
   PÉTALAS: a chuva de rosa do mundo 3D, com profundidade de campo
   ============================================================================
   Três conjuntos instanciados, com o mesmo par de shaders (a variante entra
   por #define):
     CHUVA  cai em volta da câmera. Posição, balanço e tombo saem do tempo,
            dentro do vertex shader; a CPU só manda uniforms.
     CHAO   as pétalas já caídas, deitadas, com uma sombra de contato mínima.
            São elas que dão o horizonte.
     SOLTA  poucas, simuladas na CPU: as rajadas (o dedo, o lacre) e as cinco
            protagonistas que cruzam a lente na abertura.
   O fragment desenha cada pétala por distância com sinal (SDF) e espalha a luz
   pelo círculo de confusão, que só depende da distância ao plano de foco: perto
   do foco, nítida e com nervura; longe dele, uma mancha macia de luz.

   API: definirDensidade, luzDaHora, definirFoco, definirAbertura, definirTempo,
   protegerRetangulo, comecar, protagonistas, preparar, rajada, magia,
   atualizar(dt) e dispose. Sem WebGL este arquivo não roda: js/mundo/leve.js
   dá a mesma API (sem luzDaHora, definirAbertura, definirTempo, magia nem
   preparar; quem chama usa ?.).
   ========================================================================== */

import { clamp, amortecer, semente } from '../nucleo/util.js';

const QUANTIDADE = {
  alto: { chuva: 700, chao: 300 },
  medio: { chuva: 420, chao: 180 },
  baixo: { chuva: 220, chao: 90 },
};
// Em tela deitada a caixa de ar é mais larga: até 1,7× mais pétalas para a
// mesma densidade. As malhas já nascem com o máximo (1190 e 510).
const FOLGA_TELA_LARGA = 1.7;
const MAX_CHUVA = Math.ceil(QUANTIDADE.alto.chuva * FOLGA_TELA_LARGA);
const MAX_CHAO = Math.ceil(QUANTIDADE.alto.chao * FOLGA_TELA_LARGA);
const ESTOQUE_RAJADA = 96;
const PROTAGONISTAS = 5;
const TOTAL_SOLTAS = ESTOQUE_RAJADA + PROTAGONISTAS;

const FOCO_PADRAO = 3;
const ALTURA_CAIXA = 5.6;
const FUNDO_CAIXA = 9;
const LARGURA_MINIMA = 5;
// A caixa da chuva fica à frente dos olhos e segue o rig (não o balanço do passo).
const CHUVA_Y = 2.7;
const CHUVA_RECUO = 3.96;
const CHAO_RECUO = 4.6;
// O chão só junta pétalas depois que elas tiveram tempo de cair, e devagar no primeiro minuto.
const CHAO_ESPERA = 3.6;
const CHAO_LENTO_ATE = 60;
// "desde" enorme = as pétalas já estavam no ar (ninguém chamou comecar()).
const DESDE_NO_AR = 1e5;
const DESDE_TETO = 1e4;

// Nestas etapas a frase, a carta ou a folha ocupam o meio da tela: as pétalas
// da frente passam, mas nunca cobrem o miolo (MIOLO, em NDC).
const ETAPAS_FOCO = new Set(['carta-espera', 'carta-abrindo', 'mao-espera', 'desdobrando', 'escrevendo', 'fim']);
const MIOLO = [-0.8, -0.62, 0.8, 0.7];

// As primeiras pétalas da abertura descem até 1,1 m a mais, com constante de tempo de 2,2 s.
const SOPRO = { velocidade: 0.5, calma: 2.2 };

// As protagonistas: de e ate em NDC, prof em metros da lente, dura e atraso em segundos.
const ROTEIROS = [
  { de: [-1, 0.3], ate: [1, -0.42], prof: 0.44, dura: 6.4, atraso: 0 },
  { de: [0.2, 1], ate: [1, 0.1], prof: 0.58, dura: 5.2, atraso: 1.9 },
  { de: [-1, -0.2], ate: [0.4, -1], prof: 0.5, dura: 5.8, atraso: 3.6 },
  { de: [-1, 0.78], ate: [1, 0.12], prof: 0.76, dura: 6.6, atraso: 5.4 },
  { de: [-0.5, 1], ate: [1, -0.66], prof: 0.47, dura: 6.2, atraso: 7.5 },
];

/* ---- shaders ------------------------------------------------------------------ */

// aR1 e aR2 são lidos por componente (x, y, z, w): a ordem do sorteio em
// semear() é parte do visual.
const VERTICE = /* glsl */ `
#define TAU 6.2831853

uniform float uFoco;
uniform vec2 uAbertura;
uniform vec2 uNevoa;
uniform vec2 uPerto;
uniform vec3 uLuzDir;
uniform float uConcha;
uniform vec4 uProtege;
uniform float uProtegeK;
uniform vec4 uMagia;

varying vec2 vP;
varying vec2 vQ;
varying vec4 vDados;
varying vec3 vLuz;

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }

// Fora do clip e com os varyings zerados: o triângulo não chega ao fragment.
void sumir() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vP = vec2(0.0); vQ = vec2(0.0); vDados = vec4(0.0); vLuz = vec3(0.0);
}

void montar(vec3 centro, mat3 R, float tamanho, float rolagem, float extra, float alfa, float tom, float forma) {
  vec4 mvC = viewMatrix * vec4(centro, 1.0);
  float prof = -mvC.z;
  #ifndef CHAO
  // Com a folha perto (foco < 2 m), a pétala da frente encolhe até ~5% da altura.
  if (uProtegeK > 0.001 && extra <= 1.2) {
    float teto = 0.1 * prof / projectionMatrix[1][1];
    float k = uProtegeK * smoothstep(2.0, 1.2, uFoco) * (1.0 - smoothstep(0.85, 1.0, prof / uFoco));
    tamanho = mix(tamanho, min(tamanho, teto), k);
  }
  #endif
  float unidade = tamanho / 1.62;

  // Círculo de confusão: só depende da distância ao plano de foco.
  float abertura = prof < uFoco ? uAbertura.x : uAbertura.y;
  float sLuz = abertura * abs(prof - uFoco) / uFoco * extra / unidade;
  float s = min(sLuz, extra > 1.2 ? 2.2 : 0.62);

  float nev = smoothstep(uNevoa.x, uNevoa.y, prof);
  float a = alfa * smoothstep(uPerto.x, uPerto.y, prof) * (1.0 - nev);
  a *= max(1.0 / (1.0 + 1.5 * sLuz * sLuz), 0.15);

  #ifndef CHAO
  // A pétala borrada que passa à frente da frase continua passando, mas não a cobre.
  if (uProtegeK > 0.001 && extra <= 1.2 && prof < uFoco) {
    vec4 clipC = projectionMatrix * mvC;
    vec2 ndc = clipC.xy / max(clipC.w, 1e-4);
    vec2 raio = vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * unidade * (0.86 + s) / max(prof, 0.05);
    vec2 fora = max(max(uProtege.xy - ndc, ndc - uProtege.zw), 0.0) / max(raio, vec2(1e-3));
    float dentro = 1.0 - smoothstep(0.35, 1.0, length(fora));
    float borrada = smoothstep(0.45, 0.85, sLuz);
    a *= 1.0 - 0.92 * uProtegeK * borrada * dentro;
    float rente = (1.0 - smoothstep(0.4, 0.6, prof / uFoco)) * smoothstep(2.0, 1.2, uFoco);
    a *= 1.0 - uProtegeK * rente;
  }
  #endif

  if (a < 0.004) { sumir(); return; }

  #ifdef CHAO
  float margem = max(s, 0.42);
  #else
  float margem = s;
  #endif
  float e = max(1.0, (0.86 + margem) / 1.12);
  vec2 q = position.xy * 2.0;
  vec2 pp = q * 1.12 * e;

  // A concha: a pétala é curva, com a ponta que se abre.
  vec2 c = clamp(pp, vec2(-0.8), vec2(0.8));
  float k = uConcha * (0.6 + 0.8 * fract(forma * 7.3));
  float tp = clamp((c.y - 0.15) / 0.65, 0.0, 1.0);
  float ponta = tp * tp * (3.0 - 2.0 * tp);
  float z = k * (0.62 * c.x * c.x + 0.3 * (c.y + 0.1) * (c.y + 0.1) - 0.34 * ponta * ponta);
  vec3 local = vec3(pp, z) * unidade;
  vec3 nLocal = normalize(vec3(
    -k * 1.24 * c.x,
    -k * (0.6 * (c.y + 0.1) - 0.68 * ponta * 6.0 * tp * (1.0 - tp) / 0.65),
    1.0));

  // Muito desfocada, a pétala se vira para a câmera e vira mancha: a borda reta
  // do quadrado nunca aparece rente à lente.
  #ifdef CHAO
  float f = 0.0;
  #else
  float f = smoothstep(0.05, 0.42, s);
  #endif
  mat3 V = mat3(viewMatrix);
  float cr = cos(rolagem), sr = sin(rolagem);
  vec3 dMundo = V * (R * local);
  vec3 dFrente = vec3(cr * local.x - sr * local.y, sr * local.x + cr * local.y, local.z);
  gl_Position = projectionMatrix * vec4(mvC.xyz + mix(dMundo, dFrente, f), 1.0);

  vec3 lV = V * uLuzDir;
  vec3 nMundo = V * (R * nLocal);
  vec3 nFrente = vec3(cr * nLocal.x - sr * nLocal.y, sr * nLocal.x + cr * nLocal.y, nLocal.z);
  float nl = mix(dot(nMundo, lV), dot(nFrente, lV), f);
  float nv = mix(abs(dot(nMundo, normalize(-mvC.xyz))), 1.0, f);

  vP = pp;
  vQ = q;
  vDados = vec4(s, a, tom, forma);
  vLuz = vec3(nl, nev, nv);
}

#if defined(CHUVA) || defined(CHAO)
attribute vec3 aSemente;
attribute vec4 aR1;
attribute vec4 aR2;

uniform vec3 uCaixa;
uniform vec3 uCentro;
uniform float uDeriva;
uniform float uDensidade;
uniform vec2 uTamanho;
uniform vec3 uRalo;

// Perto, todas; longe, só uma fração: sem isso o fundo vira confete.
float presenca(vec3 p) {
  float prof = -(viewMatrix * vec4(p, 1.0)).z;
  float limite = uDensidade * 1.06 * mix(1.0, uRalo.z, smoothstep(uRalo.x, uRalo.y, prof));
  return smoothstep(aR2.y, aR2.y + 0.06, limite);
}
#endif

#ifdef CHUVA
uniform float uTempo;
uniform vec2 uVento;
uniform float uDesde;
uniform float uSopro;
uniform float uTanFov;

void main() {
  float t = uTempo;
  // Acima de 0,74 tomba sem parar; abaixo de 0,62 balança plana; entre os dois, mistura.
  float gira = smoothstep(0.62, 0.74, aR2.z);
  float vel = mix(0.35, 0.6, fract(aR2.w * 13.7 + aR2.z * 5.1));

  float fb = t * (0.55 + 0.7 * aR1.x) + aR1.z * TAU;
  float bal = sin(fb);
  float amp = mix(0.24, 0.09, gira);

  vec3 p = aSemente * uCaixa;
  p.y -= t * vel + uSopro;
  p.x += t * uVento.x * (0.75 + 0.5 * aR1.z) + bal * amp + sin(fb * 0.43 + aR1.x * 9.0) * 0.16;
  p.z += t * uVento.y * (0.75 + 0.5 * aR1.x) + cos(fb * 0.8 + 1.3) * amp * 0.6;
  p.y += (1.0 - gira) * (1.0 - bal * bal) * 0.035;

  // A caixa de ar segue a câmera: quem sai por um lado renasce pelo outro, e a
  // caminhada atravessa as pétalas sem criar nem apagar nenhuma.
  p.z += uDeriva;
  p = mod(p - uCentro + 0.5 * uCaixa, uCaixa) - 0.5 * uCaixa + uCentro;

  if (uMagia.w > 0.001) {
    vec3 dm = p - uMagia.xyz;
    float km = uMagia.w * exp(-dot(dm, dm) / 0.4);
    p.xz += vec2(-dm.z, dm.x) * km * 1.1 + normalize(dm.xz + 1e-4) * km * 0.08;
    p.y += km * 0.09;
  }

  float a = presenca(p);
  a *= smoothstep(0.0, 0.7, uCaixa.y * 0.5 - abs(p.y - uCentro.y));
  a *= smoothstep(0.0, 0.5, uCaixa.x * 0.5 - abs(p.x - uCentro.x));
  a *= smoothstep(0.03, 0.3, p.y);

  // Abertura: só aparece quem já entrou pelo alto do quadro; as que passam
  // rente à lente esperam até 1,7 s a mais.
  float frente = max(cameraPosition.z - p.z, 0.3);
  float topo = min(uCentro.y + uCaixa.y * 0.5, cameraPosition.y + frente * uTanFov * 1.08 + 0.15);
  float desde = uDesde - 1.7 * (1.0 - smoothstep(0.6, 1.7, frente));
  a *= smoothstep(0.0, 0.45, vel * desde * 1.1 + uSopro - (topo - p.y)) * step(0.0, desde);

  if (a < 0.004) { sumir(); return; }

  float guinada = aR1.x * TAU + t * (0.2 + 0.5 * aR2.w) * sign(aR1.y);
  float incl = (aR1.z - 0.5) * 2.6 + bal * mix(0.6, 0.2, gira) + gira * t * aR1.y;
  float rol = aR2.x * TAU + t * 0.12 * aR1.y;
  mat3 R = rotY(guinada) * rotX(incl - 1.5708) * rotZ(rol);

  float tamanho = mix(uTamanho.x, uTamanho.y, aR1.w * aR1.w);
  montar(p, R, tamanho, rol + guinada * 0.5, 1.0, a, aR2.x, aR2.w);
}
#endif

#ifdef CHAO
void main() {
  vec3 p = vec3(aSemente.x * uCaixa.x, 0.0, aSemente.z * uCaixa.z + uDeriva);
  p.xz = mod(p.xz - uCentro.xz + 0.5 * uCaixa.xz, uCaixa.xz) - 0.5 * uCaixa.xz + uCentro.xz;
  p.y = 0.012;

  float a = presenca(p);
  vec2 beira = uCaixa.xz * 0.5 - abs(p.xz - uCentro.xz);
  a *= smoothstep(0.0, 0.7, beira.x) * smoothstep(0.0, 0.7, beira.y);
  if (a < 0.004) { sumir(); return; }

  // A magia rente ao chão ergue um pouco as pétalas caídas.
  float ergue = 0.0;
  if (uMagia.w > 0.001) {
    vec2 dm = p.xz - uMagia.xz;
    ergue = uMagia.w * exp(-dot(dm, dm) / 0.36) * (1.0 - smoothstep(0.15, 0.6, uMagia.y));
    p.y += ergue * (0.04 + 0.06 * aR1.w);
  }

  float virada = step(0.5, aR2.z) * 3.14159265;
  mat3 R = rotY(aR1.x * TAU) * rotX(-1.5708 + (aR1.z - 0.5) * 0.3 + virada + ergue * (aR1.y > 0.0 ? 0.9 : -0.9)) * rotZ(aR1.y);

  float tamanho = mix(uTamanho.x, uTamanho.y, aR1.w * aR1.w);
  montar(p, R, tamanho, 0.0, 1.0, a, aR2.x, aR2.w);
}
#endif

#ifdef SOLTA
attribute vec3 aPos;
attribute vec4 aGiro;
attribute vec4 aSolta;

void main() {
  mat3 R = rotY(aGiro.x) * rotX(aGiro.y - 1.5708) * rotZ(aGiro.z);
  montar(aPos, R, aSolta.x, aGiro.z, aSolta.w, aSolta.y, aSolta.z, aGiro.w);
}
#endif
`;

const FRAGMENTO = /* glsl */ `
uniform vec3 uCorBaseA;
uniform vec3 uCorBordaA;
uniform vec3 uCorBaseB;
uniform vec3 uCorBordaB;
uniform vec3 uCorLuz;
uniform vec3 uCorSombra;
uniform vec3 uNevoaCor;
uniform vec3 uLuzHora;

varying vec2 vP;
varying vec2 vQ;
varying vec4 vDados;
varying vec3 vLuz;

float capsula(vec2 p, float r1, float r2, float h) {
  p.x = abs(p.x);
  float b = (r1 - r2) / h;
  float a = sqrt(1.0 - b * b);
  float k = dot(p, vec2(-b, a));
  if (k < 0.0) return length(p) - r1;
  if (k > a * h) return length(p - vec2(0.0, h)) - r2;
  return dot(p, vec2(a, b)) - r1;
}

// A pétala de rosa: uma cápsula que se alarga para a ponta, um pouco torta,
// com o entalhe do coração na ponta quando está nítida.
float petala(vec2 p, float forma, float nitidez) {
  float lado = fract(forma * 11.3) - 0.5;
  p.x += lado * 0.3 * (p.y * p.y - 0.18);
  p.x *= mix(0.82, 0.98, fract(forma * 3.7));
  float r2 = mix(0.6, 0.54, fract(forma * 5.3));
  float d = capsula(p - vec2(0.0, -0.43), 0.25, r2, 0.55);

  float fundo = 0.05 * smoothstep(0.25, 0.9, fract(forma * 7.9)) * nitidez;
  float dn = length(p - vec2(lado * 0.3 + sign(lado) * 0.09, 0.12 + r2 + 0.11 - fundo)) - 0.11;
  float k = 0.07 * smoothstep(0.0, 0.02, fundo) + 0.0001;
  float h = clamp(0.5 - 0.5 * (d + dn) / k, 0.0, 1.0);
  return mix(d, -dn, h) + k * h * (1.0 - h);
}

float ruido(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  float s = vDados.x;
  float forma = vDados.w;
  float nitidez = 1.0 - smoothstep(0.03, 0.3, s);

  float d = petala(vP, forma, nitidez);
  float ang = atan(vP.x, vP.y + 0.3);
  d += (0.016 * sin(ang * 5.0 + forma * 40.0) + 0.007 * sin(ang * 11.0 + forma * 17.0))
    * smoothstep(-0.25, 0.45, vP.y) * nitidez;

  // A borda espalha conforme o desfoque (s); nítida, só o antisserrilhado.
  float aa = fwidth(d) * 0.75 + 0.0001;
  float cobertura = 1.0 - smoothstep(-max(min(s, 0.16), aa), max(s, aa), d);
  float janela = 1.0 - smoothstep(0.84, 1.0, max(abs(vQ.x), abs(vQ.y)));
  float alfa = cobertura * janela * vDados.y;

  float liso = smoothstep(0.18, 0.9, s);
  float g = smoothstep(0.0, 1.0, length((vP - vec2(0.0, -0.68)) * vec2(0.85, 1.0)) / 1.3);
  g = mix(g, 0.74, liso);
  vec3 cor = mix(mix(uCorBaseA, uCorBaseB, vDados.z), mix(uCorBordaA, uCorBordaB, vDados.z), g);

  float nervura = exp(-vP.x * vP.x / 0.0016) * smoothstep(0.5, -0.6, vP.y);
  float veios = 0.5 + 0.5 * sin(atan(vP.x, vP.y + 1.1) * 44.0);
  cor *= 1.0 - nitidez * (0.09 * nervura + 0.04 * veios * smoothstep(-0.6, 0.35, vP.y));

  cor = mix(cor, uCorLuz, smoothstep(-0.2, 0.0, d) * 0.22);

  float nl = vLuz.x * (gl_FrontFacing ? 1.0 : -1.0);
  cor *= mix(mix(0.66, 1.06, smoothstep(-1.0, 1.0, nl)), 0.98, liso);
  cor = mix(cor, uCorLuz, max(max(-nl, 0.0) * 0.4, liso * 0.28));
  float veludo = 1.0 - vLuz.z;
  cor = mix(cor, uCorLuz, veludo * veludo * 0.3);
  cor *= 0.9 + 0.2 * fract(forma * 9.1);

  cor = mix(cor, uNevoaCor, vLuz.y * 0.8);

  // Bokeh de fotografia só quando a névoa tem cor (a alameda e a hora a
  // pintam); no mundo branco puro a mancha fica só rosa.
  float foto = smoothstep(0.02, 0.4, length(vec3(1.0) - uNevoaCor));
  float bokeh = foto * smoothstep(0.28, 0.62, s);
  cor = mix(cor, mix(uCorLuz, vec3(1.0, 0.93, 0.95), 0.45), bokeh * 0.45);
  alfa *= 1.0 - 0.5 * bokeh;

  #ifdef CHAO
  float ds = petala(vP - vec2(0.05, -0.06), forma, 0.0);
  float sombra = (1.0 - smoothstep(-0.36, 0.36, ds)) * janela * 0.085 * min(vDados.y * 1.4, 1.0);
  float total = alfa + sombra * (1.0 - alfa);
  cor = mix(uCorSombra, cor, alfa / max(total, 0.0001));
  alfa = total;
  #endif

  // Um grão mínimo no alfa das manchas grandes desfaz o degrau do gradiente.
  alfa += (ruido(gl_FragCoord.xy) - 0.5) * 0.012 * step(0.2, s) * step(0.004, alfa);

  if (alfa < 0.003) discard;
  gl_FragColor = vec4(cor * uLuzHora, alfa);
  #include <colorspace_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;
}
`;

/* ---- criarPetalas ------------------------------------------------------------- */

export function criarPetalas(mundo, amb = mundo.amb) {
  const THREE = mundo.THREE;
  const { cena, camera, renderer } = mundo;
  const rig = mundo.rig.position;
  const reduzido = !!amb?.reduzido;
  // Mesma semente, mesmo céu de pétalas. A ordem dos sorteios (chuva, chão,
  // relógio, depois rajadas e protagonistas) decide quais pétalas ficam onde.
  const sorte = semente(231223);
  const entre = (a, b) => a + sorte() * (b - a);

  // Movimento reduzido: poucas, lentas, e nada grande rente à lente.
  const ritmo = reduzido ? 0.45 : 1;
  const tetoChuva = reduzido ? 0.34 : 1;
  const tetoChao = reduzido ? 0.6 : 1;

  /* ---- geometria base ---- */
  // Os segmentos dão a curva da concha; ficam os do nível do início.
  const base = amb?.nivel === 'baixo'
    ? new THREE.PlaneGeometry(1, 1, 4, 5)
    : new THREE.PlaneGeometry(1, 1, 6, 7);

  /* ---- uniforms ---- */
  // `comuns` é compartilhado por referência entre os três materiais: troque
  // `.value`, nunca o objeto. uNevoaCor é a própria cor da névoa da cena.
  const comuns = {
    uFoco: { value: FOCO_PADRAO },
    uAbertura: { value: new THREE.Vector2(0.04, 0.008) },
    uNevoa: { value: new THREE.Vector2(3.8, 9.2) },
    uPerto: { value: reduzido ? new THREE.Vector2(0.6, 1.1) : new THREE.Vector2(0.16, 0.38) },
    uLuzDir: { value: new THREE.Vector3(-0.3, 1, 0.45).normalize() },
    uConcha: { value: 0.55 },
    uProtege: { value: new THREE.Vector4(...MIOLO) },
    uProtegeK: { value: 0 },
    uMagia: { value: new THREE.Vector4(0, -10, 0, 0) },
    uLuzHora: { value: new THREE.Vector3(1, 1, 1) },
    uNevoaCor: { value: cena.fog?.color || new THREE.Color(0xffffff) },
    uCorBaseA: { value: new THREE.Color('#6d0a22') },
    uCorBordaA: { value: new THREE.Color('#b3123a') },
    uCorBaseB: { value: new THREE.Color('#7d0c28') },
    uCorBordaB: { value: new THREE.Color('#c9184a') },
    uCorLuz: { value: new THREE.Color('#e4486c') },
    uCorSombra: { value: new THREE.Color('#2a1b22') },
  };
  const uChuva = {
    uCaixa: { value: new THREE.Vector3(LARGURA_MINIMA, ALTURA_CAIXA, FUNDO_CAIXA) },
    uCentro: { value: new THREE.Vector3(rig.x, CHUVA_Y, rig.z - CHUVA_RECUO) },
    uDensidade: { value: 0 },
    uTamanho: { value: new THREE.Vector2(0.07, 0.15) },
    uRalo: { value: new THREE.Vector3(3, 7.5, 0.28) },
    uVento: { value: new THREE.Vector2(0.12, 0.02) },
    uDesde: { value: DESDE_NO_AR },
    uSopro: { value: 0 },
    uTanFov: { value: 0.55 },
    uDeriva: { value: mundo.deriva || 0 },
    uTempo: { value: 0 },
  };
  const uChao = {
    uCaixa: { value: new THREE.Vector3(LARGURA_MINIMA + 2, 1, 10) },
    uCentro: { value: new THREE.Vector3(rig.x, 0, rig.z - CHAO_RECUO) },
    uDensidade: { value: 0 },
    uTamanho: { value: new THREE.Vector2(0.07, 0.14) },
    uRalo: { value: new THREE.Vector3(3.5, 8, 0.32) },
    uDeriva: { value: mundo.deriva || 0 },
  };

  function geometriaInstanciada() {
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(base.index);
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    return g;
  }

  function semear(g, n) {
    const s = new Float32Array(n * 3);
    const r1 = new Float32Array(n * 4);
    const r2 = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      s[i * 3] = sorte();
      s[i * 3 + 1] = sorte();
      s[i * 3 + 2] = sorte();
      r1[i * 4] = sorte();
      r1[i * 4 + 1] = entre(1.2, 3.6) * (sorte() < 0.5 ? -1 : 1);
      r1[i * 4 + 2] = sorte();
      r1[i * 4 + 3] = sorte();
      r2[i * 4] = sorte();
      r2[i * 4 + 1] = sorte();
      r2[i * 4 + 2] = sorte();
      r2[i * 4 + 3] = sorte();
    }
    g.setAttribute('aSemente', new THREE.InstancedBufferAttribute(s, 3));
    g.setAttribute('aR1', new THREE.InstancedBufferAttribute(r1, 4));
    g.setAttribute('aR2', new THREE.InstancedBufferAttribute(r2, 4));
  }

  function material(variante, uniformes) {
    return new THREE.ShaderMaterial({
      vertexShader: VERTICE,
      fragmentShader: FRAGMENTO,
      defines: { [variante]: '' },
      uniforms: { ...comuns, ...uniformes },
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  const geoChuva = geometriaInstanciada();
  semear(geoChuva, MAX_CHUVA);
  const geoChao = geometriaInstanciada();
  semear(geoChao, MAX_CHAO);

  // As soltas: buffers que a CPU reescreve a cada quadro enquanto há alguma viva.
  const geoSoltas = geometriaInstanciada();
  const atributo = (n) => new THREE.InstancedBufferAttribute(new Float32Array(TOTAL_SOLTAS * n), n)
    .setUsage(THREE.DynamicDrawUsage);
  const aPos = atributo(3);
  const aGiro = atributo(4);
  const aSolta = atributo(4);
  geoSoltas.setAttribute('aPos', aPos);
  geoSoltas.setAttribute('aGiro', aGiro);
  geoSoltas.setAttribute('aSolta', aSolta);
  geoSoltas.instanceCount = TOTAL_SOLTAS;

  const matChuva = material('CHUVA', uChuva);
  const matChao = material('CHAO', uChao);
  const matSoltas = material('SOLTA', {});
  const malhaChao = new THREE.Mesh(geoChao, matChao);
  const malhaChuva = new THREE.Mesh(geoChuva, matChuva);
  const malhaSoltas = new THREE.Mesh(geoSoltas, matSoltas);
  malhaChao.renderOrder = 4;
  malhaChuva.renderOrder = 5;
  malhaSoltas.renderOrder = 6;
  malhaSoltas.visible = false;
  // A caixa de limites da geometria é o quadrado de 1 m na origem: com o
  // recorte do three, o chão sumiria assim que a origem saísse do quadro.
  // Quem decide o que aparece é o próprio shader (sumir()).
  for (const m of [malhaChao, malhaChuva, malhaSoltas]) m.frustumCulled = false;

  const grupo = new THREE.Group();
  grupo.name = 'petalas';
  grupo.add(malhaChao, malhaChuva, malhaSoltas);
  cena.add(grupo);

  /* ---- estado ---- */
  // uTempo é este relógio contínuo, não o tempo real: o tempo lento e a pausa dependem dele.
  let relogio = sorte() * 40;
  uChuva.uTempo.value = relogio;
  let tempoAgora = 1;
  let tempoAlvo = 1;
  let magiaAlvo = 0;
  let abertura = 1;
  let aberturaAlvo = 1;
  let densidadeAlvo = 0;
  let focoAlvo = FOCO_PADRAO;
  let desde = DESDE_NO_AR;
  let largura = LARGURA_MINIMA;
  let protegido = null;
  let vivas = 0;
  let preparo = null;
  let fora = false;
  const posCamera = new THREE.Vector3();
  const meia = { x: 0, y: 0 };

  const soltas = Array.from({ length: TOTAL_SOLTAS }, (_, i) => ({
    viva: false, idade: 0, vida: 1,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, queda: 0, fase: 0,
    guinada: 0, incl: 0, rol: 0, vGuinada: 0, vIncl: 0, vInclFinal: 0,
    tam: 0, tom: 0, forma: 0, extra: 1,
    // Só as protagonistas têm roteiro; o caminho é fixado quando elas entram.
    roteiro: null,
    fixado: false,
    partida: i >= ESTOQUE_RAJADA ? new THREE.Vector3() : null,
    chegada: i >= ESTOQUE_RAJADA ? new THREE.Vector3() : null,
  }));

  /* ---- caixa e quantidade ---- */

  function ajustarQuantidade() {
    const q = QUANTIDADE[amb?.nivel] || QUANTIDADE.medio;
    const folga = clamp(largura / LARGURA_MINIMA, 1, FOLGA_TELA_LARGA);
    geoChuva.instanceCount = Math.min(MAX_CHUVA, Math.round(q.chuva * folga));
    geoChao.instanceCount = Math.min(MAX_CHAO, Math.round(q.chao * folga));
  }

  // A caixa de ar cobre a largura do quadro no fundo dela (9 m), com 6% de sobra.
  function ajustarCaixa() {
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const larguraVista = 2 * tan * FUNDO_CAIXA * camera.aspect;
    largura = Math.max(LARGURA_MINIMA, larguraVista * 1.06);
    uChuva.uCaixa.value.x = largura;
    uChuva.uTanFov.value = tan;
    uChao.uCaixa.value.x = largura + 2;
    ajustarQuantidade();
  }

  ajustarCaixa();
  const pararTamanho = mundo.aoRedimensionar?.(ajustarCaixa);
  const pararNivel = mundo.aoMudarNivel?.(ajustarQuantidade);

  /* ---- soltas: rajadas e protagonistas ---- */

  function pegarSolta() {
    let escolhida = 0;
    let maisVelha = -Infinity;
    for (let i = 0; i < ESTOQUE_RAJADA; i++) {
      const s = soltas[i];
      if (!s.viva) return s;
      const k = s.idade / s.vida;
      if (k > maisVelha) {
        maisVelha = k;
        escolhida = i;
      }
    }
    return soltas[escolhida];
  }

  function meiaVista(prof) {
    meia.y = Math.tan((camera.fov * Math.PI) / 360) * prof;
    meia.x = meia.y * camera.aspect;
    return meia;
  }

  function escrever(i, s, alfa) {
    aPos.array[i * 3] = s.x;
    aPos.array[i * 3 + 1] = s.y;
    aPos.array[i * 3 + 2] = s.z;
    aGiro.array[i * 4] = s.guinada;
    aGiro.array[i * 4 + 1] = s.incl;
    aGiro.array[i * 4 + 2] = s.rol;
    aGiro.array[i * 4 + 3] = s.forma;
    aSolta.array[i * 4] = s.tam;
    aSolta.array[i * 4 + 1] = alfa;
    aSolta.array[i * 4 + 2] = s.tom;
    aSolta.array[i * 4 + 3] = s.extra;
  }

  function morrer(i, s) {
    s.viva = false;
    aSolta.array[i * 4 + 1] = 0;
  }

  // dt aqui é o passo do relógio (já com o tempo lento e o ritmo), não o dt cru.
  function atualizarSoltas(dt) {
    const assenta = 1 - Math.exp(-1.9 * dt);
    const converge = 1 - Math.exp(-1.1 * dt);
    const vento = uChuva.uVento.value;
    let n = 0;
    for (let i = 0; i < TOTAL_SOLTAS; i++) {
      const s = soltas[i];
      if (!s.viva) continue;
      s.idade += dt;
      let alfa;

      if (s.roteiro) {
        if (s.idade < 0) {
          // Ainda esperando a vez dela.
          n += 1;
          escrever(i, s, 0);
          continue;
        }
        const r = s.roteiro;
        if (!s.fixado) {
          const m = meiaVista(r.prof);
          const folga = s.tam * 2.4;
          s.partida.set(r.de[0] * (m.x + folga), r.de[1] * (m.y + folga), -r.prof).applyMatrix4(camera.matrixWorld);
          s.chegada.set(r.ate[0] * (m.x + folga), r.ate[1] * (m.y + folga), -r.prof).applyMatrix4(camera.matrixWorld);
          s.fixado = true;
        }
        const k = s.idade / s.vida;
        if (k >= 1) {
          morrer(i, s);
          continue;
        }
        s.x = s.partida.x + (s.chegada.x - s.partida.x) * k;
        s.y = s.partida.y + (s.chegada.y - s.partida.y) * k + Math.sin(k * 5 + s.fase) * 0.012;
        s.z = s.partida.z + (s.chegada.z - s.partida.z) * k;
        s.guinada += s.vGuinada * dt;
        s.incl += s.vIncl * dt;
        alfa = clamp(k / 0.14) * clamp((1 - k) / 0.14);
      } else {
        // Sai rodopiando no impulso, depois assenta no vento e cai balançando.
        const bal = Math.sin(s.idade * 1.3 + s.fase) * 0.18 * clamp(s.idade - 0.6);
        s.vx += (vento.x + bal - s.vx) * assenta;
        s.vy += (-s.queda - s.vy) * assenta;
        s.vz += (vento.y - s.vz) * assenta;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        s.vIncl += (s.vInclFinal - s.vIncl) * converge;
        s.guinada += s.vGuinada * dt;
        s.incl += s.vIncl * dt;
        if (s.idade >= s.vida || s.y < 0.03 || s.z > posCamera.z + 0.4) {
          morrer(i, s);
          continue;
        }
        alfa = clamp(s.idade / 0.12) * clamp((s.vida - s.idade) / 1.6) * clamp((s.y - 0.03) / 0.3);
      }

      n += 1;
      escrever(i, s, alfa);
    }
    vivas = n;
    aPos.needsUpdate = true;
    aGiro.needsUpdate = true;
    aSolta.needsUpdate = true;
  }

  /* ---- proteção da frase e da carta ---- */

  function atualizarProtecao(dt) {
    let r = protegido;
    if (typeof r === 'function') {
      try {
        r = r();
      } catch {
        r = null;
      }
    }
    const pedido = !!r && r.right > r.left && r.bottom > r.top;
    const foco = ETAPAS_FOCO.has(document.documentElement.dataset.etapa);
    if (pedido) {
      const L = mundo.tamanho?.largura || innerWidth;
      const A = mundo.tamanho?.altura || innerHeight;
      comuns.uProtege.value.set((r.left / L) * 2 - 1, 1 - (r.bottom / A) * 2, (r.right / L) * 2 - 1, 1 - (r.top / A) * 2);
    } else if (foco) {
      comuns.uProtege.value.set(...MIOLO);
    }
    const alvo = pedido || foco ? 1 : 0;
    comuns.uProtegeK.value = amortecer(comuns.uProtegeK.value, alvo, alvo ? 3 : 1.2, dt);
  }

  /* ---- o quadro ---- */

  // O segundo argumento (t) do laço do mundo chega e é ignorado: o relógio é o nosso.
  function atualizar(dt) {
    if (fora) return;
    tempoAgora = amortecer(tempoAgora, tempoAlvo, 1.6, dt);
    const magia = comuns.uMagia.value;
    magia.w = amortecer(magia.w, magiaAlvo, 3, dt);
    const passo = dt * ritmo * tempoAgora;
    relogio += passo;
    camera.getWorldPosition(posCamera);
    if (desde < DESDE_TETO) {
      desde += passo;
      uChuva.uSopro.value = SOPRO.velocidade * SOPRO.calma * (1 - Math.exp(-desde / SOPRO.calma));
    }

    const deriva = mundo.deriva || 0;
    uChuva.uTempo.value = relogio;
    uChuva.uDeriva.value = deriva;
    uChao.uDeriva.value = deriva;
    uChuva.uDesde.value = desde;
    // Se a névoa da cena for trocada por outra, a referência segue a nova.
    if (cena.fog && comuns.uNevoaCor.value !== cena.fog.color) comuns.uNevoaCor.value = cena.fog.color;

    uChuva.uDensidade.value = amortecer(uChuva.uDensidade.value, densidadeAlvo * tetoChuva, 0.9, dt);
    uChuva.uCentro.value.set(rig.x, CHUVA_Y, rig.z - CHUVA_RECUO);

    const alvoChao = desde < CHAO_ESPERA ? 0 : densidadeAlvo * tetoChao;
    uChao.uDensidade.value = amortecer(uChao.uDensidade.value, alvoChao, desde < CHAO_LENTO_ATE ? 0.32 : 0.9, dt);
    uChao.uCentro.value.set(rig.x, 0, rig.z - CHAO_RECUO);

    comuns.uFoco.value = amortecer(comuns.uFoco.value, focoAlvo, 2.2, dt);
    if (abertura !== aberturaAlvo) {
      abertura = Math.abs(aberturaAlvo - abertura) < 0.002 ? aberturaAlvo : amortecer(abertura, aberturaAlvo, 1.8, dt);
      // Só o lado da frente do foco abre; o de trás fica em 0,008.
      comuns.uAbertura.value.x = 0.04 * abertura;
    }

    atualizarProtecao(dt);

    if (vivas > 0) atualizarSoltas(passo);
    else if (malhaSoltas.visible) malhaSoltas.visible = false;
  }

  /* ---- API ---- */

  return {
    objeto: grupo,

    definirDensidade(k) {
      densidadeAlvo = clamp(Number(k) || 0);
    },

    // cor = [r, g, b] (e.petalas de js/mundo/hora.js); multiplica a cor de cada pétala.
    luzDaHora(cor) {
      if (!Array.isArray(cor)) return;
      const r = Number(cor[0]);
      const g = Number(cor[1]);
      const b = Number(cor[2]);
      if (Number.isFinite(r + g + b)) comuns.uLuzHora.value.set(r, g, b);
    },

    // Number.isFinite não converte: null, '' ou true são inválidos (Number(null)
    // daria 0 e definirTempo(null) congelaria a chuva em 0,05).
    definirFoco(metros) {
      focoAlvo = Number.isFinite(metros) && metros > 0 ? clamp(metros, 0.4, 30) : FOCO_PADRAO;
    },

    definirAbertura(k) {
      aberturaAlvo = Number.isFinite(k) ? clamp(k, 0.5, 4) : 1;
    },

    definirTempo(k) {
      tempoAlvo = Number.isFinite(k) ? clamp(k, 0.05, 1) : 1;
    },

    // r: {left, top, right, bottom} em px, uma função que devolve isso a cada quadro, ou null.
    protegerRetangulo(r) {
      protegido = r ?? null;
    },

    comecar() {
      desde = 0;
      uChuva.uDesde.value = 0;
      uChuva.uSopro.value = 0;
      uChao.uDensidade.value = 0;
    },

    protagonistas() {
      if (reduzido) return;
      const roteiros = amb?.nivel === 'baixo' ? ROTEIROS.slice(0, 3) : ROTEIROS;
      roteiros.forEach((r, i) => {
        const s = soltas[ESTOQUE_RAJADA + i];
        s.viva = true;
        s.roteiro = r;
        s.fixado = false;
        s.idade = -r.atraso;
        s.vida = r.dura;
        s.fase = sorte() * Math.PI * 2;
        s.guinada = sorte() * Math.PI * 2;
        s.rol = sorte() * Math.PI * 2;
        s.incl = entre(-0.5, 0.5);
        s.vGuinada = entre(-0.25, 0.25);
        s.vIncl = entre(-0.3, 0.3);
        s.vInclFinal = s.vIncl;
        s.tam = entre(0.085, 0.11);
        s.tom = sorte();
        s.forma = sorte();
        // extra > 1,2: no shader, sem teto de tamanho e com desfoque até 2,2.
        s.extra = entre(1.4, 1.8) * (r.prof / 0.45);
      });
      vivas += roteiros.length;
      malhaSoltas.visible = true;
    },

    // O programa das soltas custava ~40 ms no primeiro uso: compila antes da hora.
    preparar() {
      if (!preparo) {
        try {
          preparo = Promise.resolve(renderer?.compileAsync?.(malhaSoltas, camera, cena)).then(() => {}, () => {});
        } catch {
          preparo = Promise.resolve();
        }
      }
      return preparo;
    },

    // posMundo: um THREE.Vector3 em coordenadas de mundo.
    rajada(posMundo, n = 12) {
      if (typeof posMundo?.x !== 'number' || !Number.isFinite(posMundo.x)) return;
      const forca = reduzido ? 0.5 : 1;
      const pedido = Math.max(0, Math.floor(Number(n) || 0));
      const quantas = Math.min(reduzido ? Math.ceil(pedido / 3) : pedido, ESTOQUE_RAJADA);
      for (let i = 0; i < quantas; i++) {
        const s = pegarSolta();
        const angulo = sorte() * Math.PI * 2;
        const impulso = entre(0.5, 1.9) * forca;
        s.viva = true;
        s.roteiro = null;
        s.idade = 0;
        s.x = posMundo.x;
        s.y = Number(posMundo.y) || 0;
        s.z = Number(posMundo.z) || 0;
        s.vx = Math.cos(angulo) * impulso;
        s.vy = Math.sin(angulo) * impulso * 0.8 + 0.7 * forca;
        s.vz = entre(0.3, 1.5) * forca;
        s.vida = entre(7, 12);
        s.queda = entre(0.35, 0.6) * ritmo;
        s.fase = sorte() * Math.PI * 2;
        s.guinada = sorte() * Math.PI * 2;
        s.incl = sorte() * Math.PI * 2;
        s.rol = sorte() * Math.PI * 2;
        s.vGuinada = entre(-1.2, 1.2);
        s.vIncl = entre(5, 11) * (sorte() < 0.5 ? -1 : 1) * forca;
        s.vInclFinal = (sorte() < 0.4 ? entre(1.2, 3) : entre(0.1, 0.5)) * Math.sign(s.vIncl);
        s.tam = entre(0.046, 0.085);
        s.tom = sorte();
        s.forma = sorte();
        s.extra = 1;
      }
      if (quantas > 0) {
        vivas += quantas;
        malhaSoltas.visible = true;
      }
    },

    // A posição entra na hora (troca de posição teleporta o ponto de giro); só a força é suavizada.
    // Chamada a cada quadro no mergulho da mão: sem alocar nada.
    magia(pos, forca = 1) {
      const x = Number(pos?.x);
      const y = Number(pos?.y);
      const z = Number(pos?.z);
      if (!pos || reduzido || !Number.isFinite(x + y + z)) {
        magiaAlvo = 0;
        return;
      }
      comuns.uMagia.value.set(x, y, z, comuns.uMagia.value.w);
      magiaAlvo = clamp(Number(forca) || 0, 0, 1);
    },

    atualizar,

    dispose() {
      if (fora) return;
      fora = true;
      protegido = null;
      pararTamanho?.();
      pararNivel?.();
      cena.remove(grupo);
      for (const g of [geoChuva, geoChao, geoSoltas]) g.dispose();
      for (const m of [matChuva, matChao, matSoltas]) m.dispose();
      base.dispose();
    },
  };
}
