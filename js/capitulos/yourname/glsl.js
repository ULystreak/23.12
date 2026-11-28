/* ============================================================================
   Os shaders do voo (capítulo 2). Só texto: quem monta os materiais é voo.js.
   Todas as cores chegam lineares (THREE.Color) e saem pelo colorspace_fragment.
   ========================================================================== */

const SAIDA = `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

// O céu como função da direção: o lago usa a mesma para refletir.
const CEU_FN = /* glsl */ `
  uniform vec3 uZen;
  uniform vec3 uMeio;
  uniform vec3 uHor;
  uniform vec3 uBaixo;
  uniform vec3 uSolCor;
  uniform vec3 uSol;
  uniform float uSolF;
  vec3 ceu(vec3 d) {
    float h = d.y;
    vec3 c = mix(uHor, uMeio, smoothstep(0.0, 0.26, h));
    c = mix(c, uZen, smoothstep(0.16, 0.9, h));
    c = mix(c, uBaixo, smoothstep(0.0, -0.3, h));
    float s = max(dot(d, uSol), 0.0);
    c += uSolCor * uSolF * (pow(s, 900.0) * 3.0 + pow(s, 40.0) * 0.28 + pow(s, 5.0) * 0.14);
    return c;
  }
`;

const MUNDO_V = /* glsl */ `
  varying vec3 vMundo;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vMundo = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

export const CEU_V = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const CEU_F = /* glsl */ `
  ${CEU_FN}
  varying vec3 vDir;
  void main() {
    vec3 c = ceu(normalize(vDir));
    // Um grão de meio tom desfaz as faixas do degradê.
    c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 160.0;
    gl_FragColor = vec4(c, 1.0);
    ${SAIDA}
  }
`;

/* O mar de nuvens: um plano com ruído, visto de cima (mar) e de baixo (teto). */
export const MAR_V = MUNDO_V;
export const MAR_F = /* glsl */ `
  uniform sampler2D uRuido;
  uniform vec3 uLuz;
  uniform vec3 uSombra;
  uniform vec3 uHor;
  uniform float uCob;
  uniform float uSolido;
  uniform float uTom;
  uniform float uOpac;
  uniform float uTempo;
  uniform vec2 uDesvio;
  varying vec3 vMundo;
  void main() {
    vec2 p = vMundo.xz / 260.0 + uDesvio + uTempo * vec2(0.0011, 0.0006);
    float n = texture2D(uRuido, p).r * 0.72 + texture2D(uRuido, p * 3.1 + 0.37).g * 0.28;
    float n2 = texture2D(uRuido, p + vec2(0.012, 0.007)).r * 0.72 + texture2D(uRuido, (p + vec2(0.004, 0.002)) * 3.1 + 0.37).g * 0.28;
    float a = smoothstep(uCob, uCob + 0.2, n);
    float luz = clamp(0.55 + (n - n2) * 7.0 + (n - 0.5) * 1.1, 0.0, 1.0);
    vec3 c = mix(uSombra, uLuz, luz * uTom);
    float dist = length(vMundo.xz - cameraPosition.xz);
    float nev = smoothstep(90.0, 560.0, dist);
    c = mix(c, uHor, nev * 0.92);
    a = mix(a, 1.0, nev * uSolido);
    a *= 1.0 - smoothstep(520.0, 600.0, dist) * (1.0 - uSolido);
    gl_FragColor = vec4(c, a * uOpac);
    ${SAIDA}
  }
`;

