/* ============================================================================
   CAPÍTULO 1: O JOGO (uma fita VHS achada numa fábrica de brinquedos)
   ============================================================================
   Exporta `capitulo = { id: 'poppy', montar(raiz, api) }`. Dentro da folha que
   o pergaminho desenrola, monta a camada do videocassete (osd.js), o corpo
   (título em blocos, cartões de texto, monitores de imagem, as três cenas e a
   tecla de parar) e um laço de quadro só, que alimenta o fundo, o contador do
   OSD e só as cenas que estão na tela.
   Fluxo: o fundo é aquecido com a primeira carta parada; montagem; abertura
   (tela de espera, PLAY, engasgo, logo e título caem, subtítulo digitado);
   os blocos entram conforme a rolagem; STOP desliga a TV e chama api.fechar().
   api = { conteudo, amb, som, rolagem, fundo, gsap, recursos, fechar(), aberto }.
   ========================================================================== */

import { carregarImagem, clamp, el, espera, svg } from '../nucleo/util.js';
import { comoPromise } from '../nucleo/movimento.js';
import { criarFundo, aquecerFundo } from './poppy/fundo.js';
import { criarOsd } from './poppy/osd.js';
import { criarTitulo } from './poppy/titulo.js';
import { criarCartao, criarMonitor } from './poppy/cartao.js';
import { criarMaos } from './poppy/maos.js';
import { criarFita } from './poppy/fita.js';
import { criarEsteira } from './poppy/esteira.js';

const CENAS = { maos: criarMaos, fita: criarFita, esteira: criarEsteira };

// A tecla de ejetar do videocassete: um triângulo sobre uma barra.
const ICONE_PARAR = `<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path class="cheio" d="M12 3.6l8.4 10.2H3.6z"/>
  <rect class="cheio" x="4" y="17" width="16" height="3.6" rx="1.4"/>
</svg>`;

const PRAZO_IMAGENS = 7000; // um pedido que nunca responde não segura a folha em branco
const AQUECER_DEPOIS = 600;
const TOQUE_MAX = 8; // px entre o pointerdown e o pointerup de um toque de verdade
const FOLGA_LEITURA = 14; // o OSD pode passar pela borda do vidro

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

// O logo já fica no cache quando a montagem acontecer.
carregarImagem(texto(window.CONTEUDO?.poppy?.logo));

// Com a primeira carta parada à frente dela, aquece o fundo (contexto WebGL,
// programa e fábrica) em passos ociosos: o quadro em que o capítulo monta fica
// leve. Com imagem do autor, ou sem WebGL, a fábrica desenhada não é usada.
const pararVigia = (() => {
  const html = document.documentElement;
  if (html.classList.contains('sem-webgl') || texto(window.CONTEUDO?.poppy?.fundo)) return () => {};
  let timer = 0;
  const observador = new MutationObserver(conferir);
  function conferir() {
    if (html.dataset.cena === 'inicio' && html.dataset.etapa === 'carta-espera') {
      observador.disconnect();
      timer = setTimeout(aquecerFundo, AQUECER_DEPOIS);
    }
  }
  observador.observe(html, { attributes: true, attributeFilter: ['data-cena', 'data-etapa'] });
  conferir();
  return () => {
    observador.disconnect();
    clearTimeout(timer);
  };
})();

