// Os textos do capítulo e o monitor antigo das imagens. Cada texto vive num
// objeto diferente da fábrica, com a física desse objeto:
//
//   faixa     legenda de fita, de ponta a ponta, numa tarja escura: entra em corte de vídeo
//   etiqueta  etiqueta de papel pendurada no fio vermelho: cai e balança no fio
//   placa     chapa de vidro aparafusada (a única "placa"): cai com mola, os parafusos estalam
//   visor     o mostrador de um videocassete, em âmbar: liga numa linha que abre em degraus
//   legenda   legenda fechada, linha a linha, encostada à direita: escreve da esquerda em degraus
//
//   criarCartao({ texto, indice, amb, gsap, anima }) → { el, entrar({ imediato }) }
//   criarMonitor({ img, legenda, indice, amb, gsap, anima }) → { el, entrar({ imediato }) }
//   (imediato: aparece já parado, quando o foco chegou antes da rolagem)
//
// Com movimento reduzido, tudo só aparece. O texto existe para o leitor de tela
// desde o começo (a entrada esconde só com opacidade).

import { el, svg } from '../../nucleo/util.js';
import { curvas } from '../../nucleo/movimento.js';

const SUPORTES = ['faixa', 'etiqueta', 'placa', 'visor', 'legenda'];
const GIRO = { faixa: 0, etiqueta: -2.4, placa: 0.8, visor: 0, legenda: 0 };

const parafuso = (giro) => `
  <svg class="poppy-parafuso" viewBox="0 0 16 16">
    <circle cx="8" cy="8.6" r="7" fill="#02080c" opacity=".55"/>
    <circle cx="8" cy="8" r="6.6" fill="#5d6d70"/>
    <circle cx="7.4" cy="7.3" r="5.2" fill="#a9b6b2"/>
    <path d="M3.6 8h8.8" stroke="#2c393d" stroke-width="1.7" stroke-linecap="round" transform="rotate(${giro} 8 8)"/>
  </svg>`;

// o pedaço do fio vermelho que segura a etiqueta: sobe do furo e some no alto
const CORDAO = `
  <svg class="poppy-cordao" viewBox="0 0 40 120" preserveAspectRatio="none">
    <path d="M20 118c0-14 7-22 4-38s-9-24-4-44S23 8 22 0" fill="none" stroke="var(--fio)" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M20 118c0-14 7-22 4-38s-9-24-4-44S23 8 22 0" fill="none" stroke="var(--fio-escuro)" stroke-width="3.2" stroke-dasharray="2.5 5.5"/>
  </svg>`;

/** Queda com mola, comum à placa e aos monitores. Devolve a linha do tempo. */
function cair(alvo, giro, lado, { gsap, anima }) {
  gsap.set(alvo, { y: -120, rotation: giro + lado * 7, scale: 0.95, opacity: 1 });
  const tl = anima(gsap.timeline());
  tl.to(alvo, { y: 0, scale: 1, duration: 0.6, ease: curvas.poppy.pulo }, 0);
  tl.to(alvo, { rotation: giro, duration: 1.25, ease: curvas.poppy.mola }, 0.04);
  return tl;
}

function montar(suporte, texto) {
  const p = el('p', null, texto);
  if (suporte === 'faixa') return { corpo: el('div', 'poppy-tarja', p), enfeites: [] };
  if (suporte === 'etiqueta') {
    const cordao = svg(CORDAO);
    return { corpo: el('div', 'poppy-papel', [el('i', 'poppy-papel-furo'), p]), enfeites: [cordao] };
  }
  if (suporte === 'placa') {
    const parafusos = [34, -52, 78, 12].map((giro, i) => {
      const s = svg(parafuso(giro));
      s.classList.add(`p${i}`);
      return s;
    });
    return { corpo: el('div', 'poppy-vidro', p), enfeites: parafusos };
  }
  if (suporte === 'visor') {
    return { corpo: el('div', 'poppy-visor', [el('i', 'poppy-visor-grade'), p]), enfeites: [] };
  }
  // legenda fechada: cada linha com a própria tarja
  return { corpo: el('p', 'poppy-cc', el('span', null, texto)), enfeites: [] };
}

