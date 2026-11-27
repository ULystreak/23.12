/* ============================================================================
   POPPY / CARTÃO: os textos e as imagens do capítulo
   ============================================================================
   Cada texto vive num objeto diferente da fábrica, com a física desse objeto,
   pela posição (SUPORTES[indice % 5]): a tarja que abre como corte de vídeo,
   a etiqueta pendurada no fio que cai e balança, a placa de vidro aparafusada
   que despenca com mola, o visor âmbar que liga e a legenda que se escreve.
   As imagens viram monitores de TV antiga, alternando lado e inclinação.
   O texto existe para o leitor de tela e para o Tab desde o começo: a classe
   poppy-entra esconde só com opacidade, e entrar() roda uma vez.
   ========================================================================== */

import { el, svg } from '../../nucleo/util.js';
import { curvas } from '../../nucleo/movimento.js';

const SUPORTES = ['faixa', 'etiqueta', 'placa', 'visor', 'legenda'];
// A pose final de cada suporte, em graus.
const GIRO = { faixa: 0, etiqueta: -2.4, placa: 0.8, visor: 0, legenda: 0 };
const GIROS_PARAFUSO = [34, -52, 78, 12];

function parafuso(giro, i) {
  return `<svg class="poppy-parafuso p${i}" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <circle cx="8.4" cy="8.9" r="6.4" fill="#3a2c14"/>
    <circle cx="8" cy="8" r="6.4" fill="#a97c35"/>
    <path d="M3.9 6.3a4.6 4.6 0 0 1 4-3.1" fill="none" stroke="#f6dca6" stroke-width="1.3" stroke-linecap="round"/>
    <rect x="3.3" y="7.15" width="9.4" height="1.7" rx="0.85" fill="#3a2c14" transform="rotate(${giro} 8 8)"/>
  </svg>`;
}

// O fio vermelho que segura a etiqueta: um traço cheio e a torção por cima.
const CORDAO = `<svg class="poppy-cordao" viewBox="0 0 40 120" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <path class="cordao-fio" d="M20 0C17 30 24 56 19 84c-2 12 1 22 1 30"/>
  <path class="cordao-torcido" d="M20 0C17 30 24 56 19 84c-2 12 1 22 1 30"/>
</svg>`;

// A queda com mola da placa e dos monitores. Devolve a timeline.
function cair(alvo, giro, lado, { gsap, anima }) {
  gsap.set(alvo, { y: -120, rotation: giro + lado * 7, scale: 0.95 });
  return anima(gsap.timeline())
    .to(alvo, { y: 0, scale: 1, duration: 0.6, ease: curvas.poppy.pulo }, 0)
    .to(alvo, { rotation: giro, duration: 1.25, ease: curvas.poppy.mola }, 0.04);
}

// O miolo de cada suporte. A ordem dos filhos importa: na etiqueta o cordão
// vem antes do papel (fica por baixo); nos outros, os enfeites vêm depois.
function montar(suporte, texto) {
  const p = el('p', null, texto);
  switch (suporte) {
    case 'faixa': {
      const corpo = el('div', 'poppy-tarja', p);
      return { filhos: [corpo], corpo, p };
    }
    case 'etiqueta': {
      const corpo = el('div', 'poppy-papel', [el('i', { class: 'poppy-papel-furo', 'aria-hidden': 'true' }), p]);
      return { filhos: [svg(CORDAO), corpo], corpo, p };
    }
    case 'placa': {
      const corpo = el('div', 'poppy-vidro', p);
      const parafusos = GIROS_PARAFUSO.map((g, i) => svg(parafuso(g, i)));
      return { filhos: [corpo, ...parafusos], corpo, p, parafusos };
    }
    case 'visor': {
      const corpo = el('div', 'poppy-visor', [el('i', { class: 'poppy-visor-grade', 'aria-hidden': 'true' }), p]);
      return { filhos: [corpo], corpo, p };
    }
    default: {
      const span = el('span', null, texto);
      const corpo = el('p', 'poppy-cc', span);
      return { filhos: [corpo], corpo, p: span };
    }
  }
}

