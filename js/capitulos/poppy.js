/* ============================================================================
   CAPÍTULO 1: O JOGO (uma fita VHS gravada dentro da fábrica de brinquedos)
   ============================================================================
   Exporta `capitulo = { id: 'poppy', montar(raiz, api) }`; montar devolve
   { destruir() }. api = { conteudo, amb, som, rolagem, fundo, gsap, recursos,
   fechar(), aberto }.
   A folha vira um corredor de fábrica em 3D (poppy/corredor.js), num canvas
   próprio dentro do fundo do pergaminho. A rolagem não move o texto: move a
   câmera, com amortecimento. Cada bloco do content.js é uma PARADA do corredor;
   o HTML de cada parada (cartaz, monitor de tubo, etiqueta) fica num palco
   preso à janela e é projetado, quadro a quadro, no ponto do mundo em que o
   suporte está pendurado: chega pequeno na névoa, para no foco em tamanho real
   e é recolhido para o teto quando ela passa.
   Sem WebGL (?webgl=0, html.sem-webgl) ou com movimento reduzido, a classe
   `pp-plano` troca tudo por uma coluna 2D com os mesmos textos, na mesma ordem.
   Classes de estado postas aqui: aguardando, pp-plano, foco, pp-chegou,
   guardando (raiz); visivel (rótulo do OSD).
   ========================================================================== */

import { carregarImagem, clamp, el, espera, svg } from '../nucleo/util.js';
import { criarCorredor, D, DF, OLHO } from './poppy/corredor.js';

const PASSO = 0.86; // quanto de rolagem (em alturas de janela) separa duas paradas
const PRAZO_IMAGENS = 7000;
const AMORTECE = 6.5;

const texto = (v) => (typeof v === 'string' ? v.trim() : '');
const suave = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// Duas mãos de brinquedo que se encontram: só aparecem na versão plana.
const MAOS_2D = `<svg class="pp-maos2d" viewBox="0 0 240 96" aria-hidden="true" focusable="false">
  <path class="cabo" d="M0 30 Q30 52 62 48"/><path class="cabo" d="M240 30 Q210 52 178 48"/>
  <g class="mao azul"><rect x="56" y="36" width="16" height="24" rx="4"/><rect class="anel" x="70" y="33" width="6" height="30" rx="3"/>
    <ellipse cx="88" cy="48" rx="14" ry="16"/><rect x="94" y="33" width="24" height="8" rx="4"/><rect x="96" y="42" width="24" height="8" rx="4"/>
    <rect x="94" y="51" width="24" height="8" rx="4"/><rect x="92" y="60" width="20" height="7" rx="3.5"/><rect x="80" y="22" width="9" height="18" rx="4.5"/></g>
  <g class="mao rubra"><rect x="168" y="36" width="16" height="24" rx="4"/><rect class="anel" x="164" y="33" width="6" height="30" rx="3"/>
    <ellipse cx="152" cy="48" rx="14" ry="16"/><rect x="122" y="33" width="24" height="8" rx="4"/><rect x="120" y="42" width="24" height="8" rx="4"/>
    <rect x="122" y="51" width="24" height="8" rx="4"/><rect x="128" y="60" width="20" height="7" rx="3.5"/><rect x="151" y="22" width="9" height="18" rx="4.5"/></g>
  <path class="faisca" d="M120 8v14M108 14l7 9M132 14l-7 9M120 88V74M108 82l7-9M132 82l-7-9"/>
</svg>`;

// Com a carta ainda fechada, o logo e o motor 3D já ficam no cache.
carregarImagem(texto(window.CONTEUDO?.poppy?.logo));
const pedirTres = () => import('../../lib/three.module.min.js');

function segundos(marca) {
  const partes = texto(marca).split(':').map(Number);
  if (!partes.length || partes.some((p) => !Number.isFinite(p))) return 0;
  return partes.reduce((soma, p) => soma * 60 + p, 0);
}
function relogio(s) {
  const t = Math.max(0, Math.round(s));
  const dois = (x) => String(x).padStart(2, '0');
  return `${Math.floor(t / 3600)}:${dois(Math.floor(t / 60) % 60)}:${dois(t % 60)}`;
}

