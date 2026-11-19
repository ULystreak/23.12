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

  const linha = el('p', 'letra-linha');
  const raiz = el('div', { id: 'letra', class: 'letra', 'aria-hidden': 'true' }, linha);
  document.body.append(raiz);

  let atual = -2;
  let verso = null;        // a linha mostrada agora
  let pedacos = [];        // os <span> das palavras dela
  let acesa = -1;          // a palavra em vermelho
  let ultimoTempo = 0;     // o último segundo que o som contou, e quando
  let quando = 0;
  let quadro = 0;

  const mostrar = (novo) => {
    if (novo === verso) return;
    verso = novo;
    acesa = -1;
    raiz.toggleAttribute('data-vazia', !novo?.texto);
    if (!novo?.texto) { pedacos = []; return; }   // a linha antiga some junto com o fundo (opacity no .letra)
    pedacos = novo.palavras.map((p) => el('span', 'letra-palavra', p.texto));
    linha.replaceChildren(...pedacos.flatMap((s, i) => (i ? [' ', s] : [s])));
    if (amb?.reduzido || !linha.animate) return;
    linha.animate(
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

  const agora = () => {
    const lido = typeof som.segundos === 'function' ? som.segundos() : 0;
    return lido > 0 ? lido : ultimoTempo + (performance.now() - quando) / 1000;
  };

  const atualizar = (t) => {
    const lista = letras[som.estado.indice] || [];
    if (!som.estado.tocando || !lista.length) { atual = -2; mostrar(null); return; }
    let i = -1;
    for (let k = 0; k < lista.length && lista[k].t <= t + 0.05; k++) i = k;
    if (i !== atual) { atual = i; mostrar(i >= 0 ? lista[i] : null); }
    acender(t);
  };

  // Enquanto toca, segue o tempo a cada quadro (o aviso do som vem só umas 4 vezes por segundo).
  const girar = () => {
    quadro = 0;
    if (!som.estado.tocando) return;
    atualizar(agora());
    quadro = requestAnimationFrame(girar);
  };
  const ligar = () => { if (!quadro && som.estado.tocando) quadro = requestAnimationFrame(girar); };

  const aoTempo = (_p, s) => {
    ultimoTempo = s;
    quando = performance.now();
    atualizar(s);
    ligar();
  };
  const cancelarTempo = som.aoTempo(aoTempo);
  const cancelarMudar = som.aoMudar(() => {
    if (!som.estado.tocando) { atual = -2; mostrar(null); } else ligar();
  });
  mostrar(null);
  return {
    parar() {
      cancelarTempo?.();
      cancelarMudar?.();
      cancelAnimationFrame(quadro);
      raiz.remove();
    },
  };
}
