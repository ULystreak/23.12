/* ============================================================================
   CARTAS DO CHÃO: os amigos e "Nossos momentos" entre ela e ele
   ============================================================================
   Etapas: pousando → escolhendo ⇄ assistindo → seguindo. As cartas caem
   deitadas no chão, desenhadas em DOM com a mesma perspectiva da câmera do
   mundo (matrix3d por carta, `perspective` no campo); cada uma tem um botão
   plano por cima, que recebe o toque e o foco. As dos amigos caem sem nome: o
   nome é escrito à mão só depois de aberta. A última, "Nossos momentos" (a
   antiga Surpresinha, sempre uma galeria), pousa com o nome escrito e fica
   trancada no laço até as outras serem vistas.

   Tocar abre o visor (vídeo, galeria ou cartão de exemplo) por cima de tudo;
   ao fechar, o nome é escrito, a carta vai para a bolsa (lembrada em
   localStorage `carta2312:chao`, para a retomada) e a luz corre pelo fio.
   "Seguir em frente" só aparece quando a frase do chão sai.

   A cena não mexe no fio, nele nem no envelope: só inclina o olhar
   (`estado.olharChao`, que a câmera 3D desconta a cada quadro) e acende o fio
   com pulsos. Ganchos: [data-acao="carta-chao"][data-id][data-estado],
   [data-acao="fechar-carta"], [data-acao="seguir-cartas"][data-destaque] e
   .carta-chao-visor[data-tipo="video|galeria|vazio"].
   ========================================================================== */

import { el, espera, svg, clamp, lerp, semente } from '../nucleo/util.js';
import { curvas, comoPromise, revelarPalavras, ocultarPalavras } from '../nucleo/movimento.js';
import { cartasDoChao, temEncontro } from '../nucleo/diretor.js';
import { criarEle } from '../mundo/ele.js';

const GRAU = Math.PI / 180;
const ALTURA_OLHOS = 1.5; // m; igual a mundo.js
const DIST_ELE = 5.25; // m: onde ele fica quando ela para (igual a mao.js)
const LARGURA = 0.44; // m: a carta no chão
const PROPORCAO = 110 / 160; // a do desenho do envelope
const ABAFAR = 0.04; // a música a 4% enquanto o vídeo fala
const ABAFAR_MS = 30 * 60 * 1000; // teto do abafo; abafar(1, 0) desfaz antes
const CHAVE = 'carta2312:chao';
const LUZ_LIVRE_MS = 2500; // toque livre no chão: no máximo uma luz por este tempo
const ALVO_MIN = 46; // px: altura mínima do botão de cada carta
const PONTA_CURTA = 28; // a aba da Surpresinha, para o nome caber embaixo dela
const REPOUSO = { alt: 0, giro: 0, vira: 0, op: 1 };

// Onde cada carta pousa: t vai de 0 (perto dela) a 1 (perto dele); x em metros
// (multiplicado por `abre`). A sétima posição é sempre a da Surpresinha.
const LUGARES_EM_PE = [
  { t: 0.03, x: -0.31 }, { t: 0.1, x: 0.19 }, { t: 0.4, x: -0.5 },
  { t: 0.47, x: 0.04 }, { t: 0.7, x: -0.74 }, { t: 0.76, x: -0.2 },
  { t: 1, x: 0.54, fixo: true },
];
const LUGARES_DEITADO = [
  { t: 0.5, x: -1.5 }, { t: 0.04, x: -0.98 }, { t: 0.66, x: -0.5 },
  { t: 0.1, x: -0.04 }, { t: 0.55, x: 1.02 }, { t: 0.12, x: 1.5 },
  { t: 1, x: 0.3, fixo: true },
];

/* ---- desenhos ---------------------------------------------------------------- */

