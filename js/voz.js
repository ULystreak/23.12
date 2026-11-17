// A voz dele: uma fita na bolsa com os áudios que ela pode ouvir sempre.
//
//   criarVoz(ctx) → voz          (o main.js guarda em ctx.voz)
//
//   voz.liberar()   põe a fita na bolsa e mostra o botão da bolsa. Quem chama é o fim
//                   da última carta (ctx.voz?.liberar()); por garantia, a etapa final:fim
//                   também libera sozinha. Fica anotado no aparelho dela
//                   (localStorage): numa visita seguinte a fita já está na bolsa desde
//                   que a bolsa aparece. Chamar de novo não faz mal nenhum.
//   voz.abrir() → Promise   abre o cartão com os áudios; resolve quando ela fechou
//   voz.fechar()
//   voz.aberto → boolean
//   voz.liberada → boolean
//
// O cartão (linguagem em _dev/UI.md): uma folha de papel pespontada, com o lacinho do
// fio preso no alto e a fita cassete (os carretéis giram
// enquanto um áudio toca) e, por áudio, tocar/pausar, o fio de progresso com a
// conta que ela arrasta, o tempo e o botão de baixar. Só um áudio toca por vez.
// Enquanto ele fala, a música do site abaixa; quando para, ela volta (igual aos
// vídeos das cartas do chão, js/cenas/cartas.js).
//
// Áudio sem arquivo no content.js aparece como "[áudio 1 vem aqui]" e não toca.
// Arquivo que não abre: a linha avisa e o resto continua funcionando.
//
// Baixar: um link comum com o atributo `download`. No computador e no Android o
// arquivo vai direto para os downloads. No Safari do iPhone aparece a pergunta
// "Deseja baixar…?" e o áudio vai para o app Arquivos (pasta Downloads).
//
// Só para testar (no endereço):
//   ?voz=1        a fita entra na bolsa logo que a cena começa
//   ?voz=abrir    idem, e o cartão já abre
//   ?voz=0        esquece que a fita foi liberada neste aparelho
//
// Ganchos para os testes: #voz[data-aberto], [data-acao="voz-tocar"],
// [data-acao="voz-baixar"], [data-acao="voz-fechar"], input.voz-controle;
// cada linha é .voz-item[data-estado="pronto|vazio|falhou"] (+ [data-tocando]).

import { el, svg } from './nucleo/util.js';

const CHAVE = 'carta2312:voz';       // a anotação no aparelho dela
const ID = 'voz';                    // o id do item na bolsa
const ABAFAR = 0.05;                 // a música enquanto ele fala (fração do volume)
const SAIDA_MS = 240;                // o cartão leva isto para sair (igual ao CSS)
const PASSOS = 1000;                 // resolução do fio de progresso
const TINTA = '#2a1b22';

// Ícones na grade da papelaria (24, traço 1.75, pontas redondas: .ui-icone, css/base.css).
const ICONE_TOCAR = '<svg class="ui-icone voz-i-tocar" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="cheio-tinta" d="M9.2 6.6v10.8a.6.6 0 0 0 .9.5l8.6-5.4a.6.6 0 0 0 0-1L10.1 6.1a.6.6 0 0 0-.9.5z"/></svg>';
const ICONE_PAUSA = '<svg class="ui-icone voz-i-pausa" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9.2 7v10M14.8 7v10" stroke-width="2.6"/></svg>';
const ICONE_BAIXAR = '<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4.8v9.7M7.6 10.4l4.4 4.4 4.4-4.4M6 19.2h12"/></svg>';
const ICONE_FECHAR = '<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7L7 17"/></svg>';

