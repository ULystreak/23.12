// Capítulo 1: o jogo. Uma fita VHS achada numa fábrica de brinquedos.
//
//   export const capitulo = { id, montar(raiz, api) → { destruir() } }
//   api = { conteudo, amb, som, rolagem, fundo, gsap, ScrollTrigger, fechar(), recursos }
//
// Blocos (conteudo.poppy.blocos), em ordem livre:
//   { tipo: 'texto', texto }
//   { tipo: 'imagem', arquivo, alt, legenda }
//   { tipo: 'cena', cena: 'maos' | 'fita' | 'esteira', ... }
//
// Como a cena se arma:
//   api.fundo   ← a fábrica vista pela fita (poppy/fundo.js: um canvas WebGL só)
//   raiz        ← camada do videocassete (poppy/osd.js, presa no alto da rolagem)
//                 + o corpo: título em blocos, cartões, cenas, botão de parar
//   um laço só  ← mede a velocidade da rolagem, alimenta o fundo, o contador e
//                 as cenas que estão na tela (as outras ficam paradas)
//
// A abertura (tela azul → PLAY → a imagem entra → o título cai) começa quando a
// folha termina de desenrolar: o diretor publica a etapa "lendo" em <html>.
//
// Gancho para os testes (não mudar): [data-acao="fechar-capitulo"].

import { clamp, el, espera, svg } from '../nucleo/util.js';
import { criarFundo, aquecerFundo } from './poppy/fundo.js';
import { criarOsd } from './poppy/osd.js';
import { criarTitulo } from './poppy/titulo.js';
import { criarCartao, criarMonitor } from './poppy/cartao.js';
import { criarMaos } from './poppy/maos.js';
import { criarFita } from './poppy/fita.js';
import { criarEsteira } from './poppy/esteira.js';

const CENAS = { maos: criarMaos, fita: criarFita, esteira: criarEsteira };

// Enquanto ela olha a primeira carta parada à sua frente (logo antes deste
// capítulo), o fundo da fita se prepara em momentos ociosos: contexto WebGL, shader, fábrica
// desenhada e textura. Assim o quadro em que o capítulo monta fica leve.
const pararVigia = (() => {
  const html = document.documentElement;
  if (html.classList.contains('sem-webgl') || window.CONTEUDO?.poppy?.fundo) return () => {};
  let espera = 0;
  const conferir = () => {
    if (html.dataset.cena !== 'inicio' || html.dataset.etapa !== 'carta-espera') return false;
    observador.disconnect();
    // depois que a carta pousou
    espera = setTimeout(aquecerFundo, 600);
    return true;
  };
  const observador = new MutationObserver(conferir);
  if (!conferir()) observador.observe(html, { attributes: true, attributeFilter: ['data-etapa', 'data-cena'] });
  return () => { observador.disconnect(); clearTimeout(espera); };
})();

// A tecla do fim é a de tirar a fita do aparelho (ela vai para o bolso): o triângulo sobre a barra.
const ICONE_PARAR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.6c.6 0 1.1.3 1.5.8l6 7.6c.9 1.2.1 2.9-1.5 2.9H6c-1.6 0-2.4-1.7-1.5-2.9l6-7.6c.4-.5.9-.8 1.5-.8z"/><rect x="4" y="17" width="16" height="3.6" rx="1.4"/></svg>';