const icone = (d) => `<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
const ICONE = {
  fechar: icone('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  seta: icone('<path d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5"/>'),
  anterior: icone('<path d="M14.5 5.5L8 12l6.5 6.5"/>'),
  proxima: icone('<path d="M9.5 5.5L16 12l-6.5 6.5"/>'),
  tocar: icone('<path class="cheio" d="M8.5 6.2v11.6a.9.9 0 0 0 1.4.8l9-5.8a.9.9 0 0 0 0-1.6l-9-5.8a.9.9 0 0 0-1.4.8z"/>'),
};
const glifo = (d) => `<svg class="cartao-glifo" viewBox="0 0 40 30" aria-hidden="true" focusable="false">${d}</svg>`;
const GLIFO_VIDEO = glifo('<rect x="3.5" y="7" width="22" height="16" rx="3.5"/><path d="M25.5 13l9-4.8v13.6l-9-4.8z"/><circle cx="10" cy="12.5" r="1.6"/>');
const GLIFO_CORACAO = glifo('<path d="M20 26.5C10 19.4 6.5 14.6 6.5 10.4a6.3 6.3 0 0 1 13.5-2.6 6.3 6.3 0 0 1 13.5 2.6c0 4.2-3.5 9-13.5 16.1z"/>');

/** O envelope visto de costas (viewBox 160 × 110): folha, dobra e a aba que desce até `ponta`. */
function envelope(ponta = 60) {
  return '<svg class="carta-chao-papel" viewBox="0 0 160 110" aria-hidden="true" focusable="false">'
    + '<rect class="cc-folha" x="1.5" y="1.5" width="157" height="107" rx="4"/>'
    + '<path class="cc-dobra" d="M3 107L71 67Q80 61.5 89 67L157 107"/>'
    + `<path class="cc-aba" d="M2 3.2Q2 1.5 4 1.5H156Q158 1.5 158 3.2L86 ${ponta - 3}Q80 ${ponta + 1.5} 74 ${ponta - 3}Z"/>`
    + '</svg>';
}

// A sombra do fio fica deslocada (0,5; 1,3): a luz vem do alto, à esquerda.
const fio = (d) => `<path class="cc-fio-sombra" transform="translate(0.5 1.3)" d="${d}"/><path class="cc-fio" d="${d}"/>`;

// Amigos: uma cruz de fio, com o laço no cruzamento (40, 38).
const LACO_AMIGO = 'M40 38c-5.5-7.5-16-10.5-18.5-5.5s8.5 8 18.5 5.5zM40 38c5.5-7.5 16-10.5 18.5-5.5s-8.5 8-18.5 5.5zM39 39.5l-6 11.5M41 39.5l7 10.5';
const AMARRA = '<svg class="carta-chao-fio" viewBox="0 0 160 110" aria-hidden="true" focusable="false">'
  + fio('M40 1.5V108.5M1.5 38H158.5') + fio(LACO_AMIGO)
  + '<circle class="cc-no" cx="40" cy="38" r="2.6"/></svg>';

// Surpresinha: duas voltas na metade de cima e o laço com um coração de lacre
// no nó (80, 31). As voltas e as alças são o que se desfaz (CSS, data-trancada).
const VOLTAS = 'M1.5 29.6Q80 27.4 158.5 29.6M1.5 34.6Q80 32.4 158.5 34.6';
const ALCA_E = 'M80 31.5c-7-9-21-12-23.5-6s12 9.5 23.5 6zM78.5 33l-8.5 13';
const ALCA_D = 'M80 31.5c7-9 21-12 23.5-6s-12 9.5-23.5 6zM81.5 33l7.5 14';
const LACRE = '<svg class="carta-chao-fio" viewBox="0 0 160 110" aria-hidden="true" focusable="false">'
  + '<g class="cc-amarra">'
  + `<g class="cc-volta">${fio(VOLTAS)}</g>`
  + `<g class="cc-alca" data-lado="e">${fio(ALCA_E)}</g>`
  + `<g class="cc-alca" data-lado="d">${fio(ALCA_D)}</g>`
  + '</g>'
  + '<path class="cc-lacre" d="M80 39c-6.2-4.3-8.8-7.6-8.8-10.6a4.4 4.4 0 0 1 8.8-1.7 4.4 4.4 0 0 1 8.8 1.7c0 3-2.6 6.3-8.8 10.6z"/>'
  + '</svg>';

/** FOV vertical da câmera do mundo: 58° em pé, 42° deitado (a mesma conta de mundo.js). */
function fovPara(aspecto) {
  return lerp(58, 42, clamp((aspecto - 0.8) / 0.55));
}

/* ---- escrita à mão ------------------------------------------------------------ */

const COM_PREFIXO = 'webkitClipPath' in document.documentElement.style;

/** Linhas → palavras (que não quebram) → letras. Devolve as letras, na ordem. */
function montarLetras(caixa, texto) {
  caixa.textContent = '';
  const letras = [];
  for (const linha of String(texto ?? '').split('\n')) {
    const l = el('span', 'cc-linha');
    linha.split(/\s+/).filter(Boolean).forEach((termo, i) => {
      if (i) l.append(' ');
      const palavra = el('span', 'cc-palavra');
      for (const c of termo) {
        const letra = el('span', { class: 'cc-letra', texto: c });
        palavra.append(letra);
        letras.push(letra);
      }
      l.append(palavra);
    });
    caixa.append(l);
  }
  return letras;
}

/** Escreve letra por letra, com a caneta. `aoMontar` mede antes de a tinta correr. */
function escrever(gsap, alvo, texto, { calmo = false, som = null, intensidade = 0.6, aoMontar = null } = {}) {
  const letras = montarLetras(alvo, texto);
  aoMontar?.();
  if (!letras.length || !gsap) return Promise.resolve();
  const passo = clamp(1.5 / letras.length, 0.05, 0.11);
  som?.efeito?.('caneta', { duracao: Math.min(2.4, letras.length * passo + 0.2), intensidade });
  if (calmo) {
    return comoPromise(gsap.fromTo(letras, { opacity: 0 }, { opacity: 1, duration: 0.35, stagger: passo * 0.5, ease: 'none' }));
  }
  // O recorte abre da esquerda para a direita, como a ponta da caneta. Onde o
  // prefixo -webkit- existe (Safari), os dois correm juntos.
  const fechado = 'inset(-10% 100% -10% 0%)';
  const aberto = 'inset(-10% 0% -10% 0%)';
  const de = { clipPath: fechado, opacity: 0.4 };
  const para = { clipPath: aberto };
  if (COM_PREFIXO) {
    de.webkitClipPath = fechado;
    para.webkitClipPath = aberto;
  }
  return comoPromise(gsap.fromTo(letras, de,
    {
      ...para,
      opacity: 1,
      duration: passo * 1.9,
      stagger: passo,
      ease: 'power1.inOut',
      // Texto parado com recorte custa composição à toa.
      onComplete: () => letras.forEach((l) => { l.style.clipPath = ''; l.style.webkitClipPath = ''; }),
    }));
}

/* ---- memória das cartas abertas (para a retomada) ------------------------------ */

function lembradas() {
  try {
    const ids = JSON.parse(localStorage.getItem(CHAVE) || '[]');
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function lembrarNaBolsa(id) {
  try {
    const ids = [...lembradas()];
    if (!ids.includes(id)) ids.push(id);
    localStorage.setItem(CHAVE, JSON.stringify(ids));
  } catch {
    /* aba anônima ou armazenamento cheio: a retomada fica sem as cartas */
  }
}

function esquecerChao() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* sem armazenamento */
  }
}

/* ---- o visor: vídeo, galeria ou cartão de exemplo ------------------------------- */

/** Solta um vídeo de vez: o iPhone segura poucos decodificadores vivos. */
function soltar(video) {
  if (!video) return;
  try {
    video.pause();
    video.removeAttribute('src');
    video.load();
  } catch {
    /* já estava solto */
  }
}

/** De onde a moldura sai e para onde volta: o centro e o tamanho da carta no chão. */
function saidaPara(no, q) {
  if (!no?.isConnected || !q?.width) return null;
  const r = no.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return {
    x: r.left + r.width / 2 - (q.left + q.width / 2),
    y: r.top + r.height / 2 - (q.top + q.height / 2),
    scale: clamp(r.width / q.width, 0.16, 0.8),
    rotation: -5,
  };
}

const visivel = (n) => !!n?.isConnected && !n.disabled && n.getClientRects().length > 0;

/** O foco volta de onde saiu; se lá sumiu (a folha da bolsa fechou), vai ao botão da bolsa. */
function devolverFoco(no) {
  if (!no || no === document.body) return;
  const alvo = visivel(no) ? no : document.querySelector('[data-acao="inventario"]');
  if (visivel(alvo)) alvo.focus({ preventScroll: true });
}

// Um visor só por página: a cena e a bolsa (retomada, fim, menu) abrem o mesmo.
let visorFora = null;
const visorDe = (ctx) => (visorFora ||= criarVisor(ctx));

function criarVisor(ctx) {
  const { conteudo, som, amb, musica, inventario, diretor } = ctx;
  const gsap = ctx.gsap || window.gsap;
  const calmo = !!amb?.reduzido;
  const dados = conteudo?.cartasChao || {};
  const rotulos = dados.rotulos || {};
  const falhas = new Set(); // vídeos que não abriram: reabrem como cartão com o nome
  let aberto = false;
  let atual = null;
  let abafada = false;
  let pausouMusica = false;

  // A música abaixa a 4% enquanto o vídeo fala; sem Web Audio não há volume
  // fino, e ela pausa de verdade.
  function abaixarMusica() {
    if (abafada) return;
    abafada = true;
    const diag = som?.diagnostico?.();
    // No mudo não há o que pausar: cai no abafar, que é vazio.
    if (diag && !diag.webAudio && !diag.mudo && som.estado?.tocando) {
      pausouMusica = true;
      som.pausar?.();
    } else {
      som?.abafar?.(ABAFAR, ABAFAR_MS);
    }
  }

  function voltarMusica() {
    if (!abafada) return;
    abafada = false;
    if (pausouMusica) {
      pausouMusica = false;
      som?.retomar?.();
      return;
    }
    som?.abafar?.(1, 0);
    // O iPhone para a música quando um vídeo toca, e o motor continua achando que ela toca.
    if (som?.diagnostico?.()?.pausado && som.estado?.tocando) {
      som.pausar?.();
      som.retomar?.();
    }
  }

  function cartao(carta, { semGlifo = false } = {}) {
    const galeria = carta.tipo === 'galeria';
    const modelo = galeria ? dados.vazioSurpresinha : dados.vazio;
    // O vídeo que falhou mostra só o nome (no rodapé); aqui ele é dito ao leitor de tela.
    const texto = semGlifo ? carta.nome : String(modelo || '').replaceAll('{nome}', carta.nome);
    const caixa = el('div', { class: 'visor-cartao', dataset: semGlifo ? { falhou: '1' } : null });
    if (!semGlifo) caixa.append(svg(galeria ? GLIFO_CORACAO : GLIFO_VIDEO));
    if (texto) caixa.append(el('p', { class: 'carta-chao-vazio', texto }));
    return caixa;
  }

  /** Abre a carta. Tem de ser chamado dentro do toque: o Safari só deixa o vídeo tocar com som assim. */
  function mostrar(carta, { de = null } = {}) {
    if (aberto) return atual;
    aberto = true;
    atual = new Promise((resolve) => abrir(carta, de, resolve));
    return atual;
  }

  function abrir(carta, de, resolve) {
    const palco = document.getElementById('palco') || document.body;
    const sinal = new AbortController();
    const ouvir = (alvo, evento, fn, op) => alvo.addEventListener(evento, fn, { ...op, signal: sinal.signal });
    const focoAntes = document.activeElement;
    const { nome } = carta;
    const tipo = falhas.has(carta.id) ? 'vazio' : carta.video ? 'video' : carta.midias?.length ? 'galeria' : 'vazio';
    let falhou = falhas.has(carta.id);
    let fechando = false;
    let terminou = false;
    let quadroId = 0;
    let alternar = null;
    let tocarVideo = null;
    let saida = null;
    let seguranca = null;
    let escrita = null;
    let repouso = null;
    const videos = [];

    const nomeEl = el('p', { class: 'visor-nome ui-titulo', 'aria-hidden': 'true' });
    const rodape = el('div', 'visor-rodape', nomeEl);
    const miolo = el('div', 'visor-miolo');
    const papel = el('div', 'visor-papel ui-folha', [
      el('span', { class: 'ui-laco', dataset: { onde: 'topo' }, 'aria-hidden': 'true' }),
      miolo,
      rodape,
    ]);
    const quadro = el('div', 'visor-quadro', papel);
    const veu = el('div', { class: 'visor-veu', 'aria-hidden': 'true' });
    const fechar = el('button', {
      type: 'button',
      class: 'carta-chao-fechar ui-redondo',
      'aria-label': rotulos.fechar || 'Fechar',
      dataset: { acao: 'fechar-carta', tom: 'noite' },
    }, svg(ICONE.fechar));
    const raiz = el('div', {
      class: 'carta-chao-visor',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': nome,
      dataset: { tipo },
    }, [veu, quadro, fechar]);

    const virarCartao = (semGlifo) => {
      const tinhaFoco = miolo.contains(document.activeElement);
      miolo.replaceChildren(cartao(carta, { semGlifo }));
      rodape.querySelector('.ui-coracao')?.remove();
      papel.classList.remove('visor-carregando', 'visor-pausado', 'visor-galeria');
      raiz.dataset.tipo = 'vazio';
      if (tinhaFoco) fechar.focus({ preventScroll: true });
    };

    // Vídeo que não carrega vira cartão com o nome e conta como visto: nada trava.
    const falhar = () => {
      if (falhou || fechando) return;
      falhou = true;
      falhas.add(carta.id);
      alternar = null;
      cancelAnimationFrame(quadroId);
      videos.forEach(soltar);
      voltarMusica();
      virarCartao(true);
    };

    /* -- vídeo: sem controles nativos; tocar na imagem pausa e toca -- */
    function montarVideo() {
      papel.classList.add('visor-carregando');
      const video = el('video', {
        class: 'visor-video',
        playsinline: true,
        'webkit-playsinline': true,
        disablepictureinpicture: true,
        disableremoteplayback: true,
        preload: 'auto',
        poster: carta.capa || null,
        'aria-hidden': 'true',
      });
      video.playsInline = true;
      video.controls = false;
      video.src = carta.video;
      videos.push(video);
      const tocarTexto = rotulos.tocar || 'Tocar o vídeo';
      const pausarTexto = rotulos.pausar || 'Pausar o vídeo';
      const tela = el('div', { class: 'visor-tela', role: 'button', tabindex: '0', 'aria-label': pausarTexto }, [
        video,
        el('span', { class: 'visor-pausa', 'aria-hidden': 'true' }, svg(ICONE.tocar)),
      ]);
      const tocar = el('button', { type: 'button', class: 'visor-tocar ui-redondo', hidden: true, 'aria-label': tocarTexto }, svg(ICONE.tocar));
      const linha = el('span', 'visor-progresso-fio');
      const conta = el('span', 'visor-progresso-conta');
      miolo.append(tela, tocar, el('div', { class: 'visor-progresso', 'aria-hidden': 'true' }, [linha, conta]));

      const rotular = (tocando) => tela.setAttribute('aria-label', tocando ? pausarTexto : tocarTexto);
      const recusou = (erro) => {
        if (fechando || falhou) return;
        if (erro?.name === 'NotAllowedError') {
          // O navegador não deixou tocar sozinho: o botão pede o toque dela.
          papel.classList.remove('visor-carregando');
          tocar.hidden = false;
          rotular(false);
        } else if (erro?.name !== 'AbortError') {
          falhar();
        }
      };
      tocarVideo = () => {
        if (fechando || falhou) return;
        abaixarMusica();
        try {
          video.play()?.catch?.(recusou);
        } catch (erro) {
          recusou(erro);
        }
      };
      alternar = () => {
        if (fechando || falhou) return;
        if (video.paused || video.ended) tocarVideo();
        else video.pause();
      };
      // O andamento: escala da linha e passo da conta, só transform.
      const pintar = () => {
        const d = video.duration;
        const p = Number.isFinite(d) && d > 0 ? clamp(video.currentTime / d) : 0;
        linha.style.transform = `scaleX(${p.toFixed(4)})`;
        conta.style.transform = `translateX(${(p * 100).toFixed(2)}%)`;
        quadroId = requestAnimationFrame(pintar);
      };

      ouvir(video, 'loadedmetadata', () => {
        if (video.videoWidth && video.videoHeight) {
          papel.style.setProperty('--aspecto', (video.videoWidth / video.videoHeight).toFixed(4));
        }
      });
      ouvir(video, 'waiting', () => {
        if (!video.paused) papel.classList.add('visor-carregando');
      });
      ouvir(video, 'playing', () => {
        papel.classList.remove('visor-carregando', 'visor-pausado');
        if (document.activeElement === tocar) tela.focus({ preventScroll: true });
        tocar.hidden = true;
        rotular(true);
      });
      ouvir(video, 'pause', () => {
        if (fechando || falhou || video.ended) return;
        papel.classList.remove('visor-carregando');
        papel.classList.add('visor-pausado');
        rotular(false);
      });
      ouvir(video, 'ended', () => fecharVisor());
      ouvir(video, 'error', falhar);
      ouvir(tela, 'click', () => alternar?.());
      ouvir(tela, 'keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        alternar?.();
      });
      ouvir(tocar, 'click', () => tocarVideo());
      // O app saiu da tela: o vídeo espera por ela, pausado.
      ouvir(document, 'visibilitychange', () => {
        if (document.hidden && !video.paused) video.pause();
      });
      quadroId = requestAnimationFrame(pintar);
    }

    /* -- galeria: trilho com scroll-snap, polaroides, setas e pontos -- */
    function montarGaleria() {
      papel.classList.add('visor-galeria');
      rodape.append(el('span', { class: 'ui-coracao', 'aria-hidden': 'true' }));
      const trilho = el('div', { class: 'carta-chao-galeria', tabindex: '0', role: 'group', 'aria-label': nome });
      const pontos = el('div', { class: 'galeria-pontos', 'aria-hidden': 'true' });
      const seta = (lado) => el('button', {
        type: 'button',
        class: 'galeria-seta ui-redondo',
        'aria-label': rotulos[lado] || (lado === 'anterior' ? 'Anterior' : 'Próxima'),
        dataset: { lado },
      }, svg(ICONE[lado]));
      const anterior = seta('anterior');
      const proxima = seta('proxima');
      miolo.append(el('div', 'galeria-moldura', [trilho, anterior, proxima]), pontos);

      const lista = [];
      let indice = 0;
      let agendado = 0;

      const desabilitar = (botao, sim) => {
        // A seta que some com o foco largaria o foco no nada.
        if (sim && document.activeElement === botao) trilho.focus({ preventScroll: true });
        botao.disabled = sim;
      };
      const atualizar = () => {
        agendado = 0;
        if (!lista.length || fechando) return;
        indice = clamp(Math.round(trilho.scrollLeft / (trilho.clientWidth || 1)), 0, lista.length - 1);
        const varios = lista.length > 1;
        pontos.hidden = !varios;
        anterior.hidden = !varios;
        proxima.hidden = !varios;
        desabilitar(anterior, indice <= 0);
        desabilitar(proxima, indice >= lista.length - 1);
        lista.forEach((r, i) => {
          r.ponto.toggleAttribute('data-atual', i === indice);
          // Só toca o que está à vista.
          if (i !== indice && r.midia.tagName === 'VIDEO' && !r.midia.paused) r.midia.pause();
        });
      };
      const ir = (i) => {
        if (!lista.length) return;
        trilho.scrollTo({ left: clamp(i, 0, lista.length - 1) * trilho.clientWidth, behavior: calmo ? 'auto' : 'smooth' });
      };
      // Imagem ou vídeo que não abre sai da lista; sem nada, o cartão de exemplo.
      const tirar = (registro) => {
        const i = lista.indexOf(registro);
        if (i < 0 || fechando) return;
        lista.splice(i, 1);
        registro.item.remove();
        registro.ponto.remove();
        if (registro.midia.tagName === 'VIDEO') soltar(registro.midia);
        if (lista.length) atualizar();
        else virarCartao(false);
      };

      for (const m of carta.midias) {
        const midia = m.foto
          ? el('img', { src: m.foto, alt: '', decoding: 'async', draggable: 'false' })
          : el('video', {
            src: m.video,
            controls: true,
            playsinline: true,
            'webkit-playsinline': true,
            disablepictureinpicture: true,
            preload: 'metadata',
          });
        const legenda = m.legenda?.trim() ? el('figcaption', { texto: m.legenda.trim() }) : null;
        const item = el('div', 'galeria-item', el('figure', 'galeria-polaroide', [el('div', 'galeria-midia', midia), legenda]));
        const registro = { item, midia, ponto: el('span', 'galeria-ponto') };
        lista.push(registro);
        trilho.append(item);
        pontos.append(registro.ponto);
        ouvir(midia, 'error', () => tirar(registro));
        if (midia.tagName === 'VIDEO') {
          midia.playsInline = true;
          videos.push(midia);
          ouvir(midia, 'play', abaixarMusica);
        }
      }
      ouvir(trilho, 'scroll', () => {
        agendado ||= requestAnimationFrame(atualizar);
      }, { passive: true });
      ouvir(trilho, 'keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        ir(indice + (e.key === 'ArrowLeft' ? -1 : 1));
      });
      ouvir(anterior, 'click', () => ir(indice - 1));
      ouvir(proxima, 'click', () => ir(indice + 1));
      atualizar();
    }

    if (tipo === 'video') montarVideo();
    else if (tipo === 'galeria') montarGaleria();
    else miolo.append(cartao(carta, { semGlifo: falhou }));

    /* -- teclado: Esc fecha, Tab fica dentro, Espaço e k alternam o vídeo -- */
    const focaveis = () => [...raiz.querySelectorAll('button, [tabindex="0"], video[controls], a[href]')].filter(visivel);
    ouvir(document, 'keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        fecharVisor();
      } else if (e.key === 'Tab') {
        const lista = focaveis();
        if (!lista.length) return;
        e.preventDefault();
        const i = lista.indexOf(document.activeElement);
        const proximo = i < 0 ? lista[0] : lista[(i + (e.shiftKey ? -1 : 1) + lista.length) % lista.length];
        proximo.focus({ preventScroll: true });
      } else if (alternar && (e.key === 'k' || e.key === 'K'
        // Espaço num botão de verdade (fechar, tocar) é o clique dele.
        || (e.key === ' ' && document.activeElement?.tagName !== 'BUTTON'))) {
        e.preventDefault();
        e.stopPropagation();
        alternar();
      }
    }, { capture: true });
    ouvir(fechar, 'click', () => fecharVisor());

    function fim() {
      if (terminou) return;
      terminou = true;
      escrita?.kill();
      saida?.kill();
      seguranca?.kill();
      sinal.abort();
      cancelAnimationFrame(quadroId);
      videos.forEach(soltar);
      gsap.killTweensOf([veu, fechar, quadro]);
      raiz.remove();
      aberto = false;
      atual = null;
      voltarMusica();
      musica?.mostrarMini?.();
      if (diretor?.cena === 'cartas') ctx.mundo?.petalas?.definirDensidade?.(1);
      if (inventario?.itens?.length) inventario.mostrarBotao?.();
      devolverFoco(focoAntes);
      resolve({ falhou });
    }

    // A saída é mais rápida que a entrada e sem mola.
    function fecharVisor() {
      if (fechando) return;
      fechando = true;
      escrita?.kill();
      cancelAnimationFrame(quadroId);
      for (const v of videos) {
        try { v.pause(); } catch { /* ignora */ }
      }
      // Uma animação de abrir não pode matar a de fechar (overwrite): as de
      // abrir saem antes, e a rede de segurança termina em 0,8 s de qualquer jeito.
      const emRepouso = !gsap.isTweening(quadro);
      gsap.killTweensOf([veu, fechar, quadro]);
      const volta = !calmo && de ? saidaPara(de, emRepouso ? quadro.getBoundingClientRect() : repouso) : null;
      saida = gsap.timeline({ onComplete: fim });
      saida.to(fechar, { opacity: 0, duration: 0.14, ease: 'none' }, 0);
      saida.to(veu, { autoAlpha: 0, duration: 0.32, ease: 'none' }, 0);
      if (volta) {
        saida.to(quadro, { x: volta.x, y: volta.y, scale: volta.scale, rotation: volta.rotation, duration: 0.36, ease: 'power2.inOut' }, 0);
        saida.to(quadro, { autoAlpha: 0, duration: 0.16, ease: 'none' }, 0.2);
      } else {
        saida.to(quadro, { autoAlpha: 0, scale: calmo ? 1 : 0.97, duration: calmo ? 0.3 : 0.2, ease: curvas.branco.sair }, 0);
      }
      seguranca = gsap.delayedCall(0.8, fim);
    }

    /* -- entrada -- */
    // O visor cobre o mini e a bolsa (estão acima do palco): os dois saem e voltam no fim.
    musica?.esconderMini?.();
    inventario?.esconderBotao?.();
    if (diretor?.cena === 'cartas') ctx.mundo?.petalas?.definirDensidade?.(0.3);
    palco.append(raiz);
    repouso = quadro.getBoundingClientRect();
    const origem = calmo ? null : saidaPara(de, repouso);
    gsap.fromTo(veu, { autoAlpha: 0 }, { autoAlpha: 1, duration: calmo ? 0.4 : 0.5, ease: 'none' });
    // Só opacidade: com autoAlpha o botão não receberia o foco agora.
    gsap.fromTo(fechar, { opacity: 0 }, { opacity: 1, duration: 0.3, delay: calmo ? 0 : 0.3, ease: 'none' });
    if (origem) {
      // A moldura sobe da carta no chão.
      gsap.fromTo(quadro,
        { x: origem.x, y: origem.y, rotation: origem.rotation, autoAlpha: 0 },
        { x: 0, y: 0, rotation: 0, autoAlpha: 1, duration: 0.6, ease: curvas.branco.entrar });
      gsap.fromTo(quadro, { scale: origem.scale }, { scale: 1, duration: 0.62, ease: 'back.out(1.25)' });
    } else if (calmo) {
      gsap.fromTo(quadro, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.45, ease: 'none' });
    } else {
      gsap.fromTo(quadro, { autoAlpha: 0, scale: 0.94 }, { autoAlpha: 1, scale: 1, duration: 0.42, ease: 'back.out(1.25)' });
    }
    escrita = gsap.delayedCall(calmo ? 0.3 : 0.55, () => {
      if (!fechando) escrever(gsap, nomeEl, nome, { calmo, som });
    });
    fechar.focus({ preventScroll: true });
    // Ainda dentro do toque dela: é o que o Safari exige para tocar com som.
    tocarVideo?.();
  }

  return {
    mostrar,
    voltarMusica,
    get aberto() { return aberto; },
  };
}

/** Reabre uma carta do chão (pela bolsa, fora da cena). Resolve quando o visor fecha. */
export function abrirCartaDoChao(ctx, id) {
  const carta = cartasDoChao(ctx?.conteudo).find((c) => c.id === id);
  if (!carta) return Promise.resolve();
  return visorDe(ctx).mostrar(carta);
}

/** Retomada depois da cena: as cartas lembradas voltam para a bolsa, na ordem em que ela as abriu. */
export function semearCartas(ctx) {
  const inv = ctx?.inventario;
  if (!inv?.guardar) return;
  const cartas = cartasDoChao(ctx.conteudo);
  for (const id of lembradas()) {
    const carta = cartas.find((c) => c.id === id);
    if (carta) inv.guardar({ id, tipo: carta.tipo, titulo: carta.nome, abrir: () => abrirCartaDoChao(ctx, id) });
  }
}

/* ---- a cena -------------------------------------------------------------------- */

export async function cenaCartas(ctx, { frio = false } = {}) {
  const { conteudo, diretor, mundo, musica, inventario, som, amb, estado } = ctx;
  const gsap = ctx.gsap || window.gsap;
  const calmo = !!amb?.reduzido;
  const dados = conteudo?.cartasChao || {};
  const rotulos = dados.rotulos || {};
  const visor = visorDe(ctx);
  const palco = document.getElementById('palco');
  const acoes = document.getElementById('acoes');
  const sinal = new AbortController();
  const ouvir = (alvo, evento, fn, op) => alvo?.addEventListener(evento, fn, { ...op, signal: sinal.signal });
  const cancelar = [];

  const campo = el('div', 'cartas-chao-campo');
  const leitor = el('p', { class: 'so-leitor', 'aria-live': 'polite' });
  const raiz = el('div', 'cartas-chao', [campo, leitor]);
  if (acoes?.parentNode) acoes.parentNode.insertBefore(raiz, acoes);
  else (palco || document.body).append(raiz);

  const olhar = { k: 0 };
  const abertas = new Set();
  const acesoAntes = Number(estado.fio?.acender?.()) || 0;
  const itens = [];
  let medida = null;
  let eleFrio = null;
  let frase = null;
  let fraseFora = false;
  let botaoSeguir = null;
  let ocupado = false;
  let saindo = false;
  let vivo = true;
  let pulsando = false;
  let pulsoAtual = null;
  let tweenLuz = null;
  let faisca = null;
  let ultimaLuz = -Infinity;
  let medindo = 0;
  let resolverFim;
  const fim = new Promise((resolve) => { resolverFim = resolve; });

  // O aviso precisa mudar de texto para o leitor de tela repetir o mesmo nome.
  const anunciar = (texto) => {
    leitor.textContent = '';
    requestAnimationFrame(() => {
      if (vivo) leitor.textContent = texto || '';
    });
  };

  /* -- a câmera da cena: as mesmas contas do mundo, em DOM -- */

  // Um ponto do mundo (y a partir dos olhos, z negativo para a frente) visto
  // pela câmera inclinada: quanto sobe e quanto está à frente dela.
  const cima = (y, z, ct, st) => y * ct - z * st;
  const frente = (y, z, ct, st) => -y * st - z * ct;

  function eixos(item, giro, vira) {
    const psi = (item.guinada + giro) * GRAU;
    const fi = (item.tombo + vira) * GRAU;
    const cp = Math.cos(psi);
    const sp = Math.sin(psi);
    const cf = Math.cos(fi);
    const sf = Math.sin(fi);
    return { u: [cp, 0, sp], v: [-sp * cf, -sf, cp * cf], sf };
  }

  // O centro da carta: balança enquanto cai e, deitada com o tombo, apoia a borda no chão.
  function centro(item, alt, sf) {
    return [
      item.X + Math.sin(alt * 3.1 + item.fase) * 0.16 * Math.min(1, alt),
      0.012 + (item.larg * PROPORCAO / 2) * Math.abs(sf) + alt - ALTURA_OLHOS,
      -item.d,
    ];
  }

  function matrizDe(item, a, k) {
    const { f, teta, S } = medida;
    const th = teta * k;
    const ct = Math.cos(th);
    const st = Math.sin(th);
    const { u, v, sf } = eixos(item, a.giro, a.vira);
    const p = centro(item, a.alt, sf);
    // Colunas no espaço do CSS (y para baixo, z para ela): x, −cima, −frente.
    const css = (w) => [w[0], -cima(w[1], w[2], ct, st), -frente(w[1], w[2], ct, st)];
    const c1 = css(u);
    const c2 = css(v);
    // A terceira sai do produto das duas: a base fica uma rotação de verdade,
    // sem o espelho que o eixo y do CSS traria (a face continua a da frente).
    const c3 = [c1[1] * c2[2] - c1[2] * c2[1], c1[2] * c2[0] - c1[0] * c2[2], c1[0] * c2[1] - c1[1] * c2[0]];
    const t = [p[0] * S, -cima(p[1], p[2], ct, st) * S, f - frente(p[1], p[2], ct, st) * S];
    const n = (x) => x.toFixed(5);
    return `matrix3d(${n(c1[0])},${n(c1[1])},${n(c1[2])},0,${n(c2[0])},${n(c2[1])},${n(c2[2])},0,`
      + `${n(c3[0])},${n(c3[1])},${n(c3[2])},0,${t[0].toFixed(2)},${t[1].toFixed(2)},${t[2].toFixed(2)},1)`;
  }

  /** A caixa na tela da carta em repouso, com o olhar todo no chão (k = 1). */
  function caixaEmRepouso(item) {
    const { L, A, f, teta } = medida;
    const ct = Math.cos(teta);
    const st = Math.sin(teta);
    const { u, v, sf } = eixos(item, 0, 0);
    const p = centro(item, 0, sf);
    const meiaL = item.larg / 2;
    const meiaA = (item.larg * PROPORCAO) / 2;
    const caixa = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = p[0] + u[0] * i * meiaL + v[0] * j * meiaA;
      const y = p[1] + u[1] * i * meiaL + v[1] * j * meiaA;
      const z = p[2] + u[2] * i * meiaL + v[2] * j * meiaA;
      const fr = frente(y, z, ct, st);
      const sx = L / 2 + (f * x) / fr;
      const sy = A / 2 - (f * cima(y, z, ct, st)) / fr;
      caixa.left = Math.min(caixa.left, sx);
      caixa.right = Math.max(caixa.right, sx);
      caixa.top = Math.min(caixa.top, sy);
      caixa.bottom = Math.max(caixa.bottom, sy);
    }
    return caixa;
  }

  /** Mede a tela: o olhar, as distâncias do chão e o lugar, o tamanho e o botão de cada carta. */
  function medir() {
    medindo = 0;
    const L = palco?.clientWidth || innerWidth;
    const A = palco?.clientHeight || innerHeight;
    const aspecto = L / A;
    const tanM = Math.tan((fovPara(aspecto) * Math.PI) / 360);
    const f = A / (2 * tanM);
    // O olhar desce até o chão entre os dois caber na tela (entre 8° e 20°).
    const teta = clamp(Math.atan(0.84 * tanM) - Math.atan(0.28 / DIST_ELE), 8 * GRAU, 20 * GRAU);
    const dPerto = clamp(ALTURA_OLHOS / Math.tan(teta + Math.atan(0.58 * tanM)), 1.7, 3.1);
    const dLonge = clamp(Math.max(dPerto + 1.25, 3.95), dPerto + 1.1, 4.25);
    const S = f / 3.1; // px por metro: a 3,1 m a carta fica no tamanho do CSS
    const emPe = aspecto < 0.9;
    const meia = (dPerto * Math.cos(teta) + ALTURA_OLHOS * Math.sin(teta)) * tanM * aspecto;
    const abre = emPe ? clamp((meia - 0.27) / 0.37, 0.6, 1.25) : clamp((meia - 0.3) / 1.9, 0.45, 1);
    const maior = emPe ? 1.7 : lerp(1.32, 1.7, clamp((abre - 0.76) / 0.1));
    const lugares = emPe ? LUGARES_EM_PE : LUGARES_DEITADO;
    medida = { L, A, f, teta, S };
    campo.style.perspective = `${f.toFixed(1)}px`;

    for (const item of itens) {
      const lugar = item.ultima ? lugares[6] : lugares[item.amigo % 6];
      // Mais de seis amigos: outra fileira, um palmo ao lado.
      const volta = item.ultima ? 0 : Math.floor(item.amigo / 6);
      item.d = lerp(dPerto, dLonge, lugar.t);
      item.X = lugar.x * (lugar.fixo ? 1 : abre) + volta * 0.2;
      item.larg = LARGURA * (item.ultima ? maior : 1);
      item.w = item.larg * S;
      const h = item.w * PROPORCAO;
      const z = String(100 - Math.round(item.d * 10));
      Object.assign(item.desenho.style, {
        width: `${item.w.toFixed(1)}px`,
        height: `${h.toFixed(1)}px`,
        marginLeft: `${(-item.w / 2).toFixed(1)}px`,
        marginTop: `${(-h / 2).toFixed(1)}px`,
        zIndex: z,
      });
      item.desenho.style.setProperty('--b', `${item.w.toFixed(1)}px`);
      // O botão é a carta em repouso projetada, crescida até o alvo de toque.
      const c = caixaEmRepouso(item);
      const folgaX = Math.max(0, (ALVO_MIN - (c.right - c.left)) / 2);
      const folgaY = Math.max(0, (ALVO_MIN - (c.bottom - c.top)) / 2);
      Object.assign(item.botao.style, {
        left: `${(c.left - folgaX).toFixed(1)}px`,
        top: `${(c.top - folgaY).toFixed(1)}px`,
        width: `${(c.right - c.left + 2 * folgaX).toFixed(1)}px`,
        height: `${(c.bottom - c.top + 2 * folgaY).toFixed(1)}px`,
        zIndex: z,
      });
      item.matriz = '';
      if (item.escrito) caberNome(item);
    }
  }

  function posar(item) {
    const m = matrizDe(item, item.a, olhar.k);
    if (m !== item.matriz) {
      item.matriz = m;
      item.desenho.style.transform = m;
    }
    const op = clamp(item.a.op).toFixed(3);
    if (op !== item.op) {
      item.op = op;
      item.desenho.style.opacity = op;
    }
    // A sombra de folha pousada aparece quando a carta assenta.
    const sombra = clamp(1 - item.a.alt / 0.45).toFixed(2);
    if (sombra !== item.sombraOp) {
      item.sombraOp = sombra;
      item.sombra.style.opacity = sombra;
    }
  }

  /* -- o nome escrito na carta -- */

  /** Começa em 19% da largura da carta e encolhe 5% por passo enquanto estoura, até 16 passos. */
  function caberNome(item) {
    const n = item.nomeEl;
    let tam = item.w * 0.19;
    n.style.fontSize = `${tam.toFixed(2)}px`;
    for (let i = 0; i < 16 && (n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1); i++) {
      tam *= 0.95;
      n.style.fontSize = `${tam.toFixed(2)}px`;
    }
  }

  function escreverNome(item) {
    if (item.escrito) return Promise.resolve();
    item.escrito = true;
    return escrever(gsap, item.nomeEl, item.carta.nome, { calmo, som, aoMontar: () => caberNome(item) });
  }

  function marcar(item, estadoNovo) {
    item.botao.dataset.estado = estadoNovo;
    item.desenho.dataset.estado = estadoNovo;
    item.botao.setAttribute('aria-label', item.carta.nome);
  }

  const guardarNaBolsa = ({ carta }) => inventario?.guardar?.({
    id: carta.id,
    tipo: carta.tipo,
    titulo: carta.nome,
    abrir: () => visor.mostrar(carta),
  });

  const fechadas = () => itens.filter((i) => !i.ultima && !abertas.has(i.carta.id));

  /** A Surpresinha tira o laço quando as outras já foram vistas. */
  function destrancar() {
    const s = itens.find((i) => i.ultima);
    if (!s || !s.botao.hasAttribute('data-trancada') || fechadas().length) return;
    for (const no of [s.botao, s.desenho]) {
      no.removeAttribute('data-trancada');
      no.removeAttribute('data-negou');
    }
    s.botao.removeAttribute('aria-disabled');
  }

  // Tocada antes da hora, ela não abre: o laço só aperta.
  function negar({ desenho }) {
    desenho.removeAttribute('data-negou');
    void desenho.offsetWidth; // reinicia a animação
    desenho.dataset.negou = '1';
  }

  /* -- a luz do fio: responde a cada carta, sem anunciar nada -- */

  function nivelDoFio(fio, alvo, duracao, ease) {
    tweenLuz?.kill();
    const luz = { v: Number(fio.acender()) || 0 };
    tweenLuz = gsap.to(luz, { v: alvo, duration: duracao, ease, onUpdate: () => fio.acender(luz.v) });
    return tweenLuz;
  }

  function correrLuz() {
    const fio = estado.fio;
    if (!vivo || saindo || pulsando || typeof fio?.pulso !== 'function') return;
    const etapa = diretor.etapa();
    if (etapa !== 'escolhendo' && etapa !== 'assistindo') return;
    pulsando = true;
    ultimaLuz = performance.now();
    faisca?.kill();
    // Quando a luz chega ao fim do fio, uma faísca na mão dele.
    faisca = gsap.delayedCall(1.6, () => {
      const ancora = (estado.ele || eleFrio)?.ancora?.();
      if (ancora && !saindo) fio.faiscar?.(ancora, 14);
    });
    pulsoAtual = Promise.resolve(fio.pulso({ de: 0.1, ate: 1, duracao: 1.6, forca: 0.9, brasas: 10 }))
      .catch(() => {})
      .then(() => {
        pulsando = false;
        pulsoAtual = null;
        // Saindo, a luz não cria tween de nível: ele sobrescreveria o apagar
        // (era a carta presa depois do toque duplo em "Seguir em frente").
        if (saindo || !vivo) return;
        nivelDoFio(fio, acesoAntes + (0.4 * abertas.size) / Math.max(1, itens.length), 0.8, 'sine.out');
      });
  }

  // Ao seguir, a luz volta ao nível de antes da cena, com prazo para não prender.
  async function apagarLuz() {
    const fio = estado.fio;
    if (typeof fio?.acender !== 'function') return;
    faisca?.kill();
    if (pulsoAtual) await Promise.race([pulsoAtual, espera(3000)]);
    const durApagar = calmo ? 0.8 : 1.2;
    await Promise.race([comoPromise(nivelDoFio(fio, acesoAntes, durApagar, 'sine.inOut')), espera(durApagar * 1000 + 600)]);
    tweenLuz?.kill();
    fio.acender(acesoAntes);
  }

  /* -- quedas -- */

  function cair(item) {
    const { a, k } = item;
    if (calmo) {
      Object.assign(a, REPOUSO, { op: 0 });
      return comoPromise(gsap.to(a, { op: 1, duration: 0.7, delay: 0.1 * k, ease: 'none' }));
    }
    Object.assign(a, { alt: 1.25 + (k % 3) * 0.14, giro: (k % 2 ? 1 : -1) * (50 + 9 * k), vira: 34, op: 0 });
    const atraso = 0.2 * k;
    gsap.to(a, { op: 1, duration: 0.3, delay: atraso, ease: 'none' });
    gsap.to(a, { giro: 0, vira: 0, duration: 1.5, delay: atraso, ease: 'power2.out' });
    return comoPromise(gsap.to(a, {
      alt: 0,
      duration: 1.35,
      delay: atraso,
      ease: 'sine.in',
      onComplete: () => {
        // O papel bate no chão e assenta.
        som?.efeito?.('papel', { intensidade: 0.25 });
        gsap.fromTo(a, { vira: -7 }, { vira: 0, duration: 0.9, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
      },
    }));
  }

  /* -- seguir em frente -- */

  /** Aparece discreto depois da primeira carta, só com a frase do chão já fora; destaca-se com todas abertas. */
  function atualizarSeguir() {
    if (!vivo || saindo || !fraseFora || !abertas.size) return false;
    if (!botaoSeguir) {
      botaoSeguir = el('button', {
        type: 'button',
        class: 'ui-pilula cartas-chao-seguir cartas-chao-seguir-visivel ui-entra',
        dataset: { acao: 'seguir-cartas' },
      }, [el('span', { texto: dados.seguir || 'Seguir em frente' }), svg(ICONE.seta)]);
      // Sem a classe de entrada depois que ela acaba: o preenchimento da animação
      // seguraria o transform e a pílula não afundaria no dedo.
      ouvir(botaoSeguir, 'animationend', (e) => {
        if (e.target === botaoSeguir && !e.pseudoElement) botaoSeguir.classList.remove('ui-entra');
      });
      ouvir(botaoSeguir, 'touchstart', () => {}, { passive: true });
      ouvir(botaoSeguir, 'click', seguir);
      acoes?.append(botaoSeguir);
    }
    const todas = abertas.size >= itens.length;
    botaoSeguir.toggleAttribute('data-destaque', todas);
    if (todas) botaoSeguir.dataset.tom = 'fio';
    else delete botaoSeguir.dataset.tom;
    return todas;
  }

  // Com a bolsa ou o visor abertos, o botão não reage.
  function seguir() {
    if (saindo || !botaoSeguir || diretor.etapa() !== 'escolhendo' || inventario?.aberto || visor.aberto) return;
    botaoSeguir.disabled = true;
    resolverFim();
  }

  /* -- abrir uma carta -- */

  async function abrirCarta(item) {
    if (saindo || ocupado || visor.aberto || inventario?.aberto || diretor.etapa() !== 'escolhendo') return;
    if (item.botao.hasAttribute('data-trancada') && fechadas().length) {
      negar(item);
      return;
    }
    ocupado = true;
    diretor.etapa('assistindo');
    som?.destravar?.();
    som?.efeito?.('papel');
    const { carta } = item;
    const temMidias = carta.midias.length > 0;
    // "Nossos momentos" é o presente da voz dele: as fotos (se houver) passam antes dos áudios.
    const comVoz = item.ultima && !!ctx.voz && (conteudo.voz?.itens?.length || 0) > 0;
    let falhou = false;
    try {
      if (!comVoz || temMidias) {
        anunciar(carta.nome);
        // Ainda dentro do toque: nada de await antes daqui (o vídeo do Safari).
        ({ falhou } = await visor.mostrar(carta, { de: item.desenho }));
      }
      if (comVoz) await ctx.voz.abrir();
    } catch (erro) {
      console.error('[carta] abrir a carta do chão', erro);
    }
    // O estado muda antes de a etapa voltar a "escolhendo": os testes esperam isso.
    marcar(item, falhou ? 'falhou' : 'aberta');
    abertas.add(carta.id);
    if (comVoz) ctx.voz.liberar?.();
    if (!comVoz || temMidias) {
      guardarNaBolsa(item);
      lembrarNaBolsa(carta.id);
    }
    inventario?.mostrarBotao?.();
    const todas = atualizarSeguir();
    destrancar();
    ocupado = false;
    if (!saindo) diretor.etapa('escolhendo');
    // A ordem é de propósito: a bolsa, a memória, o nome escrito e, por último, a luz.
    escreverNome(item).then(correrLuz);
    if (!amb?.toque) (todas && botaoSeguir ? botaoSeguir : item.botao).focus({ preventScroll: true });
  }

  /* -- o roteiro -- */

  try {
    if (frio) {
      musica?.mostrarMini?.();
      mundo.petalas?.definirDensidade?.(1);
      // Ele ao fundo, no fim do caminho, como a corrida teria deixado.
      if (mundo.ok && temEncontro(conteudo) && !estado.ele) {
        try {
          eleFrio = criarEle(mundo);
          if (eleFrio) {
            mundo.cena.add(eleFrio.grupo);
            const rig = mundo.rig.position;
            eleFrio.grupo.position.set(rig.x + 0.1, 0, rig.z - DIST_ELE);
            eleFrio.mostrar(calmo ? 0.6 : 1.4);
          }
        } catch (erro) {
          console.error('[carta] ele ao fundo das cartas', erro);
          eleFrio = null;
        }
      }
    }

    const lista = cartasDoChao(conteudo);
    // A Surpresinha só existe se a última for a galeria: lugar fixo, nome desde o começo, laço.
    const ultima = lista.at(-1)?.tipo === 'galeria' ? lista.at(-1) : null;
    const sorteio = semente(31);
    let amigos = 0;
    lista.forEach((carta, k) => {
      const eUltima = carta === ultima;
      // O sorteio é consumido nesta ordem, carta por carta: mudar a ordem muda o chão.
      const guinada = (sorteio() - 0.5) * 30;
      const tombo = 17 + sorteio() * 8;
      const fase = sorteio() * 6.28;
      const rotulo = eUltima ? carta.nome : String(rotulos.carta || 'Carta {n}').replaceAll('{n}', String(k + 1));
      const botao = el('button', {
        type: 'button',
        class: eUltima ? 'carta-chao carta-chao-surpresinha' : 'carta-chao',
        'aria-label': rotulo,
        dataset: { acao: 'carta-chao', id: carta.id, estado: 'fechada', tipo: carta.tipo },
      });
      const nomeEl = el('span', { class: 'carta-chao-nome', 'aria-hidden': 'true' });
      const face = el('span', 'carta-chao-face');
      face.innerHTML = envelope(eUltima ? PONTA_CURTA : 60) + (eUltima ? LACRE : AMARRA);
      face.append(nomeEl);
      const sombra = el('span', 'carta-chao-sombra');
      // O vento vive dentro do desenho: o botão fica parado no chão.
      const vento = el('span', { class: 'carta-chao-vento', style: { animationDelay: `${(-fase).toFixed(2)}s` } }, face);
      const desenho = el('span', {
        class: eUltima ? 'carta-chao-desenho carta-chao-surpresinha' : 'carta-chao-desenho',
        'aria-hidden': 'true',
        dataset: { estado: 'fechada' },
      }, [sombra, vento]);
      if (eUltima && lista.length > 1) {
        botao.dataset.trancada = '1';
        desenho.dataset.trancada = '1';
        botao.setAttribute('aria-disabled', 'true');
      }
      // O botão vem antes do desenho: o CSS usa `.carta-chao + .carta-chao-desenho`.
      campo.append(botao, desenho);
      const item = {
        carta, ultima: eUltima, k, amigo: eUltima ? -1 : amigos++, guinada, tombo, fase,
        botao, desenho, sombra, nomeEl, escrito: false,
        a: { ...REPOUSO, op: 0 }, d: 0, X: 0, larg: LARGURA, w: 0, matriz: '', op: '', sombraOp: '',
      };
      // A Surpresinha pousa com o nome escrito.
      if (eUltima) {
        item.escrito = true;
        montarLetras(nomeEl, carta.nome);
      }
      // O touchstart vazio deixa o :active funcionar no iPhone.
      ouvir(botao, 'touchstart', () => {}, { passive: true });
      ouvir(botao, 'click', () => abrirCarta(item));
      itens.push(item);
    });

    medir();

    // Retomada: recarregar no meio da cena mantém as cartas abertas e na bolsa.
    // O caminho normal recomeça a lista.
    const vistas = frio ? lembradas() : new Set();
    if (!frio) esquecerChao();
    for (const item of itens) {
      if (!vistas.has(item.carta.id)) continue;
      marcar(item, 'aberta');
      abertas.add(item.carta.id);
      item.escrito = true;
      montarLetras(item.nomeEl, item.carta.nome);
      caberNome(item);
      guardarNaBolsa(item);
    }
    if (abertas.size) inventario?.mostrarBotao?.();
    destrancar();

    // A letra à mão pode chegar depois da primeira medida.
    Promise.resolve(document.fonts?.load?.('600 1em "Klee One"'))
      .then(() => {
        if (vivo) itens.forEach((i) => i.escrito && caberNome(i));
      })
      .catch(() => {});

    const pararQuadro = mundo.aoQuadro(() => {
      const k = olhar.k;
      // mao.js também lê este valor; a câmera 3D desconta a inclinação a cada quadro.
      estado.olharChao = mundo.ok && k > 0.0005 ? medida.teta * k : 0;
      if (estado.olharChao) mundo.camera.rotation.x -= estado.olharChao;
      for (const item of itens) posar(item);
    });
    if (typeof pararQuadro === 'function') cancelar.push(pararQuadro);
    const pedirMedida = () => {
      medindo ||= requestAnimationFrame(medir);
    };
    ouvir(window, 'resize', pedirMedida);
    const pararTamanho = mundo.aoRedimensionar?.(pedirMedida);
    if (typeof pararTamanho === 'function') cancelar.push(pararTamanho);
    itens.forEach(posar);

    // Toque livre no chão: a mesma luz, no máximo uma a cada 2,5 s.
    ouvir(window, 'pointerup', (e) => {
      if (!vivo || saindo || visor.aberto || inventario?.aberto) return;
      if (e.target?.closest?.('button, a, input, textarea, #mini, #inventario, #voz, .carta-chao-visor')) return;
      if (performance.now() - ultimaLuz < LUZ_LIVRE_MS) return;
      correrLuz();
    });

    diretor.etapa('pousando');
    gsap.to(olhar, { k: 1, duration: calmo ? 1 : 2.2, ease: calmo ? 'none' : 'sine.inOut' });
    const texto = typeof dados.frase === 'string' ? dados.frase.trim() : '';
    if (texto) {
      // Embaixo, no chão vazio: no alto ela cairia em cima dele. Quem lê a tela
      // ouve pelo aviso da cena; o texto em pedaços fica fora da leitura.
      frase = el('p', { class: 'frase cartas-chao-frase', 'aria-hidden': 'true' });
      raiz.append(frase);
      revelarPalavras(frase, texto, { intervalo: 0.2, duracao: 1.5 });
      anunciar(texto);
    } else {
      fraseFora = true;
    }
    await espera(calmo ? 300 : 700);
    await Promise.all(itens.map(cair));

    // "Seguir em frente" nunca cai em cima da frase: só aparece quando ela sai.
    if (frase) {
      espera(calmo ? 1600 : 2400)
        .then(() => (vivo && !saindo ? ocultarPalavras(frase) : null))
        .then(() => {
          fraseFora = true;
          atualizarSeguir();
        });
    } else {
      atualizarSeguir();
    }
    if (!amb?.toque && (!document.activeElement || document.activeElement === document.body)) {
      itens[0]?.botao.focus({ preventScroll: true });
    }
    diretor.etapa('escolhendo');
    await fim;

    diretor.etapa('seguindo');
    saindo = true;
    som?.efeito?.('toque');
    const saidas = [];
    if (botaoSeguir) {
      // A transição de opacidade da pílula brigaria com o tween.
      botaoSeguir.style.transition = 'none';
      saidas.push(comoPromise(gsap.to(botaoSeguir, { autoAlpha: 0, duration: 0.5, ease: 'none' })));
    }
    itens.forEach((item, k) => {
      gsap.killTweensOf(item.a);
      saidas.push(comoPromise(gsap.to(item.a, { op: 0, duration: 0.6, delay: 0.05 * k, ease: curvas.branco.sair })));
      if (!calmo) gsap.to(item.a, { alt: 0.1, vira: 10, duration: 0.9, delay: 0.05 * k, ease: 'sine.out' });
    });
    saidas.push(apagarLuz());
    saidas.push(comoPromise(gsap.to(olhar, {
      k: 0,
      duration: calmo ? 0.8 : 1.6,
      ease: calmo ? 'none' : 'sine.inOut',
      overwrite: true,
    })));
    await Promise.all(saidas);
  } finally {
    vivo = false;
    sinal.abort();
    cancelar.forEach((fn) => fn());
    cancelAnimationFrame(medindo);
    faisca?.kill();
    tweenLuz?.kill();
    gsap.killTweensOf(olhar);
    for (const item of itens) gsap.killTweensOf(item.a);
    // mao.js lê o olhar: ele volta a zero com a cena.
    estado.olharChao = 0;
    frase?.remove();
    eleFrio?.sair?.(0.6);
    visor.voltarMusica();
    raiz.remove();
    botaoSeguir?.remove();
  }
}
