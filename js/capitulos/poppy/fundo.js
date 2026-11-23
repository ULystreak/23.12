/* ============================================================================
   POPPY / FUNDO: a fábrica vista por uma fita VHS
   ============================================================================
   Monta o tubo (div.poppy-tubo) dentro de api.fundo: a imagem parada embaixo
   (a do autor, conteudo.poppy.fundo, ou a fábrica desenhada por fabrica.js) e
   um canvas WebGL só, em resolução baixa de propósito, com o shader de fita:
   tracking, croma borrada, chuvisco, riscos, faixa de tracking, engasgo,
   vinheta e a luminária que pisca. Sem WebGL, um modo leve em CSS (a tela de
   espera, o chuvisco e a faixa).
   O shader compila sem travar a página: com KHR_parallel_shader_compile o
   programa fica pronto em segundo plano e a cena consulta a cada quadro.
   aquecerFundo() adianta contexto, programa e fábrica em passos ociosos, com
   a carta ainda parada: tudo junto custava ~350 ms de CPU no quadro da montagem.
   ========================================================================== */

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
uniform vec2 uRes;
uniform vec2 uCobrir;
uniform vec2 uFuga;
uniform float uT;
uniform float uQuadro;
uniform float uVel;
uniform float uDir;
uniform float uZoom;
uniform float uAzul;
uniform float uClarao;
uniform float uFalha;
uniform float uFaixa;
uniform float uVivo;

const mat3 PARA_YIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
const mat3 PARA_RGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);