// A fita cassete, a tinta. Os dois carretéis (.voz-rolo) giram enquanto toca; a fita
// enrolada (.voz-massa-e / -d) passa de um lado para o outro com o progresso.
const dentes = (cx, cy) => [0, 120, 240].map((g) => `<path d="M${cx} ${cy - 3.2} V${cy - 6.4}" transform="rotate(${g} ${cx} ${cy})"/>`).join('');
const FITA = `
  <svg class="voz-fita-desenho" viewBox="0 0 200 126" aria-hidden="true" focusable="false">
    <defs><clipPath id="voz-janela"><rect x="52" y="42" width="96" height="28" rx="14"/></clipPath></defs>
    <rect x="2" y="2" width="196" height="122" rx="12" fill="#fffdf9" stroke="${TINTA}" stroke-width="2.2"/>
    <rect x="16" y="13" width="168" height="68" rx="5" fill="#fbf7f0" stroke="${TINTA}" stroke-width="1.4"/>
    <path d="M27 25.5 C60 24.6 110 26.2 150 25.2" fill="none" stroke="#d7192d" stroke-width="2" stroke-linecap="round"/>
    <path d="M27 33.5 C55 32.9 90 34 122 33.3" fill="none" stroke="${TINTA}" stroke-opacity="0.28" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M167 23.4 C164.6 20.6 160.6 23.4 162.8 26.8 C164 28.6 165.6 29.8 167 31 C168.4 29.8 170 28.6 171.2 26.8 C173.4 23.4 169.4 20.6 167 23.4 Z" fill="#d7192d"/>
    <rect x="52" y="42" width="96" height="28" rx="14" fill="#ffffff"/>
    <g clip-path="url(#voz-janela)">
      <circle class="voz-massa voz-massa-e" cx="72" cy="56" r="21" fill="${TINTA}" fill-opacity="0.2"/>
      <circle class="voz-massa voz-massa-d" cx="128" cy="56" r="11.5" fill="${TINTA}" fill-opacity="0.2"/>
      <path d="M72 68.6 H128" stroke="${TINTA}" stroke-opacity="0.34" stroke-width="1.2"/>
    </g>
    <rect x="52" y="42" width="96" height="28" rx="14" fill="none" stroke="${TINTA}" stroke-width="1.5"/>
    <g class="voz-rolo" fill="none" stroke="${TINTA}" stroke-width="1.5" stroke-linecap="round">
      <circle cx="72" cy="56" r="7.6" fill="#fffdf9"/>${dentes(72, 56)}
    </g>
    <g class="voz-rolo" fill="none" stroke="${TINTA}" stroke-width="1.5" stroke-linecap="round">
      <circle cx="128" cy="56" r="7.6" fill="#fffdf9"/>${dentes(128, 56)}
    </g>
    <path d="M45 124 L55 97 H145 L155 124" fill="none" stroke="${TINTA}" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="74" cy="111" r="3" fill="none" stroke="${TINTA}" stroke-width="1.4"/>
    <circle cx="126" cy="111" r="3" fill="none" stroke="${TINTA}" stroke-width="1.4"/>
    <rect x="94" y="107.5" width="12" height="7" rx="1.5" fill="none" stroke="${TINTA}" stroke-width="1.2"/>
    <g fill="${TINTA}" fill-opacity="0.4"><circle cx="11" cy="11" r="1.7"/><circle cx="189" cy="11" r="1.7"/><circle cx="11" cy="115" r="1.7"/><circle cx="189" cy="115" r="1.7"/></g>
  </svg>`;