/* O lago: reflete o céu, as estrelas e treme devagar. */
export const LAGO_V = MUNDO_V;
export const LAGO_F = /* glsl */ `
  ${CEU_FN}
  uniform sampler2D uRuido;
  uniform vec3 uAgua;
  uniform float uTempo;
  uniform float uEstrelas;
  varying vec3 vMundo;
  float sorte(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 v = normalize(vMundo - cameraPosition);
    vec2 p = vMundo.xz;
    vec2 o = texture2D(uRuido, p * 0.011 + uTempo * vec2(0.004, 0.0026)).rg - 0.5;
    o += (texture2D(uRuido, p * 0.043 - uTempo * vec2(0.007, 0.004)).gr - 0.5) * 0.5;
    vec3 r = normalize(vec3(v.x + o.x * 0.16, abs(v.y) + 0.015, v.z + o.y * 0.16));
    vec3 c = ceu(r);
    // As estrelas no espelho: pontos por célula, que respiram.
    vec2 g = r.xz / (r.y + 0.22) * 38.0;
    vec2 cel = floor(g);
    float h = sorte(cel);
    vec2 q = fract(g) - 0.5 - (vec2(sorte(cel + 3.1), sorte(cel + 7.7)) - 0.5) * 0.6;
    float brilho = step(0.9, h) * smoothstep(0.14, 0.0, length(q)) * smoothstep(0.75, 0.3, -v.y) * (0.6 + 0.4 * sin(uTempo * (0.8 + h) + h * 60.0));
    c += vec3(0.85, 0.9, 1.0) * brilho * uEstrelas * 0.55;
    float f = pow(1.0 - clamp(-v.y, 0.0, 1.0), 3.0);
    c = mix(uAgua, c * 0.9, 0.3 + 0.7 * f);
    float dist = length(p - cameraPosition.xz);
    c = mix(c, uHor * 0.8, smoothstep(260.0, 640.0, dist));
    gl_FragColor = vec4(c, 1.0);
    ${SAIDA}
  }
`;

/* Os tufos: impostores que olham para a câmera, com a luz já cozida na textura. */
export const TUFO_V = /* glsl */ `
  attribute vec3 aPos;
  attribute vec3 aDados; // escala, variante com sinal (espelho), fase
  uniform float uTempo;
  varying vec2 vUv;
  varying float vDist;
  varying float vFase;
  void main() {
    vec3 c = aPos;
    c.x += sin(uTempo * 0.05 + aDados.z) * 0.8;
    c.y += sin(uTempo * 0.07 + aDados.z * 1.7) * 0.25;
    vec4 mv = viewMatrix * vec4(c, 1.0);
    mv.xy += position.xy * vec2(aDados.x * 1.75, aDados.x);
    vDist = -mv.z;
    vFase = aDados.z;
    float lado = sign(aDados.y);
    float variante = abs(aDados.y) - 1.0;
    vUv = vec2((variante + (lado > 0.0 ? uv.x : 1.0 - uv.x)) * 0.5, uv.y);
    gl_Position = projectionMatrix * mv;
    // Colado na câmera ou longe demais o tufo é todo transparente (o alfa abaixo
    // dá zero): sai da tela inteiro, em vez de cobrir tudo com pixels descartados.
    if (vDist <= 2.5 || vDist >= 330.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;
export const TUFO_F = /* glsl */ `
  uniform sampler2D uMapa;
  uniform vec3 uLuz;
  uniform vec3 uSombra;
  uniform vec3 uHor;
  uniform float uOpac;
  varying vec2 vUv;
  varying float vDist;
  varying float vFase;
  void main() {
    vec4 t = texture2D(uMapa, vUv);
    vec3 c = mix(uSombra, uLuz, t.r);
    c = mix(c, uHor, smoothstep(70.0, 300.0, vDist) * 0.7);
    float a = t.a * uOpac * smoothstep(2.5, 13.0, vDist) * (1.0 - smoothstep(240.0, 330.0, vDist));
    if (a < 0.004) discard;
    gl_FragColor = vec4(c, a);
    ${SAIDA}
  }
`;

/* O cordão trançado: a textura da trança, um pouco de volume e a ponta de luz. */
export const CORDAO_V = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalMatrix * normal;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
export const CORDAO_F = /* glsl */ `
  uniform sampler2D uTranca;
  uniform float uRep;
  uniform float uCorte;
  uniform float uPonta;
  uniform float uComp;
  uniform float uOpac;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    if (vUv.x > uCorte) discard;
    vec3 c = texture2D(uTranca, vec2(vUv.x * uRep, vUv.y * 2.0)).rgb;
    float frente = max(dot(normalize(vN), normalize(vV)), 0.0);
    c *= 0.5 + 0.62 * frente;
    // Brilha por conta própria: o que já passou fica aceso, o que vem na frente espera.
    float aceso = 1.0 - smoothstep(0.0, 9.0, (vUv.x - uPonta) * uComp);
    c *= 0.78 + 0.5 * aceso;
    c += vec3(0.89, 0.16, 0.24) * (0.1 + 0.16 * aceso);
    float ponta = exp(-pow((vUv.x - uPonta) * uComp / 1.3, 2.0));
    c += vec3(1.0, 0.55, 0.5) * ponta * 0.9;
    gl_FragColor = vec4(c, uOpac);
    ${SAIDA}
  }
