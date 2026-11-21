// O título do capítulo como uma pilha de blocos de brinquedo (uma letra por
// bloco), o subtítulo digitado com letra de videocassete e, no alto, o logo do
// jogo colado como um adesivo.
//
//   const titulo = criarTitulo({ texto, subtitulo, logo, amb, gsap, anima, som });
//   (logo: a <img> já carregada, ou null: o capítulo abre só com a pilha)
//   titulo.el            <header>
//   titulo.cair()        → Promise: o adesivo assenta e os blocos caem, fileira de baixo primeiro
//   titulo.digitar()     → Promise: o subtítulo aparece letra por letra
//   titulo.tocar(alvo)   um toque de verdade: o bloco pula e balança na mola, o adesivo descola uma ponta
//   titulo.destruir()
//
// O texto inteiro vai no aria-label do <h2>; os blocos são só desenho. O logo é
// uma imagem com o seu texto alternativo.

import { el, semente } from '../../nucleo/util.js';
import { curvas } from '../../nucleo/movimento.js';

const CORES = ['vermelho', 'amarelo', 'azul', 'verde', 'creme'];
const VAO = 0.42;         // largura do espaço entre palavras, em blocos
const ESTREITO = 0.5;     // pontuação ocupa meio bloco
const FOLGA = 3;          // px entre um bloco e outro
const GIRO_LOGO = -3;     // graus: o adesivo foi colado um pouco torto
const VEZ_DO_LOGO = 0.3;  // s que os blocos esperam o adesivo assentar

const segmentador = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter('pt-BR', { granularity: 'grapheme' })
  : null;
const grafemas = (texto) => (segmentador ? Array.from(segmentador.segment(texto), (s) => s.segment) : Array.from(texto));
const ehLetra = (g) => /[\p{L}\p{N}]/u.test(g);

