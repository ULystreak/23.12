// A bolsa (o inventário): o botão no canto de baixo, à direita, e a folha com
// tudo o que ela já guardou.
// (contrato: _dev/ROTEIRO2.md, seção 3c)
//
//   criarInventario({ conteudo, amb, som, recursos, raiz }) → inventario   (raiz = #inventario)
//
//   inventario.guardar({ id, tipo, titulo, tema?, fixo?, abrir }) → boolean
//       id      único ('carta-poppy', 'carta-yourname', 'chao-1'… 'chao-surpresinha', 'voz')
//       tipo    'carta' | 'video' | 'galeria' | 'voz'   (o desenho do item)
//       fixo    true: o item mora numa faixa no alto da folha, acima das cartas, seja
//               qual for a ordem em que entrou (a fita com a voz dele, js/voz.js)
//       titulo  o nome que aparece na bolsa
//       tema    'poppy' | 'yourname' (só nas cartas dos capítulos)
//       abrir   () => Promise: reabre aquele conteúdo; resolve quando ela fechou
//       Devolve true se o item é novo (guardar de novo o mesmo id só atualiza).
//       Guardar NÃO mostra o botão: quem decide é o diretor (mostrarBotao).
//   inventario.tem(id) → boolean
//   inventario.itens → cópia da lista, na ordem em que foram guardados
//   inventario.mostrarBotao() / esconderBotao()
//   inventario.liberar(sim)   o diretor diz se a bolsa pode abrir agora (só nas etapas
//                             de espera). Fechada para abrir, o botão continua à vista,
//                             quieto ([data-quieto]); se estava aberta, fecha.
//   inventario.manterLivre(sim)   a bolsa passa a abrir em qualquer etapa (o diretor só a
//                             abre nas esperas; depois do fim da carta ela fica sempre
//                             à mão, para ela ouvir a voz dele). Quem chama é js/voz.js.
//   inventario.reabrir(id) → Promise   o mesmo que ela tocar no item (resolve ao fechar)
//   inventario.abrirFolha() → boolean / fecharFolha()
//   inventario.aberto → boolean   true com a folha aberta OU com um item reaberto na
//                                 frente (as cenas ignoram toques no mundo enquanto isso)
//   inventario.aoMudar(fn(itens)) → cancelar
//
// O desenho (linguagem em _dev/UI.md): o botão é um disco de papel pespontado com a
// bolsinha e o selo com o número de coisas guardadas; a folha é de papel costurado
// (sobe de baixo no celular, abre acima do botão no computador)
// e mostra cada coisa como uma carta pequena: as dos capítulos com a cara do tema
// (a mesma face do envelope 3D), as do chão como envelopes brancos com o nome.
// Só anima transform e opacity (css/inventario.css). Esc ou tocar fora fecha.
//
// Ganchos para os testes (não mudar): [data-acao="inventario"] (o botão),
// [data-acao="inventario-item"][data-id="…"] (cada item da folha, os fixos também),
// [data-acao="inventario-fechar"]. #inventario[data-aberto] com a folha aberta.

import { el, svg } from './nucleo/util.js';
import { imagemDoTema } from './mundo/envelope.js';

const TINTA = '#2a1b22';
const SAIDA_MS = 240;                    // a folha leva isto para sair (igual ao CSS)

// Os ícones seguem a grade da papelaria (24, traço 1.75, pontas redondas: .ui-icone).
// A bolsa: uma bolsinha de ombro, com o fecho no fio vermelho.
const ICONE_BOLSA = `
  <svg class="ui-icone inventario-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M8.8 9V8.2a3.2 3.2 0 0 1 6.4 0V9"/>
    <path class="inventario-icone-corpo" d="M6.8 9h10.4c.9 0 1.6.6 1.7 1.5l.7 5.2c.3 2.4-1.4 4.3-3.8 4.3H8.2c-2.4 0-4.1-1.9-3.8-4.3l.7-5.2C5.2 9.6 5.9 9 6.8 9z"/>
    <path d="M4.9 12.4c3.7 2.8 10.5 2.8 14.2 0"/>
    <circle class="cheio" cx="12" cy="14.6" r="1.7"/>
  </svg>`;

const ICONE_FECHAR = `
  <svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M7 7l10 10M17 7L7 17"/>
  </svg>`;