`;
export const HALO_F = /* glsl */ `
  uniform float uPonta;
  uniform float uComp;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float frente = max(dot(normalize(vN), normalize(vV)), 0.0);
    float aceso = 1.0 - smoothstep(0.0, 9.0, (vUv.x - uPonta) * uComp);
    float a = pow(frente, 3.0) * (0.1 + 0.2 * aceso);
    gl_FragColor = vec4(vec3(1.0, 0.25, 0.3), a);
    ${SAIDA}
  }
`;

/* O quadro: a foto com cantos redondos e um filete de papel aceso. */
export const QUADRO_V = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
export const QUADRO_F = /* glsl */ `
  uniform sampler2D uMapa;
  uniform vec2 uTam;
  uniform vec3 uTinta;
  uniform float uOpac;
  varying vec2 vUv;
  void main() {
    vec2 q = (vUv - 0.5) * uTam;
    float raio = min(uTam.x, uTam.y) * 0.05;
    float d = length(max(abs(q) - uTam * 0.5 + raio, 0.0)) - raio;
    float px = fwidth(d);
    float a = 1.0 - smoothstep(-px, px, d);
    float borda = min(uTam.x, uTam.y) * 0.018;
    vec3 c = texture2D(uMapa, vUv).rgb;
    c = mix(c, c * uTinta, 0.22);
    vec3 papel = vec3(0.93, 0.83, 0.66) * mix(vec3(1.0), uTinta, 0.35);
    c = mix(c, papel, smoothstep(-borda - px, -borda + px, d));
    gl_FragColor = vec4(c, a * uOpac);
    ${SAIDA}
  }
`;

/* Estrelas e luzes da cidade: pontos redondos que respiram devagar. */
export const PONTO_V = /* glsl */ `
  attribute float aTam;
  attribute float aSem;
  attribute vec3 aCor;
  uniform float uTempo;
  uniform float uOpac;
  uniform float uEsc;
  uniform float uDpr;
  uniform float uAten;
  varying vec4 vCor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = -mv.z;
    float perto = clamp(aTam * uEsc / max(dist, 0.5), 1.4 * uDpr, 6.0 * uDpr);
    gl_PointSize = mix(aTam * uDpr, perto, uAten);
    float pisca = 0.74 + 0.26 * sin(uTempo * (0.9 + aSem * 1.6) + aSem * 40.0);
    float some = mix(1.0, smoothstep(2.0, 10.0, dist), uAten);
    vCor = vec4(aCor, pisca * uOpac * some);
  }
`;
export const PONTO_F = /* glsl */ `
  varying vec4 vCor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.06, d) * vCor.a;
    gl_FragColor = vec4(vCor.rgb, a);
    ${SAIDA}
  }
`;

/* A cauda do cometa: partículas que escorrem da cabeça para trás. */
export const CAUDA_V = /* glsl */ `
  attribute vec4 aR; // posição na cauda, desvio de lado, desvio de cima, semente
  uniform vec3 uCab;
  uniform vec3 uDir;
  uniform vec3 uLado;
  uniform vec3 uCima;
  uniform float uComp;
  uniform float uTempo;
  uniform float uOpac;
  uniform float uDpr;
  varying vec4 vCor;
  void main() {
    float t = fract(aR.x + uTempo * 0.11 * (0.5 + aR.w));
    float ao = t * (0.35 + 0.65 * t);
    vec3 p = uCab - uDir * ao * uComp + (uLado * aR.y + uCima * aR.z) * (0.3 + t * 5.5);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = mix(5.5, 1.3, t) * uDpr * (0.7 + 0.6 * aR.w);
    vec3 fria = mix(vec3(0.42, 0.72, 1.0), vec3(1.0, 0.56, 0.78), step(0.5, aR.w));
    vec3 c = mix(vec3(1.0, 0.98, 0.95), fria, smoothstep(0.0, 0.35, t));
    vCor = vec4(c, pow(1.0 - t, 1.6) * uOpac);
  }
`;
