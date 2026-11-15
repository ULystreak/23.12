// Os textos do capítulo: cartões de vidro fosco escuro, cada um preso à
// "tela" com uma coisa de brinquedo diferente, e o monitor antigo das imagens.
//
//   criarCartao({ texto, indice, amb, gsap, anima }) → { el, entrar() }
//   criarMonitor({ img, legenda, indice, amb, gsap, anima }) → { el, entrar() }
//
// Nenhum cartão repete largura, lado, inclinação e enfeite do vizinho. Eles
// entram caindo e assentam com mola (com movimento reduzido, só aparecem).

import { el, svg } from '../../nucleo/util.js';
import { curvas } from '../../nucleo/movimento.js';

// largura (fração da coluna), lado, inclinação em graus e o enfeite de cada cartão
const VARIANTES = [
  { enfeite: 'fita', largura: 0.93, lado: 'esq', giro: -0.9 },
  { enfeite: 'parafusos', largura: 0.86, lado: 'dir', giro: 0.8 },
  { enfeite: 'etiqueta', largura: 0.96, lado: 'esq', giro: 0.5 },
  { enfeite: 'ima', largura: 0.84, lado: 'meio', giro: -1.2 },
  { enfeite: 'pregador', largura: 0.9, lado: 'dir', giro: 1.1 },
];

const parafuso = (giro) => `
  <svg class="poppy-parafuso" viewBox="0 0 16 16">
    <circle cx="8" cy="8.6" r="7" fill="#02080c" opacity=".55"/>
    <circle cx="8" cy="8" r="6.6" fill="#5d6d70"/>
    <circle cx="7.4" cy="7.3" r="5.2" fill="#a9b6b2"/>
    <path d="M3.6 8h8.8" stroke="#2c393d" stroke-width="1.7" stroke-linecap="round" transform="rotate(${giro} 8 8)"/>
  </svg>`;

const ENFEITES = {
  // duas tiras de fita adesiva colorida, rasgadas à mão
  fita: () => [el('i', 'poppy-adesiva a'), el('i', 'poppy-adesiva b')],

  // uma chapa aparafusada pelos quatro cantos
  parafusos: () => [34, -52, 78, 12].map((giro, i) => {
    const s = svg(parafuso(giro));
    s.classList.add(`p${i}`);
    return s;
  }),

  // uma etiqueta de papel pendurada num pedaço do fio vermelho
  etiqueta: () => [svg(`
    <svg class="poppy-etiqueta" viewBox="0 0 46 74">
      <circle cx="23" cy="6" r="4.6" fill="#03090d"/>
      <circle cx="23" cy="6" r="4.6" fill="none" stroke="#8fa09f" stroke-width="1.6"/>
      <g class="pendulo">
        <path d="M23 6c-3 7 3 10 0 17" fill="none" stroke="var(--fio)" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M11 32 23 20l12 12v34a4 4 0 0 1-4 4H15a4 4 0 0 1-4-4z" fill="#e9dec4"/>
        <path d="M11 32 23 20l12 12v5H11z" fill="#d9ccae"/>
        <circle cx="23" cy="29" r="3" fill="#0b1c27"/>
        <path d="M16.5 46h13M16.5 53h13M16.5 60h8" stroke="#2a1b22" stroke-opacity=".34" stroke-width="2" stroke-linecap="round"/>
      </g>
    </svg>`)],

  // um ímã redondo de geladeira
  ima: () => [svg(`
    <svg class="poppy-ima" viewBox="0 0 36 38">
      <ellipse cx="18" cy="22" rx="15" ry="14" fill="#02080c" opacity=".5"/>
      <circle cx="18" cy="18" r="15" fill="#1f6aa8"/>
      <circle cx="18" cy="16.5" r="14.2" fill="#2f8fd8"/>
      <circle cx="18" cy="16.5" r="8.6" fill="#256fb0"/>
      <circle cx="18" cy="16" r="7.4" fill="#3d9ee6"/>
      <path d="M9.5 10.5c2.4-3.6 6.6-5.4 10.6-4.8" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`)],

  // um pregador de plástico
  pregador: () => [svg(`
    <svg class="poppy-pregador" viewBox="0 0 24 56">
      <rect x="3" y="5" width="18" height="50" rx="5" fill="#02080c" opacity=".45"/>
      <rect x="3" y="2" width="18" height="50" rx="5" fill="#2d8a50"/>
      <rect x="3" y="2" width="12" height="50" rx="5" fill="#3fb86b"/>
      <path d="M12 6v42" stroke="#1f6b3c" stroke-width="1.6"/>
      <rect x="1" y="21" width="22" height="7" rx="3" fill="#b9c4c0"/>
      <rect x="1" y="21" width="22" height="3" rx="1.5" fill="#e3eae6"/>
      <path d="M6.5 8.5v9" stroke="#fff" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/>
    </svg>`)],
};

