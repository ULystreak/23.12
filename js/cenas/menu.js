/* ============================================================================
   MENU: o varal do fio, o fim para onde ela volta
   ============================================================================
   Na primeira vez neste aparelho as referências passam amarradas num fio
   vermelho, como os créditos de um filme (um toque, Enter ou Esc pula). Depois
   o fio fica parado: uma etiqueta de papel por parte da carta, a pílula da
   saudade na ponta e, no chão, as coisas dela (a voz, o caderninho das
   referências, a folha "Escrever de volta" e, se houver, os bilhetes).

   As etiquetas de poppy e yourname relêem a carta na bolsa, sem recarregar
   (a música não para). As outras são links de verdade (?cena=<parte>&volta=1):
   a página recarrega e o diretor chama `portao`, que pede um toque antes da
   parte, porque o Safari só devolve o som depois de um gesto dela.

   O contador e a folha do alto vêm de js/cenas/resposta.js (criarDepois).
   A marca carta2312:menu (util.js) decide se as referências passam.
   Exporta cenaMenu(ctx, { frio }) (nunca resolve) e portao(ctx, cena).
   ========================================================================== */

import { el, svg, espera, menuLembrado, lembrarMenu, enderecoDaCena } from '../nucleo/util.js';
import { comoPromise, ocultarPalavras } from '../nucleo/movimento.js';
import { temCartas, temEncontro, cartasDoChao } from '../nucleo/diretor.js';
import { FITA_PEQUENA } from '../inventario.js';
import { criarDepois } from './resposta.js';

const NS = 'http://www.w3.org/2000/svg';
const TINTA = '#2a1b22';

// A ordem da viagem e das etiquetas. São nomes de cena do diretor (ORDEM):
// renomear uma cena quebra o link da etiqueta.
const PARTES = ['inicio', 'poppy', 'yourname', 'mao', 'cartas', 'encontro', 'final'];
// Estas a bolsa já guarda: a etiqueta relê a carta ali mesmo.
const CAPITULOS = new Set(['poppy', 'yourname']);

// Cada cartão das referências pende um nada torto, em ciclo.
const GIROS = [-1.3, 1.5, -0.8, 1.1, -1.5, 0.9];
// Os objetos do chão pousam tortos, cada um de um jeito.
const POUSOS = [-4, 3, -2, 3.5];

// O puxão dos créditos: arranca, corre a v px/s e freia. Nunca mais de 45 s.
const ARRANQUE = 1.6;
const FREADA = 1.7;
const TETO = 45;
// A folha do fim sai na frente; o varal desce depois que o fio dela escorre.
const DIANTEIRA = 1.15;

/* ---- desenhos (grade 24, traço 1,75, pontas redondas; o chão em 92 × 60) ---- */

const icone = (corpo, classe = '') => `<svg class="ui-icone${classe ? ` ${classe}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${corpo}</svg>`;

const ICONES = {
  cometa: icone('<circle cx="16.4" cy="7.6" r="3.1"/><path d="M14.2 9.8 4.2 19.8M12.3 7.4 6.6 13.1M16.6 11.7l-5.7 5.7"/>', 'menu-marca'),
  fita: icone('<rect x="3" y="6" width="18" height="12.5" rx="2.2"/><circle cx="8.9" cy="11.4" r="1.9"/><circle cx="15.1" cy="11.4" r="1.9"/><path d="M10.8 11.4h2.4M7.2 18.5 8.6 15.4h6.8l1.4 3.1"/>', 'menu-marca'),
  disco: icone('<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="2.3"/><path d="M12 5.9a6.1 6.1 0 0 1 6.1 6.1"/>', 'menu-marca'),
};
const ICONE_PULAR = icone('<path d="M6.2 6.4 13.4 12l-7.2 5.6z"/><path d="M17.6 6.2v11.6"/>');
const ICONE_FECHAR = icone('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>');
const ICONE_VOLTAR = icone('<path d="M9.6 6.6 4.4 12l5.2 5.4"/><path d="M5 12h9.4a4.6 4.6 0 0 1 0 9.2h-1.6"/>');
const ICONE_ABRIR = icone('<path d="M6.5 9.5 12 15l5.5-5.5"/>', 'menu-bilhete-seta');
const CORACAO = `<svg class="menu-saudade-coracao" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 16.8C4.6 12.6 2.4 9.8 2.4 6.9a3.9 3.9 0 0 1 7.6-1.3 3.9 3.9 0 0 1 7.6 1.3c0 2.9-2.2 5.7-7.6 9.9z" fill="currentColor"/></svg>`;

// O caderninho aberto, com a fita vermelha de marcar página.
const CADERNO = `<svg viewBox="0 0 92 60" aria-hidden="true" focusable="false">
  <path d="M7 53.5c12-3 27-3 39 2 12-5 27-5 39-2" fill="none" stroke="${TINTA}" stroke-opacity="0.45" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M46 9.5C35 4.6 20 4.4 8 7.6V51c12-3.2 27-3 38 2z" fill="#fbf7f0" stroke="${TINTA}" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M46 9.5c11-4.9 26-5.1 38-1.9V51c-12-3.2-27-3-38 2z" fill="#fffdf9" stroke="${TINTA}" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M14 17.5c8-1.8 17-1.6 25 .6M14 24.5c8-1.8 17-1.6 25 .6M14 31.5c8-1.8 17-1.6 25 .6M14 38.5c6-1.3 12-1.2 18 .3M53 18c8-2.2 17-2.4 25-.6M53 25c8-2.2 17-2.4 25-.6M53 32c8-2.2 17-2.4 25-.6" fill="none" stroke="${TINTA}" stroke-opacity="0.26" stroke-width="1.1" stroke-linecap="round"/>
  <path d="M46 9.5V53" stroke="${TINTA}" stroke-opacity="0.35" stroke-width="1.1"/>
  <path d="M64 6.2V57l3.2-3.4 3.3 3.4V6" fill="#d7192d"/>
</svg>`;

// A folha com a ponta dobrada e a pena.
const FOLHA_PENA = `<svg viewBox="0 0 92 60" aria-hidden="true" focusable="false">
  <path d="M12 4.5h40l11 11v40.5H12z" fill="#fbf7f0" stroke="${TINTA}" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M52 4.5v11h11" fill="#efe7da" stroke="${TINTA}" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M19 22h30M19 29h37M19 36h26M19 43h20" stroke="${TINTA}" stroke-opacity="0.26" stroke-width="1.1" stroke-linecap="round"/>
  <path d="M47 51.5C55 37 68 21 87 8.5c-2.5 13-13 29-31 39.5z" fill="#fffdf9" stroke="${TINTA}" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M42.5 57 81 15.5" stroke="${TINTA}" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M61 33.5l6 1.5M68 25l6.3 1.2" stroke="${TINTA}" stroke-opacity="0.35" stroke-width="1.1" stroke-linecap="round"/>
</svg>`;