/** A câmera anda entre as paradas e quase para em cada uma: dá tempo de ler. */
function caminho(s, n) {
  const i = Math.round(s);
  const f = s - i;
  const u = i + Math.sign(f) * 0.5 * Math.pow(Math.abs(f) * 2, 3.4);
  return clamp(u, 0, n - 1);
}

export const capitulo = {
  id: 'poppy',

  async montar(raiz, api) {
    const { conteudo, amb = {}, som, rolagem, recursos } = api;
    const c = conteudo?.poppy || {};
    const rotulos = c.osd && typeof c.osd === 'object' ? c.osd : {};
    const html = document.documentElement;
    let vivo = true;
    const limpezas = [];

    raiz.classList.add('poppy', 'aguardando');
    api.fundo?.classList.add('poppy-fundo');

    /* ---- pedidos, todos com o mesmo prazo ------------------------------------ */
    const prazo = espera(PRAZO_IMAGENS).then(() => null);
    const comPrazo = (pedido) => Promise.race([Promise.resolve(pedido).catch(() => null), prazo]);
    const blocos = Array.isArray(c.blocos) ? c.blocos : [];
    const pedidosImagem = blocos.map((b) => (b?.tipo === 'imagem' && texto(b.arquivo)
      ? comPrazo(recursos?.elementoImagem?.(texto(b.arquivo), texto(b.alt)))
      : null));
    const pedidoLogo = texto(c.logo) ? comPrazo(recursos?.elementoImagem?.(texto(c.logo), texto(c.logoAlt))) : null;
    const quer3d = !!amb.webgl && !amb.reduzido && !html.classList.contains('sem-webgl') && !html.classList.contains('reduzido');
    const pedidoTres = quer3d ? comPrazo(pedirTres()) : null;
    const [logo, imagens, THREE] = await Promise.all([pedidoLogo, Promise.all(pedidosImagem), pedidoTres]);

    /* ---- as paradas, na ordem do content.js ------------------------------------ */
    // { tipo, el, desvio (m, para que lado a câmera pende), olhar (rad), oy (m, altura do suporte) }
    const paradas = [];
    const parada = (tipo, tag, classe, filhos, extra = {}) => {
      const no = el(tag, { class: `pp-est ${classe}`, ...extra.attrs }, filhos);
      paradas.push({ tipo, el: no, desvio: 0, olhar: 0, oy: 0, ox: 0, ...extra, attrs: undefined });
      return no;
    };

    const logoEl = logo ? (logo.classList.add('pp-logo'), logo) : null;
    parada('titulo', 'header', 'pp-e-titulo', el('div', 'pp-corpo', [
      logoEl,
      texto(c.titulo) ? el('h2', { class: 'pp-titulo', texto: texto(c.titulo) }) : null,
      texto(c.subtitulo) ? el('p', 'pp-sub', el('span', { texto: texto(c.subtitulo) })) : null,
    ]), { oy: 0.04 });

    let nTexto = 0;
    let nLado = 0;
    const lado = () => ((nLado++) % 2 ? 0.3 : -0.3);
    blocos.forEach((b, i) => {
      if (b?.tipo === 'texto' && texto(b.texto)) {
        const monitor = nTexto % 2 === 1;
        parada('texto', 'section', `${monitor ? 'pp-e-monitor' : 'pp-e-cartaz'} pp-v${nTexto % 4}`,
          el('div', 'pp-corpo', el('p', { class: 'pp-texto', texto: texto(b.texto) })), { desvio: lado() });
        nTexto += 1;
      } else if (b?.tipo === 'imagem' && imagens[i]) {
        imagens[i].classList.add('pp-imagem');
        parada('imagem', 'figure', 'pp-e-monitor pp-e-imagem', el('div', 'pp-corpo', [
          imagens[i],
          texto(b.legenda) ? el('figcaption', { class: 'pp-texto', texto: texto(b.legenda) }) : null,
        ]), { desvio: lado() });
      } else if (b?.tipo === 'cena' && b.cena === 'maos') {
        parada('maos', 'div', 'pp-e-maos', svg(MAOS_2D), { attrs: { 'aria-hidden': 'true' }, so2d: true });
      } else if (b?.tipo === 'cena' && b.cena === 'fita') {
        const tem = texto(b.etiqueta) || texto(b.data);
        parada('fita', 'section', 'pp-e-fita', el('div', 'pp-corpo', [
          el('i', { class: 'pp-cassete', 'aria-hidden': 'true' }),
          tem ? el('p', 'pp-etiqueta', [
            texto(b.etiqueta) ? el('strong', { texto: texto(b.etiqueta) }) : null,
            texto(b.data) ? el('span', { texto: texto(b.data) }) : null,
          ]) : null,
        ]), { oy: -0.5, so2d: !tem });
      } else if (b?.tipo === 'cena' && b.cena === 'esteira') {
        const itens = (Array.isArray(b.itens) ? b.itens : []).map(texto).filter(Boolean);
        parada('esteira', 'section', 'pp-e-esteira', el('ul', 'pp-corpo pp-tags',
          itens.map((t, k) => el('li', { class: `pp-tag pp-v${k % 4}`, style: `--i:${k}` }, el('span', { texto: t })))),
        { desvio: -0.45, olhar: -0.2, ox: -0.3, so2d: !itens.length });
      }
    });

    const textoFechar = texto(c.fechar);
    const botao = el('button', {
      type: 'button',
      class: 'pp-guardar',
      'data-acao': 'fechar-capitulo',
      'aria-label': textoFechar ? null : texto(rotulos.parar) || 'Fechar',
    }, [
      svg('<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.4C19 15.6 12 20 12 20z"/></svg>'),
      textoFechar ? el('span', { texto: textoFechar }) : null,
    ]);
    botao.addEventListener('touchstart', () => {}, { passive: true }); // sem isto o :active não acende no iPhone
    parada('fim', 'footer', 'pp-e-fim', el('div', 'pp-corpo', [el('i', { class: 'pp-no', 'aria-hidden': 'true' }), botao]));
    const n = paradas.length;
    const fim = paradas[n - 1];

    /* ---- a camada do videocassete e o palco -------------------------------------- */
    const modoEl = el('span', 'pp-modo');
    const contadorEl = el('span', { class: 'pp-contador', texto: relogio(0) });
    const osd = el('div', { class: 'pp-osd', 'aria-hidden': 'true' }, el('div', 'pp-tela', [
      el('i', 'pp-grao'), el('i', 'pp-varredura'), modoEl, contadorEl,
    ]));
    const luzFinal = el('i', { class: 'pp-luz', 'aria-hidden': 'true' });
    const palco = el('div', 'pp-palco', [luzFinal, ...paradas.map((p) => p.el)]);
    const trilho = el('div', { class: 'pp-trilho', 'aria-hidden': 'true' });
    raiz.append(osd, palco, trilho);

    const janela = rolagem?.el || raiz.parentElement || raiz;
    let alturaTela = janela.clientHeight || innerHeight;
    let larguraTela = janela.clientWidth || innerWidth;

    /* ---- o corredor (ou a versão plana) ------------------------------------------- */
    let corredor = null;
    function ficarPlano() {
      corredor?.destruir();
      corredor = null;
      raiz.classList.add('pp-plano');
      api.fundo?.classList.add('pp-plano');
      for (const p of paradas) {
        p.el.style.removeProperty('transform');
        p.el.style.removeProperty('opacity');
        p.el.style.removeProperty('z-index');
        p.el.classList.add('foco');
      }
      raiz.classList.add('pp-chegou');
      luzFinal.style.removeProperty('opacity');
      trilho.style.height = '';
    }
    if (THREE && api.fundo) {
      try {
        corredor = criarCorredor({
          THREE,
          recipiente: api.fundo,
          amb,
          n,
          desvios: paradas.map((p) => p.desvio),
          olhares: paradas.map((p) => p.olhar),
          cenas: {
            maos: paradas.findIndex((p) => p.tipo === 'maos'),
            fita: paradas.findIndex((p) => p.tipo === 'fita'),
            esteira: paradas.findIndex((p) => p.tipo === 'esteira'),
          },
          aoFaiscar: () => som?.efeito?.('brilho'),
          aoPerder: () => { if (vivo) ficarPlano(); },
        });
      } catch (erro) {
        console.warn('[carta] a fábrica em 3D não subiu; segue a versão plana', erro);
        corredor = null;
      }
    }
    if (!corredor) ficarPlano();

    // Onde cada suporte está pendurado no mundo: DF metros à frente da câmera parada.
    paradas.forEach((p, i) => {
      const cos = Math.cos(p.olhar);
      const sen = Math.sin(p.olhar);
      p.ancora = i === n - 1 && corredor ? corredor.ancoraFim : {
        x: p.desvio + p.ox * cos - DF * sen,
        y: OLHO + p.oy,
        z: -i * D - p.ox * sen - DF * cos,
      };
      p.visto = null;
      if (corredor) p.el.style.zIndex = String(n - i);
    });

    function medir() {
      if (!vivo) return;
      alturaTela = janela.clientHeight || innerHeight;
      larguraTela = janela.clientWidth || innerWidth;
      raiz.style.setProperty('--pp-h', `${alturaTela}px`);
      trilho.style.height = corredor ? `${Math.round((n - 1) * PASSO * alturaTela)}px` : '';
      corredor?.medir();
    }
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => medir());
      ro.observe(janela);
      limpezas.push(() => ro.disconnect());
    }

    // Na versão plana, cada bloco acende quando entra na janela.
    if (!corredor && typeof IntersectionObserver === 'function' && !amb.reduzido) {
      for (const p of paradas) p.el.classList.remove('foco');
      const io = new IntersectionObserver((lista) => {
        for (const item of lista) {
          if (!item.isIntersecting) continue;
          item.target.classList.add('foco');
          io.unobserve(item.target);
        }
      }, { root: janela, rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      for (const p of paradas) io.observe(p.el);
      limpezas.push(() => io.disconnect());
    }

    // O foco do teclado chega ao botão antes da rolagem: a câmera vai até a porta.
    const aoFocar = () => {
      if (!corredor) return;
      const max = Math.max(0, janela.scrollHeight - janela.clientHeight);
      if (janela.scrollTop < max - 4) rolagem?.irPara?.(max, { imediato: true });
    };
    botao.addEventListener('focus', aoFocar);

    /* ---- o videocassete: modo e contador --------------------------------------------- */
    const total = segundos(c.contadorFinal);
    let modoAte = 0;
    let modoFixo = false;
    let modoAtual = '';
    let contadorAtual = '';
    function modo(nome, ms = 0) {
      if (modoFixo) return;
      const rotulo = nome ? texto(rotulos[nome]) : '';
      if (rotulo !== modoAtual) {
        modoAtual = rotulo;
        if (rotulo) {
          modoEl.textContent = rotulo;
          modoEl.dataset.modo = nome;
        }
        modoEl.classList.toggle('visivel', !!rotulo);
      }
      modoAte = ms ? agora + ms / 1000 : 0;
    }

    /* ---- o laço ------------------------------------------------------------------------ */
    let quadroId = 0;
    let anterior = 0;
    let agora = 0;
    let u = 0;
    let sAnt = 0;
    let pressa = 0;
    let parado = false;
    let chegou = false;
    const tela = { x: 0, y: 0, prof: 0 };

    function posicionar() {
      for (let i = 0; i < n; i += 1) {
        const p = paradas[i];
        const r = i - u; // quantas paradas faltam (negativo: já passou)
        if (p.so2d || r > 0.96 || r < -0.2) {
          if (p.visto !== false) {
            p.visto = false;
            p.el.style.opacity = '0';
            p.el.classList.remove('foco');
          }
          continue;
        }
        p.visto = true;
        corredor.projetar(p.ancora.x, p.ancora.y, p.ancora.z, tela);
        const escala = Math.min(1.14, DF / Math.max(0.5, tela.prof));
        // Depois do foco o suporte é recolhido para o teto.
        const some = i === n - 1 ? 0 : suave(0.03, 0.17, -r);
        const y = tela.y - some * alturaTela * 0.9;
        const opaco = Math.min(1 - some, 1 - suave(0.5, 0.95, r));
        const gira = clamp(r, 0, 1) * (i % 2 ? 2.5 : -2.5);
        p.el.style.transform = `translate3d(${tela.x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%) scale(${escala.toFixed(4)}) rotate(${gira.toFixed(2)}deg)`;
        p.el.style.opacity = opaco.toFixed(3);
        p.el.classList.toggle('foco', Math.abs(r) < 0.2);
      }
    }

    function quadro(instante) {
      quadroId = requestAnimationFrame(quadro);
      if (parado || !vivo) return;
      const passou = anterior ? Math.max(0, (instante - anterior) / 1000) : 0;
      anterior = instante;
      const dt = Math.min(0.05, passou);
      agora += Math.min(0.5, passou);

      let s;
      if (corredor) {
        s = clamp((janela.scrollTop || 0) / Math.max(1, PASSO * alturaTela), 0, n - 1);
        u += (caminho(s, n) - u) * (1 - Math.exp(-AMORTECE * dt));
        corredor.quadro(dt, u, agora);
        posicionar();
        luzFinal.style.opacity = (suave(n - 1.5, n - 1, u) * 0.2).toFixed(3);
      } else {
        s = clamp(rolagem?.progresso || 0) * (n - 1);
      }
      const noFim = s > n - 1 - 0.1;
      if (noFim !== chegou && corredor) {
        chegou = noFim;
        raiz.classList.toggle('pp-chegou', chegou);
      }

      // O contador da fita anda com a rolagem; rolando depressa, FF ou REW.
      const marca = relogio((s / Math.max(1, n - 1)) * total);
      if (marca !== contadorAtual) {
        contadorAtual = marca;
        contadorEl.textContent = marca;
      }
      const rapidez = dt > 0 ? (s - sAnt) / dt : 0;
      sAnt = s;
      if (Math.abs(rapidez) > 1.5) pressa += dt;
      else pressa = Math.max(0, pressa - 3 * dt);
      if (pressa > 0.12 && Math.abs(rapidez) > 1.1) modo(rapidez > 0 ? 'avancar' : 'voltar', 420);
      if (modoAte && agora >= modoAte) modo(null);
    }

    /* ---- a abertura: as lâmpadas acendem e a fita começa a tocar ---------------------- */
    async function abertura() {
      await Promise.race([Promise.resolve(api.aberto), espera(4200)]);
      await espera(240);
      if (!vivo) return;
      raiz.classList.remove('aguardando');
      corredor?.acender();
      som?.efeito?.('fita');
      modo('tocar', 3600);
    }

    /* ---- guardar: a luz da porta toma a tela ---------------------------------------- */
    let guardando = false;
    async function guardar() {
      if (guardando || !vivo) return;
      guardando = true;
      botao.disabled = true;
      modo('parar');
      modoFixo = true;
      som?.efeito?.('fita');
      raiz.classList.remove('aguardando');
      raiz.classList.add('guardando');
      await espera(amb.reduzido ? 380 : 720);
      parado = true; // o corredor já está coberto pela luz: o laço para
      if (vivo) api.fechar?.();
    }
    botao.addEventListener('click', guardar);

    /* ---- começa -------------------------------------------------------------------------- */
    medir();
    quadroId = requestAnimationFrame(quadro);
    abertura().catch((erro) => console.error('[carta] a abertura da fita falhou', erro));

    return {
      destruir() {
        vivo = false;
        cancelAnimationFrame(quadroId);
        for (const fn of limpezas) {
          try {
            fn();
          } catch {
            /* segue limpando */
          }
        }
        botao.removeEventListener('click', guardar);
        botao.removeEventListener('focus', aoFocar);
        corredor?.destruir();
        corredor = null;
        api.fundo?.classList.remove('poppy-fundo', 'pp-plano');
        raiz.style.removeProperty('--pp-h');
        raiz.classList.remove('poppy', 'aguardando', 'pp-plano', 'pp-chegou', 'guardando');
        raiz.textContent = '';
      },
    };
  },
};
