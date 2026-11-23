/* ============================================================================
   COLOCAR-TEXTOS: os textos dos capítulos, dos .txt para o js/content.js
   ============================================================================
   O autor escreve na pasta textos/: poppy.txt vai para conteudo.poppy.blocos;
   "your name.txt" (ou yourname.txt, your-name.txt) vai para
   conteudo.yourname.blocos. Um parágrafo por linha, ou parágrafos separados
   por linha em branco; linhas que começam com # são anotação dele; uma
   primeira linha "Título: ..." ou "Subtítulo: ..." troca o título e o
   subtítulo do capítulo.

   Mexe só no texto dos blocos de tipo 'texto' e em titulo e subtitulo.
   Cenas, imagens, cordão, par e comentários ficam onde estão. O arquivo só é
   gravado se carregar e ficar exatamente como devia.

   Uso: node _dev/colocar-textos.mjs            (lê textos/ da raiz)
        node _dev/colocar-textos.mjs <pasta>
        node _dev/colocar-textos.mjs --teste    (auto-teste numa cópia; o
                                                 js/content.js não é tocado)
   ========================================================================== */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAPITULOS = [
  { chave: 'poppy', nome: 'capitulo do jogo', arquivos: ['poppy.txt'] },
  { chave: 'yourname', nome: 'capitulo do filme', arquivos: ['your name.txt', 'yourname.txt', 'your-name.txt'] },
];
const CAMPOS = ['titulo', 'subtitulo'];

/* ---- o .txt dele ------------------------------------------------------------- */

// O Bloco de Notas de hoje salva em UTF-8; um arquivo antigo pode vir em UTF-16 ou em ANSI.
function lerTxt(arquivo) {
  const bytes = readFileSync(arquivo);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function lerCapitulo(texto) {
  const linhas = texto.normalize('NFC').split(/\r\n|\r|\n/).map((l) => l.trim()).filter((l) => !l.startsWith('#'));
  const lido = {};
  let i = 0;
  // Título e Subtítulo só valem antes do primeiro parágrafo; depois são texto comum.
  for (; i < linhas.length; i++) {
    if (!linhas[i]) continue;
    const m = /^(sub)?t[ií]tulo\s*:\s*(.*)$/i.exec(linhas[i]);
    if (!m) break;
    lido[m[1] ? 'subtitulo' : 'titulo'] = m[2];
  }
  const corpo = linhas.slice(i).join('\n').trim();
  const partes = /\n{2,}/.test(corpo) ? corpo.split(/\n{2,}/) : corpo.split('\n');
  lido.paragrafos = partes.map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean);
  return lido;
}

/* ---- o content.js como estrutura -------------------------------------------- */

function branco(trecho) {
  return trecho.replace(/[^\r\n]/g, ' ');
}

// Cópia do código, do mesmo tamanho, com comentários e o miolo das strings
// trocados por espaço: dá para procurar chaves, colchetes e nomes de campo sem
// tropeçar no que ele escreveu. As aspas e os ${ } de crase continuam à vista.
function mascarar(fonte) {
  const n = fonte.length;
  let saida = '';
  let feito = 0;
  const tapar = (a, b) => {
    saida += fonte.slice(feito, a) + branco(fonte.slice(a, b));
    feito = b;
  };
  // Um escape pula o caractere seguinte (e o CRLF inteiro de uma continuação de linha).
  const passo = (k) => (fonte[k] !== '\\' ? 1 : fonte[k + 1] === '\r' && fonte[k + 2] === '\n' ? 3 : 2);
  const chaves = []; // profundidade de cada ${ aberto dentro de crase
  const crase = (de) => {
    let k = de;
    while (k < n && fonte[k] !== '`' && !(fonte[k] === '$' && fonte[k + 1] === '{')) k += passo(k);
    k = Math.min(k, n);
    tapar(de, k);
    if (fonte[k] === '$') {
      chaves.push(0);
      return k + 2;
    }
    return k + 1;
  };
  let i = 0;
  while (i < n) {
    const c = fonte[i];
    if (c === '/' && fonte[i + 1] === '/') {
      const fim = fonte.indexOf('\n', i);
      const ate = fim < 0 ? n : fim;
      tapar(i, ate);
      i = ate;
    } else if (c === '/' && fonte[i + 1] === '*') {
      const fim = fonte.indexOf('*/', i + 2);
      const ate = fim < 0 ? n : fim + 2;
      tapar(i, ate);
      i = ate;
    } else if (c === "'" || c === '"') {
      let k = i + 1;
      while (k < n && fonte[k] !== c && fonte[k] !== '\n') k += passo(k);
      tapar(i + 1, Math.min(k, n));
      i = k + 1;
    } else if (c === '`') {
      i = crase(i + 1);
    } else if (chaves.length && c === '{') {
      chaves[chaves.length - 1]++;
      i++;
    } else if (chaves.length && c === '}' && chaves[chaves.length - 1] === 0) {
      chaves.pop();
      i = crase(i + 1);
    } else {
      if (chaves.length && c === '}') chaves[chaves.length - 1]--;
      i++;
    }
  }
  return saida + fonte.slice(feito);
}