float h21(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float n1(float x) {
  float i = floor(x);
  float f = fract(x);
  return mix(h21(vec2(i, 1.7)), h21(vec2(i + 1.0, 1.7)), f * f * (3.0 - 2.0 * f));
}

// A imagem em modo capa, com o zoom puxando para o ponto de fuga.
vec3 amostra(vec2 uv) {
  vec2 c = (uv - 0.5) * uCobrir + 0.5;
  c = uFuga + (c - uFuga) / uZoom;
  return texture2D(uTex, c).rgb;
}

void main() {
  vec2 uv = vUv;
  float linha = floor(uv.y * uRes.y);
  float px = 1.0 / uRes.x;
  float hl = h21(vec2(linha, uQuadro));
  float cab = smoothstep(0.062, 0.0, uv.y);
  float faixa = smoothstep(0.075, 0.0, abs(uv.y - uFaixa));
  float bx = h21(vec2(floor(uv.y * 36.0), uQuadro + 0.5));
  float barra = smoothstep(0.6, 0.9, bx + uVel * 0.5) * uVel;
  float hb = h21(vec2(floor(linha / 14.0), uQuadro + 3.0));

  // Tremor fino por linha, onda lenta, avanço de fita, faixa, engasgo e cabeça.
  uv.x += (hl - 0.5) * 0.0024 * uVivo;
  uv.x += sin(uv.y * 7.0 + uT * 1.7) * 0.0009 * uVivo;
  uv.x += barra * (0.018 + 0.06 * hl) * uDir;
  uv.x += faixa * (hl - 0.35) * 0.075;
  uv.x += uFalha * step(0.5, hb) * (hl - 0.5) * 0.32;
  uv.x += cab * (0.012 + 0.05 * cab + 0.022 * hl * (0.3 + 0.7 * uVivo));
  // Câmera na mão
  uv += vec2(sin(uT * 0.43), cos(uT * 0.31)) * 0.003 * uVivo;

  // A cor vaza para a direita: luma quase nítida, croma borrada.
  float vaz = (1.7 + 6.0 * uVel + 9.0 * uFalha + 4.0 * faixa) * px;
  vec3 c0 = amostra(uv);
  vec3 c1 = amostra(uv - vec2(vaz, 0.0));
  vec3 c2 = amostra(uv - vec2(2.3 * vaz, 0.0));
  vec3 c3 = amostra(uv + vec2(0.8 * vaz, 0.0));
  float y = (PARA_YIQ * (0.6 * c0 + 0.22 * c1 + 0.18 * c3)).x;
  vec3 iq = PARA_YIQ * ((c0 + 1.2 * c1 + 1.1 * c2 + 0.5 * c3) / 3.8);
  vec3 cor = PARA_RGB * vec3(y, iq.y, iq.z);

  // A tela de espera (o petróleo do capítulo) e o clarão azul da fita entrando.
  vec3 espera = vec3(0.051, 0.145, 0.204) * (0.9 + 0.1 * sin(vUv.y * 3.1 + 0.6));
  cor = mix(cor, espera, uAzul);
  cor = mix(cor, vec3(0.08, 0.12, 0.72), uClarao);

  float forca = (0.075 + 0.13 * uVel + 0.45 * uFalha + 0.38 * faixa + 0.32 * cab) * (0.3 + 0.7 * uVivo);
  float ruido = h21(gl_FragCoord.xy * 0.731 + vec2(mod(uQuadro, 97.0) * 7.13, mod(uQuadro, 89.0) * 3.71)) - 0.5;
  cor += ruido * forca;

  float limite = 0.9996 - 0.02 * uVel - 0.1 * faixa - 0.08 * uFalha - 0.03 * cab;
  float risco = h21(vec2(floor(gl_FragCoord.x / 18.0) + mod(uQuadro, 113.0) * 5.0, linha));
  cor = mix(cor, vec3(0.92), step(limite, risco) * 0.75);

  vec2 d = (vUv - 0.5) * vec2(1.0, 1.12);
  cor *= 1.0 - smoothstep(0.36, 0.95, length(d)) * 0.46;
  cor *= 1.0 - 0.07 * step(0.86, n1(uT * 5.0)) * uVivo * (1.0 - uAzul);
  cor = cor * 0.93 + vec3(0.012, 0.02, 0.03);
  gl_FragColor = vec4(clamp(cor, 0.0, 1.0), 1.0);
}`;

const OPCOES_GL = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: 'low-power',
};

const UNIFORMES = ['uTex', 'uRes', 'uCobrir', 'uFuga', 'uT', 'uQuadro', 'uVel', 'uDir', 'uZoom', 'uAzul', 'uClarao', 'uFalha', 'uFaixa', 'uVivo'];

let reserva = null;
let fabricaGuardada = null;
let chuviscoGuardado = null;

// A fábrica é sempre a mesma imagem (semente fixa): desenhada uma vez por página, também para a releitura.
const fabrica = () => (fabricaGuardada ||= desenharFabrica());

// Ruído cinza de 96 × 96 para o chuvisco do modo leve, gerado uma vez.
function chuviscoUrl() {
  if (chuviscoGuardado !== null) return chuviscoGuardado;
  chuviscoGuardado = '';
  try {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 96;
    const g = c.getContext('2d');
    const img = g.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    chuviscoGuardado = c.toDataURL('image/png');
  } catch {
    /* sem canvas: o chuvisco fica liso */
  }
  return chuviscoGuardado;
}

function compilarEm(gl, tipo, codigo) {
  const sombreador = gl.createShader(tipo);
  gl.shaderSource(sombreador, codigo);
  gl.compileShader(sombreador);
  return sombreador;
}

// Cria, anexa e liga, sem perguntar o resultado: perguntar trava até o compilador terminar.
function mandarCompilar(gl) {
  const programa = gl.createProgram();
  gl.attachShader(programa, compilarEm(gl, gl.VERTEX_SHADER, VERTICE));
  gl.attachShader(programa, compilarEm(gl, gl.FRAGMENT_SHADER, FRAGMENTO));
  gl.linkProgram(programa);
  return programa;
}

function abrirGl(canvas) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl', OPCOES_GL);
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const paralelo = gl.getExtension('KHR_parallel_shader_compile');
  return { gl, paralelo, programa: mandarCompilar(gl) };
}

function ocioso(fn, ms = 1500) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: ms });
  else setTimeout(fn, 200);
}

// Confere o programa, liga o triângulo que cobre a tela e sobe a textura. Devolve os uniformes.
function prepararPrograma(gl, programa, fonte) {
  if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(programa) || 'o programa da fita não ligou');
  }
  gl.useProgram(programa);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(programa, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, fonte);
  const u = {};
  for (const nome of UNIFORMES) u[nome] = gl.getUniformLocation(programa, nome);
  gl.uniform1i(u.uTex, 0);
  // O GL tem y para cima; o canvas da fábrica, para baixo.
  gl.uniform2f(u.uFuga, FUGA.x, 1 - FUGA.y);
  return u;
}

function perderContexto(gl) {
  try {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    /* já perdido */
  }
}

/** Adianta a fábrica, o contexto e o programa em passos ociosos. Idempotente. */
export function aquecerFundo() {
  if (reserva) return;
  const r = (reserva = { falhou: false, fabrica: null, canvas: null, gl: null, paralelo: null, programa: null, unif: null });
  const passo = (fn) => ocioso(() => {
    if (reserva !== r || r.falhou) return;
    try {
      fn();
    } catch (erro) {
      r.falhou = true;
      console.warn('[carta] o aquecimento da fita falhou', erro);
    }
  });
  passo(() => {
    r.fabrica = fabrica();
    passo(() => {
      r.canvas = document.createElement('canvas');
      const aberto = abrirGl(r.canvas);
      if (!aberto) {
        r.falhou = true;
        return;
      }
      Object.assign(r, aberto);
      let tentativas = 0;
      const esperar = () => passo(() => {
        const pronto = !r.paralelo || r.gl.getProgramParameter(r.programa, r.paralelo.COMPLETION_STATUS_KHR);
        if (!pronto && ++tentativas < 40) {
          esperar();
          return;
        }
        r.unif = prepararPrograma(r.gl, r.programa, r.fabrica);
      });
      esperar();
    });
  });
}

// Pega o que o aquecimento deixou e para os passos que faltam. Com a imagem do
// autor a reserva não serve: o contexto é devolvido, para não ficar vivo sem dono.
function tomarReserva(serve = true) {
  const r = reserva;
  reserva = null;
  if (!r) return null;
  if (serve && !r.falhou) return r;
  perderContexto(r.gl);
  return null;
}

export function criarFundo({ recipiente, amb, imagem = null }) {
  const reduzido = !!amb?.reduzido;
  const r = tomarReserva(!imagem);
  const fonte = imagem || r?.fabrica || fabrica();

  const tubo = el('div', 'poppy-tubo');
  let parada;
  if (imagem) {
    parada = new Image();
    parada.alt = '';
    parada.decoding = 'async';
    parada.draggable = false;
    parada.src = imagem.src;
  } else {
    parada = fonte;
  }
  parada.classList.add('poppy-parada');
  parada.style.transformOrigin = `${FUGA.x * 100}% ${FUGA.y * 100}%`;
  parada.style.objectPosition = `${FUGA.x * 100}% ${FUGA.y * 100}%`;
  parada.style.transform = '';
  const canvas = r?.canvas || document.createElement('canvas');
  canvas.className = 'poppy-vhs';
  canvas.setAttribute('aria-hidden', 'true');
  tubo.append(parada, canvas);
  recipiente.append(tubo);

  const estado = {
    azul: 1, falha: 0, faixa: -1, faixaEspera: 5 + Math.random() * 4,
    zoom: 1, vel: 0, dir: 1, t: Math.random() * 40, clarao: 0,
  };
  let falhaDe = 0;
  let falhaDura = 0;
  let falhaResta = 0;
  let quadroDesenhado = -1;
  let sujo = true;
  let gl = null;
  let programa = null;
  let paralelo = null;
  let u = null;
  let pronto = false;
  let perdido = false;
  let desistiu = false;
  let quadrosEsperando = 0;
  let largura = 0;
  let altura = 0;
  let azulEl = null;
  let faixaEl = null;
  let chuviscoEl = null;

  const vale = () => !!gl && pronto && !perdido;

  function iniciarGl() {
    if (amb?.webgl === false) return false;
    if (r?.gl && !r.gl.isContextLost()) {
      ({ gl, programa, paralelo } = r);
      if (r.unif) {
        u = r.unif;
        pronto = true;
      }
      return true;
    }
    const aberto = abrirGl(canvas);
    if (!aberto) return false;
    ({ gl, programa, paralelo } = aberto);
    return true;
  }

  function compilou() {
    if (paralelo) return !!gl.getProgramParameter(programa, paralelo.COMPLETION_STATUS_KHR);
    return ++quadrosEsperando > 3;
  }

  function montarLeve() {
    if (azulEl) return;
    chuviscoEl = el('div', { class: 'poppy-leve-chuvisco', 'aria-hidden': 'true' });
    const ruido = chuviscoUrl();
    if (ruido) chuviscoEl.style.backgroundImage = `url("${ruido}")`;
    faixaEl = el('div', { class: 'poppy-leve-faixa', 'aria-hidden': 'true' });
    azulEl = el('div', { class: 'poppy-leve-azul', 'aria-hidden': 'true' });
    faixaEl.style.opacity = '0';
    azulEl.style.opacity = String(estado.azul);
    tubo.append(chuviscoEl, faixaEl, azulEl);
    parada.style.transform = `scale(${estado.zoom.toFixed(4)})`;
  }

  function desmontarLeve() {
    for (const n of [chuviscoEl, faixaEl, azulEl]) n?.remove();
    chuviscoEl = null;
    faixaEl = null;
    azulEl = null;
    tubo.classList.remove('em-falha');
    parada.style.transform = '';
  }

  // A imagem parada some quando o WebGL vale, ou quando ele ainda compila e a
  // tela de espera domina (o fundo do recipiente já é a cor da espera).
  function atualizarCamadas() {
    const esperando = !!gl && !pronto && !perdido && !desistiu;
    parada.style.visibility = vale() || (esperando && estado.azul > 0.5) ? 'hidden' : '';
    canvas.style.visibility = vale() ? '' : 'hidden';
  }

  // O tamanho do canvas é fixado cedo: trocar realoca o buffer, e isso caía
  // num quadro do desenrolar. medir(true) reaproveita a última medida.
  function medir(reaproveitar = false, medida = null) {
    if (medida) {
      largura = medida.width;
      altura = medida.height;
    } else if (!reaproveitar || !largura) {
      largura = recipiente.clientWidth;
      altura = recipiente.clientHeight;
    }
    if (!gl || perdido || !largura || !altura) return;
    const linhas = amb?.nivel === 'baixo' ? 400 : amb?.nivel === 'medio' ? 500 : 580;
    const escala = Math.min(linhas / altura, Math.min(window.devicePixelRatio || 1, 1.5));
    const w = Math.max(2, Math.round(largura * escala));
    const h = Math.max(2, Math.round(altura * escala));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (!pronto || !u) return;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u.uRes, w, h);
    const tela = largura / altura;
    const img = (fonte.naturalWidth || fonte.width || 1) / (fonte.naturalHeight || fonte.height || 1);
    if (tela > img) gl.uniform2f(u.uCobrir, 1, img / tela);
    else gl.uniform2f(u.uCobrir, tela / img, 1);
    sujo = true;
  }

  function concluirGl() {
    u = prepararPrograma(gl, programa, fonte);
    pronto = true;
    medir(true);
    atualizarCamadas();
  }

  // A camada leve entra antes de o WebGL sair: a tela nunca fica vazia.
  function desistirDoGl() {
    desistiu = true;
    montarLeve();
    recipiente.classList.add('sem-vhs');
    canvas.removeEventListener('webglcontextlost', aoPerder);
    canvas.removeEventListener('webglcontextrestored', aoVoltar);
    perderContexto(gl);
    gl = null;
    pronto = false;
    canvas.remove();
    atualizarCamadas();
  }

  function aoPerder(e) {
    e.preventDefault();
    perdido = true;
    montarLeve();
    recipiente.classList.add('sem-vhs');
    atualizarCamadas();
  }

  function aoVoltar() {
    perdido = false;
    try {
      programa = mandarCompilar(gl);
      pronto = false;
      concluirGl();
      desmontarLeve();
      recipiente.classList.remove('sem-vhs');
      sujo = true;
    } catch (erro) {
      console.warn('[carta] a fita não voltou depois de perder o contexto', erro);
      desistirDoGl();
    }
    atualizarCamadas();
  }

  function andarFaixa(dt) {
    if (estado.faixa < -0.5) {
      estado.faixaEspera -= dt;
      if (estado.faixaEspera <= 0) estado.faixa = -0.08;
      return;
    }
    estado.faixa += dt * 0.62;
    if (estado.faixa > 1.1) {
      estado.faixa = -1;
      estado.faixaEspera = 6 + Math.random() * 7;
    }
  }

  function desenhar() {
    gl.uniform1f(u.uT, estado.t % 600);
    gl.uniform1f(u.uQuadro, reduzido ? 7 : Math.floor(estado.t * 30) % 997);
    gl.uniform1f(u.uVel, estado.vel);
    gl.uniform1f(u.uDir, estado.dir);
    gl.uniform1f(u.uZoom, estado.zoom);
    gl.uniform1f(u.uAzul, estado.azul);
    gl.uniform1f(u.uClarao, estado.clarao > 0 ? 1 : 0);
    gl.uniform1f(u.uFalha, estado.falha);
    gl.uniform1f(u.uFaixa, estado.faixa);
    gl.uniform1f(u.uVivo, reduzido ? 0 : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    sujo = false;
  }

  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver((entradas) => {
      const caixa = entradas[0]?.contentRect;
      medir(false, caixa && caixa.width && caixa.height ? caixa : null);
    })
    : null;
  ro?.observe(recipiente);

  const fundo = {
    el: tubo,
    get webgl() { return vale(); },
    get faixa() { return estado.faixa; },
    get nivelFalha() { return estado.falha; },

    // 1 é a tela de espera; 0 é a fita.
    azul(v) {
      estado.azul = clamp(Number(v) || 0);
      sujo = true;
      if (azulEl) azulEl.style.opacity = String(estado.azul);
      atualizarCamadas();
    },

    clarao(ms = 50) {
      if (reduzido) return;
      estado.clarao = Math.max(estado.clarao, ms / 1000);
      sujo = true;
      azulEl?.classList.add('clarao');
    },

    falha(forca = 1, ms = 140) {
      if (reduzido) return;
      falhaDe = Math.max(0, forca);
      falhaDura = Math.max(40, ms) / 1000;
      falhaResta = falhaDura;
      estado.falha = falhaDe;
      sujo = true;
      if (azulEl) tubo.classList.add('em-falha');
    },

    rolar(progresso, velocidade = 0, sentido = 1) {
      const zoom = reduzido ? 1.04 : 1 + 0.3 * suave(progresso);
      if (Math.abs(zoom - estado.zoom) > 0.0004) {
        estado.zoom = zoom;
        sujo = true;
        if (!vale()) parada.style.transform = `scale(${zoom.toFixed(4)})`;
      }
      estado.vel = reduzido ? 0 : clamp(velocidade);
      estado.dir = sentido < 0 ? -1 : 1;
    },

    quadro(dt) {
      estado.t += dt;
      if (gl && !pronto && !perdido && !desistiu && compilou()) {
        try {
          concluirGl();
        } catch (erro) {
          console.warn('[carta] a fita ficou sem WebGL', erro);
          desistirDoGl();
        }
      }
      if (estado.clarao > 0) {
        estado.clarao = Math.max(0, estado.clarao - dt);
        sujo = true;
        if (estado.clarao === 0) azulEl?.classList.remove('clarao');
      }
      if (falhaResta > 0) {
        // O engasgo decai em degraus de quarto.
        falhaResta = Math.max(0, falhaResta - dt);
        const nova = falhaDura ? (falhaDe * Math.ceil((falhaResta / falhaDura) * 4)) / 4 : 0;
        if (nova !== estado.falha) {
          estado.falha = nova;
          sujo = true;
        }
      }
      if (!reduzido) andarFaixa(dt);
      if (azulEl) {
        const passando = estado.faixa > -0.5;
        faixaEl.style.opacity = passando ? '1' : '0';
        if (passando) faixaEl.style.transform = `translate3d(0, ${((1 - estado.faixa) * altura).toFixed(1)}px, 0)`;
        tubo.classList.toggle('em-falha', estado.falha > 0);
      }
      if (!vale()) return;
      // Em repouso, 30 quadros por segundo, como fita; rolando, todo quadro (menos no nível baixo).
      const quadroDaFita = Math.floor(estado.t * 30);
      const redesenhar = reduzido
        ? sujo
        : sujo || quadroDaFita !== quadroDesenhado || (estado.vel > 0.01 && amb?.nivel !== 'baixo');
      if (!redesenhar) return;
      quadroDesenhado = quadroDaFita;
      desenhar();
    },

    destruir() {
      ro?.disconnect();
      canvas.removeEventListener('webglcontextlost', aoPerder);
      canvas.removeEventListener('webglcontextrestored', aoVoltar);
      perderContexto(gl);
      gl = null;
      recipiente.classList.remove('sem-vhs');
      tubo.remove();
    },
  };

  if (iniciarGl()) {
    canvas.addEventListener('webglcontextlost', aoPerder);
    canvas.addEventListener('webglcontextrestored', aoVoltar);
  } else {
    canvas.remove();
    recipiente.classList.add('sem-vhs');
    montarLeve();
  }
  medir();
  atualizarCamadas();
  fundo.quadro(0);
  return fundo;
}
