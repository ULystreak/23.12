// A última folha (contrato 4.7): fica DENTRO do mundo 3D, com pétalas passando
// na frente e atrás. Uma folha comprida (1:2) dobrada em três, que desdobra e
// recebe a frase escrita à mão, letra por letra.
//
//   const folha = criarFolha(mundo);
//   folha.grupo                         Object3D; a folha se põe sozinha em mundo.cena quando aparece
//   folha.desdobrar() → Promise         vem até a posição de leitura (se ainda não veio) e abre as duas dobras
//   folha.escrever(texto, opcoes?) → Promise   opcoes.aoTraco(): chamado a cada letra (som da caneta)
//   folha.atualizar(dt, t)              a cena chama a cada quadro (mundo.aoQuadro)
//   folha.irEmbora() → Promise          sobe e sai pelo alto da tela (o menu do fim chegou); depois, dispose()
//   folha.dispose()
//
// Além do contrato (usado por js/cenas/final.js):
//   folha.preparar(texto) → Promise     carrega a letra e compõe a frase antes da hora (sem engasgo depois)
//   folha.assumir(papel)                aparece dobrada exatamente onde está o papel que saiu da carta
//   folha.repousarFio() → Promise       o fio, solto, vem repousar sobre o canto de baixo da folha
//   folha.viver()                       de tempos em tempos uma pétala pousa num canto, fica e escorrega
//   folha.recuar()                      no fim, em tela baixa, recua um pouco: o contador e o botão respiram
//
// Duas letras na mesma folha (usado por js/cenas/resposta.js):
//   folha.escreverDela(texto, opcoes?) → Promise   o que ela escreveu na folha de resposta, à mão,
//                                       com a mesma caneta e em tinta rosa (--sakura-tinta), no terço
//                                       de baixo, embaixo da frase dele; opcoes.aoTraco como em escrever()
//   folha.apagarDela()                  tira a letra dela (e para a que estiver no meio)
// O bloco dela fica à esquerda, em no máximo 70% da largura, com um corpo menor
// que o dele, sem encostar na frase dele nem no fio que repousa (canto de baixo à
// direita). Com a letra dela na folha, a pétala não pousa no canto de baixo à
// esquerda (se já estiver lá, levanta antes da primeira letra). Sem emoji; texto
// longo primeiro diminui o corpo e só então é cortado na palavra (~180
// caracteres, com reticências); o texto inteiro continua guardado na resposta.
//
// A escrita é um motor só (canvas 2D), usado pelas duas variantes: no 3D o
// canvas é a textura da tinta (atualizada só enquanto escreve e seca); sem
// WebGL, o mesmo canvas fica dentro de uma folha em DOM que desdobra em CSS 3D.
// A letra dela é uma segunda instância do mesmo motor: no 3D, um segundo par de
// uniformes no papel; sem WebGL, um segundo canvas, na aba de baixo.

import { el, espera, clamp, lerp, suave, amortecer, semente, svg, objetoLeve } from '../nucleo/util.js';
import { curvas, comoPromise } from '../nucleo/movimento.js';
import { criarFio } from './fio.js';

// ---- a folha -------------------------------------------------------------------
const LARGURA = 0.45;                 // metros (o mundo é grande: a carta tem 36 cm)
const ALTURA = 0.9;                   // 1:2. Dobrada em três fica 3:2, a proporção do papel que sai da carta
const ALTURA_OLHOS = 1.5;             // contrato 4.3
const VINCO_CIMA = ALTURA / 3;        // distância do topo até cada vinco
const VINCO_BAIXO = (ALTURA * 2) / 3;
const RAIO_CIMA = 0.008;              // meia largura do arco de cada vinco (o de fora é mais folgado)
const RAIO_BAIXO = 0.017;
const FECHADA_CIMA = Math.PI * 0.992; // ângulos da folha dobrada
const FECHADA_BAIXO = Math.PI * 0.985;
const ABERTA_CIMA = 0.06;             // o papel guarda a memória da dobra: nunca fica plano de todo
const ABERTA_BAIXO = 0.085;
const COLUNAS = 10;
// No fim o contador fica no alto e o botão de reabrir embaixo: recuar() deixa esta
// faixa (px de tela) livre em cima e embaixo. Só pesa em tela baixa (a do Safari).
const MARGEM_FIM = 100;

// ---- a letra -------------------------------------------------------------------
const COR_TINTA = [42, 27, 34];       // --tinta, depois de seca
const COR_MOLHADA = [15, 5, 10];      // recém-escrita: mais escura
const FONTE = '"Klee One", "Shippori Mincho", Georgia, serif';
const PESO = 600;
// Quase nada de inclinação comum (senão vira "itálico de fonte"): o que faz a mão
// é a diferença de uma letra para a outra e a linha de base que oscila.
const INCLINACAO = 0.02;
const APERTO = -0.045;                // a Klee One é espaçada de fôrma: a mão aproxima as letras (em tamanhos de letra)
// Cada letra sai um nada diferente da outra (nunca o mesmo carimbo): altura,
// giro, tamanho e inclinação variam pouco, e devagar ao longo da palavra.
const VARIA = { altura: 0.06, giro: 0.055, tamanho: 0.055, inclinacao: 0.03 };
const ENTRELINHA = 1.6;
const MARGEM_ESQ = 0.11;              // em larguras de folha (margem curta: o corpo da letra vem antes)
const LARGURA_UTIL = 0.79;
const CADENCIA = 0.122;               // segundos por letra, em média (o ritmo real vem da tinta de cada letra)
const SECAGEM = 1.5;                  // segundos até a tinta ficar da cor final
const GORDURA = 0.0065;               // quanto a tinta molhada é mais cheia (em tamanhos de letra, por lado)

// ---- a letra dela ----------------------------------------------------------------
// A mesma mão e a mesma caneta, em tinta rosa (--sakura-tinta, 7,4:1 no papel: o
// vermelho cheio é do fio), um pouco mais depressa que a dele.
const DELA = {
  tinta: [143, 31, 69],               // --sakura-tinta, depois de seca
  molhada: [96, 10, 42],              // recém-escrita: mais funda
  tempo: 0.8,                         // o tempo de cada letra, comparado com o dele: um pouco mais depressa
  teto: 12,                           // segundos (no ritmo dele): texto longo anda mais depressa, não demora mais
  corpo: 0.7,                         // o maior corpo dela, em corpos da frase dele
  menor: 0.04,                        // o menor corpo, em larguras de folha: daí para baixo, corta
  entrelinha: 1.45,                   // a letra menor, de bilhete, vem mais junta
  largura: 0.7,                       // a linha mais longa, em larguras de folha (da margem dele para a direita)
  // A faixa dela, em alturas de folha a partir do topo: logo abaixo do vinco de baixo
  // (ou da frase dele, se descer) até perto da borda, longe do fio que repousa à
  // direita (FIO_REPOUSO). Ela passa pelo canto de baixo à esquerda: com a letra dela
  // na folha, a pétala não pousa ali (POUSOS, `dela`).
  topo: 0.69,
  base: 0.93,
  baseBaixa: 0.84,                    // em tela baixa (deitado, zoom alto) o botão de reabrir cobre o pé da folha
  limite: 180,                        // caracteres; o resto continua guardado na resposta dela
};

export function criarFolha(mundo) {
  return mundo.ok ? criarFolha3D(mundo) : criarFolhaLeve(mundo);
}

function espelhoParaLeitor() {
  // A frase inteira para leitores de tela, anunciada uma vez (a tinta é só imagem).
  // A região viva nasce VAZIA, junto com a folha: uma região que já entra com o
  // texto costuma não ser anunciada. O texto chega depois, em anunciar().
  const p = el('p', { class: 'so-leitor', 'aria-live': 'polite' });
  (document.getElementById('palco') || document.body).append(p);
  return p;
}

/** Escreve a frase na região viva um quadro depois (assim a mudança é anunciada). */
function anunciar(p, texto) {
  if (!p) return;
  if (!p.isConnected) (document.getElementById('palco') || document.body).append(p);
  requestAnimationFrame(() => requestAnimationFrame(() => { p.textContent = texto; }));
}

/** Espera a fonte manuscrita (no máximo ~1,5 s; se faltar, o navegador usa a reserva). */
async function fontePronta(texto) {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.race([document.fonts.load(`${PESO} 64px ${FONTE}`, texto || 'a'), espera(1500)]);
  } catch { /* segue com a reserva */ }
}

