/* ============================================================================
   CONFERIR IMPORTS: cada import aponta para um arquivo que existe e para um
   nome que esse arquivo exporta?
   ============================================================================
   Uso: node _dev/conferir-imports.mjs
   Confere os imports estáticos (import { a, b } from './x.js') e os dinâmicos
   no formato mais comum do site: const { a, b } = await import('./x.js') e
   import('./x.js').then((m) => m.a). Termina com "IMPORTS OK" ou com a lista
   do que não bate.
   ========================================================================== */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function listar(pasta) {
  const saida = [];
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) saida.push(...listar(caminho));
    else if (nome.endsWith('.js') && nome !== 'content.js') saida.push(caminho);
  }
  return saida;
}

function exportsDe(arquivo) {
  const codigo = readFileSync(arquivo, 'utf8');
  const nomes = new Set();
  for (const m of codigo.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) nomes.add(m[1]);
  for (const m of codigo.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const parte of m[1].split(',')) {
      const nome = parte.trim().split(/\s+as\s+/).pop().trim();
      if (nome) nomes.add(nome);
    }
  }
  if (/export\s+default/.test(codigo)) nomes.add('default');
  return nomes;
}

function nomesDe(lista) {
  return lista.split(',')
    .map((p) => p.trim().split(/\s*(?::|\bas\b)\s*/)[0].trim())
    .filter((n) => n && !n.startsWith('...'));
}

const problemas = [];
const arquivos = listar(join(RAIZ, 'js'));
const cache = new Map();
const exportsCom = (alvo) => {
  if (!cache.has(alvo)) cache.set(alvo, exportsDe(alvo));
  return cache.get(alvo);
};

for (const arquivo of arquivos) {
  const codigo = readFileSync(arquivo, 'utf8');
  const de = relative(RAIZ, arquivo).replaceAll('\\', '/');
  const conferir = (caminho, nomes) => {
    if (!caminho.startsWith('.')) return;
    const alvo = resolve(dirname(arquivo), caminho);
    if (!existsSync(alvo)) {
      problemas.push(`${de}: o arquivo ${caminho} não existe`);
      return;
    }
    if (alvo.includes(`${join('lib', '')}`) || alvo.endsWith('.min.js')) return;
    const exp = exportsCom(alvo);
    for (const nome of nomes) {
      if (!exp.has(nome)) problemas.push(`${de}: ${caminho} não exporta "${nome}"`);
    }
  };

  for (const m of codigo.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) conferir(m[2], nomesDe(m[1]));
  for (const m of codigo.matchAll(/import\s+['"]([^'"]+)['"]/g)) conferir(m[1], []);
  for (const m of codigo.matchAll(/import\s+\*\s+as\s+\w+\s+from\s*['"]([^'"]+)['"]/g)) conferir(m[1], []);
  for (const m of codigo.matchAll(/\{([^{}]*)\}\s*=\s*await\s+import\(\s*['"]([^'"]+)['"]\s*\)/g)) conferir(m[2], nomesDe(m[1]));
  for (const m of codigo.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)\s*\.then\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\2\.(\w+)/g)) conferir(m[1], [m[3]]);
  for (const m of codigo.matchAll(/\(\s*await\s+import\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.(\w+)/g)) conferir(m[1], [m[2]]);
  for (const m of codigo.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) conferir(m[1], []);
}

// Os módulos que o diretor carrega por nome (carregar.x()) e o que ele desestrutura.
const diretor = join(RAIZ, 'js/nucleo/diretor.js');
const codDiretor = readFileSync(diretor, 'utf8');
const mapa = {};
for (const m of codDiretor.matchAll(/(\w+):\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)/g)) mapa[m[1]] = m[2];
const usos = [
  ...codDiretor.matchAll(/\{([^{}]*)\}\s*=\s*await\s+carregar\.(\w+)\(\)/g),
].map((m) => [m[2], nomesDe(m[1])]);
for (const m of codDiretor.matchAll(/carregar\.(\w+)\(\)\.then\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\2\.(\w+)/g)) usos.push([m[1], [m[3]]]);
for (const m of codDiretor.matchAll(/\{([^{}]*)\}\s*=\s*await\s+carregar\[\w+\]\(\)/g)) {
  for (const id of ['poppy', 'yourname']) usos.push([id, nomesDe(m[1])]);
}
for (const m of codDiretor.matchAll(/\{([^{}]*)\}\s*=\s*await\s+carregarEntrada\(\)/g)) usos.push(['__entrada', nomesDe(m[1])]);
mapa.__entrada = '../cenas/senha.js';
for (const [chave, nomes] of usos) {
  const caminho = mapa[chave];
  if (!caminho) continue;
  const alvo = resolve(dirname(diretor), caminho);
  if (!existsSync(alvo)) {
    problemas.push(`js/nucleo/diretor.js: carregar.${chave} → ${caminho} não existe`);
    continue;
  }
  const exp = exportsCom(alvo);
  for (const nome of nomes) if (!exp.has(nome)) problemas.push(`js/nucleo/diretor.js: ${caminho} não exporta "${nome}"`);
}

// Os CSS que o index.html pede existem?
const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:href|src)="((?:css|js|lib|assets)\/[^"]+)"/g)) {
  if (!existsSync(join(RAIZ, m[1]))) problemas.push(`index.html: ${m[1]} não existe`);
}

if (problemas.length) {
  const unicos = [...new Set(problemas)];
  console.log(unicos.map((p) => `- ${p}`).join('\n'));
  console.log(`\n${unicos.length} problema(s).`);
  process.exit(1);
}
console.log(`IMPORTS OK (${arquivos.length} arquivos)`);
