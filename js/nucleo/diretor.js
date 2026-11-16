// Diretor: a ordem das cenas, o atalho ?cena=, a etapa atual e o gancho de teste.
//
// Cada cena é `async function (ctx, { frio })` e resolve quando a próxima deve
// começar. `frio` é true quando se entrou direto por ?cena=: a cena monta
// sozinha o que a anterior teria deixado pronto. A cena `final` nunca resolve.
//
// O estado fica visível em <html data-cena="..." data-etapa="..."> e em
//   window.__carta = { ctx, cena, etapa, pronto (Promise), historico, gpu, erro }
//
// Etapas de cada cena (contrato: _dev/ROTEIRO2.md):
//   senha     senha → senha-certa                       (não existe com senha.codigo vazio)
//   musica    musica → entrando                         (na tela preta; "entrando" é o preto se desfazendo)
//   inicio    frases → caminhada → carta-chegando → carta-espera → carta-abrindo → papel
//   poppy     desenrolando → lendo → enrolando → guardando
//   carta2    caminhada → carta-chegando → carta-espera → carta-abrindo → papel
//   yourname  desenrolando → lendo → enrolando → guardando
//   mao       olha → mao-espera → correndo
//   cartas    pousando → escolhendo ⇄ assistindo → seguindo   (não existe sem nenhuma carta em cartasChao)
//   encontro  chegando → planos → maos → carta          (só existe com algum quadro em encontro.quadros)
//   final     carta-chegando → carta-espera → carta-abrindo → desdobrando → escrevendo → fim
//
// Sem ?cena= (ou com um valor que não existe) a carta começa em "senha". Qualquer
// atalho de "inicio" em diante pula a senha e a música (a tela preta nem aparece).

import { cenaAbertura } from '../cenas/abertura.js';
import { cenaCarta } from '../cenas/carta.js';

export const ORDEM = ['senha', 'musica', 'inicio', 'poppy', 'carta2', 'yourname', 'mao', 'cartas', 'encontro', 'final'];
/** Nomes antigos de ?cena= que continuam valendo. */
const APELIDOS = { segredos: 'cartas' };
/** Cenas da tela preta (o index.html tem a mesma lista no script que esconde #entrada). */
const NA_ENTRADA = new Set(['senha', 'musica']);
/** O tema da carta de cada capítulo (envelope, bolso e bolsa usam o mesmo nome). */
const CAPITULOS = ['poppy', 'yourname'];
/**
 * Etapas em que ela pode abrir a bolsa: só as de espera, em que nada está em
 * movimento e a folha está livre para reabrir uma carta.
 */
const BOLSA_LIVRE = new Set(['carta2:carta-espera', 'mao:mao-espera', 'cartas:escolhendo']);

/**
 * Cenas que só existem quando o content.js tem o que mostrar. Pulada, a cena nem
 * aparece em data-cena: a seguinte entra como entraria sem ela (fria só se a
 * carta começou ali por ?cena=).
 */
/** Há senha a pedir? */
export function temSenha(conteudo) {
  const codigo = conteudo && conteudo.senha && conteudo.senha.codigo;
  return typeof codigo === 'string' && /^\d+$/.test(codigo.trim());
}
/**
 * As cartas do chão, na ordem: os amigos e, por último, a Surpresinha.
 * → [{ id, nome, tipo: 'video' | 'galeria', video, capa, midias }]
 * (carta sem vídeo continua na lista: abre o cartão de exemplo)
 */
export function cartasDoChao(conteudo) {
  const dados = (conteudo && conteudo.cartasChao) || {};
  const texto = (v) => (typeof v === 'string' ? v.trim() : '');
  const lista = [];
  for (const item of Array.isArray(dados.itens) ? dados.itens : []) {
    const nome = texto(item && item.nome);
    if (!nome) continue;
    lista.push({ id: `chao-${lista.length + 1}`, nome, tipo: 'video', video: texto(item.video), capa: texto(item.capa), midias: [] });
  }
  const s = dados.surpresinha;
  if (s && texto(s.nome)) {
    const midias = (Array.isArray(s.midias) ? s.midias : [])
      .map((m) => ({ foto: texto(m && m.foto), video: texto(m && m.video), legenda: texto(m && m.legenda) }))
      .filter((m) => m.foto || m.video);
    lista.push({ id: 'chao-surpresinha', nome: texto(s.nome), tipo: 'galeria', video: '', capa: '', midias });
  }
  return lista;
}
/** As cartas do chão existem? (alguma carta com nome em cartasChao) */
export function temCartas(conteudo) {
  return cartasDoChao(conteudo).length > 0;
}
/** O encontro (os quadros entre as cartas do chão e a última carta) existe? */
export function temEncontro(conteudo) {
  const quadros = conteudo && conteudo.encontro && conteudo.encontro.quadros;
  return Array.isArray(quadros) && quadros.some((q) => q && typeof q.imagem === 'string' && q.imagem.trim());
}
const PULAR = {
  senha: (ctx) => !temSenha(ctx.conteudo),
  cartas: (ctx) => !temCartas(ctx.conteudo),
  encontro: (ctx) => !temEncontro(ctx.conteudo),
};

