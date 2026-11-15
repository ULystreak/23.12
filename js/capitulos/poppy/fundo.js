// O fundo do capítulo: a fábrica vista por uma fita VHS.
//
//   const fundo = criarFundo({ recipiente, amb, imagem });
//   fundo.el                     o "tubo": tudo o que é imagem de fundo (a cena o achata ao desligar a TV)
//   fundo.webgl                  true quando o shader está valendo
//   fundo.azul(v)                1 = tela azul de vídeo, 0 = a fita
//   fundo.falha(forca, ms)       um engasgo de tracking (0..1) que dura `ms`
//   fundo.rolar(progresso, velocidade, sentido)   chamado a cada quadro pelo capítulo
//   fundo.quadro(dt)             desenha (ou não: em repouso roda a 30 quadros, como fita)
//   fundo.faixa                  altura da faixa de tracking, de 0 (base) a 1 (topo), ou -1
//   fundo.destruir()
//
// Um canvas só, em resolução baixa de propósito (uma fita tem umas 240 linhas).
// A textura é `imagem` (conteudo.poppy.fundo) quando existir; senão, a fábrica
// desenhada em fabrica.js. Embaixo do canvas WebGL fica sempre a mesma imagem,
// parada: é o que aparece sem WebGL, ou se o contexto morrer no meio.

import { clamp, el, suave } from '../../nucleo/util.js';
import { desenharFabrica, FUGA } from './fabrica.js';

const VERTICE = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENTO = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uRes;      // tamanho do buffer em px
uniform vec2 uCobrir;   // escala para a imagem cobrir a tela
uniform vec2 uFuga;     // ponto de fuga (o zoom gira em volta dele)
uniform float uT;       // segundos
uniform float uQuadro;  // quadro de fita (30 por segundo): o ruído muda por quadro
uniform float uVel;     // 0..1: velocidade da rolagem (avanço de fita)
uniform float uDir;     // sentido da rolagem
uniform float uZoom;
uniform float uAzul;    // 1 = tela azul
uniform float uFalha;   // 0..1: engasgo de tracking
uniform float uFaixa;   // altura da faixa de tracking (-1 = sem faixa)
uniform float uVivo;    // 0 com movimento reduzido

float h11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float n1(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(h11(i), h11(i + 1.0), f);
}
vec3 paraYiq(vec3 c) {
  return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312)));
}
vec3 paraRgb(vec3 c) {
  return vec3(c.x + 0.956 * c.y + 0.621 * c.z, c.x - 0.272 * c.y - 0.647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z);
}
vec3 imagem(vec2 p) {
  vec2 c = (p - uFuga) * uCobrir / uZoom + uFuga;
  c += vec2(sin(uT * 0.43), cos(uT * 0.31)) * 0.003 * uVivo;      // câmera na mão
  return texture2D(uTex, c).rgb;
}