// Carta do chão guardada: um envelope branco, a tinta. O miolo muda com o tipo
// (vídeo: lacre redondo; galeria: um coração).
const envelopeBranco = (tipo) => `
  <svg viewBox="0 0 92 64" aria-hidden="true" focusable="false">
    <rect x="1.5" y="1.5" width="89" height="61" rx="3" fill="#fffdf9" stroke="${TINTA}" stroke-width="1.6"/>
    <path d="M2 62 L40 37 Q46 33.5 52 37 L90 62" fill="none" stroke="${TINTA}" stroke-width="1.1" stroke-opacity="0.45" stroke-linejoin="round"/>
    <path d="M2 2 L41 38 Q46 42 51 38 L90 2" fill="#fffdf9" stroke="${TINTA}" stroke-width="1.4" stroke-linejoin="round"/>
    ${tipo === 'galeria'
    ? '<path d="M46 47 C36 40 39.5 31.5 46 36.5 C52.5 31.5 56 40 46 47 Z" fill="#d7192d" stroke="#8f0b1d" stroke-width="1"/>'
    : '<circle cx="46" cy="39.5" r="6" fill="#d7192d" stroke="#8f0b1d" stroke-width="1"/><circle cx="44.2" cy="37.6" r="1.6" fill="#ffffff" fill-opacity="0.45"/>'}
  </svg>`;

// A fita com a voz dele: uma fita cassete pequena, a tinta, com o coração no rótulo.
// (O chão do menu do fim usa o mesmo desenho: js/cenas/menu.js.)
export const FITA_PEQUENA = `
  <svg viewBox="0 0 92 60" aria-hidden="true" focusable="false">
    <rect x="1.5" y="1.5" width="89" height="57" rx="6" fill="#fffdf9" stroke="${TINTA}" stroke-width="1.8"/>
    <rect x="9" y="8" width="74" height="31" rx="3" fill="#fbf7f0" stroke="${TINTA}" stroke-width="1.2"/>
    <path d="M14 14.5 H60" fill="none" stroke="#d7192d" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M71 12.6 C69.2 10.6 66.4 12.6 68 15 C68.8 16.2 70 17 71 17.8 C72 17 73.2 16.2 74 15 C75.6 12.6 72.8 10.6 71 12.6 Z" fill="#d7192d"/>
    <rect x="22" y="20" width="48" height="14" rx="7" fill="#ffffff" stroke="${TINTA}" stroke-width="1.2"/>
    <circle cx="32" cy="27" r="4.2" fill="none" stroke="${TINTA}" stroke-width="1.3"/>
    <circle cx="60" cy="27" r="4.2" fill="none" stroke="${TINTA}" stroke-width="1.3"/>
    <circle cx="32" cy="27" r="1.2" fill="${TINTA}"/><circle cx="60" cy="27" r="1.2" fill="${TINTA}"/>
    <path d="M22 58 L27 45 H65 L70 58" fill="none" stroke="${TINTA}" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="36" cy="52" r="1.5" fill="${TINTA}"/><circle cx="56" cy="52" r="1.5" fill="${TINTA}"/>
  </svg>`;

const ICONE_OUVIR = '<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="cheio-tinta" d="M9.2 6.6v10.8a.6.6 0 0 0 .9.5l8.6-5.4a.6.6 0 0 0 0-1L10.1 6.1a.6.6 0 0 0-.9.5z"/></svg>';

