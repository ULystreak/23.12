// Diretor: a ordem das cenas, o atalho ?cena=, a etapa atual e o gancho de teste.
//
// Cada cena é `async function (ctx, { frio })` e resolve quando a próxima deve
// começar. `frio` é true quando se entrou direto por ?cena=: a cena monta
// sozinha o que a anterior teria deixado pronto. A cena `final` nunca resolve.
//
// O estado fica visível em <html data-cena="..." data-etapa="..."> e em
//   window.__carta = { ctx, cena, etapa, pronto (Promise), historico, gpu, erro }
//
// Etapas de cada cena (contrato, _dev/DIRECAO.md 4.1):
//   inicio    frases → caminhada → carta-chegando → carta-espera → carta-abrindo → papel → musica
//   poppy     desenrolando → lendo
//   carta2    enrolando → caminhada → carta-chegando → carta-espera → carta-abrindo → papel
//   yourname  desenrolando → lendo
//   mao       enrolando → olha → mao-espera → seguindo
//   final     carta-chegando → carta-espera → carta-abrindo → desdobrando → escrevendo → fim

import { cenaAbertura } from '../cenas/abertura.js';
import { cenaCarta } from '../cenas/carta.js';

export const ORDEM = ['inicio', 'poppy', 'carta2', 'yourname', 'mao', 'final'];

// O que não é da primeira tela só é baixado depois (em segundo plano, durante a abertura).
const carregar = {
  poppy: () => import('../capitulos/poppy.js'),
  yourname: () => import('../capitulos/yourname.js'),
  mao: () => import('../cenas/mao.js'),
  final: () => import('../cenas/final.js'),
};

/** Abre um capítulo no pergaminho e espera ela fechar. */
async function cenaCapitulo(ctx, id, frio) {
  const { diretor, pergaminho, musica } = ctx;
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
  async inicio(ctx, { frio }) {
    await cenaAbertura(ctx, { frio });
    await cenaCarta(ctx, { lacre: 'coracao', amarracao: 'cordao', distancia: 7 });
    ctx.diretor.etapa('musica');
    await ctx.musica.escolher(ctx.pergaminho.folha);
    ctx.musica.mostrarMini();
  },

  poppy: (ctx, { frio }) => cenaCapitulo(ctx, 'poppy', frio),

  async carta2(ctx, { frio }) {
    ctx.diretor.etapa('enrolando');
    if (frio) ctx.musica.mostrarMini();
    else await voltarAoMundo(ctx);
    // Mesma distância da primeira carta: com 9 m sobravam uns 4 s de mundo vazio antes dela nascer.
    await cenaCarta(ctx, { lacre: 'estrela', amarracao: 'cordao', distancia: 7 });
  },

  yourname: (ctx, { frio }) => cenaCapitulo(ctx, 'yourname', frio),

  async mao(ctx, opcoes) {
    const { cenaMao } = await carregar.mao();
    await cenaMao(ctx, opcoes);
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

    /** Lê ?cena= do endereço; valor desconhecido cai em 'inicio'. */
    cenaInicial() {
      const pedida = new URLSearchParams(location.search).get('cena');
      return ORDEM.includes(pedida) ? pedida : 'inicio';
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
      let frio = comeco > 0;

      for (let i = comeco; i < ORDEM.length; i++) {
        const nome = ORDEM[i];
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