export function criarTitulo({ texto = '', subtitulo = '', logo = null, amb, gsap, anima, som }) {
  const inteiro = String(texto || '').replace(/\s+/g, ' ').trim();
  const palavras = inteiro ? inteiro.split(' ').map((p) => grafemas(p)) : [];
  const larguraDe = (palavra) => palavra.reduce((soma, g) => soma + (ehLetra(g) ? 1 : ESTREITO), 0);

  const pilha = el('span', { class: 'poppy-pilha', 'aria-hidden': 'true' });
  const h2 = inteiro ? el('h2', { class: 'poppy-titulo', 'aria-label': inteiro }, pilha) : null;

  // ---- subtítulo ------------------------------------------------------------------
  const frase = String(subtitulo || '').trim();
  const digitado = el('span', 'poppy-digitado');
  const cursor = el('span', 'poppy-cursor', el('i'));
  const resto = el('span', 'poppy-por-digitar', frase);
  const sub = frase
    ? el('p', { class: 'poppy-subtitulo', 'aria-label': frase, role: 'text' },
      el('span', { 'aria-hidden': 'true' }, [digitado, cursor, resto]))
    : null;

  const adesivo = logo ? el('div', 'poppy-logo', logo) : null;
  if (adesivo) gsap.set(adesivo, { rotation: GIRO_LOGO });

  const raiz = el('header', adesivo ? 'poppy-cabeca com-logo' : 'poppy-cabeca', [adesivo, h2, sub]);

  // O cursor pisca por relógio (530 ms aceso, 530 apagado), e não por animação de
  // CSS: a animação infinita refazia o estilo a cada quadro com ela parada lendo.
  const MEIO_PISCAR = 530;
  let piscaId = 0;
  function piscar(aceso = true) {
    cursor.classList.toggle('apagado', !aceso);
    piscaId = setTimeout(() => piscar(!aceso), MEIO_PISCAR);
  }

  // ---- montagem das fileiras ---------------------------------------------------------
  let fileiras = [];          // [[bloco, bloco, ...], ...] de cima para baixo
  let larguraMontada = -1;
  let caiu = false;

  function montar(largura) {
    if (!h2 || largura <= 0 || Math.abs(largura - larguraMontada) < 2) return;
    larguraMontada = largura;
    const grande = largura > 520;
    const maximo = grande ? 62 : 48;
    const minimo = 18;
    const maisLonga = Math.max(...palavras.map(larguraDe));

    /** Distribui as palavras em fileiras de no máximo `cabem` blocos (palavra maior que a fileira é partida). */
    function quebrar(cabem) {
      const pedacos = [];
      for (const palavra of palavras) {
        if (larguraDe(palavra) <= cabem) { pedacos.push(palavra); continue; }
        let parte = [];
        for (const g of palavra) {
          if (parte.length && larguraDe([...parte, g]) > cabem) { pedacos.push(parte); parte = []; }
          parte.push(g);
        }
        if (parte.length) pedacos.push(parte);
      }
      const saida = [];
      let atual = [];
      let ocupado = 0;
      for (const palavra of pedacos) {
        const w = larguraDe(palavra);
        const comVao = atual.length ? ocupado + VAO + w : w;
        if (atual.length && comVao > cabem) {
          saida.push(atual);
          atual = [palavra];
          ocupado = w;
        } else {
          atual.push(palavra);
          ocupado = comVao;
        }
      }
      if (atual.length) saida.push(atual);
      return saida;
    }

    // O maior bloco em que a palavra mais comprida cabe e a pilha não passa de
    // quatro fileiras. Título longo demais para isso não some: usa o bloco
    // mínimo, parte a palavra que não cabe e aceita mais fileiras.
    let lado = maximo;
    let linhas = null;
    for (; lado >= minimo; lado -= 1) {
      const cabem = (largura + FOLGA) / (lado + FOLGA);
      if (maisLonga > cabem) continue;
      const tentativa = quebrar(cabem);
      if (tentativa.length <= 4) { linhas = tentativa; break; }
    }
    if (!linhas) {
      lado = minimo;
      linhas = quebrar(Math.max(1, Math.floor((largura + FOLGA) / (lado + FOLGA))));
    }

    const r = semente(2312 + inteiro.length);
    pilha.textContent = '';
    pilha.style.setProperty('--lado', `${lado}px`);
    fileiras = [];
    let corAcima = [];
    for (const linha of linhas) {
      const fileira = el('span', 'poppy-fileira');
      const blocos = [];
      const cores = [];
      let anterior = '';
      linha.forEach((palavra, i) => {
        if (i > 0) fileira.append(el('span', 'poppy-vao'));
        for (const g of palavra) {
          const letra = ehLetra(g);
          // Cor diferente da do vizinho da esquerda e, quando dá, da de cima.
          let cor = letra ? CORES[Math.floor(r() * 4)] : 'creme';
          for (let k = 0; letra && k < 6 && (cor === anterior || cor === corAcima[cores.length]); k++) {
            cor = CORES[Math.floor(r() * 4)];
          }
          anterior = cor;
          cores.push(cor);
          const bloco = el('span', { class: `poppy-bloco${letra ? '' : ' estreito'}`, dataset: { cor } }, el('span', null, g));
          // onde fica a lasca de tinta de cada bloco
          bloco.style.setProperty('--mx', `${(18 + r() * 64).toFixed(0)}%`);
          bloco.style.setProperty('--my', `${(16 + r() * 66).toFixed(0)}%`);
          bloco._giro = (r() - 0.5) * (letra ? 9 : 14);
          bloco._desvio = (r() - 0.5) * 2.4;
          fileira.append(bloco);
          blocos.push(bloco);
        }
      });
      corAcima = cores;
      pilha.append(fileira);
      fileiras.push(blocos);
    }

    if (caiu) assentar();
  }

  /** A pose de descanso: cada bloco um pouco torto, como quem empilhou com pressa. */
  function assentar() {
    for (const blocos of fileiras) {
      for (const b of blocos) gsap.set(b, { y: b._desvio, rotation: amb.reduzido ? b._giro * 0.5 : b._giro, scaleY: 1, autoAlpha: 1 });
    }
  }

  let observador = null;
  if (h2 && 'ResizeObserver' in window) {
    observador = new ResizeObserver(() => montar(h2.clientWidth));
    observador.observe(h2);
  }

  return {
    el: raiz,

    /** Chamado depois que o cabeçalho está no documento. */
    preparar() {
      if (h2) montar(h2.clientWidth);
    },

    cair() {
      if (caiu) return Promise.resolve();
      caiu = true;
      if (h2) montar(h2.clientWidth);
      raiz.classList.add('caindo');
      const todos = fileiras.flat();
      const pecas = adesivo ? [adesivo, ...todos] : todos;
      if (!pecas.length) return Promise.resolve();

      if (amb.reduzido) {
        assentar();
        return new Promise((ok) => {
          anima(gsap.fromTo(pecas, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, stagger: 0.025, ease: 'none', onComplete: ok }));
        });
      }

      const tl = anima(gsap.timeline());
      if (adesivo) {
        // O adesivo vem de perto do vidro e é apertado no lugar: passa um pouco
        // do tamanho, assenta, e a ponta ainda balança um instante.
        gsap.set(adesivo, { scale: 1.3, rotation: GIRO_LOGO - 8 });
        tl.to(adesivo, { autoAlpha: 1, duration: 0.08, ease: 'none' }, 0);
        tl.to(adesivo, { scale: 1, duration: 0.4, ease: curvas.poppy.pulo }, 0);
        tl.to(adesivo, { rotation: GIRO_LOGO, duration: 0.9, ease: curvas.poppy.mola }, 0.04);
      }
      const alturaQueda = h2 ? h2.getBoundingClientRect().bottom + 80 : 0;
      const total = fileiras.length;
      fileiras.forEach((blocos, indice) => {
        // A fileira de baixo chega primeiro: as de cima caem em cima dela.
        const base = (adesivo ? VEZ_DO_LOGO : 0) + (total - 1 - indice) * 0.34;
        blocos.forEach((b, i) => {
          const quando = base + i * 0.05 + Math.abs(b._desvio) * 0.03;
          const dur = 0.95 + Math.abs(b._giro) * 0.012;
          gsap.set(b, { y: -alturaQueda, rotation: b._giro * 5 + (i % 2 ? 24 : -24), autoAlpha: 1, scaleY: 1 });
          tl.to(b, { y: b._desvio, duration: dur, ease: curvas.poppy.quique }, quando);
          tl.to(b, { rotation: b._giro, duration: dur * 1.05, ease: curvas.poppy.pulo }, quando);
          // amassa no primeiro impacto (o quique bate no chão a 36% do caminho)
          tl.to(b, { scaleY: 0.84, duration: 0.07, ease: 'power1.out' }, quando + dur * 0.34);
          tl.to(b, { scaleY: 1, duration: 0.34, ease: curvas.poppy.mola }, quando + dur * 0.34 + 0.07);
        });
      });
      return new Promise((ok) => { tl.eventCallback('onComplete', ok); });
    },

    digitar() {
      if (!sub) return Promise.resolve();
      raiz.classList.add('digitando');
      const letras = grafemas(frase);
      if (amb.reduzido) {
        digitado.textContent = frase;
        resto.textContent = '';
        raiz.classList.add('digitado');
        return new Promise((ok) => {
          anima(gsap.fromTo(sub, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'none', onComplete: ok }));
        });
      }
      const estado = { n: 0 };
      let escrito = -1;
      return new Promise((ok) => {
        anima(gsap.to(estado, {
          n: letras.length,
          duration: Math.min(2.6, letras.length * 0.034),
          ease: 'none',
          onUpdate() {
            const n = Math.round(estado.n);
            if (n === escrito) return;
            escrito = n;
            digitado.textContent = letras.slice(0, n).join('');
            resto.textContent = letras.slice(n).join('');
          },
          onComplete() {
            raiz.classList.add('digitado');
            clearTimeout(piscaId);
            piscar();
            ok();
          },
        }));
      });
    },

    /** O bloco tocado pula e balança a partir da pose de descanso (no reduzido, só pisca). */
    tocar(alvo) {
      if (adesivo?.contains(alvo)) {
        // o adesivo descola uma ponta e assenta de novo (no reduzido fica quieto)
        if (amb.reduzido) return;
        som.efeito('mola');
        // (o overwrite também mata a entrada, se o dedo chegou no meio dela: por isso o autoAlpha)
        anima(gsap.timeline())
          .to(adesivo, { autoAlpha: 1, scale: 1.07, rotation: GIRO_LOGO - 6, duration: 0.14, ease: 'power2.out', overwrite: true })
          .to(adesivo, { scale: 1, duration: 0.4, ease: curvas.poppy.pulo })
          .to(adesivo, { rotation: GIRO_LOGO, duration: 0.9, ease: curvas.poppy.mola }, '<');
        return;
      }
      const b = alvo.closest('.poppy-bloco');
      if (!b) return;
      som.efeito('mola');
      if (amb.reduzido) {
        b.classList.add('piscou');
        b.addEventListener('animationend', () => b.classList.remove('piscou'), { once: true });
        return;
      }
      const lado = b._giro < 0 ? -1 : 1;
      // o overwrite também mata o amasso da queda: o pulo desamassa o bloco
      anima(gsap.timeline())
        .to(b, { y: b._desvio - b.offsetHeight * 0.45, rotation: b._giro + lado * 9, scaleY: 1, duration: 0.18, ease: 'power2.out', overwrite: true })
        .to(b, { y: b._desvio, duration: 0.6, ease: curvas.poppy.quique })
        .to(b, { rotation: b._giro, duration: 1.2, ease: curvas.poppy.mola }, '<');
    },

    destruir() {
      clearTimeout(piscaId);
      if (observador) observador.disconnect();
    },
  };
}
