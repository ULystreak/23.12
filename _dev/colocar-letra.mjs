/* ============================================================================
   COLOCAR-LETRA: a letra de uma música, de um .txt para o js/content.js
   ============================================================================
   Grava o campo `letra` da música N. O .txt fica fora do repositório (letra-1.txt
   e letra-2.txt estão no .gitignore). Linhas com tempo ([mm:ss.cc] verso, vindas
   do _dev/marcar-letra.html) entram como estão; versos sem tempo são espalhados
   por igual ao longo da música. O arquivo só é gravado se continuar carregando.
   Não publica nada: publicar é com o colocar-letra.bat, que pergunta antes.

   Uso: node _dev/colocar-letra.mjs <numero da musica> <arquivo.txt>
     O número conta os campos `letra` da lista de músicas (faixas), em ordem:
     hoje só as músicas 1 e 2 têm o campo.
   Nenhuma mensagem mostra a letra: só contagens.
   ========================================================================== */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTEUDO = path.join(RAIZ, 'js', 'content.js');
// O mesmo formato do marcar-letra.html, do sincronizar-letra.mjs e do js/letra.js.
const TEMPO = /^\[\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?\]/;
// O campo e o literal dele: crase, aspa simples ou aspa dupla, com escapes.
const CAMPO = /\bletra:\s*(?:`(?:\\[\s\S]|[^\\`])*`|'(?:\\[\s\S]|[^\\'\r\n])*'|"(?:\\[\s\S]|[^\\"\r\n])*")/g;
const DURACAO_PADRAO = 180;

function sair(msg) {
  console.error(msg);
  process.exit(1);
}

/** Segundos → "[mm:ss.cc]" (contado em centésimos: 59,999 s vira [01:00.00], nunca [00:60.00]). */
function tempo(s) {
  const cs = Math.round(Math.max(0, s) * 100);
  const m = Math.floor(cs / 6000);
  return `[${String(m).padStart(2, '0')}:${((cs - m * 6000) / 100).toFixed(2).padStart(5, '0')}]`;
}

function duracaoDe(mp3) {
  try {
    const saida = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(RAIZ, mp3)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const d = Number(saida.trim());
    return d > 0 ? d : DURACAO_PADRAO;
  } catch {
    return DURACAO_PADRAO; // sem ffprobe (FFmpeg) no PATH
  }
}

const [numero, arquivoLetra] = process.argv.slice(2);
const n = Number(numero);
if (!numero || !arquivoLetra || !Number.isInteger(n) || n < 1) sair('Uso: node _dev/colocar-letra.mjs <numero da musica> <arquivo.txt>');

let texto;
try {
  texto = readFileSync(arquivoLetra, 'utf8');
} catch {
  sair(`Nao achei o arquivo ${arquivoLetra}.`);
}
const linhas = texto.replace(/^﻿/, '').split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
if (!linhas.length) sair('O arquivo esta vazio.');

const fonte = readFileSync(CONTEUDO, 'utf8');
const inicio = fonte.indexOf('faixas: [');
if (inicio < 0) sair('Nao achei a lista de musicas (faixas) no content.js.');

let achado = null;
CAMPO.lastIndex = inicio;
for (let k = 0; k < n;) {
  achado = CAMPO.exec(fonte);
  if (!achado) break;
  // "letra:" escrito num comentário não é o campo.
  if (fonte.slice(fonte.lastIndexOf('\n', achado.index) + 1, achado.index).includes('//')) {
    CAMPO.lastIndex = achado.index + 6;
    continue;
  }
  k++;
}
if (!achado) sair(`Nao achei o campo letra da musica numero ${n}.`);

let versos = linhas.filter((l) => TEMPO.test(l));
if (versos.length) {
  const sem = linhas.length - versos.length;
  if (sem) console.log(`Aviso: ${sem} ${sem === 1 ? 'linha sem tempo ficou' : 'linhas sem tempo ficaram'} de fora.`);
} else {
  // O mp3 desta música é o último antes do campo (o arquivo vem antes da letra na faixa).
  const mp3 = [...fonte.slice(0, achado.index).matchAll(/arquivo:\s*['"]([^'"]+\.mp3)['"]/g)].pop()?.[1];
  const duracao = mp3 ? duracaoDe(mp3) : DURACAO_PADRAO;
  // Do segundo 10 até 12 s antes do fim (ou um segundo por verso, se a música for curta).
  const fim = Math.max(10 + linhas.length, duracao - 12);
  const passo = (fim - 10) / linhas.length;
  versos = linhas.map((l, i) => `${tempo(10 + i * passo)} ${l}`);
  console.log(`Os versos nao tinham tempo: espalhei por igual ao longo de ${Math.round(duracao)} s.`);
}
if (/<\d{1,2}:\d{1,2}/.test(achado[0])) {
  console.log('Aviso: os tempos por palavra que estavam la sairam; rode o _dev/sincronizar-letra.mjs de novo.');
}

const fimDeLinha = fonte.includes('\r\n') ? '\r\n' : '\n';
const corpo = versos.join(fimDeLinha).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const novo = `${fonte.slice(0, achado.index)}letra: \`${fimDeLinha}${corpo}${fimDeLinha}\`${fonte.slice(achado.index + achado[0].length)}`;

// Confere antes de gravar: o js/content.js nunca fica quebrado, nem por um instante.
try {
  new Function('window', novo)({});
} catch {
  sair('O content.js ficaria com erro e foi deixado como estava');
}
writeFileSync(CONTEUDO, novo, 'utf8');
console.log(`Pronto: ${versos.length} versos na musica numero ${n}.`);
