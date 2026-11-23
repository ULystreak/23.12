/* ============================================================================
   SINCRONIZAR-LETRA: os tempos da letra, puxados para o canto de verdade
   ============================================================================
   Só troca os tempos: o texto dos versos não muda. Recebe um JSON feito fora
   do repositório (ex.: Whisper) com o tempo de cada palavra cantada, por mp3:
     { "assets/music/x.mp3": { "palavras": [[ini, fim], ...],
                               "frases":   [[ini, fim, nPalavras], ...] } }
   Cada verso começa na posição proporcional ao seu tamanho no canto, puxada
   para o começo de uma frase cantada quando há uma por perto; cada palavra
   ganha a tag <mm:ss.cc> da palavra cantada que lhe corresponde; pausa longa
   ganha uma linha só de tempo, para o verso sumir ali. Tradução e canto não
   têm a mesma ordem de palavras: o resultado é aproximado.

   Uso: node _dev/sincronizar-letra.mjs <tempos.json>
   Nenhuma mensagem mostra a letra: só contagens e tempos.
   ========================================================================== */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTEUDO = path.join(RAIZ, 'js', 'content.js');
const TAG = /\[\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?\]/g;
const TAG_PALAVRA = /<\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?>/g;
const ANTES = 0.25; // s: o verso aparece um pouco antes de ser cantado
const MINIMO = 1.4; // s: cada verso fica pelo menos isso na tela
const SILENCIO = 4; // s: pausa maior que isso e o verso some no meio dela
const PERTO = 3; // palavras: até onde o verso é puxado para um começo de frase
// Cada faixa com o campo letra DELA: o (?!arquivo:) não deixa o mp3 de uma
// faixa sem letra casar com a letra da faixa seguinte.
const FAIXA = /(arquivo:\s*'([^']+\.mp3)'(?:(?!arquivo:)[\s\S])*?letra:\s*`)((?:\\[\s\S]|[^\\`])*)`/g;

/** Segundos → "[mm:ss.cc]"; negativo vira zero. */
function fmt(s) {
  const cs = Math.round(Math.max(0, s) * 100);
  const m = Math.floor(cs / 6000);
  return `[${String(m).padStart(2, '0')}:${((cs - m * 6000) / 100).toFixed(2).padStart(5, '0')}]`;
}

/** Os versos (já sem marcas) e os tempos do canto → as linhas novas do campo. */
function sincronizar(versos, palavras, frases) {
  const E = palavras.length;
  const inicioDe = (k) => Number(palavras[k][0]) || 0;

  // Frases: onde cada uma começa (índice de palavra) e, pela última palavra, o fim dela e o início da próxima.
  const comecos = [];
  const fimDe = new Map();
  let soma = 0;
  frases.forEach((frase, k) => {
    comecos.push(soma);
    soma += Math.max(0, Math.round(Number(frase?.[2]) || 0));
    fimDe.set(soma - 1, { fim: Number(frase?.[1]) || 0, proxima: frases[k + 1] ? Number(frases[k + 1][0]) : Infinity });
  });

  const tamanhos = versos.map((v) => v.split(' ').length);
  const total = tamanhos.reduce((a, b) => a + b, 0);
  const inicios = [];
  let acumulado = 0;
  let anterior = -1;
  for (const tamanho of tamanhos) {
    let alvo = Math.round((acumulado / total) * E);
    let melhor = -1;
    for (const c of comecos) {
      if (c > anterior && Math.abs(c - alvo) <= PERTO && (melhor < 0 || Math.abs(c - alvo) < Math.abs(melhor - alvo))) melhor = c;
    }
    if (melhor >= 0) alvo = melhor;
    anterior = Math.min(Math.max(alvo, anterior + 1), E - 1);
    inicios.push(anterior);
    acumulado += tamanho;
  }

  const linhas = [];
  let antes = -Infinity;
  versos.forEach((verso, i) => {
    const iw = inicios[i];
    const fimTrecho = Math.max(iw + 1, i + 1 < versos.length ? inicios[i + 1] : E);
    antes = Math.max(inicioDe(iw) - ANTES, antes + MINIMO);
    const termos = verso.split(' ');
    const marcadas = termos.map((termo, j) => {
      const k = Math.min(iw + Math.floor((j * (fimTrecho - iw)) / termos.length), fimTrecho - 1);
      return `${fmt(Math.max(inicioDe(k), antes)).replace('[', '<').replace(']', '>')}${termo}`;
    });
    linhas.push(`${fmt(antes)} ${marcadas.join(' ')}`);

    const fecha = fimDe.get(fimTrecho - 1);
    if (fecha && fecha.proxima - fecha.fim > SILENCIO) {
      const pausa = Math.max(fecha.fim + 1.5, antes + 3);
      // Nunca depois do verso seguinte: os tempos do campo só andam para a frente.
      const seguinte = i + 1 < versos.length ? Math.max(inicioDe(inicios[i + 1]) - ANTES, antes + MINIMO) : Infinity;
      if (pausa < seguinte) linhas.push(fmt(pausa));
    }
  });
  return { linhas, de: linhas[0].slice(1, 9), ate: linhas[linhas.length - 1].slice(1, 9) };
}