// O montinho de bilhetes amarrado com o fio.
const BILHETES = `<svg viewBox="0 0 92 60" aria-hidden="true" focusable="false">
  <rect x="13" y="17" width="62" height="36" rx="3" transform="rotate(-6 44 35)" fill="#efe7da" stroke="${TINTA}" stroke-opacity="0.5" stroke-width="1.3"/>
  <rect x="17" y="13" width="62" height="36" rx="3" transform="rotate(3.5 48 31)" fill="#fffdf9" stroke="${TINTA}" stroke-opacity="0.6" stroke-width="1.3"/>
  <rect x="14" y="15" width="62" height="36" rx="3" fill="#fbf7f0" stroke="${TINTA}" stroke-width="1.5"/>
  <path d="M15 22.5 45 33l30-10.5" fill="none" stroke="${TINTA}" stroke-opacity="0.3" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M45 15v36M14 33h62" stroke="#d7192d" stroke-width="1.7"/>
  <path d="M45 33c-5.5-7.5-14-6.6-12.2-.6 1.4 4.3 8.4 3.6 12.2.6zM45 33c5.5-7.5 14-6.6 12.2-.6-1.4 4.3-8.4 3.6-12.2.6z" fill="none" stroke="#d7192d" stroke-width="1.7" stroke-linejoin="round"/>
  <path d="M44 34.5l-5 9.5M46 34.5l5.5 9" stroke="#d7192d" stroke-width="1.7" stroke-linecap="round"/>
  <circle cx="45" cy="33.2" r="2.2" fill="#d7192d"/>
</svg>`;

// Os três traços do fio: a sombra deslocada, a linha e a torção tracejada.
const TRACOS_DO_FIO = '<path class="menu-fio-sombra"/><path class="menu-fio-linha"/><path class="menu-fio-torcao"/>';

/* ---- apoios -------------------------------------------------------------------- */

function texto(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/** 'AAAA-M-D' válido → 'AAAA-MM-DD'; qualquer outra coisa → ''. */
function normalizarData(v) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(texto(v));
  if (!m) return '';
  const a = Number(m[1]);
  const mes = Number(m[2]);
  const d = Number(m[3]);
  const data = new Date(Date.UTC(a, mes - 1, d));
  if (data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== d) return '';
  return `${m[1]}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Hoje no calendário do aparelho; ?hoje= (só teste) fixa a data dos bilhetes. */
function hojeDoAparelho(amb) {
  const teste = normalizarData(amb?.params?.get?.('hoje'));
  if (teste) return teste;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Os rótulos do menu. Os lidos só pelo leitor de tela nunca ficam vazios. */
function rotulosDo(menu) {
  const r = menu?.rotulos || {};
  // Texto '' no content.js desliga a peça; chave ausente usa o padrão.
  const ou = (chave, padrao) => (typeof r[chave] === 'string' ? r[chave].trim() : padrao);
  return {
    nome: ou('nome', '') || 'Voltar a uma parte da carta',
    referencias: ou('referencias', 'As referências'),
    bilhetes: ou('bilhetes', 'Abra quando...'),
    bilheteFechado: ou('bilheteFechado', '') || 'Abre em {dia}',
    pular: ou('pular', '') || 'Pular as referências',
    fechar: ou('fechar', '') || 'Fechar',
    tocar: ou('tocar', 'Toque para começar'),
    voltar: ou('voltar', '') || 'Voltar ao menu',
  };
}

/** O bloco menu do content.js num objeto limpo. A letra das músicas nunca é lida aqui. */
function lerMenu(ctx) {
  const { conteudo = {}, amb } = ctx;
  const menu = conteudo.menu || {};
  const rot = rotulosDo(menu);

  const etiquetas = PARTES
    .filter((cena) => (cena !== 'cartas' || temCartas(conteudo)) && (cena !== 'encontro' || temEncontro(conteudo)))
    .map((cena) => ({ cena, nome: texto(menu.partes?.[cena]) }))
    .filter((e) => e.nome);

  const referencias = (Array.isArray(menu.referencias) ? menu.referencias : [])
    .map((r) => ({ titulo: texto(r?.titulo), de: texto(r?.de), sobre: texto(r?.sobre), dele: texto(r?.dele), icone: texto(r?.icone) }))
    .filter((r) => r.titulo && (r.sobre || r.dele));

  const faixas = (Array.isArray(conteudo.musica?.faixas) ? conteudo.musica.faixas : [])
    .map((f) => ({ titulo: texto(f?.titulo), artista: texto(f?.artista), capa: texto(f?.capa) }))
    .filter((f) => f.titulo);
  const musicas = {
    titulo: faixas.length ? texto(menu.musicas?.titulo) : '',
    dele: texto(menu.musicas?.dele),
    faixas,
  };

  // Só os amigos: a "Nossos momentos" conta para temCartas, mas não é gente.
  const nomes = cartasDoChao(conteudo).filter((c) => c.tipo === 'video').map((c) => c.nome);
  const amigos = { titulo: nomes.length ? texto(menu.amigos) : '', nomes };

  const numero = String(conteudo.resposta?.whatsapp ?? '').replace(/\D/g, '');
  const rotuloSaudade = texto(menu.saudade?.rotulo);
  const mensagem = texto(menu.saudade?.mensagem);
  const saudade = {
    rotulo: rotuloSaudade,
    frase: texto(menu.saudade?.frase),
    href: rotuloSaudade && (numero || mensagem)
      ? `https://wa.me/${numero}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''}`
      : '',
  };

  const bilhetes = (Array.isArray(menu.bilhetes) ? menu.bilhetes : [])
    .map((b) => ({ titulo: texto(b?.titulo), texto: texto(b?.texto), abre: normalizarData(b?.abre) }))
    .filter((b) => b.titulo && b.texto);

  const voz = conteudo.voz || {};
  const vozItens = (Array.isArray(voz.itens) ? voz.itens : []).filter((i) => texto(i?.titulo) || texto(i?.arquivo));
  const reabrir = conteudo.resposta?.rotulos?.reabrir;

  return {
    etiquetas,
    referencias,
    musicas,
    amigos,
    saudade,
    bilhetes,
    abertura: texto(menu.abertura),
    fecho: texto(menu.fecho),
    voz: { tem: vozItens.length > 0, titulo: texto(voz.titulo) || 'A minha voz' },
    escrever: typeof reabrir === 'string' ? reabrir.trim() : 'Escrever de volta',
    temLista: referencias.length > 0 || !!musicas.titulo || !!amigos.titulo,
    hoje: hojeDoAparelho(amb),
    rot,
  };
}