// O que não é da primeira tela só é baixado depois (em segundo plano, durante a abertura).
const carregar = {
  poppy: () => import('../capitulos/poppy.js'),
  yourname: () => import('../capitulos/yourname.js'),
  mao: () => import('../cenas/mao.js'),
  cartas: () => import('../cenas/cartas.js'),
  encontro: () => import('../cenas/encontro.js'),
  final: () => import('../cenas/final.js'),
};
// A tela preta é a primeira coisa que ela vê: só é baixada quando a carta começa por ela.
const carregarEntrada = () => import('../cenas/senha.js');

/** A tela preta (#entrada) some de uma vez: é o que os atalhos fazem. */
function tirarEntrada() {
  document.documentElement.classList.add('sem-entrada');
  const no = document.getElementById('entrada');
  if (no) no.remove();
}

/** O item da bolsa de uma carta de capítulo. Tocar nele relê o capítulo. */
function itemDoCapitulo(ctx, id) {
  const nomes = ctx.conteudo.inventario || {};
  const titulo = id === 'poppy' ? nomes.cartaPoppy : nomes.cartaYourname;
  return { id: `carta-${id}`, tipo: 'carta', tema: id, titulo: titulo || '', abrir: () => reler(ctx, id) };
}

/**
 * Relê um capítulo já guardado (chamado pela bolsa): a folha aparece sozinha,
 * desenrola, e ao fechar ("Guardar no bolso" de novo) enrola e some. Não muda
 * cena nem etapa. Só roda com a folha livre (pergaminho oculto).
 */
async function reler(ctx, id) {
  const { pergaminho } = ctx;
  if (pergaminho.estado !== 'oculto') return;
  const { capitulo } = await carregar[id]();
  // O que a cena atual deixou no palco (a dica, a mão, as cartas do chão, os botões) sai
  // da frente enquanto ela relê e volta depois, como estava (html.relendo, css/base.css).
  const raiz = document.documentElement;
  raiz.classList.add('relendo');
  try {
    await pergaminho.receberPapel();
    await pergaminho.desenrolar(capitulo, { releitura: true });
    await pergaminho.esperarFechar();
    await pergaminho.enrolar();
    await pergaminho.soltar();
  } finally {
    raiz.classList.remove('relendo');
  }
}

/** Entrando por atalho: a bolsa já vem com as cartas que ela teria guardado até ali. */
function semearBolsa(ctx, cena) {
  const i = ORDEM.indexOf(cena);
  let algum = false;
  for (const id of CAPITULOS) {
    if (ORDEM.indexOf(id) < i) { ctx.inventario.guardar(itemDoCapitulo(ctx, id)); algum = true; }
  }
  if (algum && cena !== 'final') ctx.inventario.mostrarBotao();
}

/**
 * Abre um capítulo no pergaminho, espera ela tocar em "Guardar no bolso", devolve
 * o mundo e guarda a carta: a animação do bolso e, depois dela, o item na bolsa.
 */
async function cenaCapitulo(ctx, id, frio) {
  const { diretor, pergaminho, musica, estado, bolso, inventario } = ctx;
  if (frio) {
    // Entrou direto: a folha em branco aparece sozinha, sem carta nenhuma.
    await pergaminho.receberPapel();
    musica.mostrarMini();
  }
  diretor.etapa('desenrolando');
  const { capitulo } = await carregar[id]();
  await pergaminho.desenrolar(capitulo);
  diretor.etapa('lendo');
  await pergaminho.esperarFechar();

  // A folha enrola e some; a carta fica: é ela que vai para o bolso.
  diretor.etapa('enrolando');
  await pergaminho.enrolar();
  await pergaminho.soltar();

  diretor.etapa('guardando');
  const envelope = estado.envelope || null;
  estado.envelope = null;
  try {
    await bolso.guardar({ tema: id, envelope });
  } catch (erro) {
    console.error('[carta] o bolso falhou', erro);      // o bolso nunca prende a carta
  }
  // Rede de segurança: a carta que o bolso não tiver descartado vai embora aqui.
  if (envelope && !envelope.descartado) {
    try { envelope.dispose(); } catch (erro) { console.error(erro); }
  }
  inventario.guardar(itemDoCapitulo(ctx, id));
  inventario.mostrarBotao();
}