export const capitulo = {
  id: 'poppy',

  async montar(raiz, api) {
    // Sem isto o aquecimento pendente poderia disparar depois da montagem.
    pararVigia();
    const { conteudo, amb = {}, som, rolagem, gsap, recursos } = api;
    const c = conteudo?.poppy || {};
    const rotulos = c.osd && typeof c.osd === 'object' ? c.osd : {};
    let vivo = true;
    const limpezas = [];
    const animacoes = new Set();
    const falhas = new Set();

    // Guarda cada animação para destruir() matar só as deste capítulo.
    const anima = (a) => {
      if (!a) return a;
      if (animacoes.size > 80) {
        for (const x of animacoes) if (!x.isActive?.() && x.progress?.() === 1) animacoes.delete(x);
      }
      animacoes.add(a);
      return a;
    };

    raiz.classList.add('poppy', 'aguardando');
    api.fundo?.classList.add('poppy-fundo');

    /* ---- pedidos, todos com o mesmo prazo ---------------------------------- */
    // As imagens dos blocos correm junto com o fundo: um fundo pendurado não leva as que chegaram.
    const prazo = espera(PRAZO_IMAGENS).then(() => null);
    const comPrazo = (pedido) => Promise.race([Promise.resolve(pedido).catch(() => null), prazo]);
    const blocos = Array.isArray(c.blocos) ? c.blocos : [];
    const pedidosImagem = blocos.map((b) => (b?.tipo === 'imagem' && texto(b.arquivo)
      ? comPrazo(recursos?.elementoImagem?.(texto(b.arquivo), texto(b.alt)))
      : null));
    const pedidoLogo = texto(c.logo) ? comPrazo(recursos?.elementoImagem?.(texto(c.logo), texto(c.logoAlt))) : null;
    const pedidoFundo = texto(c.fundo) ? comPrazo(recursos?.imagem?.(texto(c.fundo))) : null;

    // Sem a imagem do autor (ou se ela não chegou), o fundo desenha a fábrica.
    const fundo = criarFundo({ recipiente: api.fundo, amb, imagem: (await pedidoFundo) || null });
    const osd = criarOsd({ rotulos, contadorFinal: c.contadorFinal });
    const corpo = el('div', 'poppy-corpo');
    raiz.append(osd.el, corpo);

    /* ---- tempo real do OSD e as duas ferramentas que as cenas recebem ------- */
    let agora = 0;
    let modoAte = 0;
    let modoFixo = null;
    let zonas = null; // as caixas do modo e do contador (osd.zonas), lidas em medir()

    function piscarModo(nome, ms) {
      if (modoFixo || !vivo) return;
      if (osd.modoAtual !== nome) {
        osd.modo(nome);
        // O rótulo novo muda a caixa do modo; o modo acabou de forçar o layout, ler agora é barato.
        if (zonas) zonas = osd.zonas();
      }
      modoAte = agora + ms / 1000;
    }

    let topoTela = 0;
    let alturaTela = innerHeight;

    // O engasgo da fita: o fundo tropeça e o que está na tela pula em degraus.
    function falha(forca = 1, ms = 140) {
      if (amb.reduzido || !vivo) return;
      fundo.falha(forca, ms);
      if (typeof Element.prototype.animate !== 'function') return;
      const dx = 7 + 6 * forca;
      const quadros = [
        { translate: `${-dx}px 0px` },
        { translate: `${1.4 * dx}px -2px` },
        { translate: `${-0.5 * dx}px 1px` },
        { translate: `${0.7 * dx}px 0px` },
        { translate: '0px 0px' },
      ];
      for (const filho of corpo.children) {
        const r = filho.getBoundingClientRect();
        if (r.bottom <= topoTela || r.top >= topoTela + alturaTela) continue;
        const a = filho.animate(quadros, { duration: Math.max(60, ms), easing: 'steps(1)' });
        falhas.add(a);
        a.onfinish = () => falhas.delete(a);
      }
    }

    /* ---- título e blocos, na ordem do content.js -------------------------- */
    const logo = await pedidoLogo;
    const titulo = criarTitulo({ texto: c.titulo, subtitulo: c.subtitulo, logo, amb, gsap, anima, som });
    corpo.append(titulo.el);

    const imagens = await Promise.all(pedidosImagem);
    const entradas = [];
    const cenas = [];
    const ctxCena = { amb, gsap, som, anima, falha, piscarModo };
    let nTexto = 0;
    let nMonitor = 0;
    blocos.forEach((b, i) => {
      if (b?.tipo === 'texto' && texto(b.texto)) {
        const cartao = criarCartao({ texto: b.texto, indice: nTexto++, amb, gsap, anima });
        corpo.append(cartao.el);
        entradas.push(cartao);
      } else if (b?.tipo === 'imagem' && imagens[i]) {
        const monitor = criarMonitor({ img: imagens[i], legenda: b.legenda, indice: nMonitor++, amb, gsap, anima });
        corpo.append(monitor.el);
        entradas.push(monitor);
      } else if (b?.tipo === 'cena' && Object.hasOwn(CENAS, b.cena)) {
        const cena = CENAS[b.cena](b, ctxCena);
        cena.visivel = false;
        corpo.append(cena.el);
        cenas.push(cena);
      }
    });

    /* ---- a tecla STOP --------------------------------------------------------- */
    const textoFechar = texto(c.fechar);
    const tecla = el('span', 'poppy-tecla', [
      el('span', 'poppy-tecla-icone', svg(ICONE_PARAR)),
      textoFechar ? el('span', { class: 'poppy-tecla-texto', texto: textoFechar }) : null,
    ]);
    const botao = el('button', {
      type: 'button',
      class: textoFechar ? 'poppy-fechar' : 'poppy-fechar so-desenho',
      'data-acao': 'fechar-capitulo',
      'aria-label': textoFechar ? null : texto(rotulos.parar) || 'Parar a fita',
    }, tecla);
    // Sem um touchstart, o :active não acende no iPhone.
    botao.addEventListener('touchstart', () => {}, { passive: true });
    const luz = el('i', { class: 'poppy-painel-luz', 'aria-hidden': 'true' });
    const rodape = el('footer', 'poppy-rodape poppy-entra', el('div', 'poppy-painel', [luz, botao]));
    corpo.append(rodape);

    let rodapeEntrou = false;
    entradas.push({
      el: rodape,
      entrar({ imediato = false } = {}) {
        if (rodapeEntrou) return;
        rodapeEntrou = true;
        rodape.classList.remove('poppy-entra');
        if (imediato) return;
        if (amb.reduzido) {
          anima(gsap.fromTo(rodape, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'none' }));
          return;
        }
        // Um dedo que pousa na tecla enquanto ela cai não pode soltar fora dela.
        rodape.classList.add('chegando');
        const chegou = () => rodape.classList.remove('chegando');
        anima(gsap.fromTo(rodape, { y: -70, scale: 0.94 }, {
          y: 0, scale: 1, duration: 0.6, ease: 'back.out(2)', onComplete: chegou, onInterrupt: chegou,
        }));
      },
    });

    /* ---- toque: só um toque de verdade, rolar a folha não toca em nada ------- */
    titulo.preparar();
    let toque = null;
    const aoPousar = (e) => { toque = { x: e.clientX, y: e.clientY, alvo: e.target }; };
    const aoSoltar = (e) => {
      const t = toque;
      toque = null;
      if (!t || !vivo || Math.hypot(e.clientX - t.x, e.clientY - t.y) >= TOQUE_MAX) return;
      if (!(t.alvo instanceof Element)) return;
      titulo.tocar(t.alvo);
      for (const cena of cenas) cena.tocar?.(t.alvo);
    };
    const aoCancelar = () => { toque = null; };
    corpo.addEventListener('pointerdown', aoPousar, { passive: true });
    corpo.addEventListener('pointerup', aoSoltar, { passive: true });
    corpo.addEventListener('pointercancel', aoCancelar, { passive: true });

    /* ---- medidas -------------------------------------------------------------- */
    const janela = rolagem?.el || raiz.parentElement || raiz;
    let leituras = [];
    let raizTopo = 0;

    // Os textos que ela precisa ler, em coordenadas do conteúdo (y) e da raiz (x).
    function medirLeituras() {
      const rj = janela.getBoundingClientRect();
      const rr = raiz.getBoundingClientRect();
      const sy = janela.scrollTop || 0;
      raizTopo = rr.top - rj.top + sy;
      leituras = [...corpo.querySelectorAll('.poppy-cartao, .poppy-monitor-legenda, .poppy-subtitulo, .poppy-painel')].map((n) => {
        const r = n.getBoundingClientRect();
        return { topo: r.top - rj.top + sy, base: r.bottom - rj.top + sy, esq: r.left - rr.left, dir: r.right - rr.left };
      });
    }

    function medir() {
      if (!vivo) return;
      alturaTela = janela.clientHeight || innerHeight;
      topoTela = janela.getBoundingClientRect().top;
      osd.medir(alturaTela);
      for (const cena of cenas) cena.medir?.();
      medirLeituras();
      zonas = osd.zonas();
    }

    // O videocassete apaga o modo ou o contador enquanto um texto passa por baixo.
    function vigiarOsd(y) {
      if (modoFixo || !zonas) return; // STOP fica sempre por cima
      const telaTopo = Math.max(y, raizTopo);
      const sob = (z) => !!z && leituras.some((l) => l.base > telaTopo + z.topo - FOLGA_LEITURA
        && l.topo < telaTopo + z.base + FOLGA_LEITURA
        && l.dir > z.esq - FOLGA_LEITURA
        && l.esq < z.dir + FOLGA_LEITURA);
      osd.encobrir('modo', sob(zonas.modo));
      osd.encobrir('contador', sob(zonas.contador));
    }

    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => medir());
      ro.observe(janela);
      ro.observe(corpo);
      limpezas.push(() => ro.disconnect());
    }

    /* ---- entradas -------------------------------------------------------------- */
    let entradasLigadas = false;

    function ligarEntradas() {
      if (entradasLigadas || !vivo) return;
      entradasLigadas = true;
      if (typeof IntersectionObserver !== 'function') {
        for (const e of entradas) e.entrar();
        for (const cena of cenas) cena.visivel = true;
        return;
      }
      const porElemento = new Map(entradas.map((e) => [e.el, e]));
      const ioEntradas = new IntersectionObserver((lista) => {
        for (const item of lista) {
          if (!item.isIntersecting) continue;
          ioEntradas.unobserve(item.target);
          porElemento.get(item.target)?.entrar();
        }
      }, { root: janela, rootMargin: '0px 0px -7% 0px', threshold: 0.06 });
      for (const e of entradas) ioEntradas.observe(e.el);

      const porCena = new Map(cenas.map((cena) => [cena.el, cena]));
      const ioCenas = new IntersectionObserver((lista) => {
        for (const item of lista) {
          const cena = porCena.get(item.target);
          if (cena) cena.visivel = item.isIntersecting;
        }
      }, { root: janela, rootMargin: '12% 0px 12% 0px', threshold: 0 });
      for (const cena of cenas) ioCenas.observe(cena.el);
      limpezas.push(() => ioEntradas.disconnect(), () => ioCenas.disconnect());
    }

    // O foco do teclado chega antes da rolagem: o bloco entra na hora.
    const aoFocar = (e) => entradas.find((x) => x.el.contains(e.target))?.entrar({ imediato: true });
    corpo.addEventListener('focusin', aoFocar);

    /* ---- o laço ----------------------------------------------------------------- */
    let quadroId = 0;
    let anterior = 0;
    let yAnterior = null;
    let vel = 0;
    let pressa = 0;
    let parado = false;

    function quadro(instante) {
      quadroId = requestAnimationFrame(quadro);
      if (parado || !vivo) return;
      const passou = anterior ? Math.max(0, (instante - anterior) / 1000) : 0;
      anterior = instante;
      const dt = Math.min(0.05, passou);
      // Relógio de tempo real com teto: num aparelho que perde quadros o PLAY não pode ficar parado.
      agora += Math.min(0.5, passou);

      const y = rolagem?.y || 0;
      const progresso = clamp(rolagem?.progresso || 0);
      if (yAnterior === null) yAnterior = y;
      const bruta = passou > 0 ? (y - yAnterior) / Math.max(dt, Math.min(0.25, passou)) : 0;
      yAnterior = y;
      vel += (bruta - vel) * Math.min(1, dt * 11);
      const rapidez = clamp(Math.abs(vel) / 2600);
      const sentido = vel < 0 ? -1 : 1;

      fundo.rolar(progresso, rapidez, sentido);
      fundo.quadro(dt);
      osd.contador(progresso);
      if (!entradasLigadas && y > 24) ligarEntradas();

      // Rolando depressa, o videocassete avança (FF) ou volta (REW).
      if (rapidez > 0.42) pressa += dt;
      else pressa = Math.max(0, pressa - 3 * dt);
      if (pressa > 0.1 && rapidez > 0.3) piscarModo(sentido > 0 ? 'avancar' : 'voltar', 420);
      if (modoAte && agora >= modoAte && !modoFixo) {
        modoAte = 0;
        osd.modo(null);
      }
      vigiarOsd(y);

      const info = { y, vel, rapidez, topo: topoTela, altura: alturaTela };
      for (const cena of cenas) if (cena.visivel) cena.quadro(dt, info);
    }

    /* ---- a abertura -------------------------------------------------------------- */
    let desligando = false;
    const segue = () => vivo && !desligando;

    // A folha desenrolou: a promessa do pergaminho ou, sem ela, a etapa 'lendo' do diretor.
    function folhaAberta() {
      if (api.aberto) return api.aberto;
      const html = document.documentElement;
      if (html.dataset.etapa === 'lendo') return Promise.resolve(true);
      return new Promise((resolve) => {
        const observador = new MutationObserver(() => {
          if (html.dataset.etapa !== 'lendo') return;
          observador.disconnect();
          resolve(true);
        });
        observador.observe(html, { attributes: true, attributeFilter: ['data-etapa'] });
        limpezas.push(() => observador.disconnect());
      });
    }

    // A ordem e os tempos são uma sequência: mexer num espera desloca o PLAY, o
    // clarão, a queda e a digitação.
    async function abertura() {
      await Promise.race([folhaAberta(), espera(4200)]);
      await espera(280);
      if (!segue()) return;
      som?.efeito?.('fita');
      piscarModo('tocar', 3600);
      await espera(560);
      if (!segue()) return;
      if (amb.reduzido) {
        const mistura = { v: 1 };
        await comoPromise(anima(gsap.to(mistura, { v: 0, duration: 0.7, ease: 'none', onUpdate: () => fundo.azul(mistura.v) })));
        await espera(500);
      } else {
        fundo.clarao(45);
        falha(1, 220);
        await espera(70);
        fundo.azul(0);
        await espera(300);
      }
      if (!segue()) return;
      // Só agora: antes do engasgo o corpo apareceria sobre a tela de espera.
      raiz.classList.remove('aguardando');
      // A digitação começa mesmo que a queda ainda não tenha acabado.
      await Promise.race([titulo.cair(), espera(logo ? 2000 : 1700)]);
      if (!segue()) return;
      await titulo.digitar();
      if (!segue()) return;
      osd.mostrarContador();
      ligarEntradas();
    }

    /* ---- desligar a TV ------------------------------------------------------------ */
    let fosforo = null;
    let brasa = null;

    async function desligar() {
      if (desligando || !vivo) return;
      desligando = true;
      modoFixo = 'parar';
      osd.modo('parar');
      osd.mostrarContador();
      osd.encobrir('modo', false);
      osd.encobrir('contador', false);
      som?.efeito?.('fita');
      botao.disabled = true;
      botao.classList.add('apertada');
      rodape.classList.add('desligado');
      raiz.classList.remove('aguardando');
      const travarToque = (e) => e.preventDefault();
      janela.addEventListener('wheel', travarToque, { passive: false });
      janela.addEventListener('touchmove', travarToque, { passive: false });
      limpezas.push(() => {
        janela.removeEventListener('wheel', travarToque);
        janela.removeEventListener('touchmove', travarToque);
      });

      if (amb.reduzido) {
        await espera(450);
        if (!vivo) return;
        await comoPromise(anima(gsap.to([raiz, fundo.el], { autoAlpha: 0, duration: 0.7, ease: 'none' })));
        parado = true;
      } else {
        // A inércia da rolagem para antes; o recorte e o colapso usam a janela de agora.
        const y = rolagem?.y || 0;
        rolagem?.irPara?.(y, { imediato: true });
        // A janela medida na própria raiz (a raiz pode não começar no topo do conteúdo).
        const visto = Math.max(0, janela.getBoundingClientRect().top - raiz.getBoundingClientRect().top);
        const corteBaixo = Math.max(0, raiz.offsetHeight - visto - alturaTela);
        const recorte = `inset(${visto}px 0px ${corteBaixo}px 0px)`;
        raiz.style.clipPath = recorte;
        raiz.style.webkitClipPath = recorte;
        gsap.set(raiz, { transformOrigin: `50% ${visto + alturaTela / 2}px` });
        gsap.set(fundo.el, { transformOrigin: '50% 50%' });
        fosforo = el('i', { class: 'poppy-fosforo', 'aria-hidden': 'true' });
        brasa = el('i', { class: 'poppy-fosforo-ponto', 'aria-hidden': 'true' });
        api.fundo?.append(fosforo, brasa);
        falha(0.7, 130);
        await espera(520);
        if (!vivo) return;
        parado = true;
        // O tubo desliga: a imagem colapsa numa linha, a linha vira um ponto e a brasa esfria.
        const tl = anima(gsap.timeline());
        tl.to(osd.clarao, { opacity: 0.5, duration: 0.07 }, 0)
          .to([raiz, fundo.el], { scaleY: 0.004, duration: 0.24, ease: 'power3.in' }, 0.02)
          .fromTo(fosforo, { autoAlpha: 0, scaleY: 0.3 }, { autoAlpha: 1, scaleY: 1, duration: 0.1 }, 0.16)
          .set([raiz, fundo.el], { autoAlpha: 0 }, 0.27)
          .add(() => api.fundo?.classList.add('desligada'), 0.27)
          .to(fosforo, { scaleX: 0.012, duration: 0.2, ease: 'power2.in' }, 0.32)
          .fromTo(brasa, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.06 }, 0.47)
          .to(fosforo, { autoAlpha: 0, duration: 0.06 }, 0.53)
          .to(brasa, { scale: 0.25, duration: 0.7, ease: 'power2.in' }, 0.62)
          .to(brasa, { autoAlpha: 0, duration: 0.6, ease: 'power1.in' }, 0.72);
        await comoPromise(tl);
      }
      await espera(140);
      if (vivo) api.fechar?.();
    }
    botao.addEventListener('click', desligar);

    /* ---- começa ------------------------------------------------------------------- */
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
        corpo.removeEventListener('pointerdown', aoPousar);
        corpo.removeEventListener('pointerup', aoSoltar);
        corpo.removeEventListener('pointercancel', aoCancelar);
        corpo.removeEventListener('focusin', aoFocar);
        for (const a of animacoes) a.kill?.();
        animacoes.clear();
        for (const a of falhas) a.cancel();
        falhas.clear();
        for (const cena of cenas) cena.destruir?.();
        titulo.destruir();
        fundo.destruir();
        fosforo?.remove();
        brasa?.remove();
        api.fundo?.classList.remove('poppy-fundo', 'desligada');
        raiz.style.removeProperty('clip-path');
        raiz.style.removeProperty('-webkit-clip-path');
        gsap.set(raiz, { clearProps: 'transform,transformOrigin,opacity,visibility' });
        raiz.classList.remove('poppy', 'aguardando');
        raiz.textContent = '';
      },
    };
  },
};