/** O furo (ilhó) por onde o fio passa. */
function ilho() {
  return el('span', { class: 'menu-ilho', 'aria-hidden': 'true' });
}

function marcaDe(nome) {
  if (nome === 'laco') return el('span', { class: 'ui-laco menu-marca', 'aria-hidden': 'true' });
  return Object.hasOwn(ICONES, nome) ? svg(ICONES[nome]) : null;
}

function costura() {
  return el('span', { class: 'ui-fio menu-costura', 'aria-hidden': 'true' });
}

function listaDeMusicas(faixas, recursos) {
  return el('ul', 'menu-musicas', faixas.map((f) => {
    // Sem capa, o disco é vermelho. Com capa, ela entra quando carregar.
    const disco = el('span', { class: 'menu-disco', 'aria-hidden': 'true' });
    if (f.capa) {
      Promise.resolve(recursos?.elementoImagem?.(f.capa, ''))
        .then((img) => {
          if (!img) return;
          disco.prepend(img);
          disco.setAttribute('data-capa', '');
        })
        .catch(() => {});
    }
    return el('li', 'menu-musica', [
      disco,
      el('span', 'menu-musica-texto', [
        el('span', 'menu-musica-nome', f.titulo),
        f.artista ? el('span', 'menu-musica-artista', f.artista) : null,
      ]),
    ]);
  }));
}

function listaDeAmigos(nomes) {
  return el('p', 'menu-amigos', nomes.map((n) => el('span', null, n)));
}

function cartao(tipo, filhos) {
  return el('div', { class: 'menu-cred', 'data-tipo': tipo }, [ilho(), ...filhos]);
}

/** Os cartões dos créditos: abertura, uma referência por cartão, músicas, amigos e fecho. */
function montarCreditos(m, recursos) {
  const cartoes = [];
  if (m.abertura) cartoes.push(cartao('bilhete', [el('p', 'menu-cred-bilhete', m.abertura)]));
  for (const r of m.referencias) {
    cartoes.push(cartao('ref', [
      marcaDe(r.icone),
      el('p', 'menu-cred-titulo', r.titulo),
      r.de ? el('p', 'menu-cred-de', r.de) : null,
      r.sobre ? el('p', 'menu-cred-sobre', r.sobre) : null,
      r.dele ? costura() : null,
      r.dele ? el('p', 'menu-cred-dele', r.dele) : null,
    ]));
  }
  if (m.musicas.titulo) {
    cartoes.push(cartao('musicas', [
      marcaDe('disco'),
      el('p', 'menu-cred-titulo', m.musicas.titulo),
      listaDeMusicas(m.musicas.faixas, recursos),
      m.musicas.dele ? el('p', 'menu-cred-dele', m.musicas.dele) : null,
    ]));
  }
  if (m.amigos.titulo) {
    cartoes.push(cartao('amigos', [
      el('span', { class: 'ui-coracao menu-marca', 'aria-hidden': 'true' }),
      el('p', 'menu-cred-titulo', m.amigos.titulo),
      listaDeAmigos(m.amigos.nomes),
    ]));
  }
  if (m.fecho) cartoes.push(cartao('bilhete', [el('p', 'menu-cred-bilhete', m.fecho)]));
  // O --giro vai antes do primeiro layout: o furo é medido com ele no lugar.
  cartoes.forEach((c, i) => c.style.setProperty('--giro', `${GIROS[i % GIROS.length]}deg`));
  return cartoes;
}

/** O conteúdo da folha das referências (o caderninho do chão). */
function montarListaDeReferencias(m, recursos) {
  const linha = (marca, filhos) => el('li', 'menu-ref', [
    el('span', { class: 'menu-ref-marca', 'aria-hidden': 'true' }, marca),
    el('div', 'menu-ref-texto', filhos),
  ]);
  const linhas = m.referencias.map((r) => linha(marcaDe(r.icone), [
    el('h3', 'menu-ref-titulo', r.titulo),
    r.de ? el('p', 'menu-ref-de', r.de) : null,
    r.sobre ? el('p', 'menu-ref-sobre', r.sobre) : null,
    r.dele ? el('p', 'menu-ref-dele', r.dele) : null,
  ]));
  if (m.musicas.titulo) {
    linhas.push(linha(marcaDe('disco'), [
      el('h3', 'menu-ref-titulo', m.musicas.titulo),
      listaDeMusicas(m.musicas.faixas, recursos),
      m.musicas.dele ? el('p', 'menu-ref-dele', m.musicas.dele) : null,
    ]));
  }
  if (m.amigos.titulo) {
    linhas.push(linha(el('span', 'ui-coracao'), [
      el('h3', 'menu-ref-titulo', m.amigos.titulo),
      listaDeAmigos(m.amigos.nomes),
    ]));
  }
  return el('ul', 'menu-refs', linhas);
}

/** Os bilhetes "abra quando...": o liberado abre e fecha; o fechado mostra a data. */
function montarListaDeBilhetes(m) {
  return el('ul', 'menu-bilhetes', m.bilhetes.map((b, i) => {
    if (b.abre && b.abre > m.hoje) {
      const [a, mes, d] = b.abre.split('-');
      return el('li', { class: 'menu-bilhete-item', 'data-fechado': '' }, [
        el('span', 'menu-bilhete-titulo', b.titulo),
        el('span', 'menu-bilhete-quando', m.rot.bilheteFechado.replace('{dia}', `${d}/${mes}/${a}`)),
      ]);
    }
    const id = `menu-bilhete-${i}`;
    const corpo = el('p', { class: 'menu-bilhete-texto', id, hidden: true }, b.texto);
    const abrir = el('button', {
      type: 'button',
      class: 'menu-bilhete-abrir',
      'data-acao': 'menu-bilhete',
      'aria-expanded': 'false',
      'aria-controls': id,
    }, [el('span', 'menu-bilhete-titulo', b.titulo), svg(ICONE_ABRIR)]);
    const item = el('li', 'menu-bilhete-item', [abrir, corpo]);
    abrir.addEventListener('click', () => {
      const abre = corpo.hidden;
      corpo.hidden = !abre;
      abrir.setAttribute('aria-expanded', String(abre));
      item.toggleAttribute('data-aberto', abre);
    });
    return item;
  }));
}

/** O caminho do fio: curvas cúbicas que chegam e saem de cada ponto na vertical. */
function caminhoDoFio(pontos) {
  if (pontos.length < 2) return '';
  const n = (v) => Math.round(v * 10) / 10;
  let d = `M${n(pontos[0].x)} ${n(pontos[0].y)}`;
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    const k = (b.y - a.y) * 0.45;
    d += `C${n(a.x)} ${n(a.y + k)} ${n(b.x)} ${n(b.y - k)} ${n(b.x)} ${n(b.y)}`;
  }
  return d;
}