/** Fecha o pergaminho, devolve o mundo branco e manda embora a carta que já foi lida. */
export async function voltarAoMundo(ctx) {
  const { pergaminho, estado } = ctx;
  await pergaminho.enrolar();
  const envelope = estado.envelope;
  estado.envelope = null;
  await Promise.all([
    pergaminho.soltar(),
    envelope ? envelope.irEmbora().then(() => envelope.dispose()) : null,
  ]);
}

const cenas = {
  async senha(ctx, opcoes) {
    // Atrás do preto ninguém vê o mundo: ele só é ligado quando o preto se desfaz.
    ctx.mundo.desligar();
    const { cenaSenha } = await carregarEntrada();
    await cenaSenha(ctx, opcoes);
  },

  async musica(ctx) {
    const { sairDaEntrada } = await carregarEntrada();
    ctx.mundo.desligar();
    ctx.diretor.etapa('musica');
    ctx.som.destravar();
    await ctx.musica.escolher(document.getElementById('entrada-musica'));
    // A música começou: o preto se desfaz e o mundo branco aparece.
    ctx.diretor.etapa('entrando');
    ctx.mundo.ligar();
    await sairDaEntrada(ctx);
    ctx.musica.mostrarMini();
  },

  async inicio(ctx, { frio }) {
    if (frio) ctx.musica.mostrarMini();
    await cenaAbertura(ctx, { frio });
    await cenaCarta(ctx, { tema: 'poppy', lacre: 'coracao', amarracao: 'cordao', distancia: 7 });
  },

  poppy: (ctx, { frio }) => cenaCapitulo(ctx, 'poppy', frio),

  async carta2(ctx, { frio }) {
    if (frio) ctx.musica.mostrarMini();
    // Mesma distância da primeira carta: com 9 m sobravam uns 4 s de mundo vazio antes dela nascer.
    await cenaCarta(ctx, { tema: 'yourname', lacre: 'estrela', amarracao: 'cordao', distancia: 7 });
  },

  yourname: (ctx, { frio }) => cenaCapitulo(ctx, 'yourname', frio),

  async mao(ctx, opcoes) {
    const { cenaMao } = await carregar.mao();
    // Enquanto ela olha a mão e corre pelo fio, os quadros do encontro já vão chegando.
    if (temEncontro(ctx.conteudo)) carregar.encontro().then((m) => m.prepararEncontro(ctx)).catch(() => {});
    await cenaMao(ctx, opcoes);
  },

  async cartas(ctx, opcoes) {
    const { cenaCartas } = await carregar.cartas();
    await cenaCartas(ctx, opcoes);
  },

  async encontro(ctx, opcoes) {
    const { cenaEncontro } = await carregar.encontro();
    await cenaEncontro(ctx, opcoes);
  },

  async final(ctx, opcoes) {
    const { cenaFinal } = await carregar.final();
    await cenaFinal(ctx, opcoes);
  },
};