/** Posição do fecho de `{`, `[` ou `(` aberto em `abre` (−1 se não fecha). */
function fecho(mask, abre) {
  let nivel = 0;
  for (let k = abre; k < mask.length; k++) {
    const c = mask[k];
    if (c === '{' || c === '[' || c === '(') nivel++;
    else if ((c === '}' || c === ']' || c === ')') && --nivel === 0) return k;
  }
  return -1;
}

/** Onde começa o valor da propriedade `nome`, no nível do objeto que abre em `abre` (−1 se não há). */
function valorDe(mask, abre, nome) {
  const fim = fecho(mask, abre);
  for (let k = abre + 1; k < fim; k++) {
    const c = mask[k];
    if (c === '{' || c === '[' || c === '(') {
      k = fecho(mask, k);
      continue;
    }
    if (!mask.startsWith(nome, k) || /[\w$]/.test(mask[k - 1])) continue;
    let j = k + nome.length;
    while (/\s/.test(mask[j])) j++;
    if (mask[j] !== ':') continue;
    j++;
    while (/\s/.test(mask[j])) j++;
    return j;
  }
  return -1;
}

/** Intervalo [início, fim) do literal de texto que começa em `i`, ou null se ali não há um texto simples. */
function literal(mask, i) {
  const aspa = mask[i];
  if (aspa !== "'" && aspa !== '"' && aspa !== '`') return null;
  const f = mask.indexOf(aspa, i + 1);
  if (f < 0 || (aspa === '`' && mask.slice(i, f).includes('${'))) return null;
  // 'a' + b não é literal: depois dele só pode vir vírgula ou o fecho do objeto.
  const depois = /\S/.exec(mask.slice(f + 1));
  if (depois && !',}]'.includes(depois[0])) return null;
  return [i, f + 1];
}

/** Intervalos [início, fim) de cada objeto dentro da lista que abre em `abre`. */
function itens(mask, abre) {
  const fim = fecho(mask, abre);
  const lista = [];
  for (let k = abre + 1; k < fim; k++) {
    const c = mask[k];
    if (c === '{') {
      const f = fecho(mask, k);
      lista.push([k, f + 1]);
      k = f;
    } else if (c === '[' || c === '(') {
      k = fecho(mask, k);
    }
  }
  return lista;
}

/** O trecho a apagar para um bloco sair: as linhas inteiras com a vírgula, se ele ocupa as linhas sozinho. */
function trechoDoBloco(mask, a, f) {
  let fim = f;
  while (mask[fim] === ' ' || mask[fim] === '\t') fim++;
  if (mask[fim] === ',') fim++;
  const inicio = mask.lastIndexOf('\n', a - 1) + 1;
  let eol = mask.indexOf('\n', fim);
  if (eol < 0) eol = mask.length - 1;
  if (!mask.slice(inicio, a).trim() && !mask.slice(fim, eol).trim()) return [inicio, eol + 1];
  return [a, fim];
}

function recuoDe(mask, i) {
  const inicio = mask.lastIndexOf('\n', i - 1) + 1;
  return /^[ \t]*/.exec(mask.slice(inicio))[0];
}

function aspas(texto) {
  return `'${texto.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r\n|\r|\n/g, '\\n')}'`;
}

function raizDe(mask) {
  return mask.indexOf('{', mask.indexOf('CONTEUDO'));
}

/**
 * O código com o capítulo trocado. Só entram as trocas de valor diferente (o
 * jeito como ele escreveu o resto fica); são aplicadas de trás para a frente.
 */