export function criarCartao({ texto, indice, amb, gsap, anima }) {
  const suporte = SUPORTES[indice % SUPORTES.length];
  const giro = GIRO[suporte];
  const { corpo, enfeites } = montar(suporte, texto);
  for (const e of enfeites) e.setAttribute('aria-hidden', 'true');
  const cartao = el('article', {
    class: 'poppy-cartao poppy-entra',
    dataset: { suporte },
  }, [...(suporte === 'etiqueta' ? enfeites : []), corpo, ...(suporte === 'etiqueta' ? [] : enfeites)]);
  if (giro) gsap.set(cartao, { rotation: giro });

  let entrou = false;
  return {
    el: cartao,
    entrar({ imediato = false } = {}) {
      if (entrou) return;
      entrou = true;
      cartao.classList.remove('poppy-entra');
      if (imediato) { gsap.set(cartao, { opacity: 1 }); return; }
      if (amb.reduzido) {
        anima(gsap.fromTo(cartao, { opacity: 0 }, { opacity: 1, duration: 0.55, ease: 'none' }));
        return;
      }

      if (suporte === 'faixa') {
        // a tarja abre numa linha, em degraus, e o texto ainda procura o tracking
        gsap.set(cartao, { opacity: 1 });
        const tl = anima(gsap.timeline());
        tl.fromTo(corpo, { clipPath: 'inset(48% 0% 48% 0%)' },
          { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.26, ease: 'steps(4)', clearProps: 'clipPath' }, 0);
        tl.fromTo(corpo.firstChild, { x: 14, opacity: 0.4 }, { x: 0, opacity: 1, duration: 0.3, ease: 'steps(3)' }, 0.2);
        return;
      }

      if (suporte === 'etiqueta') {
        // cai pendurada no fio e balança em volta do furo até parar
        gsap.set(cartao, { opacity: 1, transformOrigin: '50% 0%' });
        const tl = anima(gsap.timeline());
        tl.fromTo(cartao, { y: -150 }, { y: 0, duration: 0.55, ease: curvas.poppy.pulo }, 0);
        tl.fromTo(cartao, { rotation: giro + 16 }, { rotation: giro, duration: 2.2, ease: 'elastic.out(1, 0.22)' }, 0.18);
        return;
      }

      if (suporte === 'visor') {
        // o mostrador liga: uma linha âmbar que abre em degraus
        gsap.set(cartao, { opacity: 1 });
        const tl = anima(gsap.timeline());
        tl.fromTo(corpo, { scaleY: 0.03, scaleX: 0.86 }, { scaleY: 1, scaleX: 1, duration: 0.28, ease: 'steps(5)' }, 0);
        tl.fromTo(corpo.lastChild, { opacity: 0 }, { opacity: 1, duration: 0.24, ease: 'steps(3)' }, 0.28);
        return;
      }

      if (suporte === 'legenda') {
        // a legenda fechada escreve da esquerda, em blocos, como num aparelho antigo
        gsap.set(cartao, { opacity: 1 });
        anima(gsap.fromTo(corpo, { clipPath: 'inset(0% 100% 0% 0%)' },
          { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.6, ease: 'steps(9)', clearProps: 'clipPath' }));
        return;
      }

      // a placa: cai com mola e os parafusos chegam de estalo
      const tl = cair(cartao, giro, indice % 2 ? 1 : -1, { gsap, anima });
      tl.fromTo(enfeites, { scale: 1.7, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(3)', stagger: 0.06 }, 0.34);
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
    entrar({ imediato = false } = {}) {
      if (entrou) return;
      entrou = true;
      fig.classList.remove('poppy-entra');
      if (imediato) { fig.classList.add('ligado'); gsap.set(fig, { opacity: 1 }); return; }
      if (amb.reduzido) {
        fig.classList.add('ligado');
        anima(gsap.fromTo(fig, { opacity: 0 }, { opacity: 1, duration: 0.55, ease: 'none' }));
        return;
      }
      gsap.set(img, { opacity: 0 });
      if (legendaEl) gsap.set(legendaEl, { opacity: 0 });
      const tl = cair(fig, giro, indice % 2 ? -1 : 1, { gsap, anima });
      // a tela liga: uma linha que abre, em degraus, e a imagem ainda procura o tracking
      tl.add(() => fig.classList.add('ligado'), 0.5);
      tl.set(img, { opacity: 1, scaleY: 0.012, scaleX: 0.72 }, 0.52);
      tl.to(img, { scaleY: 1, scaleX: 1, duration: 0.3, ease: 'steps(5)' }, 0.52);
      tl.fromTo(img, { x: 16 }, { x: 0, duration: 0.26, ease: 'steps(4)' }, 0.82);
      tl.fromTo(img, { opacity: 0.55 }, { opacity: 1, duration: 0.3, ease: 'steps(3)' }, 0.82);
      if (legendaEl) tl.set(legendaEl, { opacity: 1 }, 1.12);
    },
  };
}