void main() {
  vec2 uv = vUv;
  float lin = floor(uv.y * uRes.y);
  float q = uQuadro;
  float dx = 0.0;

  // tremor fino por linha e a ondulação lenta da fita
  dx += (h21(vec2(lin, q)) - 0.5) * 0.0024 * uVivo;
  dx += sin(uv.y * 7.0 + uT * 1.7) * 0.0009 * uVivo;

  // avanço de fita: faixas largas de linhas arrastadas
  float bx = n1(uv.y * 9.0 - uT * 7.0 * uDir);
  float barra = smoothstep(0.6, 0.9, bx + uVel * 0.5) * uVel;
  dx += barra * (0.018 + 0.06 * h21(vec2(lin, q + 5.0)));

  // faixa de tracking que sobe de vez em quando
  float faixa = uFaixa < -0.5 ? 0.0 : smoothstep(0.075, 0.0, abs(uv.y - uFaixa));
  dx += faixa * (h21(vec2(lin * 1.3, q + 2.0)) - 0.35) * 0.075;

  // engasgo: blocos de linhas saltam de lado
  float bl = floor(uv.y * 14.0 + h11(q) * 14.0);
  dx += uFalha * step(0.5, h21(vec2(bl, q + 9.0))) * (h21(vec2(bl, q)) - 0.5) * 0.32;

  // troca de cabeça: os 6% de baixo entortam e chiam
  float cab = smoothstep(0.062, 0.0, uv.y);
  dx += cab * (0.012 + 0.05 * cab + 0.022 * h21(vec2(lin, q + 4.0)) * (0.3 + 0.7 * uVivo));

  vec2 p = vec2(uv.x + dx, uv.y + uFalha * (h11(q + 1.0) - 0.5) * 0.05);

  // luma quase nítida, croma borrada e empurrada para o lado (vazamento de cor)
  float px = 1.0 / uRes.x;
  float vaz = (1.7 + 6.0 * uVel + 9.0 * uFalha + 4.0 * faixa) * px;
  vec3 c0 = paraYiq(imagem(p));
  vec3 c1 = paraYiq(imagem(p - vec2(vaz, 0.0)));
  vec3 c2 = paraYiq(imagem(p - vec2(vaz * 2.3, 0.0)));
  vec3 c3 = paraYiq(imagem(p + vec2(vaz * 0.8, 0.0)));
  float y = c0.x * 0.6 + c1.x * 0.22 + c3.x * 0.18;
  vec2 iq = (c0.yz + c1.yz * 1.2 + c2.yz * 1.1 + c3.yz * 0.5) / 3.8;
  vec3 cor = paraRgb(vec3(y, iq * 1.22));

  // tela azul de vídeo
  vec3 azul = vec3(0.06, 0.1, 0.8) * (0.94 + 0.06 * sin(uv.y * 3.1 + 0.6));
  cor = mix(cor, azul, uAzul);

  // chuvisco
  float gr = h21(vec2(floor(uv.x * uRes.x), lin) + vec2(q * 7.13, q * 3.71)) - 0.5;
  float forca = (0.075 + 0.13 * uVel + 0.45 * uFalha + 0.38 * faixa + 0.32 * cab) * (0.3 + 0.7 * uVivo);
  cor += gr * forca;

  // riscos brancos curtos (a fita perde óxido)
  float seg = floor(uv.x * 22.0 + h21(vec2(lin, q)) * 22.0);
  float limite = 0.9996 - 0.02 * uVel - 0.1 * faixa - 0.08 * uFalha - 0.03 * cab;
  float risco = step(limite, h21(vec2(seg, lin + q * 13.0))) * uVivo;
  cor = mix(cor, vec3(0.9), risco * 0.7);

  cor += faixa * 0.06;
  float cinza = dot(cor, vec3(0.299, 0.587, 0.114));
  cor = mix(cor, vec3(cinza * 1.25 + 0.08), cab * 0.5);

  // vinheta de tubo
  vec2 d = (uv - 0.5) * vec2(1.0, 1.12);
  cor *= 1.0 - smoothstep(0.36, 0.95, length(d)) * 0.46;

  // uma luminária que falha
  cor *= 1.0 - 0.07 * step(0.86, n1(uT * 5.0)) * uVivo * (1.0 - uAzul);

  // os pretos de fita nunca são pretos
  cor = cor * 0.93 + vec3(0.012, 0.02, 0.03);
  gl_FragColor = vec4(clamp(cor, 0.0, 1.0), 1.0);
}`;

/** Um quadradinho de chuvisco para o fundo sem WebGL (vira data URL uma vez só). */
function chuviscoUrl() {
  const lado = 96;
  const tela = document.createElement('canvas');
  tela.width = lado;
  tela.height = lado;
  const c = tela.getContext('2d');
  const dados = c.createImageData(lado, lado);
  for (let i = 0; i < dados.data.length; i += 4) {
    const v = Math.random() * 255;
    dados.data[i] = v;
    dados.data[i + 1] = v;
    dados.data[i + 2] = v;
    dados.data[i + 3] = 255;
  }
  c.putImageData(dados, 0, 0);
  return tela.toDataURL('image/png');
}

export function criarFundo({ recipiente, amb, imagem = null }) {
  const reduzido = !!amb.reduzido;

  // ---- camadas ---------------------------------------------------------------------
  const tubo = el('div', 'poppy-tubo');
  let fonte;                            // o que vira textura: <img> do autor ou a fábrica desenhada
  let parada;                           // a mesma imagem, parada, embaixo de tudo
  if (imagem) {
    fonte = imagem;
    parada = new Image();
    parada.alt = '';
    parada.decoding = 'async';
    parada.draggable = false;
    parada.src = imagem.src;
  } else {
    fonte = desenharFabrica();
    parada = fonte;
  }
  parada.classList.add('poppy-parada');
  parada.style.transformOrigin = `${FUGA.x * 100}% ${FUGA.y * 100}%`;
  parada.style.objectPosition = `${FUGA.x * 100}% ${FUGA.y * 100}%`;
  const larguraFonte = fonte.naturalWidth || fonte.width;
  const alturaFonte = fonte.naturalHeight || fonte.height;

  const canvas = el('canvas', { class: 'poppy-vhs', 'aria-hidden': 'true' });
  tubo.append(parada, canvas);
  recipiente.append(tubo);

  // ---- estado ----------------------------------------------------------------------
  const estado = {
    azul: 1,
    falha: 0, falhaDe: 0, falhaResta: 0, falhaDura: 1,
    faixa: -1, faixaEspera: 5 + Math.random() * 4,
    zoom: 1, vel: 0, dir: 1,
    t: Math.random() * 40,
    quadroDesenhado: -1,
    sujo: true,
  };

  // ---- WebGL -------------------------------------------------------------------------
  let gl = null;
  let programa = null;
  let textura = null;
  let u = null;
  let perdido = false;

  function compilar(tipo, codigo) {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, codigo);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  }

  function montarGl() {
    try {
      gl = canvas.getContext('webgl', {
        alpha: false, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power',
      });
      if (!gl) return false;
      const v = compilar(gl.VERTEX_SHADER, VERTICE);
      const f = compilar(gl.FRAGMENT_SHADER, FRAGMENTO);
      if (!v || !f) return false;
      programa = gl.createProgram();
      gl.attachShader(programa, v);
      gl.attachShader(programa, f);
      gl.linkProgram(programa);
      if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) return false;
      gl.useProgram(programa);

      const quadrado = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadrado);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(programa, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      textura = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, textura);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, fonte);

      u = {};
      for (const nome of ['uTex', 'uRes', 'uCobrir', 'uFuga', 'uT', 'uQuadro', 'uVel', 'uDir', 'uZoom', 'uAzul', 'uFalha', 'uFaixa', 'uVivo']) {
        u[nome] = gl.getUniformLocation(programa, nome);
      }
      gl.uniform1i(u.uTex, 0);
      gl.uniform2f(u.uFuga, FUGA.x, 1 - FUGA.y);
      gl.uniform1f(u.uVivo, reduzido ? 0 : 1);
      return true;
    } catch {
      return false;
    }
  }

  let webgl = amb.webgl !== false && montarGl();
  if (!webgl) {
    gl = null;
    canvas.remove();
  }
  recipiente.classList.toggle('sem-vhs', !webgl);

  // Sem WebGL: tela azul, chuvisco e faixa de tracking em CSS.
  let azulEl = null;
  let faixaEl = null;
  let chuviscoEl = null;
  function montarLeve() {
    if (azulEl) return;
    azulEl = el('div', 'poppy-leve-azul');
    faixaEl = el('div', 'poppy-leve-faixa');
    chuviscoEl = el('div', 'poppy-leve-chuvisco');
    try { chuviscoEl.style.backgroundImage = `url("${chuviscoUrl()}")`; } catch { /* sem chuvisco */ }
    tubo.append(chuviscoEl, faixaEl, azulEl);
    azulEl.style.opacity = String(estado.azul);
    faixaEl.style.opacity = '0';
  }
  if (!webgl) montarLeve();

  const aoPerder = (evento) => {
    evento.preventDefault();
    perdido = true;
    // A imagem parada de baixo assume, com os efeitos em CSS.
    canvas.style.visibility = 'hidden';
    recipiente.classList.add('sem-vhs');
    montarLeve();
  };
  const aoVoltar = () => {
    if (!montarGl()) return;
    perdido = false;
    canvas.style.visibility = '';
    recipiente.classList.remove('sem-vhs');
    medir();
  };
  if (webgl) {
    canvas.addEventListener('webglcontextlost', aoPerder);
    canvas.addEventListener('webglcontextrestored', aoVoltar);
  }

  // ---- tamanho -----------------------------------------------------------------------
  let largura = 0;
  let altura = 0;
  function medir() {
    largura = recipiente.clientWidth;
    altura = recipiente.clientHeight;
    if (!largura || !altura) return;
    if (webgl && gl && !perdido) {
      const linhas = amb.nivel === 'baixo' ? 400 : amb.nivel === 'medio' ? 500 : 580;
      const escala = Math.min(linhas / altura, Math.min(window.devicePixelRatio || 1, 1.5));
      const w = Math.max(2, Math.round(largura * escala));
      const h = Math.max(2, Math.round(altura * escala));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.uRes, w, h);
      const tela = largura / altura;
      const img = larguraFonte / alturaFonte;
      if (tela > img) gl.uniform2f(u.uCobrir, 1, img / tela);
      else gl.uniform2f(u.uCobrir, tela / img, 1);
    }
    estado.sujo = true;
  }
  let observador = null;
  if ('ResizeObserver' in window) {
    observador = new ResizeObserver(medir);
    observador.observe(recipiente);
  }
  medir();

  // ---- desenho -----------------------------------------------------------------------
  function desenhar() {
    if (!webgl || !gl || perdido || !largura) return;
    gl.uniform1f(u.uT, estado.t % 600);
    gl.uniform1f(u.uQuadro, reduzido ? 7 : Math.floor(estado.t * 30) % 997);
    gl.uniform1f(u.uVel, estado.vel);
    gl.uniform1f(u.uDir, estado.dir);
    gl.uniform1f(u.uZoom, estado.zoom);
    gl.uniform1f(u.uAzul, estado.azul);
    gl.uniform1f(u.uFalha, estado.falha);
    gl.uniform1f(u.uFaixa, estado.faixa);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const fundo = {
    el: tubo,
    get webgl() { return webgl && !perdido; },
    get faixa() { return estado.faixa; },
    get nivelFalha() { return estado.falha; },

    azul(v) {
      estado.azul = clamp(v);
      if (azulEl) azulEl.style.opacity = String(estado.azul);
      estado.sujo = true;
    },

    falha(forca = 1, ms = 140) {
      if (reduzido) return;
      estado.falhaDe = clamp(forca);
      estado.falha = estado.falhaDe;
      estado.falhaDura = Math.max(40, ms) / 1000;
      estado.falhaResta = estado.falhaDura;
      estado.sujo = true;
    },

    rolar(progresso, velocidade = 0, sentido = 1) {
      const zoom = reduzido ? 1.04 : 1 + 0.3 * suave(progresso);
      if (Math.abs(zoom - estado.zoom) > 0.0004) {
        estado.zoom = zoom;
        estado.sujo = true;
        if (!fundo.webgl) parada.style.transform = `scale(${zoom.toFixed(4)})`;
      }
      estado.vel = reduzido ? 0 : clamp(velocidade);
      if (sentido) estado.dir = sentido;
    },

    quadro(dt) {
      estado.t += dt;

      // engasgo: cai em degraus, como vídeo
      if (estado.falhaResta > 0) {
        estado.falhaResta -= dt;
        const k = clamp(estado.falhaResta / estado.falhaDura);
        estado.falha = estado.falhaResta > 0 ? estado.falhaDe * Math.ceil(k * 4) / 4 : 0;
        estado.sujo = true;
      }

      // faixa de tracking: a cada tantos segundos sobe da base ao topo
      if (!reduzido) {
        if (estado.faixa < -0.5) {
          estado.faixaEspera -= dt;
          if (estado.faixaEspera <= 0) estado.faixa = -0.08;
        } else {
          estado.faixa += dt * 0.62;
          if (estado.faixa > 1.1) {
            estado.faixa = -1;
            estado.faixaEspera = 6 + Math.random() * 7;
          }
        }
      }

      if (!fundo.webgl) {
        if (faixaEl) {
          const visivel = estado.faixa > -0.5;
          faixaEl.style.opacity = visivel ? '1' : '0';
          if (visivel) faixaEl.style.transform = `translate3d(0, ${((1 - estado.faixa) * altura).toFixed(1)}px, 0)`;
        }
        tubo.classList.toggle('em-falha', estado.falha > 0);
        return;
      }

      // Em repouso a fita roda a 30 quadros por segundo (é o que uma fita tem);
      // rolando, acompanha a tela para o zoom não engasgar. Com movimento
      // reduzido só redesenha quando algo muda.
      const q = Math.floor(estado.t * 30);
      let desenha = estado.sujo;
      if (!reduzido) {
        if (q !== estado.quadroDesenhado) desenha = true;
        else if (estado.vel > 0.01 && amb.nivel !== 'baixo') desenha = true;
      }
      if (!desenha) return;
      estado.quadroDesenhado = q;
      estado.sujo = false;
      desenhar();
    },

    destruir() {
      if (observador) observador.disconnect();
      canvas.removeEventListener('webglcontextlost', aoPerder);
      canvas.removeEventListener('webglcontextrestored', aoVoltar);
      if (gl) {
        try {
          const perder = gl.getExtension('WEBGL_lose_context');
          if (perder) perder.loseContext();
        } catch { /* já se foi */ }
      }
      gl = null;
      recipiente.classList.remove('sem-vhs');
      tubo.remove();
    },
  };

  fundo.quadro(0);
  return fundo;
}
