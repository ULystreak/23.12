/* ============================================================================
   POPPY / OSD: o que o videocassete escreve por cima da imagem
   ============================================================================
   O modo (ícone e palavra: tocar, avancar, voltar, parar), o contador da fita
   em h:mm:ss, as linhas de varredura do tubo e o clarão do desligar. A camada
   fica presa no alto da rolagem (position: sticky, altura zero) e a tela dela
   tem a altura da janela (medir): fica por cima do texto sem depender de
   position: fixed, que dentro da folha mudaria de referência.
   Os textos vêm do content.js; os ícones são desenhados (nada de glifo).
   ========================================================================== */

import { clamp, el, svg } from '../../nucleo/util.js';

const ICONES = {
  tocar: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 3.5v17L21 12z"/></svg>',
  avancar: '<svg viewBox="0 0 38 24" aria-hidden="true" focusable="false"><path d="M3 3.5v17L18 12zM19 3.5v17L34 12z"/></svg>',
  voltar: '<svg viewBox="0 0 38 24" aria-hidden="true" focusable="false"><path d="M35 3.5v17L20 12zM19 3.5v17L4 12z"/></svg>',
  parar: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.5 4.5h15v15h-15z"/></svg>',
};

// O rótulo muda de largura (PLAY, REW, STOP): a zona do modo conta com o mais largo.
const LARGURA_MODO = 210;

/** '0:23:12' → { total: 1392, campos: 3 }. Texto que não é hora vira null. */
function lerContador(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return null;
  const partes = texto.trim().split(':');
  if (partes.length > 3 || partes.some((p) => !/^\d+$/.test(p))) return null;
  const total = partes.reduce((soma, p) => soma * 60 + Number(p), 0);
  return Number.isFinite(total) && total >= 0 ? { total, campos: partes.length } : null;
}

function escrever(segundos, campos) {
  const s = Math.max(0, Math.floor(segundos));
  const dois = (n) => String(n).padStart(2, '0');
  if (campos >= 3) return `${Math.floor(s / 3600)}:${dois(Math.floor((s % 3600) / 60))}:${dois(s % 60)}`;
  if (campos === 2) return `${Math.floor(s / 60)}:${dois(s % 60)}`;
  return String(s);
}

export function criarOsd({ rotulos = {}, contadorFinal = '' } = {}) {
  const fim = lerContador(contadorFinal);
  const icone = el('span', 'poppy-osd-icone');
  const palavra = el('span', 'poppy-osd-palavra');
  const modoEl = el('div', 'poppy-osd-modo', [icone, palavra]);
  const contadorEl = fim ? el('div', { class: 'poppy-contador', texto: escrever(0, fim.campos) }) : null;
  const clarao = el('div', 'poppy-clarao');
  const tela = el('div', 'poppy-osd-tela', [el('div', 'poppy-varredura'), clarao, modoEl, contadorEl]);
  const raiz = el('div', { class: 'poppy-osd', 'aria-hidden': 'true' }, tela);

  let modoAtual = null;
  let textoAtual = contadorEl ? contadorEl.textContent : '';

  return {
    el: raiz,
    tela,
    clarao,
    get modoAtual() { return modoAtual; },

    modo(nome) {
      if (!nome || !ICONES[nome]) {
        // data-modo fica com o último valor; só o elemento some.
        modoAtual = null;
        modoEl.classList.remove('visivel');
        return;
      }
      modoAtual = nome;
      icone.replaceChildren(svg(ICONES[nome]));
      const r = rotulos?.[nome];
      palavra.textContent = typeof r === 'string' ? r : '';
      modoEl.dataset.modo = nome;
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
      contadorEl?.classList.add('visivel');
    },

    medir(altura) {
      if (altura > 0) tela.style.height = `${Math.round(altura)}px`;
    },

    // Medidas relativas a .poppy-osd-tela (position: relative no CSS).
    zonas() {
      const zona = (n, minimo = 0) => n && {
        topo: n.offsetTop,
        base: n.offsetTop + n.offsetHeight,
        esq: n.offsetLeft,
        dir: n.offsetLeft + Math.max(minimo, n.offsetWidth),
      };
      return { modo: zona(modoEl, LARGURA_MODO), contador: zona(contadorEl) };
    },

    // O videocassete apaga o que escreveu por cima até o texto sair dali: ela precisa ler.
    encobrir(parte, sim) {
      (parte === 'contador' ? contadorEl : modoEl)?.classList.toggle('sob-texto', !!sim);
    },
  };
}