function trocarCapitulo(fonte, chave, lido) {
  const mask = mascarar(fonte);
  const atual = carregar(fonte)[chave];
  const fimDeLinha = fonte.includes('\r\n') ? '\r\n' : '\n';
  const cap = valorDe(mask, raizDe(mask), chave);
  if (cap < 0 || mask[cap] !== '{') throw new Error(`Nao achei o capitulo ${chave} no content.js; nada foi mudado`);
  const trocas = [];
  const trocar = (pos, novo, antigo, nome) => {
    const lit = literal(mask, pos);
    if (!lit) throw new Error(`Um ${nome} do ${chave} nao e um texto entre aspas; nada foi mudado`);
    if (novo !== antigo) trocas.push([lit[0], lit[1], aspas(novo)]);
  };

  for (const campo of CAMPOS) {
    const pos = lido[campo] === undefined ? -1 : valorDe(mask, cap, campo);
    if (pos >= 0) trocar(pos, lido[campo], atual[campo], campo);
  }

  if (lido.paragrafos.length) {
    const lista = valorDe(mask, cap, 'blocos');
    if (lista < 0 || mask[lista] !== '[') throw new Error(`O ${chave} nao tem a lista blocos; nada foi mudado`);
    const blocos = itens(mask, lista);
    if (blocos.length !== atual.blocos?.length) throw new Error(`A lista de blocos do ${chave} tem algo que nao e bloco; nada foi mudado`);
    const deTexto = blocos.filter((_, k) => atual.blocos[k]?.tipo === 'texto');
    const antigos = atual.blocos.filter((b) => b?.tipo === 'texto');

    deTexto.forEach(([a, f], k) => {
      if (k >= lido.paragrafos.length) {
        const [x, y] = trechoDoBloco(mask, a, f);
        trocas.push([x, y, '']);
        return;
      }
      const pos = valorDe(mask, a, 'texto');
      if (pos < 0) throw new Error(`Um bloco de texto do ${chave} nao tem o campo texto; nada foi mudado`);
      trocar(pos, lido.paragrafos[k], antigos[k].texto, 'bloco de texto');
    });

    const novos = lido.paragrafos.slice(deTexto.length);
    if (novos.length) {
      const bloco = (texto, recuo, multilinha) => (multilinha
        ? `{${fimDeLinha}${recuo}  tipo: 'texto',${fimDeLinha}${recuo}  texto: ${aspas(texto)},${fimDeLinha}${recuo}}`
        : `{ tipo: 'texto', texto: ${aspas(texto)} }`);
      if (deTexto.length) {
        // Logo depois do último bloco de texto, com a vírgula e o recuo dele.
        const [a, f] = deTexto[deTexto.length - 1];
        const recuo = recuoDe(mask, a);
        const multilinha = mask.slice(a, f).includes('\n');
        let pos = f;
        while (mask[pos] === ' ' || mask[pos] === '\t') pos++;
        const texto = mask[pos] === ','
          ? novos.map((p) => `${fimDeLinha}${recuo}${bloco(p, recuo, multilinha)},`).join('')
          : novos.map((p) => `,${fimDeLinha}${recuo}${bloco(p, recuo, multilinha)}`).join('');
        const onde = mask[pos] === ',' ? pos + 1 : f;
        trocas.push([onde, onde, texto]);
      } else if (blocos.length) {
        // Sem bloco de texto: no começo da lista.
        const recuo = recuoDe(mask, blocos[0][0]);
        const multilinha = mask.slice(...blocos[0]).includes('\n');
        trocas.push([lista + 1, lista + 1, novos.map((p) => `${fimDeLinha}${recuo}${bloco(p, recuo, multilinha)},`).join('')]);
      } else {
        const base = recuoDe(mask, lista);
        const texto = novos.map((p) => `${fimDeLinha}${base}  ${bloco(p, `${base}  `, true)},`).join('');
        trocas.push([lista + 1, lista + 1, texto + fimDeLinha + base]);
      }
    }
  }

  trocas.sort((p, q) => q[0] - p[0]);
  let saida = fonte;
  for (const [a, f, texto] of trocas) saida = saida.slice(0, a) + texto + saida.slice(f);
  return saida;
}

/** O objeto CONTEUDO que o código define (lança se o código tem erro). */
function carregar(fonte) {
  const janela = {};
  new Function('window', fonte)(janela);
  if (!janela.CONTEUDO || typeof janela.CONTEUDO !== 'object') throw new Error('o content.js nao define window.CONTEUDO');
  return janela.CONTEUDO;
}

/**
 * O caminho da primeira diferença entre dois valores ('' se são iguais). Diz
 * só ONDE, nunca o valor: o content.js tem a letra das músicas, que não pode
 * aparecer em mensagem nenhuma.
 */
