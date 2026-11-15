// Segredos: os vídeos dos amigos (e dele), entre o capítulo do filme e a mão.
//
//   cenaSegredos(ctx, { frio }) → Promise   resolve quando ela segue adiante
//
// O pergaminho do filme enrola e a segunda carta vai embora (voltarAoMundo); o
// mundo da alameda volta, a frase surge palavra por palavra e os bilhetes
// (envelopinhos amarrados com o fio vermelho, "Segredo N" escrito à mão) nascem
// da névoa um a um e flutuam. No toque: o fio desamarra, a aba abre, a carta de
// dentro sobe e se abre até virar a moldura do vídeo; a alameda escurece e
// desfoca, a música abaixa até quase sumir e o vídeo toca com som. Quando acaba
// (ou ela fecha), a moldura volta a ser a carta, a carta volta ao envelope e o
// NOME de quem gravou é escrito à mão no bilhete, letra por letra; a música
// volta. Visto todos, o botão de seguir aparece.
//
// Etapas: enrolando → frase → escolhendo → assistindo → escolhendo → … (o diretor
// pula a cena inteira quando nenhum item do content.js tem vídeo).
// Ganchos de teste (não mudar): [data-acao="segredo"] (cada bilhete, com
// data-estado="fechado|aberto|falhou"), [data-acao="fechar-segredo"],
// [data-acao="continuar-segredos"].
//
// Tudo aqui é DOM por cima do mundo: com ou sem WebGL a cena é a mesma.

import { el, espera, svg, clamp, lerp, semente, pxParaNdc } from '../nucleo/util.js';
import { curvas, revelarPalavras, ocultarPalavras } from '../nucleo/movimento.js';
import { voltarAoMundo } from '../nucleo/diretor.js';

const PROPORCAO = 110 / 160;        // altura/largura do envelope (= viewBox)
const ASPECTO_PADRAO = 9 / 16;      // antes de saber o tamanho do vídeo: celular em pé
const SUBIDA_CARTA = 0.3;           // quanto da carta fica para fora do envelope aberto (× altura)
const ABAFAR = 0.04;                // a música durante o vídeo (fração do volume)

// ============================================================================
// Desenhos (SVG à mão, no espaço do envelope: 160 × 110)
// ============================================================================

const CORPO = `
  <svg class="bilhete-corpo-svg" viewBox="0 0 160 110" aria-hidden="true" focusable="false">
    <rect x="0.5" y="0.5" width="159" height="109" rx="1.6" class="env-papel"/>
    <path d="M1 109 L67 57 M159 109 L93 57" class="env-dobra"/>
    <path d="M1 109 L67 57 Q80 49 93 57 L159 109" class="env-dobra-sombra"/>
  </svg>`;

const ABA = `
  <svg class="bilhete-aba-svg" viewBox="0 0 160 70" aria-hidden="true" focusable="false">
    <path d="M0.5 0.5 H159.5 L86 62 Q80 67 74 62 Z" class="env-aba"/>
  </svg>`;

// O fio: duas voltas em cruz e um laço. Cada pedaço começa no nó, para o desamarrar
// recolher do nó para fora. A sombra é o mesmo desenho, mais escuro e deslocado.
const FIO_PEDACOS = [
  ['h1', 'M40 38 L0 38'],
  ['h2', 'M40 38 L160 38'],
  ['v1', 'M40 38 L40 0'],
  ['v2', 'M40 38 L40 110'],
  ['l1', 'M40 38 C30 25 14 24 15 33 C16 41 31 41 40 38'],
  ['l2', 'M40 38 C50 25 68 23 67 33 C66 42 50 41 40 38'],
  ['p1', 'M40 38 C37 47 33 56 26 64'],
  ['p2', 'M40 38 C44 49 51 57 60 62'],
];
const FIO = `
  <svg class="bilhete-fio" viewBox="0 0 160 110" aria-hidden="true" focusable="false" overflow="visible">
    <g class="fio-sombra" transform="translate(0.4 1.1)">
      ${FIO_PEDACOS.map(([, d]) => `<path d="${d}" pathLength="1"/>`).join('')}
    </g>
    <g class="fio-linha">
      ${FIO_PEDACOS.map(([n, d]) => `<path data-p="${n}" d="${d}" pathLength="1"/>`).join('')}
    </g>
    <circle class="fio-no" cx="40" cy="38" r="2.7"/>
  </svg>`;

// Linhas de uma carta escrita, na parte de dentro (só aparecem quando ela sai do envelope).
const CARTA = `
  <svg class="bilhete-carta-svg" viewBox="0 0 140 96" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d="M14 16 C40 14 70 17 104 15 M14 26 C44 25 78 27 120 25 M14 36 C38 35 60 37 92 35" />
  </svg>`;

// "Ver de novo": um laço de fio que volta (um triângulo desenhado, não um glifo).
const REVER = `
  <svg class="bilhete-rever" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M9.2 7.4 L17 12 L9.2 16.6 Q8.4 17 8.4 16 V8 Q8.4 7 9.2 7.4 Z"/>
  </svg>`;