function sementeDoTexto(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
function misturar(a, b, k) {
  return `rgb(${Math.round(lerp(a[0], b[0], k))},${Math.round(lerp(a[1], b[1], k))},${Math.round(lerp(a[2], b[2], k))})`;
}

// Emoji (com tons de pele, bandeiras, o número na moldura de tecla e as junções): a fonte não tem, e a
// tinta lida pixel a pixel viraria um borrão. Com eles saem os caracteres que não se veem (o
// espaço de largura zero e parecidos): um texto só deles não escreve nada.
const EMOJI = /[0-9#*]\ufe0f?\u20e3|[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200b-\u200f\u2060\ufeff\ufe0e\ufe0f\u20e3\u{e0020}-\u{e007f}]/gu;
// O emoji colado entre duas palavras, sem espaço, fazia as vezes do espaço: sai, mas deixa um
// (senão "obrigada", o emoji e "te amo" viram "obrigadate amo" na folha).
const EMOJI_ENTRE = new RegExp(`(\\S)(?:${EMOJI.source})+(?=[\\p{L}\\p{N}])`, 'gu');

/**
 * O texto da folha de resposta como vai para a folha dele: sem emoji, espaços juntos,
 * no máximo uma quebra de linha seguida, palavra comprida demais partida (senão sai
 * pela borda) e, passando do limite, cortado na palavra, com reticências (três pontos:
 * o … da Klee One é o japonês, no meio da linha; o que ela digitar também vira três pontos).
 * O acento que vier solto da letra (texto colado) junta-se a ela: a mão desenha glifo a glifo.
 */
function textoDela(texto) {
  let t = String(texto ?? '').normalize('NFC').replace(EMOJI_ENTRE, '$1 ').replace(EMOJI, '').replace(/…/g, '...')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n\s*/g, '\n')
    .trim()
    .replace(/\S{19,}/gu, (p) => p.match(/.{1,18}/gu).join(' '));
  const letras = Array.from(t);
  if (letras.length > DELA.limite) {
    // um a mais: diz se o corte cai entre duas palavras ou no meio de uma
    const corte = letras.slice(0, DELA.limite + 1).join('').replace(/\s*\S*$/u, '')
      || letras.slice(0, DELA.limite).join('');
    t = `${corte.replace(/[\s,;:.!?…–—-]+$/u, '')}...`;
  }
  return t;
}

/**
 * As opções de compor() para a letra dela: a faixa (px da folha, do topo) vai do vinco
 * de baixo (ou de logo abaixo da frase dele, se ela descer) até perto da borda de baixo;
 * o corpo é menor que o dele.
 */
function faixaDela(U, planoDele) {
  let fimDele = 0;
  for (const t of (planoDele && planoDele.tracos) || []) fimDele = Math.max(fimDele, planoDele.topoFolha + t.base);
  const fsDele = (planoDele && planoDele.fs) || Math.round(U * 0.1);
  const topo = Math.max(2 * U * DELA.topo, fimDele + fsDele * 0.6);
  const base = 2 * U * (innerHeight < 520 ? DELA.baseBaixa : DELA.base);
  const fsMax = Math.round(fsDele * DELA.corpo);
  return {
    centro: (topo + base) / 2,
    alturaMax: base - topo,
    fsMax,
    fsMin: Math.min(fsMax, U * DELA.menor),
    larguraMax: U * DELA.largura,
    entrelinha: DELA.entrelinha,
    alinhar: 'topo',
    cortar: true,
  };
}

// =============================================================================
// ESCRITA: a mão que escreve (canvas 2D, o mesmo motor no 3D e no leve)
// =============================================================================
//
// Como funciona:
// 1. A frase é quebrada em linhas equilibradas, alinhadas à esquerda, e cada
//    palavra ganha a sua posição (com as pequenas irregularidades de quem
//    escreve: a linha sobe um pouco, as palavras não pousam todas na mesma altura).
// 2. Cada palavra é desenhada fora da tela e lida coluna por coluna: onde há
//    tinta, por onde a ponta da caneta passa (o traço mais próximo do anterior)
//    e quanta tinta há ali. O tempo gasto em cada coluna é proporcional à
//    tinta: letra larga ou alta demora mais, espaço entre letras passa depressa.
// 3. A cada quadro, um recorte que avança com a ponta revela a palavra. O que
//    acabou de ser escrito é redesenhado mais escuro e mais cheio (tinta
//    molhada) e vai secando; o que já secou é gravado numa segunda tela e não
//    é mais tocado.

// tinta/molhada: as cores (a dele por padrão); tempo: o de cada letra (1 = o dele, menor = mais depressa);
// teto: segundos (no ritmo dele) que um texto longo pode levar, no máximo.
function criarEscrita({ amb, largura = 1024, tinta: COR_SECA = COR_TINTA, molhada: COR_FRESCA = COR_MOLHADA, tempo = 1, teto = Infinity }) {
  const U = Math.round(largura);                      // px do canvas por largura de folha
  const tela = document.createElement('canvas');      // o que se vê: tinta seca + cauda molhada
  const seca = document.createElement('canvas');      // só a tinta já seca
  const aux = document.createElement('canvas');       // rascunho para ler a tinta de cada palavra
  tela.width = seca.width = U;
  tela.height = seca.height = 8;
  let pincel = tela.getContext('2d');
  let pincelSeco = seca.getContext('2d');
  const lapis = aux.getContext('2d', { willReadFrequently: true });

  const calmo = !!amb.reduzido;
  let plano = null;
  let T = 0;
  let ativo = false;
  let aoTerminar = null;
  // Faixas de linhas do canvas que mudaram desde a última leitura (ver tirarFaixas()).
  let faixas = [];
  const marcarFaixa = (y0, y1) => {
    y0 = Math.max(0, Math.floor(y0));
    y1 = Math.min(tela.height, Math.ceil(y1));
    if (y1 > y0) faixas.push([y0, y1]);
  };
  /** Junta faixas que se tocam; devolve a lista em ordem. */
  const juntar = (lista) => {
    lista.sort((a, b) => a[0] - b[0]);
    const saida = [];
    for (const f of lista) {
      const u = saida[saida.length - 1];
      if (u && f[0] <= u[1]) u[1] = Math.max(u[1], f[1]);
      else saida.push([f[0], f[1]]);
    }
    return saida;
  };
  let aoTraco = null;
  let ultimoTraco = -1;

  const fonte = (fs) => `${PESO} ${fs}px ${FONTE}`;

  // ---- composição ----------------------------------------------------------------

  // Palavra de uma letra ("a", "e", "o", "é") não fica sozinha no fim da linha: desce com a seguinte.
  const presa = (p) => p !== '\n' && Array.from(p).length === 1 && /\p{L}/u.test(p);

  function quebrar(palavras, larguras, espaco, maximo) {
    const linhas = [];
    let atual = [];
    let soma = 0;
    palavras.forEach((p, i) => {
      if (p === '\n') { linhas.push(atual); atual = []; soma = 0; return; }
      const nova = atual.length ? soma + espaco + larguras[i] : larguras[i];
      if (atual.length && nova > maximo) {
        const novo = [i];
        let somaNovo = larguras[i];
        // (no máximo duas: uma fila de letras soltas não desce inteira, linha após linha)
        while (atual.length > 1 && novo.length < 3 && presa(palavras[atual[atual.length - 1]])) {
          const j = atual.pop();
          novo.unshift(j);
          somaNovo += larguras[j] + espaco;
        }
        linhas.push(atual);
        atual = novo;
        soma = somaNovo;
      } else { atual.push(i); soma = nova; }
    });
    linhas.push(atual);
    return linhas.filter((l, i) => l.length || (i > 0 && i < linhas.length - 1));
  }

  /** Quebra equilibrada: o menor comprimento de linha que mantém o mesmo número de linhas. */
  function quebrarEquilibrado(palavras, larguras, espaco, maximo) {
    const base = quebrar(palavras, larguras, espaco, maximo);
    if (base.length < 2) return base;
    let menor = Math.max(...larguras.filter((l, i) => palavras[i] !== '\n'));
    let maior = maximo;
    let melhor = base;
    for (let i = 0; i < 12; i++) {
      const meio = (menor + maior) / 2;
      const tentativa = quebrar(palavras, larguras, espaco, meio);
      if (tentativa.length <= base.length) { melhor = tentativa; maior = meio; } else { menor = meio; }
    }
    return melhor;
  }

  // ---- letra por letra -------------------------------------------------------------
  // A palavra é desenhada glifo a glifo: o avanço vem da própria fonte (o prefixo
  // medido guarda o kerning), mais o aperto da mão, e cada glifo ganha a sua
  // pequena diferença de altura, giro, tamanho e inclinação.

  let fonteLapis = '';
  function medir(txt, fs) {
    const f = fonte(fs);
    if (fonteLapis !== f || lapis.font !== f) { lapis.font = f; fonteLapis = f; }
    return lapis.measureText(txt).width + APERTO * fs * Array.from(txt).length;
  }

  function glifos(txt, fs, escala, sorte) {
    const letras = Array.from(txt);
    const lista = [];
    const v = { a: 0, g: 0, t: 0, i: 0 };
    let prefixo = '';
    const passo = (atual) => atual * 0.45 + (sorte() - 0.5) * 2 * 0.55;   // varia devagar, sem saltos
    letras.forEach((ch, k) => {
      v.a = passo(v.a); v.g = passo(v.g); v.t = passo(v.t); v.i = passo(v.i);
      lista.push({
        ch,
        dx: (k ? medir(prefixo, fs) : 0) * escala,
        dy: v.a * VARIA.altura * fs,
        r: v.g * VARIA.giro,
        s: 1 + v.t * VARIA.tamanho,
        k: INCLINACAO + v.i * VARIA.inclinacao,
      });
      prefixo += ch;
    });
    return lista;
  }

  /** Desenha a palavra a partir de (ox, oy) na linha de base; `pinta(glifo, escala)` faz o fill/stroke. */
  function desenharPalavra(c, p, ox, oy, pinta) {
    for (const g of p.glifos) {
      const s = p.escala * g.s;
      const co = Math.cos(g.r);
      const si = Math.sin(g.r);
      c.setTransform(s * co, s * si, s * (-g.k * co - si), s * (co - g.k * si), ox + g.dx, oy + g.dy);
      pinta(g, s);
    }
  }

  /**
   * Quebra o texto em linhas e palavras. Sem opções é a frase dele: no terço do meio,
   * centrada um nada acima do meio da folha. Opções (px da folha, a partir do topo):
   *   centro, alturaMax   a faixa onde o bloco tem de caber (o meio dela e a altura)
   *   fsMax, fsMin        o maior e o menor corpo
   *   larguraMax          a linha mais longa (da margem para a direita)
   *   entrelinha          de uma linha de base à outra, em corpos
   *   alinhar             'meio': centrado na faixa; 'topo': encostado no alto dela
   *   cortar              o bloco nunca sai da faixa, nem pelos lados: se nem no menor
   *                       corpo couber, os parágrafos se juntam numa linha corrida e
   *                       depois o fim perde palavras, com reticências (a letra dela)
   */
  function compor(texto, opcoes = {}) {
    const limpo = String(texto ?? '').replace(/\r/g, '').trim();
    const palavras = [];
    limpo.split('\n').forEach((paragrafo, i) => {
      if (i) palavras.push('\n');
      for (const p of paragrafo.split(/\s+/).filter(Boolean)) palavras.push(p);
    });
    const sorte = semente(sementeDoTexto(limpo) || 1);

    // Tamanho da letra: o maior que deixa o bloco dentro do terço do meio; frase
    // muito longa pode atravessar os vincos e, só então, diminui mais.
    const terco = (2 * U) / 3;
    const {
      centro = U * 0.985,                 // um nada acima do meio da folha
      alturaMax = terco * 0.9,
      // Corpo de clímax: ~28–34 px na tela do celular e do computador (a folha
      // ocupa ~300 px de largura ali), maior que as frases de abertura.
      fsMax = U * 0.1,
      fsMin = U * 0.028,
      larguraMax: maximo = U * LARGURA_UTIL,
      entrelinha = ENTRELINHA,
      alinhar = 'meio',
      cortar = false,
    } = opcoes;
    let fs = Math.round(fsMax);
    const menor = Math.round(fsMin);        // (o laço para no menor corpo arredondado: senão nunca chega lá)
    let linhas = [];
    let larguras = [];
    let espaco = 0;
    let alturaBloco = 0;
    let cabe = false;
    const larguraDa = (l) => l.reduce((s, i, k) => s + larguras[i] + (k ? espaco : 0), 0);
    for (;;) {
      lapis.font = fonte(fs);
      larguras = palavras.map((p) => (p === '\n' ? 0 : medir(p, fs) * 1.02));
      espaco = lapis.measureText(' ').width * 0.98;
      linhas = quebrarEquilibrado(palavras, larguras, espaco, maximo);
      // altura que se vê: das hastes da primeira linha às pernas da última
      alturaBloco = (linhas.length - 1) * fs * entrelinha + fs * 1.15;
      cabe = cortar
        ? alturaBloco <= alturaMax && linhas.every((l) => larguraDa(l) <= maximo)
        : fs > U * 0.039 ? alturaBloco <= alturaMax : alturaBloco <= 2 * U * 0.72;
      if (cabe || fs <= menor) break;
      fs = Math.max(Math.round(fs * 0.94), menor);
    }
    if (!cabe && cortar) {
      const corrido = limpo.replace(/\n/g, ' ');
      if (corrido !== limpo) return compor(corrido, opcoes);
      const menos = limpo.replace(/\s*\S+$/u, '').replace(/[\s,;:.!?…–—-]+$/u, '');
      if (menos) return compor(`${menos}...`, opcoes);
    }

    const passo = fs * entrelinha;
    const n = Math.max(1, linhas.length);
    const meio = alinhar === 'topo' ? centro - alturaMax / 2 + alturaBloco / 2 : centro;
    const primeira = meio - ((n - 1) * passo) / 2 + fs * 0.36;   // linha de base da primeira linha (px da folha), centro ótico
    const topoFolha = Math.max(0, Math.floor(primeira - fs * 1.45));
    const baseFolha = Math.min(2 * U, Math.ceil(primeira + (n - 1) * passo + fs * 0.85));
    const altura = Math.max(8, baseFolha - topoFolha);

    // Cada pedaço de escrita: uma palavra, ou o ponto final separado dela (a
    // mão para um instante antes de pôr o ponto).
    const tracos = [];
    const total = limpo.replace(/\s+/g, '').length;
    let contados = 0;
    linhas.forEach((indices, li) => {
      const subida = -(0.010 + sorte() * 0.006);                 // a linha sobe de leve para a direita
      let x = U * MARGEM_ESQ + (sorte() - 0.5) * fs * 0.16;
      const x0 = x;
      const yLinha = primeira - topoFolha + li * passo;
      indices.forEach((pi, wi) => {
        const palavra = palavras[pi];
        const escala = 1 + (sorte() - 0.5) * 0.035;
        const y = yLinha + (x - x0) * subida + (sorte() - 0.5) * fs * 0.035;
        const partes = /^(.*[^.!?…])([.!?…]+)$/.exec(palavra);
        const pedacos = partes ? [partes[1], partes[2]] : [palavra];
        let xp = x;
        pedacos.forEach((txt, k) => {
          contados += txt.length;
          tracos.push({
            texto: txt, x: xp, y, escala, linha: li,
            colado: k > 0,
            primeiroDaLinha: wi === 0 && k === 0 && li > 0,
            ultimoDoTexto: contados >= total,
            pontuacao: k > 0,
            glifos: glifos(txt, fs, escala, sorte),
          });
          xp += medir(txt, fs) * escala;
        });
        x += larguras[pi] * escala + espaco * (0.92 + sorte() * 0.2);
      });
    });

    return { texto: limpo, fs, linhas: n, topoFolha, altura, tracos, sorte, cabe };
  }

  // ---- a tinta de cada palavra ------------------------------------------------------

  function lerTinta(p, fs, espessura) {
    const borda = Math.ceil(fs * 0.5);
    const avanco = medir(p.texto, fs) * p.escala;
    const larg = Math.ceil(avanco + borda * 2 + fs * (INCLINACAO + VARIA.inclinacao) * 1.3);
    const alt = Math.ceil(fs * 2.3);
    const base = Math.round(fs * 1.45);
    aux.width = larg;
    aux.height = alt;
    lapis.font = fonte(fs);
    fonteLapis = '';
    lapis.textBaseline = 'alphabetic';
    lapis.fillStyle = '#000';
    const fx = p.x - Math.floor(p.x);
    const fy = p.y - Math.floor(p.y);
    desenharPalavra(lapis, p, borda + fx, base + fy, (g) => lapis.fillText(g.ch, 0, 0));
    lapis.setTransform(1, 0, 0, 1, 0, 0);
    const dados = lapis.getImageData(0, 0, larg, alt).data;

    const centros = new Float32Array(larg).fill(NaN);
    const tinta = new Float32Array(larg);
    const trechos = [];
    let primeira = -1;
    let ultima = -1;
    let topo = alt;
    let fundo = 0;
    let anterior = NaN;
    for (let c = 0; c < larg; c++) {
      // trechos de tinta desta coluna
      let inicio = -1;
      let melhor = NaN;
      let melhorDist = Infinity;
      let maiorTrecho = 0;
      let soma = 0;
      for (let r = 0; r <= alt; r++) {
        const cheio = r < alt && dados[(r * larg + c) * 4 + 3] > 56;
        if (cheio && inicio < 0) inicio = r;
        if (!cheio && inicio >= 0) {
          const tamanho = r - inicio;
          const meio = inicio + tamanho / 2;
          soma += tamanho;
          trechos.push(tamanho);
          topo = Math.min(topo, inicio);
          fundo = Math.max(fundo, r);
          // a ponta segue o traço mais próximo de onde estava; na primeira coluna, o mais comprido
          const dist = Number.isNaN(anterior) ? -tamanho : Math.abs(meio - anterior);
          if (dist < melhorDist || (Number.isNaN(anterior) && tamanho > maiorTrecho)) { melhorDist = dist; melhor = meio; }
          maiorTrecho = Math.max(maiorTrecho, tamanho);
          inicio = -1;
        }
      }
      if (soma > 0) {
        if (primeira < 0) primeira = c;
        ultima = c;
        centros[c] = melhor;
        anterior = melhor;
      }
      tinta[c] = soma;
    }
    if (primeira < 0) { primeira = borda; ultima = borda + 1; centros[primeira] = base; centros[ultima] = base; }

    // posição no canvas da escrita
    const origemX = Math.floor(p.x) - borda;
    const origemY = Math.floor(p.y) - base;
    const nCol = ultima - primeira + 1;
    const ys = new Float32Array(nCol);
    // preenche os vazios (entre letras) ligando os vizinhos
    let ultimoBom = centros[primeira];
    for (let i = 0; i < nCol; i++) {
      const v = centros[primeira + i];
      if (Number.isNaN(v)) {
        let j = i + 1;
        while (j < nCol && Number.isNaN(centros[primeira + j])) j++;
        const proximo = j < nCol ? centros[primeira + j] : ultimoBom;
        const k = (i - (i - 1)) / Math.max(1, j - (i - 1));
        ys[i] = lerp(ultimoBom, proximo, k);
        ultimoBom = ys[i];
      } else {
        ys[i] = v;
        ultimoBom = v;
      }
    }
    // suaviza: a ponta não dá saltos
    const raio = Math.max(1, Math.round(fs * 0.045));
    const liso = new Float32Array(nCol);
    for (let i = 0; i < nCol; i++) {
      let s = 0;
      let q = 0;
      for (let j = Math.max(0, i - raio); j <= Math.min(nCol - 1, i + raio); j++) { s += ys[j]; q++; }
      liso[i] = s / q + origemY;
    }

    // esforço de cada coluna: quanta tinta a ponta precisa deixar ali
    const fronteiras = [];
    for (let k = 1; k < p.glifos.length; k++) fronteiras.push(borda + p.glifos[k].dx - primeira);
    const esforco = new Float32Array(nCol);
    for (let i = 0; i < nCol; i++) {
      const quantidade = tinta[primeira + i] / espessura;
      let e = quantidade > 0 ? Math.max(0.7, Math.min(quantidade, 9)) : 0.45;
      // entre uma letra e outra a mão hesita um nada
      for (const f of fronteiras) {
        const d = (i - f) / (fs * 0.05);
        e *= 1 + 0.9 * Math.exp(-d * d);
      }
      esforco[i] = e;
    }

    p.x0 = origemX + primeira;
    p.x1 = origemX + ultima;
    p.topo = Math.max(0, origemY + topo - Math.ceil(fs * 0.12));
    p.base = origemY + fundo + Math.ceil(fs * 0.12);
    p.ys = liso;
    p.esforco = esforco;
    p.trechos = trechos;
    return p;
  }

  function mediana(lista) {
    if (!lista.length) return 1;
    const ordenada = Float32Array.from(lista).sort();
    return ordenada[Math.floor(ordenada.length / 2)];
  }

  // Gerador: cede a vez depois de cada palavra lida (ver prepararAosPoucos).
  function* planejar(texto, opcoes) {
    const p = compor(texto, opcoes);
    const { fs, tracos, sorte } = p;

    // espessura do traço desta letra, neste tamanho (para medir "quanta tinta")
    let espessura = fs * 0.075;
    for (const t of tracos) { lerTinta(t, fs, espessura); yield; }
    const todas = [];
    for (const t of tracos) for (const v of t.trechos) todas.push(v);
    espessura = Math.max(2, mediana(todas));
    for (const t of tracos) { lerTinta(t, fs, espessura); yield; }

    // ritmo: o esforço total vira tempo, na cadência média de quem escreve com calma
    const letras = p.texto.replace(/\s+/g, '').length;
    let esforcoTotal = 0;
    for (const t of tracos) for (const e of t.esforco) esforcoTotal += e;
    const ritmo = (calmo ? 0.42 : 1) * tempo;
    const porEsforco = esforcoTotal > 0 ? (letras * CADENCIA * ritmo) / esforcoTotal : 0;

    let relogio = 0;
    tracos.forEach((t, i) => {
      // pausa antes: espaço, vírgula, fim de frase, troca de linha, ponto final
      let pausa = 0;
      if (i > 0) {
        const antes = tracos[i - 1];
        if (t.colado) pausa = t.ultimoDoTexto ? 0.34 : 0.1;
        else {
          pausa = 0.1 + sorte() * 0.06;
          if (/[,;:]$/.test(antes.texto)) pausa += 0.28;
          if (antes.pontuacao) pausa += 0.42;
          if (t.primeiroDaLinha) pausa += 0.22;
        }
      }
      relogio += pausa * ritmo;
      const pressa = 0.9 + sorte() * 0.22;                      // cada palavra tem o seu humor
      const ts = new Float32Array(t.esforco.length + 1);
      let soma = 0;
      for (let k = 0; k < t.esforco.length; k++) {
        // variação lenta dentro da palavra
        const onda = 1 + 0.16 * Math.sin(k * 0.055 + i * 1.7) + 0.08 * Math.sin(k * 0.21 + i);
        soma += t.esforco[k] * porEsforco * pressa * onda;
        ts[k + 1] = soma;
      }
      t.ts = ts;
      t.dur = soma;
      t.inicio = relogio;
      relogio += soma;
      t.fim = relogio;
      t.seco = t.x0;
      t.feito = false;
      t.tocou = false;
      // marcas de tempo de cada letra, para o som da caneta
      t.letras = Math.max(1, t.texto.length);
    });
    // texto longo não demora mais que o teto: a mão só anda mais depressa
    const k = (teto * ritmo) / relogio;
    if (k < 1) {
      for (const t of tracos) {
        t.ts = t.ts.map((v) => v * k);
        t.dur *= k; t.inicio *= k; t.fim *= k;
      }
      relogio *= k;
    }
    p.duracao = relogio;

    // telas
    tela.width = seca.width = U;
    tela.height = seca.height = p.altura;
    pincel = tela.getContext('2d');
    pincelSeco = seca.getContext('2d');
    for (const c of [pincel, pincelSeco]) {
      c.font = fonte(fs);
      c.textBaseline = 'alphabetic';
      c.lineJoin = 'round';
    }
    return p;
  }

  // ---- desenho ---------------------------------------------------------------------

  /** Coluna (fracionária, a partir de x0) onde a ponta está no tempo `t` da palavra. */
  function colunaNoTempo(p, t) {
    const ts = p.ts;
    if (t <= 0) return 0;
    if (t >= p.dur) return ts.length - 1;
    let a = 0;
    let b = ts.length - 1;
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (ts[m] <= t) a = m; else b = m;
    }
    const intervalo = ts[b] - ts[a];
    return a + (intervalo > 0 ? (t - ts[a]) / intervalo : 0);
  }

  function tempoNaColuna(p, x) {
    const c = x - p.x0;
    if (c <= 0) return 0;
    if (c >= p.ts.length - 1) return p.dur;
    const i = Math.floor(c);
    return lerp(p.ts[i], p.ts[i + 1], c - i);
  }

  function alturaDaPonta(p, coluna) {
    const ys = p.ys;
    const i = clamp(Math.floor(coluna), 0, ys.length - 1);
    const j = Math.min(ys.length - 1, i + 1);
    return lerp(ys[i], ys[j], clamp(coluna - i));
  }

  /** Grava na tela seca a faixa [xa, xb) da palavra, na cor final. Recorte alinhado ao pixel: sem emendas. */
  function gravar(p, xa, xb) {
    const c = pincelSeco;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.beginPath();
    c.rect(xa, p.topo, xb - xa, p.base - p.topo);
    c.clip();
    c.fillStyle = rgb(COR_SECA);
    desenharPalavra(c, p, p.x, p.y, (g) => c.fillText(g.ch, 0, 0));
    c.restore();
  }

  function umidade(p, x) {
    return clamp(1 - (T - (p.inicio + tempoNaColuna(p, x))) / SECAGEM);
  }

  function desenharMolhada(p, fs) {
    const c = pincel;
    const t = T - p.inicio;
    const escrevendo = t < p.dur;
    const arremate = clamp((t - p.dur) / 0.09);                 // a ponta sai da palavra
    const raio = fs * 0.055;
    const atraso = calmo ? fs * 0.04 : fs * 0.13;               // a tinta longe da ponta aparece um nada depois
    const coluna = colunaNoTempo(p, t);
    const px = escrevendo ? p.x0 + coluna : p.x1 + (atraso + raio + 2) * arremate;
    const py = alturaDaPonta(p, coluna);
    const inteira = !escrevendo && arremate >= 1;
    const xa = p.seco;
    const xb = p.x1 + 1;
    if (xb <= xa) return null;

    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.beginPath();
    if (inteira) {
      c.rect(xa, p.topo, xb - xa, p.base - p.topo);
    } else {
      // o recorte tem um bico que aponta para a ponta da caneta
      c.moveTo(xa, p.topo);
      c.lineTo(Math.max(xa, px - atraso), p.topo);
      c.bezierCurveTo(px - atraso, py - fs * 0.5, px + raio, py - fs * 0.28, px + raio, py);
      c.bezierCurveTo(px + raio, py + fs * 0.28, px - atraso, py + fs * 0.5, Math.max(xa, px - atraso), p.base);
      c.lineTo(xa, p.base);
      c.closePath();
    }
    c.clip();

    // cor: do seco (à esquerda) ao molhado (na ponta)
    // cor: um degradê na horizontal da tela; cada glifo tem o seu espaço, então
    // o degradê é refeito no espaço de cada um (giro e inclinação são pequenos)
    const fimX = Math.max(xa + 1, Math.min(px, xb));
    const paradas = [];
    for (let i = 0; i <= 5; i++) {
      const k = i / 5;
      paradas.push(misturar(COR_SECA, COR_FRESCA, Math.pow(umidade(p, lerp(xa, fimX, k)), 0.8)));
    }
    const tomDo = (g, s) => {
      const e = p.x + g.dx;
      const h = s * Math.cos(g.r);
      const tom = c.createLinearGradient((xa - e) / h, 0, (fimX - e) / h, 0);
      paradas.forEach((cor, i) => tom.addColorStop(i / 5, cor));
      return tom;
    };
    desenharPalavra(c, p, p.x, p.y, (g, s) => {
      if (p.x + g.dx + fs * 1.2 < xa) return;              // já seco: está na outra tela
      c.fillStyle = tomDo(g, s);
      c.fillText(g.ch, 0, 0);
    });

    // mais cheia enquanto molhada: duas faixas de contorno, a mais nova mais grossa
    const faixas = [[0.55, 2 * GORDURA], [0.14, GORDURA]];
    let limite = xb;
    for (const [nivel, grossura] of faixas) {
      // primeira coluna com umidade acima de `nivel`
      const tAlvo = T - p.inicio - (1 - nivel) * SECAGEM;
      const xi = Math.max(xa, Math.floor(p.x0 + colunaNoTempo(p, tAlvo)));
      if (xi < limite) {
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.beginPath();
        c.rect(xi, p.topo, limite - xi, p.base - p.topo);
        c.clip();
        desenharPalavra(c, p, p.x, p.y, (g, s) => {
          const e = p.x + g.dx;
          if (e > limite + fs || e + fs * 1.2 < xi) return;
          c.strokeStyle = tomDo(g, s);
          c.lineWidth = (grossura * fs) / s;
          c.strokeText(g.ch, 0, 0);
        });
        c.restore();
      }
      limite = xi;
    }
    c.restore();

    return escrevendo || arremate < 1 ? { x: px, y: py, viva: escrevendo ? clamp(t / 0.05) : 1 - arremate } : null;
  }

  function avancar(dt) {
    if (!ativo || !plano) return false;
    T += Math.max(0, dt);
    const { tracos, fs } = plano;
    const molhadas = [];
    let falta = false;

    for (const p of tracos) {
      if (p.feito) continue;
      if (T < p.inicio) { falta = true; break; }
      // o som da caneta acompanha as letras
      if (aoTraco) {
        const letra = Math.floor(clamp((T - p.inicio) / Math.max(0.001, p.dur)) * p.letras);
        const chave = tracos.indexOf(p) * 1000 + Math.min(letra, p.letras - 1);
        if (chave !== ultimoTraco && T < p.fim) { ultimoTraco = chave; aoTraco(); }
      }
      // o que já secou vai para a tela seca
      const tSeco = T - SECAGEM - p.inicio;
      const ate = tSeco >= p.dur ? p.x1 + 1 : Math.floor(p.x0 + colunaNoTempo(p, tSeco));
      if (ate > p.seco) { gravar(p, p.seco, ate); p.seco = ate; }
      if (p.seco > p.x1) p.feito = true;
      molhadas.push(p);
      falta = true;
    }

    if (!molhadas.length) {
      if (!falta) ativo = false;
      return false;
    }

    // refaz só as faixas das palavras com tinta molhada (uma por linha: quando a
    // frase muda de linha, o espaço entre as duas não é tocado). Fora delas a tela
    // é igual à seca. A folga de 1/4 de letra cobre a gota da ponta e o bico do recorte.
    const folga = 2 + fs * 0.25;
    pincel.setTransform(1, 0, 0, 1, 0, 0);
    for (const [y0, y1] of juntar(molhadas.map((p) => [
      Math.max(0, Math.floor(p.topo - folga)), Math.min(tela.height, Math.ceil(p.base + folga)),
    ]))) {
      pincel.clearRect(0, y0, U, y1 - y0);
      pincel.drawImage(seca, 0, y0, U, y1 - y0, 0, y0, U, y1 - y0);
      marcarFaixa(y0, y1);
    }
    let ponta = null;
    for (const p of molhadas) {
      if (p.feito) continue;
      const pt = desenharMolhada(p, fs);
      if (pt) ponta = pt;
    }
    // a ponta: uma gota de tinta fresca que puxa o traço
    if (ponta && !calmo && ponta.viva > 0.02) {
      pincel.setTransform(1, 0, 0, 1, 0, 0);
      pincel.fillStyle = rgb(COR_FRESCA);
      pincel.beginPath();
      pincel.arc(ponta.x, ponta.y, fs * 0.058 * ponta.viva, 0, Math.PI * 2);
      pincel.fill();
    }

    // terminou de escrever (ainda seca por mais um instante)
    const ultimo = tracos[tracos.length - 1];
    if (aoTerminar && (!ultimo || T >= ultimo.fim + 0.09)) {
      const fn = aoTerminar;
      aoTerminar = null;
      fn();
    }
    if (tracos.every((p) => p.feito)) ativo = false;
    return true;
  }

  /** Tudo de uma vez, já seco (reserva se algo falhar no meio). */
  function completar() {
    if (!plano) return;
    pincel.setTransform(1, 0, 0, 1, 0, 0);
    pincel.clearRect(0, 0, tela.width, tela.height);
    for (const p of plano.tracos) {
      if (!p.feito) { gravar(p, p.seco, p.x1 + 1); p.seco = p.x1 + 1; p.feito = true; }
    }
    pincel.drawImage(seca, 0, 0);
    marcarFaixa(0, tela.height);
    ativo = false;
    if (aoTerminar) { const fn = aoTerminar; aoTerminar = null; fn(); }
  }

  return {
    tela,
    largura: U,
    get plano() { return plano; },
    get ativo() { return ativo; },
    /** Devolve as faixas [y0, y1) de linhas que mudaram desde a última chamada (lista, talvez vazia) e zera. */
    tirarFaixas() { const f = juntar(faixas); faixas = []; return f; },

    /** Compõe a frase (a fonte já deve estar carregada; opcoes: ver compor). Devolve o plano: { altura, topoFolha, fs, duracao, texto, cabe }. */
    preparar(texto, opcoes) {
      const g = planejar(texto, opcoes);
      let r = g.next();
      while (!r.done) r = g.next();
      plano = r.value;
      T = 0;
      ativo = false;
      return plano;
    },

    /**
     * O mesmo que preparar(), em fatias de ~6 ms: ler a tinta de cada palavra
     * (getImageData) custava ~150 ms de uma vez num celular, no quadro em que a
     * carta final começa a chegar. Mesmo plano, mesmo resultado.
     */
    async prepararAosPoucos(texto, opcoes) {
      const g = planejar(texto, opcoes);
      let inicio = performance.now();
      let r = g.next();
      while (!r.done) {
        if (performance.now() - inicio > 6) {
          await new Promise((ok) => setTimeout(ok, 0));
          inicio = performance.now();
        }
        r = g.next();
      }
      plano = r.value;
      T = 0;
      ativo = false;
      return plano;
    },

    /** Começa a escrever. Resolve quando a última letra termina (a tinta ainda seca depois). */
    iniciar(opcoes = {}) {
      aoTraco = typeof opcoes.aoTraco === 'function' ? opcoes.aoTraco : null;
      return new Promise((resolver) => {
        if (!plano || !plano.tracos.length) { resolver(); return; }
        T = 0;
        ativo = true;
        aoTerminar = resolver;
      });
    },

    /** Para no meio (a letra foi apagada): a promessa de iniciar() resolve na hora. */
    parar() {
      ativo = false;
      aoTraco = null;
      faixas = [];
      if (aoTerminar) { const fn = aoTerminar; aoTerminar = null; fn(); }
    },

    avancar(dt) {
      try {
        return avancar(dt);
      } catch (erro) {
        console.error('[carta] a escrita falhou; a frase entra inteira', erro);
        try { completar(); } catch { ativo = false; if (aoTerminar) { aoTerminar(); aoTerminar = null; } }
        return true;
      }
    },

    completar,
  };
}

