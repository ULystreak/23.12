// O menu do fim: o lugar para onde ela volta ("o varal do fio").
//
//   cenaMenu(ctx, { frio }) → Promise que nunca resolve
//   portao(ctx, cena) → Promise      depois de recarregar numa parte (?volta=1): pede o toque
//                                    que devolve o som, antes de a cena começar
//
// Etapas: referencias → menu   (referencias só enquanto o aparelho não tem a marca do menu:
//                               menuLembrado, js/nucleo/util.js)
//
// Só existe com o bloco `menu` no content.js (temMenu, js/nucleo/diretor.js). Tudo é DOM
// dentro de #palco, por cima da alameda à noite (com e sem WebGL é a mesma tela):
//
//   section.menu                       (antes da .depois: o véu e a folha de resposta cobrem o menu)
//     .menu-sombra                     o chão escurece um pouco, para os nomes se lerem
//     .menu-corda                      o fio com tudo o que está amarrado nele
//       svg.menu-fio                   o fio, de ilhó em ilhó, por trás do papel
//       .menu-creditos                 as referências (só na primeira chegada; saem depois)
//       nav > ol.menu-partes           uma etiqueta por parte da carta, em zigue-zague
//       .menu-ponta                    a ponta do fio: a pílula da saudade e a frase dele
//       svg.menu-fio-frente            o mesmo fio por cima do papel, da borda até o furo
//     ul.menu-chao                     os objetos do chão: a fita, o caderninho, a folha com a pena
//     button.menu-pular                pula as referências
//     .menu-veu                        a noite do próprio menu (sair para uma parte; movimento reduzido)
//   div.menu-gaveta (no <body>)        a folha das referências (e a dos bilhetes), como a da bolsa
//   div.menu-portao (no <body>)        o portão do som
//
// O contador pequeno do alto é o de sempre (criarDepois, js/cenas/resposta.js); o disco e a
// bolsa também. Na etapa "referencias" os três saem de cena e voltam quando o menu assenta.
//
// As etiquetas das cenas são links de verdade (?cena=…&musica=…&volta=1): a página
// recarrega naquela parte. As dos dois capítulos reabrem a carta ali mesmo, pela bolsa.
// Nada é enviado sozinho: a pílula da saudade é um link para o WhatsApp dela.
// A letra das músicas nunca aparece aqui: só o nome e o artista de cada faixa.
//
// Ganchos de teste: [data-acao="menu-parte"][data-cena], "menu-saudade", "menu-voz",
// "menu-referencias", "menu-escrever", "menu-bilhetes", "menu-fechar", "menu-pular",
// "portao", "portao-voltar"; .menu[data-etapa]; html[data-portao].

import { el, svg, menuLembrado, lembrarMenu, enderecoDaCena } from '../nucleo/util.js';
import { temCartas, temEncontro, cartasDoChao } from '../nucleo/diretor.js';
import { FITA_PEQUENA } from '../inventario.js';
import { criarDepois } from './resposta.js';

const NS = 'http://www.w3.org/2000/svg';
const TINTA = '#2a1b22';
const texto = (v) => (typeof v === 'string' ? v.trim() : '');

/** As partes, na ordem da viagem. Os dois capítulos reabrem ali mesmo; o resto recarrega. */
const PARTES = ['inicio', 'poppy', 'yourname', 'mao', 'cartas', 'encontro', 'final'];
const CAPITULOS = new Set(['poppy', 'yourname']);

// ---- ícones (grade 24, traço 1.75: .ui-icone) ------------------------------------------
const ICONES = {
  cometa: '<svg class="menu-marca ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16.6 11.6Q17.2 16 21.6 16.6 17.2 17.2 16.6 21.6 16 17.2 11.6 16.6 16 16 16.6 11.6z"/><path d="M12.4 12.4L3.6 3.6M9.6 15.2L5 10.6M15.2 9.6L10.6 5"/><circle class="cheio" cx="16.6" cy="16.6" r="1.2"/></svg>',
  fita: '<svg class="menu-marca ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.2" y="6.4" width="17.6" height="11.6" rx="2.2"/><circle cx="8.8" cy="12.2" r="2.1"/><circle cx="15.2" cy="12.2" r="2.1"/><path d="M8.8 14.3h6.4"/><circle class="cheio" cx="8.8" cy="12.2" r="0.9"/></svg>',
  disco: '<svg class="menu-marca ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="3"/><circle class="cheio" cx="12" cy="12" r="1.1"/></svg>',
};
const ICONE_PULAR = '<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 7.5l5 4.5-5 4.5M12.5 7.5l5 4.5-5 4.5"/></svg>';
const ICONE_FECHAR = '<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7L7 17"/></svg>';
const ICONE_VOLTAR = '<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.5 6.5L9 12l5.5 5.5"/></svg>';
const ICONE_ABRIR = '<svg class="ui-icone menu-bilhete-seta" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.5 9.8l4.5 4.6 4.5-4.6"/></svg>';
const CORACAO = '<svg class="menu-saudade-coracao" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 16.8C4.6 12.6 2.4 9.8 2.4 6.9a3.9 3.9 0 0 1 7.6-1.3 3.9 3.9 0 0 1 7.6 1.3c0 2.9-2.2 5.7-7.6 9.9z"/></svg>';

// ---- os desenhos do chão (o mesmo traço da fita da bolsa) -------------------------------
// O caderninho das referências: aberto, com a fita marcadora no fio.
const CADERNO = `
  <svg viewBox="0 0 92 60" aria-hidden="true" focusable="false">
    <path d="M46 11 C36 6.4 20 6 5 9 V50.5 C20 47.6 36 48 46 52.6 C56 48 72 47.6 87 50.5 V9 C72 6 56 6.4 46 11 Z" fill="#fffdf9" stroke="${TINTA}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M46 11 V52.6" fill="none" stroke="${TINTA}" stroke-width="1.3"/>
    <g fill="none" stroke="${TINTA}" stroke-opacity="0.34" stroke-width="1.3" stroke-linecap="round">
      <path d="M13 18 C21 16.6 31 16.8 39 19.2"/><path d="M13 26 C21 24.6 31 24.8 39 27.2"/><path d="M13 34 C19 33 26 33 32 34.4"/>
      <path d="M53 19.2 C61 16.8 71 16.6 79 18"/><path d="M53 27.2 C61 24.8 71 24.6 79 26"/><path d="M53 35.2 C59 33.6 66 33.4 72 34.2"/>
    </g>
    <path d="M46 51 C46.6 54.4 45.4 57 43.6 59.4 M46 51 C47 54.2 48.6 56.4 50.6 58.2" fill="none" stroke="#d7192d" stroke-width="1.9" stroke-linecap="round"/>
  </svg>`;