const entrada = process.argv[2];
if (!entrada) {
  console.error('Uso: node _dev/sincronizar-letra.mjs <tempos.json>');
  process.exit(1);
}
let tempos;
try {
  tempos = JSON.parse(readFileSync(entrada, 'utf8').replace(/^﻿/, ''));
} catch {
  console.error(`Nao consegui ler ${entrada} como JSON. Nada mudou.`);
  process.exit(1);
}

const fonte = readFileSync(CONTEUDO, 'utf8');
const fimDeLinha = fonte.includes('\r\n') ? '\r\n' : '\n';
const relatorio = [];
const usados = new Set();
const novo = fonte.replace(FAIXA, (tudo, comeco, arquivo, corpo) => {
  const dados = tempos?.[arquivo];
  const palavras = (Array.isArray(dados?.palavras) ? dados.palavras : []).filter((p) => Array.isArray(p));
  const frases = Array.isArray(dados?.frases) ? dados.frases : [];
  const linhas = corpo.split(/\r?\n/);
  // Só versos com tempo na origem; as linhas só de tempo (pausas) são refeitas aqui.
  const versos = linhas
    .filter((l) => /^\[\d/.test(l.trim()))
    .map((l) => l.replace(TAG, '').replace(TAG_PALAVRA, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!palavras.length || !versos.length) return tudo;
  usados.add(arquivo);
  const semTempo = linhas.filter((l) => l.trim() && !/^\[\d/.test(l.trim())).length;
  const r = sincronizar(versos, palavras, frases);
  relatorio.push(`${path.basename(arquivo)}: ${versos.length} versos em ${frases.length} frases cantadas, de ${r.de} a ${r.ate}`
    + (semTempo ? ` (${semTempo} ${semTempo === 1 ? 'linha sem tempo ficou' : 'linhas sem tempo ficaram'} de fora)` : ''));
  return `${comeco}${fimDeLinha}${r.linhas.join(fimDeLinha)}${fimDeLinha}\``;
});

for (const chave of Object.keys(tempos || {})) {
  if (!usados.has(chave)) console.log(`Aviso: "${chave}" nao bate com nenhuma musica com letra no content.js; ficou de fora.`);
}
if (!relatorio.length) {
  console.log('Nenhuma letra mudou.');
  process.exit(0);
}
// Confere antes de gravar: o js/content.js nunca fica quebrado.
try {
  new Function('window', novo)({});
} catch {
  console.error('Erro, nada mudou: o content.js ficaria com erro.');
  process.exit(1);
}
writeFileSync(CONTEUDO, novo, 'utf8');
for (const linha of relatorio) console.log(linha);
