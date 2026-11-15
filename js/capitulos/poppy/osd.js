// O que o videocassete escreve por cima da imagem: o modo (PLAY, FF, REW,
// STOP), o contador da fita e as linhas de varredura do tubo.
//
//   const osd = criarOsd({ rotulos: conteudo.poppy.osd, contadorFinal });
//   osd.el                    camada pegajosa: é o primeiro filho da raiz do capítulo
//   osd.modo('tocar' | 'avancar' | 'voltar' | 'parar' | null)
//   osd.contador(progresso)   0..1 → de zero até `contadorFinal`
//   osd.mostrarContador()
//   osd.medir(altura)         altura da janela de rolagem, em px
//
// A camada fica presa no alto da rolagem (position: sticky, altura zero) e o
// conteúdo dela tem a altura da tela: assim fica por cima do texto sem depender
// de `position: fixed`, que dentro da folha mudaria de referência.
//
// Os textos vêm do content.js; os ícones são desenhados (nada de glifo).

import { clamp, el, svg } from '../../nucleo/util.js';

const ICONES = {
  tocar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5v17L21 12z"/></svg>',
  avancar: '<svg viewBox="0 0 38 24" aria-hidden="true"><path d="M3 3.5v17L18 12zM20 3.5v17L35 12z"/></svg>',
  voltar: '<svg viewBox="0 0 38 24" aria-hidden="true"><path d="M35 3.5v17L20 12zM18 3.5v17L3 12z"/></svg>',
  parar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 4.5h15v15h-15z"/></svg>',
};

/** '0:23:12' → { total: 1392, campos: 3 }; texto que não é hora → null. */
function lerContador(texto) {
  const limpo = String(texto ?? '').trim();
  if (!limpo) return null;
  const partes = limpo.split(':').map((p) => Number(p));
  if (partes.length > 3 || partes.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return { total: partes.reduce((soma, n) => soma * 60 + n, 0), campos: partes.length };
}

function escrever(segundos, campos) {
  const s = Math.floor(segundos % 60);
  const m = Math.floor(segundos / 60) % 60;
  const h = Math.floor(segundos / 3600);
  const dois = (n) => String(n).padStart(2, '0');
  if (campos >= 3) return `${h}:${dois(m)}:${dois(s)}`;
  if (campos === 2) return `${Math.floor(segundos / 60)}:${dois(s)}`;
  return String(Math.floor(segundos));
}

export function criarOsd({ rotulos = {}, contadorFinal = '' }) {
  const fim = lerContador(contadorFinal);

  const icone = el('span', 'poppy-osd-icone');
  const palavra = el('span', 'poppy-osd-palavra');
  const modoEl = el('div', 'poppy-osd-modo', [icone, palavra]);
  const contadorEl = fim ? el('div', 'poppy-contador', escrever(0, fim.campos)) : null;
  const varredura = el('div', 'poppy-varredura');
  const clarao = el('div', 'poppy-clarao');
  const tela = el('div', 'poppy-osd-tela', [varredura, clarao, modoEl, contadorEl]);
  const camada = el('div', { class: 'poppy-osd', 'aria-hidden': 'true' }, tela);

  let modoAtual = null;
  let textoAtual = contadorEl ? contadorEl.textContent : '';

  return {
    el: camada,
    tela,
    clarao,
    get modoAtual() { return modoAtual; },

    modo(nome) {
      const proximo = nome && ICONES[nome] ? nome : null;
      if (proximo === modoAtual) return;
      modoAtual = proximo;
      if (!proximo) {
        modoEl.classList.remove('visivel');
        return;
      }
      icone.textContent = '';
      icone.append(svg(ICONES[proximo]));
      palavra.textContent = String(rotulos[proximo] ?? '');
      modoEl.dataset.modo = proximo;
      // Reinicia o corte de entrada mesmo que já estivesse à vista.
      modoEl.classList.remove('visivel');
      void modoEl.offsetWidth;
      modoEl.classList.add('visivel');
    },

    contador(progresso) {
      if (!contadorEl) return;
      const texto = escrever(clamp(progresso) * fim.total, fim.campos);
      if (texto === textoAtual) return;
      textoAtual = texto;
      contadorEl.textContent = texto;
    },

    mostrarContador() {
      if (contadorEl) contadorEl.classList.add('visivel');
    },

    medir(altura) {
      if (altura > 0) tela.style.height = `${altura}px`;
    },

    /** Onde o modo e o contador ficam na tela (px, a partir do canto de cima da janela). */
    zonas() {
      const caixa = (no, larguraMin = 0) => (no ? {
        topo: no.offsetTop, base: no.offsetTop + no.offsetHeight,
        esq: no.offsetLeft, dir: no.offsetLeft + Math.max(no.offsetWidth, larguraMin),
      } : null);
      // o rótulo muda de largura (PLAY, REW, STOP): conta com o mais largo
      return { modo: caixa(modoEl, 210), contador: caixa(contadorEl) };
    },

    /**
     * Quando um texto passa por baixo, o videocassete apaga o que escreveu por
     * cima até o texto sair dali (ela precisa ler; o OSD volta sozinho).
     */
    encobrir(parte, sim) {
      const no = parte === 'modo' ? modoEl : contadorEl;
      if (no) no.classList.toggle('sob-texto', !!sim);
    },
  };
}