export const capitulo = {
  id: 'poppy',

  async montar(raiz, api) {
    const { amb, gsap, som, rolagem } = api;
    const c = api.conteudo.poppy || {};
    const blocos = Array.isArray(c.blocos) ? c.blocos : [];
    const rotulos = c.osd && typeof c.osd === 'object' ? c.osd : {};

    pararVigia();
    let vivo = true;
    const limpezas = [];
    const animacoes = new Set();
    /** Guarda cada animação nossa para poder matar só as nossas em destruir(). */
    const anima = (a) => { animacoes.add(a); return a; };

    raiz.classList.add('poppy', 'aguardando');
    api.fundo.classList.add('poppy-fundo');

    // ---- o fundo: a fábrica pela fita ------------------------------------------------
    // Um pedido que nunca responde não segura a folha em branco: as imagens do capítulo
    // têm 7 s, juntas, e a que não chegar fica de fora (sem o fundo, a fábrica desenhada).
    // As dos blocos saem junto com a do fundo: um fundo pendurado não leva as que chegaram.
    const prazo = espera(7000).then(() => null);
    const pedidoImagens = Promise.all(blocos.map((bloco) => (
      bloco?.tipo === 'imagem' ? Promise.race([api.recursos.elementoImagem(bloco.arquivo, bloco.alt || ''), prazo]) : null
    )));
    const imagemFundo = await Promise.race([api.recursos.imagem(c.fundo), prazo]);
    const fundo = criarFundo({ recipiente: api.fundo, amb, imagem: imagemFundo });

    // ---- a camada do videocassete -----------------------------------------------------
    const osd = criarOsd({ rotulos, contadorFinal: c.contadorFinal });
    const corpo = el('div', 'poppy-corpo');
    raiz.append(osd.el, corpo);

    let modoFixo = null;          // 'parar' fica até o fim
    let modoAte = 0;              // um modo passageiro (PLAY) some sozinho
    let agora = 0;
    function piscarModo(nome, ms) {
      if (modoFixo) return;
      osd.modo(nome);
      modoAte = agora + ms / 1000;
    }

    /** Um engasgo de tracking na tela inteira: o fundo e tudo o que está por cima. */
    function falha(forca = 1, ms = 140) {
      if (amb.reduzido || !vivo) return;
      fundo.falha(forca, ms);
      // Só o que está na tela salta de lado (a coluna inteira viraria uma camada
      // enorme). `translate` soma com a rotação que cada peça já tem.
      if (typeof Element.prototype.animate !== 'function') return;
      const dx = 7 + 6 * forca;
      const quadros = [
        { translate: `${-dx}px 0` }, { translate: `${dx * 1.4}px -2px` },
        { translate: `${-dx * 0.5}px 1px` }, { translate: `${dx * 0.7}px 0` }, { translate: '0 0' },
      ];
      for (const filho of corpo.children) {
        const caixa = filho.getBoundingClientRect();
        if (caixa.bottom < topoTela || caixa.top > topoTela + alturaTela) continue;
        try { filho.animate(quadros, { duration: Math.max(60, ms), easing: 'steps(1)' }); } catch { /* sem WAAPI completo */ }
      }
    }

    const ctx = { amb, gsap, som, anima, falha, piscarModo };

    // ---- título -----------------------------------------------------------------------
    const titulo = criarTitulo({ texto: c.titulo, subtitulo: c.subtitulo, amb, gsap, anima, som });
    corpo.append(titulo.el);

    // ---- blocos -----------------------------------------------------------------------
    // As imagens já foram pedidas lá em cima; a que não existir (ou passar do prazo) vira null e some.
    const imagens = await pedidoImagens;
    if (!vivo) return { destruir() {} };

    const entradas = new Map();       // elemento → peça com entrar()
    const cenas = [];                 // cenas ligadas ao laço
    let textos = 0;
    let monitores = 0;
    blocos.forEach((bloco, i) => {
      if (bloco?.tipo === 'texto' && String(bloco.texto || '').trim()) {
        const cartao = criarCartao({ texto: String(bloco.texto).trim(), indice: textos++, amb, gsap, anima });
        corpo.append(cartao.el);
        entradas.set(cartao.el, cartao);
      } else if (bloco?.tipo === 'imagem' && imagens[i]) {
        const monitor = criarMonitor({ img: imagens[i], legenda: bloco.legenda, indice: monitores++, amb, gsap, anima });
        corpo.append(monitor.el);
        entradas.set(monitor.el, monitor);
      } else if (bloco?.tipo === 'cena' && CENAS[bloco.cena]) {
        const cena = CENAS[bloco.cena](bloco, ctx);
        cena.visivel = false;
        corpo.append(cena.el);
        cenas.push(cena);
      }
    });

    // ---- o botão de parar ----------------------------------------------------------------
    const textoFechar = String(c.fechar || '').trim();
    const tecla = el('span', 'poppy-tecla', [
      el('span', 'poppy-tecla-icone', svg(ICONE_PARAR)),
      textoFechar ? el('span', 'poppy-tecla-texto', textoFechar) : null,
    ]);
    const fechar = el('button', {
      class: `poppy-fechar${textoFechar ? '' : ' so-desenho'}`,
      type: 'button',
      dataset: { acao: 'fechar-capitulo' },
      // sem texto, o nome do botão para leitores de tela é o rótulo de parar
      'aria-label': textoFechar ? null : (String(rotulos.parar || '').trim() || null),
    }, tecla);
    // No iPhone, :active só vale com um ouvinte de toque no elemento.
    fechar.addEventListener('touchstart', () => {}, { passive: true });
    const rodape = el('footer', 'poppy-rodape', [
      el('div', 'poppy-painel', [el('i', { class: 'poppy-painel-luz', 'aria-hidden': 'true' }), fechar]),
    ]);
    rodape.classList.add('poppy-entra');
    corpo.append(rodape);
    let rodapeEntrou = false;
    entradas.set(rodape, {
      entrar({ imediato = false } = {}) {
        if (rodapeEntrou) return;
        rodapeEntrou = true;
        rodape.classList.remove('poppy-entra');
        if (imediato) { gsap.set(rodape, { opacity: 1 }); return; }
        if (amb.reduzido) anima(gsap.fromTo(rodape, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'none' }));
        else {
          // enquanto cai, o botão não recebe o toque: um dedo que pousa nele
          // não pode soltar já fora dele (o click iria para o painel)
          rodape.classList.add('chegando');
          gsap.set(rodape, { opacity: 1 });
          anima(gsap.fromTo(rodape, { y: -70, scale: 0.94 }, {
            y: 0, scale: 1, duration: 0.6, ease: 'back.out(2)',
            onComplete: () => rodape.classList.remove('chegando'),
            onInterrupt: () => rodape.classList.remove('chegando'),
          }));
        }
      },
    });

    titulo.preparar();

    // ---- os brinquedos respondem ao dedo ---------------------------------------------------
    // Só um toque de verdade (o dedo andou menos de 8 px): rolar a folha não mexe em nada.
    let dedo = null;
    corpo.addEventListener('pointerdown', (e) => { dedo = { x: e.clientX, y: e.clientY }; });
    corpo.addEventListener('pointerup', (e) => {
      if (!dedo || Math.hypot(e.clientX - dedo.x, e.clientY - dedo.y) >= 8) return;
      dedo = null;
      titulo.tocar(e.target);
      for (const cena of cenas) cena.tocar?.(e.target);
    });

    // ---- medidas ---------------------------------------------------------------------------
    const janela = rolagem.el;
    let alturaTela = janela.clientHeight || innerHeight;
    let topoTela = 0;
    // Os textos que o OSD não pode cobrir: posição no conteúdo da rolagem (sem
    // contar transformações de entrada) e a faixa da tela onde o OSD escreve.
    let leiturasPos = [];
    let zonasOsd = { modo: null, contador: null };
    const encoberto = { modo: false, contador: false };
    function medirLeituras() {
      const caixaJanela = janela.getBoundingClientRect();
      const caixaCorpo = corpo.getBoundingClientRect();
      const topoCorpo = caixaCorpo.top - caixaJanela.top + janela.scrollTop;
      const esqCorpo = caixaCorpo.left - caixaJanela.left;
      // o vidro tem respiro em volta do texto: o OSD pode passar pela borda
      const folga = 14;
      leiturasPos = [...corpo.querySelectorAll('.poppy-cartao, .poppy-monitor-legenda, .poppy-subtitulo, .poppy-painel')].map((no) => {
        let topo = 0;
        let esq = 0;
        for (let n = no; n && n !== corpo; n = n.offsetParent) { topo += n.offsetTop; esq += n.offsetLeft; }
        return {
          topo: topoCorpo + topo + folga,
          base: topoCorpo + topo + no.offsetHeight - folga,
          esq: esqCorpo + esq + folga,
          dir: esqCorpo + esq + no.offsetWidth - folga,
        };
      });
      zonasOsd = osd.zonas();
    }
    function vigiarOsd(y) {
      for (const parte of ['modo', 'contador']) {
        const z = zonasOsd[parte];
        if (!z) continue;
        if (modoFixo) {
          // o STOP final é o momento do aparelho: fica por cima de tudo
          if (encoberto[parte]) { encoberto[parte] = false; osd.encobrir(parte, false); }
          continue;
        }
        const topo = y + z.topo;
        const base = y + z.base;
        let cobre = false;
        for (const l of leiturasPos) {
          if (l.base > topo && l.topo < base && l.dir > z.esq && l.esq < z.dir) { cobre = true; break; }
        }
        if (cobre !== encoberto[parte]) {
          encoberto[parte] = cobre;
          osd.encobrir(parte, cobre);
        }
      }
    }

    function medir() {
      alturaTela = janela.clientHeight || innerHeight;
      topoTela = janela.getBoundingClientRect().top;
      osd.medir(alturaTela);
      for (const cena of cenas) cena.medir?.();
      medirLeituras();
    }
    medir();
    if ('ResizeObserver' in window) {
      const observador = new ResizeObserver(medir);
      observador.observe(janela);
      observador.observe(corpo);
      limpezas.push(() => observador.disconnect());
    }

    // ---- o que entra e o que está na tela ---------------------------------------------------
    let observaEntradas = null;
    let observaCenas = null;
    if ('IntersectionObserver' in window) {
      observaEntradas = new IntersectionObserver((lista) => {
        for (const item of lista) {
          if (!item.isIntersecting) continue;
          observaEntradas.unobserve(item.target);
          entradas.get(item.target)?.entrar();
        }
      }, { root: janela, rootMargin: '0px 0px -7% 0px', threshold: 0.06 });
      observaCenas = new IntersectionObserver((lista) => {
        for (const item of lista) {
          const cena = cenas.find((s) => s.el === item.target);
          if (cena) cena.visivel = item.isIntersecting;
        }
      }, { root: janela, rootMargin: '12% 0px 12% 0px', threshold: 0 });
      for (const cena of cenas) observaCenas.observe(cena.el);
      limpezas.push(() => { observaEntradas.disconnect(); observaCenas.disconnect(); });
    } else {
      for (const cena of cenas) cena.visivel = true;
    }
    // O Tab ou o VoiceOver chegou num bloco antes da rolagem: ele aparece na
    // hora e parado (um botão que cai debaixo do dedo perderia o toque).
    const aoFocar = (evento) => {
      for (const [alvo, peca] of entradas) {
        if (!alvo.contains(evento.target)) continue;
        observaEntradas?.unobserve(alvo);
        peca.entrar({ imediato: true });
        return;
      }
    };
    corpo.addEventListener('focusin', aoFocar);
    limpezas.push(() => corpo.removeEventListener('focusin', aoFocar));

    let entradasLigadas = false;
    function ligarEntradas() {
      if (entradasLigadas) return;
      entradasLigadas = true;
      for (const [alvo, peca] of entradas) {
        if (observaEntradas) observaEntradas.observe(alvo);
        else peca.entrar();
      }
    }

    // ---- o laço ----------------------------------------------------------------------------
    let quadroId = 0;
    let anterior = 0;
    let yAnterior = rolagem.y;
    let vel = 0;                 // px/s, suavizada
    let pressa = 0;              // há quanto tempo ela rola depressa
    let parado = false;          // depois de desligar a TV nada mais se mexe

    function quadro(instante) {
      quadroId = requestAnimationFrame(quadro);
      const passou = anterior ? (instante - anterior) / 1000 : 0.016;
      const dt = Math.min(0.05, passou);
      anterior = instante;
      if (parado || !(dt > 0)) return;
      // O relógio dos rótulos anda no tempo de verdade: num aparelho que perde
      // quadros o PLAY não pode ficar parado na tela (dt é limitado para a física).
      agora += Math.min(0.5, passou);

      const y = rolagem.y;
      // velocidade pelo tempo que passou de verdade: com quadros lentos o dt
      // limitado inventaria uma rolagem rápida (e a fita viraria só chuvisco)
      const bruta = (y - yAnterior) / Math.max(dt, Math.min(0.25, passou));
      yAnterior = y;
      vel += (bruta - vel) * Math.min(1, dt * 11);
      const rapidez = clamp(Math.abs(vel) / 2600);
      const sentido = vel >= 0 ? 1 : -1;
      const progresso = rolagem.progresso;

      fundo.rolar(progresso, rapidez, sentido);
      fundo.quadro(dt);
      osd.contador(progresso);
      vigiarOsd(y);

      // avanço e retrocesso de fita: só quando ela rola depressa de verdade
      if (!modoFixo) {
        if (rapidez > 0.42) pressa += dt;
        else pressa = Math.max(0, pressa - dt * 3);
        if (pressa > 0.1 && rapidez > 0.3) {
          osd.modo(sentido > 0 ? 'avancar' : 'voltar');
          modoAte = agora + 0.42;
        } else if (osd.modoAtual && agora > modoAte) {
          osd.modo(null);
        }
      }

      const info = { y, vel, rapidez, topo: topoTela, altura: alturaTela };
      for (const cena of cenas) if (cena.visivel) cena.quadro(dt, info);
    }
    quadroId = requestAnimationFrame(quadro);
    limpezas.push(() => cancelAnimationFrame(quadroId));

    // ---- a abertura --------------------------------------------------------------------------
    // Espera a folha terminar de desenrolar (etapa "lendo"); se o aviso não vier, começa assim mesmo.
    function folhaAberta() {
      const html = document.documentElement;
      return new Promise((ok) => {
        if (html.dataset.etapa === 'lendo') { ok(); return; }
        const observador = new MutationObserver(() => {
          if (html.dataset.etapa !== 'lendo') return;
          observador.disconnect();
          ok();
        });
        observador.observe(html, { attributes: true, attributeFilter: ['data-etapa'] });
        limpezas.push(() => observador.disconnect());
      });
    }

    // Se ela rolar antes da abertura acabar, o que já está na tela não fica esperando.
    const cancelarRolagem = rolagem.aoRolar((p, y) => { if (y > 24) ligarEntradas(); });
    limpezas.push(cancelarRolagem);

    async function abertura() {
      await Promise.race([folhaAberta(), espera(4200)]);
      if (!vivo) return;
      await espera(280);
      if (!vivo || modoFixo) return;
      som.efeito('fita');
      piscarModo('tocar', 3600);
      await espera(560);
      if (!vivo) return;

      // a imagem entra: um engasgo de tracking e o azul dá lugar à fábrica
      if (amb.reduzido) {
        const mistura = { v: 1 };
        anima(gsap.to(mistura, { v: 0, duration: 0.7, ease: 'none', onUpdate: () => fundo.azul(mistura.v) }));
        await espera(500);
      } else {
        fundo.clarao(45);
        falha(1, 220);
        await espera(70);
        fundo.azul(0);
        await espera(300);
      }
      if (!vivo) return;
      raiz.classList.remove('aguardando');

      const queda = titulo.cair();
      await Promise.race([queda, espera(1700)]);
      if (!vivo) return;
      await titulo.digitar();
      if (!vivo) return;
      osd.mostrarContador();
      ligarEntradas();
    }
    abertura().catch((erro) => console.error(erro));

    // ---- desligar ------------------------------------------------------------------------------
    const travarToque = (evento) => { if (evento.cancelable) evento.preventDefault(); };

    async function desligar() {
      modoFixo = 'parar';
      osd.modo('parar');
      osd.mostrarContador();
      som.efeito('fita');
      fechar.disabled = true;
      fechar.classList.add('apertada');
      rodape.classList.add('desligado');
      // a tela azul não pode sobrar por baixo se ela apertou parar antes da imagem entrar
      raiz.classList.remove('aguardando');

      // enquanto a imagem fecha, a rolagem fica presa onde está
      janela.addEventListener('wheel', travarToque, { passive: false });
      janela.addEventListener('touchmove', travarToque, { passive: false });
      limpezas.push(() => {
        janela.removeEventListener('wheel', travarToque);
        janela.removeEventListener('touchmove', travarToque);
      });

      if (amb.reduzido) {
        await espera(450);
        if (!vivo) return;
        await new Promise((ok) => {
          anima(gsap.to([raiz, fundo.el], { autoAlpha: 0, duration: 0.7, ease: 'none', onComplete: ok }));
        });
      } else {
        // Recorta e prepara o tubo já agora, com a rolagem presa: a nova pintura do
        // capítulo cai durante o engasgo, onde um quadro mais lento não aparece,
        // e não no primeiro instante do colapso. A inércia da rolagem para aqui.
        try { rolagem.irPara(rolagem.y, { imediato: true }); } catch { /* sem rolagem suave */ }
        const centroY = rolagem.y + alturaTela / 2;
        const corteBaixo = Math.max(0, raiz.offsetHeight - rolagem.y - alturaTela);
        gsap.set(raiz, {
          transformOrigin: `50% ${centroY}px`,
          clipPath: `inset(${rolagem.y}px 0px ${corteBaixo}px 0px)`,
          webkitClipPath: `inset(${rolagem.y}px 0px ${corteBaixo}px 0px)`,
          willChange: 'transform',
        });
        gsap.set(fundo.el, { transformOrigin: '50% 50%', willChange: 'transform' });
        const ponto = el('i', { class: 'poppy-fosforo', 'aria-hidden': 'true' });
        const brasa = el('i', { class: 'poppy-fosforo-ponto', 'aria-hidden': 'true' });
        api.fundo.append(ponto, brasa);
        limpezas.push(() => { ponto.remove(); brasa.remove(); });

        falha(0.7, 130);
        await espera(520);
        if (!vivo) return;
        parado = true;
        // tubo que desliga: a imagem inteira colapsa numa linha, a linha num ponto, o ponto apaga
        gsap.set(ponto, { scaleX: 1, scaleY: 0.2, autoAlpha: 0 });
        gsap.set(brasa, { autoAlpha: 0, scale: 0.5 });
        await new Promise((ok) => {
          const tl = anima(gsap.timeline({ onComplete: ok }));
          tl.to(osd.clarao, { opacity: 0.5, duration: 0.07, ease: 'none' }, 0);
          tl.to([raiz, fundo.el], { scaleY: 0.004, duration: 0.24, ease: 'power3.in' }, 0.02);
          tl.to(ponto, { autoAlpha: 1, scaleY: 1, duration: 0.1, ease: 'none' }, 0.16);
          tl.set([raiz, fundo.el], { autoAlpha: 0 }, 0.27);
          tl.add(() => api.fundo.classList.add('desligada'), 0.27);
          // a linha encolhe para o meio e vira um ponto de fósforo que demora a apagar
          tl.to(ponto, { scaleX: 0.012, duration: 0.2, ease: 'power2.in' }, 0.32);
          tl.to(brasa, { autoAlpha: 1, scale: 1, duration: 0.06, ease: 'none' }, 0.47);
          tl.set(ponto, { autoAlpha: 0 }, 0.53);
          tl.to(brasa, { scale: 0.25, duration: 0.7, ease: 'power2.in' }, 0.62);
          tl.to(brasa, { autoAlpha: 0, duration: 0.6, ease: 'power1.in' }, 0.72);
        });
      }
      if (!vivo) return;
      await espera(140);
      if (vivo) api.fechar();
    }

    fechar.addEventListener('click', () => { desligar().catch((erro) => { console.error(erro); api.fechar(); }); }, { once: true });

    return {
      destruir() {
        vivo = false;
        for (const limpar of limpezas) {
          try { limpar(); } catch (erro) { console.error(erro); }
        }
        for (const a of animacoes) a.kill();
        animacoes.clear();
        for (const cena of cenas) cena.destruir?.();
        titulo.destruir();
        fundo.destruir();
        gsap.set(raiz, { clearProps: 'all' });
        raiz.classList.remove('poppy', 'aguardando');
        api.fundo.classList.remove('poppy-fundo', 'desligada');
        raiz.textContent = '';
      },
    };
  },
};
