// Põe no js/content.js a letra marcada na página _dev/marcar-letra.html.
//   node _dev/colocar-letra.mjs <número da música> <arquivo .txt com o resultado>
// O número é a posição da música na lista de content.js (1 = a primeira).
// Só aceita linhas no formato "[mm:ss.cc] verso". Não mexe em mais nada.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arquivoConteudo = path.join(raiz, 'js', 'content.js');
const [numero, arquivoLetra] = process.argv.slice(2);
const sair = (msg) => { console.error(`\n  ${msg}\n`); process.exit(1); };

if (!numero || !arquivoLetra) sair('Uso: node _dev/colocar-letra.mjs <numero da musica> <arquivo.txt>');
const linhas = readFileSync(arquivoLetra, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const validas = linhas.filter((l) => /^\[\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?\]/.test(l));
if (!validas.length) sair('Nenhuma linha com tempo no arquivo. Cole o resultado da pagina marcar-letra (linhas comecando com [00:12.34]).');
if (validas.length < linhas.length) console.log(`  Aviso: ${linhas.length - validas.length} linha(s) sem tempo foram ignoradas.`);

const fonte = readFileSync(arquivoConteudo, 'utf8');
const inicio = fonte.indexOf('faixas: [');
if (inicio < 0) sair('Nao achei a lista de musicas (faixas) no content.js.');
// Acha o campo `letra:` da N-ésima música, contando os blocos que têm `arquivo:`.
const re = /letra:\s*(`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g;
re.lastIndex = inicio;
let m = null;
for (let i = 0; i < Number(numero); i++) { m = re.exec(fonte); if (!m) break; }
if (!m) sair(`Nao achei o campo letra da musica numero ${numero}.`);
const texto = validas.join('\n').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const novo = `${fonte.slice(0, m.index)}letra: \`\n${texto}\n\`${fonte.slice(m.index + m[0].length)}`;
writeFileSync(arquivoConteudo, novo, 'utf8');

// Confere se o content.js continua válido.
try { new Function('window', novo)({}); } catch (erro) {
  writeFileSync(arquivoConteudo, fonte, 'utf8');
  sair(`O content.js ficaria com erro e foi deixado como estava: ${erro.message}`);
}
console.log(`  Pronto: ${validas.length} versos na musica numero ${numero}.`);
