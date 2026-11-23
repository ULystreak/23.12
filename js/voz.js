/* ============================================================================
   VOZ: o cartão "A minha voz"
   ============================================================================
   Uma folha de papel com a fita cassete e a lista dos áudios com a voz dele
   (conteudo.voz.itens). Cada áudio tem tocar/pausar, um fio de progresso que
   ela arrasta, o tempo e um link para baixar. Um áudio por vez; enquanto ele
   fala, a música do site cai para 5% (som.abafar) ou pausa (sem Web Audio) e
   volta quando nada mais toca.

   Depois de liberada, a fita mora na bolsa como faixa fixa no alto, e o
   aparelho dela lembra (carta2312:voz): da visita seguinte em diante, a fita
   já está lá desde o começo. Abre pela última carta do chão, pelo menu do
   fim e pela própria bolsa.

   Atalhos de teste: ?voz=1 (a fita já vem na bolsa), ?voz=abrir (o cartão
   abre sozinho) e ?voz=0 (o aparelho esquece a fita).

   No Safari do iPhone, o baixar mostra a pergunta "Deseja baixar?" e o áudio
   vai para o app Arquivos: isso é do navegador, o código só põe `download`.
   ========================================================================== */

import { el, svg, clamp } from './nucleo/util.js';

const CHAVE = 'carta2312:voz';
const ID = 'voz';
const ABAFAR = 0.05; // a música a 5% enquanto ele fala
const TETO_ABAFAR = 30 * 60 * 1000; // o abafar sai sozinho em 30 min; abafar(1, 0) o cancela antes
const SAIDA_MS = 240; // o CSS some em 180 ms (--dur-sair); o hidden vem um pouco depois
const PASSOS = 1000; // resolução do fio de progresso
const VEU_MS = 450; // o segundo toque de um duplo toque em quem abriu não fecha
const PULO_S = 5; // setas no fio: 5 s para cada lado (o passo do range seria 1/1000)
const PADRAO = {
  titulo: 'A minha voz',
  vazio: '[áudio {n} vem aqui]',
  tocar: 'Tocar',
  pausar: 'Pausar',
  baixar: 'Baixar',
  fechar: 'Fechar',
  progresso: 'Onde o áudio está',
  falhou: 'Este áudio não abriu. Tente de novo mais tarde.',
};

const ICONE_TOCAR = '<svg class="ui-icone voz-i-tocar" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.5 5.8v12.4a.8.8 0 0 0 1.2.7l9.6-6.2a.8.8 0 0 0 0-1.4L9.7 5.1a.8.8 0 0 0-1.2.7z"/></svg>';
const ICONE_PAUSA = '<svg class="ui-icone voz-i-pausa" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect class="cheio" x="6.6" y="5.5" width="3.8" height="13" rx="1.3"/><rect class="cheio" x="13.6" y="5.5" width="3.8" height="13" rx="1.3"/></svg>';
const ICONE_BAIXAR = '<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4.5v10.5M7.5 10.5 12 15l4.5-4.5M5.5 19.5h13"/></svg>';
const ICONE_FECHAR = '<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7 7 17"/></svg>';

/** Os três dentes de um carretel, girados a 0, 120 e 240 graus. */
function dentes(cx, cy) {
  return [0, 120, 240]
    .map((g) => `<rect x="${cx - 1.1}" y="${cy - 6.3}" width="2.2" height="3.6" rx="0.9" transform="rotate(${g} ${cx} ${cy})"/>`)
    .join('');
}

