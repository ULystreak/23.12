/* ============================================================================
   CÉU (WebGL): o pintor do céu em WebGL puro
   ============================================================================
   Um canvas, um triângulo que cobre a tela e um programa, sem three.js de
   propósito: é um shader só, e o mundo 3D da carta já tem o contexto dele.

   Nada aqui segura a thread principal esperando a GPU: o shader é compilado
   com KHR_parallel_shader_compile quando existe (senão, espera um quadro), o
   resultado só é lido depois, e o canvas só entra no recipiente pronto, com
   opacidade 0 e já desenhado. Quem decide a dissolvência é tempo.js.

   pintor = { tipo: 'webgl', tela, aspecto, pronto, redimensionar(), baixar(),
   desenhar(estado), destruir() }. Sem contexto WebGL, criarPintorWebGL
   devolve null e não cria nada.
   ========================================================================== */

import { quadro } from '../../nucleo/util.js';
import { VERTICE, fragmento } from './ceu-glsl.js';

const OITAVAS = { alto: 4, medio: 3, baixo: 2 };
const DETALHE = { alto: 2, medio: 1, baixo: 0 };
// Teto do DPR do céu em WebGL. Não é o DPR_POR_NIVEL de ambiente.js (2, 1,5 e
// 1), que vale para o céu leve: mexer num pede olhar o outro.
const DPR_MAX = { alto: 1.5, medio: 1.25, baixo: 1 };
// Degraus de resolução da qualidade adaptativa (tempo.js pede o próximo).
const ESCALAS = [1, 0.8, 0.62];
// Quadros de espera pela compilação paralela (~4 s).
const ESPERA_MAX = 240;
// Os nomes têm de bater com ceu-glsl.js: um nome errado vira localização null
// e o gl.uniform* é ignorado em silêncio.
const UNIFORMES = [
  'uRes', 'uTempo', 'uHora', 'uRol', 'uC0', 'uC1', 'uC2', 'uC3', 'uLuz', 'uSombra', 'uBorda',
  'uSolCor', 'uSol', 'uLonge', 'uPerto', 'uNuvem', 'uEstrelas', 'uTerra', 'uCometa', 'uCometaAB',
  'uCometaO', 'uClarao',
];
const OPCOES = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: 'default',
};

