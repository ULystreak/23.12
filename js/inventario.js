/* ============================================================================
   INVENTÁRIO: a bolsa no canto
   ============================================================================
   O botão redondo no canto de baixo, à direita (a bolsinha e o selo com a
   contagem), e a folha com tudo o que ela já guardou: as cartas dos capítulos
   (com a face do tema), as cartas do chão (envelopes brancos) e a fita da voz,
   fixa numa faixa acima das cartas. Tocar num item reabre o conteúdo (via
   `abrir()` do item). A bolsa não guarda nada sozinha nem persiste nada: quem
   chama `guardar` (diretor, cartas do chão, voz) decide e lembra.
   ========================================================================== */

import { el, svg } from './nucleo/util.js';

const TINTA = '#2a1b22';
// Entre tirar data-aberto e esconder a folha. O CSS sai em 220 ms (180 ms no
// computador); a folga garante que a folha nunca some antes de terminar de descer.
const SAIDA_MS = 240;

/** A fita cassete pequena, com o coração no rótulo (92 × 60). Também usada no chão do menu. */
export const FITA_PEQUENA = `<svg viewBox="0 0 92 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <rect x="1.2" y="1.2" width="89.6" height="57.6" rx="6" fill="#fffdf9" stroke="${TINTA}" stroke-width="1.6"/>
  <rect x="8" y="6" width="76" height="33" rx="3.2" fill="#fbf7f0" stroke="${TINTA}" stroke-opacity="0.45"/>
  <path d="M8.5 11.5h75" stroke="#d7192d" stroke-width="1.5"/>
  <path d="M14 15.2h36" stroke="${TINTA}" stroke-opacity="0.28" stroke-linecap="round"/>
  <path d="M74 19.6C71.1 17.5 69.7 16 69.7 14.4a2.25 2.25 0 0 1 4.3-.9 2.25 2.25 0 0 1 4.3.9c0 1.6-1.4 3.1-4.3 5.2z" fill="#d7192d"/>
  <rect x="24" y="21" width="44" height="14" rx="7" fill="#ffffff" stroke="${TINTA}" stroke-opacity="0.55"/>
  <circle cx="33" cy="28" r="4.6" fill="${TINTA}" fill-opacity="0.82"/>
  <circle cx="59" cy="28" r="3.2" fill="${TINTA}" fill-opacity="0.82"/>
  <circle cx="33" cy="28" r="1.5" fill="#ffffff"/>
  <circle cx="59" cy="28" r="1.5" fill="#ffffff"/>
  <path d="M22 58.8 27 46h38l5 12.8" fill="none" stroke="${TINTA}" stroke-opacity="0.5" stroke-width="1.2" stroke-linejoin="round"/>
  <circle cx="35" cy="53" r="2" fill="${TINTA}" fill-opacity="0.4"/>
  <circle cx="57" cy="53" r="2" fill="${TINTA}" fill-opacity="0.4"/>
</svg>`;

const ICONE_BOLSA = `<svg class="ui-icone inventario-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M8 10.6C8 5.4 16 5.4 16 10.6"/>
  <path class="inventario-icone-corpo" d="M4.6 10.4h14.8l-1.1 8.9a1.8 1.8 0 0 1-1.8 1.6H7.5a1.8 1.8 0 0 1-1.8-1.6z"/>
  <path d="M4.8 10.6c2.4 3.4 12 3.4 14.4 0"/>
  <circle class="cheio" cx="12" cy="13.9" r="1.3"/>
</svg>`;

const ICONE_FECHAR = `<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>`;

const ICONE_OUVIR = `<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="cheio" d="M8.6 5.9v12.2a.9.9 0 0 0 1.37.77l9.6-6.1a.9.9 0 0 0 0-1.53l-9.6-6.1a.9.9 0 0 0-1.37.76z"/></svg>`;

// As dobras do envelope por cima da face do tema.
const DOBRA = `<svg viewBox="0 0 460 320" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <path d="M6 8 230 178 454 8" fill="none" stroke="${TINTA}" stroke-opacity="0.3" stroke-width="5" stroke-linejoin="round"/>
  <path d="M8 13 230 183 452 13" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="3"/>
  <path d="M8 312 186 150M452 312 274 150" fill="none" stroke="${TINTA}" stroke-opacity="0.14" stroke-width="4"/>
</svg>`;