// A fita (200 × 126). As massas de fita mudam de raio pelo atributo `r`, não
// por transform: o WebKit perde o círculo transformado dentro do recorte.
const FITA = `<svg class="voz-fita-desenho" viewBox="0 0 200 126" aria-hidden="true" focusable="false">
  <defs><clipPath id="voz-janela"><rect x="52" y="42" width="96" height="28" rx="14"/></clipPath></defs>
  <rect class="voz-fita-corpo" x="2.6" y="2.6" width="194.8" height="120.8" rx="10"/>
  <rect class="voz-fita-etiqueta" x="16" y="13" width="168" height="68" rx="5"/>
  <path class="voz-fita-listra" d="M26 25H156"/>
  <path class="voz-fita-linha" d="M26 33H174"/>
  <path class="voz-fita-coracao" transform="translate(162 18) scale(0.7)" d="M10 16.8C4.6 12.6 2.4 9.8 2.4 6.9a3.9 3.9 0 0 1 7.6-1.3 3.9 3.9 0 0 1 7.6 1.3c0 2.9-2.2 5.7-7.6 9.9z"/>
  <rect class="voz-fita-janela" x="52" y="42" width="96" height="28" rx="14"/>
  <g clip-path="url(#voz-janela)">
    <circle class="voz-massa voz-massa-e" cx="72" cy="56" r="21"/>
    <circle class="voz-massa voz-massa-d" cx="128" cy="56" r="11.5"/>
  </g>
  <g class="voz-rolo"><circle cx="72" cy="56" r="7.6"/>${dentes(72, 56)}</g>
  <g class="voz-rolo"><circle cx="128" cy="56" r="7.6"/>${dentes(128, 56)}</g>
  <rect class="voz-fita-vidro" x="52" y="42" width="96" height="28" rx="14"/>
  <path class="voz-fita-base" d="M45 123.4 56 99h88l11 24.4"/>
  <circle class="voz-fita-roda" cx="74" cy="111" r="3"/>
  <circle class="voz-fita-roda" cx="126" cy="111" r="3"/>
  <rect class="voz-fita-meio" x="94" y="107.5" width="12" height="7" rx="1.5"/>
  <circle class="voz-fita-ponto" cx="9.5" cy="9.5" r="1.7"/>
  <circle class="voz-fita-ponto" cx="190.5" cy="9.5" r="1.7"/>
  <circle class="voz-fita-ponto" cx="9.5" cy="116.5" r="1.7"/>
  <circle class="voz-fita-ponto" cx="190.5" cy="116.5" r="1.7"/>
</svg>`;

