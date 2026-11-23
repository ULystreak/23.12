/* ============================================================================
   CÉU (GLSL): os shaders do céu do capítulo 2, em GLSL ES 1.00
   ============================================================================
   Tudo o que depende da hora chega por uniforms já misturados em paleta.js;
   aqui ficam só as formas: degradê, sol, duas camadas de nuvens, estrelas, via
   láctea, cometa, serras, lago e as luzes da cidadezinha.

   fragmento({ oitavas, detalhe }) monta a fonte com a qualidade do nível:
     OITAVAS (2 a 4): oitavas do fbm dos cúmulos (fbmCurto precisa de 2 ou mais).
     DETALHE > 0: segunda camada de estrelas e nuvens de longe.
     DETALHE > 1: a via láctea.
   Os vec4 do cometa são empacotados: trocar a ordem dos componentes quebra o
   cometa sem erro de compilação (ver ceu.js). Onde a conta pede um smoothstep
   "descendo", ele é escrito como 1 − smoothstep(subindo): o GLSL não define o
   resultado com a primeira borda maior que a segunda.
   ========================================================================== */

export const VERTICE = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';

export function fragmento({ oitavas = 4, detalhe = 2 } = {}) {
  const OITAVAS = Math.max(2, Math.min(4, oitavas | 0));
  const DETALHE = detalhe | 0;
  return `precision highp float;
#define OITAVAS ${OITAVAS}
#define DETALHE ${DETALHE}

uniform vec2 uRes;
uniform float uTempo;
uniform float uHora;
uniform float uRol;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uLuz;
uniform vec3 uSombra;
uniform vec3 uBorda;
uniform vec3 uSolCor;
uniform vec3 uLonge;
uniform vec3 uPerto;
uniform vec3 uSol;      // x, y, força
uniform vec2 uNuvem;    // cobertura, estica
uniform float uEstrelas;
uniform float uTerra;
uniform vec4 uCometa;   // tronco.xy, força, separação
uniform vec4 uCometaAB; // A.xy, B.xy
uniform vec4 uCometaO;  // origem.xy, divisão.xy
uniform float uClarao;

const vec3 BRANCO = vec3(1.0);
const mat2 GIRA = mat2(1.6, 1.2, -1.2, 1.6);

float h21(vec2 p) {
  vec3 p3 = fract(p.xyx * 0.1031);
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

float fbm(vec2 p) {
  float soma = 0.0;
  float a = 0.5;
  float n = 0.0;
  for (int i = 0; i < OITAVAS; i++) {
    soma += a * ruido(p);
    n += a;
    p = GIRA * p + vec2(7.3, 2.1);
    a *= 0.5;
  }
  return soma / n;
}

float fbmCurto(vec2 p) {
  float soma = 0.5 * ruido(p);
  p = GIRA * p + vec2(7.3, 2.1);
  soma += 0.25 * ruido(p);
#if OITAVAS > 2
  p = GIRA * p + vec2(7.3, 2.1);
  soma += 0.125 * ruido(p);
  return soma / 0.875;
#else
  return soma / 0.75;
#endif
}

// perfil de montanha em uma dimensão (os y fixos desenham as serras de sempre)
float serra(float x) {
  return (0.5 * ruido(vec2(x, 1.7)) + 0.25 * ruido(vec2(2.07 * x + 3.1, 5.3)) + 0.125 * ruido(vec2(4.3 * x + 1.7, 9.1))) / 0.875;
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}

vec3 degrade(float h) {
  vec3 c = mix(uC0, uC1, smoothstep(0.0, 0.2, h));
  c = mix(c, uC2, smoothstep(0.15, 0.56, h));
  return mix(c, uC3, smoothstep(0.5, 1.0, h));
}

vec3 fundoCeu(vec2 p, float yL, vec2 sol) {
  float h = clamp((p.y - yL) / (1.0 - yL), 0.0, 1.0);
  float d = length(p - sol);
  float halo = exp(-2.4 * d) * 0.42 + exp(-8.5 * d) * 0.5;
  float disco = (1.0 - smoothstep(0.021, 0.03, d)) * 1.3;
  float baixo = 1.0 - smoothstep(0.08, 0.5, sol.y - yL);
  float faixa = exp(-abs(p.y - yL - 0.03) * 6.5) * exp(-abs(p.x - sol.x) * 1.7) * 0.5 * baixo;
  return degrade(h) + uSolCor * (halo + disco + faixa) * uSol.z;
}

// estrelas em grade: no máximo uma por célula, com cintilação
float estrela(vec2 g, float dens, float tam) {
  vec2 i = floor(g);
  float h = h21(i);
  if (h > dens) return 0.0;
  float k = h / dens;
  vec2 o = (vec2(h21(i + 3.7), h21(i + 9.2)) - 0.5) * 0.7;
  float d = length(fract(g) - 0.5 - o);
  float br = pow(1.0 - k, 3.0) * 0.88 + 0.12;
  float pisca = 0.7 + 0.3 * sin(uTempo * (0.7 + 2.4 * k) + 190.0 * h);
  return (1.0 - smoothstep(0.0, tam * (0.5 + 0.75 * br), d)) * br * pisca;
}

// um pedaço de cometa: corpo, fio, grãos, núcleo e cruz
vec3 rastro(vec2 r, vec2 dir, float comp, float curva, vec3 cA, vec3 cB, float cabeca, float cauda) {
  vec2 n = vec2(-dir.y, dir.x);
  float x = -dot(r, dir);
  float y = dot(r, n) - curva * x * x;
  float xn = clamp(x / comp, 0.0, 1.0);
  float frente = smoothstep(-0.006, 0.006, x);
  float larg = 0.0034 + 0.03 * xn + 0.014 * xn * xn;
  float corpo = exp(-y * y / (larg * larg)) * pow(1.0 - xn, 1.5) * frente;
  float fio = exp(-y * y / (0.0000022 + 0.00002 * xn)) * pow(1.0 - xn, 0.7) * frente;
  // cada grão é uma faísca macia, alongada na direção da cauda (a célula já é 2,7:1)
  vec2 gc = vec2(x * 110.0, y * 300.0);
  float gh = h21(floor(gc));
  float faisca = 1.0 - smoothstep(0.0, 0.5, length(fract(gc) - 0.5));
  float grao = step(0.9, gh) * faisca * (0.45 + 0.55 * sin(5.0 * uTempo + 120.0 * gh)) * smoothstep(0.0, 0.12, xn);
  vec3 c = mix(cA, cB, smoothstep(0.0, 0.75, xn));
  vec3 soma = (c * corpo * (0.6 + 1.5 * grao) + BRANCO * fio * 0.85) * cauda;
  float d2 = dot(r, r);
  float nucleo = min(0.00022 / (d2 + 0.000016), 2.4);
  float cruz = exp(-abs(r.y) * 520.0) * exp(-abs(r.x) * 26.0) + exp(-abs(r.x) * 520.0) * exp(-abs(r.y) * 38.0);
  return soma + (mix(BRANCO, cA, 0.3) * nucleo + BRANCO * cruz * 0.55) * cabeca;
}

// o tronco e, depois da divisão, os dois pedaços
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
  float comp = length(uCometa.xy - O) * 0.9 + 0.05;
  vec3 soma = rastro(p - uCometa.xy, dir0, comp, 0.05, azul, anil, 1.0 - smoothstep(0.0, 0.1, sep), 1.0 - 0.4 * sep);
  if (sep > 0.0005) {
    vec2 va = uCometaAB.xy - D;
    vec2 vb = uCometaAB.zw - D;
    soma += rastro(p - uCometaAB.xy, normalize(va), length(va) * 1.06 + 0.014, 0.0, azul, anil, 1.0, 1.0);
    soma += rastro(p - uCometaAB.zw, normalize(vb), length(vb) * 1.06 + 0.014, 0.0, rosa, magenta, 1.0, 1.0);
  }
  return soma * uCometa.z;
}

// o clarão no ponto da divisão
vec3 clarao(vec2 p) {
  if (uClarao <= 0.001) return vec3(0.0);
  vec2 r = p - uCometaO.zw;
  float d = length(r);
  float f = exp(-7.0 * d) * 1.05
    + exp(-150.0 * abs(r.y)) * exp(-2.2 * abs(r.x)) * 0.9
    + exp(-190.0 * abs(r.x)) * exp(-4.5 * abs(r.y)) * 0.55
    + exp(-60.0 * d) * 1.5;
  return mix(vec3(1.0, 0.8, 0.93), BRANCO, exp(-20.0 * d)) * f * uClarao;
}

// as luzes da cidadezinha: no morro (agua 0) ou escorrendo na água (agua 1).
// Olha a coluna do pixel e a vizinha mais perto, para o halo não cortar na emenda.
vec3 cidade(vec2 p, float yL, float s2, float prof, float onda, float agua) {
  vec3 soma = vec3(0.0);
  float coluna = floor(46.0 * p.x);
  float vizinha = coluna + (fract(46.0 * p.x) < 0.5 ? -1.0 : 1.0);
  float vila = exp(-34.0 * (p.x - 0.03) * (p.x - 0.03));
  for (int i = 0; i < 2; i++) {
    float c = i == 0 ? coluna : vizinha;
    float hh = h21(vec2(c, 7.0));
    if (hh >= 0.2 + 0.5 * vila) continue;
    float acesa = smoothstep(0.0, 0.03, uHora - (0.47 + 0.2 * h21(vec2(c, 5.0))));
    if (acesa <= 0.0) continue;
    float lx = (c + 0.2 + 0.6 * h21(vec2(c, 3.0))) / 46.0;
    vec3 tom = h21(vec2(c, 13.0)) > 0.83 ? vec3(0.8, 0.9, 1.0) : vec3(1.0, 0.82, 0.6);
    if (agua > 0.5) {
      float dx = p.x + (onda - 0.5) * 0.006 - lx;
      soma += tom * acesa * exp(-dx * dx * 60000.0) * exp(-46.0 * prof) * (0.55 + 0.45 * onda) * 0.75;
    } else {
      float ly = min(yL + 0.003 + 0.012 * h21(vec2(c, 9.0)), s2 - 0.003);
      vec2 r = vec2(p.x - lx, p.y - ly);
      float d2 = dot(r, r);
      float ponto = exp(-d2 * 420000.0) + exp(-d2 * 26000.0) * 0.22;
      float pisca = 0.86 + 0.14 * sin(uTempo * (1.2 + 5.0 * hh) + 70.0 * hh);
      soma += tom * acesa * ponto * pisca;
    }
  }
  return soma;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * asp, uv.y);
  vec2 sol = vec2((uSol.x - 0.5) * asp, uSol.y);
  float yL = uTerra + 0.14; // a margem do lago
  float t = uTempo;
  float s1 = -1.0;
  float s2 = -1.0;
  if (uv.y < yL + 0.27) {
    s1 = yL + 0.04 + 0.1 * serra(2.1 * p.x + 3.7);   // serra de longe
    s2 = yL + 0.008 + 0.052 * serra(3.7 * p.x + 9.2); // morro de perto
  }
  vec3 cor;

  if (uv.y < yL) {
    // o lago reflete o céu (comprimido, como visto de um morro)
    float prof = yL - uv.y;
    float onda = ruido(vec2(24.0 * p.x, 230.0 * prof - 0.3 * t));
    float onda2 = ruido(vec2(7.0 * p.x + 3.0, 90.0 * prof + 0.12 * t));
    vec2 pm = vec2(p.x + (onda - 0.5) * 0.014, yL + 3.6 * prof + (onda - 0.5) * 0.05 + (onda2 - 0.5) * 0.03);
    vec3 r = fundoCeu(pm, yL, sol) + (cometas(pm) + clarao(pm)) * 0.75;
    float m1 = yL + 0.04 + 0.1 * serra(2.1 * pm.x + 3.7);
    float m2 = yL + 0.008 + 0.052 * serra(3.7 * pm.x + 9.2);
    r = mix(r, mix(uLonge, uC0, 0.18), (1.0 - smoothstep(m1 - 0.012, m1 + 0.012, pm.y)) * 0.9);
    r = mix(r, uPerto, 1.0 - smoothstep(m2 - 0.012, m2 + 0.012, pm.y));
    float brilho = smoothstep(0.62, 0.95, onda) * 0.07 * (1.0 - 0.6 * uEstrelas);
    cor = r * 0.84 + mix(uC1, BRANCO, 0.4) * brilho;
    // as luzes da cidade escorrem na água
    cor += cidade(p, yL, s2, prof, onda, 1.0);
    cor = mix(cor, uPerto, (1.0 - smoothstep(0.0, 0.004, prof)) * 0.8);
  } else if (uv.y < s2) {
    cor = uPerto + (ruido(vec2(60.0 * p.x, 140.0 * uv.y)) - 0.5) * 0.02 * (1.0 - uEstrelas);
    cor += cidade(p, yL, s2, 0.0, 0.5, 0.0);
  } else if (uv.y < s1) {
    float nevoa = 1.0 - smoothstep(s1 - 0.1, s1, uv.y);
    cor = mix(mix(uLonge, uC0, 0.3), uLonge, nevoa);
    cor += uSolCor * uSol.z * exp(-3.0 * abs(p.x - sol.x)) * (1.0 - smoothstep(0.08, 0.45, sol.y - yL)) * 0.12;
  } else {
    cor = fundoCeu(p, yL, sol);
    float h = clamp((p.y - yL) / (1.0 - yL), 0.0, 1.0);

    // estrelas e via láctea giram devagar com a hora
    if (uEstrelas > 0.01) {
      vec2 ps = rot(uHora * 0.55 - 0.42) * (p - vec2(0.05, 0.62));
      float baixo = smoothstep(0.02, 0.3, h);
      float e = estrela(96.0 * ps, 0.34, 0.11);
#if DETALHE > 0
      e += estrela(43.0 * ps + 7.0, 0.15, 0.14) * 1.25;
#endif
      vec3 tom = mix(vec3(0.74, 0.84, 1.0), vec3(1.0, 0.9, 0.8), h21(floor(43.0 * ps)));
#if DETALHE > 1
      float b = dot(ps, vec2(0.8, -0.6)) + 0.03;
      float faixaVia = exp(-46.0 * b * b);
      // longe da faixa a via some (exp < 1e-6): os 7 ruídos dela só onde ela aparece
      if (faixaVia > 1e-6) {
        float via = faixaVia * (0.22 + fbmCurto(2.4 * ps + 5.0)) * (1.0 - 0.62 * smoothstep(0.48, 0.7, fbmCurto(4.3 * ps + 17.0)));
        vec3 corVia = mix(vec3(0.15, 0.25, 0.62), vec3(0.56, 0.3, 0.68), smoothstep(0.3, 0.7, ruido(1.7 * ps + 2.0)));
        cor += (corVia * via * 0.46 + vec3(0.78, 0.76, 0.92) * via * via * via * 0.22) * uEstrelas * baixo;
        e += estrela(170.0 * ps + 3.0, min(0.85, 0.12 + 0.7 * via), 0.13) * (0.35 + via);
      }
#endif
      cor += tom * e * uEstrelas * baixo;
    }

    float coberto = 0.0;
#if DETALHE > 0
    {
      // nuvens de longe: uma faixa fina, esticada
      vec2 r = vec2(0.8 * p.x, 3.3 * p.y) * 1.7;
      r.x += 1.7 * uHora + 0.004 * t;
      r.y -= 0.2 * uRol;
      float f = fbmCurto(r + 31.0);
      float cob = uNuvem.x + 0.03 + 0.34 * smoothstep(0.06, 0.55, h);
      float a = smoothstep(cob, cob + 0.13, f) * 0.72;
      float l = smoothstep(cob, cob + 0.3, f);
      vec3 c = mix(mix(uSombra, uLuz, 0.45 + 0.55 * l), degrade(h), 0.3);
      cor = mix(cor, c, a);
      coberto = a * 0.7;
    }
#endif

    // cúmulos de perto
    float est = uNuvem.y;
    vec2 q = vec2(p.x * mix(1.25, 0.6, est), p.y * mix(1.25, 2.35, est)) * 2.1;
    q.x += 3.4 * uHora + 0.007 * t;
    q.y -= 0.34 * uRol;
    float massa = ruido(0.42 * q + vec2(11.0, 4.0));
    vec2 qd = q + vec2(0.0, 0.6 * massa);
    float d = fbm(qd);
    float cob = uNuvem.x + (0.5 - massa) * 0.36 + (h - 0.42) * 0.2 * (1.0 - est) + abs(h - 0.3) * 0.34 * est;
    float perto = 1.0 - smoothstep(0.0, 0.12, abs(d - cob - 0.02));
    // borda em couve-flor: ruído fino só perto da borda, para o contorno ficar
    // nítido e recortado (só é calculado onde entra na conta: na borda ou dentro)
    float fino = 0.5;
    if (perto > 0.0 || d > cob) {
      fino = 0.6 * ruido(5.3 * qd + vec2(0.012 * t, 0.0)) + 0.4 * ruido(11.7 * qd + 3.1);
      d += (fino - 0.5) * 0.11 * perto * (1.0 - 0.6 * est);
    }
    float a = smoothstep(cob, cob + mix(0.016, 0.07, est), d);
    if (a > 0.002) {
      vec2 L = normalize(sol - p + vec2(0.0, 0.25));
      float d2 = fbmCurto(qd + 0.13 * L);
      float dentro = smoothstep(0.0, 0.3, d - cob);
      float base = smoothstep(cob - 0.04, cob + 0.12, fbmCurto(qd + vec2(0.0, -0.2)));
      float luz = clamp(0.56 + (d - d2) * 3.4 + (fino - 0.5) * 0.42 * (0.3 + dentro), 0.0, 1.0);
      luz *= mix(0.62, 1.0, base);
      luz *= 1.0 - 0.3 * dentro * (1.0 - luz);
      vec3 c = mix(uSombra, uLuz, luz);
      float aro = (1.0 - smoothstep(0.0, 0.08, d - cob)) * exp(-1.3 * length(p - sol));
      c = mix(c, uBorda, clamp(aro * 0.85, 0.0, 1.0));
      c = mix(c, degrade(h), 0.1 + 0.12 * (1.0 - h));
      cor = mix(cor, c, a);
      coberto = max(coberto, a);
    }

    // as nuvens escondem o cometa e o clarão; a bruma assenta no pé do céu
    cor += (cometas(p) + clarao(p)) * (1.0 - 0.55 * coberto);
    cor = mix(cor, uC0, (1.0 - smoothstep(0.0, 0.1, uv.y - s1)) * 0.35 * step(0.0, s1));
  }

  cor += uClarao * 0.035;
  // grão de ±0,85/255: o degradê não forma faixas
  cor += (h21(gl_FragCoord.xy) - 0.5) * 1.7 / 255.0;
  gl_FragColor = vec4(clamp(cor, 0.0, 1.0), 1.0);
}
`;
}
