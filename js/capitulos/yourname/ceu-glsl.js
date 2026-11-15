// O céu do capítulo 2, pintado num único quad (WebGL puro, GLSL ES 1.00).
//
// Tudo o que depende da hora chega por uniforms já misturados em paleta.js;
// aqui ficam só as formas: degradê, sol, duas camadas de nuvens, estrelas, via
// láctea, cometa, serras, lago e as luzes da cidadezinha.

export const VERTICE = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * @param {{ oitavas: number, detalhe: number }} opcoes
 *   oitavas  oitavas do fbm das nuvens (4 alto, 3 médio, 2 baixo)
 *   detalhe  2 = tudo; 1 = sem a segunda camada de estrelas; 0 = sem via láctea nem nuvens de longe
 */
export function fragmento({ oitavas = 4, detalhe = 2 } = {}) {
  return `
precision highp float;
#define OITAVAS ${Math.max(2, Math.min(4, oitavas | 0))}
#define DETALHE ${detalhe | 0}

uniform vec2 uRes;
uniform float uTempo;
uniform float uHora;
uniform float uRol;
uniform vec3 uC0, uC1, uC2, uC3;
uniform vec3 uLuz, uSombra, uBorda;
uniform vec3 uSolCor;
uniform vec3 uSol;        // x (0..1), y (0..1), força
uniform vec3 uLonge, uPerto;
uniform vec2 uNuvem;      // cobertura, estica
uniform float uEstrelas;
uniform float uTerra;
uniform vec4 uCometa;     // tronco.xy, força, separação
uniform vec4 uCometaAB;   // pedaço A (xy), pedaço B (zw)
uniform vec4 uCometaO;    // de onde vem (xy), onde se divide (zw)
uniform float uClarao;

float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float ruido(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = h21(i);
  float b = h21(i + vec2(1.0, 0.0));
  float c = h21(i + vec2(0.0, 1.0));
  float d = h21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const mat2 GIRA = mat2(1.6, 1.2, -1.2, 1.6);

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  float n = 0.0;
  for (int i = 0; i < OITAVAS; i++) {
    s += a * ruido(p);
    n += a;
    p = GIRA * p + vec2(7.3, 2.1);
    a *= 0.5;
  }
  return s / n;
}

float fbmCurto(vec2 p) {
  float s = 0.5 * ruido(p);
  p = GIRA * p + vec2(7.3, 2.1);
  s += 0.25 * ruido(p);
#if OITAVAS > 2
  p = GIRA * p + vec2(7.3, 2.1);
  s += 0.125 * ruido(p);
  return s / 0.875;
#else
  return s / 0.75;
#endif
}

float serra(float x) {
  float v = 0.5 * ruido(vec2(x, 1.7));
  v += 0.25 * ruido(vec2(x * 2.07 + 3.1, 5.3));
  v += 0.125 * ruido(vec2(x * 4.3 + 1.7, 9.1));
  return v / 0.875;
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

vec3 degrade(float h) {
  vec3 c = mix(uC0, uC1, smoothstep(0.0, 0.2, h));
  c = mix(c, uC2, smoothstep(0.15, 0.56, h));
  c = mix(c, uC3, smoothstep(0.5, 1.0, h));
  return c;
}

// Degradê + sol: é o que aparece no céu e também o que o lago reflete.
vec3 fundoCeu(vec2 p, float yL, vec2 sol) {
  float h = clamp((p.y - yL) / (1.0 - yL), 0.0, 1.0);
  vec3 c = degrade(h);
  float d = length(p - sol);
  float halo = exp(-d * 2.4) * 0.42 + exp(-d * 8.5) * 0.5;
  float disco = smoothstep(0.03, 0.021, d) * 1.3;
  float baixo = 1.0 - smoothstep(0.08, 0.5, sol.y - yL);
  float faixa = exp(-abs(p.y - yL - 0.03) * 6.5) * exp(-abs(p.x - sol.x) * 1.7) * 0.5 * baixo;
  c += uSolCor * (halo + disco + faixa) * uSol.z;
  return c;
}

float estrela(vec2 g, float dens, float tam) {
  vec2 i = floor(g);
  float h = h21(i);
  if (h > dens) return 0.0;
  float k = h / dens;
  vec2 o = (vec2(h21(i + 3.7), h21(i + 9.2)) - 0.5) * 0.7;
  float d = length(fract(g) - 0.5 - o);
  float br = pow(1.0 - k, 3.0) * 0.88 + 0.12;
  float pisca = 0.7 + 0.3 * sin(uTempo * (0.7 + k * 2.4) + h * 190.0);
  return smoothstep(tam * (0.5 + br * 0.75), 0.0, d) * br * pisca;
}

// Um pedaço do cometa: cabeça em r = 0, cauda para trás de "dir".
vec3 rastro(vec2 r, vec2 dir, float comp, float curva, vec3 cA, vec3 cB, float cabeca, float cauda) {
  vec2 n = vec2(-dir.y, dir.x);
  float x = -dot(r, dir);
  float y = dot(r, n) - curva * x * x;
  float xn = clamp(x / comp, 0.0, 1.0);
  float frente = smoothstep(-0.006, 0.006, x);
  float larg = 0.0034 + 0.03 * xn + 0.014 * xn * xn;
  float corpo = exp(-y * y / (larg * larg)) * pow(1.0 - xn, 1.5) * frente;
  float fio = exp(-y * y / (0.0000022 + 0.00002 * xn)) * pow(1.0 - xn, 0.7) * frente;
  vec2 g = vec2(x * 110.0 - uTempo * 0.9, y * 300.0);
  vec2 gi = floor(g);
  float gh = h21(gi);
  // cada grão é uma faísca macia, alongada na direção da cauda (a célula já é 2,7:1)
  vec2 gj = (vec2(h21(gi + 5.1), h21(gi + 9.7)) - 0.5) * 0.4;
  float grao = smoothstep(0.42, 0.04, length(fract(g) - 0.5 - gj));
  float po = step(0.9, gh) * grao * (0.45 + 0.55 * sin(uTempo * 5.0 + gh * 120.0)) * smoothstep(0.0, 0.12, xn);
  vec3 c = mix(cA, cB, smoothstep(0.0, 0.75, xn));
  vec3 s = (c * corpo * (0.6 + po * 1.5) + vec3(1.0) * fio * 0.85) * cauda;
  float d2 = dot(r, r);
  float nucleo = min(0.00022 / (d2 + 0.000016), 2.4);
  float raio = exp(-abs(r.y) * 520.0) * exp(-abs(r.x) * 26.0) + exp(-abs(r.x) * 520.0) * exp(-abs(r.y) * 38.0);
  s += (mix(vec3(1.0), cA, 0.3) * nucleo + vec3(1.0) * raio * 0.55) * cabeca;
  return s;
}

vec3 cometas(vec2 p) {
  if (uCometa.z <= 0.001) return vec3(0.0);
  vec2 O = uCometaO.xy;
  vec2 D = uCometaO.zw;
  vec2 dir0 = normalize(D - O);
  float sep = uCometa.w;
  vec3 azul = vec3(0.56, 0.87, 1.0);
  vec3 anil = vec3(0.3, 0.42, 1.0);
  vec3 rosa = vec3(1.0, 0.62, 0.86);
  vec3 magenta = vec3(0.78, 0.32, 0.86);
  float compT = length(uCometa.xy - O) * 0.9 + 0.05;
  vec3 s = rastro(p - uCometa.xy, dir0, compT, 0.05, azul, anil, 1.0 - smoothstep(0.0, 0.1, sep), 1.0 - 0.4 * sep);
  if (sep > 0.0005) {
    vec2 va = uCometaAB.xy - D;
    vec2 vb = uCometaAB.zw - D;
    float la = max(length(va), 0.0001);
    float lb = max(length(vb), 0.0001);
    s += rastro(p - uCometaAB.xy, va / la, la * 1.06 + 0.014, 0.0, azul, anil, 1.0, 1.0);
    s += rastro(p - uCometaAB.zw, vb / lb, lb * 1.06 + 0.014, 0.0, rosa, magenta, 1.0, 1.0);
  }
  return s * uCometa.z;
}

vec3 clarao(vec2 p) {
  if (uClarao <= 0.001) return vec3(0.0);
  vec2 r = p - uCometaO.zw;
  float d = length(r);
  float f = exp(-d * 7.0) * 1.05
    + exp(-abs(r.y) * 150.0) * exp(-abs(r.x) * 2.2) * 0.9
    + exp(-abs(r.x) * 190.0) * exp(-abs(r.y) * 4.5) * 0.55
    + exp(-d * 60.0) * 1.5;
  return mix(vec3(1.0, 0.8, 0.93), vec3(1.0), exp(-d * 20.0)) * f * uClarao;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * asp, uv.y);
  vec2 sol = vec2((uSol.x - 0.5) * asp, uSol.y);
  float yL = uTerra + 0.14;                 // a margem do lago
  vec3 cor;

  float s1 = -1.0;
  float s2 = -1.0;
  if (uv.y < yL + 0.27) {
    s1 = yL + 0.04 + 0.1 * serra(p.x * 2.1 + 3.7);
    s2 = yL + 0.008 + 0.052 * serra(p.x * 3.7 + 9.2);
  }

  if (uv.y < yL) {
    // ---- o lago: reflete o céu (comprimido, como visto de um morro) -------------
    float prof = yL - uv.y;
    float onda = ruido(vec2(p.x * 24.0, prof * 230.0 - uTempo * 0.3));
    float onda2 = ruido(vec2(p.x * 7.0 + 3.0, prof * 90.0 + uTempo * 0.12));
    vec2 pm = vec2(p.x + (onda - 0.5) * 0.014, yL + prof * 3.6 + (onda - 0.5) * 0.05 + (onda2 - 0.5) * 0.03);
    vec3 r = fundoCeu(pm, yL, sol);
    r += (cometas(pm) + clarao(pm)) * 0.75;
    float m1 = yL + 0.04 + 0.1 * serra(pm.x * 2.1 + 3.7);
    float m2 = yL + 0.008 + 0.052 * serra(pm.x * 3.7 + 9.2);
    r = mix(r, mix(uLonge, uC0, 0.18), smoothstep(m1 + 0.012, m1 - 0.012, pm.y) * 0.9);
    r = mix(r, uPerto, smoothstep(m2 + 0.012, m2 - 0.012, pm.y));
    float brilho = smoothstep(0.62, 0.95, onda) * 0.07 * (1.0 - uEstrelas * 0.6);
    cor = r * 0.84 + mix(uC1, vec3(1.0), 0.4) * brilho;
    // as luzes da cidade escorrem na água
    float cx = floor(p.x * 46.0);
    float hh = h21(vec2(cx, 7.0));
    float vila = exp(-(p.x - 0.03) * (p.x - 0.03) * 34.0);
    if (hh < 0.2 + 0.5 * vila) {
      float lx = (cx + 0.2 + 0.6 * h21(vec2(cx, 3.0))) / 46.0;
      float acesa = smoothstep(0.0, 0.03, uHora - (0.47 + 0.2 * h21(vec2(cx, 5.0))));
      float dx = p.x - lx + (onda - 0.5) * 0.004;
      float escorre = exp(-dx * dx * 60000.0) * exp(-prof * 46.0) * (0.55 + 0.45 * onda);
      cor += mix(vec3(1.0, 0.82, 0.6), vec3(0.8, 0.9, 1.0), step(0.83, h21(vec2(cx, 13.0)))) * escorre * acesa * 0.75;
    }
    // a beira da água
    cor = mix(cor, uPerto, smoothstep(0.004, 0.0, prof) * 0.8);
  } else if (uv.y < s2) {
    // ---- o morro de perto, com a cidadezinha na margem --------------------------
    cor = uPerto + (ruido(p * vec2(60.0, 140.0)) - 0.5) * 0.02 * (1.0 - uEstrelas);
    float cx = floor(p.x * 46.0);
    float hh = h21(vec2(cx, 7.0));
    float vila = exp(-(p.x - 0.03) * (p.x - 0.03) * 34.0);
    if (hh < 0.2 + 0.5 * vila) {
      vec2 lp = vec2((cx + 0.2 + 0.6 * h21(vec2(cx, 3.0))) / 46.0, yL + 0.003 + 0.02 * h21(vec2(cx, 11.0)) * (0.4 + vila));
      float acesa = smoothstep(0.0, 0.03, uHora - (0.47 + 0.2 * h21(vec2(cx, 5.0))));
      vec2 dl = p - lp;
      float d2 = dot(dl, dl);
      float ponto = exp(-d2 * 420000.0) + exp(-d2 * 26000.0) * 0.22;
      float pisca = 0.86 + 0.14 * sin(uTempo * (1.2 + hh * 5.0) + hh * 70.0);
      cor += mix(vec3(1.0, 0.82, 0.6), vec3(0.8, 0.9, 1.0), step(0.83, h21(vec2(cx, 13.0)))) * ponto * acesa * pisca;
    }
  } else if (uv.y < s1) {
    // ---- a serra de longe, esmaecida pelo ar -------------------------------------
    float nevoa = smoothstep(s1, s1 - 0.1, uv.y);
    cor = mix(mix(uLonge, uC0, 0.3), uLonge, nevoa);
    cor += uSolCor * uSol.z * exp(-abs(p.x - sol.x) * 3.0) * (1.0 - smoothstep(0.08, 0.45, sol.y - yL)) * 0.12;
  } else {
    // ---- o céu -------------------------------------------------------------------
    float h = clamp((uv.y - yL) / (1.0 - yL), 0.0, 1.0);
    cor = fundoCeu(p, yL, sol);
    float est = uNuvem.y;
    float coberto = 0.0;

    // estrelas e via láctea giram devagar com a hora
    if (uEstrelas > 0.01) {
      vec2 ps = rot(uHora * 0.55 - 0.42) * (p - vec2(0.05, 0.62));
      float baixo = smoothstep(0.02, 0.3, h);
      float e = estrela(ps * 96.0, 0.34, 0.11);
#if DETALHE > 0
      e += estrela(ps * 43.0 + 7.0, 0.15, 0.14) * 1.25;
#endif
      vec3 tom = mix(vec3(0.74, 0.84, 1.0), vec3(1.0, 0.9, 0.8), h21(floor(ps * 43.0)));
#if DETALHE > 1
      float b = dot(ps, vec2(0.8, -0.6)) + 0.03;
      float nev = fbmCurto(ps * 2.4 + 5.0);
      float via = exp(-b * b * 46.0) * (0.22 + nev);
      via *= 1.0 - 0.62 * smoothstep(0.48, 0.7, fbmCurto(ps * 4.3 + 17.0));
      vec3 corVia = mix(vec3(0.15, 0.25, 0.62), vec3(0.56, 0.3, 0.68), smoothstep(0.3, 0.7, ruido(ps * 1.7 + 2.0)));
      cor += (corVia * via * 0.46 + vec3(0.78, 0.76, 0.92) * via * via * via * 0.22) * uEstrelas * baixo;
      e += estrela(ps * 170.0 + 3.0, min(0.85, 0.12 + via * 0.7), 0.13) * (0.35 + via);
#endif
      cor += tom * e * uEstrelas * baixo;
    }

#if DETALHE > 0
    // nuvens de longe: faixas baixas, quase da cor do ar
    {
      vec2 r = vec2(p.x * 0.8, p.y * 3.3) * 1.7;
      r.x += uHora * 1.7 + uTempo * 0.004;
      r.y -= uRol * 0.2;
      float f = fbmCurto(r + 31.0);
      float cob = uNuvem.x + 0.03 + smoothstep(0.06, 0.55, h) * 0.34;
      float a = smoothstep(cob, cob + 0.13, f) * 0.72;
      float l = smoothstep(cob, cob + 0.3, f);
      vec3 c = mix(mix(uSombra, uLuz, 0.45 + 0.55 * l), degrade(h), 0.3);
      cor = mix(cor, c, a);
      coberto = a * 0.7;
    }
#endif

    // cúmulos de perto: massas grandes, borda nítida, luz do lado do sol
    {
      vec2 q = vec2(p.x * mix(1.25, 0.6, est), p.y * mix(1.25, 2.35, est)) * 2.1;
      q.x += uHora * 3.4 + uTempo * 0.007;
      q.y -= uRol * 0.34;
      float massa = ruido(q * 0.42 + vec2(11.0, 4.0));
      vec2 qd = q + vec2(0.0, massa * 0.6);
      float d = fbm(qd);
      float cob = uNuvem.x + (0.5 - massa) * 0.36 + (h - 0.42) * 0.2 * (1.0 - est) + abs(h - 0.3) * 0.34 * est;
      // borda em couve-flor: ruído fino só perto da borda, para o contorno ficar nítido e recortado
      float perto = 1.0 - smoothstep(0.0, 0.12, abs(d - cob - 0.02));
      float fino = ruido(qd * 5.3 + vec2(uTempo * 0.012, 0.0)) * 0.6 + ruido(qd * 11.7 + 3.1) * 0.4;
      d += (fino - 0.5) * 0.11 * perto * (1.0 - est * 0.6);
      float a = smoothstep(cob, cob + mix(0.016, 0.07, est), d);
      if (a > 0.002) {
        vec2 L = normalize(sol - p + vec2(0.0, 0.25));
        float d2 = fbmCurto(qd + L * 0.13);
        float dentro = smoothstep(0.0, 0.3, d - cob);
        // volume: gomos claros por dentro e a base mais escura (onde logo abaixo já é céu)
        float base = smoothstep(cob - 0.04, cob + 0.12, fbmCurto(qd + vec2(0.0, -0.2)));
        float luz = clamp(0.56 + (d - d2) * 3.4 + (fino - 0.5) * 0.42 * (0.3 + dentro), 0.0, 1.0);
        luz *= mix(0.62, 1.0, base);
        luz *= 1.0 - 0.3 * dentro * (1.0 - luz);
        vec3 c = mix(uSombra, uLuz, luz);
        float aro = (1.0 - smoothstep(0.0, 0.08, d - cob)) * exp(-length(p - sol) * 1.3);
        c = mix(c, uBorda, clamp(aro * 0.85, 0.0, 1.0));
        c = mix(c, degrade(h), 0.1 + 0.12 * (1.0 - h));
        cor = mix(cor, c, a);
        coberto = max(coberto, a);
      }
    }

    cor += (cometas(p) + clarao(p)) * (1.0 - coberto * 0.55);
    // bruma no pé do céu
    cor = mix(cor, uC0, smoothstep(0.1, 0.0, uv.y - s1) * 0.35 * step(0.0, s1));
  }

  cor += uClarao * 0.035;
  cor += (h21(gl_FragCoord.xy) - 0.5) * (1.7 / 255.0);
  gl_FragColor = vec4(clamp(cor, 0.0, 1.0), 1.0);
}
`;
}