/** Segundos → m:ss ('' se não é um tempo). */
function relogio(s) {
  if (!Number.isFinite(s) || s < 0) return '';
  const t = Math.floor(s + 0.05);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function texto(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/** O nome do arquivo baixado: o título sem acento nem símbolo, com a extensão do áudio. */
function nomeParaBaixar(titulo, arquivo, n) {
  const ext = (/\.([a-z0-9]{2,5})(?:[?#].*)?$/i.exec(arquivo)?.[1] || 'mp3').toLowerCase();
  const base = titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // os acentos que o NFD separou
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .trim()
    .replace(/[\s-]+/g, '-')
    .toLowerCase();
  return `${base || `audio-${n}`}.${ext}`;
}

function lembrar(sim) {
  try {
    if (sim) localStorage.setItem(CHAVE, '1');
    else localStorage.removeItem(CHAVE);
  } catch {
    /* aba anônima ou armazenamento cheio: a fita só não é lembrada */
  }
}

function lembrada() {
  try {
    return localStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

const semNada = () => {};

export function criarVoz(ctx) {
  const dados = ctx.conteudo?.voz || {};
  const rot = dados.rotulos || {};
  const r = (chave) => texto(rot[chave]) || PADRAO[chave];
  const titulo = texto(dados.titulo) || PADRAO.titulo;
  const frase = texto(dados.frase);
  const vazio = texto(dados.vazio) || PADRAO.vazio;

  // Só entram os itens com título ou arquivo; `n` conta a partir de 1.
  const faixas = (Array.isArray(dados.itens) ? dados.itens : [])
    .filter((i) => texto(i?.titulo) || texto(i?.arquivo))
    .map((i, k) => ({
      n: k + 1,
      titulo: texto(i.titulo),
      nome: texto(i.titulo) || `Áudio ${k + 1}`,
      arquivo: texto(i.arquivo),
      audio: null,
      no: null,
      duracao: 0,
      falhou: false,
      botao: null,
      controle: null,
      cheio: null,
      tempo: null,
      aviso: null,
      dito: '',
    }));

  let liberada = false;
  let raiz = null;
  let cartao = null;
  let botaoFechar = null;
  let anuncio = null;
  let massaE = null;
  let massaD = null;
  let aberto = false;
  let focoAntes = null;
  let saida = 0;
  let abertoEm = 0;
  let atual = null;
  let arrastando = null;
  let quadroId = 0;
  let abafada = false;
  let pausaMusica = false;
  const resolvedores = [];

  const item = () => ({ id: ID, tipo: 'voz', titulo, fixo: true, abrir: () => abrirCartao() });
  const tocando = (f) => !!f.audio && !f.audio.paused;

  /* ---- a música abaixa enquanto ele fala ---- */

  function abaixarMusica() {
    if (abafada) return;
    abafada = true;
    const som = ctx.som;
    if (!som) return;
    if (som.diagnostico?.().webAudio === false && som.estado?.tocando) {
      pausaMusica = true;
      som.pausar?.();
    } else {
      som.abafar?.(ABAFAR, TETO_ABAFAR);
    }
  }

  // A ordem importa: a pausa por falta de Web Audio, depois o abafar, e só então a correção do iPhone.
  function voltarMusica() {
    if (!abafada) return;
    abafada = false;
    const som = ctx.som;
    if (!som) return;
    if (pausaMusica) {
      pausaMusica = false;
      som.retomar?.();
    } else {
      som.abafar?.(1, 0);
    }
    // O iPhone para o <audio> da música quando outro <audio> toca; o estado segue "tocando".
    if (som.diagnostico?.().pausado && som.estado?.tocando) {
      som.pausar?.();
      som.retomar?.();
    }
  }

  /* ---- pintura ---- */

  function pintarFita(p) {
    if (!massaE) return;
    massaE.setAttribute('r', (21 - 9.5 * p).toFixed(2));
    massaD.setAttribute('r', (11.5 + 9.5 * p).toFixed(2));
  }

  function pintarFaixa(f) {
    if (!f?.audio || !f.controle) return;
    const d = f.duracao;
    const p = arrastando === f
      ? Number(f.controle.value) / PASSOS
      : d > 0 ? clamp(f.audio.currentTime / d) : 0;
    f.cheio.style.transform = `scaleX(${p.toFixed(4)})`;
    if (arrastando !== f) f.controle.value = String(Math.round(p * PASSOS));
    if (d > 0 && !f.falhou) {
      const agora = relogio(p * d);
      const total = relogio(d);
      f.tempo.textContent = `${agora} / ${total}`;
      const dito = `${agora} de ${total}`;
      // Só reescreve quando muda: o leitor de tela anuncia cada troca do valor.
      if (dito !== f.dito) {
        f.dito = dito;
        f.controle.setAttribute('aria-valuetext', dito);
      }
    }
    if (f === atual) pintarFita(p);
  }

  function laco() {
    quadroId = requestAnimationFrame(laco);
    if (atual) pintarFaixa(atual);
  }

  function pintarEstado() {
    let algum = false;
    for (const f of faixas) {
      if (!f.botao) continue;
      const toca = tocando(f);
      algum ||= toca;
      f.no.toggleAttribute('data-tocando', toca);
      // O rótulo diz o que o toque faz agora (sem aria-pressed: rótulo e estado não se somam).
      f.botao.setAttribute('aria-label', `${toca ? r('pausar') : r('tocar')}: ${f.nome}`);
    }
    raiz?.toggleAttribute('data-tocando', algum);
    if (algum) {
      if (!quadroId) quadroId = requestAnimationFrame(laco);
      return;
    }
    cancelAnimationFrame(quadroId);
    quadroId = 0;
    voltarMusica();
  }

  function marcarFalha(f) {
    if (f.falhou || !f.no) return;
    f.falhou = true;
    const tinhaFoco = f.no.contains(document.activeElement);
    f.no.dataset.estado = 'falhou';
    f.botao.disabled = true;
    f.controle.disabled = true;
    f.tempo.textContent = '';
    f.aviso.textContent = r('falhou');
    f.aviso.hidden = false;
    if (anuncio) anuncio.textContent = `${f.nome}. ${r('falhou')}`;
    // O botão desabilitado perde o foco: ele vai para o próximo que ainda toca, ou para o fechar.
    if (tinhaFoco && aberto) {
      const proximo = faixas.find((x) => x.botao && !x.botao.disabled)?.botao || botaoFechar;
      proximo?.focus({ preventScroll: true });
    }
    pintarEstado();
  }

  /* ---- os áudios ---- */

  function prepararAudio(f) {
    if (f.audio || !f.arquivo || !f.no) return;
    const a = new Audio();
    a.preload = 'metadata';
    const medir = () => {
      f.duracao = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0;
      f.controle.disabled = f.falhou || !(f.duracao > 0);
      pintarFaixa(f);
    };
    a.addEventListener('loadedmetadata', medir);
    a.addEventListener('durationchange', medir);
    a.addEventListener('timeupdate', () => pintarFaixa(f));
    for (const ev of ['play', 'playing', 'pause']) a.addEventListener(ev, pintarEstado);
    a.addEventListener('ended', () => {
      a.currentTime = 0;
      pintarEstado();
      pintarFaixa(f);
    });
    a.addEventListener('error', () => marcarFalha(f));
    a.src = f.arquivo;
    f.audio = a;
  }

  function pausarTudo(exceto = null) {
    for (const f of faixas) {
      if (f !== exceto && tocando(f)) f.audio.pause();
    }
  }

  function alternar(f) {
    const a = f.audio;
    if (!a || f.falhou) return;
    if (!a.paused) {
      a.pause();
      return;
    }
    pausarTudo(f);
    atual = f;
    abaixarMusica();
    // O play() sai no toque, sem nada esperando antes (iPhone).
    a.play()
      .catch((erro) => {
        if (erro?.name !== 'AbortError' && erro?.name !== 'NotAllowedError') marcarFalha(f);
      })
      .finally(pintarEstado);
  }

  /* ---- o DOM (nasce na primeira abertura) ---- */

  function montarFaixa(f) {
    const li = el('li', { class: 'ui-entra voz-item', dataset: { estado: f.arquivo ? 'pronto' : 'vazio' } });
    li.style.setProperty('--i', String(f.n + 1));
    f.no = li;
    const nome = el('span', { class: 'voz-nome', texto: f.nome });

    if (!f.arquivo) {
      // Sem arquivo: o lugar dele, apagado, sem ação.
      li.append(
        el('span', { class: 'ui-redondo voz-tocar voz-tocar-vazio', 'aria-hidden': 'true' }, svg(ICONE_TOCAR)),
        el('div', { class: 'voz-meio' }, [
          el('div', { class: 'voz-linha' }, nome),
          el('p', { class: 'voz-aviso', texto: vazio.replaceAll('{n}', String(f.n)) }),
        ]),
      );
      return li;
    }

    f.botao = el('button', {
      type: 'button',
      class: 'ui-redondo voz-tocar',
      'data-acao': 'voz-tocar',
      'aria-label': `${r('tocar')}: ${f.nome}`,
      onclick: () => alternar(f),
    }, [svg(ICONE_TOCAR), svg(ICONE_PAUSA)]);

    f.cheio = el('span', { class: 'voz-fio-cheio' });
    // Desabilitado até a duração chegar.
    f.controle = el('input', {
      type: 'range',
      class: 'voz-controle',
      min: '0',
      max: String(PASSOS),
      step: '1',
      value: '0',
      disabled: true,
      'aria-label': `${r('progresso')}: ${f.nome}`,
    });
    f.tempo = el('span', { class: 'voz-tempo', 'aria-hidden': 'true' });
    f.aviso = el('p', { class: 'voz-aviso', hidden: true });

    f.controle.addEventListener('input', () => {
      arrastando = f;
      pintarFaixa(f);
    });
    const soltar = () => {
      if (arrastando !== f) return;
      arrastando = null;
      if (f.duracao > 0 && f.audio) {
        f.audio.currentTime = Math.min((Number(f.controle.value) / PASSOS) * f.duracao, f.duracao - 0.05);
      }
      pintarFaixa(f);
    };
    for (const ev of ['change', 'pointerup', 'pointercancel', 'blur']) f.controle.addEventListener(ev, soltar);

    const baixar = el('a', {
      class: 'ui-redondo voz-baixar',
      'data-acao': 'voz-baixar',
      href: f.arquivo,
      download: nomeParaBaixar(f.titulo, f.arquivo, f.n),
      'aria-label': `${r('baixar')}: ${f.nome}`,
    }, svg(ICONE_BAIXAR));

    // Um touchstart vazio faz o :active funcionar no iPhone.
    for (const alvo of [f.botao, baixar]) alvo.addEventListener('touchstart', semNada, { passive: true });

    li.append(
      f.botao,
      el('div', { class: 'voz-meio' }, [
        el('div', { class: 'voz-linha' }, nome),
        el('div', { class: 'voz-barra' }, [
          el('span', { class: 'voz-trilho' }, [
            el('span', { class: 'voz-fio', 'aria-hidden': 'true' }, f.cheio),
            f.controle,
          ]),
          f.tempo,
        ]),
        f.aviso,
      ]),
      baixar,
    );
    return li;
  }

  function montar() {
    if (raiz) return;
    const fita = el('div', { class: 'voz-fita', 'aria-hidden': 'true' }, svg(FITA));
    massaE = fita.querySelector('.voz-massa-e');
    massaD = fita.querySelector('.voz-massa-d');

    botaoFechar = el('button', {
      type: 'button',
      class: 'ui-redondo voz-fechar',
      'data-acao': 'voz-fechar',
      'aria-label': r('fechar'),
      onclick: () => api.fechar(),
    }, svg(ICONE_FECHAR));
    botaoFechar.addEventListener('touchstart', semNada, { passive: true });

    anuncio = el('p', { class: 'so-leitor', role: 'status' });

    cartao = el('div', { class: 'ui-folha voz-cartao' }, [
      el('span', { class: 'ui-laco', dataset: { onde: 'topo' }, 'aria-hidden': 'true' }),
      el('div', { class: 'ui-rola voz-miolo' }, [
        fita,
        el('h2', { class: 'ui-titulo voz-titulo', id: 'voz-titulo', texto: titulo }),
        frase ? el('p', { class: 'ui-nota voz-frase', id: 'voz-frase', texto: frase }) : null,
        el('ol', { class: 'voz-lista' }, faixas.map(montarFaixa)),
      ]),
      botaoFechar,
      anuncio,
    ]);

    const veu = el('div', { class: 'voz-veu' });
    veu.addEventListener('click', () => {
      if (performance.now() - abertoEm > VEU_MS) api.fechar();
    });

    raiz = el('section', {
      id: 'voz',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'voz-titulo',
      'aria-describedby': frase ? 'voz-frase' : null,
      hidden: true,
    }, [veu, cartao]);
    // O mundo não recebe toque nenhum do cartão.
    for (const ev of ['pointerdown', 'pointerup', 'click']) raiz.addEventListener(ev, (e) => e.stopPropagation());
    document.body.append(raiz);
  }

  /* ---- teclado: as teclas ficam no cartão ---- */

  function focaveis() {
    return [...cartao.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"])')]
      .filter((n) => n.offsetParent !== null);
  }

  function aoTeclar(e) {
    if (!aberto) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      api.fechar();
      return;
    }
    // As outras teclas param aqui, para não chegar às cenas (a ação padrão segue).
    e.stopPropagation();

    if (e.key === 'Tab') {
      const lista = focaveis();
      if (!lista.length) return;
      const i = lista.indexOf(document.activeElement);
      const ultimo = lista.length - 1;
      if (i < 0) {
        e.preventDefault();
        lista[0].focus();
      } else if (e.shiftKey && i === 0) {
        e.preventDefault();
        lista[ultimo].focus();
      } else if (!e.shiftKey && i === ultimo) {
        e.preventDefault();
        lista[0].focus();
      }
      return;
    }

    const pulo = { ArrowLeft: -PULO_S, ArrowDown: -PULO_S, ArrowRight: PULO_S, ArrowUp: PULO_S }[e.key];
    const f = pulo && faixas.find((x) => x.controle && x.controle === e.target);
    if (f && f.duracao > 0 && !f.controle.disabled) {
      e.preventDefault();
      f.audio.currentTime = clamp(f.audio.currentTime + pulo, 0, f.duracao - 0.05);
      pintarFaixa(f);
    }
  }

  /* ---- abrir e fechar ---- */

  function abrirCartao() {
    if (!faixas.length) return Promise.resolve();
    const fechou = new Promise((resolve) => resolvedores.push(resolve));
    if (aberto) return fechou;

    montar();
    aberto = true;
    abertoEm = performance.now();
    focoAntes = document.activeElement;
    clearTimeout(saida);
    for (const f of faixas) {
      prepararAudio(f);
      pintarFaixa(f);
    }
    pintarFita(atual?.duracao > 0 ? clamp(atual.audio.currentTime / atual.duracao) : 0);
    raiz.hidden = false;
    void raiz.offsetWidth; // a entrada parte do fechado
    raiz.setAttribute('data-aberto', '');
    document.addEventListener('keydown', aoTeclar, true);
    ctx.som?.efeito?.('papel');
    const primeiro = faixas.find((f) => f.botao && !f.botao.disabled)?.botao || botaoFechar;
    primeiro.focus({ preventScroll: true });
    return fechou;
  }

  const api = {
    /** Põe a fita na bolsa (e a lembra no aparelho). Sem áudios, false. Chamar de novo não faz mal. */
    liberar() {
      if (!faixas.length) return false;
      liberada = true;
      lembrar(true);
      const inv = ctx.inventario;
      if (!inv) return true;
      if (!inv.tem?.(ID)) inv.guardar?.(item());
      inv.mostrarBotao?.();
      // No fim da carta, a bolsa abre em qualquer etapa.
      if (document.documentElement.dataset.cena === 'final') inv.manterLivre?.(true);
      return true;
    },

    /** Abre o cartão. Com a fita na bolsa, abre por ela (a bolsa cuida do foco e da releitura). */
    abrir() {
      if (aberto || !faixas.length) return abrirCartao();
      const inv = ctx.inventario;
      if (inv?.tem?.(ID) && !inv.aberto && typeof inv.reabrir === 'function') return inv.reabrir(ID);
      return abrirCartao();
    },

    fechar() {
      if (!aberto) return;
      aberto = false;
      document.removeEventListener('keydown', aoTeclar, true);
      pausarTudo();
      pintarEstado(); // nada toca: a música volta
      raiz.removeAttribute('data-aberto');
      clearTimeout(saida);
      const esconder = () => {
        if (!aberto) raiz.hidden = true;
      };
      // Versão calma (amb.reduzido ou html.reduzido): o cartão só dissolve, o hidden vem já.
      if (ctx.amb?.reduzido || document.documentElement.classList.contains('reduzido')) esconder();
      else saida = setTimeout(esconder, SAIDA_MS);
      const volta = focoAntes?.isConnected && !focoAntes.disabled && focoAntes.offsetParent
        ? focoAntes
        : document.querySelector('[data-acao="inventario"]');
      focoAntes = null;
      volta?.focus?.({ preventScroll: true });
      for (const resolver of resolvedores.splice(0)) resolver();
    },

    get aberto() { return aberto; },
    get liberada() { return liberada; },
  };

  /* ---- gatilhos ---- */

  const pedido = (ctx.amb?.params || new URLSearchParams(location.search)).get('voz');
  if (pedido === '0') lembrar(false);
  // Da visita seguinte em diante, a fita já está na bolsa desde o começo.
  if (faixas.length && ctx.inventario && pedido !== '0' && lembrada()) {
    liberada = true;
    ctx.inventario.guardar?.(item());
  }
  // Garantia: a cena final pode não chamar liberar().
  ctx.diretor?.aoMudar?.((cena, etapa) => {
    if (cena === 'final' && etapa === 'fim') api.liberar();
  });
  if (pedido === '1' || pedido === 'abrir') {
    const parar = ctx.diretor?.aoMudar?.((cena) => {
      if (!cena || cena === 'senha' || cena === 'musica') return;
      parar();
      api.liberar();
      if (pedido === 'abrir') api.abrir();
    });
  }

  return api;
}
