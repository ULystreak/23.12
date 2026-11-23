/* ============================================================================
   DIRETOR: roda as cenas em ordem
   ============================================================================
   Cada cena é `async (ctx, { frio })`; `frio` é verdadeiro quando ela entrou
   direto por ?cena= e precisa montar o que as anteriores teriam deixado.
   O diretor publica a cena e a etapa em <html data-cena data-etapa>, guarda o
   histórico em window.__carta.historico, decide quando a bolsa pode abrir
   (BOLSA_LIVRE), quais cenas são retomadas depois de recarregar (RETOMAR) e
   quais são puladas quando o content.js não as sustenta (PULAR).

   Atalhos: ?cena=senha|musica|inicio|poppy|carta2|yourname|mao|cartas|encontro|final|menu
   (?cena=segredos é apelido antigo de cartas). ?menu=0|1 esquece ou grava a
   marca do menu; ?volta=1 pede o portão antes de uma parte.
   ========================================================================== */

import { cenaAbertura } from '../cenas/abertura.js';
import { cenaCarta } from '../cenas/carta.js';
import { menuLembrado, lembrarMenu, espera } from './util.js';

export const ORDEM = ['senha', 'musica', 'inicio', 'poppy', 'carta2', 'yourname', 'mao', 'cartas', 'encontro', 'final', 'menu'];

const APELIDOS = { segredos: 'cartas' };
// As cenas da tela preta. O index.html tem a lista complementar no script que esconde #entrada.
const NA_ENTRADA = new Set(['senha', 'musica']);
const CAPITULOS = ['poppy', 'yourname'];
// A bolsa só abre nas esperas, em que nada está em movimento e a folha está livre.
const BOLSA_LIVRE = new Set([
  'carta2:caminhada', 'carta2:carta-chegando', 'carta2:carta-espera',
  'mao:mao-espera', 'cartas:escolhendo', 'final:fim', 'menu:menu',
]);
// Recarregar, voltar ou o iPhone descartar a aba caem no atalho ?cena=, não na senha.
const RETOMAR = new Set(['inicio', 'poppy', 'carta2', 'yourname', 'mao', 'cartas', 'encontro', 'final', 'menu']);

const carregar = {
  poppy: () => import('../capitulos/poppy.js'),
  yourname: () => import('../capitulos/yourname.js'),
  mao: () => import('../cenas/mao.js'),
  cartas: () => import('../cenas/cartas.js'),
  encontro: () => import('../cenas/encontro.js'),
  final: () => import('../cenas/final.js'),
  menu: () => import('../cenas/menu.js'),
};
const carregarEntrada = () => import('../cenas/senha.js');

/* ---- o que o conteúdo sustenta -------------------------------------------- */

export function temSenha(conteudo) {
  const c = conteudo?.senha?.codigo;
  return typeof c === 'string' && c.trim().length > 0;
}

/** As cartas do chão, na ordem: os amigos (chao-N) e, por último, a surpresinha (galeria). */
export function cartasDoChao(conteudo) {
  const dados = conteudo?.cartasChao || {};
  const lista = [];
  let n = 0;
  for (const item of Array.isArray(dados.itens) ? dados.itens : []) {
    const nome = typeof item?.nome === 'string' ? item.nome.trim() : '';
    if (!nome) continue;
    n += 1;
    lista.push({
      id: `chao-${n}`,
      nome,
      tipo: 'video',
      video: typeof item.video === 'string' ? item.video : '',
      capa: typeof item.capa === 'string' ? item.capa : '',
      midias: [],
    });
  }
  const s = dados.surpresinha;
  const nomeS = typeof s?.nome === 'string' ? s.nome.trim() : '';
  if (nomeS) {
    const midias = (Array.isArray(s.midias) ? s.midias : [])
      .filter((m) => (typeof m?.foto === 'string' && m.foto) || (typeof m?.video === 'string' && m.video))
      .map((m) => ({ foto: m.foto || '', video: m.video || '', legenda: typeof m.legenda === 'string' ? m.legenda : '' }));
    lista.push({ id: 'chao-surpresinha', nome: nomeS, tipo: 'galeria', video: '', capa: '', midias });
  }
  return lista;
}

export function temCartas(conteudo) {
  return cartasDoChao(conteudo).length > 0;
}

