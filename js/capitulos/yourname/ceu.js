// O céu em WebGL puro: um canvas, um quad, um programa.
//
//   const pintor = criarPintorWebGL(recipiente, amb)   → null se o aparelho não der conta
//   await pintor.pronto          true quando o shader compilou (false se falhou)
//   pintor.desenhar(estado)      estado vem de paleta.js (novoEstado + misturar + cometa)
//   pintor.redimensionar()       relê o tamanho do recipiente
//   pintor.baixar() → bool       desce um degrau de resolução (qualidade adaptativa)
//   pintor.destruir()            solta o contexto WebGL (o iPhone aceita poucos vivos)
//
// Sem three.js de propósito: é um shader só, e o mundo 3D da carta já tem o
// contexto dele.
//
// Nada aqui segura a thread principal esperando a GPU: o shader é mandado
// compilar e o estado só é lido quando a compilação terminou (com
// KHR_parallel_shader_compile, consultando COMPLETION_STATUS_KHR a cada quadro;
// sem ela, um quadro depois). O canvas só entra no recipiente pronto e
// desenhado; quem cria decide quando mostrá-lo (tempo.js faz a dissolvência).

import { quadro } from '../../nucleo/util.js';
import { VERTICE, fragmento } from './ceu-glsl.js';

const OITAVAS = { alto: 4, medio: 3, baixo: 2 };
const DETALHE = { alto: 2, medio: 1, baixo: 0 };
const DPR_MAX = { alto: 1.5, medio: 1.25, baixo: 1 };
const ESCALAS = [1, 0.8, 0.62];
const ESPERA_MAX = 240;           // quadros esperando a compilação antes de desistir

const UNIFORMES = [
  'uRes', 'uTempo', 'uHora', 'uRol', 'uC0', 'uC1', 'uC2', 'uC3', 'uLuz', 'uSombra', 'uBorda',
  'uSolCor', 'uSol', 'uLonge', 'uPerto', 'uNuvem', 'uEstrelas', 'uTerra',
  'uCometa', 'uCometaAB', 'uCometaO', 'uClarao',
];