/** O envelope branco das cartas do chão (92 × 64): a galeria leva um coração; as outras, um lacre redondo. */
function envelopeBranco(tipo) {
  const selo = tipo === 'galeria'
    ? '<path d="M46 42.6c-4.6-3.4-6.9-5.9-6.9-8.6a3.55 3.55 0 0 1 6.9-1.3 3.55 3.55 0 0 1 6.9 1.3c0 2.7-2.3 5.2-6.9 8.6z" fill="#d7192d"/>'
    : '<circle cx="46" cy="35" r="7" fill="#d7192d"/><circle cx="46" cy="35" r="4.3" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="1.2"/>';
  return `<svg viewBox="0 0 92 64" aria-hidden="true" focusable="false">
    <rect x="0.75" y="0.75" width="90.5" height="62.5" rx="4" fill="#ffffff" stroke="${TINTA}" stroke-opacity="0.26" stroke-width="1.2"/>
    <path d="M2 62 36 31M90 62 56 31" fill="none" stroke="${TINTA}" stroke-opacity="0.14" stroke-width="1.2"/>
    <path d="M1.5 2.5 46 35 90.5 2.5" fill="#fbf7f0" stroke="${TINTA}" stroke-opacity="0.32" stroke-width="1.3" stroke-linejoin="round"/>
    ${selo}
  </svg>`;
}

