/* ============================================================================
   LETRA: o karaokê no alto da tela
   ============================================================================
   Lê o campo `letra` de cada faixa (LRC: tag de verso [mm:ss.cc] e, se houver,
   tag de palavra <mm:ss.cc> antes de cada palavra; também aceita uma lista
   pronta), mostra um verso por vez e acende em vermelho, sublinhada, a palavra
   que está sendo cantada. Segue só o segundo que o áudio informa: sem música
   tocando, com a faixa trocando ou no segundo zero, a caixa some. Não toca som
   nem muda de cena; quando ela dá passagem às outras vozes é regra de
   css/letra.css. A letra é lida só aqui, em tempo de execução.
   ========================================================================== */

import { el } from './nucleo/util.js';

const TAG = /\[(\d{1,2}):(\d{1,2}(?:[.,]\d{1,3})?)\]/g;
const TAG_PALAVRA = /<(\d{1,2}):(\d{1,2}(?:[.,]\d{1,3})?)>/g;
// Duração máxima de cada palavra quando o verso não traz tempo por palavra.
const POR_PALAVRA = 0.42;
// Antecipação de leitura: o verso troca e a palavra acende um tico antes do canto.
const ANTES_VERSO = 0.05;
const ANTES_PALAVRA = 0.04;

function segundos(m, s) {
  return Number(m) * 60 + Number(String(s).replace(',', '.'));
}

// A palavra acesa é a última que já passou: os tempos de um verso nunca voltam.
function emOrdem(palavras) {
  for (let k = 1; k < palavras.length; k++) palavras[k].t = Math.max(palavras[k].t, palavras[k - 1].t);
  return palavras;
}

/** Texto LRC (ou lista pronta) → [{ t, texto, palavras: [{ t, texto }] | null }] em ordem de t. */
function lerLrc(fonte) {
  const linhas = [];
  if (Array.isArray(fonte)) {
    for (const item of fonte) {
      if (!Number.isFinite(item?.t)) continue;
      const palavras = (Array.isArray(item.palavras) ? item.palavras : [])
        .filter((p) => typeof p?.texto === 'string' && p.texto.trim())
        .map((p) => ({ t: Number.isFinite(p.t) ? p.t : item.t, texto: p.texto.trim() }));
      linhas.push({
        t: item.t,
        texto: palavras.length ? palavras.map((p) => p.texto).join(' ') : (typeof item.texto === 'string' ? item.texto.trim() : ''),
        palavras: palavras.length ? emOrdem(palavras) : null,
      });
    }
  } else if (typeof fonte === 'string') {
    for (const crua of fonte.split(/\r?\n/)) {
      const tempos = [...crua.matchAll(TAG)].map((m) => segundos(m[1], m[2]));
      if (!tempos.length) continue;
      // [antes, m, s, trecho, m, s, trecho, ...]
      const partes = crua.replace(TAG, '').split(TAG_PALAVRA);
      let palavras = null;
      let verso = partes[0].trim();
      if (partes.length > 1) {
        const lista = [];
        const somar = (trecho, t) => {
          for (const p of trecho.split(/\s+/)) if (p) lista.push({ t, texto: p });
        };
        somar(partes[0], null);
        for (let k = 1; k < partes.length; k += 3) somar(partes[k + 2], segundos(partes[k], partes[k + 1]));
        verso = lista.map((p) => p.texto).join(' ');
        palavras = lista.length ? lista : null;
      }
      for (const t of tempos) {
        // Um verso com várias tags se repete; as palavras andam junto com ele.
        const desloc = t - tempos[0];
        linhas.push({
          t,
          texto: verso,
          palavras: palavras && emOrdem(palavras.map((p) => ({ t: (p.t ?? tempos[0]) + desloc, texto: p.texto }))),
        });
      }
    }
  }

  linhas.sort((a, b) => a.t - b.t);
  // Sem tempo por palavra: o verso é repartido até o próximo (as linhas vazias contam).
  linhas.forEach((linha, i) => {
    if (linha.palavras || !linha.texto) return;
    const termos = linha.texto.split(/\s+/);
    const n = termos.length;
    const ate = i + 1 < linhas.length ? linhas[i + 1].t : linha.t + n * POR_PALAVRA;
    const passo = Math.min(POR_PALAVRA, Math.max(0.05, (ate - linha.t) * 0.9) / n);
    linha.palavras = termos.map((p, k) => ({ t: linha.t + k * passo, texto: p }));
  });
  return linhas;
}