function diferenca(a, b, caminho = 'CONTEUDO') {
  if (Object.is(a, b)) return '';
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return caminho;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = diferenca(a[k], b[k], Array.isArray(a) ? `${caminho}[${k}]` : `${caminho}.${k}`);
    if (d) return d;
  }
  return '';
}

/** As mesmas trocas, feitas no objeto carregado: é com isto que o resultado é conferido. */
function esperar(cap, lido) {
  for (const campo of CAMPOS) if (lido[campo] !== undefined) cap[campo] = lido[campo];
  if (!lido.paragrafos.length) return;
  const blocos = [];
  let k = 0;
  let depoisDoUltimo = 0;
  for (const b of cap.blocos) {
    if (b?.tipo !== 'texto') {
      blocos.push(b);
    } else if (k < lido.paragrafos.length) {
      blocos.push({ ...b, texto: lido.paragrafos[k++] });
      depoisDoUltimo = blocos.length;
    }
  }
  blocos.splice(depoisDoUltimo, 0, ...lido.paragrafos.slice(k).map((texto) => ({ tipo: 'texto', texto })));
  cap.blocos = blocos;
}

function quantos(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

/* ---- colocar --------------------------------------------------------------- */

/** Lê os .txt de `pasta`, troca, confere e grava. Devolve true se o content.js mudou. */
function colocar(arquivoConteudo, pasta, dizer) {
  const fonte = readFileSync(arquivoConteudo, 'utf8');
  let antes;
  try {
    antes = carregar(fonte);
  } catch {
    throw new Error('O content.js ja esta com erro; arrume antes de colocar os textos');
  }
  if (!existsSync(pasta)) {
    dizer(`Nao achei a pasta dos textos: ${pasta}`);
    return false;
  }

  const esperado = carregar(fonte);
  let codigo = fonte;
  let mudou = false;
  for (const cap of CAPITULOS) {
    const arquivo = cap.arquivos.find((a) => existsSync(path.join(pasta, a)));
    if (!arquivo) {
      dizer(`${cap.arquivos[0]}: nao achei. O ${cap.nome} ficou como estava.`);
      continue;
    }
    const lido = lerCapitulo(lerTxt(path.join(pasta, arquivo)));
    if (!lido.paragrafos.length && lido.titulo === undefined && lido.subtitulo === undefined) {
      dizer(`${arquivo}: esta vazio. O ${cap.nome} ficou como estava.`);
      continue;
    }
    const atual = antes[cap.chave];
    if (!atual || typeof atual !== 'object') throw new Error(`Nao achei o ${cap.nome} (${cap.chave}) no content.js; nada foi mudado`);

    const notas = [];
    for (const campo of CAMPOS) {
      if (lido[campo] === undefined) continue;
      if (typeof atual[campo] !== 'string') {
        dizer(`${arquivo}: o ${cap.nome} nao tem ${campo} no content.js; essa linha ficou de fora.`);
        delete lido[campo];
      } else if (lido[campo] !== atual[campo]) {
        notas.push(`${campo} trocado`);
      }
    }
    const existentes = (Array.isArray(atual.blocos) ? atual.blocos : []).filter((b) => b?.tipo === 'texto').length;
    const novos = lido.paragrafos.length;
    if (novos) {
      notas.unshift(`${quantos(novos, 'paragrafo', 'paragrafos')} (antes: ${quantos(existentes, 'bloco de texto', 'blocos de texto')})`);
      if (novos > existentes) notas.push(`${quantos(novos - existentes, 'bloco novo', 'blocos novos')} depois do ultimo texto`);
      if (novos < existentes) notas.push(quantos(existentes - novos, 'bloco de texto saiu', 'blocos de texto sairam'));
    } else {
      notas.unshift('os textos ficaram como estavam');
    }

    codigo = trocarCapitulo(codigo, cap.chave, lido);
    esperar(esperado[cap.chave], lido);
    if (!diferenca(esperado[cap.chave], atual)) {
      dizer(`${arquivo}: ja estava assim no content.js, nada mudou.`);
      continue;
    }
    mudou = true;
    dizer(`${arquivo}: ${notas.join('; ')}.`);
  }

  if (!mudou) return false;
  let depois;
  try {
    depois = carregar(codigo);
  } catch {
    throw new Error('O content.js ficaria com erro e foi deixado como estava');
  }
  if (diferenca(depois, esperado)) throw new Error('O content.js nao ficaria como devia e foi deixado como estava');
  writeFileSync(arquivoConteudo, codigo, 'utf8');
  return true;
}

/* ---- auto-teste -------------------------------------------------------------- */

/** As linhas do arquivo fora dos blocos de texto e das linhas de título e subtítulo. */
function foraDosTextos(fonte) {
  const mask = mascarar(fonte);
  const obj = carregar(fonte);
  const linhaDe = (i) => fonte.slice(0, i).split('\n').length - 1;
  const pular = new Set();
  const marcar = (a, f) => {
    for (let l = linhaDe(a); l <= linhaDe(f); l++) pular.add(l);
  };
  for (const { chave } of CAPITULOS) {
    const cap = valorDe(mask, raizDe(mask), chave);
    if (cap < 0) continue;
    for (const campo of CAMPOS) {
      const pos = valorDe(mask, cap, campo);
      const lit = pos >= 0 && literal(mask, pos);
      if (lit) marcar(lit[0], lit[1] - 1);
    }
    const lista = valorDe(mask, cap, 'blocos');
    if (lista < 0) continue;
    itens(mask, lista).forEach(([a, f], k) => {
      if (obj[chave].blocos?.[k]?.tipo === 'texto') marcar(a, f - 1);
    });
  }
  return fonte.split('\n').filter((_, l) => !pular.has(l));
}

const textosDe = (cap) => (cap?.blocos || []).filter((b) => b?.tipo === 'texto').map((b) => b.texto);
const outrosDe = (cap) => (cap?.blocos || []).filter((b) => b?.tipo !== 'texto');
const finsDeLinha = (t) => `${/\r\n/.test(t)} ${/(^|[^\r])\n/.test(t)} ${/\r(?!\n)/.test(t)}`;

function teste() {
  const real = path.join(RAIZ, 'js', 'content.js');
  const original = readFileSync(real, 'utf8');
  const base = carregar(original);
  const nPoppy = textosDe(base.poppy).length;
  const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
  const utf16 = (t) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(t, 'utf16le')]);
  const mais = Array.from({ length: nPoppy + 2 }, (_, i) => `Paragrafo ${i + 1}.`);

  const casos = [
    { nome: 'pasta sem os arquivos nao mexe em nada', arquivos: {}, muda: false },
    {
      nome: 'arquivo vazio, ou so com comentario, nao mexe',
      arquivos: { 'poppy.txt': '', 'your name.txt': '# so uma anotacao\r\n\r\n#outra\r\n' },
      muda: false,
    },
    {
      nome: 'com linha em branco: cada trecho e um paragrafo e a quebra simples vira espaco (CRLF e BOM)',
      arquivos: { 'poppy.txt': Buffer.concat([BOM, Buffer.from('Primeiro trecho,\r\ncontinua aqui.\r\n\r\n\r\nSegundo trecho.\r\n')]) },
      muda: true,
      poppy: { textos: ['Primeiro trecho, continua aqui.', 'Segundo trecho.'] },
    },
    {
      nome: 'sem linha em branco: cada linha e um paragrafo, # fica de fora, Titulo e Subtitulo trocam',
      arquivos: { 'your name.txt': 'Titulo: Um título novo\nSUBTÍTULO:   Um subtítulo novo  \n# anotação dele\nLinha um.\nLinha dois.\nLinha três.\n' },
      muda: true,
      yourname: { titulo: 'Um título novo', subtitulo: 'Um subtítulo novo', textos: ['Linha um.', 'Linha dois.', 'Linha três.'] },
    },
    {
      nome: 'paragrafos a mais viram blocos novos depois do ultimo bloco de texto',
      arquivos: { 'poppy.txt': mais.join('\r\n\r\n') },
      muda: true,
      poppy: { textos: mais },
      extra(antes, depois) {
        let ultimo = -1;
        antes.poppy.blocos.forEach((b, k) => { if (b?.tipo === 'texto') ultimo = k; });
        if (depois.poppy.blocos[ultimo + 1]?.texto !== mais[nPoppy]) return 'os blocos novos nao ficaram logo depois do ultimo texto';
        return '';
      },
    },
    {
      nome: 'paragrafos a menos: os blocos de texto que sobram saem (UTF-16 com BOM)',
      arquivos: { 'yourname.txt': utf16('Só este parágrafo.\r\n\r\nE este.\r\n') },
      muda: true,
      yourname: { textos: ['Só este parágrafo.', 'E este.'] },
    },
    {
      nome: 'aspas, barras, acentos e crases chegam inteiros (UTF-8 e ANSI); ${...} e colchetes ficam literais',
      arquivos: {
        'poppy.txt': 'Ela disse "oi", eu disse \'tchau\'.\n\nUma barra \\ e outra \\n, uma crase ` e ${nada} [colchetes].\n\nCafé com acento decomposto.',
        'your-name.txt': Buffer.from('Coração, ação, pé e maçã.\r\n', 'latin1'),
      },
      muda: true,
      poppy: { textos: ['Ela disse "oi", eu disse \'tchau\'.', 'Uma barra \\ e outra \\n, uma crase ` e ${nada} [colchetes].', 'Café com acento decomposto.'] },
      yourname: { textos: ['Coração, ação, pé e maçã.'] },
    },
    {
      nome: 'so o titulo no arquivo: os textos do capitulo ficam',
      arquivos: { 'poppy.txt': 'Título: Só o título\r\n' },
      muda: true,
      poppy: { titulo: 'Só o título' },
    },
    {
      nome: 'fim de linha antigo (so CR) tambem separa',
      lf: true,
      arquivos: { 'poppy.txt': 'Um.\rDois.\r\rTrês.\r' },
      muda: true,
      poppy: { textos: ['Um. Dois.', 'Três.'] },
    },
  ];

  const tmp = mkdtempSync(path.join(tmpdir(), 'colocar-textos-'));
  try {
    casos.forEach((caso, n) => {
      const falha = (motivo) => {
        throw new Error(`Auto-teste falhou em "${caso.nome}": ${motivo}`);
      };
      const fonte = caso.lf ? original.replace(/\r\n/g, '\n') : original;
      const pasta = path.join(tmp, String(n + 1), 'textos');
      const copia = path.join(tmp, String(n + 1), 'content.js');
      mkdirSync(pasta, { recursive: true });
      for (const [nome, dados] of Object.entries(caso.arquivos)) writeFileSync(path.join(pasta, nome), dados);
      writeFileSync(copia, fonte, 'utf8');

      const calado = () => {};
      let mudou;
      try {
        mudou = colocar(copia, pasta, calado);
      } catch (erro) {
        falha(erro.message);
      }
      const novo = readFileSync(copia, 'utf8');
      if (mudou !== caso.muda) falha(caso.muda ? 'nao mudou nada' : 'mudou o que nao devia');
      if (colocar(copia, pasta, calado) || readFileSync(copia, 'utf8') !== novo) falha('rodar de novo mudou outra vez');
      if (finsDeLinha(novo) !== finsDeLinha(fonte)) falha('o fim de linha do arquivo mudou');
      const [fa, fb] = [foraDosTextos(fonte), foraDosTextos(novo)];
      const linha = fa.findIndex((l, k) => l !== fb[k]);
      if (linha >= 0 || fa.length !== fb.length) falha(`uma linha fora dos blocos de texto mudou (a ${(linha >= 0 ? linha : fa.length) + 1}a dessas linhas)`);

      const antes = carregar(fonte);
      const depois = carregar(novo);
      const esperado = carregar(fonte);
      for (const { chave } of CAPITULOS) {
        const quer = caso[chave];
        if (!quer) continue;
        esperar(esperado[chave], { paragrafos: quer.textos || [], titulo: quer.titulo, subtitulo: quer.subtitulo });
        if (quer.textos && diferenca(textosDe(depois[chave]), quer.textos)) falha(`os textos do ${chave} nao ficaram como deviam`);
        if (diferenca(outrosDe(depois[chave]), outrosDe(antes[chave]))) falha(`as cenas e imagens do ${chave} mudaram`);
      }
      const onde = diferenca(depois, esperado);
      if (onde) falha(`${onde} nao ficou como devia`);
      const extra = caso.extra?.(antes, depois);
      if (extra) falha(extra);
    });
    if (readFileSync(real, 'utf8') !== original) throw new Error('Auto-teste: o js/content.js de verdade mudou durante o teste');
    console.log(`Tudo certo: ${casos.length} casos. O js/content.js de verdade nao foi tocado.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/* ---- linha de comando -------------------------------------------------------- */

try {
  const pedido = process.argv[2];
  if (pedido === '--teste') {
    teste();
  } else {
    const pasta = pedido ? path.resolve(pedido) : path.join(RAIZ, 'textos');
    if (colocar(path.join(RAIZ, 'js', 'content.js'), pasta, console.log)) console.log('Pronto: os textos estao no js/content.js.');
  }
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
}