/** As fontes chegaram (ou 1,2 s passou): só então os cartões têm a altura certa. */
function fontesProntas() {
  // setTimeout puro: a espera não acelera com ?rapido, a fonte não chega mais rápido.
  return Promise.race([
    document.fonts?.ready ?? Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 1200)),
  ]).catch(() => {});
}

/** O centro de um elemento nas coordenadas de `ref`, pelo layout (ignora transform). */
function centroEm(no, ref) {
  let x = no.offsetWidth / 2;
  let y = no.offsetHeight / 2;
  for (let n = no; n && n !== ref; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y };
}

function temFoco() {
  const a = document.activeElement;
  return !!a && a !== document.body && a !== document.documentElement;
}

// O iPhone só aplica :active com algum ouvinte de toque.
const vazio = () => {};
function comToque(no) {
  no.addEventListener('touchstart', vazio, { passive: true });
  return no;
}

/* ---- a folha que sobe do fim (referências e bilhetes) -------------------------- */

/**
 * Monta, uma vez, uma folha no <body>: o fundo de noite e o papel com título,
 * X, costura e o miolo que rola. Esc e o X fecham; o fundo só fecha depois de
 * 450 ms (o segundo toque de um duplo toque não fecha o que acabou de abrir).
 * Enquanto aberta, o menu fica inert e o Tab circula dentro da folha.
 */
function criarGaveta(ctx, { titulo, fechar: rotuloFechar, miolo, secao }) {
  const { amb, som } = ctx;
  const botaoFechar = comToque(el('button', {
    type: 'button',
    class: 'ui-redondo menu-folha-fechar',
    'data-acao': 'menu-fechar',
    'aria-label': rotuloFechar,
  }, svg(ICONE_FECHAR)));
  const folha = el('div', {
    class: 'ui-folha menu-folha',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': titulo,
    'data-borda': 'base',
  }, [
    el('span', { class: 'ui-puxador', 'aria-hidden': 'true' }),
    el('div', 'menu-folha-topo', [el('h2', 'ui-titulo menu-folha-titulo', titulo), botaoFechar]),
    el('span', { class: 'ui-fio menu-folha-costura', 'aria-hidden': 'true' }),
    // O miolo rola por dentro (o papel e o pesponto ficam parados) e recebe o
    // foco para rolar pelo teclado.
    el('div', { class: 'ui-rola menu-folha-miolo', tabindex: '0', role: 'region', 'aria-label': titulo }, miolo),
  ]);
  const fundo = el('div', { class: 'menu-gaveta-fundo', 'aria-hidden': 'true' });
  const raiz = el('div', { class: 'menu-gaveta', hidden: true }, [fundo, folha]);
  // Um toque na folha não chega ao mundo.
  for (const tipo of ['pointerdown', 'pointerup']) raiz.addEventListener(tipo, (e) => e.stopPropagation());
  document.body.append(raiz);

  let aberta = false;
  let abertaEm = 0;
  let gatilho = null;
  let saida = 0;

  const focaveis = () => [...folha.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]')]
    .filter((n) => !n.closest('[hidden]'));

  function aoTeclar(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      fecharGaveta();
      return;
    }
    if (e.key !== 'Tab') return;
    const lista = focaveis();
    if (!lista.length) return;
    e.preventDefault();
    const i = lista.indexOf(document.activeElement);
    const j = i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + lista.length) % lista.length;
    lista[j].focus({ preventScroll: true });
  }

  function abrir(de) {
    if (aberta) return;
    aberta = true;
    abertaEm = performance.now();
    gatilho = de || document.activeElement;
    clearTimeout(saida);
    secao.inert = true;
    raiz.hidden = false;
    void raiz.offsetWidth; // a entrada parte do estado fechado
    raiz.setAttribute('data-aberto', '');
    document.addEventListener('keydown', aoTeclar, true);
    som?.efeito?.('papel');
    botaoFechar.focus({ preventScroll: true });
  }

  function fecharGaveta() {
    if (!aberta) return;
    aberta = false;
    raiz.removeAttribute('data-aberto');
    // Sem isto o Tab ficaria preso numa folha fechada.
    document.removeEventListener('keydown', aoTeclar, true);
    secao.inert = false;
    if (amb?.reduzido) raiz.hidden = true;
    else saida = setTimeout(() => { raiz.hidden = true; }, 200);
    if (gatilho?.isConnected) gatilho.focus({ preventScroll: true });
  }

  botaoFechar.addEventListener('click', fecharGaveta);
  fundo.addEventListener('click', () => {
    if (performance.now() - abertaEm > 450) fecharGaveta();
  });

  return { raiz, abrir, fechar: fecharGaveta };
}

/* ---- o portão: um toque antes da parte ------------------------------------------ */

/**
 * Mostra a etiqueta da parte pendurada no fio, sobre a noite, e espera o toque
 * dela: é esse gesto que destrava o som depois da recarga (main.js devolve a
 * faixa de ?musica= no mesmo toque). Só existe para parte com nome. O toque
 * tira `volta` do endereço, para que recarregar não peça o portão de novo.
 */