export function criarLetra({ conteudo, som, amb }) {
  const dados = conteudo?.musica || {};
  const letras = (Array.isArray(dados.faixas) ? dados.faixas : []).map((f) => lerLrc(f?.letra));
  if (dados.legenda === false || !som || !letras.some((l) => l.length)) return { parar() {} };

  const texto = el('span', 'letra-texto');
  const caixa = el('div', { id: 'letra', class: 'letra', 'aria-hidden': 'true', 'data-vazia': '' }, el('p', 'letra-linha', texto));
  document.body.append(caixa);

  const anima = !amb?.reduzido && typeof texto.animate === 'function';
  let verso = null;
  let pedacos = [];
  let acesa = -1;
  let quadro = 0;
  let faixa = som.estado?.indice ?? -1;

  // Troca o verso. A caixa e o fundo não piscam: só o texto entra. Ao esvaziar,
  // o texto antigo fica e some junto com a caixa.
  function mostrar(novo) {
    if (novo === verso) return;
    verso = novo;
    acesa = -1;
    if (!novo?.texto || !novo.palavras) {
      caixa.setAttribute('data-vazia', '');
      return;
    }
    pedacos = novo.palavras.map((p) => el('span', 'letra-palavra', p.texto));
    texto.replaceChildren(...pedacos.flatMap((s, k) => (k ? [' ', s] : [s])));
    caixa.removeAttribute('data-vazia');
    if (anima) {
      texto.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], {
        duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      });
    }
  }

  function acender(agora) {
    const lista = verso?.palavras || [];
    let k = -1;
    while (k + 1 < lista.length && lista[k + 1].t <= agora + ANTES_PALAVRA) k += 1;
    if (k === acesa) return;
    pedacos[acesa]?.removeAttribute('data-agora');
    pedacos[k]?.setAttribute('data-agora', '');
    acesa = k;
  }

  function atualizar(t) {
    const linhas = letras[som.estado?.indice] || [];
    if (!som.estado?.tocando || !linhas.length || !(t > 0)) {
      mostrar(null);
      return;
    }
    let achado = null;
    for (const linha of linhas) {
      if (linha.t > t + ANTES_VERSO) break;
      achado = linha;
    }
    mostrar(achado);
    acender(t);
  }

  // Segue o tempo a cada quadro (o aviso do áudio chega poucas vezes por segundo).
  // Sem tempo andando (mudo, arquivo chegando) o laço dorme; o aviso de tempo o acorda.
  function girar() {
    quadro = 0;
    const t = som.segundos?.() || 0;
    atualizar(t);
    if (som.estado?.tocando && t > 0) quadro = requestAnimationFrame(girar);
  }

  function ligar() {
    if (!quadro) quadro = requestAnimationFrame(girar);
  }

  const pararTempo = som.aoTempo?.((_p, s) => {
    atualizar(s);
    ligar();
  });
  const pararMudar = som.aoMudar?.(() => {
    // Nenhum verso da faixa anterior sobrevive à troca.
    if ((som.estado?.indice ?? -1) !== faixa) {
      faixa = som.estado?.indice ?? -1;
      mostrar(null);
    }
    if (som.estado?.tocando) ligar();
    else mostrar(null);
  });

  return {
    parar() {
      pararTempo?.();
      pararMudar?.();
      cancelAnimationFrame(quadro);
      quadro = 0;
      caixa.remove();
    },
  };
}