export function criarInventario({ conteudo, amb, som, raiz }) {
  const dados = conteudo?.inventario || {};
  const rotulos = dados.rotulos || {};
  const itens = [];
  const ouvintes = new Set();
  const faces = new Map();               // tema → endereço da imagem da carta (gerada uma vez)
  let livre = false;
  let sempreLivre = false;               // manterLivre(): abre em qualquer etapa
  let folhaAberta = false;
  let reaberto = false;                  // um item reaberto está na frente
  let saida = 0;
  let botaoVisto = false;
  const novos = new Set();               // o que ela guardou e ainda não viu na folha (ganha uma pétala)

  const conta = el('span', { class: 'ui-selo inventario-conta', 'aria-hidden': 'true' });
  const botao = el('button', {
    class: 'ui-redondo inventario-botao', type: 'button', 'aria-label': rotulos.abrir || 'Abrir a bolsa',
    'aria-expanded': 'false', 'aria-haspopup': 'dialog', dataset: { acao: 'inventario' },
  }, [svg(ICONE_BOLSA), conta]);
  // No iPhone, :active só vale com um ouvinte de toque no elemento.
  botao.addEventListener('touchstart', () => {}, { passive: true });
  const fixos = el('div', { class: 'inventario-fixos', hidden: true });   // a faixa do alto (a voz dele)
  const lista = el('ul', 'inventario-lista');
  const fechar = el('button', {
    class: 'ui-redondo inventario-fechar', type: 'button', 'aria-label': rotulos.fechar || 'Fechar a bolsa',
    dataset: { acao: 'inventario-fechar' },
  }, svg(ICONE_FECHAR));
  const titulo = el('p', 'ui-titulo inventario-titulo', dados.titulo || '');
  const fundo = el('div', { class: 'inventario-fundo', hidden: true });
  // (a folha não rola: quem rola é o miolo, para o pesponto e os cantos ficarem parados)
  const folha = el('div', {
    class: 'ui-folha inventario-folha', role: 'dialog', 'aria-label': dados.titulo || rotulos.abrir || '', hidden: true,
    dataset: { borda: 'base' },
  }, [
    el('span', { class: 'ui-puxador', 'aria-hidden': 'true' }),
    el('div', 'inventario-topo', [titulo, fechar]),
    el('span', { class: 'ui-fio inventario-costura', 'aria-hidden': 'true' }),
    el('div', 'ui-rola inventario-miolo', [fixos, lista]),
  ]);
  if (raiz) raiz.append(fundo, botao, folha);

  const faceDoTema = (tema) => {
    if (!tema) return '';
    if (!faces.has(tema)) {
      let endereco = '';
      try { endereco = imagemDoTema(tema, 256)?.toDataURL('image/jpeg', 0.86) || ''; } catch { endereco = ''; }
      faces.set(tema, endereco);
    }
    return faces.get(tema);
  };

  const desenhoDoItem = (item) => {
    const face = item.tipo === 'carta' ? faceDoTema(item.tema) : '';
    if (face) {
      const carta = el('span', { class: 'inventario-carta', 'aria-hidden': 'true', dataset: { tema: item.tema } });
      carta.style.backgroundImage = `url(${face})`;
      carta.append(svg(`<svg viewBox="0 0 92 64" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M0 0 L41 38 Q46 42 51 38 L92 0" fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="1.6" transform="translate(0 1)"/>
        <path d="M0 0 L41 38 Q46 42 51 38 L92 0" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="0.8"/>
      </svg>`));
      return carta;
    }
    return el('span', { class: 'inventario-carta inventario-carta-branca', 'aria-hidden': 'true' }, svg(envelopeBranco(item.tipo)));
  };

  // (só a última coisa guardada: um enfeite por vez)
  const petalaNova = (item) => (novos.size && [...novos].pop() === item.id ? el('span', { class: 'ui-petala inventario-nova', 'aria-hidden': 'true' }) : null);

  const pintar = () => {
    lista.textContent = '';
    fixos.textContent = '';
    let fila = 0;                        // a ordem de chegada na folha (.ui-entra, --i)
    for (const item of itens) {
      if (item.fixo) {
        const linha = el('div', 'ui-entra inventario-fixo-linha', el('button', {
          class: 'ui-toque inventario-fixo', type: 'button',
          dataset: { acao: 'inventario-item', id: item.id },
        }, [
          el('span', { class: 'inventario-fita', 'aria-hidden': 'true' }, [svg(FITA_PEQUENA), petalaNova(item)]),
          el('span', 'inventario-fixo-nome', item.titulo || ''),
          el('span', { class: 'inventario-fixo-ouvir', 'aria-hidden': 'true' }, svg(ICONE_OUVIR)),
        ]));
        linha.style.setProperty('--i', '0');
        fixos.append(linha);
        continue;
      }
      const li = el('li', 'ui-entra', el('button', {
        class: 'ui-toque inventario-item', type: 'button',
        dataset: { acao: 'inventario-item', id: item.id, tema: item.tema || '' },
      }, [
        el('span', 'inventario-miniatura', [desenhoDoItem(item), petalaNova(item)]),
        el('span', 'inventario-nome', item.titulo || ''),
      ]));
      fila += 1;
      li.style.setProperty('--i', String(Math.min(fila, 8)));
      lista.append(li);
    }
    fixos.hidden = !fixos.childElementCount;
    lista.hidden = !lista.childElementCount;
    conta.textContent = itens.length ? String(itens.length) : '';
    for (const fn of ouvintes) { try { fn(api.itens); } catch (erro) { console.error(erro); } }
  };

  /** Um pulinho no botão: acabou de receber uma coisa (ou acabou de aparecer). */
  const pular = (classe) => {
    if (amb?.reduzido) return;
    botao.classList.remove('chegou', 'recebeu', 'vazia');
    void botao.offsetWidth;                       // recomeça a animação
    botao.classList.add(classe);
  };
  botao.addEventListener('animationend', (e) => { if (e.target === botao) botao.classList.remove('chegou', 'recebeu', 'vazia'); });

  /** Reabre um item na frente (a folha fecha antes). Resolve quando ela fechou o que abriu. */
  const reabrirItem = async (item) => {
    if (!item || typeof item.abrir !== 'function' || reaberto) return;
    reaberto = true;                               // (antes de fechar: `aberto` não pisca para false)
    // Com uma carta reaberta na frente o botão sai da frente dela (#inventario[data-relendo]).
    if (raiz) raiz.setAttribute('data-relendo', '');
    api.fecharFolha();
    try { await item.abrir(); } catch (erro) { console.error('[carta] reabrir item da bolsa', erro); }
    reaberto = false;
    if (raiz) raiz.removeAttribute('data-relendo');
    // O que ela releu sai da página com o foco dentro: ele volta para a bolsa, não para o body.
    if ((!document.activeElement || document.activeElement === document.body) && !botao.disabled) botao.focus({ preventScroll: true });
  };

  const api = {
    guardar(item) {
      if (!item || !item.id) return false;
      const i = itens.findIndex((x) => x.id === item.id);
      const novo = { tipo: 'carta', titulo: '', tema: '', fixo: false, abrir: null, ...item };
      if (i >= 0) itens[i] = novo; else { itens.push(novo); novos.add(novo.id); }
      pintar();
      if (i < 0 && botaoVisto) pular('recebeu');
      return i < 0;
    },
    tem: (id) => itens.some((x) => x.id === id),
    get itens() { return itens.map((x) => ({ ...x })); },

    mostrarBotao() {
      if (!raiz) return;
      const estavaOculto = raiz.hidden;
      raiz.hidden = false;
      if (estavaOculto || !botaoVisto) pular('chegou');
      botaoVisto = true;
    },
    esconderBotao() {
      api.fecharFolha(true);
      if (raiz) raiz.hidden = true;
      botaoVisto = false;
    },

    liberar(sim) {
      livre = !!sim || sempreLivre;
      if (raiz) raiz.toggleAttribute('data-quieto', !livre);
      botao.disabled = !livre;
      if (!livre) api.fecharFolha();
    },

    manterLivre(sim = true) {
      sempreLivre = !!sim;
      if (sempreLivre) api.liberar(true);
    },
    reabrir: (id) => reabrirItem(itens.find((x) => x.id === id)),

    abrirFolha() {
      if (!raiz || raiz.hidden || !livre || reaberto || !itens.length) return false;
      if (folhaAberta) return true;
      folhaAberta = true;
      clearTimeout(saida);
      folha.hidden = false;
      fundo.hidden = false;
      void folha.offsetWidth;                     // a entrada parte do estado fechado
      raiz.setAttribute('data-aberto', '');
      botao.setAttribute('aria-expanded', 'true');
      som?.efeito?.('papel');
      // quem usa o teclado continua de onde a folha abriu
      if (document.activeElement === botao) {
        folha.querySelector('[data-acao="inventario-item"]')?.focus({ preventScroll: true });
      }
      return true;
    },
    /** imediato: some sem a saída animada (o botão está saindo de cena). */
    fecharFolha(imediato = false) {
      if (!folhaAberta && folha.hidden) return;
      const tinhaFoco = folha.contains(document.activeElement);
      folhaAberta = false;
      if (raiz) raiz.removeAttribute('data-aberto');
      botao.setAttribute('aria-expanded', 'false');
      clearTimeout(saida);
      const sumir = () => {
        if (folhaAberta) return;
        folha.hidden = true; fundo.hidden = true;
        // ela já viu o que era novo: as pétalas saem
        if (novos.size) { novos.clear(); for (const p of folha.querySelectorAll('.inventario-nova')) p.remove(); }
      };
      if (imediato || amb?.reduzido) sumir(); else saida = setTimeout(sumir, SAIDA_MS);
      if (tinhaFoco && !botao.disabled) botao?.focus({ preventScroll: true });
    },
    get aberto() { return reaberto || folhaAberta; },

    aoMudar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
  };

  botao.addEventListener('click', () => {
    if (folhaAberta) { api.fecharFolha(); return; }
    // bolsa ainda vazia: ela balança que não, em vez de não responder
    if (!api.abrirFolha() && livre && !reaberto && !itens.length) pular('vazia');
  });
  fechar.addEventListener('click', () => api.fecharFolha());
  fundo.addEventListener('click', () => api.fecharFolha());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && folhaAberta) { e.stopPropagation(); api.fecharFolha(); }
  });
  // Um toque na bolsa aberta nunca chega ao mundo (a carta não abre por baixo).
  for (const tipo of ['pointerdown', 'pointerup']) {
    folha.addEventListener(tipo, (e) => e.stopPropagation());
    fundo.addEventListener(tipo, (e) => e.stopPropagation());
  }
  folha.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-acao="inventario-item"]');
    if (alvo) reabrirItem(itens.find((x) => x.id === alvo.dataset.id));
  });

  api.liberar(false);
  return api;
}