// A folha em que ela escreve de volta: uma folha com a ponta dobrada e a pena por cima.
const FOLHA_PENA = `
  <svg viewBox="0 0 92 60" aria-hidden="true" focusable="false">
    <path d="M17 3.5 H59 L69 13.5 V56.5 H17 Z" fill="#fffdf9" stroke="${TINTA}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M59 3.5 V13.5 H69" fill="#fbf7f0" stroke="${TINTA}" stroke-width="1.3" stroke-linejoin="round"/>
    <g fill="none" stroke="${TINTA}" stroke-opacity="0.34" stroke-width="1.3" stroke-linecap="round">
      <path d="M25 19 H52"/><path d="M25 27 H60"/><path d="M25 35 H47"/>
    </g>
    <path d="M25 46.5 C28.5 43.5 31.5 49.5 35 46.5 S41.5 43.5 45 46.8" fill="none" stroke="#d7192d" stroke-width="1.7" stroke-linecap="round"/>
    <g transform="translate(41 9.5) scale(1.95)">
      <path d="M4.6 19.4 C5 17.4 5.6 15.6 6.4 14 C9.6 10.6 12.8 7.4 16 4.4 C17.6 3.6 20.2 6.2 19.6 7.8 C16.4 11 13.2 14.2 10 17.4 C8.2 18.2 6.4 18.8 4.6 19.4 Z" fill="#fffdf9" stroke="${TINTA}" stroke-width="0.9" stroke-linejoin="round"/>
      <path d="M14.2 6.2 C15.4 7.4 16.6 8.6 17.8 9.8 M6.4 14 C7.8 14.8 9.2 16 10 17.4" fill="none" stroke="${TINTA}" stroke-width="0.7" stroke-linecap="round"/>
    </g>
  </svg>`;
// Os bilhetes "abra quando...": um montinho de bilhetes amarrado com o fio.
const BILHETES = `
  <svg viewBox="0 0 92 60" aria-hidden="true" focusable="false">
    <rect x="15" y="15" width="60" height="38" rx="3" transform="rotate(-7 45 34)" fill="#fbf7f0" stroke="${TINTA}" stroke-width="1.5"/>
    <g transform="rotate(4 47 31)">
      <rect x="17" y="11" width="60" height="38" rx="3" fill="#fffdf9" stroke="${TINTA}" stroke-width="1.8"/>
      <path d="M17.5 30 H76.5 M47 11.5 V48.5" fill="none" stroke="#d7192d" stroke-width="1.7" stroke-linecap="round"/>
      <path d="M47 30 C42.5 23.5 36 23 35.4 26.6 S41 31.8 47 30 Z M47 30 C51.5 23.5 58 23 58.6 26.6 S53 31.8 47 30 Z" fill="#fffdf9" stroke="#d7192d" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="47" cy="30" r="1.9" fill="#d7192d"/>
    </g>
  </svg>`;