export function criarInventario({ conteudo, amb, som, raiz }) {
  const textos = conteudo?.inventario || {};
  const rotulos = textos.rotulos || {};

  const itens = [];
  const novos = new Set();
  const ouvintes = new Set();
  const faces = new Map();
  let folhaAberta = false;
  let reaberto = false;
  let livre = false;
  let sempreLivre = false;
  let botaoVisto = false;
  let saida = 0;
  let repintar = false;
  let modEnvelope = null;
  let pedindoEnvelope = null;

  /* ---- montagem ----------------------------------------------------------- */

  const conta = el('span', { class: 'ui-selo inventario-conta', 'aria-hidden': 'true' });
  const botao = el('button', {
    type: 'button',
    class: 'ui-redondo inventario-botao',
    'aria-label': rotulos.abrir || 'Abrir a bolsa',
    'aria-expanded': 'false',
    'aria-haspopup': 'dialog',
    'aria-controls': 'inventario-folha',
    'data-acao': 'inventario',
  }, [svg(ICONE_BOLSA), conta]);
  // Sem um touchstart (mesmo vazio) o :active não aparece no Safari do iPhone.
  botao.addEventListener('touchstart', () => {}, { passive: true });

  const fixos = el('div', { class: 'inventario-fixos', hidden: true });
  const lista = el('ul', { class: 'inventario-lista', hidden: true });
  const fechar = el('button', {
    type: 'button',
    class: 'ui-redondo inventario-fechar',
    'aria-label': rotulos.fechar || 'Fechar a bolsa',
    'data-acao': 'inventario-fechar',
  }, svg(ICONE_FECHAR));
  const titulo = el('h2', { class: 'ui-titulo inventario-titulo', id: 'inventario-titulo', texto: textos.titulo || 'Sua bolsa' });
  const fundo = el('div', { class: 'inventario-fundo', 'aria-hidden': 'true', hidden: true });
  // A folha não rola: quem rola é o miolo. Assim o pesponto e os cantos ficam parados.
  const folha = el('div', {
    class: 'ui-folha inventario-folha',
    id: 'inventario-folha',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'inventario-titulo',
    'data-borda': 'base',
    hidden: true,
  }, [
    el('span', { class: 'ui-puxador', 'aria-hidden': 'true' }),
    el('div', 'inventario-topo', [titulo, fechar]),
    el('span', { class: 'ui-fio inventario-costura', 'aria-hidden': 'true' }),
    el('div', 'ui-rola inventario-miolo', [fixos, lista]),
  ]);
  raiz.append(fundo, botao, folha);

  /* ---- desenho dos itens --------------------------------------------------- */

  // A face do tema sai do envelope.js, que fica fora do caminho da primeira tela:
  // só é pedido quando a primeira carta entra, e a bolsa se repinta quando chega.
  function carregarEnvelope() {
    pedindoEnvelope ||= import('./mundo/envelope.js').then(
      (m) => { modEnvelope = m; },
      () => { modEnvelope = {}; },
    ).then(() => {
      if (folhaAberta) repintar = true;
      else pintar();
    });
  }

  // JPEG pequeno, gerado uma vez por tema: a bolsa não redesenha a cada guardar.
  function faceDoTema(tema) {
    if (!tema) return '';
    if (faces.has(tema)) return faces.get(tema);
    if (!modEnvelope) {
      carregarEnvelope();
      return '';
    }
    let url = '';
    try {
      url = modEnvelope.imagemDoTema?.(tema, 256)?.toDataURL('image/jpeg', 0.86) || '';
    } catch {
      url = '';
    }
    // Só guarda a que saiu: uma face que falhou agora tenta de novo na próxima
    // vez que a folha abrir (até lá, o envelope branco).
    if (url) faces.set(tema, url);
    else repintar = true;
    return url;
  }

  function desenhoDoItem(item) {
    const face = item.tipo === 'carta' ? faceDoTema(item.tema) : '';
    if (face) {
      const carta = el('span', 'inventario-carta', svg(DOBRA));
      carta.style.backgroundImage = `url("${face}")`;
      return carta;
    }
    return el('span', 'inventario-carta inventario-carta-branca', svg(envelopeBranco(item.tipo)));
  }

  // Um enfeite por vez: só a última coisa guardada, e só até ela ver.
  function petalaNova(item) {
    return item.id === [...novos].at(-1) ? el('span', { class: 'ui-petala inventario-nova', 'aria-hidden': 'true' }) : null;
  }

  function pintar() {
    repintar = false;
    // Guardar com a folha aberta redesenha a lista: o foco volta ao mesmo item.
    const focado = folha.contains(document.activeElement) ? document.activeElement.dataset?.id : null;
    lista.textContent = '';
    fixos.textContent = '';
    let posicao = 0;
    for (const item of itens) {
      if (item.fixo) {
        const linha = el('div', 'ui-entra inventario-fixo-linha', el('button', {
          type: 'button',
          class: 'ui-toque inventario-fixo',
          'data-acao': 'inventario-item',
          'data-id': item.id,
        }, [
          el('span', { class: 'inventario-fita', 'aria-hidden': 'true' }, [svg(FITA_PEQUENA), petalaNova(item)]),
          el('span', { class: 'inventario-fixo-nome', texto: item.titulo }),
          el('span', { class: 'inventario-fixo-ouvir', 'aria-hidden': 'true' }, svg(ICONE_OUVIR)),
        ]));
        linha.style.setProperty('--i', '0');
        fixos.append(linha);
        continue;
      }
      const li = el('li', 'ui-entra', el('button', {
        type: 'button',
        class: 'ui-toque inventario-item',
        'data-acao': 'inventario-item',
        'data-id': item.id,
        'data-tema': item.tema || '',
      }, [
        el('span', { class: 'inventario-miniatura', 'aria-hidden': 'true' }, [desenhoDoItem(item), petalaNova(item)]),
        el('span', { class: 'inventario-nome', texto: item.titulo }),
      ]));
      li.style.setProperty('--i', String(Math.min(posicao, 8)));
      posicao += 1;
      lista.append(li);
    }
    fixos.hidden = !fixos.childElementCount;
    lista.hidden = !lista.childElementCount;
    conta.textContent = itens.length ? String(itens.length) : '';
    if (focado) folha.querySelector(`[data-acao="inventario-item"][data-id="${CSS.escape(focado)}"]`)?.focus({ preventScroll: true });
    const copia = itens.slice();
    for (const fn of ouvintes) {
      try {
        fn(copia);
      } catch (erro) {
        console.error('[carta] ouvinte da bolsa', erro);
      }
    }
  }

  /* ---- o botão ------------------------------------------------------------- */

  function pular(classe) {
    if (amb?.reduzido) return;
    botao.classList.remove('chegou', 'recebeu', 'vazia');
    void botao.offsetWidth; // reinicia a animação
    botao.classList.add(classe);
  }
  // A classe sai no fim: com o preenchimento da animação, ela mandaria no transform
  // e o botão deixaria de afundar no toque e com a folha aberta.
  botao.addEventListener('animationend', (e) => {
    const fim = botao.classList.contains('recebeu') ? e.target === conta : e.target === botao;
    if (fim) botao.classList.remove('chegou', 'recebeu', 'vazia');
  });

  /* ---- a folha ------------------------------------------------------------- */

  function focaveis() {
    return [...folha.querySelectorAll('button:not(:disabled)')];
  }

  function aoTeclar(e) {
    if (!folhaAberta) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      fecharFolha();
      return;
    }
    if (e.key !== 'Tab') return;
    // O foco fica na folha enquanto ela está aberta (é um diálogo modal).
    const alvos = focaveis();
    if (!alvos.length) return;
    const i = alvos.indexOf(document.activeElement);
    if (i === -1) {
      e.preventDefault();
      alvos[0].focus();
    } else if (e.shiftKey && i === 0) {
      e.preventDefault();
      alvos.at(-1).focus();
    } else if (!e.shiftKey && i === alvos.length - 1) {
      e.preventDefault();
      alvos[0].focus();
    }
  }

  function sumir() {
    saida = 0;
    folha.hidden = true;
    fundo.hidden = true;
    novos.clear();
    for (const p of folha.querySelectorAll('.inventario-nova')) p.remove();
    if (repintar) pintar();
  }

  function abrirFolha() {
    if (raiz.hidden || !livre || reaberto || !itens.length) return false;
    if (folhaAberta) return true;
    folhaAberta = true;
    clearTimeout(saida);
    saida = 0;
    if (repintar) pintar();
    folha.hidden = false;
    fundo.hidden = false;
    void folha.offsetWidth; // a transição parte do estado fechado
    raiz.setAttribute('data-aberto', '');
    botao.setAttribute('aria-expanded', 'true');
    som?.efeito?.('papel');
    document.addEventListener('keydown', aoTeclar);
    if (document.activeElement === botao) folha.querySelector('[data-acao="inventario-item"]')?.focus({ preventScroll: true });
    return true;
  }

  function fecharFolha(imediato = false) {
    if (!folhaAberta) {
      if (imediato && saida) {
        clearTimeout(saida);
        sumir();
      }
      return;
    }
    folhaAberta = false;
    const focoDentro = folha.contains(document.activeElement);
    raiz.removeAttribute('data-aberto');
    botao.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', aoTeclar);
    clearTimeout(saida);
    if (imediato || amb?.reduzido) sumir();
    else saida = setTimeout(sumir, SAIDA_MS);
    if (focoDentro && !botao.disabled && !raiz.hidden) botao.focus({ preventScroll: true });
  }

  async function reabrirItem(item) {
    if (!item || typeof item.abrir !== 'function' || reaberto) return;
    reaberto = true;
    raiz.setAttribute('data-relendo', '');
    fecharFolha();
    try {
      await item.abrir();
    } catch (erro) {
      console.error('[carta] reabrir da bolsa', erro);
    } finally {
      reaberto = false;
      raiz.removeAttribute('data-relendo');
      const foco = document.activeElement;
      if ((!foco || foco === document.body) && !botao.disabled && !raiz.hidden) botao.focus({ preventScroll: true });
    }
  }

  /* ---- toques -------------------------------------------------------------- */

  botao.addEventListener('click', () => {
    if (folhaAberta) {
      fecharFolha();
      return;
    }
    // Livre mas vazia: balança, em vez de não responder.
    if (!abrirFolha() && livre && !itens.length) pular('vazia');
  });
  fechar.addEventListener('click', () => fecharFolha());
  fundo.addEventListener('click', () => fecharFolha());
  folha.addEventListener('click', (e) => {
    const alvo = e.target.closest?.('[data-acao="inventario-item"]');
    if (!alvo || !folha.contains(alvo)) return;
    reabrirItem(itens.find((i) => i.id === alvo.dataset.id));
  });
  // Nada do que ela toca na bolsa chega ao mundo por baixo.
  for (const no of [folha, fundo]) {
    no.addEventListener('pointerdown', (e) => e.stopPropagation());
    no.addEventListener('pointerup', (e) => e.stopPropagation());
  }

  /* ---- API ------------------------------------------------------------------ */

  const inventario = {
    guardar(item) {
      if (!item || !item.id) return false;
      const novo = { tipo: 'carta', titulo: '', tema: '', fixo: false, abrir: null, ...item };
      const i = itens.findIndex((x) => x.id === novo.id);
      if (i >= 0) {
        itens[i] = novo;
        pintar();
        return false;
      }
      itens.push(novo);
      novos.add(novo.id);
      pintar();
      if (botaoVisto && !raiz.hidden) pular('recebeu');
      return true;
    },
    tem(id) {
      return itens.some((i) => i.id === id);
    },
    get itens() {
      return itens.slice();
    },
    mostrarBotao() {
      const estava = raiz.hidden;
      raiz.hidden = false;
      if (estava || !botaoVisto) pular('chegou');
      botaoVisto = true;
    },
    esconderBotao() {
      fecharFolha(true);
      raiz.hidden = true;
      botaoVisto = false;
    },
    liberar(sim) {
      livre = !!sim || sempreLivre;
      raiz.toggleAttribute('data-quieto', !livre);
      botao.disabled = !livre;
      if (!livre) fecharFolha();
    },
    manterLivre(sim = true) {
      sempreLivre = !!sim;
      if (sempreLivre) inventario.liberar(true);
    },
    reabrir(id) {
      return reabrirItem(itens.find((i) => i.id === id));
    },
    abrirFolha,
    fecharFolha,
    get aberto() {
      return reaberto || folhaAberta;
    },
    aoMudar(fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },
  };

  inventario.liberar(false);
  return inventario;
}