export function portao(ctx, cena) {
  const { conteudo, amb, som } = ctx;
  const gsap = ctx.gsap || window.gsap;
  const menu = conteudo?.menu || {};
  const nome = texto(menu.partes?.[cena]);
  if (!nome || !gsap) return Promise.resolve();
  const rot = rotulosDo(menu);
  const raizHtml = document.documentElement;

  return new Promise((resolve) => {
    const furo = ilho();
    // A pendura sobe ao tocar; quem balança é a etiqueta dentro dela. Assim o
    // balanço do CSS não disputa o transform com o GSAP.
    const pendura = el('span', 'menu-portao-pendura', el('span', 'menu-etiqueta menu-portao-etiqueta', [furo, el('span', 'menu-portao-nome', nome)]));
    const fio = svg(`<svg class="menu-fio menu-portao-fio" aria-hidden="true" focusable="false">${TRACOS_DO_FIO}</svg>`);
    const toque = el('button', {
      type: 'button',
      class: 'menu-portao-toque',
      'data-acao': 'portao',
      'aria-label': rot.tocar ? `${nome}. ${rot.tocar}` : nome,
    }, [
      el('span', { class: 'menu-portao-veu', 'aria-hidden': 'true' }),
      fio,
      el('span', { class: 'menu-portao-meio', 'aria-hidden': 'true' }, [
        pendura,
        el('span', 'menu-portao-dica', [
          rot.tocar ? el('span', null, rot.tocar) : null,
          el('span', 'ui-petala menu-portao-petala'),
        ]),
      ]),
    ]);
    const voltar = comToque(el('a', {
      class: 'ui-pilula menu-portao-voltar',
      'data-acao': 'portao-voltar',
      'data-tom': 'noite',
      href: enderecoDaCena('menu', {}, som),
    }, [svg(ICONE_VOLTAR), el('span', null, rot.voltar)]));
    const caixa = el('div', { class: 'menu-portao ui-escuro' }, [toque, voltar]);

    // O furo é medido em repouso: a etiqueta balança em volta dele.
    const medirParado = () => {
      const r = furo.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const desenhar = () => {
      const d = caminhoDoFio([{ x: innerWidth / 2 + 6, y: -30 }, medirParado()]);
      for (const p of fio.querySelectorAll('path')) p.setAttribute('d', d);
    };

    comToque(toque);
    document.body.append(caixa);
    raizHtml.setAttribute('data-portao', '');
    desenhar();
    window.addEventListener('resize', desenhar);
    // Só a opacidade na entrada: o botão já pode receber o foco.
    gsap.fromTo(caixa, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'none' });
    if (!amb?.toque) toque.focus({ preventScroll: true });

    let foi = false;
    toque.addEventListener('click', () => {
      if (foi) return;
      foi = true;
      window.removeEventListener('resize', desenhar);
      try {
        const params = new URLSearchParams(location.search);
        params.delete('volta');
        const resto = params.toString();
        history.replaceState(history.state, '', `${location.pathname}${resto ? `?${resto}` : ''}${location.hash}`);
      } catch {
        /* sem histórico: recarregar pede o toque de novo, e só */
      }
      caixa.style.pointerEvents = 'none';
      // A etiqueta sobe pelo fio até sair por cima.
      if (!amb?.reduzido) {
        const sobe = pendura.getBoundingClientRect().bottom + 40;
        gsap.to([pendura, fio], { y: -sobe, duration: 0.6, ease: 'power2.in' });
      }
      gsap.to(caixa, {
        autoAlpha: 0,
        duration: 0.6,
        ease: 'none',
        onComplete: () => {
          caixa.remove();
          raizHtml.removeAttribute('data-portao');
          resolve();
        },
      });
    });
  });
}

/* ---- a cena ---------------------------------------------------------------------- */

