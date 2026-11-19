// Acerta o tempo dos versos da letra (js/content.js) pelo canto de verdade.
//   node _dev/sincronizar-letra.mjs <tempos.json>
// tempos.json: { "assets/music/x.mp3": { palavras: [[inicio, fim]...], frases: [[inicio, fim, nPalavras]...] } }
// tirado do canto com o Whisper. Os versos ficam na ordem; cada um começa na mesma proporção
// do canto que ocupa na letra, puxado para o começo de uma frase, e some nas pausas longas.
// Só troca os tempos: o texto dos versos não muda.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arquivo = path.join(raiz, 'js', 'content.js');
const tempos = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let fonte = readFileSync(arquivo, 'utf8');
const original = fonte;
const TAG = /\[\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?\]/g;
const fmt = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return `[${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(2).padStart(5, '0')}]`; };
const ANTES = 0.25;     // o verso aparece um pouquinho antes de ser cantado
const MINIMO = 1.4;     // cada verso fica pelo menos isso na tela
const SILENCIO = 4;    // pausa maior que isso: o verso some no meio dela

const re = /arquivo:\s*'([^']+\.mp3)'[\s\S]*?letra:\s*`((?:\\[\s\S]|[^`\\])*)`/g;
let saida = '';
let resto = 0;
for (const m of fonte.matchAll(re)) {
  const dados = tempos[m[1]];
  const versos = m[2].split('\n').filter((l) => /^\[\d/.test(l.trim())).map((l) => l.replace(TAG, '').trim()).filter(Boolean);
  if (!dados?.palavras?.length || !versos.length) continue;
  const palavras = dados.palavras;
  const E = palavras.length;
  const n = versos.length;
  // Onde cada frase do Whisper começa e termina (em número de palavras).
  const comecos = [];
  const fimDe = new Map();   // índice da última palavra da frase → [fim da frase, começo da próxima]
  let soma = 0;
  dados.frases.forEach((f, i) => {
    comecos.push(soma);
    soma += f[2];
    fimDe.set(soma - 1, [f[1], dados.frases[i + 1]?.[0] ?? Infinity]);
  });
  // Cada verso começa na mesma proporção do canto que ocupa na letra (pelo número de palavras),
  // puxado para o começo de uma frase quando há uma por perto.
  const tamanho = versos.map((v) => Math.max(1, v.split(/\s+/).length));
  const total = tamanho.reduce((x, y) => x + y, 0);
  const inicios = [];
  let acumulado = 0;
  for (let k = 0; k < n; k++) {
    let alvo = Math.round((acumulado / total) * E);
    const perto = comecos.reduce((melhor, c) => (Math.abs(c - alvo) < Math.abs(melhor - alvo) ? c : melhor), Infinity);
    if (Math.abs(perto - alvo) <= 3) alvo = perto;
    alvo = Math.min(E - 1, Math.max(alvo, (inicios.at(-1) ?? -1) + 1));
    inicios.push(alvo);
    acumulado += tamanho[k];
  }
  const linhas = [];
  let antes = -Infinity;
  inicios.forEach((iw, k) => {
    antes = Math.max(palavras[iw][0] - ANTES, antes + MINIMO);   // dá tempo de ler o anterior
    linhas.push(`${fmt(antes)} ${versos[k]}`);
    const ultima = (inicios[k + 1] ?? E) - 1;
    const pausa = fimDe.get(ultima);
    if (pausa && pausa[1] - pausa[0] > SILENCIO) linhas.push(fmt(Math.max(pausa[0] + 1.5, antes + 3)));
  });
  const inicioLetra = m.index + m[0].length - m[2].length - 1;
  const corpo = linhas.join('\n');   // o texto já vem escapado do content.js
  saida += fonte.slice(resto, inicioLetra) + '\n' + corpo + '\n';
  resto = inicioLetra + m[2].length;
  console.log(`  ${path.basename(m[1])}: ${n} versos em ${dados.frases.length} frases cantadas, de ${fmt(palavras[0][0])} a ${fmt(palavras.at(-1)[1])}`);
}
fonte = saida + fonte.slice(resto);
writeFileSync(arquivo, fonte, 'utf8');
try { new Function('window', fonte)({}); } catch (e) { writeFileSync(arquivo, original, 'utf8'); console.error('  Erro, nada mudou:', e.message); process.exit(1); }