/** 'AAAA-MM-DD' → 'AAAA-MM-DD' com zeros (ou '' se não for uma data). */
function normalizarData(v) {
  const r = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(typeof v === 'string' ? v : '');
  if (!r) return '';
  return `${r[1]}-${r[2].padStart(2, '0')}-${r[3].padStart(2, '0')}`;
}
function hojeDoAparelho(amb) {
  const pedido = normalizarData(amb?.params?.get?.('hoje') || '');
  if (pedido) return pedido;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** O que o content.js manda mostrar, já limpo (texto vazio = a coisa não existe). */
function lerMenu(ctx) {
  const { conteudo, amb } = ctx;
  const dados = conteudo.menu || {};
  const rot = dados.rotulos || {};
  const partes = dados.partes || {};
  const existe = { cartas: temCartas(conteudo), encontro: temEncontro(conteudo) };
  const etiquetas = PARTES
    .filter((cena) => texto(partes[cena]) && existe[cena] !== false)
    .map((cena) => ({ cena, nome: texto(partes[cena]) }));

  const referencias = (Array.isArray(dados.referencias) ? dados.referencias : [])
    .map((r) => ({ titulo: texto(r && r.titulo), de: texto(r && r.de), sobre: texto(r && r.sobre), dele: texto(r && r.dele), icone: texto(r && r.icone) }))
    .filter((r) => r.titulo && (r.sobre || r.dele || r.de));

  // As músicas: só o nome, o artista e a capa. O campo `letra` NUNCA é lido aqui.
  const faixas = ((conteudo.musica && Array.isArray(conteudo.musica.faixas)) ? conteudo.musica.faixas : [])
    .map((f) => ({ titulo: texto(f && f.titulo), artista: texto(f && f.artista), capa: texto(f && f.capa) }))
    .filter((f) => f.titulo);
  const musicas = { titulo: texto(dados.musicas && dados.musicas.titulo), dele: texto(dados.musicas && dados.musicas.dele), faixas };
  if (!faixas.length) musicas.titulo = '';

  const nomes = cartasDoChao(conteudo).filter((c) => c.tipo === 'video').map((c) => c.nome);
  const amigos = { titulo: nomes.length ? texto(dados.amigos) : '', nomes };

  const saudade = dados.saudade || {};
  const numero = String((conteudo.resposta && conteudo.resposta.whatsapp) || '').replace(/\D/g, '');
  const mensagem = texto(saudade.mensagem);
  const temSaudade = !!texto(saudade.rotulo) && (!!numero || !!mensagem);
  const endereco = temSaudade ? `https://wa.me/${numero}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''}` : '';

  const hoje = hojeDoAparelho(amb);
  const bilhetes = (Array.isArray(dados.bilhetes) ? dados.bilhetes : [])
    .map((b) => ({ titulo: texto(b && b.titulo), texto: texto(b && b.texto), abre: normalizarData(b && b.abre) }))
    .filter((b) => b.titulo && b.texto)
    .map((b) => ({ ...b, fechado: !!b.abre && hoje < b.abre }));

  const voz = conteudo.voz || {};
  const temVoz = (Array.isArray(voz.itens) ? voz.itens : []).some((i) => i && (texto(i.titulo) || texto(i.arquivo)));
  const resposta = conteudo.resposta || null;

  return {
    nome: texto(rot.nome) || 'Voltar a uma parte da carta',
    etiquetas,
    abertura: texto(dados.abertura),
    fecho: texto(dados.fecho),
    referencias, musicas, amigos,
    saudade: { existe: temSaudade, rotulo: texto(saudade.rotulo), frase: texto(saudade.frase), endereco },
    bilhetes,
    voz: temVoz ? (texto(voz.titulo) || 'A minha voz') : '',
    // o caderninho do chão só existe com alguma coisa para mostrar
    temLista: referencias.length > 0 || !!musicas.titulo || !!amigos.titulo,
    escrever: resposta && resposta.ativa !== false ? (texto(resposta.rotulos && resposta.rotulos.reabrir) || 'Escrever de volta') : '',
    rot: {
      referencias: texto(rot.referencias) || 'As referências',
      bilhetes: texto(rot.bilhetes) || 'Abra quando...',
      bilheteFechado: texto(rot.bilheteFechado) || 'Abre em {dia}',
      pular: texto(rot.pular) || 'Pular as referências',
      fechar: texto(rot.fechar) || 'Fechar',
      tocar: texto(rot.tocar) || 'Toque para começar',
      voltar: texto(rot.voltar) || 'Voltar ao menu',
    },
  };
}

const ilho = () => el('span', { class: 'menu-ilho', 'aria-hidden': 'true' });
const marcaDe = (icone) => (icone === 'laco'
  ? el('span', { class: 'menu-marca ui-laco', 'aria-hidden': 'true' })
  : (ICONES[icone] ? svg(ICONES[icone]) : null));
const costura = () => el('span', { class: 'ui-fio', 'aria-hidden': 'true' });

/** A lista das músicas: o disco pequeno com a capa, o nome e o artista. */
function listaDeMusicas(faixas, recursos) {
  return el('ul', 'menu-musicas', faixas.map((f) => {
    const disco = el('span', { class: 'menu-disco', 'aria-hidden': 'true' });
    // (pela pré-carga de sempre: capa que falta não vira imagem quebrada nem pedido repetido)
    if (f.capa && recursos) recursos.elementoImagem(f.capa, '').then((img) => { if (img) disco.prepend(img); }).catch(() => {});
    return el('li', null, [disco, el('span', null, [
      el('span', 'menu-musica-nome', f.titulo),
      f.artista ? el('span', 'menu-musica-artista', f.artista) : null,
    ])]);
  }));
}
const listaDeAmigos = (nomes) => el('p', 'menu-amigos', nomes.map((n) => el('span', null, n)));

/** As referências passando: os cartões amarrados no fio, na ordem. */
function montarCreditos(m, recursos) {
  const cartoes = [];
  const bilhete = (frase) => el('p', 'menu-cred menu-bilhete ui-folha', [ilho(), el('span', { texto: frase })]);
  if (m.abertura) cartoes.push(bilhete(m.abertura));
  for (const r of m.referencias) {
    cartoes.push(el('article', 'menu-cred ui-folha', [
      ilho(),
      marcaDe(r.icone),
      el('h2', 'ui-titulo', r.titulo),
      r.de ? el('p', 'menu-cred-de', r.de) : null,
      r.sobre ? el('p', 'menu-cred-sobre', r.sobre) : null,
      r.dele ? costura() : null,
      r.dele ? el('p', 'menu-cred-dele', r.dele) : null,
    ]));
  }
  if (m.musicas.titulo) {
    cartoes.push(el('article', 'menu-cred ui-folha', [
      ilho(),
      el('h2', 'ui-titulo', m.musicas.titulo),
      listaDeMusicas(m.musicas.faixas, recursos),
      m.musicas.dele ? costura() : null,
      m.musicas.dele ? el('p', 'menu-cred-dele', m.musicas.dele) : null,
    ]));
  }
  if (m.amigos.titulo) {
    cartoes.push(el('article', 'menu-cred ui-folha', [ilho(), el('h2', 'ui-titulo', m.amigos.titulo), listaDeAmigos(m.amigos.nomes)]));
  }
  if (m.fecho) cartoes.push(bilhete(m.fecho));
  cartoes.forEach((c, i) => c.style.setProperty('--giro', `${[-1.3, 1.5, -0.8, 1.1, -1.5, 0.9][i % 6]}deg`));
  return cartoes;
}

/** A mesma lista, em linhas, para a folha das referências (o caderninho do chão). */
function montarListaDeReferencias(m, recursos) {
  const linhas = m.referencias.map((r) => el('li', 'menu-ref', [
    marcaDe(r.icone) || el('span', { class: 'menu-marca', 'aria-hidden': 'true' }),
    el('h3', 'menu-ref-titulo', r.titulo),
    r.de ? el('p', 'menu-ref-de', r.de) : null,
    r.sobre ? el('p', 'menu-ref-sobre', r.sobre) : null,
    r.dele ? el('p', 'menu-ref-dele', r.dele) : null,
  ]));
  if (m.musicas.titulo) {
    linhas.push(el('li', 'menu-ref', [
      svg(ICONES.disco),
      el('h3', 'menu-ref-titulo', m.musicas.titulo),
      listaDeMusicas(m.musicas.faixas, recursos),
      m.musicas.dele ? el('p', 'menu-ref-dele', m.musicas.dele) : null,
    ]));
  }
  if (m.amigos.titulo) {
    linhas.push(el('li', 'menu-ref', [
      el('span', { class: 'menu-marca ui-coracao', 'aria-hidden': 'true' }),
      el('h3', 'menu-ref-titulo', m.amigos.titulo),
      listaDeAmigos(m.amigos.nomes),
    ]));
  }
  return el('ul', 'menu-refs', linhas);
}

/** Os bilhetes "abra quando...": os que já podem abrir desdobram ali; os outros mostram o dia. */
function montarListaDeBilhetes(m) {
  return el('ul', 'menu-bilhetes', m.bilhetes.map((b, i) => {
    if (b.fechado) {
      const [a, mes, d] = b.abre.split('-');
      return el('li', { class: 'menu-bilhete-item', dataset: { fechado: '' } }, [
        el('p', 'menu-bilhete-titulo', b.titulo),
        el('p', 'menu-bilhete-quando ui-nota', m.rot.bilheteFechado.replace('{dia}', `${d}/${mes}/${a}`)),
      ]);
    }
    const corpo = el('p', { class: 'menu-bilhete-texto', id: `menu-bilhete-${i}`, hidden: true, texto: b.texto });
    const botao = el('button', {
      class: 'menu-bilhete-abrir ui-toque', type: 'button', 'aria-expanded': 'false', 'aria-controls': corpo.id, dataset: { acao: 'menu-bilhete' },
    }, [el('span', 'menu-bilhete-titulo', b.titulo), svg(ICONE_ABRIR)]);
    const li = el('li', 'menu-bilhete-item', [botao, corpo]);
    botao.addEventListener('click', () => {
      const abrir = corpo.hidden;
      corpo.hidden = !abrir;
      li.toggleAttribute('data-aberto', abrir);
      botao.setAttribute('aria-expanded', String(abrir));
    });
    return li;
  }));
}

/** Curva suave por uma lista de pontos, sempre chegando e saindo na vertical (um fio pendurado). */
function caminhoDoFio(pontos) {
  let d = `M${pontos[0].x.toFixed(1)} ${pontos[0].y.toFixed(1)}`;
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    const k = (b.y - a.y) * 0.5;
    d += ` C${a.x.toFixed(1)} ${(a.y + k).toFixed(1)} ${b.x.toFixed(1)} ${(b.y - k).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  return d;
}
const TRACOS_DO_FIO = '<path class="menu-fio-sombra"/><path class="menu-fio-linha"/><path class="menu-fio-torcao"/>';

/** As fontes da interface já chegaram? (as medidas do fio dependem delas; nunca espera mais de 1,2 s) */
function fontesProntas() {
  const pronto = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  return Promise.race([pronto, new Promise((ok) => setTimeout(ok, 1200))]).catch(() => {});
}

export async function cenaMenu(ctx, { frio } = {}) {
  const { conteudo, diretor, mundo, musica, estado, amb, som, inventario } = ctx;
  const gsap = window.gsap;
  const m = lerMenu(ctx);
  const calmo = !!amb.reduzido;
  const baixo = amb.nivel === 'baixo';
  const passam = !menuLembrado();
  const palco = document.getElementById('palco');
  const doFim = !frio && !!estado.depois;
  const nadaFocado = () => !document.activeElement || document.activeElement === document.body;
  const tween = (alvo, vars) => new Promise((ok) => gsap.to(alvo, { ...vars, onComplete: ok, onInterrupt: ok }));

  // ---- a entrada -------------------------------------------------------------------------
  let depois = estado.depois;
  if (doFim) {
    // A pena e a pílula saem; o disco e a bolsa, se as referências vão passar, também.
    depois.limparFim();
    if (passam) {
      musica.esconderMini();
      const bolsa = document.getElementById('inventario');
      if (bolsa && !bolsa.hidden) await tween(bolsa, { opacity: 0, duration: 0.3, ease: 'none' });
      diretor.etapa('referencias');
      if (bolsa) gsap.set(bolsa, { clearProps: 'opacity' });
    } else {
      diretor.etapa('menu');
    }
  } else {
    diretor.etapa(passam ? 'referencias' : 'menu');
    if (!passam) musica.mostrarMini();
    try { mundo.petalas.definirDensidade(1); } catch { /* sem pétalas */ }
    // uma cena final que quebrou no meio pode ter deixado a folha para trás
    try { estado.pararFolha?.(); estado.folha?.dispose?.(); } catch (erro) { console.error(erro); }
    estado.folha = null;
    estado.pararFolha = null;
    depois = criarDepois(ctx);
    depois.noAlto();
    estado.depois = depois;
  }

  // ---- as peças ---------------------------------------------------------------------------
  const secao = el('section', { class: 'menu ui-escuro', 'aria-label': m.nome, dataset: { etapa: passam ? 'referencias' : 'menu' } });
  secao.toggleAttribute('data-sem-contador', !depois.temContador);
  const sombra = el('div', { class: 'menu-sombra', 'aria-hidden': 'true' });
  const veu = el('div', { class: 'menu-veu', 'aria-hidden': 'true' });
  const corda = el('div', 'menu-corda');
  const fioTras = svg(`<svg class="menu-fio" aria-hidden="true" focusable="false">${TRACOS_DO_FIO}</svg>`);
  const idJanelas = 'menu-fio-janelas';
  const fioFrente = svg(`<svg class="menu-fio menu-fio-frente" aria-hidden="true" focusable="false">
    <defs><clipPath id="${idJanelas}" clipPathUnits="userSpaceOnUse"></clipPath></defs>
    <g clip-path="url(#${idJanelas})">${TRACOS_DO_FIO}</g></svg>`);
  const janelas = fioFrente.querySelector('clipPath');

  // as etiquetas: uma por parte, alternando os lados, com o ilhó sempre do lado do fio
  let saindo = false;
  const etiquetas = m.etiquetas.map(({ cena, nome }, i) => {
    let no;
    if (CAPITULOS.has(cena)) {
      no = el('button', { class: 'menu-etiqueta', type: 'button', dataset: { acao: 'menu-parte', cena } }, [ilho(), el('span', { texto: nome })]);
      no.addEventListener('click', async () => {
        const id = `carta-${cena}`;
        if (saindo || inventario.aberto || !inventario.tem(id)) return;
        await inventario.reabrir(id);                      // a releitura que a bolsa já usa (a música não para)
        no?.focus({ preventScroll: true });
      });
    } else {
      no = el('a', { class: 'menu-etiqueta', href: enderecoDaCena(cena, { volta: 1 }, som), dataset: { acao: 'menu-parte', cena } }, [ilho(), el('span', { texto: nome })]);
      no.addEventListener('click', (e) => {
        no.href = enderecoDaCena(cena, { volta: 1 }, som);   // a faixa de agora
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;   // outra aba: o navegador cuida
        e.preventDefault();
        if (saindo || inventario.aberto) return;
        saindo = true;
        secao.inert = true;
        // o menu dissolve na noite e a página recarrega naquela parte
        gsap.to(veu, { autoAlpha: 1, duration: 0.4, ease: 'none', onComplete: () => location.assign(no.href) });
      });
    }
    no.addEventListener('touchstart', () => {}, { passive: true });   // (no iPhone, :active só vale com um ouvinte de toque)
    const li = el('li', { dataset: { lado: i % 2 ? 'dir' : 'esq' } }, no);
    li.style.setProperty('--n', String(i));
    return { cena, no, li, lado: i % 2 ? 1 : -1 };
  });
  // voltou pelo botão de voltar do navegador (a página vem guardada): o véu sai da frente
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted || !saindo) return;
    saindo = false;
    secao.inert = false;
    gsap.set(veu, { autoAlpha: 0 });
  });
  const partes = el('ol', 'menu-partes', etiquetas.map((e) => e.li));
  const nav = el('nav', { 'aria-label': m.nome }, partes);

  // a ponta do fio: sempre que sentir saudade (um link de verdade para o WhatsApp dela)
  let saudade = null;
  let frase = null;
  let lacoPonta = null;
  if (m.saudade.existe) {
    saudade = el('a', {
      class: 'ui-pilula menu-saudade', href: m.saudade.endereco, target: '_blank', rel: 'noopener noreferrer',
      dataset: { tom: 'fio', acao: 'menu-saudade' },
    }, [svg(CORACAO), el('span', { texto: m.saudade.rotulo })]);
    saudade.addEventListener('touchstart', () => {}, { passive: true });
    if (m.saudade.frase) frase = el('p', 'menu-saudade-frase', m.saudade.frase);
  } else {
    lacoPonta = el('span', { class: 'ui-laco menu-ponta-laco', 'aria-hidden': 'true' });
  }
  const ponta = el('div', 'menu-ponta', [saudade, frase, lacoPonta]);

  // ---- o chão: montado a partir de uma lista (um objeto novo é só mais uma linha aqui) ----
  const gavetaRefs = m.temLista && criarGaveta(ctx, { titulo: m.rot.referencias, fechar: m.rot.fechar, miolo: () => montarListaDeReferencias(m, ctx.recursos), secao });
  const gavetaBilhetes = m.bilhetes.length
    ? criarGaveta(ctx, { titulo: m.rot.bilhetes, fechar: m.rot.fechar, miolo: () => montarListaDeBilhetes(m), secao })
    : null;
  let escrevendo = false;
  const objetos = [
    m.voz && ctx.voz ? { acao: 'menu-voz', rotulo: m.voz, desenho: FITA_PEQUENA, aoTocar: () => ctx.voz.abrir() } : null,
    gavetaRefs ? { acao: 'menu-referencias', rotulo: m.rot.referencias, desenho: CADERNO, aoTocar: (botao) => gavetaRefs.abrir(botao) } : null,
    m.escrever ? {
      acao: 'menu-escrever', rotulo: m.escrever, desenho: FOLHA_PENA,
      aoTocar: async (botao) => {
        if (escrevendo) return;
        escrevendo = true;
        // o menu sai da frente enquanto ela escreve (a noite da folha de resposta cobre o resto)
        secao.inert = true;
        gsap.to(secao, { autoAlpha: 0, duration: 0.4, ease: 'none', overwrite: true });
        try { await depois.reescrever(); } catch (erro) { console.error(erro); }
        secao.inert = false;
        gsap.set(secao, { visibility: 'inherit' });        // (já visível, para o foco poder voltar ao objeto)
        gsap.to(secao, { autoAlpha: 1, duration: 0.6, ease: 'none', overwrite: true });
        escrevendo = false;
        botao?.focus({ preventScroll: true });
      },
    } : null,
    gavetaBilhetes ? { acao: 'menu-bilhetes', rotulo: m.rot.bilhetes, desenho: BILHETES, aoTocar: (botao) => gavetaBilhetes.abrir(botao) } : null,
  ].filter(Boolean);
  const coisas = objetos.map((o, i) => {
    const botao = el('button', { class: 'menu-coisa', type: 'button', dataset: { acao: o.acao } }, [
      el('span', { class: 'menu-coisa-desenho', 'aria-hidden': 'true' }, svg(o.desenho)),
      el('span', { class: 'menu-coisa-nome', texto: o.rotulo }),
    ]);
    if (o.rotulo.length > 14) botao.dataset.longo = '';
    botao.style.setProperty('--pouso', `${[-4, 3, -2, 3.5][i % 4]}deg`);
    botao.addEventListener('touchstart', () => {}, { passive: true });
    botao.addEventListener('click', () => { if (!saindo && !inventario.aberto) o.aoTocar(botao); });
    return el('li', null, botao);
  });
  const chao = el('ul', { class: 'menu-chao' }, coisas);
  if (objetos.length > 3) chao.dataset.muitos = '';

  // O menu acabou de parar debaixo do dedo dela (ela pulou as referências com um toque): por
  // um instante o toque seguinte não vale, para não cair numa etiqueta e recarregar a página.
  let quieto = false;
  secao.addEventListener('click', (e) => { if (quieto) { e.preventDefault(); e.stopPropagation(); } }, true);

  const pular = el('button', {
    class: 'menu-pular ui-redondo', type: 'button', 'aria-label': m.rot.pular, hidden: true, dataset: { tom: 'noite', acao: 'menu-pular' },
  }, svg(ICONE_PULAR));

  corda.append(fioTras, nav, ponta, fioFrente);
  secao.append(sombra, corda, chao, pular, veu);
  gsap.set(veu, { autoAlpha: 0 });
  // tudo nasce invisível: cada entrada (as referências, o menu direto) mostra o que é dela
  gsap.set([corda, ...chao.children], { autoAlpha: 0 });
  if (frase) gsap.set(frase, { autoAlpha: 0 });
  // antes da .depois: o véu da noite e a folha de resposta cobrem o menu
  if (depois.raiz && depois.raiz.parentNode === palco) palco.insertBefore(secao, depois.raiz);
  else palco.append(secao);

  // ---- o fio: de ilhó em ilhó, até a ponta ------------------------------------------------
  let creditos = null;                  // .menu-creditos, enquanto as referências passam
  function desenharFio() {
    if (!secao.isConnected) return;
    const r0 = corda.getBoundingClientRect();
    if (!r0.width) return;
    // (medidas de antes dos giros: offset*, para o balanço das etiquetas não entrar na conta)
    const centroDe = (no) => {
      let x = no.offsetWidth / 2;
      let y = no.offsetHeight / 2;
      for (let p = no; p && p !== corda; p = p.offsetParent) { x += p.offsetLeft; y += p.offsetTop; }
      return { x, y };
    };
    const furosCred = creditos && creditos.parentNode === corda ? [...creditos.querySelectorAll('.menu-ilho')].map(centroDe) : [];
    const furosPartes = etiquetas.map((e) => centroDe(e.li.querySelector('.menu-ilho')));
    const alvoPonta = saudade || lacoPonta;
    const fimDoFio = centroDe(alvoPonta);
    fimDoFio.y = fimDoFio.y - alvoPonta.offsetHeight / 2 + (saudade ? 8 : 9);
    const cx = r0.width / 2;
    const H = window.innerHeight;
    const primeiro = furosCred[0] || furosPartes[0] || fimDoFio;
    const lista = [];
    // acima da primeira coisa o fio sobe solto até sair da tela (ondula de leve)
    let lado = 1;
    for (let y = primeiro.y - (furosCred.length ? 3.2 : 1.4) * H; y < primeiro.y - 150; y += 168) { lista.push({ x: cx + lado * 8, y }); lado = -lado; }
    furosCred.forEach((p, i) => {
      const a = furosCred[i - 1];
      // entre dois cartões o fio aparece só no vão: uma barriguinha ali
      if (a && p.y - a.y > 110) { lado = -lado; lista.push({ x: cx + lado * 5, y: p.y - 50 }); }
      lista.push(p);
    });
    // logo acima da primeira etiqueta, sempre a mesma barriguinha: com ou sem os cartões em
    // cima, o trecho que desce até ela é o mesmo (nada pula quando as referências saem)
    if (furosPartes[0]) lista.push({ x: cx - 5, y: furosPartes[0].y - 74 });
    lista.push(...furosPartes, fimDoFio);
    const d = caminhoDoFio(lista);
    for (const traco of secao.querySelectorAll('.menu-fio path')) traco.setAttribute('d', d);
    // as janelas do fio da frente: da borda de cima de cada papel até o furo
    janelas.textContent = '';
    const meiaEtiqueta = etiquetas[0] ? etiquetas[0].no.offsetHeight / 2 : 0;
    const janela = (p, alto) => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', (p.x - 26).toFixed(1)); r.setAttribute('width', '52');
      r.setAttribute('y', (p.y - alto).toFixed(1)); r.setAttribute('height', alto.toFixed(1));
      janelas.append(r);
    };
    furosCred.forEach((p) => janela(p, 21));
    furosPartes.forEach((p) => janela(p, meiaEtiqueta + 2));
  }
  let redesenho = 0;
  const aoRedimensionar = () => {
    cancelAnimationFrame(redesenho);
    redesenho = requestAnimationFrame(() => { desenharFio(); depois.reposicionar?.(); });
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(aoRedimensionar).observe(corda);
  window.addEventListener('resize', aoRedimensionar, { passive: true });

  // ---- a folha e ele vão embora (só vindo do fim) -----------------------------------------
  const descartarFim = () => {
    const folha = estado.folha;
    const parar = estado.pararFolha;
    estado.folha = null;
    estado.pararFolha = null;
    try { parar?.(); folha?.dispose?.(); } catch (erro) { console.error(erro); }
    try { mundo.alameda?.afastar?.(0); mundo.petalas.definirFoco?.(3); } catch { /* sem alameda */ }
  };
  async function sairDoFim() {
    try { mundo.nitidezMaxima?.(false); } catch { /* sem 3D */ }
    const folha = estado.folha;
    const ele = estado.ele;
    estado.ele = null;
    const eleLeve = document.querySelector('.ele-leve');
    if (calmo) {
      // nada sobe: a noite do menu cobre, a folha e ele saem por baixo, e a noite abre
      await tween(veu, { autoAlpha: 1, duration: 0.5, ease: 'none' });
      try { ele?.dispose?.(); } catch (erro) { console.error(erro); }
      if (eleLeve) eleLeve.remove();
      descartarFim();
      gsap.to(veu, { autoAlpha: 0, duration: 0.5, ease: 'none' });
      return;
    }
    try { ele?.sair?.(1.6); } catch (erro) { console.error(erro); }
    if (eleLeve) gsap.to(eleLeve, { opacity: 0, duration: 1.6, ease: 'none', onComplete: () => eleLeve.remove() });
    // (a folha 3D e a corda só começam juntas: não há sincronia entre as duas)
    Promise.resolve(folha && folha.irEmbora ? folha.irEmbora() : null)
      .catch((erro) => console.error(erro))
      .then(descartarFim);
  }

  // ---- as referências passando ---------------------------------------------------------------
  let pularAgora = null;                // pula tudo (o botão, Esc)
  let avancar = null;                   // um toque: pula (ou, no movimento reduzido, passa um cartão)
  const aoTocar = (e) => {
    if (e.target && e.target.closest && e.target.closest('[data-acao="menu-pular"]')) return;   // o botão cuida
    avancar?.();
  };
  const aoTeclar = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); pularAgora?.(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); avancar?.(); }
  };
  pular.addEventListener('click', () => pularAgora?.());

  async function passarReferencias() {
    const cartoes = montarCreditos(m, ctx.recursos);
    creditos = el('div', 'menu-creditos', cartoes);
    for (const no of [nav, ponta, chao]) no.inert = true;
    (calmo ? secao : corda).insertBefore(creditos, calmo ? corda : nav);
    secao.toggleAttribute('data-calmo', calmo);
    await fontesProntas();

    // o botão de pular chega aos 3,4 s; antes disso um toque ainda pode ser o do "Continuar"
    const mostrarPular = gsap.delayedCall(3.4, () => {
      pular.hidden = false;
      gsap.fromTo(pular, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'none' });
      if (!amb.toque && nadaFocado()) pular?.focus({ preventScroll: true });
    });
    const armar = gsap.delayedCall(0.6, () => {
      document.addEventListener('pointerdown', aoTocar, true);
      document.addEventListener('keydown', aoTeclar, true);
    });
    const desarmar = () => {
      mostrarPular.kill();
      armar.kill();
      document.removeEventListener('pointerdown', aoTocar, true);
      document.removeEventListener('keydown', aoTeclar, true);
      pularAgora = null;
      avancar = null;
      const tinhaFoco = document.activeElement === pular;
      gsap.to(pular, { autoAlpha: 0, duration: 0.3, ease: 'none', overwrite: true, onComplete: () => pular.remove() });
      if (tinhaFoco) { try { pular.blur(); } catch { /* nada */ } }
    };

    if (calmo) {
      // Movimento reduzido: nada desliza. O fio fica parado no meio e os cartões dissolvem,
      // um por vez, no centro. A lista inteira está no DOM (o leitor de tela lê na ordem).
      const fioParado = svg(`<svg class="menu-fio menu-fio-parado" aria-hidden="true" focusable="false">${TRACOS_DO_FIO}</svg>`);
      secao.insertBefore(fioParado, creditos);
      const medirParado = () => {
        const d = `M${(secao.clientWidth / 2).toFixed(1)} -20 V${(secao.clientHeight + 20).toFixed(1)}`;
        for (const traco of fioParado.querySelectorAll('path')) traco.setAttribute('d', d);
      };
      medirParado();
      window.addEventListener('resize', medirParado, { passive: true });
      gsap.set(cartoes, { opacity: 0 });
      let fim = false;
      pularAgora = () => { fim = true; avancar?.(); };
      for (let i = 0; i < cartoes.length && !fim; i++) {
        gsap.to(cartoes, { opacity: (k) => (k === i ? 1 : 0), duration: 0.5, ease: 'none', overwrite: true });
        const segundos = Math.max(5, (cartoes[i].textContent || '').length / 14);
        await new Promise((ok) => {
          const espera = gsap.delayedCall(segundos, ok);
          avancar = () => { espera.kill(); ok(); };
        });
      }
      desarmar();
      window.removeEventListener('resize', medirParado);
      await tween([...cartoes, fioParado], { opacity: 0, duration: 0.5, ease: 'none', overwrite: true });
      fioParado.remove();
      return;
    }

    // Uma coluna só, subindo no passo de crédito de filme: arranca em 1,6 s, freia em 1,7 s.
    desenharFio();
    const S = secao.clientHeight - corda.offsetTop + creditos.offsetHeight + 30;   // do primeiro bilhete logo abaixo da tela até o lugar
    let v = window.innerWidth >= 760 ? 104 : 90;                                  // px/s
    const ARRANQUE = 1.6;
    const FREADA = 1.7;
    const meio = (ARRANQUE + FREADA) / 2;
    if (S / v + meio > 45) v = Math.min(140, S / (45 - meio));                    // nunca mais de 45 s
    const p = { s: 0 };
    const porY = gsap.quickSetter(corda, 'y', 'px');                             // sem um Tween novo por quadro
    const aplicar = () => porY(S - p.s);
    aplicar();
    corda.dataset.viaja = '';
    // as etiquetas vêm com a ponta livre um pouco para trás, como quem é puxado
    for (const e of etiquetas) gsap.set(e.li, { rotation: e.lado * 2.6 });
    // Vindo do fim, a folha da frase sai primeiro: o fio do menu só desce quando ela já vai
    // alto (senão ele cruzaria por cima da letra dela).
    const dianteira = doFim ? 1.15 : 0;
    gsap.to(corda, { autoAlpha: 1, duration: 0.5, delay: dianteira + 0.15, ease: 'none' });
    await new Promise((ok) => {
      const cruzeiro = Math.max(0, S - v * meio);
      const tl = gsap.timeline({ onComplete: ok, delay: dianteira });
      tl.to(p, { s: (v * ARRANQUE) / 2, duration: ARRANQUE, ease: 'power1.in', onUpdate: aplicar })
        .to(p, { s: (v * ARRANQUE) / 2 + cruzeiro, duration: Math.max(0.01, cruzeiro / v), ease: 'none', onUpdate: aplicar })
        .to(p, { s: S, duration: FREADA, ease: 'power1.out', onUpdate: aplicar });
      // pular: a corda acelera até o fim, sem corte
      pularAgora = () => {
        if (tl.progress() >= 1) return;
        tl.kill();
        gsap.to(corda, { autoAlpha: 1, duration: 0.3, ease: 'none', overwrite: true });
        pularAgora = null;
        avancar = null;
        gsap.to(p, { s: S, duration: 0.9, ease: 'power2.out', onUpdate: aplicar, onComplete: ok });
      };
      avancar = () => pularAgora?.();
    });
    desarmar();
  }

  // ---- o menu assenta -------------------------------------------------------------------------
  function viver() {
    if (calmo || baixo) return;
    for (const e of etiquetas) gsap.set(e.li, { clearProps: 'transform' });
    secao.dataset.vivo = '';              // o balanço miúdo de descanso (css/menu.css)
  }
  function assentar({ balanco }) {
    if (creditos) { creditos.remove(); creditos = null; }
    secao.removeAttribute('data-calmo');
    delete corda.dataset.viaja;
    gsap.set(corda, { clearProps: 'transform' });
    for (const no of [nav, ponta, chao]) no.inert = false;
    desenharFio();
    secao.dataset.etapa = 'menu';
    if (balanco) { quieto = true; gsap.delayedCall(0.7, () => { quieto = false; }); }
    if (balanco && !calmo) {
      // param de ser puxadas: balançam uma vez, amortecidas, e ficam
      etiquetas.forEach((e, i) => gsap.fromTo(e.li, { rotation: e.lado * 2.6 }, {
        rotation: 0, duration: 1.7, delay: i * 0.03, ease: 'elastic.out(1, 0.42)', overwrite: true,
        onComplete: i === etiquetas.length - 1 ? viver : undefined,
      }));
      if (!etiquetas.length) viver();
    } else {
      viver();
    }
    // a frase dele e os objetos do chão entram em fila
    if (frase) gsap.to(frase, { autoAlpha: 1, duration: 0.7, ease: 'none' });
    if (calmo) gsap.to(chao.children, { autoAlpha: 1, duration: 0.5, ease: 'none', overwrite: true });
    else {
      gsap.fromTo(chao.children, { autoAlpha: 0, y: 14, scale: 0.94 }, {
        autoAlpha: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.1, ease: 'back.out(1.7)', overwrite: true, clearProps: 'transform',
      });
    }
    // o disco, a bolsa e o contador voltam; a fita com a voz dele já mora na bolsa
    musica.mostrarMini();
    try { ctx.voz?.liberar?.(); } catch (erro) { console.error(erro); }
    lembrarMenu(true);
    diretor.etapa('menu');
    if (!amb.toque && nadaFocado() && etiquetas[0]) {
      etiquetas[0]?.no.focus({ preventScroll: true });
    }
  }

  if (passam) {
    if (doFim) { if (calmo) await sairDoFim(); else sairDoFim(); }
    await passarReferencias();
    if (calmo) gsap.fromTo(corda, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: 'none' });
    assentar({ balanco: true });
  } else {
    await fontesProntas();
    desenharFio();
    if (doFim) {
      // as etiquetas entram enquanto a folha sobe (ela sai na frente: as etiquetas não
      // chegam por cima da letra dela)
      if (calmo) await sairDoFim(); else sairDoFim();
      await tween(corda, calmo
        ? { autoAlpha: 1, duration: 0.5, ease: 'none' }
        : { autoAlpha: 1, duration: 0.9, delay: 1.2, ease: 'power2.out', startAt: { y: 34 }, y: 0 });
    } else {
      await tween(corda, { autoAlpha: 1, duration: 0.5, ease: 'none' });
    }
    assentar({ balanco: false });
  }

  await new Promise(() => {});                           // fica aqui: é para cá que ela volta
}

/**
 * Uma folha que sobe de baixo, no molde da bolsa (as referências, os bilhetes): puxador,
 * título, fechar, costura e o miolo que rola. Mora no <body>, por cima do disco e da bolsa.
 */
function criarGaveta(ctx, { titulo, fechar: nomeFechar, miolo, secao }) {
  const { amb, som } = ctx;
  let raiz = null;
  let folha = null;
  let aberta = false;
  let gatilho = null;
  let saida = 0;
  let abertaEm = 0;

  function montar() {
    if (raiz) return;
    const fundo = el('div', 'menu-gaveta-fundo');
    const botaoFechar = el('button', { class: 'ui-redondo menu-folha-fechar', type: 'button', 'aria-label': nomeFechar, dataset: { acao: 'menu-fechar' } }, svg(ICONE_FECHAR));
    folha = el('div', { class: 'ui-folha menu-folha', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo, dataset: { borda: 'base' } }, [
      el('span', { class: 'ui-puxador', 'aria-hidden': 'true' }),
      el('div', 'menu-folha-topo', [el('p', 'ui-titulo', titulo), botaoFechar]),
      el('span', { class: 'ui-fio menu-folha-costura', 'aria-hidden': 'true' }),
      el('div', { class: 'ui-rola menu-folha-miolo', tabindex: '0' }, miolo()),
    ]);
    raiz = el('div', { class: 'menu-gaveta', hidden: true }, [fundo, folha]);
    document.body.append(raiz);
    botaoFechar.addEventListener('click', fechar);
    // (o segundo toque de um toque duplo no objeto cai no fundo, com a folha ainda subindo: não fecha)
    fundo.addEventListener('click', () => { if (performance.now() - abertaEm > 450) fechar(); });
    // um toque na folha aberta nunca chega ao mundo
    for (const tipo of ['pointerdown', 'pointerup']) raiz.addEventListener(tipo, (e) => e.stopPropagation());
  }

  function aoTeclar(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); return; }
    if (e.key !== 'Tab') return;
    // o Tab não sai da folha enquanto ela está aberta
    const focaveis = [...folha.querySelectorAll('button, a[href], [tabindex="0"]')].filter((no) => !no.disabled && no.offsetParent !== null);
    if (!focaveis.length) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (!folha.contains(document.activeElement)) { e.preventDefault(); primeiro.focus(); }
    else if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  }

  function abrir(quem) {
    if (aberta) return;
    montar();
    aberta = true;
    abertaEm = performance.now();
    gatilho = quem || document.activeElement;
    clearTimeout(saida);
    secao.inert = true;
    raiz.hidden = false;
    void raiz.offsetWidth;                                 // a entrada parte do estado fechado
    raiz.setAttribute('data-aberto', '');
    document.addEventListener('keydown', aoTeclar, true);
    try { som?.efeito?.('papel'); } catch { /* sem som */ }
    folha.querySelector('.menu-folha-fechar')?.focus({ preventScroll: true });
  }

  function fechar() {
    if (!aberta) return;
    aberta = false;
    document.removeEventListener('keydown', aoTeclar, true);
    raiz.removeAttribute('data-aberto');
    secao.inert = false;
    const sumir = () => { if (!aberta) raiz.hidden = true; };
    clearTimeout(saida);
    if (amb?.reduzido) sumir(); else saida = setTimeout(sumir, 200);
    const voltar = gatilho && gatilho.isConnected ? gatilho : null;
    gatilho = null;
    voltar?.focus({ preventScroll: true });
  }

  return { abrir, fechar, get aberta() { return aberta; } };
}

/**
 * O portão do som. Ela voltou a uma parte por uma etiqueta do menu: a página recarregou e o
 * Safari só deixa o som voltar com um toque. Antes de a cena começar, a etiqueta daquela
 * parte aparece grande, pendurada no fio; o toque nela é o gesto (o destravar do main.js
 * devolve a faixa de ?musica= nesse mesmo toque). Parte sem nome em menu.partes: sem portão.
 */
export function portao(ctx, cena) {
  const { amb, som } = ctx;
  const gsap = window.gsap;
  const dados = ctx.conteudo.menu || {};
  const rot = dados.rotulos || {};
  const nome = texto(dados.partes && dados.partes[cena]);
  if (!nome) return Promise.resolve();
  const tocar = texto(rot.tocar) || 'Toque para começar';
  const voltar = texto(rot.voltar) || 'Voltar ao menu';
  const raiz = document.documentElement;

  const etiqueta = el('span', 'menu-etiqueta menu-portao-etiqueta', [ilho(), el('span', { texto: nome })]);
  const pendura = el('span', 'menu-portao-pendura', etiqueta);
  const botao = el('button', { class: 'menu-portao-toque', type: 'button', 'aria-label': `${nome}. ${tocar}`, dataset: { acao: 'portao' } }, [
    el('span', { class: 'menu-portao-veu', 'aria-hidden': 'true' }),
    el('span', { class: 'menu-portao-meio', 'aria-hidden': 'true' }, [
      pendura,
      el('span', 'menu-portao-dica', [el('span', { texto: tocar }), el('span', { class: 'ui-petala menu-portao-petala' })]),
    ]),
  ]);
  const fio = svg(`<svg class="menu-fio menu-portao-fio" aria-hidden="true" focusable="false">${TRACOS_DO_FIO}</svg>`);
  const elo = el('a', { class: 'ui-pilula menu-portao-voltar', href: enderecoDaCena('menu', {}, som), dataset: { tom: 'noite', acao: 'portao-voltar' } },
    [svg(ICONE_VOLTAR), el('span', { texto: voltar })]);
  const caixa = el('div', { class: 'menu-portao ui-escuro' }, [botao, fio, elo]);

  // o fio vem do alto, do meio da tela (de onde o fio do menu desce), até o furo da etiqueta
  const desenhar = () => {
    const furo = etiqueta.querySelector('.menu-ilho');
    let x = furo.offsetWidth / 2;
    let y = furo.offsetHeight / 2;
    for (let p = furo; p && p !== caixa; p = p.offsetParent) { x += p.offsetLeft; y += p.offsetTop; }
    const x0 = window.innerWidth / 2 + 6;
    const d = `M${x0} -30 C${x0 - 10} ${(y * 0.34).toFixed(1)} ${(x + 26).toFixed(1)} ${(y * 0.5).toFixed(1)} ${(x + 8).toFixed(1)} ${(y * 0.76).toFixed(1)}`
      + ` C${(x + 2).toFixed(1)} ${(y * 0.86).toFixed(1)} ${x.toFixed(1)} ${(y * 0.93).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
    for (const traco of fio.querySelectorAll('path')) traco.setAttribute('d', d);
  };

  raiz.dataset.portao = '';
  document.body.append(caixa);
  desenhar();
  fontesProntas().then(() => { if (caixa.isConnected) desenhar(); });
  window.addEventListener('resize', desenhar, { passive: true });
  gsap.fromTo(caixa, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'none' });   // (só opacidade: escondido, o botão não receberia o foco)
  if (!amb.toque) botao?.focus({ preventScroll: true });

  return new Promise((resolver) => {
    let feito = false;
    botao.addEventListener('click', () => {
      if (feito) return;
      feito = true;
      // daqui em diante é uma visita comum àquela parte: recarregar não pede o portão de novo
      try {
        const params = new URLSearchParams(location.search);
        params.delete('volta');
        const resto = params.toString();
        history.replaceState(history.state, '', `${location.pathname}${resto ? `?${resto}` : ''}${location.hash}`);
      } catch { /* sem history */ }
      window.removeEventListener('resize', desenhar);
      caixa.style.pointerEvents = 'none';
      const fim = () => {
        caixa.remove();
        delete raiz.dataset.portao;
        resolver();
      };
      // a etiqueta sobe pelo fio e a noite se desfaz (no movimento reduzido, só se desfaz)
      if (!amb.reduzido) {
        const r = pendura.getBoundingClientRect();
        gsap.to(pendura, { y: -(r.bottom + 40), duration: 0.6, ease: 'power2.in' });
        gsap.to(fio, { y: -(r.bottom + 40), duration: 0.6, ease: 'power2.in' });
      }
      gsap.to(caixa, { autoAlpha: 0, duration: 0.6, ease: 'none', onComplete: fim, onInterrupt: fim });
    });
  });
}
