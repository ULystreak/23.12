// A letra da música, em português, passando no alto da tela enquanto tudo acontece.
// A palavra que está sendo cantada fica vermelha e sublinhada (como num karaokê).
//
//   criarLetra({ conteudo, som, amb }) → { parar() }
//
// Cada faixa de conteudo.musica.faixas pode ter `letra`: um texto no formato LRC,
// uma linha por verso, com o tempo em que ele começa: "[01:23.50] o verso".
// Pode ter também o tempo de cada palavra: "[01:23.50] <01:23.50>o <01:23.90>verso"
// (o _dev/sincronizar-letra.mjs escreve assim). Sem o tempo das palavras, elas são
// repartidas pelo tempo do verso. Uma linha só com o tempo apaga a letra até o próximo verso.
// Sem letra (ou com musica.legenda: false) nada aparece. A linha some quando a
// música pausa e troca sozinha quando a faixa troca. Só opacity, transform e cor.
// Onde ela dá passagem (outra voz falando, a carta falando) está em css/letra.css.

import { el } from './nucleo/util.js';

const TAG = /\[(\d{1,2}):(\d{1,2}(?:[.,]\d{1,3})?)\]/g;
const TAG_PALAVRA = /<(\d{1,2}):(\d{1,2}(?:[.,]\d{1,3})?)>/g;
const segundos = (m, s) => Number(m) * 60 + Number(String(s).replace(',', '.'));
const POR_PALAVRA = 0.42;   // s: sem tempo das palavras, quanto cada uma dura no máximo

/** "[mm:ss.cc] texto" → [{ t, texto, palavras: [{ t, texto }] | null }] em ordem de tempo. */
export function lerLrc(texto) {
  if (Array.isArray(texto)) return texto.filter((l) => l && Number.isFinite(l.t)).sort((a, b) => a.t - b.t);
  const linhas = [];
  for (const bruta of String(texto || '').split(/\r?\n/)) {
    const tempos = [...bruta.matchAll(TAG)];
    if (!tempos.length) continue;
    const corpo = bruta.replace(TAG, '');
    let palavras = null;
    if (/<\d{1,2}:\d/.test(corpo)) {
      palavras = [];
      // Cada <tempo> marca o começo do pedaço de texto que vem depois dele.
      const partes = corpo.split(TAG_PALAVRA);   // [antes, m, s, texto, m, s, texto, ...]
      if (partes[0].trim()) palavras.push({ t: null, texto: partes[0].trim() });
      for (let i = 1; i + 2 < partes.length; i += 3) {
        const t = segundos(partes[i], partes[i + 1]);
        for (const p of partes[i + 2].trim().split(/\s+/).filter(Boolean)) palavras.push({ t, texto: p });
      }
    }
    const verso = palavras ? palavras.map((p) => p.texto).join(' ') : corpo.trim();
    for (const m of tempos) {
      const t = segundos(m[1], m[2]);
      linhas.push({ t, texto: verso, palavras: palavras && palavras.map((p) => ({ t: p.t ?? t, texto: p.texto })) });
    }
  }
  linhas.sort((a, b) => a.t - b.t);
  // Sem o tempo das palavras: reparte o verso pelo tempo até o próximo, sem passar do ritmo de fala.
  linhas.forEach((l, i) => {
    if (l.palavras || !l.texto) return;
    const lista = l.texto.split(/\s+/).filter(Boolean);
    const ate = linhas[i + 1]?.t ?? l.t + lista.length * POR_PALAVRA;
    const passo = Math.min(POR_PALAVRA, Math.max(0.05, (ate - l.t) * 0.9) / lista.length);
    l.palavras = lista.map((p, k) => ({ t: l.t + k * passo, texto: p }));
  });
  return linhas;
}

export function criarLetra({ conteudo, som, amb }) {
  const dados = conteudo?.musica || {};
  const faixas = Array.isArray(dados.faixas) ? dados.faixas : [];
  const letras = faixas.map((f) => lerLrc(f?.letra));
  if (dados.legenda === false || !letras.some((l) => l.length)) return { parar() {} };

  // Na troca de verso só o texto anima; a caixa escura fica (não pisca no alto da tela).
  // Nasce vazia: até o primeiro verso cantado não há caixa nenhuma.
  const texto = el('span', 'letra-texto');
  const raiz = el('div', { id: 'letra', class: 'letra', 'aria-hidden': 'true', 'data-vazia': '' }, el('p', 'letra-linha', texto));
  document.body.append(raiz);

  let verso = null;        // a linha mostrada agora
  let pedacos = [];        // os <span> das palavras dela
  let acesa = -1;          // a palavra em vermelho
  let quadro = 0;

  const mostrar = (novo) => {
    if (novo === verso) return;
    verso = novo;
    acesa = -1;
    raiz.toggleAttribute('data-vazia', !novo?.texto);
    if (!novo?.texto) { pedacos = []; return; }   // a linha antiga some junto com o fundo (opacity no .letra)
    pedacos = novo.palavras.map((p) => el('span', 'letra-palavra', p.texto));
    texto.replaceChildren(...pedacos.flatMap((s, i) => (i ? [' ', s] : [s])));
    if (amb?.reduzido || !texto.animate) return;
    texto.animate(
      [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  };

  const acender = (agora) => {
    if (!verso?.palavras) return;
    let i = -1;
    for (let k = 0; k < verso.palavras.length && verso.palavras[k].t <= agora + 0.04; k++) i = k;
    if (i === acesa) return;
    if (pedacos[acesa]) pedacos[acesa].removeAttribute('data-agora');
    acesa = i;
    if (pedacos[i]) pedacos[i].setAttribute('data-agora', '');
  };

  // `t` é o segundo da própria faixa, nunca adivinhado: com o mp3 travado, ainda chegando,
  // trocando de faixa (volta a 0) ou no mudo, ele fica em 0 e nada aparece.
  const atualizar = (t) => {
    const lista = letras[som.estado.indice] || [];
    if (!som.estado.tocando || !lista.length || !(t > 0)) { mostrar(null); return; }
    let i = -1;
    for (let k = 0; k < lista.length && lista[k].t <= t + 0.05; k++) i = k;
    mostrar(i >= 0 ? lista[i] : null);
    acender(t);
  };

  // Enquanto toca, segue o tempo a cada quadro (o aviso do som vem só umas 4 vezes por segundo).
  const girar = () => {
    quadro = 0;
    if (!som.estado.tocando) return;
    atualizar(som.segundos());
    quadro = requestAnimationFrame(girar);
  };
  const ligar = () => { if (!quadro && som.estado.tocando) quadro = requestAnimationFrame(girar); };

  const cancelarTempo = som.aoTempo((_p, s) => { atualizar(s); ligar(); });
  const cancelarMudar = som.aoMudar(() => { if (som.estado.tocando) ligar(); else mostrar(null); });
  return {
    parar() {
      cancelarTempo?.();
      cancelarMudar?.();
      cancelAnimationFrame(quadro);
      raiz.remove();
    },
  };
}