export function temEncontro(conteudo) {
  const quadros = conteudo?.encontro?.quadros;
  return Array.isArray(quadros) && quadros.some((q) => typeof q?.imagem === 'string' && q.imagem.trim());
}

export function temMenu(conteudo) {
  const m = conteudo?.menu;
  return !!m && typeof m === 'object' && !Array.isArray(m);
}

const PULAR = {
  senha: (c) => !temSenha(c),
  cartas: (c) => !temCartas(c),
  encontro: (c) => !temEncontro(c),
  menu: (c) => !temMenu(c),
};

/** Enrola a folha e manda o envelope embora: a mão volta ao mundo limpo. */
export function voltarAoMundo(ctx) {
  const { pergaminho, estado } = ctx;
  const envelope = estado.envelope;
  estado.envelope = null;
  pergaminho?.enrolar?.();
  return Promise.all([
    pergaminho?.soltar?.(),
    envelope ? Promise.resolve(envelope.irEmbora?.()).then(() => envelope.dispose?.()) : null,
  ]);
}

/* ---- apoios ---------------------------------------------------------------- */

function marcarRetomada(cena, som) {
  try {
    const params = new URLSearchParams(location.search);
    params.set('cena', cena);
    const indice = som?.estado?.indice;
    if (Number.isInteger(indice) && indice >= 0) params.set('musica', String(indice));
    history.replaceState(history.state, '', `${location.pathname}?${params}${location.hash}`);
  } catch {
    /* sem histórico */
  }
}

function seguirFaixa(som) {
  if (typeof som?.aoMudar !== 'function') return;
  let ultimo = som.estado?.indice ?? -1;
  som.aoMudar(() => {
    const indice = som.estado?.indice ?? -1;
    if (indice === ultimo || indice < 0) return;
    ultimo = indice;
    const cena = document.documentElement.dataset.cena;
    if (!RETOMAR.has(cena)) return;
    // O Safari limita a frequência de replaceState; só reescrevemos quando a faixa muda.
    try {
      const params = new URLSearchParams(location.search);
      params.set('musica', String(indice));
      history.replaceState(history.state, '', `${location.pathname}?${params}${location.hash}`);
    } catch {
      /* ignora */
    }
  });
}

function tirarEntrada() {
  document.documentElement.classList.add('sem-entrada');
  document.getElementById('entrada')?.remove();
}

function limparPalco() {
  const palco = document.getElementById('palco');
  const frases = document.getElementById('frases');
  const dica = document.getElementById('dica');
  const acoes = document.getElementById('acoes');
  if (frases) frases.textContent = '';
  if (acoes) acoes.textContent = '';
  if (dica) {
    dica.textContent = '';
    dica.hidden = true;
  }
  if (palco) {
    for (const filho of [...palco.children]) {
      if (!['frases', 'dica', 'acoes'].includes(filho.id)) filho.remove();
    }
  }
}

/* ---- o diretor ------------------------------------------------------------- */

