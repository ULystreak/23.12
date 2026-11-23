/* ============================================================================
   POPPY / TÍTULO: uma pilha de blocos de brinquedo
   ============================================================================
   Uma letra por bloco (o espaço entre palavras é um vão; a pontuação vira um
   bloco estreito creme), o subtítulo digitado com letra de videocassete e, no
   alto, o logo (poppy.logo) colado como um adesivo torto.
   preparar() monta a pilha com o cabeçalho já no documento; cair() assenta o
   adesivo e derruba as fileiras de baixo para cima; digitar() escreve o
   subtítulo; tocar(alvo) faz o bloco ou o adesivo pular.
   ========================================================================== */

import { el, semente } from '../../nucleo/util.js';
import { curvas, comoPromise } from '../../nucleo/movimento.js';

const CORES = ['vermelho', 'amarelo', 'azul', 'verde', 'creme']; // creme é só da pontuação
const VAO = 0.42; // vão entre palavras, em blocos
const ESTREITO = 0.5; // pontuação, em blocos
const FOLGA = 3; // px entre blocos
const GIRO_LOGO = -3;
const VEZ_DO_LOGO = 0.3; // os blocos esperam o adesivo assentar
const MEIO_PISCAR = 530;
const MAX_FILEIRAS = 4;

const segmentador = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }) : null;

function grafemas(texto) {
  return segmentador ? Array.from(segmentador.segment(texto), (s) => s.segment) : Array.from(texto);
}

function ehLetra(g) {
  return /[\p{L}\p{N}]/u.test(g);
}