export function criarCartao({ texto, indice = 0, amb, gsap, anima }) {
  const suporte = SUPORTES[indice % SUPORTES.length];
  const giro = GIRO[suporte];
  const partes = montar(suporte, texto);
  const raiz = el('article', { class: 'poppy-cartao poppy-entra', dataset: { suporte } }, partes.filhos);
  gsap.set(raiz, suporte === 'etiqueta' ? { rotation: giro, transformOrigin: '50% 0%' } : { rotation: giro });
  let entrou = false;

  function entrar({ imediato = false } = {}) {
    if (entrou) return;
    entrou = true;
    raiz.classList.remove('poppy-entra');
    if (imediato) return;
    if (amb?.reduzido) {
      anima(gsap.fromTo(raiz, { opacity: 0 }, { opacity: 1, duration: 0.55, ease: 'none' }));
      return;
    }
    const { corpo, p } = partes;
    const tl = anima(gsap.timeline());
    switch (suporte) {
      case 'faixa':
        // A tarja abre de uma linha no meio, em degraus; o texto chega trepidando.
        tl.fromTo(corpo, { clipPath: 'inset(48% 0% 48% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.26, ease: 'steps(4)', clearProps: 'clipPath' }, 0)
          .fromTo(p, { x: 14, opacity: 0.4 }, { x: 0, opacity: 1, duration: 0.3, ease: 'steps(3)' }, 0.2);
        break;
      case 'etiqueta':
        tl.fromTo(raiz, { y: -150 }, { y: 0, duration: 0.55, ease: curvas.poppy.pulo }, 0)
          .fromTo(raiz, { rotation: giro + 16 }, { rotation: giro, duration: 2.2, ease: 'elastic.out(1, 0.22)' }, 0.18);
        break;
      case 'placa':
        tl.add(cair(raiz, giro, indice % 2 ? 1 : -1, { gsap, anima }), 0)
          .fromTo(partes.parafusos, { scale: 1.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(3)', stagger: 0.06 }, 0.34);
        break;
      case 'visor':
        // O mostrador liga numa linha âmbar e o texto acende em degraus.
        tl.fromTo(corpo, { scaleY: 0.03, scaleX: 0.86 }, { scaleY: 1, scaleX: 1, duration: 0.28, ease: 'steps(5)' }, 0)
          .fromTo(p, { opacity: 0 }, { opacity: 1, duration: 0.24, ease: 'steps(3)' }, 0.28);
        break;
      default:
        tl.fromTo(corpo, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.6, ease: 'steps(9)', clearProps: 'clipPath' }, 0);
    }
  }

  return { el: raiz, entrar };
}

export function criarMonitor({ img, legenda, indice = 0, amb, gsap, anima }) {
  const giro = indice % 2 ? -1.4 : 1.2;
  img.classList.add('poppy-monitor-img');
  img.draggable = false;
  const texto = typeof legenda === 'string' ? legenda.trim() : '';
  const legendaEl = texto ? el('figcaption', { class: 'poppy-monitor-legenda', texto }) : null;
  const raiz = el('figure', { class: 'poppy-monitor poppy-entra', dataset: { lado: indice % 2 ? 'dir' : 'esq' } }, [
    el('div', 'poppy-monitor-tela', [
      img,
      el('i', { class: 'poppy-monitor-linhas', 'aria-hidden': 'true' }),
      el('i', { class: 'poppy-monitor-reflexo', 'aria-hidden': 'true' }),
    ]),
    legendaEl,
    el('div', { class: 'poppy-monitor-painel', 'aria-hidden': 'true' }, [el('i', 'luz'), el('i', 'grade'), el('i', 'botao'), el('i', 'botao')]),
  ]);
  gsap.set(raiz, { rotation: giro });
  // A tela fica vazia até ligar: sem isto a imagem apareceria antes da tela.
  gsap.set(img, { opacity: 0 });
  if (legendaEl) gsap.set(legendaEl, { opacity: 0 });
  let entrou = false;

  function acender() {
    raiz.classList.add('ligado');
    gsap.set([img, legendaEl].filter(Boolean), { opacity: 1 });
  }

  function entrar({ imediato = false } = {}) {
    if (entrou) return;
    entrou = true;
    raiz.classList.remove('poppy-entra');
    if (imediato) {
      acender();
      return;
    }
    if (amb?.reduzido) {
      acender();
      anima(gsap.fromTo(raiz, { opacity: 0 }, { opacity: 1, duration: 0.55, ease: 'none' }));
      return;
    }
    // Cai, a luz do painel acende, a tela abre em linha e a imagem ainda procura o tracking.
    const tl = cair(raiz, giro, indice % 2 ? -1 : 1, { gsap, anima })
      .add(() => raiz.classList.add('ligado'), 0.5)
      .set(img, { opacity: 1, scaleY: 0.012, scaleX: 0.72 }, 0.52)
      .to(img, { scaleY: 1, scaleX: 1, duration: 0.3, ease: 'steps(5)' }, 0.52)
      .fromTo(img, { x: 16 }, { x: 0, duration: 0.26, ease: 'steps(4)', immediateRender: false }, 0.82)
      .fromTo(img, { opacity: 0.55 }, { opacity: 1, duration: 0.3, ease: 'steps(3)', immediateRender: false }, 0.82);
    if (legendaEl) tl.set(legendaEl, { opacity: 1 }, 1.12);
  }

  return { el: raiz, entrar };
}