export function criarPintorWebGL(recipiente, amb) {
  const tela = document.createElement('canvas');
  tela.className = 'yn-ceu-tela';
  tela.setAttribute('aria-hidden', 'true');

  const opcoes = {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'default',
  };
  let gl = null;
  try {
    gl = tela.getContext('webgl', opcoes) || tela.getContext('experimental-webgl', opcoes);
  } catch { gl = null; }
  if (!gl) return null;

  const nivel = OITAVAS[amb.nivel] ? amb.nivel : 'medio';
  const paralelo = gl.getExtension('KHR_parallel_shader_compile');
  let programa = null;
  let pendente = null;            // programa mandado compilar, ainda sem resposta
  let locais = {};
  let buffer = null;
  let perdido = false;
  let vivo = true;
  let escala = 0;
  let largura = 0;
  let altura = 0;
  let ultimo = null;
  let pintor = null;
  let geracao = 0;

  /** Manda compilar e ligar sem perguntar o resultado (isso é que bloqueia). */
  function mandarCompilar() {
    let fonte = fragmento({ oitavas: OITAVAS[nivel], detalhe: DETALHE[nivel] });
    // Aparelho sem highp no fragmento (raro): cai para mediump em vez de falhar.
    const alta = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (!alta || alta.precision === 0) fonte = fonte.replace('precision highp float;', 'precision mediump float;');

    const v = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(v, VERTICE);
    gl.compileShader(v);
    const f = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(f, fonte);
    gl.compileShader(f);
    const p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    return { p, v, f };
  }

  /** Espera a compilação sem bloquear; devolve true se o programa ficou bom. */
  async function esperarCompilar(alvo, g) {
    if (paralelo) {
      for (let i = 0; i < ESPERA_MAX; i++) {
        if (!vivo || g !== geracao || gl.isContextLost()) return false;
        if (gl.getProgramParameter(alvo.p, paralelo.COMPLETION_STATUS_KHR)) break;
        await quadro();
      }
    } else {
      await quadro();
    }
    if (!vivo || g !== geracao || gl.isContextLost()) return false;
    const ok = !!gl.getProgramParameter(alvo.p, gl.LINK_STATUS);
    gl.deleteShader(alvo.v);
    gl.deleteShader(alvo.f);
    if (!ok) { gl.deleteProgram(alvo.p); return false; }
    return true;
  }

  function ligar(p) {
    programa = p;
    gl.useProgram(programa);
    locais = {};
    for (const nome of UNIFORMES) locais[nome] = gl.getUniformLocation(programa, nome);

    // Um triângulo só que cobre a tela (sem a diagonal de dois triângulos).
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  async function preparar() {
    const g = ++geracao;
    programa = null;
    let alvo;
    try { alvo = mandarCompilar(); } catch { return false; }
    pendente = alvo;
    const ok = await esperarCompilar(alvo, g);
    pendente = null;
    if (!ok) return false;
    try { ligar(alvo.p); } catch { return false; }
    largura = 0; altura = 0;
    ajustar();
    return true;
  }

  const aoPerder = (evento) => { evento.preventDefault(); perdido = true; programa = null; };
  const aoVoltar = () => {
    preparar().then((ok) => { perdido = !ok; if (ok && ultimo) pintor?.desenhar(ultimo); });
  };
  tela.addEventListener('webglcontextlost', aoPerder);
  tela.addEventListener('webglcontextrestored', aoVoltar);

  function ajustar() {
    const cssL = recipiente.clientWidth || 1;
    const cssA = recipiente.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX[nivel]) * ESCALAS[escala];
    const l = Math.max(2, Math.round(cssL * dpr));
    const a = Math.max(2, Math.round(cssA * dpr));
    if (l === largura && a === altura) return;
    largura = l; altura = a;
    tela.width = l; tela.height = a;
    if (!perdido) gl.viewport(0, 0, l, a);
    // Mudar o tamanho limpa o canvas: redesenha já, para não piscar um quadro vazio.
    if (ultimo && pintor) pintor.desenhar(ultimo);
  }

  pintor = {
    tipo: 'webgl',
    tela,
    get aspecto() {
      const l = largura || recipiente.clientWidth || 1;
      const a = altura || recipiente.clientHeight || 1;
      return l / a;
    },
    pronto: null,

    redimensionar() { if (programa) ajustar(); },

    /** Desce um degrau de resolução. Devolve false quando já está no menor. */
    baixar() {
      if (escala >= ESCALAS.length - 1) return false;
      escala++;
      if (programa) ajustar();
      return true;
    },

    desenhar(e) {
      ultimo = e;
      if (perdido || !programa) return;
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
      gl.uniform1f(u.uEstrelas, e.estrelas * (1 + 0.45 * e.fim));
      gl.uniform1f(u.uTerra, e.terra);
      gl.uniform4f(u.uCometa, c.tronco[0], c.tronco[1], c.forca, c.sep);
      gl.uniform4f(u.uCometaAB, c.a[0], c.a[1], c.b[0], c.b[1]);
      gl.uniform4f(u.uCometaO, c.origem[0], c.origem[1], c.divisao[0], c.divisao[1]);
      gl.uniform1f(u.uClarao, e.clarao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    destruir() {
      vivo = false;
      geracao++;
      tela.removeEventListener('webglcontextlost', aoPerder);
      tela.removeEventListener('webglcontextrestored', aoVoltar);
      try {
        if (buffer) gl.deleteBuffer(buffer);
        if (programa) gl.deleteProgram(programa);
        if (pendente) gl.deleteProgram(pendente.p);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch { /* o contexto já pode ter ido embora */ }
      tela.remove();
      programa = null;
    },
  };

  // O canvas só entra no recipiente compilado e com o primeiro quadro pintado.
  pintor.pronto = preparar().then((ok) => {
    if (!ok || !vivo) return false;
    recipiente.append(tela);
    ajustar();
    if (ultimo) pintor.desenhar(ultimo);
    return true;
  }, () => false);
  return pintor;
}