/**
 * A letra dela: uma segunda escrita (o mesmo motor, a mesma resolução, outra tinta) que
 * cada variante mostra do seu jeito: mostrar(plano) põe a tinta no papel, esconder() tira,
 * liberar() → Promise tira a pétala do canto onde ela vai escrever. `tem`: há letra dela
 * na folha (ou ela está para ser escrita). Cada escrever()/apagar() vence o anterior, e
 * só uma composição anda por vez.
 */
function criarLetraDela({ amb, escritaDele, mostrar, esconder, liberar }) {
  const escrita = criarEscrita({
    amb, largura: escritaDele.largura, tinta: DELA.tinta, molhada: DELA.molhada, tempo: DELA.tempo, teto: DELA.teto,
  });
  const espelho = espelhoParaLeitor();     // como o da frase dele: vazio até escrever()
  let vez = 0;
  let tem = false;
  let fila = Promise.resolve();

  function apagar() {
    vez++;
    tem = false;
    escrita.parar();
    esconder();
    espelho.textContent = '';
  }

  async function escrever(texto, opcoes = {}) {
    apagar();
    const minha = vez;
    const limpo = textoDela(texto);
    if (!limpo) return;
    tem = true;
    const preparo = fila.then(async () => {
      if (minha !== vez) return null;
      await fontePronta(limpo);
      return escrita.prepararAosPoucos(limpo, faixaDela(escritaDele.largura, escritaDele.plano));
    });
    fila = preparo.catch(() => null);
    let plano = null;
    // (enquanto compõe, a pétala que estiver no canto dela levanta)
    try { [plano] = await Promise.all([preparo, liberar()]); } catch (erro) { console.error('[carta] não consegui compor a letra dela', erro); }
    if (minha !== vez) return;
    // sem lugar nem no menor corpo (uma frase dele que desce até aqui): a folha fica só com a dele
    if (!plano || !plano.cabe || !plano.tracos.length) { tem = false; return; }
    mostrar(plano);
    anunciar(espelho, plano.texto);
    await escrita.iniciar(opcoes);
  }

  return { escrita, escrever, apagar, get tem() { return tem; }, dispose() { espelho.remove(); } };
}