const relogio = (s) => {
  if (!Number.isFinite(s) || s < 0) return '';
  const t = Math.floor(s + 0.05);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const texto = (v) => (typeof v === 'string' ? v.trim() : '');
/** O nome do arquivo que ela baixa: o título do áudio, com a extensão do arquivo. */
function nomeParaBaixar(titulo, arquivo, n) {
  const ext = (/\.([a-z0-9]{2,5})(?:[?#].*)?$/i.exec(arquivo) || [])[1] || 'mp3';
  const base = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase();
  return `${base || `audio-${n}`}.${ext.toLowerCase()}`;
}

const lembrar = (sim) => {
  try { if (sim) localStorage.setItem(CHAVE, '1'); else localStorage.removeItem(CHAVE); } catch { /* aba anônima, armazenamento cheio: segue sem lembrar */ }
};
const lembrada = () => { try { return localStorage.getItem(CHAVE) === '1'; } catch { return false; } };

export function criarVoz(ctx) {
  const { conteudo, amb, som, inventario, diretor } = ctx || {};
  const dados = conteudo?.voz || {};
  const rot = dados.rotulos || {};
  const titulo = texto(dados.titulo) || 'A minha voz';
  const moldeVazio = texto(dados.vazio) || '[áudio {n} vem aqui]';
  const faixas = (Array.isArray(dados.itens) ? dados.itens : [])
    .filter((item) => item && (texto(item.titulo) || texto(item.arquivo)))
    .map((item, i) => ({ n: i + 1, titulo: texto(item.titulo), arquivo: texto(item.arquivo), audio: null, no: null, duracao: 0, falhou: false }));
  const pedido = amb?.params?.get?.('voz') || '';

  let liberada = false;
  let raiz = null;                     // #voz, montado na primeira vez que abre
  let cartao = null;
  let aberto = false;
  let resolverFechar = null;
  let focoAntes = null;
  let saida = 0;
  let atual = null;                    // a faixa que está tocando (ou a última que tocou)
  let arrastando = null;               // a faixa cujo fio ela está arrastando
  let quadroId = 0;

  // ---- a música do site abaixa enquanto ele fala ----------------------------
  let abafada = false;
  let pausaMusica = false;             // sem Web Audio: a música pausa de verdade e volta depois
  function abaixarMusica() {
    if (abafada || !som) return;
    abafada = true;
    try {
      const diag = som.diagnostico ? som.diagnostico() : null;
      if (diag && !diag.mudo && !diag.webAudio && som.estado?.tocando) { pausaMusica = true; som.pausar(); }
      else som.abafar?.(ABAFAR, 30 * 60 * 1000);
    } catch { /* sem som */ }
  }
  function voltarMusica() {
    if (!abafada || !som) return;
    abafada = false;
    try {
      if (pausaMusica) { pausaMusica = false; som.retomar(); return; }
      som.abafar?.(1, 0);
      // O iPhone pode ter parado a música enquanto o áudio tocava: ela volta sozinha.
      const diag = som.diagnostico ? som.diagnostico() : null;
      if (diag && diag.pausado && som.estado?.tocando && !diag.mudo && diag.fonte) { som.pausar(); som.retomar(); }
    } catch { /* sem som */ }
  }

  // ---- cada linha -----------------------------------------------------------
  const tocando = (f) => !!f && !!f.audio && !f.audio.paused && !f.audio.ended;

  function pintarFaixa(f) {
    if (!f.no) return;
    const a = f.audio;
    const dur = f.duracao;
    const agora = arrastando === f ? (Number(f.controle.value) / PASSOS) * dur : (a ? a.currentTime : 0);
    const p = dur > 0 ? Math.min(1, Math.max(0, agora / dur)) : 0;
    if (arrastando !== f) f.controle.value = String(Math.round(p * PASSOS));
    f.cheio.style.transform = `scaleX(${p.toFixed(4)})`;
    const t = dur > 0 ? `${relogio(agora)} / ${relogio(dur)}` : '';
    if (f.tempo.textContent !== t) {
      f.tempo.textContent = t;
      f.controle.setAttribute('aria-valuetext', dur > 0 ? `${relogio(agora)} de ${relogio(dur)}` : '');
    }
    if (f === atual) pintarFita(p);
  }

  /** A fita passa de um carretel para o outro conforme o áudio anda. */
  function pintarFita(p) {
    if (!raiz) return;
    const e = raiz.querySelector('.voz-massa-e');
    const d = raiz.querySelector('.voz-massa-d');
    // (o raio, e não um transform: o WebKit perde o círculo transformado dentro do recorte)
    if (e) e.setAttribute('r', (21 - 9.5 * p).toFixed(2));
    if (d) d.setAttribute('r', (11.5 + 9.5 * p).toFixed(2));
  }

  function pintarEstado() {
    let alguma = false;
    for (const f of faixas) {
      if (!f.no) continue;
      const sim = tocando(f);
      alguma = alguma || sim;
      f.no.toggleAttribute('data-tocando', sim);
      if (f.botao) {
        f.botao.setAttribute('aria-label', `${sim ? (rot.pausar || 'Pausar') : (rot.tocar || 'Tocar')}: ${f.titulo || `${f.n}`}`);
        f.botao.setAttribute('aria-pressed', sim ? 'true' : 'false');
      }
    }
    if (raiz) raiz.toggleAttribute('data-tocando', alguma);
    if (alguma) abaixarMusica(); else voltarMusica();
    cancelAnimationFrame(quadroId);
    if (alguma) {
      const laco = () => { if (atual) pintarFaixa(atual); quadroId = requestAnimationFrame(laco); };
      quadroId = requestAnimationFrame(laco);
    }
  }

  function marcarFalha(f) {
    if (f.falhou || !f.no) return;
    f.falhou = true;
    f.no.dataset.estado = 'falhou';
    if (f.botao) f.botao.disabled = true;
    f.controle.disabled = true;
    f.tempo.textContent = '';
    f.aviso.textContent = rot.falhou || 'Este áudio não abriu. Tente de novo mais tarde.';
    f.aviso.hidden = false;
    pintarEstado();
  }

  function prepararAudio(f) {
    if (f.audio || !f.arquivo) return;
    const a = new Audio();
    a.preload = 'metadata';
    const medir = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) { f.duracao = a.duration; f.controle.disabled = false; pintarFaixa(f); }
    };
    a.addEventListener('loadedmetadata', medir);
    a.addEventListener('durationchange', medir);
    a.addEventListener('timeupdate', () => pintarFaixa(f));
    a.addEventListener('play', pintarEstado);
    a.addEventListener('playing', pintarEstado);
    a.addEventListener('pause', pintarEstado);
    a.addEventListener('ended', () => {
      try { a.currentTime = 0; } catch { /* segue */ }
      pintarEstado();
      pintarFaixa(f);
    });
    a.addEventListener('error', () => marcarFalha(f));
    a.src = f.arquivo;
    f.audio = a;
  }

  function pausarTudo(menos = null) {
    for (const f of faixas) {
      if (f !== menos && f.audio && !f.audio.paused) { try { f.audio.pause(); } catch { /* segue */ } }
    }
  }

  async function alternar(f) {
    if (!f.audio || f.falhou) return;
    if (tocando(f)) { f.audio.pause(); return; }
    pausarTudo(f);                     // só um áudio por vez
    atual = f;
    abaixarMusica();
    try { await f.audio.play(); } catch (erro) {
      // (pausar antes de o play resolver dá AbortError: não é falha do arquivo)
      if (erro && erro.name !== 'AbortError' && erro.name !== 'NotAllowedError') marcarFalha(f);
    }
    pintarEstado();
  }

  function montarFaixa(f) {
    const nome = el('span', 'voz-nome', f.titulo || '');
    f.tempo = el('span', { class: 'voz-tempo', 'aria-hidden': 'true' });
    f.aviso = el('p', { class: 'voz-aviso', hidden: true });

    if (!f.arquivo) {
      // ainda sem arquivo: o lugar dele fica marcado, para o autor ver funcionando
      f.aviso.textContent = moldeVazio.replace('{n}', String(f.n));
      f.aviso.hidden = false;
      f.controle = el('input', { type: 'hidden' });
      f.cheio = el('span');
      f.no = el('li', { class: 'ui-entra voz-item', dataset: { estado: 'vazio' } }, [
        el('span', { class: 'ui-redondo voz-tocar voz-tocar-vazio', 'aria-hidden': 'true' }, svg(ICONE_TOCAR)),
        el('div', 'voz-meio', [el('div', 'voz-linha', [nome]), f.aviso]),
      ]);
      f.no.style.setProperty('--i', String(f.n + 1));
      return f.no;
    }

    f.botao = el('button', { class: 'ui-redondo voz-tocar', type: 'button', dataset: { acao: 'voz-tocar' } }, [svg(ICONE_TOCAR), svg(ICONE_PAUSA)]);
    f.botao.addEventListener('touchstart', () => {}, { passive: true });     // :active no iPhone
    f.botao.addEventListener('click', () => alternar(f));
    f.cheio = el('span', 'voz-fio-cheio');
    f.controle = el('input', {
      class: 'voz-controle', type: 'range', min: '0', max: String(PASSOS), step: '1', value: '0', disabled: true,
      'aria-label': `${rot.progresso || 'Onde o áudio está'}: ${f.titulo || f.n}`,
    });
    const soltar = () => {
      if (arrastando !== f) return;
      const alvo = (Number(f.controle.value) / PASSOS) * f.duracao;
      arrastando = null;
      try { if (f.duracao > 0) f.audio.currentTime = Math.min(alvo, Math.max(0, f.duracao - 0.05)); } catch { /* segue */ }
      pintarFaixa(f);
    };
    f.controle.addEventListener('input', () => { arrastando = f; pintarFaixa(f); });
    f.controle.addEventListener('change', soltar);
    f.controle.addEventListener('pointerup', soltar);
    f.controle.addEventListener('pointercancel', soltar);
    f.controle.addEventListener('blur', soltar);

    const baixar = el('a', {
      class: 'ui-redondo voz-baixar', href: f.arquivo, download: nomeParaBaixar(f.titulo, f.arquivo, f.n),
      'aria-label': `${rot.baixar || 'Baixar'}: ${f.titulo || f.n}`, dataset: { acao: 'voz-baixar' },
    }, svg(ICONE_BAIXAR));
    baixar.addEventListener('touchstart', () => {}, { passive: true });

    f.no = el('li', { class: 'ui-entra voz-item', dataset: { estado: 'pronto' } }, [
      f.botao,
      el('div', 'voz-meio', [
        el('div', 'voz-linha', [nome]),
        el('div', 'voz-barra', [
          el('div', 'voz-trilho', [el('span', { class: 'voz-fio', 'aria-hidden': 'true' }, f.cheio), f.controle]),
          f.tempo,
        ]),
        f.aviso,
      ]),
      baixar,
    ]);
    f.no.style.setProperty('--i', String(f.n + 1));          // as linhas chegam em fila
    return f.no;
  }

  // ---- o cartão -------------------------------------------------------------
  function montar() {
    if (raiz) return;
    const fechar = el('button', {
      class: 'ui-redondo voz-fechar', type: 'button', 'aria-label': rot.fechar || 'Fechar', dataset: { acao: 'voz-fechar' },
    }, svg(ICONE_FECHAR));
    fechar.addEventListener('click', () => api.fechar());
    const veu = el('div', 'voz-veu');
    veu.addEventListener('click', () => api.fechar());
    const frase = texto(dados.frase);
    // (o cartão não rola: quem rola é o miolo, para o laço, o pesponto e o fechar ficarem parados)
    cartao = el('div', 'ui-folha voz-cartao', [
      el('span', { class: 'ui-laco', 'aria-hidden': 'true', dataset: { onde: 'topo' } }),
      el('div', 'ui-rola voz-miolo', [
        el('div', { class: 'voz-fita', 'aria-hidden': 'true' }, svg(FITA)),
        el('h2', { class: 'ui-titulo voz-titulo', id: 'voz-titulo' }, titulo),
        frase ? el('p', 'ui-nota voz-frase', frase) : null,
        el('ol', 'voz-lista', faixas.map(montarFaixa)),
      ]),
      fechar,
    ]);
    raiz = el('section', {
      id: 'voz', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'voz-titulo', hidden: true,
    }, [veu, cartao]);
    // Um toque no cartão nunca chega ao mundo (a carta não abre por baixo).
    for (const tipo of ['pointerdown', 'pointerup', 'click']) raiz.addEventListener(tipo, (e) => e.stopPropagation());
    document.body.append(raiz);
  }

  const focaveis = () => (cartao ? [...cartao.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"])')] : []);
  function aoTeclar(e) {
    if (!aberto) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.fechar(); return; }
    e.stopPropagation();                               // as teclas ficam no cartão
    if (e.key !== 'Tab') return;
    const nos = focaveis();
    if (!nos.length) { e.preventDefault(); return; }
    const primeiro = nos[0];
    const ultimo = nos[nos.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    else if (!cartao.contains(document.activeElement)) { e.preventDefault(); primeiro.focus(); }
  }

  const item = () => ({ id: ID, tipo: 'voz', titulo, fixo: true, abrir: () => abrirCartao() });

  function abrirCartao() {
    if (!faixas.length) return Promise.resolve();
    if (aberto) return new Promise((ok) => { const antes = resolverFechar; resolverFechar = () => { antes?.(); ok(); }; });
    montar();
    aberto = true;
    clearTimeout(saida);
    focoAntes = document.activeElement;
    for (const f of faixas) { prepararAudio(f); pintarFaixa(f); }
    pintarFita(atual && atual.duracao ? atual.audio.currentTime / atual.duracao : 0);
    raiz.hidden = false;
    void raiz.offsetWidth;                             // a entrada parte do estado fechado
    raiz.setAttribute('data-aberto', '');
    // (no documento, e não no cartão: no Safari um botão tocado não fica com o foco)
    document.addEventListener('keydown', aoTeclar, true);
    try { som?.efeito?.('papel'); } catch { /* sem som */ }
    try { (cartao.querySelector('.voz-tocar:not(:disabled):not(.voz-tocar-vazio)') || cartao.querySelector('.voz-fechar'))?.focus({ preventScroll: true }); } catch { /* sem foco programático */ }
    return new Promise((ok) => { resolverFechar = ok; });
  }

  const api = {
    liberar() {
      if (!faixas.length) return false;
      liberada = true;
      lembrar(true);
      if (!inventario) return true;
      if (!inventario.tem(ID)) inventario.guardar(item());
      inventario.mostrarBotao();
      // Depois do fim da carta a bolsa fica sempre à mão (o diretor só a abre nas esperas).
      if (document.documentElement.dataset.cena === 'final') inventario.manterLivre?.(true);
      return true;
    },
    /** Abre o cartão. Pela bolsa (quando a fita está lá), para as cenas saberem que há algo na frente. */
    abrir() {
      if (aberto || !faixas.length) return abrirCartao();
      if (inventario?.tem(ID) && typeof inventario.reabrir === 'function' && !inventario.aberto) return inventario.reabrir(ID);
      return abrirCartao();
    },
    fechar() {
      if (!aberto) return;
      aberto = false;
      document.removeEventListener('keydown', aoTeclar, true);
      pausarTudo();
      pintarEstado();
      voltarMusica();
      raiz.removeAttribute('data-aberto');
      const sumir = () => { if (!aberto) raiz.hidden = true; };
      clearTimeout(saida);
      if (amb?.reduzido) sumir(); else saida = setTimeout(sumir, SAIDA_MS);
      const voltar = focoAntes && focoAntes.isConnected && !focoAntes.disabled && focoAntes.offsetParent !== null
        ? focoAntes : document.querySelector('[data-acao="inventario"]:not(:disabled)');
      focoAntes = null;
      try { voltar?.focus({ preventScroll: true }); } catch { /* sem foco programático */ }
      const ok = resolverFechar;
      resolverFechar = null;
      ok?.();
    },
    get aberto() { return aberto; },
    get liberada() { return liberada; },
  };

  // ---- ao nascer --------------------------------------------------------------
  if (pedido === '0') lembrar(false);
  // Visita seguinte: a fita já está na bolsa desde que a bolsa aparece.
  if (faixas.length && inventario && pedido !== '0' && lembrada()) {
    liberada = true;
    inventario.guardar(item());
  }
  // Garantia: chegando ao fim da última carta a fita entra na bolsa, mesmo que a cena
  // final não chame liberar() (chamar duas vezes não faz mal).
  if (faixas.length && diretor?.aoMudar) {
    diretor.aoMudar((cena, etapa) => { if (cena === 'final' && etapa === 'fim') api.liberar(); });
  }
  // Atalhos de teste: ?voz=1 e ?voz=abrir (esperam a cena começar, para a bolsa já existir).
  if ((pedido === '1' || pedido === 'abrir') && faixas.length && diretor?.aoMudar) {
    let feito = false;
    diretor.aoMudar((cena) => {
      if (feito || cena === 'senha' || cena === 'musica') return;
      feito = true;
      api.liberar();
      if (pedido === 'abrir') api.abrir();
    });
  }

  return api;
}
