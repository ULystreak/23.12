// Capítulo 2: o filme. Um céu que passa do dia à noite com a rolagem.
//
//   export const capitulo = { id, montar(raiz, api) → { destruir() } }
//   api = { conteudo, amb, som, rolagem, fundo, gsap, ScrollTrigger, fechar(), recursos }
//
// Blocos (conteudo.yourname.blocos), em ordem livre:
//   { tipo: 'texto', texto }
//   { tipo: 'cordao' }
//   { tipo: 'imagem-cheia', arquivo, alt }
//   { tipo: 'imagem', arquivo, alt, legenda }
//   { tipo: 'par', dele, dela, legendaDele, legendaDela }
//
// Gancho para os testes (não mudar): [data-acao="fechar-capitulo"].
// Versão do esqueleto: céu em faixas de cor que sobem com a rolagem, blocos com
// estilo básico. Cenas maiores podem ir para js/capitulos/yourname/*.

import { el, svg } from '../nucleo/util.js';

// O cordão trançado: três fios que se cruzam.
const CORDAO = `
  <svg viewBox="0 0 600 60" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 30 Q 25 4 50 30 T 100 30 T 150 30 T 200 30 T 250 30 T 300 30 T 350 30 T 400 30 T 450 30 T 500 30 T 550 30 T 600 30" fill="none" stroke="#d7192d" stroke-width="5" stroke-linecap="round"/>
    <path d="M0 30 Q 25 56 50 30 T 100 30 T 150 30 T 200 30 T 250 30 T 300 30 T 350 30 T 400 30 T 450 30 T 500 30 T 550 30 T 600 30" fill="none" stroke="#a80f22" stroke-width="5" stroke-linecap="round"/>
    <path d="M0 30 H600" fill="none" stroke="#ff5a5f" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="14 36"/>
  </svg>`;

// O fio que liga as duas imagens do par.
const FIO_PAR = `
  <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 14 C 30 40, 70 -6, 100 22" fill="none" stroke="#d7192d" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg>`;

export const capitulo = {
  id: 'yourname',

  async montar(raiz, api) {
    const c = api.conteudo.yourname || {};
    const blocos = Array.isArray(c.blocos) ? c.blocos : [];
    const { recursos } = api;
    raiz.classList.add('yn');
    api.fundo.classList.add('yn-fundo');

    // Céu: uma faixa alta, do dia (em cima) à noite (embaixo), que sobe conforme ela rola.
    const ceu = el('div', 'yn-ceu');
    api.fundo.append(ceu);
    recursos.imagem(c.fundo).then((img) => {
      if (img) ceu.style.backgroundImage = `url("${img.src}")`;
    });
    const moverCeu = (progresso) => {
      ceu.style.transform = `translate3d(0, ${(-progresso * 75).toFixed(3)}%, 0)`;
    };
    moverCeu(0);
    const pararRolagem = api.rolagem.aoRolar(moverCeu);

    // Capa + título
    const capa = await recursos.elementoImagem(c.capa, '');
    raiz.append(el('header', 'yn-cabeca', [
      capa ? el('div', 'yn-capa', capa) : null,
      c.titulo ? el('h2', 'yn-titulo', c.titulo) : null,
      c.subtitulo ? el('p', 'yn-subtitulo', c.subtitulo) : null,
    ]));

    for (const bloco of blocos) {
      let parte = null;
      switch (bloco?.tipo) {
        case 'texto':
          if (bloco.texto) parte = el('p', 'yn-texto', bloco.texto);
          break;
        case 'cordao':
          parte = el('div', 'yn-cordao', svg(CORDAO));
          break;
        case 'imagem-cheia': {
          const img = await recursos.elementoImagem(bloco.arquivo, bloco.alt || '');
          if (img) parte = el('figure', 'yn-imagem-cheia', img);
          break;
        }
        case 'imagem': {
          const img = await recursos.elementoImagem(bloco.arquivo, bloco.alt || '');
          if (img) parte = el('figure', 'yn-imagem', [img, bloco.legenda ? el('figcaption', null, bloco.legenda) : null]);
          break;
        }
        case 'par': {
          const [dele, dela] = await Promise.all([
            recursos.elementoImagem(bloco.dele, bloco.legendaDele ? '' : (bloco.altDele || '')),
            recursos.elementoImagem(bloco.dela, bloco.legendaDela ? '' : (bloco.altDela || '')),
          ]);
          // Só existe par com as duas imagens; uma sozinha vira imagem comum.
          if (dele && dela) {
            parte = el('div', 'yn-par', [
              el('figure', 'yn-par-lado', [dele, bloco.legendaDele ? el('figcaption', null, bloco.legendaDele) : null]),
              el('div', 'yn-par-fio', svg(FIO_PAR)),
              el('figure', 'yn-par-lado', [dela, bloco.legendaDela ? el('figcaption', null, bloco.legendaDela) : null]),
            ]);
          } else if (dele || dela) {
            parte = el('figure', 'yn-imagem', dele || dela);
          }
          break;
        }
        default:
          break;
      }
      if (parte) raiz.append(parte);
    }

    const fechar = el('button', {
      class: 'yn-fechar', type: 'button', dataset: { acao: 'fechar-capitulo' }, texto: c.fechar || '',
    });
    fechar.addEventListener('click', () => {
      api.som.efeito('brilho');
      api.fechar();
    }, { once: true });
    raiz.append(el('footer', 'yn-rodape', fechar));

    return {
      destruir() {
        pararRolagem();
        raiz.classList.remove('yn');
        api.fundo.classList.remove('yn-fundo');
        api.fundo.textContent = '';
        raiz.textContent = '';
      },
    };
  },
};