// =============================================================================
// PÉTALA QUE POUSA: tempos comuns às duas variantes
// =============================================================================

// Cantos onde a pétala pode pousar (o de baixo à direita é do fio). x em larguras
// de folha a partir do centro, s em alturas a partir do topo; `sai` é para onde
// ela escorrega. `dela`: o canto por onde passa a letra dela; com ela na folha a
// pétala não pousa ali (e, se já estiver, levanta antes da primeira letra).
const POUSOS = [
  { x: -0.33, s: 0.085, giro: -0.5, sai: { x: -0.24, s: 0.07 } },
  { x: 0.31, s: 0.105, giro: 0.7, sai: { x: 0.26, s: 0.08 } },
  { x: -0.34, s: 0.9, giro: -1.1, sai: { x: -0.05, s: 0.14 }, dela: true },
];

/**
 * O ritmo das pétalas, igual nas duas folhas: as duas primeiras têm tempo marcado (um
 * minuto depois do fim, há uma pétala pousada); depois, de vez em quando.
 * ciclo(pouso, descanso) → Promise; acabou() → a folha foi descartada; temDela() → há letra dela.
 */
async function vidaDasPetalas({ acabou, temDela, ciclo }) {
  await espera(4500);
  let vez = 0;
  while (!acabou()) {
    const pouso = POUSOS[vez % POUSOS.length];
    // com a letra dela na folha, o canto dela fica livre: a vez passa para o próximo
    if (pouso.dela && temDela()) { vez++; continue; }
    await ciclo(pouso, vez < 2 ? 19 : 14 + Math.random() * 16);
    if (acabou()) return;
    await espera(vez < 1 ? 15000 : 16000 + Math.random() * 22000);
    vez++;
  }
}

// O fio que repousa, em milésimos da largura da folha (x 0..1000 da esquerda,
// y 0..2000 do topo; y > 2000 é abaixo dela). Sobe na diagonal pela borda de
// baixo e se deita no canto num S largo, como um fio solto que caiu ali: sem
// laço (laço cruzado vira símbolo; gancho vira ponto de interrogação) e sem
// ponta reta. Usado pelas duas variantes.
const FIO_REPOUSO = [
  [530, 3420], [640, 3020], [585, 2620], [664, 2260], [708, 2060],
  [736, 1990], [782, 1934], [852, 1902], [902, 1858], [916, 1794],
  [902, 1734], [908, 1676], [938, 1640],
];

// =============================================================================
// 3D
// =============================================================================

const VERTICE_PAPEL = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vLocal;
  void main() {
    vUv = uv;
    vLocal = position;
    vNormal = normalMatrix * normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }
`;

// As cores aqui já são as da tela (sRGB): papel e tinta são compostos como se vê.
const FRAGMENTO_PAPEL = /* glsl */ `
  uniform sampler2D uTinta;
  uniform vec4 uFaixa;      // onde a tinta fica na folha, em uv: x, y (canto de baixo), largura, altura
  uniform float uTemTinta;
  uniform sampler2D uTinta2;  // a letra dela, no terço de baixo (o mesmo motor, outra tinta)
  uniform vec4 uFaixa2;
  uniform float uTemTinta2;
  uniform vec2 uFechado;    // quanto cada aba está dobrada (0 aberta, 1 fechada): x a de cima, y a de baixo
  uniform vec2 uTamanho;    // largura e altura da folha, em metros
  uniform float uFino;      // 1: fibra do papel; 0: nível baixo

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vLocal;

  float acaso(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float ruido(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(acaso(i), acaso(i + vec2(1., 0.)), f.x), mix(acaso(i + vec2(0., 1.)), acaso(i + vec2(1., 1.)), f.x), f.y);
  }

  void main() {
    bool frente = gl_FrontFacing;
    vec3 n = normalize(vNormal);
    if (!frente) n = -n;

    vec3 cor = vec3(0.984, 0.969, 0.941);              // --papel

    // fibra: fios finos cruzados, um grão e manchas largas, tudo quase invisível
    vec2 p = vUv * vec2(1., uTamanho.y / uTamanho.x);
    float fibra = 0.5;
    if (uFino > 0.5) {
      fibra = 0.5 * ruido(p * vec2(20., 160.)) + 0.5 * ruido(p * vec2(160., 20.) + 11.3);
      float grao = ruido(p * 230. + 3.7);
      float mancha = ruido(p * 4.2 + 1.9);
      cor *= 1. + (fibra - 0.5) * 0.013 + (grao - 0.5) * 0.009 + (mancha - 0.5) * 0.014;
    }

    // luz macia, do alto e da esquerda: cada terço responde à sua inclinação
    vec3 L = normalize(vec3(-0.34, 0.62, 0.71));
    float luz = clamp(0.995 + (dot(n, L) - 0.71) * 0.18, 0.92, 1.0);
    // papel é translúcido: o verso de uma aba que gira nunca fica cinza
    if (!frente) luz = max(luz, 0.945);
    luz *= 1. + 0.012 * (vUv.y - 0.5) - 0.008 * (vUv.x - 0.5);

    // sombra que uma aba faz no que está por baixo dela
    float vinco = uTamanho.y / 6.;
    bool meio = vUv.y > 1. / 3. && vUv.y < 2. / 3.;
    float sombra = 0.;
    if (frente && meio) {
      sombra += uFechado.x * exp(-max(0., vinco - vLocal.y) / (0.02 + 0.24 * uFechado.x));
      sombra += uFechado.y * exp(-max(0., vLocal.y + vinco) / (0.02 + 0.24 * uFechado.y));
    } else if (!frente && vUv.y >= 2. / 3.) {
      sombra += uFechado.y * exp(-max(0., vLocal.y + vinco) / (0.02 + 0.24 * uFechado.y));
    }
    luz *= 1. - 0.17 * clamp(sombra, 0., 1.);

    if (frente) {
      // os dois vincos: um risco fino, a penumbra em volta e um fio de luz logo abaixo
      float d1 = (vUv.y - 2. / 3.) * uTamanho.y;
      float d2 = (vUv.y - 1. / 3.) * uTamanho.y;
      float px = max(fwidth(vUv.y) * uTamanho.y, 0.0005);
      float risco = (1. - smoothstep(px * 0.4, px * 1.4, abs(d1))) + (1. - smoothstep(px * 0.4, px * 1.4, abs(d2)));
      float penumbra = exp(-abs(d1) / 0.011) + exp(-abs(d2) / 0.011);
      float realce = (1. - smoothstep(px * 0.4, px * 1.4, abs(d1 + px * 2.))) + (1. - smoothstep(px * 0.4, px * 1.4, abs(d2 + px * 2.)));
      luz *= 1. - 0.05 * risco - 0.016 * penumbra;
      luz += 0.014 * realce;
    } else {
      luz *= 0.99;
    }

    // a borda do papel, um nada mais escura: recorta a folha do branco
    vec2 bd = min(vUv, 1. - vUv) * uTamanho;
    luz *= 1. - 0.035 * (1. - smoothstep(0., 0.0035, min(bd.x, bd.y)));

    cor *= luz;

    if (frente && uTemTinta > 0.5) {
      vec2 q = (vUv - uFaixa.xy) / uFaixa.zw;
      if (q.x > 0. && q.x < 1. && q.y > 0. && q.y < 1.) {
        vec4 t = texture2D(uTinta, q);                 // alfa já multiplicado
        float pega = 0.94 + 0.12 * (fibra - 0.5);      // a tinta assenta na fibra
        cor = cor * (1. - t.a * pega) + t.rgb * pega * luz;
      }
    }
    if (frente && uTemTinta2 > 0.5) {
      vec2 q = (vUv - uFaixa2.xy) / uFaixa2.zw;
      if (q.x > 0. && q.x < 1. && q.y > 0. && q.y < 1.) {
        vec4 t = texture2D(uTinta2, q);
        float pega = 0.94 + 0.12 * (fibra - 0.5);
        cor = cor * (1. - t.a * pega) + t.rgb * pega * luz;
      }
    }

    gl_FragColor = vec4(cor, 1.);
  }
`;

const VERTICE_PLANO = /* glsl */ `
  varying vec2 vP;
  varying vec2 vUv;
  void main() {
    vP = position.xy;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }
`;

// Sombra atrás da folha: um retângulo de borda muito macia, deslocado para baixo.
const FRAGMENTO_SOMBRA = /* glsl */ `
  uniform vec2 uMeio;
  uniform vec2 uCentro;
  uniform float uMacio;
  uniform float uForca;
  varying vec2 vP;
  void main() {
    vec2 d = abs(vP - uCentro) - uMeio;
    float dist = length(max(d, 0.)) + min(max(d.x, d.y), 0.);
    float a = 1. - smoothstep(-uMacio * 0.35, uMacio, dist);
    a *= a;
    gl_FragColor = vec4(0.165, 0.106, 0.133, a * uForca);
  }
`;

// Mancha redonda e macia (sombra de contato da pétala).
const FRAGMENTO_MANCHA = /* glsl */ `
  uniform float uForca;
  varying vec2 vUv;
  void main() {
    vec2 q = vUv * 2. - 1.;
    float a = 1. - smoothstep(0.1, 1., length(q * vec2(1., 1.25)));
    gl_FragColor = vec4(0.165, 0.106, 0.133, a * a * uForca);
  }
`;

// Sombra do fio sobre o papel: uma fita mais larga, macia nas bordas.
const VERTICE_SOMBRA_FIO = /* glsl */ `
  attribute float aLado;
  attribute float aU;
  varying float vLado;
  varying float vU;
  void main() {
    vLado = aLado;
    vU = aU;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }
