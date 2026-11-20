// Põe no js/content.js os textos dos capítulos que ele escreve na pasta "textos" do projeto:
//   textos/poppy.txt       o capítulo do jogo  (conteudo.poppy.blocos)
//   textos/your name.txt   o capítulo do filme (conteudo.yourname.blocos)
//                          (vale também yourname.txt e your-name.txt)
//
//   node _dev/colocar-textos.mjs           lê a pasta textos/ da raiz do projeto
//   node _dev/colocar-textos.mjs <pasta>   lê os .txt de outra pasta
//   node _dev/colocar-textos.mjs --teste   auto-teste numa cópia do content.js (não toca no de verdade)
//
// Como o .txt é lido:
// - vazio ou ausente: o capítulo fica como está;
// - com linha em branco entre os trechos, cada trecho é um parágrafo (quebra simples vira espaço);
//   sem nenhuma linha em branco, cada linha é um parágrafo;
// - linha que começa com # é anotação dele e não entra;
// - "Título: ..." e "Subtítulo: ..." no começo trocam o titulo e o subtitulo do capítulo.
// Os parágrafos entram, na ordem, nos blocos { tipo: 'texto' } do capítulo. Cenas, imagens, cordão,
// par e comentários ficam onde estão. Parágrafo a mais vira bloco de texto novo logo depois do último
// bloco de texto; bloco de texto a mais sai. O arquivo só é gravado se carregar e ficar como devia.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAPITULOS = [
  { chave: 'poppy', nome: 'capitulo do jogo', arquivos: ['poppy.txt'] },
  { chave: 'yourname', nome: 'capitulo do filme', arquivos: ['your name.txt', 'yourname.txt', 'your-name.txt'] },
];
const CAMPOS = ['titulo', 'subtitulo'];

// ---- o .txt dele ----------------------------------------------------------------------

// O Bloco de Notas de hoje salva em UTF-8; um arquivo antigo pode vir em UTF-16 ou em ANSI.
function lerTxt(arquivo) {
  const bytes = readFileSync(arquivo);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('windows-1252').decode(bytes); }
}

// Devolve { paragrafos, titulo?, subtitulo? }.
function lerCapitulo(texto) {
  const linhas = texto.normalize('NFC').split(/\r?\n/).map((l) => l.trim()).filter((l) => !l.startsWith('#'));
  const lido = {};
  let i = 0;
  for (; i < linhas.length; i++) {
    const m = /^(sub)?t[ií]tulo\s*:\s*(.*)$/i.exec(linhas[i]);
    if (m) { if (m[2]) lido[m[1] ? 'subtitulo' : 'titulo'] = m[2]; } else if (linhas[i]) break;
  }
  const corpo = linhas.slice(i).join('\n').trim();
  lido.paragrafos = corpo ? corpo.split(/\n\n/.test(corpo) ? /\n{2,}/ : '\n').map((p) => p.replace(/\n/g, ' ')) : [];
  return lido;
}

// ---- o content.js, lido como texto ------------------------------------------------------

const branco = (trecho) => trecho.replace(/[^\r\n]/g, ' ');

