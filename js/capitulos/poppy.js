// Capítulo 1: o jogo. A fábrica de brinquedos numa fita antiga.
//
//   export const capitulo = { id, montar(raiz, api) → { destruir() } }
//   api = { conteudo, amb, som, rolagem, fundo, gsap, ScrollTrigger, fechar(), recursos }
//
// Blocos (conteudo.poppy.blocos), em ordem livre:
//   { tipo: 'texto', texto }
//   { tipo: 'imagem', arquivo, alt, legenda }
//   { tipo: 'cena', cena: 'maos' | 'fita' | 'esteira', ... }
//
// Gancho para os testes (não mudar): [data-acao="fechar-capitulo"].
// Versão do esqueleto: monta os blocos com estilo básico. Cenas maiores podem ir
// para js/capitulos/poppy/*.

import { el, svg } from '../nucleo/util.js';

const DESENHOS = {
  // Duas mãos de brinquedo (uma azul, uma vermelha) esticadas uma para a outra.
  maos: () => svg(`
    <svg viewBox="0 0 320 120" aria-hidden="true">
      <path d="M0 60H96" stroke="#f6c12d" stroke-width="10" stroke-linecap="round"/>
      <path d="M320 60H224" stroke="#f6c12d" stroke-width="10" stroke-linecap="round"/>
      <g fill="#2f8fd8"><rect x="92" y="36" width="46" height="48" rx="14"/><rect x="132" y="38" width="22" height="10" rx="5"/><rect x="132" y="52" width="26" height="10" rx="5"/><rect x="132" y="66" width="22" height="10" rx="5"/></g>
      <g fill="#e2332f"><rect x="182" y="36" width="46" height="48" rx="14"/><rect x="166" y="38" width="22" height="10" rx="5"/><rect x="162" y="52" width="26" height="10" rx="5"/><rect x="166" y="66" width="22" height="10" rx="5"/></g>
    </svg>`),

  // Uma fita de vídeo com etiqueta.
  fita: (bloco) => {
    const caixa = el('div', 'poppy-fita');
    caixa.append(svg(`
      <svg viewBox="0 0 320 180" aria-hidden="true">
        <rect x="4" y="4" width="312" height="172" rx="10" fill="#101820" stroke="#f2ead8" stroke-width="3"/>
        <rect x="28" y="24" width="264" height="56" rx="4" fill="#f2ead8"/>
        <rect x="60" y="98" width="200" height="58" rx="8" fill="#0d2534" stroke="#f2ead8" stroke-width="2"/>
        <circle cx="110" cy="127" r="19" fill="none" stroke="#f2ead8" stroke-width="3"/>
        <circle cx="210" cy="127" r="19" fill="none" stroke="#f2ead8" stroke-width="3"/>
        <circle cx="110" cy="127" r="5" fill="#e2332f"/><circle cx="210" cy="127" r="5" fill="#e2332f"/>
      </svg>`));
    if (bloco.etiqueta) caixa.append(el('p', 'poppy-fita-etiqueta', bloco.etiqueta));
    if (bloco.data) caixa.append(el('p', 'poppy-fita-data', bloco.data));
    return caixa;
  },

  // Uma esteira de fábrica carregando palavras.
  esteira: (bloco) => {
    const itens = Array.isArray(bloco.itens) ? bloco.itens.filter(Boolean) : [];
    const faixa = el('ul', 'poppy-esteira-faixa', itens.map((texto, i) => el('li', { class: `poppy-caixa poppy-caixa-${i % 4}` }, texto)));
    return el('div', 'poppy-esteira', [faixa, el('div', { class: 'poppy-esteira-base', 'aria-hidden': 'true' })]);
  },
};

export const capitulo = {
  id: 'poppy',

  async montar(raiz, api) {
    const c = api.conteudo.poppy || {};
    const blocos = Array.isArray(c.blocos) ? c.blocos : [];
    raiz.classList.add('poppy');
    api.fundo.classList.add('poppy-fundo');

    // Fundo opcional (some se o arquivo não existir).
    api.recursos.imagem(c.fundo).then((img) => {
      if (img) api.fundo.style.backgroundImage = `url("${img.src}")`;
    });

    const cabeca = el('header', 'poppy-cabeca', [
      c.titulo ? el('h2', 'poppy-titulo', c.titulo) : null,
      c.subtitulo ? el('p', 'poppy-subtitulo', c.subtitulo) : null,
    ]);
    raiz.append(cabeca);

    const partes = [cabeca];
    for (const bloco of blocos) {
      let parte = null;
      if (bloco?.tipo === 'texto' && bloco.texto) {
        parte = el('p', 'poppy-texto', bloco.texto);
      } else if (bloco?.tipo === 'imagem') {
        const img = await api.recursos.elementoImagem(bloco.arquivo, bloco.alt || '');
        if (img) {
          parte = el('figure', 'poppy-imagem', [img, bloco.legenda ? el('figcaption', null, bloco.legenda) : null]);
        }
      } else if (bloco?.tipo === 'cena' && DESENHOS[bloco.cena]) {
        parte = el('div', { class: `poppy-cena poppy-cena-${bloco.cena}` }, DESENHOS[bloco.cena](bloco));
      }
      if (parte) {
        raiz.append(parte);
        partes.push(parte);
      }
    }

    const fechar = el('button', {
      class: 'poppy-fechar', type: 'button', dataset: { acao: 'fechar-capitulo' }, texto: c.fechar || '',
    });
    fechar.addEventListener('click', () => {
      api.som.efeito('fita');
      api.fechar();
    }, { once: true });
    const rodape = el('footer', 'poppy-rodape', fechar);
    raiz.append(rodape);
    partes.push(rodape);

    // Cada parte "cai" no lugar quando entra na tela (o CSS faz o quique).
    let observador = null;
    if ('IntersectionObserver' in window) {
      observador = new IntersectionObserver((entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;
          entrada.target.classList.add('visivel');
          observador.unobserve(entrada.target);
        }
      }, { root: api.rolagem.el, rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      for (const parte of partes) {
        parte.classList.add('poppy-entra');
        observador.observe(parte);
      }
    }

    return {
      destruir() {
        if (observador) observador.disconnect();
        raiz.classList.remove('poppy');
        api.fundo.classList.remove('poppy-fundo');
        api.fundo.style.backgroundImage = '';
        raiz.textContent = '';
      },
    };
  },
};