export function criarTitulo({ texto = '', subtitulo = '', logo = null, amb, gsap, anima, som } = {}) {
  const reduzido = !!amb?.reduzido;
  const inteiro = String(texto ?? '').replace(/\s+/g, ' ').trim();
  const palavras = inteiro ? inteiro.split(' ').map(grafemas) : [];
  const sub = String(subtitulo ?? '').replace(/\s+/g, ' ').trim();
  const letras = grafemas(sub);

  const cabeca = el('header', logo ? 'poppy-cabeca com-logo' : 'poppy-cabeca');
  const logoEl = logo ? el('div', 'poppy-logo', logo) : null;
  if (logo) logo.draggable = false;
  const pilha = el('span', { class: 'poppy-pilha', 'aria-hidden': 'true' });
  const h2 = inteiro ? el('h2', { class: 'poppy-titulo', 'aria-label': inteiro }, pilha) : null;

  let digitado = null;
  let porDigitar = null;
  let cursor = null;
  let subEl = null;
  if (sub) {
    digitado = el('span', 'poppy-digitado');
    cursor = el('i');
    porDigitar = el('span', { class: 'poppy-por-digitar', texto: sub });
    subEl = el('p', { class: 'poppy-subtitulo', role: 'text', 'aria-label': sub },
      el('span', { 'aria-hidden': 'true' }, [digitado, el('span', 'poppy-cursor', cursor), porDigitar]));
  }
  cabeca.append(...[logoEl, h2, subEl].filter(Boolean));
  if (logoEl) gsap.set(logoEl, { rotation: GIRO_LOGO });

  let fileiras = []; // fileiras de blocos (elementos), de cima para baixo
  let largura = 0;
  let caiu = false;
  let piscaId = 0;
  let observador = null;
  let vivo = true;

  const larguraDe = (palavra) => palavra.reduce((s, g) => s + (ehLetra(g) ? 1 : ESTREITO), 0);

  // Separa as palavras em fileiras de até `cabem` blocos; palavra maior que a fileira é partida.
  function quebrar(cabem) {
    const pedacos = [];
    for (const palavra of palavras) {
      if (larguraDe(palavra) <= cabem) {
        pedacos.push(palavra);
        continue;
      }
      let atual = [];
      let soma = 0;
      for (const g of palavra) {
        const w = ehLetra(g) ? 1 : ESTREITO;
        if (atual.length && soma + w > cabem) {
          pedacos.push(atual);
          atual = [];
          soma = 0;
        }
        atual.push(g);
        soma += w;
      }
      if (atual.length) pedacos.push(atual);
    }
    const linhas = [];
    let linha = [];
    let soma = 0;
    for (const p of pedacos) {
      const w = larguraDe(p);
      if (linha.length && soma + VAO + w > cabem) {
        linhas.push(linha);
        linha = [];
        soma = 0;
      }
      soma += (linha.length ? VAO : 0) + w;
      linha.push(p);
    }
    if (linha.length) linhas.push(linha);
    return linhas;
  }

  // O maior bloco em que a palavra mais comprida cabe e a pilha não passa de
  // quatro fileiras. Título longo demais para isso não some: usa o bloco
  // mínimo, parte a palavra que não cabe e aceita mais fileiras.
  function escolher(w) {
    const maximo = w > 520 ? 62 : 48;
    const minimo = 18;
    const maisLonga = Math.max(0, ...palavras.map(larguraDe));
    for (let lado = maximo; lado >= minimo; lado -= 1) {
      const cabem = (w + FOLGA) / (lado + FOLGA);
      if (maisLonga > cabem) continue;
      const linhas = quebrar(cabem);
      if (linhas.length <= MAX_FILEIRAS) return { lado, linhas };
    }
    return { lado: minimo, linhas: quebrar((w + FOLGA) / (minimo + FOLGA)) };
  }

  function montar(w) {
    if (!h2 || !(w > 0) || Math.abs(w - largura) < 2) return;
    largura = w;
    const { lado, linhas } = escolher(w);
    const r = semente(2312 + inteiro.length); // mesmo texto, mesma pilha
    pilha.style.setProperty('--lado', `${lado}px`);
    pilha.textContent = '';
    fileiras = [];
    let deCima = [];
    for (const linha of linhas) {
      const fileiraEl = el('span', 'poppy-fileira');
      const blocos = [];
      const cores = [];
      linha.forEach((palavra, i) => {
        if (i > 0) fileiraEl.append(el('span', 'poppy-vao'));
        for (const g of palavra) {
          const letra = ehLetra(g);
          let cor = 'creme';
          if (letra) {
            // Cor diferente da do vizinho da esquerda e, quando dá, da de cima.
            const esquerda = cores[cores.length - 1];
            const cima = deCima[cores.length];
            let opcoes = CORES.slice(0, 4).filter((c) => c !== esquerda);
            const semCima = opcoes.filter((c) => c !== cima);
            if (semCima.length) opcoes = semCima;
            cor = opcoes[Math.floor(r() * opcoes.length) % opcoes.length];
          }
          const bloco = el('span', { class: letra ? 'poppy-bloco' : 'poppy-bloco estreito', dataset: { cor } }, el('span', null, g));
          // A lasca de tinta: um lugar diferente em cada bloco.
          bloco.style.setProperty('--mx', `${Math.round(18 + r() * 64)}%`);
          bloco.style.setProperty('--my', `${Math.round(16 + r() * 66)}%`);
          bloco._giro = (r() - 0.5) * (letra ? 9 : 14);
          bloco._desvio = (r() - 0.5) * 2.4;
          cores.push(cor);
          blocos.push(bloco);
          fileiraEl.append(bloco);
        }
      });
      deCima = cores;
      fileiras.push(blocos);
      pilha.append(fileiraEl);
    }
    if (caiu) assentar();
  }

  const todos = () => fileiras.flat();

  // A pose de descanso; no movimento reduzido, com metade do giro.
  function assentar() {
    for (const b of todos()) {
      gsap.set(b, { autoAlpha: 1, y: b._desvio, rotation: reduzido ? b._giro / 2 : b._giro, scaleY: 1 });
    }
    if (logoEl) gsap.set(logoEl, { autoAlpha: 1, scale: 1, rotation: GIRO_LOGO });
  }

  // A digitação morta por destruir() ainda resolve (onInterrupt): sem `vivo`, o relógio seguiria piscando sozinho.
  function piscar(aceso) {
    if (!cursor || !vivo) return;
    cursor.classList.toggle('apagado', !aceso);
    piscaId = setTimeout(() => piscar(!aceso), MEIO_PISCAR);
  }

  if (h2 && typeof ResizeObserver === 'function') {
    observador = new ResizeObserver(() => montar(h2.clientWidth));
    observador.observe(h2);
  }

  return {
    el: cabeca,

    preparar() {
      if (h2) montar(h2.clientWidth);
    },

    cair() {
      // Monta com a medida de agora antes de marcar `caiu` (senão os blocos já nasceriam assentados).
      if (h2) montar(h2.clientWidth);
      caiu = true;
      cabeca.classList.add('caindo');
      const blocos = todos();
      if (!blocos.length && !logoEl) return Promise.resolve();

      if (reduzido) {
        assentar();
        return comoPromise(anima(gsap.fromTo([logoEl, ...blocos].filter(Boolean), { autoAlpha: 0 }, {
          autoAlpha: 1, duration: 0.5, stagger: 0.025, ease: 'none',
        })));
      }

      const tl = anima(gsap.timeline());
      if (logoEl) {
        gsap.set(logoEl, { scale: 1.3, rotation: -11 });
        tl.fromTo(logoEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.08 }, 0)
          .to(logoEl, { scale: 1, duration: 0.4, ease: curvas.poppy.pulo }, 0)
          .to(logoEl, { rotation: GIRO_LOGO, duration: 0.9, ease: curvas.poppy.mola }, 0.04);
      }
      // Os blocos partem de cima da tela; a fileira de baixo sai primeiro.
      const alturaQueda = (h2 ? h2.getBoundingClientRect().bottom : 0) + 80;
      const total = fileiras.length;
      fileiras.forEach((fileira, i) => {
        const base = (logoEl ? VEZ_DO_LOGO : 0) + (total - 1 - i) * 0.34;
        fileira.forEach((b, j) => {
          const quando = base + j * 0.05 + Math.abs(b._desvio) * 0.03;
          const dur = 0.95 + Math.abs(b._giro) * 0.012;
          // O quique bate no chão a 34% do caminho: é ali que o bloco amassa.
          const pancada = quando + dur * 0.34;
          tl.set(b, { autoAlpha: 1, y: -alturaQueda, rotation: b._giro * 5 + (j % 2 ? 24 : -24), scaleY: 1 }, quando)
            .to(b, { y: b._desvio, duration: dur, ease: curvas.poppy.quique }, quando)
            .to(b, { rotation: b._giro, duration: dur * 1.05, ease: curvas.poppy.pulo }, quando)
            .to(b, { scaleY: 0.84, duration: 0.07, ease: 'power1.out' }, pancada)
            .to(b, { scaleY: 1, duration: 0.34, ease: curvas.poppy.mola }, pancada + 0.07);
        });
      });
      return comoPromise(tl);
    },

    digitar() {
      if (!subEl) return Promise.resolve();
      cabeca.classList.add('digitando');
      const terminar = () => {
        digitado.textContent = sub;
        porDigitar.textContent = '';
        cabeca.classList.add('digitado');
        // No reduzido o cursor some no fim (CSS): não há o que piscar.
        if (!reduzido) piscar(true);
      };
      if (reduzido) {
        terminar();
        return comoPromise(anima(gsap.fromTo(subEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'none' })));
      }
      const passo = { n: 0 };
      let escritas = 0;
      return comoPromise(anima(gsap.to(passo, {
        n: letras.length,
        duration: Math.min(2.6, letras.length * 0.034),
        ease: 'none',
        onUpdate() {
          const n = Math.round(passo.n);
          if (n === escritas) return;
          escritas = n;
          digitado.textContent = letras.slice(0, n).join('');
          porDigitar.textContent = letras.slice(n).join('');
        },
      }))).then(terminar);
    },

    tocar(alvo) {
      if (!(alvo instanceof Element)) return;
      if (logoEl && logoEl.contains(alvo)) {
        if (reduzido) return;
        som?.efeito?.('mola');
        anima(gsap.timeline()
          .to(logoEl, { scale: 1.07, rotation: -9, duration: 0.14, ease: 'power2.out', overwrite: true })
          .to(logoEl, { scale: 1, duration: 0.4, ease: curvas.poppy.pulo })
          .to(logoEl, { rotation: GIRO_LOGO, duration: 0.9, ease: curvas.poppy.mola }, '<'));
        return;
      }
      const b = alvo.closest?.('.poppy-bloco');
      if (!b || !pilha.contains(b)) return;
      som?.efeito?.('mola');
      if (reduzido) {
        b.classList.remove('piscou');
        void b.offsetWidth;
        b.classList.add('piscou');
        b.addEventListener('animationend', () => b.classList.remove('piscou'), { once: true });
        return;
      }
      const lado = b._giro >= 0 ? 1 : -1;
      // overwrite mata a queda se o dedo chega no meio dela; scaleY 1 para o bloco não ficar amassado.
      anima(gsap.timeline()
        .to(b, { y: b._desvio - 0.45 * b.offsetHeight, rotation: b._giro + lado * 9, scaleY: 1, autoAlpha: 1, duration: 0.18, ease: 'power2.out', overwrite: true })
        .to(b, { y: b._desvio, duration: 0.6, ease: curvas.poppy.quique })
        .to(b, { rotation: b._giro, duration: 1.2, ease: curvas.poppy.mola }, '<'));
    },

    destruir() {
      vivo = false;
      clearTimeout(piscaId);
      piscaId = 0;
      observador?.disconnect();
    },
  };
}
