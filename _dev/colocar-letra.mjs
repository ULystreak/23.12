// Põe no js/content.js a letra de uma música.
//   node _dev/colocar-letra.mjs <número da música> <arquivo .txt>
// O número é a posição da música na lista de content.js (1 = a primeira).
// Linhas com tempo ("[mm:ss.cc] verso", da página _dev/marcar-letra.html) entram como estão.
// Se o arquivo só tem os versos, sem tempo, eles são espalhados por igual ao longo da música.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arquivoConteudo = path.join(raiz, 'js', 'content.js');
const [numero, arquivoLetra] = process.argv.slice(2);
const sair = (msg) => { console.error(`\n  ${msg}\n`); process.exit(1); };
const TEMPO = /^\[\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?\]/;

if (!numero || !arquivoLetra) sair('Uso: node _dev/colocar-letra.mjs <numero da musica> <arquivo.txt>');
const linhas = readFileSync(arquivoLetra, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
if (!linhas.length) sair('O arquivo esta vazio.');

const fonte = readFileSync(arquivoConteudo, 'utf8');
const inicio = fonte.indexOf('faixas: [');
if (inicio < 0) sair('Nao achei a lista de musicas (faixas) no content.js.');
const re = /letra:\s*(`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g;
re.lastIndex = inicio;
let m = null;
for (let i = 0; i < Number(numero); i++) { m = re.exec(fonte); if (!m) break; }
if (!m) sair(`Nao achei o campo letra da musica numero ${numero}.`);

let versos = linhas.filter((l) => TEMPO.test(l));
if (!versos.length) {
  // Sem tempo: acha a duração do .mp3 desta música e reparte os versos por igual.
  const antes = fonte.slice(inicio, m.index);
  const mp3 = [...antes.matchAll(/arquivo:\s*'([^']+\.mp3)'/g)].pop()?.[1];
  let duracao = 180;
  try {
    duracao = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(raiz, mp3)], { encoding: 'utf8' })) || duracao;
  } catch { /* sem ffprobe: fica com 3 minutos */ }
  const comeco = 10;
  const fim = Math.max(comeco + linhas.length, duracao - 12);
  const passo = (fim - comeco) / linhas.length;
  const tempo = (s) => { const mm = Math.floor(s / 60); return `[${String(mm).padStart(2, '0')}:${(s - mm * 60).toFixed(2).padStart(5, '0')}]`; };
  versos = linhas.map((l, i) => `${tempo(comeco + i * passo)} ${l}`);
  console.log(`  Os versos nao tinham tempo: espalhei por igual ao longo de ${Math.round(duracao)} s.`);
} else if (versos.length < linhas.length) {
  console.log(`  Aviso: ${linhas.length - versos.length} linha(s) sem tempo foram ignoradas.`);
}

const texto = versos.join('\n').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const novo = `${fonte.slice(0, m.index)}letra: \`\n${texto}\n\`${fonte.slice(m.index + m[0].length)}`;
writeFileSync(arquivoConteudo, novo, 'utf8');
try { new Function('window', novo)({}); } catch (erro) {
  writeFileSync(arquivoConteudo, fonte, 'utf8');
  sair(`O content.js ficaria com erro e foi deixado como estava: ${erro.message}`);
}
console.log(`  Pronto: ${versos.length} versos na musica numero ${numero}.`);