export function criarPintorWebGL(recipiente, amb) {
  const tela = document.createElement('canvas');
  tela.className = 'yn-ceu-tela';
  tela.setAttribute('aria-hidden', 'true');

  // Um getContext por canvas: o primeiro contexto pedido vence.
  let gl = null;
  try {
    gl = tela.getContext('webgl', OPCOES) || tela.getContext('experimental-webgl', OPCOES);
  } catch {
    gl = null;
  }
  if (!gl) return null;

  const paralelo = gl.getExtension('KHR_parallel_shader_compile');
  const nivel = amb?.nivel in OITAVAS ? amb.nivel : 'medio';

  let programa = null;
  let pendente = null;
  let locais = {};
  let buffer = null;
  let perdido = false;
  let vivo = true;
  let escala = 0;
  let largura = 0;
  let altura = 0;
  let ultimo = null;
  let geracao = 0;

  function mandarCompilar() {
    let fonte = fragmento({ oitavas: OITAVAS[nivel], detalhe: DETALHE[nivel] });
    const alta = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (!alta || alta.precision === 0) fonte = fonte.replace('precision highp float', 'precision mediump float');
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, VERTICE);
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fonte);
    gl.compileShader(fs);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    // Sem perguntar o resultado aqui: perguntar agora faria a thread esperar a GPU.
    gl.linkProgram(p);
    return { p, vs, fs };
  }

  async function esperarCompilar(alvo, g) {
    if (paralelo) {
      for (let i = 0; i < ESPERA_MAX; i++) {
        if (gl.getProgramParameter(alvo.p, paralelo.COMPLETION_STATUS_KHR)) break;
        await quadro();
        if (!vivo || perdido || g !== geracao) return false;
      }
    } else {
      await quadro();
    }
    if (!vivo || perdido || g !== geracao || gl.isContextLost()) return false;
    const ok = gl.getProgramParameter(alvo.p, gl.LINK_STATUS);
    if (!ok) console.warn('[carta] o céu em WebGL não compilou', gl.getShaderInfoLog(alvo.fs) || gl.getProgramInfoLog(alvo.p));
    gl.deleteShader(alvo.vs);
    gl.deleteShader(alvo.fs);
    if (!ok) gl.deleteProgram(alvo.p);
    return !!ok;
  }

  function ligar(p) {
    programa = p;
    gl.useProgram(p);
    locais = {};
    for (const nome of UNIFORMES) locais[nome] = gl.getUniformLocation(p, nome);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // Um triângulo que cobre a tela inteira.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, tela.width, tela.height);
  }

  async function preparar() {
    const g = ++geracao;
    if (gl.isContextLost()) return false;
    const alvo = mandarCompilar();
    pendente = alvo;
    const ok = await esperarCompilar(alvo, g);
    if (pendente === alvo) pendente = null;
    if (!ok || g !== geracao) return false;
    ligar(alvo.p);
    return true;
  }

  function ajustar() {
    const cssL = recipiente.clientWidth || innerWidth;
    const cssA = recipiente.clientHeight || innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX[nivel]) * ESCALAS[escala];
    const l = Math.max(2, Math.round(cssL * dpr));
    const a = Math.max(2, Math.round(cssA * dpr));
    if (l === largura && a === altura) return;
    largura = l;
    altura = a;
    tela.width = l;
    tela.height = a;
    if (perdido || !programa) return;
    gl.viewport(0, 0, l, a);
    // Mudar o tamanho limpa o canvas: redesenha já, para não piscar um quadro vazio.
    if (ultimo) desenhar(ultimo);
  }

  function desenhar(e) {
    ultimo = e;
    if (!programa || perdido) return;
    const u = locais;
    const c = e.cometa;
    gl.uniform2f(u.uRes, largura, altura);
    gl.uniform1f(u.uTempo, e.tempo);
    gl.uniform1f(u.uHora, e.hora);
    gl.uniform1f(u.uRol, e.rol);
    gl.uniform3fv(u.uC0, e.c0);
    gl.uniform3fv(u.uC1, e.c1);
    gl.uniform3fv(u.uC2, e.c2);
    gl.uniform3fv(u.uC3, e.c3);
    gl.uniform3fv(u.uLuz, e.luz);
    gl.uniform3fv(u.uSombra, e.sombra);
    gl.uniform3fv(u.uBorda, e.borda);
    gl.uniform3fv(u.uSolCor, e.sol);
    gl.uniform3f(u.uSol, e.solX, e.solY, e.solForca);
    gl.uniform3fv(u.uLonge, e.longe);
    gl.uniform3fv(u.uPerto, e.perto);
    gl.uniform2f(u.uNuvem, e.cobertura, e.estica);
    // A noite que se fecha ao guardar a carta acende mais as estrelas.
    gl.uniform1f(u.uEstrelas, e.estrelas * (1 + 0.45 * e.fim));
    gl.uniform1f(u.uTerra, e.terra);
    gl.uniform4f(u.uCometa, c.tronco[0], c.tronco[1], c.forca, c.sep);
    gl.uniform4f(u.uCometaAB, c.a[0], c.a[1], c.b[0], c.b[1]);
    gl.uniform4f(u.uCometaO, c.origem[0], c.origem[1], c.divisao[0], c.divisao[1]);
    gl.uniform1f(u.uClarao, e.clarao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function aoPerder(evento) {
    evento.preventDefault();
    perdido = true;
    programa = null;
    buffer = null;
  }

  async function aoVoltar() {
    perdido = false;
    if (!(await preparar()) || !vivo) return;
    gl.viewport(0, 0, largura, altura);
    if (ultimo) desenhar(ultimo);
  }

  tela.addEventListener('webglcontextlost', aoPerder);
  tela.addEventListener('webglcontextrestored', aoVoltar);
  ajustar();

  const pronto = preparar()
    .then((ok) => {
      if (!ok || !vivo) return false;
      tela.style.opacity = '0';
      recipiente.append(tela);
      ajustar();
      if (ultimo) desenhar(ultimo);
      return true;
    })
    .catch(() => false);

  function destruir() {
    if (!vivo) return;
    vivo = false;
    geracao += 1;
    tela.removeEventListener('webglcontextlost', aoPerder);
    tela.removeEventListener('webglcontextrestored', aoVoltar);
    if (!gl.isContextLost()) {
      if (buffer) gl.deleteBuffer(buffer);
      if (programa) gl.deleteProgram(programa);
      if (pendente) gl.deleteProgram(pendente.p);
    }
    buffer = null;
    programa = null;
    pendente = null;
    // O iPhone aceita poucos contextos vivos: este volta já.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    tela.remove();
  }

  return {
    tipo: 'webgl',
    tela,
    get aspecto() {
      return largura / altura;
    },
    pronto,
    redimensionar: ajustar,
    baixar() {
      if (escala >= ESCALAS.length - 1) return false;
      escala += 1;
      ajustar();
      return true;
    },
    desenhar,
    destruir,
  };
}
