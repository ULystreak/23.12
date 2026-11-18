// A letra da música, em português, passando no alto da tela enquanto tudo acontece.
//
//   criarLetra({ conteudo, som, amb }) → { parar() }
//
// Cada faixa de conteudo.musica.faixas pode ter `letra`: um texto no formato LRC,
// uma linha por verso, com o tempo em que ele começa: "[01:23.50] o verso".
// Sem letra (ou com musica.legenda: false) nada aparece. A linha some quando a
// música pausa e troca sozinha quando a faixa troca. Só opacity e transform.

import { el } from './nucleo/util.js';

/** "[mm:ss.cc] texto" → [{ t, texto }] em ordem de tempo. Linhas sem tempo são ignoradas. */
export function lerLrc(texto) {
  if (Array.isArray(texto)) return texto.filter((l) => l && Number.isFinite(l.t)).sort((a, b) => a.t - b.t);
  const linhas = [];
  for (const bruta of String(texto || '').split(/\r?\n/)) {
    const tempos = [...bruta.matchAll(/\[(\d{1,2}):(\d{1,2}(?:[.,]\d{1,3})?)\]/g)];
    if (!tempos.length) continue;
    const verso = bruta.replace(/\[\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?\]/g, '').trim();
    for (const m of tempos) linhas.push({ t: Number(m[1]) * 60 + Number(m[2].replace(',', '.')), texto: verso });
  }
  return linhas.sort((a, b) => a.t - b.t);
}

export function criarLetra({ conteudo, som, amb }) {
  const dados = conteudo?.musica || {};
  const faixas = Array.isArray(dados.faixas) ? dados.faixas : [];
  const letras = faixas.map((f) => lerLrc(f?.letra));
  if (dados.legenda === false || !letras.some((l) => l.length)) return { parar() {} };

  const linha = el('p', 'letra-linha');
  const raiz = el('div', { id: 'letra', class: 'letra', 'aria-hidden': 'true' }, linha);
  document.body.append(raiz);

  let atual = -2;
  let texto = '';
  const mostrar = (novo) => {
    if (novo === texto) return;
    texto = novo;
    raiz.toggleAttribute('data-vazia', !novo);
    if (!novo) return;   // a linha antiga some junto com o fundo (opacity no .letra)
    linha.textContent = novo;
    if (amb?.reduzido || !linha.animate) return;
    linha.animate(
      [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  };

  const aoTempo = (_p, segundos) => {
    const lista = letras[som.estado.indice] || [];
    if (!som.estado.tocando || !lista.length) { atual = -2; mostrar(''); return; }
    let i = -1;
    for (let k = 0; k < lista.length && lista[k].t <= segundos + 0.05; k++) i = k;
    if (i === atual) return;
    atual = i;
    mostrar(i >= 0 ? lista[i].texto : '');
  };
  const cancelarTempo = som.aoTempo(aoTempo);
  const cancelarMudar = som.aoMudar(() => { if (!som.estado.tocando) { atual = -2; mostrar(''); } });
  mostrar('');
  return {
    parar() { cancelarTempo?.(); cancelarMudar?.(); raiz.remove(); },
  };
}