export function criarDiretor() {
  let etapaAtual = null;
  const historico = [];
  const ouvintes = new Set();
  let resolverPronto;
  const pronto = new Promise((resolve) => { resolverPronto = resolve; });

  window.__carta = {
    ctx: null,
    get cena() { return diretor.cena; },
    get etapa() { return etapaAtual; },
    get historico() { return historico; },
    pronto,
    gpu: null,
    erro: null,
  };

  const diretor = {
    cena: null,
    get etapaAtual() { return etapaAtual; },

    etapa(nome) {
      if (nome === undefined) return etapaAtual;
      if (nome === etapaAtual) return etapaAtual;
      etapaAtual = nome;
      document.documentElement.dataset.etapa = nome;
      historico.push({ cena: diretor.cena, etapa: nome, t: Math.round(performance.now()) });
      for (const fn of ouvintes) {
        try {
          fn(diretor.cena, nome);
        } catch (erro) {
          console.error('[carta] ouvinte de etapa', erro);
        }
      }
      return etapaAtual;
    },

    aoMudar(fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },

    cenaInicial() {
      const params = new URLSearchParams(location.search);
      let nome = params.get('cena') || '';
      nome = APELIDOS[nome] || nome;
      return ORDEM.includes(nome) ? nome : 'senha';
    },

    aquecer() {
      for (const fn of Object.values(carregar)) fn().catch(() => {});
    },

    async rodar(ctx, cenaInicial) {
      ctx.diretor = diretor;
      window.__carta.ctx = ctx;
      resolverPronto(ctx);
      if (ctx.som) seguirFaixa(ctx.som);

      const { conteudo } = ctx;
      const params = new URLSearchParams(location.search);
      const marcaMenu = params.get('menu');
      if (marcaMenu === '0' || marcaMenu === '1') {
        lembrarMenu(marcaMenu === '1');
        params.delete('menu');
        try {
          history.replaceState(history.state, '', `${location.pathname}${params.toString() ? '?' + params : ''}${location.hash}`);
        } catch { /* ignora */ }
      }

      const comMenu = temMenu(conteudo);
      let comeco = Math.max(0, ORDEM.indexOf(cenaInicial));
      let frio = comeco > 0;

      if (!NA_ENTRADA.has(ORDEM[comeco])) {
        tirarEntrada();
        semearBolsa(ctx, ORDEM[comeco]);
      }

      diretor.aoMudar((cena, etapa) => {
        const inv = ctx.inventario;
        if (!inv) return;
        inv.liberar(BOLSA_LIVRE.has(`${cena}:${etapa}`));
        if (cena === 'final' && etapa === 'desdobrando') inv.esconderBotao();
        if (cena === 'final' && etapa === 'fim' && inv.itens.length) inv.mostrarBotao();
        if (cena === 'menu' && etapa === 'referencias') inv.esconderBotao();
        if (cena === 'menu' && etapa === 'menu' && inv.itens.length) inv.mostrarBotao();
      });

      const direto = NA_ENTRADA.has(ORDEM[comeco]) && comMenu && menuLembrado();
      ctx.estado.direto = direto;

      if (frio && ORDEM[comeco] !== 'menu' && comMenu && params.get('volta') === '1') {
        try {
          const { portao } = await carregar.menu();
          await portao(ctx, ORDEM[comeco]);
        } catch (erro) {
          console.error('[carta] o portão falhou', erro);
        }
      }

      if (ORDEM[comeco] !== 'menu') document.documentElement.classList.remove('entra-noite');

      for (let i = comeco; i < ORDEM.length; i++) {
        const nome = ORDEM[i];
        if (PULAR[nome] && PULAR[nome](conteudo)) continue;
        if (direto && nome !== 'menu' && !NA_ENTRADA.has(nome)) continue;
        if (direto && nome === 'menu') {
          semearBolsa(ctx, 'menu');
          frio = true;
        }

        diretor.cena = nome;
        etapaAtual = null;
        document.documentElement.dataset.cena = nome;
        delete document.documentElement.dataset.etapa;
        if (RETOMAR.has(nome)) marcarRetomada(nome, ctx.som);

        try {
          await cenas[nome](ctx, { frio });
          frio = false;
        } catch (erro) {
          console.error(`[carta] a cena "${nome}" falhou`, erro);
          if (!frio && i === ORDEM.length - 1) {
            location.reload();
            return;
          }
          await recuperar(ctx);
          frio = true;
        }
      }
    },
  };

  /* ---- cenas --------------------------------------------------------------- */

  const cenas = {
    async senha(ctx, opcoes) {
      ctx.mundo?.desligar?.();
      const { cenaSenha } = await carregarEntrada();
      await cenaSenha(ctx, opcoes);
    },

    async musica(ctx) {
      const { sairDaEntrada } = await carregarEntrada();
      ctx.mundo?.desligar?.();
      diretor.etapa('musica');
      ctx.som?.destravar?.();
      await ctx.musica.escolher(document.getElementById('entrada-musica'));
      if (!ctx.mundo) {
        await ctx.mundoPronto();
        if (ctx.mundo?.alameda?.pronta) await Promise.race([ctx.mundo.alameda.pronta, espera(2500)]);
      }
      diretor.etapa('entrando');
      if (ctx.estado.direto) ctx.mundo.hora?.('noite', { duracao: 0 });
      ctx.mundo.ligar();
      await sairDaEntrada(ctx);
      ctx.musica.mostrarMini();
    },

    async inicio(ctx, { frio }) {
      if (frio) ctx.musica.mostrarMini();
      await cenaAbertura(ctx, { frio });
      await cenaCarta(ctx, { tema: 'poppy', lacre: 'coracao', amarracao: 'cordao', distancia: 7 });
    },

    poppy(ctx, { frio }) {
      return cenaCapitulo(ctx, 'poppy', frio);
    },

    async carta2(ctx, { frio }) {
      if (frio) ctx.musica.mostrarMini();
      await cenaCarta(ctx, { tema: 'yourname', lacre: 'estrela', amarracao: 'cordao', distancia: 7 });
    },

    yourname(ctx, { frio }) {
      return cenaCapitulo(ctx, 'yourname', frio);
    },

    async mao(ctx, opcoes) {
      const { cenaMao } = await carregar.mao();
      if (temEncontro(ctx.conteudo)) {
        carregar.encontro().then((m) => m.prepararEncontro(ctx)).catch(() => {});
      }
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

    async menu(ctx, opcoes) {
      const { cenaMenu } = await carregar.menu();
      await cenaMenu(ctx, opcoes);
    },
  };

  /* ---- capítulos e bolsa --------------------------------------------------- */

  function itemDoCapitulo(ctx, id) {
    const inv = ctx.conteudo?.inventario || {};
    const titulo = id === 'poppy' ? inv.cartaPoppy : inv.cartaYourname;
    return {
      id: `carta-${id}`,
      tipo: 'carta',
      tema: id,
      titulo: typeof titulo === 'string' && titulo ? titulo : id,
      abrir: () => reler(ctx, id),
    };
  }

  // A releitura não muda cena nem etapa: a carta já guardada abre por cima do que está na tela.
  async function reler(ctx, id) {
    const { pergaminho } = ctx;
    if (!pergaminho || pergaminho.estado !== 'oculto') return;
    const { capitulo } = await carregar[id]();
    document.documentElement.classList.add('relendo');
    try {
      await pergaminho.receberPapel();
      await pergaminho.desenrolar(capitulo, { releitura: true });
      await pergaminho.esperarFechar();
      await pergaminho.enrolar();
      await pergaminho.soltar();
    } finally {
      document.documentElement.classList.remove('relendo');
    }
  }

  function semearBolsa(ctx, cena) {
    const inv = ctx.inventario;
    if (!inv) return;
    const indice = ORDEM.indexOf(cena);
    let algum = false;
    for (const id of CAPITULOS) {
      if (ORDEM.indexOf(id) < indice) {
        inv.guardar(itemDoCapitulo(ctx, id));
        algum = true;
      }
    }
    if (algum && cena !== 'final' && cena !== 'menu') inv.mostrarBotao();
    if (indice > ORDEM.indexOf('cartas')) {
      carregar.cartas().then((m) => m.semearCartas(ctx)).catch(() => {});
    }
  }

  async function cenaCapitulo(ctx, id, frio) {
    const { pergaminho, musica, bolso, inventario, estado } = ctx;
    if (frio) {
      await pergaminho.receberPapel();
      musica.mostrarMini();
    }
    diretor.etapa('desenrolando');
    const { capitulo } = await carregar[id]();
    await pergaminho.desenrolar(capitulo);
    diretor.etapa('lendo');
    await pergaminho.esperarFechar();
    diretor.etapa('enrolando');
    await pergaminho.enrolar();
    await pergaminho.soltar();
    diretor.etapa('guardando');
    const envelope = estado.envelope;
    estado.envelope = null;
    try {
      await bolso.guardar({ tema: id, envelope });
    } catch (erro) {
      console.error('[carta] guardar no bolso', erro);
    }
    if (envelope && !envelope.descartado) envelope.dispose?.();
    inventario.guardar(itemDoCapitulo(ctx, id));
    inventario.mostrarBotao();
  }

  // Volta ao ponto de uma cena fria depois de uma falha. Cada passo em try; nunca lança.
  async function recuperar(ctx) {
    try { limparPalco(); } catch { /* ignora */ }
    try { tirarEntrada(); } catch { /* ignora */ }
    try {
      if (!ctx.mundo && ctx.mundoPronto) await ctx.mundoPronto();
    } catch { /* ignora */ }
    try {
      ctx.estado.envelope?.dispose?.();
    } catch { /* ignora */ }
    ctx.estado.envelope = null;
    try {
      await Promise.race([ctx.pergaminho?.soltar?.(), espera(4000)]);
    } catch { /* ignora */ }
    try { ctx.mundo?.ligar?.(); } catch { /* ignora */ }
    try { ctx.mundo?.petalas?.definirDensidade?.(1); } catch { /* ignora */ }
  }

  return diretor;
}