// Cópia do código, do mesmo tamanho, com os comentários e o miolo dos textos entre aspas trocados
// por espaço: dá para procurar chaves, colchetes e nomes de campo sem tropeçar no que ele escreveu.
const mascarar = (fonte) => fonte.replace(
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|(['"`])(?:\\[\s\S]|(?!\1)[^\\])*\1/g,
  (trecho, aspa) => (aspa ? aspa + branco(trecho.slice(1, -1)) + aspa : branco(trecho)),
);

// Onde fecha a chave ou o colchete que abre em "abre" (sem par, o fim do arquivo).
function fecho(mask, abre) {
  let nivel = 0;
  for (let i = abre; i < mask.length; i++) {
    if ('{[('.includes(mask[i])) nivel++;
    else if ('}])'.includes(mask[i]) && --nivel === 0) return i;
  }
  return mask.length;
}

// Onde começa o valor do campo "nome" do objeto que abre em "abre" (só os campos dele, não os de dentro).
function valorDe(mask, abre, nome) {
  const fim = fecho(mask, abre);
  const re = new RegExp(`(?<![\\w$.])${nome}\\s*:\\s*`, 'g');
  re.lastIndex = abre;
  for (let m; (m = re.exec(mask)) && m.index < fim;) {
    let nivel = 0;
    for (let i = abre; i < m.index; i++) nivel += '{[('.includes(mask[i]) ? 1 : '}])'.includes(mask[i]) ? -1 : 0;
    if (nivel === 1) return m.index + m[0].length;
  }
  return -1;
}

// O texto entre aspas que começa em "i": [onde abre, onde termina]. Sem texto ali, null.
function literal(mask, i) {
  const re = /(['"`])\s*\1/y;
  re.lastIndex = i;
  return i >= 0 && re.test(mask) ? [i, re.lastIndex] : null;
}

// Os objetos { ... } que são itens da lista que abre em "abre": [onde abre, onde fecha] de cada um.
function itens(mask, abre) {
  const fim = fecho(mask, abre);
  const lista = [];
  for (let i = abre + 1; i < fim; i++) {
    if (mask[i] === '{') lista.push([i, i = fecho(mask, i)]);
    else if (mask[i] === '[' || mask[i] === '(') i = fecho(mask, i);
  }
  return lista;
}

// O trecho a apagar para um bloco sair: as linhas dele inteiras, com a vírgula.
function trechoDoBloco(mask, a, f) {
  const resto = /[ \t]*,?[ \t]*(\r?\n)?/y;
  resto.lastIndex = f + 1;
  const m = resto.exec(mask);
  const linha = mask.lastIndexOf('\n', a) + 1;
  const sozinho = m[1] && !mask.slice(linha, a).trim();
  return sozinho ? [linha, resto.lastIndex] : [a, resto.lastIndex - (m[1] || '').length];
}

const recuoDe = (mask, i) => /^[ \t]*/.exec(mask.slice(mask.lastIndexOf('\n', i) + 1))[0];

// Um texto dele escrito como texto do JavaScript, entre aspas simples.
const aspas = (texto) => `'${texto.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')}'`;

// Devolve o código com o capítulo "chave" trocado pelo que veio do .txt.
function trocarCapitulo(fonte, chave, lido) {
  const mask = mascarar(fonte);
  const nl = fonte.includes('\r\n') ? '\r\n' : '\n';
  const abre = valorDe(mask, mask.indexOf('{', mask.indexOf('CONTEUDO')), chave);
  if (mask[abre] !== '{') throw new Error(`Nao achei a parte "${chave}" no content.js.`);
  const trocas = []; // [de, até, o que entra no lugar]

  for (const campo of CAMPOS) {
    const onde = lido[campo] === undefined ? null : literal(mask, valorDe(mask, abre, campo));
    if (onde) trocas.push([...onde, aspas(lido[campo])]);
  }

  if (lido.paragrafos.length) {
    const lista = valorDe(mask, abre, 'blocos');
    if (mask[lista] !== '[') throw new Error(`Nao achei a lista "blocos" de "${chave}" no content.js.`);
    const textos = itens(mask, lista).filter(([a]) => {
      const tipo = literal(mask, valorDe(mask, a, 'tipo'));
      return tipo && fonte.slice(tipo[0] + 1, tipo[1] - 1) === 'texto';
    });
    textos.forEach(([a, f], i) => {
      if (i >= lido.paragrafos.length) { trocas.push([...trechoDoBloco(mask, a, f), '']); return; }
      const onde = literal(mask, valorDe(mask, a, 'texto'));
      if (!onde) throw new Error(`Um bloco de texto de "${chave}" esta escrito de um jeito que eu nao sei trocar.`);
      trocas.push([...onde, aspas(lido.paragrafos[i])]);
    });

    // Os parágrafos que sobram: blocos novos depois do último bloco de texto (e da vírgula dele).
    // Sem nenhum bloco de texto no capítulo, entram no começo da lista.
    const sobra = lido.paragrafos.slice(textos.length);
    if (sobra.length) {
      const ultimo = textos.at(-1);
      let ponto = lista + 1;
      let recuo = `${recuoDe(mask, lista)}  `;
      let virgula = '';
      if (ultimo) {
        const re = /\s*,/y;
        re.lastIndex = ultimo[1] + 1;
        if (re.test(mask)) ponto = re.lastIndex; else { ponto = ultimo[1] + 1; virgula = ','; }
        recuo = recuoDe(mask, ultimo[0]);
      }
      const novos = sobra.map((p) => `${nl}${recuo}{${nl}${recuo}  tipo: 'texto',${nl}${recuo}  texto: ${aspas(p)},${nl}${recuo}},`);
      trocas.push([ponto, ponto, virgula + novos.join('')]);
    }
  }

  // De trás para a frente, para as posições de antes continuarem valendo.
  return trocas.sort((x, y) => y[0] - x[0]).reduce((codigo, [de, ate, novo]) => codigo.slice(0, de) + novo + codigo.slice(ate), fonte);
}

// ---- o content.js, carregado de verdade ---------------------------------------------------

function carregar(fonte) {
  const janela = {};
  new Function('window', fonte)(janela);
  return janela.CONTEUDO;
}

// Como o capítulo tem que ficar depois da troca (a mesma regra, feita no objeto carregado): é com
// isto que o resultado é conferido antes de gravar.
function esperar(cap, lido) {
  for (const campo of CAMPOS) if (lido[campo] !== undefined && typeof cap[campo] === 'string') cap[campo] = lido[campo];
  if (!lido.paragrafos.length) return;
  const fila = [...lido.paragrafos];
  const blocos = [];
  let ultimo = -1;
  for (const bloco of cap.blocos) {
    if (bloco?.tipo !== 'texto') blocos.push(bloco);
    else if (fila.length) ultimo = blocos.push({ ...bloco, texto: fila.shift() }) - 1;
  }
  blocos.splice(ultimo + 1, 0, ...fila.map((texto) => ({ tipo: 'texto', texto })));
  cap.blocos = blocos;
}

const quantos = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Lê os .txt da pasta e põe no content.js. Devolve true se o arquivo mudou.
function colocar(arquivoConteudo, pasta, dizer = console.log) {
  const fonte = readFileSync(arquivoConteudo, 'utf8');
  let esperado;
  try { esperado = carregar(fonte); } catch (erro) {
    throw new Error(`O content.js ja esta com erro; arrume antes de colocar os textos: ${erro.message}`);
  }
  if (!existsSync(pasta)) { dizer(`  Nao achei a pasta dos textos: ${pasta}`); return false; }

  let novo = fonte;
  for (const cap of CAPITULOS) {
    const arquivo = cap.arquivos.map((a) => path.join(pasta, a)).find((a) => existsSync(a));
    if (!arquivo) { dizer(`  ${cap.arquivos[0]}: nao achei. O ${cap.nome} ficou como estava.`); continue; }
    const rotulo = path.basename(arquivo);
    const lido = lerCapitulo(lerTxt(arquivo));
    const n = lido.paragrafos.length;
    if (!n && CAMPOS.every((campo) => lido[campo] === undefined)) { dizer(`  ${rotulo}: esta vazio. O ${cap.nome} ficou como estava.`); continue; }

    const antes = esperado[cap.chave] || {};
    const tinha = (antes.blocos || []).filter((b) => b?.tipo === 'texto').length;
    const feito = n ? [`${quantos(n, 'paragrafo', 'paragrafos')} no ${cap.nome}`] : [];
    if (n > tinha) feito.push(quantos(n - tinha, 'bloco de texto novo', 'blocos de texto novos'));
    if (n && n < tinha) feito.push(quantos(tinha - n, 'bloco de texto que sobrava saiu', 'blocos de texto que sobravam sairam'));
    for (const campo of CAMPOS) {
      if (lido[campo] === undefined) continue;
      if (typeof antes[campo] !== 'string') feito.push(`o ${cap.nome} nao tem ${campo} (essa linha ficou de fora)`);
      else if (antes[campo] !== lido[campo]) feito.push(`${campo} trocado`);
    }
    if (!n) feito.push(`sem paragrafos no arquivo, os textos do ${cap.nome} ficaram como estavam`);

    const depois = trocarCapitulo(novo, cap.chave, lido);
    esperar(antes, lido);
    dizer(`  ${rotulo}: ${depois === novo ? 'ja estava assim no content.js, nada mudou' : feito.join(', ')}.`);
    novo = depois;
  }
  if (novo === fonte) return false;

  let ficou;
  try { ficou = carregar(novo); } catch (erro) {
    throw new Error(`O content.js ficaria com erro e foi deixado como estava: ${erro.message}`);
  }
  if (JSON.stringify(ficou) !== JSON.stringify(esperado)) throw new Error('O content.js nao ficaria como devia e foi deixado como estava.');
  writeFileSync(arquivoConteudo, novo, 'utf8');
  return true;
}

// ---- auto-teste -----------------------------------------------------------------------------

function teste() {
  const real = path.join(raiz, 'js', 'content.js');
  const original = readFileSync(real, 'utf8');
  const base = carregar(original);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'colocar-textos-'));
  const conteudo = path.join(dir, 'content.js');
  const pasta = path.join(dir, 'textos');

  const textosDe = (c, chave) => c[chave].blocos.filter((b) => b.tipo === 'texto').map((b) => b.texto);
  const tiposDe = (c, chave) => c[chave].blocos.map((b) => b.tipo);
  const semTextos = (c, chave) => ({ ...c[chave], titulo: 0, subtitulo: 0, blocos: c[chave].blocos.filter((b) => b.tipo !== 'texto') });
  // Tudo o que não é linha de bloco de texto, de título ou de subtítulo: comentários, cenas, o resto.
  const fixo = (codigo) => codigo.split(/\r?\n/).filter((l) => !/^\s*(\{|\},|tipo: 'texto',|(texto|titulo|subtitulo): .*)$/.test(l));
  const n = { poppy: textosDe(base, 'poppy').length, yourname: textosDe(base, 'yourname').length };
  const lista = (quantos, prefixo) => Array.from({ length: quantos }, (_, i) => `${prefixo} ${i + 1}`);
  let casos = 0;

  // Cada caso começa do content.js original e de uma pasta de textos limpa; "conferir" recebe se
  // mudou, o código que ficou e o conteúdo carregado. O que vale para todos é conferido aqui.
  const caso = (nome, arquivos, conferir) => {
    try {
      rmSync(pasta, { recursive: true, force: true });
      mkdirSync(pasta);
      writeFileSync(conteudo, original);
      for (const [arquivo, texto] of Object.entries(arquivos)) writeFileSync(path.join(pasta, arquivo), texto);
      const mudou = colocar(conteudo, pasta, () => {});
      const codigo = readFileSync(conteudo, 'utf8');
      const c = carregar(codigo);
      assert.equal(colocar(conteudo, pasta, () => {}), false, 'rodar de novo mudou alguma coisa');
      assert.equal(readFileSync(conteudo, 'utf8'), codigo, 'rodar de novo mexeu no arquivo');
      assert.equal(mudou, codigo !== original, 'disse que mudou sem mudar (ou o contrario)');
      assert.deepEqual(fixo(codigo), fixo(original), 'mexeu em linha que nao era de texto');
      assert.equal(/[^\r]\n/.test(codigo), /[^\r]\n/.test(original), 'trocou o fim de linha do arquivo');
      assert.deepEqual({ ...c, poppy: 0, yourname: 0 }, { ...base, poppy: 0, yourname: 0 }, 'mexeu fora dos capitulos');
      for (const chave of ['poppy', 'yourname']) assert.deepEqual(semTextos(c, chave), semTextos(base, chave), `mexeu nos outros blocos de ${chave}`);
      conferir({ mudou, codigo, c });
      casos++;
      console.log(`  ok  ${nome}`);
    } catch (erro) {
      throw new Error(`Auto-teste falhou em "${nome}": ${erro.message}`);
    }
  };

  try {
    caso('pasta sem os arquivos nao mexe em nada', {}, ({ mudou }) => assert.equal(mudou, false));
    caso('arquivo vazio ou so com anotacao nao mexe em nada', { 'poppy.txt': '', 'yourname.txt': '\r\n# so uma anotacao\r\n\r\n' }, ({ mudou }) => {
      assert.equal(mudou, false);
    });

    const trechos = lista(n.poppy, 'Trecho');
    caso('com linha em branco, cada trecho e um paragrafo e a quebra simples vira espaco', {
      'poppy.txt': `\uFEFF${trechos.map((t) => `${t}\r\ncontinua na linha de baixo`).join('\r\n\r\n\r\n')}\r\n\r\n`,
    }, ({ c }) => {
      assert.deepEqual(textosDe(c, 'poppy'), trechos.map((t) => `${t} continua na linha de baixo`));
      assert.deepEqual(tiposDe(c, 'poppy'), tiposDe(base, 'poppy'));
      assert.deepEqual(c.yourname, base.yourname);
    });

    const linhas = lista(n.yourname, 'Linha');
    caso('sem linha em branco, cada linha e um paragrafo; # fica de fora; Titulo e Subtitulo trocam', {
      'your name.txt': `# rascunho do filme\nTítulo: O filme de teste\nsubtitulo: Dois céus\n\n${linhas.join('\n# anotacao no meio\n')}\n`,
    }, ({ c }) => {
      assert.deepEqual(textosDe(c, 'yourname'), linhas);
      assert.deepEqual(tiposDe(c, 'yourname'), tiposDe(base, 'yourname'));
      assert.equal(c.yourname.titulo, 'O filme de teste');
      assert.equal(c.yourname.subtitulo, 'Dois céus');
      assert.deepEqual(c.poppy, base.poppy);
    });

    const muitos = lista(n.poppy + 2, 'Paragrafo');
    caso('paragrafos a mais viram blocos novos logo depois do ultimo bloco de texto', { 'poppy.txt': muitos.join('\n') }, ({ c }) => {
      assert.deepEqual(textosDe(c, 'poppy'), muitos);
      const tipos = tiposDe(base, 'poppy');
      tipos.splice(tipos.lastIndexOf('texto') + 1, 0, 'texto', 'texto');
      assert.deepEqual(tiposDe(c, 'poppy'), tipos);
    });

    caso('paragrafos a menos: os blocos de texto que sobram saem (UTF-16 tambem vale)', {
      'your-name.txt': 'Um so.\n',
      'poppy.txt': Buffer.from('﻿Primeiro, com ação.\r\n\r\nSegundo.', 'utf16le'),
    }, ({ c }) => {
      assert.deepEqual(textosDe(c, 'yourname'), ['Um so.']);
      assert.deepEqual(textosDe(c, 'poppy'), ['Primeiro, com ação.', 'Segundo.']);
    });

    const dificil = 'Copo d\'água, "entre aspas", C:\\pasta\\nova, uma `crase`, ${isto} e [colchetes].';
    caso('aspas, barras e acentos chegam inteiros (UTF-8 e ANSI)', {
      'poppy.txt': `Título: O "jogo" d'ela\n${dificil}\n${dificil}`,
      'yourname.txt': Buffer.from('Coração, não é? Avó e avô.', 'latin1'),
    }, ({ c }) => {
      assert.deepEqual(textosDe(c, 'poppy'), [dificil, dificil]);
      assert.equal(c.poppy.titulo, 'O "jogo" d\'ela');
      assert.deepEqual(textosDe(c, 'yourname'), ['Coração, não é? Avó e avô.']);
    });

    caso('so o titulo no arquivo: os textos do capitulo ficam', { 'poppy.txt': 'Titulo: Outro nome\n' }, ({ c }) => {
      assert.equal(c.poppy.titulo, 'Outro nome');
      assert.deepEqual(c.poppy.blocos, base.poppy.blocos);
    });

    assert.equal(readFileSync(real, 'utf8'), original, 'o content.js de verdade foi mexido');
    console.log(`\n  Tudo certo: ${casos} casos. O js/content.js de verdade nao foi tocado.`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- linha de comando -------------------------------------------------------------------------

try {
  const [arg] = process.argv.slice(2);
  if (arg === '--teste') teste();
  else {
    const mudou = colocar(path.join(raiz, 'js', 'content.js'), arg || path.join(raiz, 'textos'));
    console.log(mudou ? '\n  Pronto: os textos estao no js/content.js.' : '\n  Nada mudou no js/content.js.');
  }
} catch (erro) {
  console.error(`\n  ${erro.message}\n`);
  process.exit(1);
}