/** Queda com mola, comum aos cartões e aos monitores. Devolve a linha do tempo. */
function cair(alvo, giro, lado, { gsap, anima }) {
  gsap.set(alvo, { y: -120, rotation: giro + lado * 7, scale: 0.95, autoAlpha: 1 });
  const tl = anima(gsap.timeline());
  tl.to(alvo, { y: 0, scale: 1, duration: 0.6, ease: curvas.poppy.pulo }, 0);
  tl.to(alvo, { rotation: giro, duration: 1.25, ease: curvas.poppy.mola }, 0.04);
  return tl;
}

export function criarCartao({ texto, indice, amb, gsap, anima }) {
  const v = VARIANTES[indice % VARIANTES.length];
  const enfeites = ENFEITES[v.enfeite]();
  for (const e of enfeites) e.setAttribute('aria-hidden', 'true');
  const vidro = el('div', 'poppy-vidro', el('p', null, texto));
  const cartao = el('article', {
    class: 'poppy-cartao poppy-entra',
    dataset: { enfeite: v.enfeite, lado: v.lado },
  }, [vidro, ...enfeites]);
  cartao.style.setProperty('--larg', `${v.largura * 100}%`);
  gsap.set(cartao, { rotation: v.giro });

  let entrou = false;
  return {
    el: cartao,
    entrar() {
      if (entrou) return;
      entrou = true;
      cartao.classList.remove('poppy-entra');
      if (amb.reduzido) {
        anima(gsap.fromTo(cartao, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.55, ease: 'none' }));
        return;
      }
      const tl = cair(cartao, v.giro, indice % 2 ? 1 : -1, { gsap, anima });
      // o enfeite é o que segura o cartão: chega um instante depois, de estalo
      tl.fromTo(enfeites, { scale: 1.7, autoAlpha: 0 },
        { scale: 1, autoAlpha: 1, duration: 0.3, ease: 'back.out(3)', stagger: 0.06 }, 0.34);
      const pendulo = cartao.querySelector('.pendulo');
      if (pendulo) tl.fromTo(pendulo, { rotation: -26, svgOrigin: '23 6' }, { rotation: 0, duration: 1.6, ease: 'elastic.out(1.2, 0.28)' }, 0.4);
    },
  };
}

export function criarMonitor({ img, legenda, indice, amb, gsap, anima }) {
  img.classList.add('poppy-monitor-img');
  img.draggable = false;
  const tela = el('div', 'poppy-monitor-tela', [
    img,
    el('i', { class: 'poppy-monitor-linhas', 'aria-hidden': 'true' }),
    el('i', { class: 'poppy-monitor-reflexo', 'aria-hidden': 'true' }),
  ]);
  const texto = String(legenda || '').trim();
  const legendaEl = texto ? el('figcaption', 'poppy-monitor-legenda', texto) : null;
  const painel = el('div', { class: 'poppy-monitor-painel', 'aria-hidden': 'true' }, [
    el('i', 'luz'), el('i', 'grade'), el('i', 'botao'), el('i', 'botao'),
  ]);
  const giro = indice % 2 ? -1.4 : 1.2;
  const fig = el('figure', {
    class: 'poppy-monitor poppy-entra',
    dataset: { lado: indice % 2 ? 'dir' : 'esq' },
  }, [tela, legendaEl, painel]);
  gsap.set(fig, { rotation: giro });

  let entrou = false;
  return {
    el: fig,
    entrar() {
      if (entrou) return;
      entrou = true;
      fig.classList.remove('poppy-entra');
      if (amb.reduzido) {
        fig.classList.add('ligado');
        anima(gsap.fromTo(fig, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.55, ease: 'none' }));
        return;
      }
      gsap.set(img, { autoAlpha: 0 });
      if (legendaEl) gsap.set(legendaEl, { autoAlpha: 0 });
      const tl = cair(fig, giro, indice % 2 ? -1 : 1, { gsap, anima });
      // a tela liga: uma linha que abre, em degraus, e a imagem ainda procura o tracking
      tl.add(() => fig.classList.add('ligado'), 0.5);
      tl.set(img, { autoAlpha: 1, scaleY: 0.012, scaleX: 0.72 }, 0.52);
      tl.to(img, { scaleY: 1, scaleX: 1, duration: 0.3, ease: 'steps(5)' }, 0.52);
      tl.fromTo(img, { x: 16 }, { x: 0, duration: 0.26, ease: 'steps(4)' }, 0.82);
      tl.fromTo(img, { opacity: 0.55 }, { opacity: 1, duration: 0.3, ease: 'steps(3)' }, 0.82);
      if (legendaEl) tl.set(legendaEl, { autoAlpha: 1 }, 1.12);
    },
  };
}