`;
const FRAGMENTO_SOMBRA_FIO = /* glsl */ `
  uniform float uProgresso;
  uniform float uForca;
  varying float vLado;
  varying float vU;
  void main() {
    if (vU > uProgresso) discard;
    float a = 1. - vLado * vLado;
    a *= smoothstep(0., 0.04, vU) * smoothstep(0., 0.02, uProgresso - vU + 0.02);
    gl_FragColor = vec4(0.165, 0.106, 0.133, a * a * uForca);
  }
`;

// A pétala que pousa: a mesma forma e as mesmas cores das pétalas do mundo.
const VERTICE_PETALA = /* glsl */ `
  varying vec2 vUv;
  varying float vLuz;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += (p.x * p.x - 0.08) * 0.9;                   // levemente em concha
    vLuz = abs(normalize(normalMatrix * vec3(0., 0., 1.)).z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
  }
`;
const FRAGMENTO_PETALA = /* glsl */ `
  uniform vec3 uCor1;
  uniform vec3 uCor2;
  uniform float uTom;
  uniform float uOpacidade;
  varying vec2 vUv;
  varying float vLuz;
  void main() {
    vec2 q = vUv * 2. - 1.;
    float d = length(vec2(q.x * (1.25 + 0.55 * q.y), q.y * 0.96));
    float alfa = (1. - smoothstep(0.84, 0.92, d)) * uOpacidade;
    if (alfa < 0.01) discard;
    vec3 cor = mix(uCor1, uCor2, uTom) * (0.8 + 0.28 * vLuz);
    cor += (1. - d) * 0.07;
    cor *= 1. - 0.18 * smoothstep(0.0, 0.06, abs(q.x)) * (1. - smoothstep(0.06, 0.5, abs(q.x))) * 0.0 - 0.10 * (1. - smoothstep(0., 0.035, abs(q.x)));
    gl_FragColor = vec4(cor, alfa);
    #include <colorspace_fragment>
  }