const X_FECHAR = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M7 7.4 C10 10.2 13.6 13.8 17 16.8 M16.8 7.2 C13.8 10.4 10.4 13.6 7.2 17"/>
  </svg>`;

const PAUSA = `
  <svg class="segredo-pausa" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path d="M18.5 14.5 C18.2 21 18.6 27 18.4 33.5 M29.5 14.5 C29.8 21 29.4 27 29.6 33.5"/>
  </svg>`;

const TOCAR = `
  <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path d="M18 14.2 L35 24 L18 33.8 Q16.6 34.6 16.6 33 V15 Q16.6 13.4 18 14.2 Z"/>
  </svg>`;

const PROGRESSO = `
  <svg class="segredo-progresso" viewBox="0 0 200 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path class="segredo-progresso-trilho" d="M1 4.4 C40 3.2 72 5.4 110 4.2 S170 3.4 199 4.4" pathLength="1"/>
    <path class="segredo-progresso-fio" d="M1 4.4 C40 3.2 72 5.4 110 4.2 S170 3.4 199 4.4" pathLength="1"/>
  </svg>`;

const SUBLINHADO = `
  <svg class="segredos-botao-linha" viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d="M2 5.6C20 3.8 34 7.2 50 5.4S80 3.4 94 5.6C104 7 111 5.2 118 4.4" pathLength="1"/>
  </svg>`;

// ============================================================================
// Escrita à mão: cada letra é descoberta da esquerda para a direita, como a
// ponta da caneta passando. Leve: só clip-path e opacidade em spans.
// ============================================================================

function montarLetras(caixa, texto) {
  caixa.textContent = '';
  // Um invólucro só: dentro de um flex, os espaços soltos entre as palavras sumiriam.
  const alvo = el('span', 'seg-linha');
  caixa.append(alvo);
  const letras = [];
  const palavras = String(texto || '').split(/(\s+)/);
  for (const pedaco of palavras) {
    if (!pedaco) continue;
    if (/^\s+$/.test(pedaco)) {
      alvo.append(document.createTextNode(' '));
      continue;
    }
    const palavra = el('span', 'seg-palavra');
    for (const ch of Array.from(pedaco)) {
      const letra = el('span', { class: 'seg-letra', texto: ch });
      palavra.append(letra);
      letras.push(letra);
    }
    alvo.append(palavra);
  }
  return letras;
}

/** Diminui a letra até o texto caber na caixa (no máximo duas linhas). */
function caber(alvo, base) {
  let tamanho = base;
  alvo.style.fontSize = `${tamanho}px`;
  for (let i = 0; i < 8; i++) {
    const largo = alvo.scrollWidth > alvo.clientWidth + 1;
    const alto = alvo.scrollHeight > alvo.clientHeight + 1;
    if (!largo && !alto) break;
    tamanho *= 0.88;
    alvo.style.fontSize = `${tamanho.toFixed(2)}px`;
  }
}

function escrever(gsap, alvo, texto, { calmo, som, intensidade = 0.6 } = {}) {
  const letras = montarLetras(alvo, texto);
  if (!letras.length) return Promise.resolve();
  const passo = clamp(1.6 / letras.length, 0.045, 0.085);
  if (som) som.efeito('caneta', { duracao: Math.min(2.4, letras.length * passo + 0.2), intensidade });
  return new Promise((ok) => {
    if (calmo) {
      gsap.fromTo(letras, { opacity: 0 }, { opacity: 1, duration: 0.35, stagger: passo * 0.5, ease: 'none', onComplete: ok });
      return;
    }
    gsap.fromTo(letras,
      { clipPath: 'inset(0% 100% 0% 0%)', webkitClipPath: 'inset(0% 100% 0% 0%)', opacity: 0.4 },
      {
        clipPath: 'inset(0% 0% 0% 0%)', webkitClipPath: 'inset(0% 0% 0% 0%)', opacity: 1,
        duration: passo * 1.9, stagger: passo, ease: 'power1.inOut',
        onComplete: () => { gsap.set(letras, { clearProps: 'clipPath,webkitClipPath' }); ok(); },
      });
  });
}

// ============================================================================
// A cena
// ============================================================================

export async function cenaSegredos(ctx, { frio } = {}) {
  const { conteudo, diretor, mundo, som, musica, amb } = ctx;
  const gsap = window.gsap;
  const dados = conteudo.segredos || {};
  const calmo = amb.reduzido;
  const raizDoc = document.documentElement;

  const itens = (Array.isArray(dados.itens) ? dados.itens : [])
    .filter((d) => d && typeof d.video === 'string' && d.video.trim())
    .map((d, i) => ({
      d, i,
      titulo: String(d.titulo || ''),
      nome: String(d.nome || ''),
      estado: 'fechado',          // fechado | aberto | falhou
      visto: false,
      escrito: false,
      aspecto: 0,                  // largura/altura do vídeo, quando souber
      video: null,
      el: null,
    }));
  if (!itens.length) return;

  let aberto = null;           // item com o vídeo aberto
  let ocupado = false;         // uma transição em curso: toques ignorados
  let falhouAberto = false;
  let pausadoPelaAba = false;
  let pausaMusica = false;     // sem Web Audio: a música pausa de verdade e volta depois
  let entraram = false;
  let todosVistosAvisado = false;

  const palco = document.getElementById('palco');
  const acoes = document.getElementById('acoes');

  // ---- o que fica em cena ---------------------------------------------------
  const raiz = el('div', { class: 'segredos' });
  const frase = el('p', { class: 'frase segredos-frase', 'aria-live': 'polite' });
  const campo = el('div', { class: 'segredos-campo' });
  const veu = el('div', { class: 'segredos-veu', 'aria-hidden': 'true' });
  const vivo = el('p', { class: 'so-leitor', 'aria-live': 'polite' });
  const sonda = el('div', { class: 'segredos-sonda', 'aria-hidden': 'true' });
  raiz.append(frase, campo, veu, vivo, sonda);

  // A moldura do vídeo (uma só, reaproveitada).
  const tela = el('div', { class: 'segredo-tela' });
  const pausaIcone = svg(PAUSA);
  const botaoTocar = el('button', { class: 'segredo-tocar', type: 'button', hidden: true });
  botaoTocar.append(svg(TOCAR));
  tela.append(pausaIcone, botaoTocar);
  const progresso = svg(PROGRESSO);
  const fioProgresso = progresso.querySelector('.segredo-progresso-fio');
  const fechar = el('button', {
    class: 'segredo-fechar', type: 'button', dataset: { acao: 'fechar-segredo' },
    'aria-label': dados.fechar || 'Fechar',
  });
  fechar.append(svg(X_FECHAR));
  const moldura = el('div', { class: 'segredo-moldura', role: 'dialog', 'aria-modal': 'true', hidden: true }, [
    el('div', 'segredo-papel'), tela, progresso, fechar,
  ]);
  raiz.append(moldura);
  palco.append(raiz);

  const cancelamentos = [];
  const ouvir = (alvo, evento, fn, opcoes) => {
    alvo.addEventListener(evento, fn, opcoes);
    cancelamentos.push(() => alvo.removeEventListener(evento, fn, opcoes));
  };

  // ---- áreas seguras e medidas --------------------------------------------
  function seguro() {
    const cs = getComputedStyle(sonda);
    return {
      topo: parseFloat(cs.paddingTop) || 0,
      dir: parseFloat(cs.paddingRight) || 0,
      base: parseFloat(cs.paddingBottom) || 0,
      esq: parseFloat(cs.paddingLeft) || 0,
    };
  }
  const tamanhoTela = () => ({ L: raiz.clientWidth || innerWidth, A: raiz.clientHeight || innerHeight });

  // ---- os bilhetes ----------------------------------------------------------
  const sorte = semente(23);
  for (const item of itens) {
    item.jit = { rot: (sorte() - 0.5) * 13, esc: 0.9 + sorte() * 0.16, dx: sorte() - 0.5, fase: sorte() * 6.28, prof: 0.5 + sorte() };
    const aba = el('span', 'bilhete-aba');
    aba.append(svg(ABA));
    const carta = el('span', 'bilhete-carta');
    carta.append(svg(CARTA));
    const corpoEnv = el('span', 'bilhete-envelope');
    corpoEnv.append(svg(CORPO));
    const fio = svg(FIO);
    const texto = el('span', { class: 'bilhete-texto', 'aria-hidden': 'true' });
    const nome = el('span', { class: 'bilhete-nome', 'aria-hidden': 'true' });
    const rever = svg(REVER);
    const corpo = el('span', 'bilhete-corpo', [carta, corpoEnv, aba, fio, texto, nome, rever]);
    const toque = el('span', 'bilhete-toque', corpo);
    const pose = el('span', 'bilhete-pose', toque);
    const botao = el('button', {
      class: 'bilhete', type: 'button',
      dataset: { acao: 'segredo', estado: 'fechado' },
      'aria-label': item.titulo || item.nome,
    }, pose);
    campo.append(botao);
    item.el = { botao, pose, toque, corpo, aba, carta, fio, texto, nome, rever };

    // O vídeo: só os metadados (tamanho e duração), nunca o arquivo inteiro antes do toque.
    const v = document.createElement('video');
    v.className = 'segredo-video';
    v.preload = 'metadata';
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.setAttribute('disablepictureinpicture', '');
    v.setAttribute('disableremoteplayback', '');
    v.controls = false;
    if (typeof item.d.capa === 'string' && item.d.capa.trim()) v.poster = item.d.capa;
    v.addEventListener('loadedmetadata', () => {
      if (v.videoWidth && v.videoHeight) {
        item.aspecto = v.videoWidth / v.videoHeight;
        if (aberto === item) ajustarMoldura(true);
      }
    });
    v.addEventListener('error', () => falhou(item));
    v.src = item.d.video;
    item.video = v;
  }

  // ---- disposição: em pé, escalonados para o polegar; deitado, na largura ----
  let caixas = [];
  function dispor() {
    const { L, A } = tamanhoTela();
    const s = seguro();
    const fr = frase.getBoundingClientRect();
    const reservaBase = s.base + clamp(A * 0.12, 48, 112) + 58;
    const y0 = Math.max(fr.bottom + 18, s.topo + A * 0.22);
    const y1 = Math.max(y0 + 120, A - reservaBase);
    const x0 = s.esq + 16;
    const x1 = L - s.dir - 16;
    const larguraArea = x1 - x0;
    const alturaArea = y1 - y0;
    const n = itens.length;
    const emPe = L / A < 0.9;
    let colunas; let linhas;
    if (emPe) {
      colunas = n <= 3 ? 1 : 2;
      linhas = Math.ceil(n / colunas);
    } else {
      linhas = n <= 5 || alturaArea < 300 ? 1 : 2;
      colunas = Math.ceil(n / linhas);
    }
    const celL = larguraArea / colunas;
    const celA = alturaArea / linhas;
    const w = Math.max(96, Math.min(
      celL * (colunas === 1 ? 0.6 : 0.82),
      (celA / PROPORCAO) * (linhas === 1 ? 0.62 : 0.84),
      emPe ? 214 : 290,
    ));
    const h = w * PROPORCAO;
    caixas = itens.map((item, k) => {
      const linha = Math.floor(k / colunas);
      const coluna = k % colunas;
      // Última linha incompleta: centrada.
      const naLinha = Math.min(colunas, n - linha * colunas);
      const desloc = (colunas - naLinha) * celL * 0.5;
      let cx = x0 + desloc + celL * (coluna + 0.5);
      let cy = y0 + celA * (linha + 0.5);
      const j = item.jit;
      if (colunas === 1) {
        cx += (linha % 2 ? 1 : -1) * Math.min(larguraArea * 0.17, (larguraArea - w) * 0.36);
      } else {
        cx += j.dx * celL * 0.1;
        cy += (coluna % 2 ? 1 : -1) * Math.min(celA * 0.1, Math.max(0, (celA - h) * 0.4));
      }
      const meiaL = (w * j.esc) / 2 + 4;
      cx = clamp(cx, x0 + meiaL, x1 - meiaL);
      return { cx, cy, w, h };
    });
    itens.forEach((item, k) => {
      const c = caixas[k];
      const b = item.el.botao;
      b.style.width = `${c.w}px`;
      b.style.height = `${c.h}px`;
      b.style.left = `${(c.cx - c.w / 2).toFixed(1)}px`;
      b.style.top = `${(c.cy - c.h / 2).toFixed(1)}px`;
      b.style.setProperty('--b', `${c.w}px`);
      b.style.zIndex = String(10 + k);
    });
  }

  // ---- a vida dos bilhetes: flutuam e seguem um pouco o dedo/ponteiro -------
  let vivos = false;
  let tempo = 0;
  const pararVida = mundo.aoQuadro((dt) => {
    tempo += dt;
    if (!vivos) return;
    const px = (mundo.ponteiro && mundo.ponteiro.x) || 0;
    const py = (mundo.ponteiro && mundo.ponteiro.y) || 0;
    const k = calmo ? 0.2 : 1;
    for (const item of itens) {
      const j = item.jit;
      const y = (Math.sin(tempo * 0.9 + j.fase) * 4.2 + Math.sin(tempo * 0.37 + j.fase * 2) * 2) * k - py * 6 * j.prof * k;
      const x = (Math.sin(tempo * 0.53 + j.fase) * 2.2) * k + px * 9 * j.prof * k;
      const r = Math.sin(tempo * 0.71 + j.fase) * 1.1 * k;
      item.el.corpo.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${r.toFixed(3)}deg)`;
    }
  });
  cancelamentos.push(pararVida);

  // ---- estados visuais do envelope ------------------------------------------
  const PEDACOS = (item, tipo) => item.el.fio.querySelectorAll(tipo === 'laco'
    ? '.fio-linha path[data-p^="l"], .fio-linha path[data-p^="p"], .fio-sombra path:nth-child(n+5)'
    : '.fio-linha path[data-p^="h"], .fio-linha path[data-p^="v"], .fio-sombra path:nth-child(-n+4)');

  /** Põe o bilhete no estado aberto sem animar (carta para fora, aba aberta, fio solto). */
  function posarAberto(item) {
    const e = item.el;
    gsap.set(e.aba, { rotationX: -180, zIndex: 0 });
    e.aba.classList.add('aba-aberta');
    gsap.set(e.carta, { yPercent: -SUBIDA_CARTA * 100 / 0.88, autoAlpha: 1 });
    gsap.set(e.fio, { autoAlpha: 0 });
    gsap.set(e.texto, { autoAlpha: 0 });
  }

  function marcar(item, estado) {
    item.estado = estado;
    item.el.botao.dataset.estado = estado;
    const rotulo = item.nome ? (item.titulo ? `${item.titulo}: ${item.nome}` : item.nome) : item.titulo;
    item.el.botao.setAttribute('aria-label', rotulo);
    if (estado === 'falhou') item.el.botao.setAttribute('aria-disabled', 'true');
  }

  async function escreverNome(item, { anunciar = true } = {}) {
    if (item.escrito) return;
    item.escrito = true;
    const alvo = item.el.nome;
    const c = caixas[item.i] || { w: 160 };
    // tamanho: primeiro mede com o texto inteiro, depois escreve
    alvo.textContent = item.nome;
    caber(alvo, c.w * 0.15);
    gsap.set(alvo, { autoAlpha: 1 });
    if (anunciar && item.nome) vivo.textContent = item.nome;
    await escrever(gsap, alvo, item.nome, { calmo, som });
  }

  // ---- falha de um vídeo: conta como visto e mostra só o nome --------------
  function falhou(item) {
    if (item.estado === 'falhou') return;
    const estavaAberto = aberto === item;
    item.visto = true;
    if (estavaAberto) {
      falhouAberto = true;
      fecharVideo();
      return;
    }
    marcar(item, 'falhou');
    if (!entraram) return;              // ainda não chegou: entra já aberto
    animarAberturaSimples(item).then(() => escreverNome(item, { anunciar: false })).then(conferirTodos);
  }

  function animarAberturaSimples(item) {
    const e = item.el;
    return new Promise((ok) => {
      const tl = gsap.timeline({ onComplete: ok });
      tl.to(e.fio, { autoAlpha: 0, duration: 0.5, ease: 'none' }, 0)
        .to(e.texto, { autoAlpha: 0, duration: 0.4, ease: 'none' }, 0)
        .to(e.aba, { rotationX: -180, duration: calmo ? 0.01 : 0.7, ease: curvas.branco.camera,
          onUpdate() { if (this.progress() > 0.5) e.aba.classList.add('aba-aberta'); } }, 0.1)
        .to(e.carta, { yPercent: -SUBIDA_CARTA * 100 / 0.88, autoAlpha: 1, duration: 0.6, ease: curvas.branco.entrar }, 0.45);
    });
  }

  // ---- a moldura ------------------------------------------------------------

  function medidaMoldura(item) {
    const { L, A } = tamanhoTela();
    const s = seguro();
    const m = clamp(Math.min(L, A) * 0.065, 26, 64);
    const p = clamp(Math.min(L, A) * 0.016, 6, 12);     // borda de papel
    const pb = p + 16;                                   // embaixo: o fio do progresso
    const aspecto = item.aspecto || ASPECTO_PADRAO;
    const maxL = L - s.esq - s.dir - m * 2;
    const maxA = A - s.topo - s.base - m * 2;
    let telaL = maxL - p * 2;
    let telaA = telaL / aspecto;
    if (telaA > maxA - p - pb) {
      telaA = maxA - p - pb;
      telaL = telaA * aspecto;
    }
    // no computador o vídeo deitado não precisa encostar nas bordas
    if (L > 900 && aspecto > 1) {
      telaL = Math.min(telaL, L * 0.62);
      telaA = telaL / aspecto;
    }
    const largura = telaL + p * 2;
    const altura = telaA + p + pb;
    const left = s.esq + (L - s.esq - s.dir - largura) / 2;
    const top = s.topo + (A - s.topo - s.base - altura) / 2;
    return { left, top, width: largura, height: altura, p, pb };
  }

  let final = null;
  function aplicarMoldura(r) {
    final = r;
    Object.assign(moldura.style, {
      left: `${r.left.toFixed(1)}px`, top: `${r.top.toFixed(1)}px`,
      width: `${r.width.toFixed(1)}px`, height: `${r.height.toFixed(1)}px`,
    });
    moldura.style.setProperty('--p', `${r.p}px`);
    moldura.style.setProperty('--pb', `${r.pb}px`);
  }

  /** O tamanho do vídeo chegou depois (ou a tela girou): a moldura se ajusta. */
  function ajustarMoldura(animar) {
    if (!aberto) return;
    const r = medidaMoldura(aberto);
    if (!animar || ocupado || calmo) { aplicarMoldura(r); return; }
    const de = { ...final };
    aplicarMoldura(r);
    const dx = (de.left + de.width / 2) - (r.left + r.width / 2);
    const dy = (de.top + de.height / 2) - (r.top + r.height / 2);
    gsap.fromTo(moldura,
      { x: dx, y: dy, scaleX: de.width / r.width, scaleY: de.height / r.height },
      { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: 0.55, ease: curvas.branco.camera, clearProps: 'transform' });
  }

  /** Onde a carta está quando sai do envelope (retângulo na tela, sem a rotação). */
  function retanguloCarta(item) {
    // centro pela caixa na tela; tamanho pelo de verdade (a caixa de um bilhete girado é maior)
    const r = item.el.corpo.getBoundingClientRect();
    const k = item.jit.esc;
    const w = item.el.corpo.offsetWidth * k * 0.86;
    const h = item.el.corpo.offsetHeight * k * 0.88;
    const fora = item.estado === 'fechado' ? 0 : SUBIDA_CARTA * item.el.corpo.offsetHeight * k;
    return { cx: r.left + r.width / 2, cy: r.top + r.height * 0.5 - fora, w, h };
  }

  // u em 0..1: 0 = a carta dentro do envelope, ~0.22 = carta fora, 1 = moldura aberta.
  const curvaAbrir = gsap.parseEase(curvas.branco.camera);
  const curvaSubir = gsap.parseEase('power2.out');
  function desenharAbertura(u, origem, rot) {
    const f = final;
    const fcx = f.left + f.width / 2;
    const fcy = f.top + f.height / 2;
    const subida = origem.h * (SUBIDA_CARTA + 0.42);
    let cx; let cy; let w; let h; let r;
    if (u < 0.22) {
      const k = curvaSubir(u / 0.22);
      cx = origem.cx; cy = origem.cy - subida * k; w = origem.w; h = origem.h; r = rot;
    } else {
      const k = curvaAbrir((u - 0.22) / 0.78);
      cx = lerp(origem.cx, fcx, k);
      cy = lerp(origem.cy - subida, fcy, k);
      w = lerp(origem.w, f.width, k);
      h = lerp(origem.h, f.height, k);
      r = lerp(rot, 0, k);
    }
    const t = Math.max(0, (f.height - h) / 2);
    const l = Math.max(0, (f.width - w) / 2);
    const recorte = `inset(${t.toFixed(1)}px ${l.toFixed(1)}px ${t.toFixed(1)}px ${l.toFixed(1)}px round 2px)`;
    moldura.style.clipPath = recorte;
    moldura.style.webkitClipPath = recorte;
    moldura.style.transform = `translate3d(${(cx - fcx).toFixed(1)}px, ${(cy - fcy).toFixed(1)}px, 0) rotate(${r.toFixed(2)}deg)`;
    // o vídeo aparece quando a moldura já é quase ela mesma
    const vis = clamp((u - 0.55) / 0.35);
    tela.style.opacity = vis.toFixed(3);
    progresso.style.opacity = vis.toFixed(3);
    fechar.style.opacity = clamp((u - 0.85) / 0.15).toFixed(3);
    moldura.classList.toggle('segredo-moldura-assentada', u >= 0.999);
  }

  // ---- música -----------------------------------------------------------------
  function abaixarMusica() {
    let diag = null;
    try { diag = som.diagnostico ? som.diagnostico() : null; } catch { diag = null; }
    if (diag && !diag.mudo && !diag.webAudio && som.estado.tocando) {
      pausaMusica = true;
      som.pausar();
    } else {
      som.abafar(ABAFAR, 30 * 60 * 1000);
    }
    musica.esconderMini();
  }
  function voltarMusica() {
    if (pausaMusica) {
      pausaMusica = false;
      som.retomar();
    } else {
      som.abafar(1, 0);
      // O iPhone pode ter parado a música enquanto o vídeo tocava: ela volta sozinha.
      try {
        const diag = som.diagnostico ? som.diagnostico() : null;
        if (diag && diag.pausado && som.estado.tocando && !diag.mudo && diag.fonte) {
          som.pausar();
          som.retomar();
        }
      } catch { /* segue */ }
    }
    musica.mostrarMini();
  }

  // ---- progresso e pausa ----------------------------------------------------
  let laco = 0;
  function animarProgresso() {
    cancelAnimationFrame(laco);
    const passo = () => {
      if (!aberto) return;
      const v = aberto.video;
      const p = v && Number.isFinite(v.duration) && v.duration > 0 ? clamp(v.currentTime / v.duration) : 0;
      fioProgresso.style.strokeDashoffset = (1 - p).toFixed(4);
      laco = requestAnimationFrame(passo);
    };
    laco = requestAnimationFrame(passo);
  }

  function alternarPausa() {
    if (!aberto || ocupado) return;
    const v = aberto.video;
    if (v.paused) {
      tocarVideo(v);
    } else {
      v.pause();
    }
  }

  function tocarVideo(v) {
    botaoTocar.hidden = true;
    let promessa;
    try { promessa = v.play(); } catch (erro) { promessa = Promise.reject(erro); }
    if (promessa && promessa.catch) {
      promessa.catch((erro) => {
        if (!aberto || aberto.video !== v) return;
        if (erro && erro.name === 'NotAllowedError') {
          // O navegador quer outro toque: um botão de tocar no meio do vídeo.
          botaoTocar.hidden = false;
          botaoTocar.setAttribute('aria-label', aberto.titulo || aberto.nome || '');
        }
      });
    }
  }

  const aoTocarVideo = () => moldura.classList.remove('segredo-pausado', 'segredo-carregando');
  const aoPausarVideo = () => { if (aberto && !aberto.video.ended && !ocupado) moldura.classList.add('segredo-pausado'); };
  const aoEsperarVideo = () => moldura.classList.add('segredo-carregando');
  const aoAcabarVideo = () => { if (aberto && !ocupado) fecharVideo(); };

  tela.addEventListener('click', (ev) => {
    if (ev.target.closest('.segredo-tocar')) return;
    alternarPausa();
  });
  botaoTocar.addEventListener('click', () => { if (aberto) tocarVideo(aberto.video); });
  fechar.addEventListener('click', () => fecharVideo());

  ouvir(document, 'keydown', (ev) => {
    if (!aberto) return;
    if (ev.key === 'Escape') { ev.preventDefault(); fecharVideo(); }
    else if (ev.key === ' ' || ev.key === 'k') {
      // Espaço sempre pausa/continua (mesmo com o foco no fechar, que fecha com Enter).
      ev.preventDefault(); alternarPausa();
    } else if (ev.key === 'Tab') {
      // O foco fica dentro do vídeo aberto.
      ev.preventDefault();
      const alvo = botaoTocar.hidden ? fechar : (document.activeElement === fechar ? botaoTocar : fechar);
      alvo.focus({ preventScroll: true });
    }
  });

  ouvir(document, 'visibilitychange', () => {
    if (!aberto) return;
    const v = aberto.video;
    if (document.hidden) {
      if (!v.paused) { pausadoPelaAba = true; v.pause(); }
    } else if (pausadoPelaAba) {
      pausadoPelaAba = false;
      tocarVideo(v);
    }
  });

  // ---- abrir ------------------------------------------------------------------
  async function abrirVideo(item) {
    if (ocupado || aberto || item.estado === 'falhou') return;
    ocupado = true;
    aberto = item;
    falhouAberto = false;
    const e = item.el;
    const v = item.video;

    // Dentro do toque: o vídeo pede para tocar e para na hora. É o gesto que o
    // Safari exige; depois disso ele pode começar sozinho quando a moldura abrir.
    v.preload = 'auto';
    v.muted = false;
    try {
      const pr = v.play();
      v.pause();
      if (pr && pr.catch) pr.catch(() => {});
    } catch { /* segue: o botão de tocar resolve */ }
    try { v.currentTime = 0; } catch { /* sem metadados ainda */ }

    diretor.etapa('assistindo');
    som.efeito('toque');
    vivos = false;

    // pétalas saltam de onde o bilhete está
    try {
      const r = e.corpo.getBoundingClientRect();
      const { L, A } = tamanhoTela();
      const ndc = pxParaNdc(r.left + r.width * 0.3, r.top + r.height * 0.35, L, A);
      const pos = mundo.telaParaMundo(ndc.x, ndc.y, 2.4);
      mundo.petalas.rajada(pos, calmo ? 4 : 10);
    } catch { /* pétalas são enfeite */ }

    tela.prepend(v);
    tela.style.setProperty('--aspecto', String(item.aspecto || ASPECTO_PADRAO));
    moldura.setAttribute('aria-label', item.titulo || item.nome || '');
    moldura.classList.remove('segredo-pausado');
    moldura.classList.add('segredo-carregando');
    fioProgresso.style.strokeDashoffset = '1';
    v.addEventListener('playing', aoTocarVideo);
    v.addEventListener('pause', aoPausarVideo);
    v.addEventListener('waiting', aoEsperarVideo);
    v.addEventListener('ended', aoAcabarVideo);

    aplicarMoldura(medidaMoldura(item));
    const origem = retanguloCarta(item);
    const rot = item.jit.rot;

    // o mundo atrás escurece e desfoca; a música abaixa
    raizDoc.classList.add('segredo-aberto');
    abaixarMusica();
    mundo.petalas.definirDensidade(0.35);
    mundo.petalas.definirFoco?.(0.5);

    const jaAberto = item.estado !== 'fechado';
    const tl = gsap.timeline();
    tl.to(veu, { autoAlpha: 1, duration: calmo ? 0.5 : 1.1, ease: 'none' }, calmo ? 0 : 0.3);

    if (calmo) {
      if (!jaAberto) {
        tl.to([e.fio, e.texto], { autoAlpha: 0, duration: 0.3, ease: 'none' }, 0);
        tl.set(e.aba, { rotationX: -180 }, 0.3);
        tl.call(() => e.aba.classList.add('aba-aberta'), null, 0.3);
      }
      tl.call(() => {
        moldura.hidden = false;
        desenharAbertura(1, origem, 0);
        moldura.style.clipPath = 'none';
        moldura.style.webkitClipPath = 'none';
        moldura.style.transform = '';
      }, null, 0.25);
      tl.fromTo(moldura, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: 'none' }, 0.25);
      tl.set(e.carta, { autoAlpha: 0 }, 0.75);
    } else {
      // 1. o laço se desfaz e o fio corre para fora do envelope
      if (!jaAberto) {
        tl.fromTo(e.toque, { scale: 0.96, transition: 'none' }, { scale: 1, duration: 0.5, ease: curvas.branco.entrar, clearProps: 'transform,transition' }, 0);
        // primeiro o laço se solta (as alças e as pontas recolhem para o nó)...
        tl.to(PEDACOS(item, 'laco'), { strokeDashoffset: 1, duration: 0.42, ease: 'power2.inOut', stagger: 0.03 }, 0.02);
        tl.to(e.fio.querySelector('.fio-no'), { scale: 0, transformOrigin: '50% 50%', duration: 0.3, ease: 'power2.in' }, 0.3);
        // ...depois as voltas correm do nó para fora do envelope
        tl.to(PEDACOS(item, 'volta'), { strokeDashoffset: -1, duration: 0.5, ease: 'power2.in', stagger: 0.02 }, 0.3);
        tl.to(e.texto, { autoAlpha: 0, y: -4, duration: 0.45, ease: 'none' }, 0.1);
        // 2. a aba abre (vira para trás na metade)
        tl.call(() => som.efeito('papel'), null, 0.52);
        tl.to(e.aba, {
          rotationX: -180, duration: 0.62, ease: curvas.branco.camera,
          onUpdate() { if (this.progress() > 0.5) e.aba.classList.add('aba-aberta'); },
        }, 0.5);
      } else {
        tl.fromTo(e.toque, { scale: 0.96, transition: 'none' }, { scale: 1, duration: 0.45, ease: curvas.branco.entrar, clearProps: 'transform,transition' }, 0);
      }
      // 3. a carta sobe e se abre até ser a moldura
      const inicio = jaAberto ? 0.12 : 0.86;
      const estado = { u: 0 };
      tl.call(() => {
        moldura.hidden = false;
        gsap.set(e.carta, { autoAlpha: 0 });
        desenharAbertura(0, origem, rot);
      }, null, inicio);
      tl.to(estado, {
        u: 1, duration: 1.45, ease: 'none',
        onUpdate: () => desenharAbertura(estado.u, origem, rot),
      }, inicio);
    }
    await new Promise((ok) => tl.eventCallback('onComplete', ok));

    moldura.style.clipPath = 'none';
    moldura.style.webkitClipPath = 'none';
    moldura.style.transform = '';
    desenharFinal();
    ocupado = false;
    if (aberto !== item) return;
    if (falhouAberto || v.error) { fecharVideo(); return; }
    try { fechar.focus({ preventScroll: true }); } catch { /* sem foco programático */ }
    animarProgresso();
    tocarVideo(v);
  }

  function desenharFinal() {
    tela.style.opacity = '1';
    progresso.style.opacity = '1';
    fechar.style.opacity = '1';
    moldura.classList.add('segredo-moldura-assentada');
  }

  // ---- fechar -----------------------------------------------------------------
  async function fecharVideo() {
    const item = aberto;
    // Falhou no meio da abertura: abrirVideo fecha quando a abertura terminar.
    if (!item || ocupado) return;
    ocupado = true;
    fechar.disabled = true;
    const e = item.el;
    const v = item.video;
    try { v.pause(); } catch { /* nada */ }
    v.removeEventListener('playing', aoTocarVideo);
    v.removeEventListener('pause', aoPausarVideo);
    v.removeEventListener('waiting', aoEsperarVideo);
    v.removeEventListener('ended', aoAcabarVideo);
    cancelAnimationFrame(laco);
    botaoTocar.hidden = true;
    moldura.classList.remove('segredo-pausado', 'segredo-carregando', 'segredo-moldura-assentada');

    const falha = falhouAberto || !!v.error;
    item.visto = true;
    voltarMusica();
    raizDoc.classList.remove('segredo-aberto');
    mundo.petalas.definirDensidade(1);
    mundo.petalas.definirFoco?.(3);

    const origem = retanguloCarta(item);
    const rot = item.jit.rot;
    const tl = gsap.timeline();
    if (calmo) {
      tl.to(moldura, { autoAlpha: 0, duration: 0.45, ease: 'none' }, 0);
      tl.set(e.carta, { yPercent: -SUBIDA_CARTA * 100 / 0.88, autoAlpha: 1 }, 0.2);
    } else {
      const estado = { u: 1 };
      tl.to(estado, {
        u: 0, duration: 1.1, ease: 'none',
        onUpdate: () => desenharAbertura(estado.u, origem, rot),
      }, 0);
      // a carta desce de volta e fica com a ponta para fora
      tl.call(() => {
        moldura.hidden = true;
        gsap.set(e.carta, { autoAlpha: 1, yPercent: -(SUBIDA_CARTA + 0.42) * 100 / 0.88 });
      }, null, 1.1);
      tl.to(e.carta, { yPercent: -SUBIDA_CARTA * 100 / 0.88, duration: 0.5, ease: curvas.branco.entrar }, 1.1);
    }
    tl.to(veu, { autoAlpha: 0, duration: calmo ? 0.5 : 0.9, ease: 'none' }, calmo ? 0 : 0.35);
    await new Promise((ok) => tl.eventCallback('onComplete', ok));

    moldura.hidden = true;
    gsap.set(moldura, { clearProps: 'opacity,visibility' });
    moldura.style.clipPath = '';
    moldura.style.webkitClipPath = '';
    moldura.style.transform = '';
    if (v.parentNode === tela) v.remove();
    try { if (!falha) v.currentTime = 0; } catch { /* nada */ }
    aberto = null;
    fechar.disabled = false;

    marcar(item, falha ? 'falhou' : 'aberto');
    posarAberto(item);
    vivos = true;
    try { e.botao.focus({ preventScroll: true }); } catch { /* nada */ }

    await escreverNome(item);
    ocupado = false;
    diretor.etapa('escolhendo');
    conferirTodos();
  }

  // ---- o botão de seguir ----------------------------------------------------
  let liberarSeguir = null;
  const seguir = new Promise((ok) => { liberarSeguir = ok; });
  let botaoSeguir = null;
  function conferirTodos() {
    if (todosVistosAvisado || !entraram || !itens.every((i) => i.visto)) return;
    todosVistosAvisado = true;
    const texto = dados.continuar || '';
    botaoSeguir = el('button', {
      class: 'botao segredos-botao', type: 'button', dataset: { acao: 'continuar-segredos' },
      'aria-label': texto || null,
    }, [el('span', { class: 'segredos-botao-texto', texto }), svg(SUBLINHADO)]);
    acoes.append(botaoSeguir);
    requestAnimationFrame(() => requestAnimationFrame(() => botaoSeguir.classList.add('segredos-botao-visivel')));
    botaoSeguir.addEventListener('click', () => {
      if (ocupado || aberto) return;
      botaoSeguir.disabled = true;
      liberarSeguir();
    }, { once: false });
  }

  // ---- toques nos bilhetes --------------------------------------------------
  for (const item of itens) {
    item.el.botao.addEventListener('click', () => {
      if (!entraram || ocupado || aberto) return;
      if (item.estado === 'falhou') return;
      abrirVideo(item);
    });
  }

  const aoGirar = () => {
    if (!ocupado) dispor();
    if (aberto && !ocupado) ajustarMoldura(false);
  };
  cancelamentos.push(mundo.aoRedimensionar(aoGirar));
  ouvir(window, 'resize', aoGirar, { passive: true });

  // ==========================================================================
  // O roteiro
  // ==========================================================================
  try {
    diretor.etapa('enrolando');
    if (frio) musica.mostrarMini();
    else await voltarAoMundo(ctx);
    mundo.petalas.definirDensidade(1);

    // A frase e uns passos pela alameda, juntos.
    diretor.etapa('frase');
    const passos = calmo ? null : mundo.caminhar({ distancia: 2.4, duracao: 4.2 });
    const lida = revelarPalavras(frase, dados.frase || '', { intervalo: 0.2, duracao: 1.6 });
    await espera(calmo ? 400 : 900);
    dispor();

    // Os bilhetes nascem da névoa, um a um.
    const { L, A } = tamanhoTela();
    const fugaX = L / 2;
    const fugaY = A * 0.46;
    gsap.set(itens.map((i) => i.el.botao), { autoAlpha: 1 });
    const chegadas = itens.map((item, k) => new Promise((ok) => {
      const c = caixas[k];
      const p = item.el.pose;
      const atraso = k * (calmo ? 0.25 : 0.5);
      // ao pousar: "Segredo N" se escreve
      const rotular = () => {
        if (item.estado !== 'fechado') return;
        gsap.set(item.el.texto, { autoAlpha: 1 });
        escrever(gsap, item.el.texto, item.titulo, { calmo, som, intensidade: 0.35 });
      };
      if (calmo) {
        gsap.fromTo(p, { autoAlpha: 0, rotation: item.jit.rot, scale: item.jit.esc },
          { autoAlpha: 1, duration: 0.9, delay: atraso, ease: 'none', onComplete: () => { rotular(); ok(); } });
        return;
      }
      const tl = gsap.timeline({ delay: atraso, onComplete: ok });
      tl.fromTo(p, { x: fugaX - c.cx, autoAlpha: 0, scale: 0.16, rotation: item.jit.rot * 2.6 + (k % 2 ? 14 : -14), filter: 'blur(7px)' },
        { x: 0, autoAlpha: 1, scale: item.jit.esc, rotation: item.jit.rot, filter: 'blur(0px)', duration: 2.1, ease: curvas.branco.entrar }, 0)
        .fromTo(p, { y: fugaY - c.cy }, { y: 0, duration: 2.1, ease: 'power3.out' }, 0)
        .set(p, { clearProps: 'filter' });
      tl.call(rotular, null, 1.15);
    }));
    vivos = true;
    // Ela pode tocar enquanto os outros ainda chegam.
    entraram = true;
    if (!amb.toque && (!document.activeElement || document.activeElement === document.body)) {
      try { itens[0].el.botao.focus({ preventScroll: true }); } catch { /* nada */ }
    }
    await Promise.all([lida, ...chegadas]);
    if (passos) await passos;

    // Vídeo que falhou antes de ela chegar: o bilhete já está aberto, só com o nome.
    for (const item of itens) {
      if (item.estado === 'falhou' && !item.escrito) {
        await animarAberturaSimples(item);
        await escreverNome(item, { anunciar: false });
      }
    }
    if (!aberto) diretor.etapa('escolhendo');
    conferirTodos();

    await seguir;

    // Os bilhetes voltam para a névoa; a frase sai.
    vivos = false;
    const saidas = itens.map((item, k) => new Promise((ok) => {
      const c = caixas[k];
      if (calmo) {
        gsap.to(item.el.pose, { autoAlpha: 0, duration: 0.7, delay: k * 0.08, ease: 'none', onComplete: ok });
        return;
      }
      gsap.to(item.el.pose, {
        x: (fugaX - c.cx) * 0.6, y: (fugaY - c.cy) * 0.6 - 30, scale: 0.3, autoAlpha: 0, filter: 'blur(6px)',
        duration: 1.5, delay: k * 0.12, ease: curvas.branco.sair, onComplete: ok,
      });
    }));
    if (botaoSeguir) gsap.to(botaoSeguir, { autoAlpha: 0, duration: 0.6, ease: 'none' });
    await Promise.all([ocultarPalavras(frase), ...saidas]);
  } finally {
    for (const fn of cancelamentos) { try { fn(); } catch { /* nada */ } }
    cancelAnimationFrame(laco);
    raizDoc.classList.remove('segredo-aberto');
    if (aberto) {
      try { aberto.video.pause(); } catch { /* nada */ }
      voltarMusica();
    }
    for (const item of itens) {
      try { item.video.pause(); item.video.removeAttribute('src'); item.video.load(); } catch { /* nada */ }
    }
    raiz.remove();
    if (botaoSeguir) botaoSeguir.remove();
  }
}