export async function cenaMenu(ctx, { frio = false } = {}) {
  const { amb, mundo, musica, estado, diretor, recursos, som } = ctx;
  const gsap = ctx.gsap || window.gsap;
  const m = lerMenu(ctx);

  /* A. Entrada ------------------------------------------------------------------ */
  // Primeira vez neste aparelho: as referências passam. Vindo da carta final, o
  // contador e a folha já estão na tela e são reaproveitados.
  const passam = !menuLembrado();
  const doFim = !frio && !!estado.depois;
  const calmo = !!amb.reduzido;
  const baixo = amb.nivel === 'baixo';
  let depois = estado.depois;

  if (doFim) {
    Promise.resolve(depois.limparFim?.()).catch(() => {});
    if (passam) {
      musica?.esconderMini?.();
      const bolsa = document.getElementById('inventario');
      if (bolsa && !bolsa.hidden) await comoPromise(gsap.to(bolsa, { opacity: 0, duration: 0.3, ease: 'none' }));
      diretor.etapa('referencias'); // o diretor esconde a bolsa aqui
      if (bolsa) gsap.set(bolsa, { clearProps: 'opacity' });
    } else {
      diretor.etapa('menu');
    }
  } else {
    diretor.etapa(passam ? 'referencias' : 'menu');
    if (!passam) musica?.mostrarMini?.();
    try {
      mundo?.petalas?.definirDensidade?.(1);
    } catch {
      /* sem pétalas */
    }
    // Uma folha da carta final que tenha ficado (recarga, recuperação) sai aqui.
    const { folha, pararFolha } = estado;
    estado.folha = null;
    estado.pararFolha = null;
    try {
      pararFolha?.();
      folha?.dispose?.();
    } catch {
      /* ignora */
    }
    depois = criarDepois(ctx);
    depois.noAlto();
    estado.depois = depois;
  }

  /* B. Montagem ------------------------------------------------------------------ */
  const lista = el('ol', 'menu-partes');
  const nav = el('nav', null, lista);
  const ponta = el('div', 'menu-ponta');
  const fioTras = svg(`<svg class="menu-fio" aria-hidden="true" focusable="false">${TRACOS_DO_FIO}</svg>`);
  // O fio da frente só aparece nas janelas: do alto de cada papel até o furo.
  const fioFrente = svg(`<svg class="menu-fio menu-fio-frente" aria-hidden="true" focusable="false"><defs><clipPath id="menu-fio-janelas" clipPathUnits="userSpaceOnUse"></clipPath></defs><g clip-path="url(#menu-fio-janelas)">${TRACOS_DO_FIO}</g></svg>`);
  const janelas = fioFrente.querySelector('clipPath');
  const corda = el('div', 'menu-corda', [fioTras, nav, ponta, fioFrente]);
  const chao = el('ul', 'menu-chao');
  const pular = el('button', {
    type: 'button',
    class: 'ui-redondo menu-pular',
    'data-acao': 'menu-pular',
    'data-tom': 'noite',
    'aria-label': m.rot.pular,
    hidden: true,
  }, svg(ICONE_PULAR));
  const veu = el('div', { class: 'menu-veu', 'aria-hidden': 'true' });
  const secao = el('section', {
    class: 'menu ui-escuro',
    'aria-label': m.rot.nome,
    'data-etapa': passam ? 'referencias' : 'menu',
    'data-sem-contador': depois.temContador ? null : '',
  }, [el('div', { class: 'menu-sombra', 'aria-hidden': 'true' }), corda, chao, pular, veu]);

  /* C. Etiquetas ------------------------------------------------------------------- */
  async function reler(cena, alvo) {
    const inv = ctx.inventario;
    const id = `carta-${cena}`;
    if (!inv || inv.aberto || !inv.tem?.(id)) return;
    await inv.reabrir(id);
    if (alvo.isConnected) alvo.focus({ preventScroll: true });
  }

  const lis = m.etiquetas.map(({ cena, nome }, i) => {
    const filhos = [ilho(), el('span', 'menu-etiqueta-nome', nome)];
    let alvo;
    if (CAPITULOS.has(cena)) {
      // A carta já foi lida e está na bolsa: relê ali mesmo, com a música tocando.
      alvo = el('button', { type: 'button', class: 'menu-etiqueta', 'data-acao': 'menu-parte', 'data-cena': cena }, filhos);
      alvo.addEventListener('click', () => reler(cena, alvo));
    } else {
      // Link de verdade: o diretor recomeça a parte depois do portão.
      alvo = el('a', { class: 'menu-etiqueta', 'data-acao': 'menu-parte', 'data-cena': cena, href: enderecoDaCena(cena, { volta: 1 }, som) }, filhos);
      const atualizar = () => { alvo.href = enderecoDaCena(cena, { volta: 1 }, som); };
      alvo.addEventListener('pointerdown', atualizar);
      alvo.addEventListener('click', (e) => {
        atualizar(); // a faixa pode ter mudado desde a montagem
        // Com Ctrl, Shift, Alt, Meta ou outro botão, o navegador cuida (outra aba).
        if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
        e.preventDefault();
        secao.inert = true;
        gsap.to(veu, { autoAlpha: 1, duration: 0.4, ease: 'none', onComplete: () => location.assign(alvo.href) });
      });
    }
    return el('li', { 'data-lado': i % 2 === 0 ? 'esq' : 'dir' }, comToque(alvo));
  });
  lista.append(...lis);

  /* D. Ponta do fio ------------------------------------------------------------------ */
  const alvoPonta = m.saudade.href
    ? comToque(el('a', {
      class: 'ui-pilula menu-saudade',
      'data-tom': 'fio',
      'data-acao': 'menu-saudade',
      href: m.saudade.href,
      target: '_blank',
      rel: 'noopener noreferrer',
    }, [svg(CORACAO), el('span', null, m.saudade.rotulo)]))
    : el('span', { class: 'ui-laco menu-ponta-laco', 'aria-hidden': 'true' });
  const frase = m.saudade.frase ? el('p', 'menu-saudade-frase', m.saudade.frase) : null;
  ponta.append(alvoPonta);
  if (frase) ponta.append(frase);

  /* E. Chão --------------------------------------------------------------------------- */
  const gavetas = {};
  function abrirGaveta(qual, gatilho) {
    gavetas[qual] ||= qual === 'referencias'
      ? criarGaveta(ctx, { titulo: m.rot.referencias, fechar: m.rot.fechar, miolo: montarListaDeReferencias(m, recursos), secao })
      : criarGaveta(ctx, { titulo: m.rot.bilhetes, fechar: m.rot.fechar, miolo: montarListaDeBilhetes(m), secao });
    gavetas[qual].abrir(gatilho);
  }

  // "Escrever de volta" não troca de tela: o menu sai e volta quando a folha fecha.
  let escrevendo = false;
  async function escreverDeVolta(botao) {
    if (escrevendo || ctx.inventario?.aberto) return;
    escrevendo = true;
    secao.inert = true;
    gsap.killTweensOf(secao);
    gsap.to(secao, { autoAlpha: 0, duration: 0.4, ease: 'none' });
    try {
      await depois.reescrever();
    } catch (erro) {
      console.error('[carta] escrever de volta', erro);
    } finally {
      secao.inert = false;
      gsap.killTweensOf(secao);
      // Visível já (só a opacidade anima), para o foco poder voltar ao botão.
      gsap.set(secao, { visibility: 'inherit' });
      gsap.to(secao, { opacity: 1, duration: 0.6, ease: 'none' });
      escrevendo = false;
      if (botao.isConnected) botao.focus({ preventScroll: true });
    }
  }

  const objetos = [
    m.voz.tem && ctx.voz && { acao: 'menu-voz', desenho: FITA_PEQUENA, nome: m.voz.titulo, folha: true, tocar: () => ctx.voz.abrir() },
    m.temLista && m.rot.referencias && { acao: 'menu-referencias', desenho: CADERNO, nome: m.rot.referencias, folha: true, tocar: (b) => abrirGaveta('referencias', b) },
    depois.temResposta && m.escrever && { acao: 'menu-escrever', desenho: FOLHA_PENA, nome: m.escrever, tocar: escreverDeVolta },
    m.bilhetes.length && m.rot.bilhetes && { acao: 'menu-bilhetes', desenho: BILHETES, nome: m.rot.bilhetes, folha: true, tocar: (b) => abrirGaveta('bilhetes', b) },
  ].filter(Boolean);
  objetos.forEach((o, i) => {
    const botao = comToque(el('button', {
      type: 'button',
      class: 'menu-coisa',
      'data-acao': o.acao,
      'data-longo': o.nome.length > 14 ? '' : null,
      'aria-haspopup': o.folha ? 'dialog' : null,
    }, [
      el('span', { class: 'menu-coisa-desenho', 'aria-hidden': 'true' }, svg(o.desenho)),
      el('span', 'menu-coisa-nome', o.nome),
    ]));
    botao.style.setProperty('--pouso', `${POUSOS[i % POUSOS.length]}deg`);
    botao.addEventListener('click', () => o.tocar(botao));
    chao.append(el('li', null, botao));
  });
  chao.toggleAttribute('data-muitos', objetos.length > 3);

  /* Na tela, invisível ----------------------------------------------------------- */
  const palco = document.getElementById('palco');
  if (depois.raiz?.parentNode === palco) palco.insertBefore(secao, depois.raiz);
  else palco.append(secao);
  gsap.set([veu, corda, ...chao.children], { autoAlpha: 0 });
  if (frase) gsap.set(frase, { autoAlpha: 0 });

  // O toque que pulou as referências não cai numa etiqueta quando o menu assenta.
  let quieto = false;
  secao.addEventListener('click', (e) => {
    if (!quieto) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // Voltar pelo botão do Safari reabre a página guardada com o véu aceso.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    secao.inert = false;
    gsap.set(veu, { autoAlpha: 0 });
  });

  /* F. O fio ------------------------------------------------------------------------- */
  let creditos = null;
  let linhaReta = false;

  function desenharFio() {
    if (!corda.isConnected) return;
    const cx = corda.clientWidth / 2;
    const pontos = [];
    const rects = [];
    if (linhaReta) {
      // Movimento reduzido, durante as referências: uma linha parada, de cima a baixo.
      pontos.push({ x: cx, y: -corda.offsetTop - 20 }, { x: cx, y: secao.clientHeight - corda.offsetTop + 20 });
    } else {
      const furosCartoes = creditos ? [...creditos.querySelectorAll('.menu-ilho')].map((f) => centroEm(f, corda)) : [];
      const furosEtiquetas = [...lista.querySelectorAll('.menu-ilho')]
        .map((f) => ({ ...centroEm(f, corda), meia: f.parentElement.offsetHeight / 2 }));
      // A ponta: atrás do meio da pílula, ou no nó do laço.
      const c = centroEm(alvoPonta, corda);
      const fim = { x: cx, y: c.y - (m.saudade.href ? 0 : alvoPonta.offsetHeight * 0.08) };
      const primeiro = furosCartoes[0] || furosEtiquetas[0] || fim;
      // A subida solta, desde bem acima: o fio já está na tela quando o primeiro cartão entra.
      const alto = primeiro.y - (furosCartoes.length ? 3.2 : 1.4) * innerHeight;
      for (let y = alto, k = 0; y < primeiro.y - 150; y += 168, k++) pontos.push({ x: cx + (k % 2 ? 8 : -8), y });
      furosCartoes.forEach((f, i) => {
        const antes = furosCartoes[i - 1];
        if (antes && f.y - antes.y > 110) pontos.push({ x: cx + (i % 2 ? 5 : -5), y: f.y - 50 });
        pontos.push(f);
        rects.push([f.x - 26, f.y - 21, 52, 21]);
      });
      if (furosEtiquetas.length) pontos.push({ x: cx - 5, y: furosEtiquetas[0].y - 74 });
      for (const f of furosEtiquetas) {
        pontos.push(f);
        rects.push([f.x - 26, f.y - f.meia - 2, 52, f.meia + 2]);
      }
      pontos.push(fim);
    }
    // Só desce: um ponto que não fica abaixo do anterior entortaria a curva.
    const descendo = [];
    for (const p of pontos) {
      if (!descendo.length || p.y > descendo[descendo.length - 1].y + 1) descendo.push(p);
    }
    const d = caminhoDoFio(descendo);
    for (const p of corda.querySelectorAll('.menu-fio path')) p.setAttribute('d', d);
    janelas.replaceChildren(...rects.map(([x, y, w, h]) => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', x.toFixed(1));
      r.setAttribute('y', y.toFixed(1));
      r.setAttribute('width', String(w));
      r.setAttribute('height', h.toFixed(1));
      return r;
    }));
  }

  // Refaz o fio (e o contador do alto) quando a tela ou a corda mudam de tamanho.
  let quadroFio = 0;
  const refazer = () => {
    if (quadroFio) return;
    quadroFio = requestAnimationFrame(() => {
      quadroFio = 0;
      desenharFio();
      depois.reposicionar?.();
    });
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(refazer).observe(corda);
  window.addEventListener('resize', refazer);

  /* G. As referências ---------------------------------------------------------------- */
  // Pular: o botão aparece em 3,4 s; toque e teclado armam em 0,6 s.
  let desarmar = () => {};
  function armar(aoPular, aoAvancar) {
    const aoApertar = (e) => {
      if (!pular.contains(e.target)) aoAvancar();
    };
    const aoTeclar = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        aoPular();
      } else if ((e.key === 'Enter' || e.key === ' ') && e.target !== pular) {
        e.preventDefault();
        aoAvancar();
      }
    };
    const chamadas = [
      gsap.delayedCall(0.6, () => {
        window.addEventListener('pointerdown', aoApertar, true);
        window.addEventListener('keydown', aoTeclar, true);
      }),
      gsap.delayedCall(3.4, () => {
        pular.hidden = false;
        // Só a opacidade: o botão já pode receber o foco.
        gsap.fromTo(pular, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'none' });
        if (!amb.toque && !temFoco()) pular.focus({ preventScroll: true });
      }),
    ];
    pular.addEventListener('click', aoPular);
    desarmar = () => {
      desarmar = () => {};
      for (const c of chamadas) c.kill();
      window.removeEventListener('pointerdown', aoApertar, true);
      window.removeEventListener('keydown', aoTeclar, true);
      pular.removeEventListener('click', aoPular);
      // O foco sai do botão que vai sumir: o assentar o leva à primeira etiqueta.
      if (document.activeElement === pular) pular.blur();
      if (pular.hidden) pular.remove();
      else gsap.to(pular, { autoAlpha: 0, duration: 0.3, ease: 'none', onComplete: () => pular.remove() });
    };
  }

  // O puxão: a corda começa com o primeiro cartão logo abaixo da tela e sobe
  // até o lugar dela. quickSetter, e não gsap.set a cada quadro.
  function passarNormal(dianteira) {
    return new Promise((resolve) => {
      const S = secao.clientHeight - corda.offsetTop + creditos.offsetHeight + 30;
      let v = innerWidth >= 760 ? 104 : 90; // px/s
      const extra = (ARRANQUE + FREADA) / 2;
      if (S / v + extra > TETO) v = Math.min(140, S / (TETO - extra));
      const p = { s: 0 };
      const poe = gsap.quickSetter(corda, 'y', 'px');
      const aplicar = () => poe(S - p.s);
      aplicar();
      corda.setAttribute('data-viaja', '');
      // Puxadas, as etiquetas pendem para fora.
      gsap.set(lis, { rotation: (i, li) => (li.dataset.lado === 'esq' ? -2.6 : 2.6) });
      const entrada = gsap.to(corda, { startAt: { autoAlpha: 0 }, autoAlpha: 1, duration: 0.5, ease: 'none', delay: dianteira + 0.15 });

      const a = (v * ARRANQUE) / 2;
      const b = S - (v * FREADA) / 2;
      const tl = gsap.timeline({ delay: dianteira });
      if (b > a) {
        tl.to(p, { s: a, duration: ARRANQUE, ease: 'power1.in', onUpdate: aplicar })
          .to(p, { s: b, duration: (b - a) / v, ease: 'none', onUpdate: aplicar })
          .to(p, { s: S, duration: FREADA, ease: 'power1.out', onUpdate: aplicar });
      } else {
        tl.to(p, { s: S, duration: ARRANQUE + FREADA, ease: 'power1.inOut', onUpdate: aplicar });
      }

      let acabou = false;
      const terminar = () => {
        if (acabou) return;
        acabou = true;
        desarmar();
        resolve();
      };
      tl.eventCallback('onComplete', terminar);

      let acelerou = false;
      const acelerar = () => {
        if (acelerou || acabou) return;
        acelerou = true;
        tl.kill();
        entrada.kill();
        desarmar();
        gsap.to(corda, { autoAlpha: 1, duration: 0.3, ease: 'none' });
        gsap.to(p, { s: S, duration: 0.9, ease: 'power2.out', onUpdate: aplicar, onComplete: terminar });
      };
      armar(acelerar, acelerar);
    });
  }

  // Movimento reduzido: sem puxão. Um cartão de cada vez, no centro, pelo
  // tempo de ler (14 letras por segundo, nunca menos de 5 s).
  function passarCalmo() {
    return new Promise((resolve) => {
      const cartoes = [...creditos.children];
      let i = -1;
      let acabou = false;
      let proxima = null;
      gsap.set(cartoes, { autoAlpha: 0 });
      const encerrar = () => {
        if (acabou) return;
        acabou = true;
        proxima?.kill();
        desarmar();
        gsap.to([creditos, fioTras, fioFrente], { autoAlpha: 0, duration: 0.5, ease: 'none', onComplete: resolve });
      };
      const avancar = () => {
        if (acabou) return;
        proxima?.kill();
        if (cartoes[i]) gsap.to(cartoes[i], { autoAlpha: 0, duration: 0.5, ease: 'none' });
        i += 1;
        if (i >= cartoes.length) {
          encerrar();
          return;
        }
        gsap.to(cartoes[i], { autoAlpha: 1, duration: 0.5, ease: 'none' });
        proxima = gsap.delayedCall(Math.max(5, cartoes[i].textContent.length / 14), avancar);
      };
      avancar();
      armar(encerrar, avancar);
    });
  }

  /* H. Assentar ------------------------------------------------------------------------ */
  // O balanço de descanso é do CSS: o transform que o GSAP deixou no li sai antes.
  function viver() {
    if (calmo || baixo) return;
    gsap.set(lis, { clearProps: 'transform' });
    secao.setAttribute('data-vivo', '');
  }

  function assentar({ balanco }) {
    creditos?.remove();
    creditos = null;
    linhaReta = false;
    secao.removeAttribute('data-calmo');
    corda.removeAttribute('data-viaja');
    gsap.set(corda, { clearProps: 'transform' });
    nav.inert = false;
    ponta.inert = false;
    chao.inert = false;
    desenharFio();
    secao.dataset.etapa = 'menu';
    // Visível já (a opacidade anima), para a primeira etiqueta poder receber o foco.
    gsap.set(corda, { visibility: 'inherit' });
    gsap.to(corda, { opacity: 1, duration: 0.5, ease: 'none' });

    if (balanco) {
      quieto = true;
      gsap.delayedCall(0.7, () => { quieto = false; });
    }
    if (balanco && !calmo) {
      gsap.to(lis, { rotation: 0, duration: 1.7, ease: 'elastic.out(1, 0.42)', stagger: 0.03, onComplete: viver });
    } else {
      viver();
    }

    if (frase) gsap.to(frase, { autoAlpha: 1, duration: 0.7, ease: 'none' });
    const coisas = [...chao.children];
    if (calmo) {
      gsap.to(coisas, { autoAlpha: 1, duration: 0.5, stagger: 0.1, ease: 'none' });
    } else {
      gsap.fromTo(coisas, { autoAlpha: 0, y: 14, scale: 0.94 }, {
        autoAlpha: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.1, ease: 'back.out(1.7)', clearProps: 'transform',
      });
    }
    musica?.mostrarMini?.();
    ctx.voz?.liberar?.(); // a fita vai para a bolsa
    lembrarMenu(true);
    diretor.etapa('menu'); // a bolsa volta pela regra do diretor
    if (!amb.toque && !temFoco()) lista.querySelector('.menu-etiqueta')?.focus({ preventScroll: true });
  }

  /* K. A saída do fim -------------------------------------------------------------------- */
  function descartarFim() {
    const { folha, pararFolha } = estado;
    estado.folha = null;
    estado.pararFolha = null;
    estado.ele = null;
    try {
      pararFolha?.();
      folha?.dispose?.();
    } catch {
      /* ignora */
    }
    mundo?.alameda?.afastar?.(0);
    mundo?.petalas?.definirFoco?.(3);
  }

  // A folha sobe pelo alto e ele some; o varal desce atrás.
  async function sairDoFim() {
    mundo?.nitidezMaxima?.(false);
    const ele = estado.ele;
    const figura = document.querySelector('.ele-leve');
    // Sem a folha, a frase final ficou nas frases do palco: ela sai também.
    // Cada frase, e não o #frases: o recipiente do palco não pode ficar escondido.
    for (const p of document.getElementById('frases')?.children ?? []) ocultarPalavras(p);
    if (calmo) {
      await comoPromise(gsap.to(veu, { autoAlpha: 1, duration: 0.5, ease: 'none' }));
      ele?.dispose?.();
      figura?.remove();
      descartarFim();
      await comoPromise(gsap.to(veu, { autoAlpha: 0, duration: 0.5, ease: 'none' }));
      return;
    }
    Promise.resolve(ele?.sair?.(1.6)).catch(() => {});
    if (figura) gsap.to(figura, { opacity: 0, duration: 1.6, ease: 'none', onComplete: () => figura.remove() });
    const folha = estado.folha;
    // ≈2,7 s; o prazo só garante que nada fica preso.
    if (folha?.irEmbora) await Promise.race([Promise.resolve(folha.irEmbora()).catch(() => {}), espera(4500)]);
    descartarFim();
  }

  if (doFim) sairDoFim().catch((erro) => console.error('[carta] a saída do fim', erro));

  /* G/H. Referências e menu ---------------------------------------------------------------- */
  const cartoes = passam ? montarCreditos(m, recursos) : [];
  if (cartoes.length) {
    creditos = el('div', 'menu-creditos', cartoes);
    nav.inert = true;
    ponta.inert = true;
    chao.inert = true;
    if (calmo) {
      // Fora da corda (que nasce invisível): sem isto os cartões apareceriam
      // todos empilhados enquanto as fontes chegam.
      gsap.set(cartoes, { autoAlpha: 0 });
      secao.setAttribute('data-calmo', '');
      secao.insertBefore(creditos, pular);
    } else {
      corda.insertBefore(creditos, nav);
    }
    await fontesProntas();
    if (calmo) {
      linhaReta = true;
      gsap.set([nav, ponta], { autoAlpha: 0 });
      desenharFio();
      gsap.to(corda, { autoAlpha: 1, duration: 0.5, ease: 'none' });
      await passarCalmo();
      // Some tudo; o varal entra inteiro no assentar.
      gsap.set(corda, { autoAlpha: 0 });
      gsap.set([nav, ponta, fioTras, fioFrente], { autoAlpha: 1 });
    } else {
      desenharFio();
      await passarNormal(doFim ? DIANTEIRA : 0);
    }
    assentar({ balanco: true });
  } else if (doFim) {
    const sobe = calmo
      ? gsap.fromTo(corda, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, delay: 1.2, ease: 'none' })
      : gsap.fromTo(corda, { autoAlpha: 0, y: 34 }, { autoAlpha: 1, y: 0, duration: 0.9, delay: 1.2, ease: 'power2.out' });
    await comoPromise(sobe);
    assentar({ balanco: false });
  } else {
    await comoPromise(gsap.to(corda, { autoAlpha: 1, duration: 0.5, ease: 'none' }));
    assentar({ balanco: false });
  }

  // O menu é o fim: a cena nunca termina, e o diretor não segue depois dela.
  await new Promise(() => {});
}