`;

/** Distâncias (a partir do topo) das fileiras da malha: mais juntas em volta dos vincos. */
function fileiras() {
  const s = [];
  const trecho = (a, b, n) => { for (let i = 0; i < n; i++) s.push(a + ((b - a) * i) / n); };
  trecho(0, VINCO_CIMA - RAIO_CIMA, 7);
  trecho(VINCO_CIMA - RAIO_CIMA, VINCO_CIMA + RAIO_CIMA, 8);
  trecho(VINCO_CIMA + RAIO_CIMA, VINCO_BAIXO - RAIO_BAIXO, 6);
  trecho(VINCO_BAIXO - RAIO_BAIXO, VINCO_BAIXO + RAIO_BAIXO, 10);
  trecho(VINCO_BAIXO + RAIO_BAIXO, ALTURA, 7);
  s.push(ALTURA);
  return s;
}

function criarFolha3D(mundo) {
  const { THREE } = mundo;
  const gsap = window.gsap;
  const amb = mundo.amb;
  const baixo = amb.nivel === 'baixo';

  const grupo = new THREE.Group();
  grupo.name = 'folha';
  grupo.visible = false;
  const interno = new THREE.Group();          // flutua e segue o ponteiro aqui dentro
  grupo.add(interno);

  // ---- a malha: uma folha só, que se dobra pelo perfil ----------------------------

  const S = fileiras();
  const NL = S.length;
  const NC = COLUNAS + 1;
  const posicoes = new Float32Array(NL * NC * 3);
  const normais = new Float32Array(NL * NC * 3);
  const uvs = new Float32Array(NL * NC * 2);
  const indices = [];
  for (let i = 0; i < NL; i++) {
    for (let j = 0; j < NC; j++) {
      const k = i * NC + j;
      posicoes[k * 3] = (j / COLUNAS - 0.5) * LARGURA;
      uvs[k * 2] = j / COLUNAS;
      uvs[k * 2 + 1] = 1 - S[i] / ALTURA;
      if (i < NL - 1 && j < COLUNAS) indices.push(k, k + NC, k + 1, k + NC, k + NC + 1, k + 1);
    }
  }
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.BufferAttribute(posicoes, 3).setUsage(THREE.DynamicDrawUsage));
  geometria.setAttribute('normal', new THREE.BufferAttribute(normais, 3).setUsage(THREE.DynamicDrawUsage));
  geometria.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometria.setIndex(indices);

  const texturaVazia = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  texturaVazia.needsUpdate = true;

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTICE_PAPEL,
    fragmentShader: FRAGMENTO_PAPEL,
    uniforms: {
      uTinta: { value: texturaVazia },
      uFaixa: { value: new THREE.Vector4(0, 0.4, 1, 0.2) },
      uTemTinta: { value: 0 },
      uTinta2: { value: texturaVazia },
      uFaixa2: { value: new THREE.Vector4(0, 0.1, 1, 0.2) },
      uTemTinta2: { value: 0 },
      uFechado: { value: new THREE.Vector2(1, 1) },
      uTamanho: { value: new THREE.Vector2(LARGURA, ALTURA) },
      uFino: { value: baixo ? 0 : 1 },
    },
    side: THREE.DoubleSide,
  });
  const malha = new THREE.Mesh(geometria, material);
  malha.frustumCulled = false;
  // O papel é opaco e cobre ~70% da tela: desenhado antes de tudo, a profundidade dele
  // descarta a alameda que está atrás (sombra, manchas, pétala e fio são transparentes
  // e continuam por cima). Se um dia ele ficar translúcido, isto volta para depois.
  malha.renderOrder = -20;
  interno.add(malha);

  // ---- sombra macia atrás -------------------------------------------------------------

  const matSombra = new THREE.ShaderMaterial({
    vertexShader: VERTICE_PLANO,
    fragmentShader: FRAGMENTO_SOMBRA,
    uniforms: {
      uMeio: { value: new THREE.Vector2(LARGURA / 2, ALTURA / 6) },
      uCentro: { value: new THREE.Vector2(0.008, -0.02) },
      uMacio: { value: 0.07 },
      uForca: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
  });
  const sombra = new THREE.Mesh(new THREE.PlaneGeometry(LARGURA + 0.5, ALTURA + 0.5), matSombra);
  sombra.position.z = -0.03;
  sombra.renderOrder = 1;
  sombra.frustumCulled = false;
  interno.add(sombra);

  // ---- dobras ------------------------------------------------------------------------

  const dobra = { cima: FECHADA_CIMA, baixo: FECHADA_BAIXO };
  const cede = { cima: 0, baixo: 0 };          // o papel cede: a ponta livre da aba se atrasa
  const anterior = { cima: dobra.cima, baixo: dobra.baixo };
  const yF = new Float32Array(NL);
  const zF = new Float32Array(NL);
  const nyF = new Float32Array(NL);
  const nzF = new Float32Array(NL);
  let meio = 0;
  for (let i = 0; i < NL; i++) if (Math.abs(S[i] - ALTURA / 2) < Math.abs(S[meio] - ALTURA / 2)) meio = i;
  let sujo = true;

  const anguloBaixo = (s) => dobra.baixo * suave((s - (VINCO_BAIXO - RAIO_BAIXO)) / (2 * RAIO_BAIXO))
    + cede.baixo * Math.pow(clamp((s - VINCO_BAIXO) / (ALTURA - VINCO_BAIXO)), 1.4);
  const anguloCima = (s) => dobra.cima * suave(((VINCO_CIMA + RAIO_CIMA) - s) / (2 * RAIO_CIMA))
    + cede.cima * Math.pow(clamp((VINCO_CIMA - s) / VINCO_CIMA), 1.4);

  function refazerMalha() {
    sujo = false;
    yF[meio] = ALTURA / 2 - S[meio];
    zF[meio] = 0;
    nyF[meio] = 0;
    nzF[meio] = 1;
    // para baixo
    let y = yF[meio];
    let z = 0;
    for (let i = meio + 1; i < NL; i++) {
      const ds = S[i] - S[i - 1];
      const a = anguloBaixo((S[i] + S[i - 1]) / 2);
      y -= Math.cos(a) * ds;
      z += Math.sin(a) * ds;
      yF[i] = y;
      zF[i] = z;
      const an = anguloBaixo(S[i]);
      nyF[i] = Math.sin(an);
      nzF[i] = Math.cos(an);
    }
    // para cima
    y = yF[meio];
    z = 0;
    for (let i = meio - 1; i >= 0; i--) {
      const ds = S[i + 1] - S[i];
      const a = anguloCima((S[i] + S[i + 1]) / 2);
      y += Math.cos(a) * ds;
      z += Math.sin(a) * ds;
      yF[i] = y;
      zF[i] = z;
      const an = anguloCima(S[i]);
      nyF[i] = -Math.sin(an);
      nzF[i] = Math.cos(an);
    }
    for (let i = 0; i < NL; i++) {
      for (let j = 0; j < NC; j++) {
        const k = (i * NC + j) * 3;
        posicoes[k + 1] = yF[i];
        posicoes[k + 2] = zF[i];
        normais[k + 1] = nyF[i];
        normais[k + 2] = nzF[i];
      }
    }
    geometria.attributes.position.needsUpdate = true;
    geometria.attributes.normal.needsUpdate = true;
    material.uniforms.uFechado.value.set(clamp(dobra.cima / Math.PI), clamp(dobra.baixo / Math.PI));

    // a sombra acompanha o tamanho do que está aberto
    const topo = ALTURA / 6 + (ALTURA / 3) * Math.max(0, Math.cos(dobra.cima));
    const fundo = -ALTURA / 6 - (ALTURA / 3) * Math.max(0, Math.cos(dobra.baixo));
    matSombra.uniforms.uMeio.value.set(LARGURA / 2, (topo - fundo) / 2);
    matSombra.uniforms.uCentro.value.set(0.008, (topo + fundo) / 2 - 0.022);
  }
  refazerMalha();

  /** Ponto da superfície da folha (espaço de `interno`): x em metros a partir do centro, s a partir do topo. */
  function superficie(x, s, acima = 0) {
    const alvo = clamp(s, 0, ALTURA);
    let i = 0;
    while (i < NL - 2 && S[i + 1] < alvo) i++;
    const k = clamp((alvo - S[i]) / Math.max(1e-6, S[i + 1] - S[i]));
    const ny = lerp(nyF[i], nyF[i + 1], k);
    const nz = lerp(nzF[i], nzF[i + 1], k);
    return new THREE.Vector3(x, lerp(yF[i], yF[i + 1], k) + ny * acima, lerp(zF[i], zF[i + 1], k) + nz * acima);
  }

  // ---- escrita ---------------------------------------------------------------------------

  // A folha ocupa ~375 pt no iPhone: em tela 3x são ~1125 px, então 1024 já ficava
  // abaixo de 1:1. Em tela densa (e nível alto) a escrita vai a 1536 px.
  const densa = !baixo && amb.nivel === 'alto' && (window.devicePixelRatio || 1) > 2;
  const escrita = criarEscrita({ amb, largura: baixo ? 768 : densa ? 1536 : 1024 });
  let espelho = espelhoParaLeitor();       // vazio até escrever(): ver anunciar()
  // A letra dela: o segundo par de uniformes do papel (uTinta2, uFaixa2, uTemTinta2).
  const letraDela = criarLetraDela({
    amb,
    escritaDele: escrita,
    mostrar: (plano) => ligarTextura(dela, plano),
    esconder: () => { dela.tem.value = 0; },
    liberar: () => levantarPetala(),
  });
  // Cada letra é um bloco: a escrita, a textura dela e os uniformes do papel que a mostram.
  const u = material.uniforms;
  const dele = { escrita, textura: null, tinta: u.uTinta, faixa: u.uFaixa, tem: u.uTemTinta };
  const dela = { escrita: letraDela.escrita, textura: null, tinta: u.uTinta2, faixa: u.uFaixa2, tem: u.uTemTinta2 };
  let textoPronto = null;
  let preparando = null;
  let quadro = 0;

  function ligarTextura(bloco, plano) {
    const { escrita } = bloco;
    if (bloco.textura) bloco.textura.dispose();
    const textura = new THREE.CanvasTexture(escrita.tela);
    bloco.textura = textura;
    textura.colorSpace = THREE.NoColorSpace;
    textura.premultiplyAlpha = true;
    textura.wrapS = textura.wrapT = THREE.ClampToEdgeWrapping;
    if (baixo) {
      textura.generateMipmaps = false;
      textura.minFilter = THREE.LinearFilter;
    } else {
      textura.anisotropy = Math.min(4, mundo.renderer.capabilities.getMaxAnisotropy());
    }
    const total = 2 * escrita.largura;
    const altura = plano.altura / total;
    bloco.faixa.value.set(0, 1 - plano.topoFolha / total - altura, 1, altura);
    bloco.tinta.value = textura;
    bloco.tem.value = 1;
    escrita.tirarFaixas();                 // a textura nova sobe inteira
  }

  // Enquanto escreve, só mudam as linhas da palavra molhada (umas 150 de ~1100).
  // Subir o canvas inteiro a cada quadro custava ~1,7 Mpx de cópia por quadro
  // (mais os mipmaps); aqui sobem só essas faixas, com os mesmos pixelStorei que
  // o three usa, e os mipmaps são refeitos. Na placa o resultado é idêntico ao da
  // subida inteira. Qualquer dúvida cai na subida inteira.
  const telasFaixa = new Map();          // altura → { tela, pincel } (altura em degraus de 32)
  function subirTinta({ escrita, textura }) {
    const lista = escrita.tirarFaixas();
    if (!lista.length) return;
    const tela = escrita.tela;
    const W = tela.width;
    const H = tela.height;
    const r = mundo.renderer;
    const gl = r.getContext();
    const props = r.properties.get(textura);
    const total = lista.reduce((s, f) => s + f[1] - f[0], 0);
    if (total > H * 0.5 || lista.length > 4 || W > r.capabilities.maxTextureSize || H > r.capabilities.maxTextureSize
      || !props.__webglTexture || props.__version !== textura.version
      || typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) {
      textura.needsUpdate = true;
      return;
    }
    try {
      const st = r.state;
      st.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
      st.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, textura.flipY);
      st.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, textura.premultiplyAlpha);
      st.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      st.pixelStorei(gl.UNPACK_ALIGNMENT, textura.unpackAlignment);
      for (const f of lista) {
        // texSubImage2D com um canvas sobe o canvas inteiro: o auxiliar tem a altura exata da faixa
        const h = Math.min(H, Math.ceil((f[1] - f[0]) / 32) * 32);
        const y0 = Math.max(0, Math.min(f[0], H - h));
        let aux = telasFaixa.get(h);
        if (!aux || aux.tela.width !== W) {
          const t = document.createElement('canvas');
          t.width = W;
          t.height = h;
          aux = { tela: t, pincel: t.getContext('2d') };
          aux.pincel.globalCompositeOperation = 'copy';
          aux.pincel.imageSmoothingEnabled = false;
          telasFaixa.set(h, aux);
        }
        aux.pincel.drawImage(tela, 0, y0, W, h, 0, 0, W, h);
        // com FLIP_Y a linha 0 do canvas é a de cima da textura
        const yTex = textura.flipY ? H - (y0 + h) : y0;
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, yTex, W, h, gl.RGBA, gl.UNSIGNED_BYTE, aux.tela);
      }
      if (textura.generateMipmaps && textura.minFilter !== THREE.LinearFilter && textura.minFilter !== THREE.NearestFilter) {
        gl.generateMipmap(gl.TEXTURE_2D);
      }
    } catch (erro) {
      textura.needsUpdate = true;
    }
  }


  async function preparar(texto) {
    const frase = String(texto ?? '');
    if (textoPronto === frase) return;
    if (preparando && preparando.frase === frase) { await preparando.promessa; return; }
    const promessa = (async () => {
      await fontePronta(frase);
      const plano = await escrita.prepararAosPoucos(frase);
      ligarTextura(dele, plano);
      textoPronto = frase;
    })();
    preparando = { frase, promessa };
    try { await promessa; } finally { if (preparando && preparando.frase === frase) preparando = null; }
  }

  // ---- pose: de onde o papel saiu até a leitura ---------------------------------------------

  const origem = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), escala: 0.72 };
  const leitura = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), distancia: 1 };
  const viagem = { p: 0, ativa: false };
  let noLugar = false;
  let assumiu = false;
  let margemFim = 0;                     // px livres em cima e embaixo depois de recuar()

  function medirLeitura() {
    const cam = mundo.camera;
    const { largura, altura } = mundo.tamanho;
    const tangente = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // ~80% da altura da tela (no fim, menos se a margem não couber: só em tela baixa)
    const fracao = altura < 520 ? 0.9 : Math.min(0.8, 1 - (2 * margemFim) / altura);
    const porAltura = ALTURA / (2 * tangente * fracao);
    const porLargura = LARGURA / (2 * tangente * (largura / altura) * 0.86);
    leitura.distancia = Math.max(porAltura, porLargura);
    leitura.pos.set(mundo.rig.position.x, ALTURA_OLHOS, mundo.rig.position.z - leitura.distancia);
    mundo.petalas.definirFoco?.(leitura.distancia);
    mundo.alameda?.afastar?.(leitura.distancia + 0.25);   // nenhum cacho da copa na frente do papel
  }

  function aplicarViagem() {
    const e = viagem.p;
    grupo.position.lerpVectors(origem.pos, leitura.pos, e);
    grupo.position.y += Math.sin(e * Math.PI) * 0.035 * (amb.reduzido ? 0 : 1);
    grupo.quaternion.slerpQuaternions(origem.quat, leitura.quat, e);
    grupo.scale.setScalar(lerp(origem.escala, 1, e));
  }

  const pararTamanho = mundo.aoRedimensionar(() => {
    medirLeitura();
    if (noLugar || viagem.ativa) aplicarViagem();
  });

  function mostrar() {
    if (!grupo.parent) mundo.cena.add(grupo);
    grupo.visible = true;
  }

  // ---- o fio que repousa ---------------------------------------------------------------------

  let fio = null;
  let sombraFio = null;

  // ---- a pétala que pousa --------------------------------------------------------------------

  let petala = null;
  let vivendo = false;
  let descartada = false;
  let pousando = null;                   // o pouso da pétala que vem, está pousada ou sai (null: nenhuma no papel)
  let voo = null;                        // a animação dela agora

  function criarPetala() {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERTICE_PETALA,
      fragmentShader: FRAGMENTO_PETALA,
      uniforms: {
        uCor1: { value: new THREE.Color('#b3123a') },
        uCor2: { value: new THREE.Color('#d7264f') },
        uTom: { value: 0.35 },
        uOpacidade: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const obj = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 4, 4), mat);
    obj.scale.setScalar(0.062);
    obj.renderOrder = 4;
    obj.visible = false;
    const matMancha = new THREE.ShaderMaterial({
      vertexShader: VERTICE_PLANO,
      fragmentShader: FRAGMENTO_MANCHA,
      uniforms: { uForca: { value: 0 } },
      transparent: true,
      depthWrite: false,
    });
    const mancha = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.085), matMancha);
    mancha.renderOrder = 3;
    mancha.visible = false;
    interno.add(mancha, obj);
    return { obj, mat, mancha, matMancha, estado: { k: 0 } };
  }

  /** Uma pétala vem caindo, pousa no canto, fica e depois escorrega para fora. */
  async function cicloPetala(pouso, descanso) {
    if (!petala) petala = criarPetala();
    const { obj, mat, mancha, matMancha } = petala;
    pousando = pouso;
    const levantou = () => descartada || pousando !== pouso;      // ver levantarPetala()
    const alvo = superficie(pouso.x * LARGURA, pouso.s * ALTURA, 0.0085);
    const noPapel = superficie(pouso.x * LARGURA, pouso.s * ALTURA, 0.0015);
    mat.uniforms.uTom.value = Math.random();
    obj.visible = true;
    mancha.visible = true;
    mancha.position.copy(noPapel).add(new THREE.Vector3(0.005, -0.007, 0));

    const deitada = new THREE.Euler(-0.1, 0.12, pouso.giro);          // deitada no papel, uma ponta erguida de leve
    if (amb.reduzido) {
      obj.position.copy(alvo);
      obj.rotation.copy(deitada);
      await comoPromise(voo = gsap.timeline()
        .to(mat.uniforms.uOpacidade, { value: 1, duration: 1.4, ease: 'none' }, 0)
        .to(matMancha.uniforms.uForca, { value: 0.2, duration: 1.4, ease: 'none' }, 0));
    } else {
      // queda: vem de cima e de fora, balançando, e assenta sem quicar
      const lado = pouso.x < 0 ? -1 : 1;
      const de = new THREE.Vector3(alvo.x + lado * 0.2, alvo.y + 0.62, alvo.z + 0.3);
      const q = { p: 0 };
      mat.uniforms.uOpacidade.value = 0;
      await comoPromise(voo = gsap.to(q, {
        p: 1,
        duration: 4.2,
        ease: 'sine.out',
        onUpdate() {
          const e = q.p;
          const resto = 1 - e;
          obj.position.lerpVectors(de, alvo, e);
          obj.position.x += Math.sin(e * 9.5) * 0.07 * resto;
          obj.position.z += Math.sin(e * 6.0 + 1.0) * 0.03 * resto;
          obj.rotation.set(
            deitada.x + resto * resto * 5.2 + Math.sin(e * 11) * 0.5 * resto,
            deitada.y + resto * 3.1,
            deitada.z + resto * 2.4 * lado,
          );
          mat.uniforms.uOpacidade.value = clamp(e * 5);
          matMancha.uniforms.uForca.value = 0.2 * Math.pow(clamp((e - 0.72) / 0.28), 2);
        },
      }));
    }

    if (levantou()) return;
    await espera(descanso * 1000);
    if (levantou()) return;

    // escorrega pelo papel e cai fora dele
    const saida = pouso.sai;
    const borda = superficie((pouso.x + saida.x) * LARGURA, (pouso.s + saida.s) * ALTURA, 0.0085);
    if (amb.reduzido) {
      await comoPromise(voo = gsap.timeline()
        .to(mat.uniforms.uOpacidade, { value: 0, duration: 1.4, ease: 'none' }, 0)
        .to(matMancha.uniforms.uForca, { value: 0, duration: 1.4, ease: 'none' }, 0));
    } else {
      const tl = gsap.timeline();
      tl.to(obj.position, { x: borda.x, y: borda.y, z: borda.z, duration: 2.6, ease: 'power2.in' }, 0)
        .to(obj.rotation, { z: deitada.z + (saida.x < 0 ? 0.5 : -0.5), duration: 2.6, ease: 'power1.in' }, 0)
        .to(mancha.position, { x: borda.x + 0.005, y: borda.y - 0.007, duration: 2.6, ease: 'power2.in' }, 0)
        .to(matMancha.uniforms.uForca, { value: 0, duration: 0.5, ease: 'none' }, 2.3)
        // já fora do papel: cai, gira e some
        .to(obj.position, { x: borda.x + saida.x * LARGURA * 0.9, y: borda.y - 0.5, z: borda.z + 0.12, duration: 2.4, ease: 'power1.in' }, 2.6)
        .to(obj.rotation, { x: deitada.x + 3.4, y: deitada.y + 1.6, duration: 2.4, ease: 'none' }, 2.6)
        .to(mat.uniforms.uOpacidade, { value: 0, duration: 0.9, ease: 'none' }, 4.1);
      await comoPromise(voo = tl);
    }
    if (levantou()) return;
    pousando = null;
    obj.visible = false;
    mancha.visible = false;
  }

  /**
   * A letra dela vai entrar no canto de baixo à esquerda: a pétala que vem, está pousada
   * ou sai dali levanta e some, num movimento curto (só opacidade no movimento reduzido).
   */
  function levantarPetala() {
    if (!petala || !pousando || !pousando.dela) return Promise.resolve();
    pousando = null;
    if (voo) voo.kill();
    const { obj, mat, mancha, matMancha } = petala;
    const d = amb.reduzido ? 0.4 : 0.7;
    const tl = gsap.timeline({ onComplete: () => { obj.visible = false; mancha.visible = false; } })
      .to(mat.uniforms.uOpacidade, { value: 0, duration: d, ease: 'power1.in' }, 0)
      .to(matMancha.uniforms.uForca, { value: 0, duration: d * 0.35, ease: 'none' }, 0);
    if (!amb.reduzido) {
      // como soprada: sobe do papel, para fora e para a frente, virando
      tl.to(obj.position, { x: '-=0.05', y: '+=0.03', z: '+=0.06', duration: d, ease: 'power2.out' }, 0)
        .to(obj.rotation, { x: '+=1.1', z: '-=0.6', duration: d, ease: 'power1.out' }, 0);
    }
    return comoPromise(voo = tl);
  }

  // ---- API -------------------------------------------------------------------------------------

  const flutua = { x: 0, y: 0, forca: 0 };
  const recuo = { z: 0 };                     // enquanto as abas giram, ela segura a folha um pouco mais longe

  return {
    grupo,

    preparar,

    /** Aparece dobrada no lugar do papel que saiu da carta (mesma pose, mesma largura). */
    assumir(papel) {
      medirLeitura();
      let larguraPapel = LARGURA * 0.72;
      const escalaPapel = new THREE.Vector3(1, 1, 1);
      if (papel && papel.isObject3D) {
        papel.updateWorldMatrix(true, false);
        papel.matrixWorld.decompose(origem.pos, origem.quat, escalaPapel);
        const g = papel.geometry;
        if (g) {
          if (!g.boundingBox) g.computeBoundingBox();
          larguraPapel = Math.max(0.05, (g.boundingBox.max.x - g.boundingBox.min.x) * escalaPapel.x);
        }
        papel.visible = false;
      } else {
        origem.pos.set(leitura.pos.x, leitura.pos.y - 0.05, leitura.pos.z - 0.25);
        origem.quat.identity();
      }
      origem.escala = larguraPapel / LARGURA;
      viagem.p = 0;
      aplicarViagem();
      mostrar();
      matSombra.uniforms.uForca.value = 0;
      assumiu = true;
    },

    async desdobrar() {
      if (!assumiu) {
        // sem carta: nasce já dobrada, um pouco atrás do lugar de leitura
        medirLeitura();
        origem.pos.set(leitura.pos.x, leitura.pos.y - 0.04, leitura.pos.z - 0.3);
        origem.quat.identity();
        origem.escala = 0.72;
        viagem.p = 0;
        aplicarViagem();
        mostrar();
        assumiu = true;
      }
      const calmo = amb.reduzido;
      flutua.forca = 0;

      // 1. vem até a frente dela
      const ida = calmo ? 1.0 : 2.3;
      viagem.ativa = true;
      const tl = gsap.timeline();
      // começa parada, como o papel que acabou de sair da carta (nada de arranque seco)
      tl.to(viagem, { p: 1, duration: ida, ease: calmo ? curvas.branco.entrar : curvas.branco.camera, onUpdate: aplicarViagem }, 0)
        .to(matSombra.uniforms.uForca, { value: 0.2, duration: ida, ease: 'none' }, 0)
        .to(flutua, { forca: 1, duration: 2.5, ease: 'none' }, ida * 0.5);
      if (!calmo) {
        tl.to(recuo, { z: 0.26, duration: 1.1, ease: curvas.branco.deriva }, 0.75)
          .to(recuo, { z: 0, duration: 2.2, ease: curvas.branco.deriva }, 2.0);
      }

      // 2. desdobra: o terço de baixo desce, o de cima sobe; assenta sem quicar
      const t0 = calmo ? 0.35 : 1.25;
      if (calmo) {
        tl.to(dobra, { baixo: ABERTA_BAIXO, cima: ABERTA_CIMA, duration: 0.8, ease: 'power3.out', onUpdate: () => { sujo = true; } }, t0);
      } else {
        tl.to(dobra, { baixo: ABERTA_BAIXO * 0.55, duration: 1.7, ease: 'power3.out', onUpdate: () => { sujo = true; } }, t0)
          .to(dobra, { baixo: ABERTA_BAIXO, duration: 1.3, ease: curvas.branco.deriva, onUpdate: () => { sujo = true; } }, t0 + 1.7)
          .to(dobra, { cima: ABERTA_CIMA * 0.5, duration: 1.8, ease: 'power3.out', onUpdate: () => { sujo = true; } }, t0 + 0.55)
          .to(dobra, { cima: ABERTA_CIMA, duration: 1.3, ease: curvas.branco.deriva, onUpdate: () => { sujo = true; } }, t0 + 2.35);
      }
      tl.addLabel('aberta', calmo ? t0 + 0.8 : t0 + 2.5);
      await new Promise((resolver) => {
        tl.add(resolver, 'aberta');
        tl.eventCallback('onInterrupt', resolver);
      });
      viagem.ativa = false;
      noLugar = true;
    },

    async escrever(texto, opcoes = {}) {
      const frase = String(texto ?? '');
      if (!espelho) espelho = espelhoParaLeitor();
      anunciar(espelho, frase);
      try {
        await preparar(frase);
      } catch (erro) {
        console.error('[carta] não consegui compor a frase', erro);
        return;
      }
      await escrita.iniciar(opcoes);
    },

    escreverDela: letraDela.escrever,
    apagarDela: letraDela.apagar,

    /** O fio, solto, vem de baixo e repousa sobre o canto de baixo à direita, com a ponta num laço frouxo. */
    async repousarFio() {
      if (fio) return;
      const L = LARGURA;
      const y0 = -ALTURA / 2;
      const zBorda = superficie(0, ALTURA).z;
      // no papel segue a superfície; abaixo da folha pende um pouco para a frente
      const pontos = [new THREE.Vector3(0.0, y0 - 1.3, zBorda + 0.05)];
      FIO_REPOUSO.forEach(([px, py]) => {
        const x = (px / 1000 - 0.5) * L;
        if (py <= 2000) pontos.push(superficie(x, (py / 2000) * ALTURA, 0.0035));
        else {
          const abaixo = ((py - 2000) / 2000) * ALTURA;
          pontos.push(new THREE.Vector3(x, y0 - abaixo, zBorda + 0.006 + abaixo * 0.065));
        }
      });
      // Sem a sombra "do chão" do fio: aqui dentro o chão (y = 0) é o meio da folha,
      // e ela aparecia como um risco claro sob a frase em tela 3x. A sombra no papel
      // é a de baixo (sombraFio).
      fio = criarFio(mundo, { curva: pontos, largura: 0.0058, sombra: false });
      fio.progresso(0);
      interno.add(fio.objeto);

      // a mesma curva, para saber onde ela entra na tela e onde encosta no papel
      const caminho = new THREE.CatmullRomCurve3(pontos, false, 'centripetal');
      const N = 160;
      const amostras = caminho.getSpacedPoints(N);
      let entra = 0;
      let encosta = 0;
      for (let i = 0; i <= N; i++) {
        if (amostras[i].y < y0 - 0.2) entra = i;
        if (amostras[i].y < y0) encosta = i;
      }

      // sombra do fio no papel
      const n = N - encosta + 1;
      const pos = new Float32Array(n * 2 * 3);
      const lados = new Float32Array(n * 2);
      const us = new Float32Array(n * 2);
      const idx = [];
      const meiaLargura = 0.0075;
      for (let i = 0; i < n; i++) {
        const a = amostras[encosta + i];
        const b = amostras[Math.min(N, encosta + i + 1)];
        const c = amostras[Math.max(0, encosta + i - 1)];
        const dx = b.x - c.x;
        const dy = b.y - c.y;
        const comprimento = Math.hypot(dx, dy) || 1;
        const nx = -dy / comprimento;
        const ny = dx / comprimento;
        for (let k = 0; k < 2; k++) {
          const lado = k ? 1 : -1;
          const o = (i * 2 + k) * 3;
          pos[o] = a.x + 0.004 + nx * lado * meiaLargura;
          pos[o + 1] = a.y - 0.0055 + ny * lado * meiaLargura;
          pos[o + 2] = a.z - 0.0025;
          lados[i * 2 + k] = lado;
          us[i * 2 + k] = (encosta + i) / N;
        }
        if (i < n - 1) { const v = i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aLado', new THREE.BufferAttribute(lados, 1));
      g.setAttribute('aU', new THREE.BufferAttribute(us, 1));
      g.setIndex(idx);
      const m = new THREE.ShaderMaterial({
        vertexShader: VERTICE_SOMBRA_FIO,
        fragmentShader: FRAGMENTO_SOMBRA_FIO,
        uniforms: { uProgresso: { value: 0 }, uForca: { value: 0.34 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      sombraFio = new THREE.Mesh(g, m);
      sombraFio.renderOrder = 3;
      sombraFio.frustumCulled = false;
      interno.add(sombraFio);

      const estado = { p: Math.max(0, entra / N - 0.04) };
      fio.progresso(estado.p);
      await comoPromise(gsap.to(estado, {
        p: 1,
        duration: amb.reduzido ? 1.6 : 4.4,
        ease: amb.reduzido ? 'none' : 'power2.out',
        onUpdate() {
          fio.progresso(estado.p);
          m.uniforms.uProgresso.value = estado.p;
        },
      }));
      // assentado, o fio respira um brilho muito sutil de tempos em tempos
      fio.respirar?.(0.2);
    },

    viver() {
      if (vivendo) return;
      vivendo = true;
      vidaDasPetalas({ acabou: () => descartada, temDela: () => letraDela.tem, ciclo: cicloPetala }).catch((erro) => console.error('[carta] pétala', erro));
    },

    recuar() {
      const de = leitura.distancia;
      margemFim = MARGEM_FIM;
      medirLeitura();
      if (!(leitura.distancia > de + 1e-4)) return;
      const k = { v: 0 };
      gsap.to(k, {
        v: 1,
        duration: amb.reduzido ? 1.2 : 2.4,
        ease: curvas.branco.deriva,
        // (a distância de chegada é a de agora: se a tela mudar no meio, ela acompanha)
        onUpdate: () => { leitura.pos.z = mundo.rig.position.z - lerp(de, leitura.distancia, k.v); aplicarViagem(); },
      });
    },

    /** Sobe e sai pelo alto da tela (o menu do fim chegou). Quem chama descarta depois. */
    irEmbora() {
      if (!grupo.visible || descartada) return Promise.resolve();
      // o bastante para a borda de baixo passar da borda de cima da tela, a esta distância
      const meiaTela = Math.tan(THREE.MathUtils.degToRad(mundo.camera.fov / 2)) * leitura.distancia;
      const sobe = ALTURA / 2 + meiaTela + 0.12;
      const k = { v: 0 };
      // o fio que repousava nela se solta: escorre de volta para baixo enquanto ela sobe
      // (a ponta de baixo dele é comprida: subindo junto, ficaria à vista até o último quadro)
      if (fio && !amb.reduzido) {
        const solta = { p: fio.progresso() || 1 };
        gsap.to(solta, {
          p: 0,
          duration: 1.5,
          ease: 'power2.in',
          onUpdate: () => {
            if (descartada) return;
            fio.progresso(solta.p);
            if (sombraFio) sombraFio.material.uniforms.uProgresso.value = solta.p;
          },
        });
      }
      return new Promise((resolver) => {
        const fim = () => { grupo.visible = false; resolver(); };
        gsap.to(k, {
          v: 1,
          duration: amb.reduzido ? 0.01 : 2.7,
          ease: 'power2.inOut',
          // (por cima da altura de leitura de agora: se a tela mudar no meio, ela acompanha)
          onUpdate: () => { leitura.pos.y = ALTURA_OLHOS + sobe * k.v; aplicarViagem(); },
          onComplete: fim,
          onInterrupt: fim,
        });
      });
    },

    atualizar(dt, t) {
      if (!grupo.visible) return;

      // o papel cede enquanto a aba gira, e se endireita quando ela para
      if (dt > 0) {
        const vB = (dobra.baixo - anterior.baixo) / dt;
        const vC = (dobra.cima - anterior.cima) / dt;
        anterior.baixo = dobra.baixo;
        anterior.cima = dobra.cima;
        const alvoB = amb.reduzido ? 0 : clamp(-vB * 0.07, -0.32, 0.32);
        const alvoC = amb.reduzido ? 0 : clamp(-vC * 0.07, -0.32, 0.32);
        const antesB = cede.baixo;
        const antesC = cede.cima;
        cede.baixo = amortecer(cede.baixo, alvoB, 7, dt);
        cede.cima = amortecer(cede.cima, alvoC, 7, dt);
        if (Math.abs(cede.baixo - antesB) > 1e-5 || Math.abs(cede.cima - antesC) > 1e-5) sujo = true;
      }
      if (sujo) refazerMalha();

      // flutua: respira ±0,5°, uns 4 mm, e segue o ponteiro bem de leve
      const f = amb.reduzido ? 0 : flutua.forca;
      flutua.x = amortecer(flutua.x, mundo.ponteiro.x, 2.2, dt);
      flutua.y = amortecer(flutua.y, mundo.ponteiro.y, 2.2, dt);
      interno.position.y = Math.sin(t * 0.62) * 0.004 * f;
      interno.position.z = -recuo.z;
      interno.rotation.z = Math.sin(t * 0.41 + 0.8) * 0.0087 * f;
      interno.rotation.y = (flutua.x * 0.075 + Math.sin(t * 0.27) * 0.012) * f;
      interno.rotation.x = (-flutua.y * 0.05 + Math.sin(t * 0.33 + 2.0) * 0.008) * f;

      // escrita (a dele e a dela): a textura só sobe para a placa enquanto há tinta mudando
      for (const bloco of [dele, dela]) {
        const { escrita, textura } = bloco;
        if (!escrita.ativo) continue;
        const mudou = escrita.avancar(dt * (amb.rapido || 1));
        quadro++;
        if (mudou && textura && (!baixo || quadro % 2 === 0 || !escrita.ativo)) subirTinta(bloco);
        if (!escrita.ativo && textura) {
          // acabou: uma subida inteira (a placa fica igual ao canvas, sem depender das faixas)
          escrita.tirarFaixas();
          textura.needsUpdate = true;
          telasFaixa.clear();
        }
      }
    },

    dispose() {
      descartada = true;
      pararTamanho();
      if (grupo.parent) grupo.parent.remove(grupo);
      geometria.dispose();
      material.dispose();
      sombra.geometry.dispose();
      matSombra.dispose();
      texturaVazia.dispose();
      for (const { textura } of [dele, dela]) if (textura) textura.dispose();
      if (fio) fio.dispose();
      if (sombraFio) { sombraFio.geometry.dispose(); sombraFio.material.dispose(); }
      if (petala) {
        petala.obj.geometry.dispose();
        petala.mat.dispose();
        petala.mancha.geometry.dispose();
        petala.matMancha.dispose();
      }
      if (espelho) espelho.remove();
      letraDela.dispose();
    },
  };
}

// =============================================================================
// Leve (DOM): a mesma folha em CSS 3D, com o mesmo canvas da escrita
// =============================================================================

/** Caminho SVG suave (Catmull-Rom → Bézier) por uma lista de pontos [x, y]. */
function caminhoSuave(pontos) {
  let d = `M${pontos[0][0].toFixed(1)} ${pontos[0][1].toFixed(1)}`;
  for (let i = 0; i < pontos.length - 1; i++) {
    const p0 = pontos[Math.max(0, i - 1)];
    const p1 = pontos[i];
    const p2 = pontos[i + 1];
    const p3 = pontos[Math.min(pontos.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

function criarFolhaLeve(mundo) {
  const gsap = window.gsap;
  const amb = mundo.amb;
  const calmo = amb.reduzido;

  // Estrutura: a folha (posição e escala) > o corpo (flutua) > três painéis; as
  // abas de cima e de baixo giram no vinco. A tinta é um canvas por cima.
  const escuroCima = el('i', 'fl-escuro');
  const escuroBaixo = el('i', 'fl-escuro');
  const abaCima = el('div', 'fl-aba fl-cima', [el('div', 'fl-painel'), escuroCima]);
  const abaBaixo = el('div', 'fl-aba fl-baixo', [el('div', 'fl-painel'), escuroBaixo]);
  const meio = el('div', 'fl-painel fl-meio');
  const sombra = el('div', 'fl-sombra');
  const corpo = el('div', 'fl-corpo', [sombra, meio, abaCima, abaBaixo]);
  const folha = el('div', 'folha-leve', corpo);
  mundo.recipienteLeve.append(folha);
  gsap.set(folha, { autoAlpha: 0 });
  gsap.set(abaCima, { rotationX: -178.5, z: 1 });
  gsap.set(abaBaixo, { rotationX: 176, z: 2.5 });
  gsap.set([escuroCima, escuroBaixo], { opacity: 0.035 });
  gsap.set(sombra, { scaleY: 1 / 3 });

  const escrita = criarEscrita({ amb, largura: amb.nivel === 'baixo' ? 768 : 1024 });
  escrita.tela.className = 'fl-tinta';
  corpo.append(escrita.tela);
  let espelho = espelhoParaLeitor();       // vazio até escrever(): ver anunciar()

  // A letra dela: um segundo canvas, dentro da aba de baixo (assim acompanha a
  // inclinação dela); o alto dele é contado a partir do vinco.
  const letraDela = criarLetraDela({
    amb,
    escritaDele: escrita,
    mostrar: (plano) => {
      const terco = (2 * escrita.largura) / 3;
      telaDela.style.top = `${(((plano.topoFolha - 2 * terco) / terco) * 100).toFixed(3)}%`;
      telaDela.hidden = false;
    },
    esconder: () => { telaDela.hidden = true; },
    liberar: () => levantarPetala(),
  });
  const telaDela = letraDela.escrita.tela;
  telaDela.className = 'fl-tinta';
  telaDela.hidden = true;
  abaBaixo.append(telaDela);

  let textoPronto = null;
  let assumiu = false;
  let descartada = false;
  let vivendo = false;
  let fioEl = null;
  let petalaEl = null;
  let pousando = null;                   // o pouso da pétala que vem, está pousada ou sai (como no 3D)
  let voo = null;
  const flutua = { forca: 0, x: 0, y: 0 };

  async function preparar(texto) {
    const frase = String(texto ?? '');
    if (textoPronto === frase) return;
    await fontePronta(frase);
    const plano = escrita.preparar(frase);
    const total = 2 * escrita.largura;
    escrita.tela.style.top = `${((plano.topoFolha / total) * 100).toFixed(3)}%`;
    textoPronto = frase;
  }

  // O pedaço do papel que ainda está dentro do bolso da carta (px de tela): a
  // folha nasce recortada ali e termina de sair antes de vir para a frente.
  let noBolso = 0;
  let fracaoBolso = 0;
  function recortar(fracao) {
    // a folha dobrada ocupa o terço do meio do elemento; o recorte come de baixo
    const v = fracao > 0.0005 ? `inset(0 0 ${(33.3334 + fracao * 33.3333).toFixed(3)}% 0)` : '';
    folha.style.webkitClipPath = v;
    folha.style.clipPath = v;
  }

  function entrar(de, topoBolso) {
    // `de`: retângulo de tela do papel da carta (ou nada); `topoBolso`: y da boca da carta
    const r = folha.getBoundingClientRect();
    const largura = folha.offsetWidth || r.width || 300;
    const altura = folha.offsetHeight || largura * 2;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let x = 0;
    let y = altura * 0.04;
    let escala = 0.74;
    if (de && de.width > 4) {
      x = de.left + de.width / 2 - cx;
      y = de.top + de.height / 2 - cy;
      escala = de.width / largura;
      if (Number.isFinite(topoBolso)) noBolso = clamp(de.bottom - topoBolso, 0, de.height * 0.9);
      fracaoBolso = noBolso / de.height;
      recortar(fracaoBolso);
    }
    gsap.set(folha, { x, y, scale: escala, autoAlpha: 1 });
    assumiu = true;
  }

  async function cicloPetala(pouso, descanso) {
    if (!petalaEl) {
      petalaEl = el('i', 'fl-petala');
      corpo.append(petalaEl);
    }
    pousando = pouso;
    const levantou = () => descartada || pousando !== pouso;      // ver levantarPetala()
    const L = folha.offsetWidth || 300;
    const A = L * 2;
    const x = (0.5 + pouso.x) * L;
    const y = pouso.s * A;
    const giro = (pouso.giro * 180) / Math.PI;
    if (calmo) {
      gsap.set(petalaEl, { x, y, rotation: giro, rotationX: 0, autoAlpha: 0 });
      await comoPromise(voo = gsap.to(petalaEl, { autoAlpha: 1, duration: 1.4, ease: 'none' }));
    } else {
      const lado = pouso.x < 0 ? -1 : 1;
      const q = { p: 0 };
      gsap.set(petalaEl, { autoAlpha: 1 });
      await comoPromise(voo = gsap.to(q, {
        p: 1,
        duration: 4.2,
        ease: 'sine.out',
        onUpdate() {
          const e = q.p;
          const resto = 1 - e;
          gsap.set(petalaEl, {
            x: x + lado * L * 0.42 * resto + Math.sin(e * 9.5) * L * 0.16 * resto,
            y: y - A * 0.72 * resto,
            rotation: giro + resto * 150 * lado,
            rotationX: resto * resto * 300 + Math.sin(e * 11) * 28 * resto,
            scale: 1 + resto * 0.5,
            opacity: clamp(e * 5),
          });
        },
      }));
    }
    if (levantou()) return;
    await espera(descanso * 1000);
    if (levantou()) return;
    if (calmo) {
      await comoPromise(voo = gsap.to(petalaEl, { autoAlpha: 0, duration: 1.4, ease: 'none' }));
    } else {
      const sx = x + pouso.sai.x * L;
      const sy = y + pouso.sai.s * A;
      const tl = gsap.timeline();
      tl.to(petalaEl, { x: sx, y: sy, rotation: giro + (pouso.sai.x < 0 ? 28 : -28), duration: 2.6, ease: 'power2.in' }, 0)
        .to(petalaEl, { x: sx + pouso.sai.x * L * 0.9, y: sy + A * 0.55, rotation: giro + 160, rotationX: 200, duration: 2.4, ease: 'power1.in' }, 2.6)
        .to(petalaEl, { opacity: 0, duration: 0.9, ease: 'none' }, 4.1);
      await comoPromise(voo = tl);
    }
    if (!levantou()) pousando = null;
  }

  /** Como no 3D: a pétala do canto da letra dela levanta e some (só transform e opacidade). */
  function levantarPetala() {
    if (!petalaEl || !pousando || !pousando.dela) return Promise.resolve();
    pousando = null;
    if (voo) voo.kill();
    const L = folha.offsetWidth || 300;
    return comoPromise(voo = gsap.to(petalaEl, calmo
      ? { opacity: 0, duration: 0.4, ease: 'none' }
      : { x: `-=${(L * 0.12).toFixed(1)}`, y: `-=${(L * 0.07).toFixed(1)}`, rotation: '-=34', rotationX: '+=70', scale: 1.15, opacity: 0, duration: 0.7, ease: 'power1.out' }));
  }

  return {
    grupo: objetoLeve(),

    preparar,

    /** Aparece dobrada no lugar do papel que saiu da carta. */
    assumir(papel) {
      let de = null;
      let topoBolso = NaN;
      if (papel && papel.getBoundingClientRect) {
        de = papel.getBoundingClientRect();
        // a boca da carta: o topo do desenho do corpo (o papel fica atrás dele)
        const corpoCarta = papel.parentElement && papel.parentElement.querySelector('.cl-corpo');
        if (corpoCarta) topoBolso = corpoCarta.getBoundingClientRect().top;
        papel.visible = false;
      }
      entrar(de, topoBolso);
    },

    async desdobrar() {
      if (!assumiu) entrar(null);
      if (noBolso > 0) {
        // termina de sair do bolso: sobe o que falta enquanto o recorte se abre
        const saida = { k: 0 };
        const y0 = Number(gsap.getProperty(folha, 'y')) || 0;
        const fracao = fracaoBolso;
        await comoPromise(gsap.to(saida, {
          k: 1,
          duration: calmo ? 0.3 : 0.55,
          ease: curvas.branco.deriva,
          onUpdate() {
            gsap.set(folha, { y: y0 - noBolso * saida.k });
            recortar(fracao * (1 - saida.k));
          },
        }));
        recortar(0);
        noBolso = 0;
      }
      const ida = calmo ? 0.9 : 2.1;
      const t0 = calmo ? 0.3 : 1.15;
      const tl = gsap.timeline();
      tl.to(folha, { x: 0, y: 0, scale: 1, duration: ida, ease: curvas.branco.entrar }, 0)
        .to(flutua, { forca: 1, duration: 2.5, ease: 'none' }, ida * 0.5);
      if (calmo) {
        tl.to(abaBaixo, { rotationX: 4, duration: 0.8, ease: 'power3.out' }, t0)
          .to(abaCima, { rotationX: -3, duration: 0.8, ease: 'power3.out' }, t0)
          .to([escuroBaixo, escuroCima], { opacity: 0, duration: 0.8, ease: 'none' }, t0)
          .to(sombra, { scaleY: 1, duration: 0.8, ease: 'power3.out' }, t0);
      } else {
        tl.to(abaBaixo, { rotationX: 2.5, duration: 1.7, ease: 'power3.out' }, t0)
          .to(abaBaixo, { rotationX: 4.5, duration: 1.3, ease: curvas.branco.deriva }, t0 + 1.7)
          .to(escuroBaixo, { opacity: 0, duration: 1.5, ease: 'power2.out' }, t0)
          .to(abaCima, { rotationX: -1.5, duration: 1.8, ease: 'power3.out' }, t0 + 0.55)
          .to(abaCima, { rotationX: -3, duration: 1.3, ease: curvas.branco.deriva }, t0 + 2.35)
          .to(escuroCima, { opacity: 0.012, duration: 1.6, ease: 'power2.out' }, t0 + 0.55)
          // a sombra cresce atrás das abas, sem chegar antes delas (senão desenha um papel que ainda não existe)
          .to(sombra, { opacity: 0.3, duration: 0.4, ease: 'none' }, t0)
          .to(sombra, { scaleY: 1, duration: 2.4, ease: 'sine.inOut' }, t0 + 0.2)
          .to(sombra, { opacity: 1, duration: 1.2, ease: 'none' }, t0 + 1.9);
      }
      tl.addLabel('aberta', calmo ? t0 + 0.8 : t0 + 2.5);
      await new Promise((resolver) => {
        tl.add(resolver, 'aberta');
        tl.eventCallback('onInterrupt', resolver);
      });
    },

    async escrever(texto, opcoes = {}) {
      const frase = String(texto ?? '');
      // #mundo-leve é aria-hidden: quem lê em voz alta recebe o espelho.
      if (!espelho) espelho = espelhoParaLeitor();
      anunciar(espelho, frase);
      try {
        await preparar(frase);
      } catch (erro) {
        console.error('[carta] não consegui compor a frase', erro);
        return;
      }
      await escrita.iniciar(opcoes);
    },

    escreverDela: letraDela.escrever,
    apagarDela: letraDela.apagar,

    async repousarFio() {
      if (fioEl) return;
      // Mesmo desenho do 3D, em milésimos da largura da folha (0..1000 × 0..2000).
      const d = caminhoSuave(FIO_REPOUSO);
      fioEl = svg(`
        <svg class="fl-fio" viewBox="0 0 1000 2000" aria-hidden="true">
          <defs><mask id="fl-fio-mascara" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1400" height="3800">
            <path d="${d}" fill="none" stroke="#fff" stroke-width="60" stroke-linecap="round"/>
          </mask></defs>
          <g mask="url(#fl-fio-mascara)">
            <path class="fl-fio-sombra" d="${d}" fill="none" stroke-width="22" stroke-linecap="round" transform="translate(9 13)"/>
            <path class="fl-fio-brilho" d="${d}" fill="none" stroke="#ffbf7a" stroke-width="34" stroke-linecap="round"/>
            <path d="${d}" fill="none" stroke="#d7192d" stroke-width="13" stroke-linecap="round"/>
            <path d="${d}" fill="none" stroke="#a80f22" stroke-width="13" stroke-dasharray="7 15" opacity="0.55"/>
          </g>
        </svg>`);
      corpo.append(fioEl);
      const traco = fioEl.querySelector('mask path');
      const comprimento = traco.getTotalLength ? traco.getTotalLength() : 3000;
      traco.setAttribute('stroke-dasharray', `${comprimento} ${comprimento + 80}`);
      const estado = { p: 0.3 };
      const aplicar = () => traco.setAttribute('stroke-dashoffset', String(comprimento * (1 - estado.p)));
      aplicar();
      await comoPromise(gsap.to(estado, {
        p: 1,
        duration: calmo ? 1.6 : 4.4,
        ease: calmo ? 'none' : 'power2.out',
        onUpdate: aplicar,
      }));
      fioEl.classList.add('fl-fio-respira');
    },

    viver() {
      if (vivendo) return;
      vivendo = true;
      vidaDasPetalas({ acabou: () => descartada, temDela: () => letraDela.tem, ciclo: cicloPetala }).catch((erro) => console.error('[carta] pétala', erro));
    },

    recuar() {
      // a mesma faixa livre do 3D: a folha encolhe um pouco para caber entre o contador e o botão
      const s = innerHeight < 520 ? 1 : Math.min(1, (innerHeight - 2 * MARGEM_FIM) / Math.max(1, folha.offsetHeight));
      if (s < 1) gsap.to(folha, { scale: s, duration: calmo ? 1.2 : 2.4, ease: curvas.branco.deriva });
    },

    /** Sobe e sai pelo alto da tela (o menu do fim chegou). Quem chama descarta depois. */
    irEmbora() {
      if (descartada || !folha.isConnected) return Promise.resolve();
      const y0 = Number(gsap.getProperty(folha, 'y')) || 0;
      // o fio que repousava nela se solta (some antes de ela sair: a ponta dele passa da borda de baixo)
      if (fioEl) gsap.to(fioEl, { opacity: 0, duration: calmo ? 0.01 : 0.9, ease: 'none' });
      return comoPromise(gsap.to(folha, {
        y: y0 - folha.offsetHeight * 1.2,                  // translateY(-120%): a borda de baixo passa do alto da tela
        duration: calmo ? 0.01 : 2.7,
        ease: 'power2.inOut',
      }));
    },

    atualizar(dt, t) {
      for (const e of [escrita, letraDela.escrita]) if (e.ativo) { e.avancar(dt * (amb.rapido || 1)); e.tirarFaixas(); }
      if (calmo || !assumiu) return;
      const f = flutua.forca;
      flutua.x = amortecer(flutua.x, mundo.ponteiro.x, 2.2, dt);
      flutua.y = amortecer(flutua.y, mundo.ponteiro.y, 2.2, dt);
      corpo.style.transform = `translate3d(0, ${(Math.sin(t * 0.62) * 3 * f).toFixed(2)}px, 0)`
        + ` rotateZ(${(Math.sin(t * 0.41 + 0.8) * 0.5 * f).toFixed(3)}deg)`
        + ` rotateY(${((flutua.x * 3.2 + Math.sin(t * 0.27) * 0.6) * f).toFixed(3)}deg)`
        + ` rotateX(${((flutua.y * 2.2 + Math.sin(t * 0.33 + 2) * 0.4) * f).toFixed(3)}deg)`;
    },

    dispose() {
      descartada = true;
      folha.remove();
      if (espelho) espelho.remove();
      letraDela.dispose();
    },
  };
}