export function criarDiretor() {
  const raiz = document.documentElement;
  const ouvintes = new Set();
  let liberarPronto;

  const diretor = {
    ordem: ORDEM,
    cena: null,
    etapaAtual: null,
    /** Lista de { cena, etapa, t } na ordem em que aconteceram (para os testes). */
    historico: [],

    /** Publica a etapa atual. Sem argumento, devolve a etapa atual. */
    etapa(nome) {
      if (nome === undefined) return diretor.etapaAtual;
      if (nome === diretor.etapaAtual) return nome;
      diretor.etapaAtual = nome;
      raiz.dataset.etapa = nome;
      diretor.historico.push({ cena: diretor.cena, etapa: nome, t: Math.round(performance.now()) });
      for (const fn of ouvintes) {
        try { fn(diretor.cena, nome); } catch (erro) { console.error(erro); }
      }
      return nome;
    },

    /** fn(cena, etapa) a cada mudança. Devolve a função que cancela. */
    aoMudar(fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },

    /** Lê ?cena= do endereço; sem ele (ou com um valor desconhecido) a carta começa do começo: a senha. */
    cenaInicial() {
      let pedida = new URLSearchParams(location.search).get('cena');
      if (APELIDOS[pedida]) pedida = APELIDOS[pedida];
      return ORDEM.includes(pedida) ? pedida : ORDEM[0];
    },

    /** Baixa em segundo plano os módulos das cenas seguintes. */
    aquecer() {
      for (const fn of Object.values(carregar)) fn().catch(() => {});
    },

    /** Roda da cena inicial até a última. */
    async rodar(ctx, cenaInicial = diretor.cenaInicial()) {
      ctx.diretor = diretor;
      window.__carta.ctx = ctx;
      liberarPronto(ctx);

      const comeco = Math.max(0, ORDEM.indexOf(cenaInicial));
      // Fria = entrou por atalho. (Começar pela senha, ou pela música quando não há
      // senha, é o começo de verdade.)
      let frio = comeco > 0;
      // Atalho de "inicio" em diante: sem tela preta, e a bolsa já com o que ela teria guardado.
      if (!NA_ENTRADA.has(ORDEM[comeco])) {
        tirarEntrada();
        semearBolsa(ctx, ORDEM[comeco]);
      }
      // A bolsa só abre nas etapas de espera; na última folha o botão sai de cena.
      diretor.aoMudar((cena, etapa) => {
        ctx.inventario.liberar(BOLSA_LIVRE.has(`${cena}:${etapa}`));
        if (cena === 'final' && etapa === 'desdobrando') ctx.inventario.esconderBotao();
      });

      for (let i = comeco; i < ORDEM.length; i++) {
        const nome = ORDEM[i];
        if (PULAR[nome] && PULAR[nome](ctx)) {
          // sem senha a pedir, a carta começa pela música: continua sendo o começo de verdade
          continue;
        }
        diretor.cena = nome;
        diretor.etapaAtual = null;
        raiz.dataset.cena = nome;
        delete raiz.dataset.etapa;
        try {
          await cenas[nome](ctx, { frio });
          frio = false;
        } catch (erro) {
          // Nada pode travar: se uma cena quebrar, a próxima entra fria e ela segue adiante.
          console.error(`[carta] a cena "${nome}" falhou`, erro);
          await recuperar(ctx);
          frio = true;
        }
      }
    },
  };

  // Gancho de teste: sempre presente, invisível.
  window.__carta = {
    ctx: null,
    get cena() { return diretor.cena; },
    get etapa() { return diretor.etapaAtual; },
    get historico() { return diretor.historico; },
    pronto: new Promise((resolver) => { liberarPronto = resolver; }),
    gpu: null,      // texto do renderer WebGL (preenchido pelo main.js)
    erro: null,     // mensagem, se o boot falhar
  };

  return diretor;
}

/**
 * Depois de uma cena que quebrou: devolve tudo ao ponto de partida de uma cena
 * fria (mundo branco ligado, sem carta, sem folha, palco vazio). Nunca lança.
 */
async function recuperar(ctx) {
  limparPalco();
  tirarEntrada();
  const { pergaminho, mundo, estado } = ctx;
  try {
    if (estado.envelope) estado.envelope.dispose();
  } catch (erro) { console.error(erro); }
  estado.envelope = null;
  try {
    // Com limite de tempo: uma animação presa não pode segurar a carta inteira.
    await Promise.race([
      pergaminho.soltar(),
      new Promise((ok) => setTimeout(ok, 4000)),
    ]);
  } catch (erro) { console.error(erro); }
  try {
    mundo.ligar();
    mundo.petalas.definirDensidade(1);
  } catch (erro) { console.error(erro); }
}

function limparPalco() {
  for (const id of ['frases', 'acoes']) {
    const no = document.getElementById(id);
    if (no) no.textContent = '';
  }
  const dica = document.getElementById('dica');
  if (dica) { dica.textContent = ''; dica.hidden = true; }
  // O que as cenas penduraram no palco além dos três lugares fixos (a mão, espelhos de leitura).
  const palco = document.getElementById('palco');
  if (palco) {
    for (const no of [...palco.children]) {
      if (!['frases', 'dica', 'acoes'].includes(no.id)) no.remove();
    }
  }
}
