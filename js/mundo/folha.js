/* ============================================================================
   FOLHA: a última folha, escrita à mão
   ============================================================================
   criarFolha(mundo) escolhe a versão pelo mundo.ok; as duas cumprem o mesmo
   contrato (final.js, resposta.js e menu.js chamam):
     3D    uma malha só de 0,45 × 0,90 m (1:2), dobrada em três pelo perfil,
           num ShaderMaterial de papel opaco desenhado primeiro (renderOrder −20:
           a profundidade dele descarta a alameda atrás), sombra macia atrás,
           pétalas que pousam e o fio que repousa no canto de baixo à direita.
     leve  a mesma folha em CSS 3D dentro de #mundo-leve (geometria e papel em
           css/final.css: .folha-leve e .fl-*), com o fio em SVG.
   Um motor só de escrita (criarEscrita, canvas 2D) serve às duas versões e às
   duas letras: a frase dele, letra por letra, em tinta que seca; a dela em
   --sakura-tinta no terço de baixo. A ponta segue a tinta lida coluna a
   coluna, e a mesma frase sai sempre com a mesma mão (semente do texto).
   A tinta é só imagem: a frase inteira vai, uma vez, para um p.so-leitor
   aria-live em #palco. Nada aqui lê content.js nem grava storage.

   API: grupo, preparar(texto), assumir(papel), desdobrar(), escrever(texto,
   opcoes), escreverDela(texto, opcoes), apagarDela(), repousarFio(), viver(),
   recuar(), irEmbora(), atualizar(dt, t), dispose(). Quem descarta é quem
   chamou irEmbora (menu.js).
   ========================================================================== */

import { el, espera, clamp, lerp, suave, amortecer, semente, svg, objetoLeve } from '../nucleo/util.js';
import { curvas, comoPromise } from '../nucleo/movimento.js';
import { criarFio } from './fio.js';

/* ---- a folha (metros) ------------------------------------------------------- */

const LARGURA = 0.45; // a carta tem 36 cm
const ALTURA = 0.9; // 1:2; dobrada em três fica 3:2, a proporção do papel da carta
const ALTURA_OLHOS = 1.5; // contrato 4.3
const VINCO_CIMA = ALTURA / 3;
const VINCO_BAIXO = (2 * ALTURA) / 3;
const RAIO_CIMA = 0.008; // meia-largura do arco de cada vinco
const RAIO_BAIXO = 0.017;
const COLUNAS = 10; // 11 vértices por fileira, 39 fileiras, 760 triângulos
// O papel guarda a dobra: fechado quase 180°, aberto nunca fica plano.
const FECHADA_CIMA = Math.PI * 0.992;
const FECHADA_BAIXO = Math.PI * 0.985;
const ABERTA_CIMA = 0.06;
const ABERTA_BAIXO = 0.085;
const MARGEM_FIM = 100; // px livres no alto (contador) e embaixo (reabrir)
const TELA_BAIXA = 520; // px: abaixo disso a folha ocupa 90% e não recua

/* ---- a escrita ---------------------------------------------------------------- */

const COR_TINTA = [42, 27, 34]; // --tinta, depois de seca
const COR_MOLHADA = [15, 5, 10]; // recém-escrita
const FONTE = '"Klee One", "Shippori Mincho", Georgia, serif';
const PESO = 600;
const INCLINACAO = 0.02; // skew
const APERTO = -0.045; // em tamanhos de letra, por glifo
const VARIA = { altura: 0.06, giro: 0.055, tamanho: 0.055, inclinacao: 0.03 };
const ENTRELINHA = 1.6;
const MARGEM_ESQ = 0.11; // U
const LARGURA_UTIL = 0.79; // U
const CADENCIA = 0.122; // s por letra, em média; o ritmo real vem da tinta
const SECAGEM = 1.5; // s até a tinta ficar da cor final
const GORDURA = 0.0065; // em tamanhos de letra, por lado: a tinta molhada é mais gorda
const ARREMATE = 0.09; // s: a ponta sai da palavra
const COBERTURA = 56; // alfa (de 255) que conta como tinta
// A letra dela: mesma mão e mesma caneta, em --sakura-tinta (7,4:1 no papel).
// O vermelho cheio é do fio; ela fica abaixo do vinco de baixo, longe dele.
const DELA = {
  tinta: [143, 31, 69],
  molhada: [96, 10, 42],
  tempo: 0.8,
  teto: 12, // s, no ritmo dele
  corpo: 0.7, // corpo máximo, em corpos dele
  menor: 0.04, // U
  entrelinha: 1.45,
  largura: 0.7, // U, a partir da margem
  topo: 0.69, // altura de folha a partir do topo
  base: 0.93,
  baseBaixa: 0.84, // tela baixa: acima do botão de reabrir
  limite: 180, // caracteres exibidos; a resposta guarda o resto
};

// Os três cantos onde uma pétala pousa (L = largura, A = altura da folha).
// O de baixo à direita é do fio; o de baixo à esquerda, da letra dela.
const POUSOS = [
  { x: -0.33, s: 0.085, giro: -0.5, sai: [-0.24, 0.07] },
  { x: 0.31, s: 0.105, giro: 0.7, sai: [0.26, 0.08] },
  { x: -0.34, s: 0.9, giro: -1.1, sai: [-0.05, 0.14], dela: true },
];

// O fio que repousa, no viewBox 1000 × 2000 da folha: y > 2000 é abaixo dela.
// Ordenado (a ordem é o caminho): sobe pela borda de baixo e se deita no canto
// de baixo à direita num S largo. Sem laço (laço cruzado vira símbolo) e sem
// gancho na ponta (vira ponto de interrogação).
const FIO_REPOUSO = [
  [600, 3400], [745, 2700], [845, 2260], [884, 2060],
  [890, 1985], [866, 1915], [834, 1842], [830, 1766], [860, 1700],
  [910, 1640], [934, 1572], [926, 1500], [906, 1440],
];

/* ---- leitor de tela --------------------------------------------------------- */

const lugarDoEspelho = () => document.getElementById('palco') || document.body;
const vezDoEspelho = new WeakMap();

/** A região viva que lê a frase inteira; nasce vazia. */
function espelhoParaLeitor() {
  const p = el('p', { class: 'so-leitor', 'aria-live': 'polite' });
  lugarDoEspelho().append(p);
  return p;
}

/** Uma região que já entra com o texto costuma não ser lida: o texto chega dois quadros depois. */
function anunciar(p, texto) {
  const vez = (vezDoEspelho.get(p) || 0) + 1;
  vezDoEspelho.set(p, vez);
  if (!p.isConnected) lugarDoEspelho().append(p);
  p.textContent = '';
  if (!texto) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (vezDoEspelho.get(p) === vez) p.textContent = texto;
  }));
}

/* ---- pequenos ----------------------------------------------------------------- */

/** A Klee One (peso 600), com teto de 1,5 s; nunca lança. */
function fontePronta(texto) {
  let carga = null;
  try {
    carga = document.fonts?.load?.(`${PESO} 48px ${FONTE}`, texto || 'a');
  } catch {
    carga = null;
  }
  return Promise.race([Promise.resolve(carga).catch(() => {}), espera(1500)]).then(() => {}, () => {});
}

/** FNV-1a de 32 bits: mesma frase, mesma escrita. */
function sementeDoTexto(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

function misturar(a, b, k) {
  return `rgb(${Math.round(lerp(a[0], b[0], k))},${Math.round(lerp(a[1], b[1], k))},${Math.round(lerp(a[2], b[2], k))})`;
}

/** Junta faixas [y0, y1] que se tocam. */
function juntar(faixas) {
  if (faixas.length < 2) return faixas.map((f) => [f[0], f[1]]);
  const ordem = faixas.slice().sort((a, b) => a[0] - b[0]);
  const juntas = [[ordem[0][0], ordem[0][1]]];
  for (let i = 1; i < ordem.length; i++) {
    const ultima = juntas[juntas.length - 1];
    if (ordem[i][0] <= ultima[1]) ultima[1] = Math.max(ultima[1], ordem[i][1]);
    else juntas.push([ordem[i][0], ordem[i][1]]);
  }
  return juntas;
}

/* ---- a letra dela ------------------------------------------------------------- */

// A fonte não tem emoji e a tinta viraria borrão: o emoji sai. Colado entre
// duas palavras ele vira espaço ("obrigada", emoji, "te amo" não vira "obrigadate amo").
const PICTO = '\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u{1F3FB}-\\u{1F3FF}\\u{E0020}-\\u{E007F}\\u200D\\uFE0E\\uFE0F\\u20E3';
const EMOJI = new RegExp(`[${PICTO}]`, 'gu');
const EMOJI_ENTRE = new RegExp(`([^\\s${PICTO}])[${PICTO}]+(?=[^\\s${PICTO}])`, 'gu');

/** Normaliza e limita a letra dela (o texto inteiro continua guardado na resposta). */
function textoDela(texto) {
  let t = String(texto ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(EMOJI_ENTRE, '$1 ')
    .replace(EMOJI, '')
    .replace(/…/g, '...') // o "…" da Klee One é o japonês, no meio da linha
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/\S{19,}/gu, (p) => p.match(/.{1,18}/gu).join(' '));
  if (t.length > DELA.limite) {
    const corte = t.slice(0, DELA.limite + 1);
    const fim = corte.search(/\s\S*$/);
    t = (fim > 0 ? corte.slice(0, fim) : corte.slice(0, DELA.limite)).replace(/[\s,;:.]+$/, '') + '...';
  }
  return t;
}

/** Faixa, corpo e alinhamento da letra dela, abaixo do fim da frase dele. */
function faixaDela(U, planoDele) {
  const fsDele = planoDele?.fs || 0.1 * U;
  let fimDele = 0;
  for (const t of planoDele?.tracos || []) fimDele = Math.max(fimDele, planoDele.topoFolha + t.base);
  const topo = Math.max(2 * U * DELA.topo, fimDele + 0.6 * fsDele);
  const base = 2 * U * (innerHeight < TELA_BAIXA ? DELA.baseBaixa : DELA.base);
  const fsMax = Math.round(DELA.corpo * fsDele);
  return {
    alinhar: 'topo',
    topo,
    alturaMax: base - topo,
    fsMax,
    fsMin: Math.min(fsMax, DELA.menor * U),
    larguraMax: DELA.largura * U,
    margem: MARGEM_ESQ * U,
    entrelinha: DELA.entrelinha,
    cortar: true,
  };
}

/* ============================================================================
   O MOTOR DE ESCRITA
   ============================================================================
   Três canvas: `tela` (o que se vê: textura na 3D, canvas na DOM), `seca` (o
   que já secou) e `aux` (leitura da tinta). Compor → ler a tinta → planejar o
   relógio (em fatias de 6 ms) → avancar(dt) a cada quadro. Por quadro só as
   faixas das palavras molhadas são refeitas: seca por baixo, molhada por cima.
   ========================================================================== */

function criarEscrita({ amb, largura: U, tinta = COR_TINTA, molhada = COR_MOLHADA, tempo = 1, teto = Infinity }) {
  const reduzido = !!amb?.reduzido;
  const tela = document.createElement('canvas');
  const seca = document.createElement('canvas');
  const aux = document.createElement('canvas');
  tela.width = seca.width = U;
  tela.height = seca.height = 1;
  const cTela = tela.getContext('2d');
  const cSeca = seca.getContext('2d');
  const cAux = aux.getContext('2d', { willReadFrequently: true });
  const corSeca = rgb(tinta);
  const corFresca = rgb(molhada);
  const larguras = new Map(); // avanço de cada caractere a 1 px de corpo
  const faixas = []; // faixas da tela que mudaram desde o último tirarFaixas()

  let plano = null;
  let ativo = false;
  let T = 0;
  let fimEscrita = 0;
  let aoTraco = null;
  let resolver = null;
  let geracao = 0;
  let falhas = 0;

  function medir(ch) {
    let w = larguras.get(ch);
    if (w === undefined) {
      cAux.font = `${PESO} 100px ${FONTE}`;
      w = cAux.measureText(ch).width / 100;
      larguras.set(ch, w);
    }
    return w;
  }

  /* ---- composição --------------------------------------------------------- */

  /** Palavras e quebras; a pontuação final colada vira um trecho à parte. */
  function itensDe(texto) {
    const itens = [];
    for (const parte of texto.split(/(\n)/)) {
      if (parte === '\n') {
        itens.push({ quebra: true });
        continue;
      }
      for (const p of parte.split(' ')) {
        if (!p) continue;
        const m = /^(.*[^.!?…])([.!?…]+)$/su.exec(p);
        const letras = [...p];
        itens.push({
          texto: p,
          corpo: m ? m[1] : p,
          pont: m ? m[2] : '',
          w1: letras.reduce((s, ch) => s + medir(ch) + APERTO, 0),
          curta: letras.length === 1 && /\p{L}/u.test(p),
        });
      }
    }
    return itens;
  }

  const larguraDa = (linha, fs) => linha.reduce((s, it, i) => s + it.w1 * fs + (i ? medir(' ') * fs : 0), 0);

  /** Gulosa. Palavra de uma letra não fica no fim da linha: desce com a próxima (no máximo duas). */
  function quebrar(itens, limite, fs) {
    const esp = medir(' ') * fs;
    const linhas = [];
    let linha = [];
    let larg = 0;
    for (const it of itens) {
      if (it.quebra) {
        linhas.push(linha);
        linha = [];
        larg = 0;
        continue;
      }
      const w = it.w1 * fs;
      if (linha.length && larg + esp + w > limite) {
        const desce = [];
        while (desce.length < 2 && linha.length > 1 && linha[linha.length - 1].curta) desce.unshift(linha.pop());
        linhas.push(linha);
        linha = [...desce, it];
        larg = larguraDa(linha, fs);
      } else {
        larg += (linha.length ? esp : 0) + w;
        linha.push(it);
      }
    }
    linhas.push(linha);
    return linhas;
  }

  /** O menor comprimento de linha que mantém o número de linhas: o bloco fica equilibrado. */
  function quebrarEquilibrado(itens, limite, fs) {
    const base = quebrar(itens, limite, fs);
    if (base.length < 2) return base;
    let lo = 0;
    let hi = limite;
    for (let i = 0; i < 12; i++) {
      const meio = (lo + hi) / 2;
      if (quebrar(itens, meio, fs).length <= base.length) hi = meio;
      else lo = meio;
    }
    return quebrar(itens, hi, fs);
  }

  /** Um trecho (palavra ou pontuação colada): glifos com a variação lenta da mão e a caixa na tela. */
  function trecho(texto, xIni, xLinha, yLinha, fs, inclina, ar, sorte, altura) {
    const glifos = [];
    let x = xIni;
    for (const ch of texto) {
      // AR(1): a mão muda devagar de letra para letra.
      for (let c = 0; c < 4; c++) ar[c] = ar[c] * 0.45 + (sorte() * 2 - 1) * 0.55;
      const adv = (medir(ch) + APERTO) * fs;
      glifos.push({
        ch,
        x,
        y: yLinha + (x - xLinha) * inclina + ar[0] * VARIA.altura * fs,
        rot: ar[1] * VARIA.giro,
        esc: 1 + ar[2] * VARIA.tamanho,
        skew: INCLINACAO + ar[3] * VARIA.inclinacao,
        adv,
      });
      x += adv;
    }
    const yIni = yLinha + (xIni - xLinha) * inclina;
    const yFim = yLinha + (x - xLinha) * inclina;
    const x0 = Math.max(0, Math.floor(xIni - 0.12 * fs));
    const x1 = Math.min(U, Math.max(x0 + 1, Math.ceil(x + 0.2 * fs)));
    const topo = clamp(Math.floor(Math.min(yIni, yFim) - 1.3 * fs), 0, altura - 1);
    const base = clamp(Math.ceil(Math.max(yIni, yFim) + 0.5 * fs), topo + 1, altura);
    return {
      texto, glifos, fs, x0, x1, w: x1 - x0, topo, base, largura: x - xIni,
      fonte: `${PESO} ${fs.toFixed(2)}px ${FONTE}`,
      letras: glifos.length,
      estado: 0, gravado: 0, traco: -1, inicio: 0, dur: 0, tempos: null, ys: null,
    };
  }

  function compor(texto, o = {}) {
    larguras.clear(); // a fonte pode ter chegado depois da última medida
    const fsMax = Math.max(1, Math.round(o.fsMax ?? 0.1 * U));
    const piso = Math.max(1, Math.round(Math.min(o.fsMin ?? 0.028 * U, fsMax)));
    const larguraMax = o.larguraMax ?? LARGURA_UTIL * U;
    const alturaMax = o.alturaMax ?? 0.6 * U;
    const entrelinha = o.entrelinha ?? ENTRELINHA;
    const cortar = !!o.cortar;
    const cabe = (linhas, fs) => {
      // A frase dele muito longa pode descer além do meio; a dela, nunca.
      const limite = !cortar && fs <= 0.039 * U ? 1.44 * U : alturaMax;
      if ((linhas.length - 1) * fs * entrelinha + fs * 1.15 > limite) return false;
      return !cortar || linhas.every((l) => larguraDa(l, fs) <= larguraMax + 0.5);
    };

    let final = texto;
    let itens = itensDe(final);
    let fs = fsMax;
    let linhas;
    // O laço sempre anda pelo menos 1 px e para no menor corpo já arredondado.
    for (;;) {
      linhas = quebrarEquilibrado(itens, larguraMax, fs);
      if (cabe(linhas, fs) || fs <= piso) break;
      fs = Math.max(piso, Math.min(fs - 1, Math.round(fs * 0.94)));
    }
    // A frase dele sempre entra (o autor a mede); a dela só se couber.
    let ok = itens.length > 0 && (!cortar || cabe(linhas, fs));
    if (!ok && cortar && itens.length) {
      // Nem no menor corpo: os parágrafos viram uma linha corrida e, se ainda
      // não couber, sai a última palavra e entram reticências.
      const palavras = final.replace(/\n+/g, ' ').split(' ').filter(Boolean);
      let candidato = palavras.join(' ');
      for (;;) {
        itens = itensDe(candidato);
        linhas = quebrarEquilibrado(itens, larguraMax, fs);
        if (cabe(linhas, fs)) {
          ok = true;
          final = candidato;
          break;
        }
        if (palavras.length <= 1) break;
        palavras.pop();
        candidato = palavras.join(' ').replace(/[\s,;:.]+$/, '') + '...';
      }
    }

    const sorte = semente(sementeDoTexto(final));
    const n = linhas.length;
    const passo = fs * entrelinha;
    const base0 = o.alinhar === 'topo'
      ? (o.topo ?? 0) + fs * 0.95
      : (o.centro ?? 0.985 * U) - ((n - 1) * passo) / 2 + fs * 0.36;
    const topoFolha = Math.max(0, Math.floor(base0 - 1.45 * fs));
    const baseFolha = Math.min(2 * U, Math.ceil(base0 + (n - 1) * passo + 0.85 * fs));
    const altura = Math.max(1, baseFolha - topoFolha);
    const margem = o.margem ?? MARGEM_ESQ * U;
    const esp = medir(' ') * fs;
    const tracos = [];
    const ar = [0, 0, 0, 0]; // altura, giro, tamanho, inclinação
    if (ok) {
      linhas.forEach((linha, l) => {
        const inclina = -(0.01 + 0.006 * sorte()); // a linha sobe para a direita
        const xLinha = margem + (sorte() - 0.5) * 0.16 * fs;
        let x = xLinha;
        linha.forEach((it, k) => {
          const escala = 1 + (sorte() - 0.5) * 0.035;
          const yLinha = base0 + l * passo - topoFolha + (sorte() - 0.5) * 0.035 * fs;
          const partes = it.pont ? [[it.corpo, false], [it.pont, true]] : [[it.texto, false]];
          for (const [txt, colado] of partes) {
            const t = trecho(txt, x, xLinha, yLinha, fs * escala, inclina, ar, sorte, altura);
            t.colado = colado;
            t.inicioLinha = k === 0 && !colado;
            tracos.push(t);
            x += t.largura;
          }
          x += esp * (0.92 + 0.2 * sorte());
        });
      });
    }
    if (tracos.length) tracos[tracos.length - 1].ultimo = true;
    return { texto: final, fs, linhas: n, topoFolha, altura, tracos, sorte, cabe: ok && tracos.length > 0, duracao: 0 };
  }

  /* ---- desenho -------------------------------------------------------------- */

  /** Os glifos do trecho em (ox, oy); `estilo(g)` dá a cor de cada glifo (null pula o glifo). */
  function desenharPalavra(ctx, t, ox, oy, modo, estilo) {
    ctx.font = t.fonte;
    for (const g of t.glifos) {
      const cor = estilo ? estilo(g) : null;
      if (estilo && !cor) continue;
      ctx.setTransform(1, 0, 0, 1, ox + g.x, oy + g.y);
      ctx.rotate(g.rot);
      ctx.transform(1, 0, -g.skew, 1, 0, 0);
      ctx.scale(g.esc, g.esc);
      if (modo === 'stroke') {
        if (cor) ctx.strokeStyle = cor;
        ctx.strokeText(g.ch, 0, 0);
      } else {
        if (cor) ctx.fillStyle = cor;
        ctx.fillText(g.ch, 0, 0);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ---- leitura da tinta ------------------------------------------------------- */

  /** Lacunas por interpolação linear; as pontas copiam o vizinho. */
  function preencher(ys, padrao) {
    let ant = -1;
    for (let i = 0; i < ys.length; i++) {
      if (Number.isNaN(ys[i])) continue;
      for (let k = ant + 1; k < i; k++) ys[k] = ant < 0 ? ys[i] : lerp(ys[ant], ys[i], (k - ant) / (i - ant));
      ant = i;
    }
    if (ant < 0) ys.fill(padrao);
    else ys.fill(ys[ant], ant + 1);
  }

  function suavizar(ys, raio, desloc) {
    const saida = new Float32Array(ys.length);
    for (let i = 0; i < ys.length; i++) {
      let soma = 0;
      let n = 0;
      for (let k = Math.max(0, i - raio); k <= Math.min(ys.length - 1, i + raio); k++) {
        soma += ys[k];
        n++;
      }
      saida[i] = soma / n + desloc;
    }
    return saida;
  }

  /**
   * A palavra em preto num canvas auxiliar; o alfa é lido coluna a coluna. Em
   * cada coluna a ponta fica no trecho de tinta mais perto do da coluna anterior
   * (na primeira, o mais comprido). Guarda a altura da ponta e a tinta da coluna.
   */
  function lerTinta(t, espessuras) {
    const w = t.w;
    const h = Math.max(1, t.base - t.topo);
    aux.width = w;
    aux.height = h;
    cAux.fillStyle = '#000';
    desenharPalavra(cAux, t, -t.x0, -t.topo, 'fill');
    const dados = cAux.getImageData(0, 0, w, h).data;
    const ys = new Float32Array(w);
    const tinta = new Float32Array(w);
    let ultimo = -1;
    for (let c = 0; c < w; c++) {
      let ini = -1;
      let melhor = -1;
      let nota = Infinity;
      let soma = 0;
      for (let r = 0; r <= h; r++) {
        const dentro = r < h && dados[(r * w + c) * 4 + 3] > COBERTURA;
        if (dentro && ini < 0) ini = r;
        else if (!dentro && ini >= 0) {
          const comp = r - ini;
          const meio = (ini + r) / 2;
          soma += comp;
          espessuras.push(comp);
          const n = ultimo < 0 ? -comp : Math.abs(meio - ultimo);
          if (n < nota) {
            nota = n;
            melhor = meio;
          }
          ini = -1;
        }
      }
      tinta[c] = soma;
      ys[c] = melhor < 0 ? NaN : melhor;
      if (melhor >= 0) ultimo = melhor;
    }
    preencher(ys, h * 0.62);
    t.ys = suavizar(ys, Math.max(1, Math.round(t.fs * 0.045)), t.topo);
    t.tinta = tinta;
  }

  function mediana(lista) {
    if (!lista.length) return 0;
    const v = Float32Array.from(lista).sort();
    return v[v.length >> 1];
  }

  /* ---- o relógio da mão ------------------------------------------------------- */

  /** Gerador: cede a vez depois de compor e depois de cada palavra (getImageData custa). */
  function* planejar(texto, opcoes) {
    const p = compor(texto, opcoes);
    yield;
    const espessuras = [];
    for (const t of p.tracos) {
      lerTinta(t, espessuras);
      yield;
    }
    // Segunda passagem: a espessura que vale é a mediana dos trechos (a primeira é 0,075 do corpo).
    const espessura = Math.max(2, mediana(espessuras) || p.fs * 0.075);
    const ritmo = (reduzido ? 0.42 : 1) * tempo; // reduzido: mais rápida, não mais lenta
    let soma = 0;
    let letras = 0;
    for (const t of p.tracos) {
      // Fronteiras entre letras: a mão hesita um nada nelas.
      const bordas = t.glifos.slice(1).map((g) => Math.round(g.x - t.x0));
      t.esforco = new Float32Array(t.w);
      t.glifoDe = new Uint16Array(t.w);
      let g = 0;
      for (let c = 0; c < t.w; c++) {
        while (g < bordas.length && c >= bordas[g]) g++;
        t.glifoDe[c] = g;
        let d = Infinity;
        if (g > 0) d = c - bordas[g - 1];
        if (g < bordas.length) d = Math.min(d, bordas[g] - c);
        const dd = d / (t.fs * 0.05);
        const base = t.tinta[c] > 0 ? clamp(t.tinta[c] / espessura, 0.7, 9) : 0.45;
        t.esforco[c] = base * (1 + 0.9 * Math.exp(-dd * dd));
        soma += t.esforco[c];
      }
      letras += t.letras;
    }
    const porEsforco = soma > 0 ? (letras * CADENCIA * ritmo) / soma : 0;
    let relogio = 0;
    p.tracos.forEach((t, i) => {
      if (i > 0) {
        const antes = p.tracos[i - 1];
        let pausa;
        if (t.colado) pausa = t.ultimo ? 0.34 : 0.1; // a mão para antes da pontuação
        else {
          pausa = 0.1 + p.sorte() * 0.06;
          if (/[,;:]$/.test(antes.texto)) pausa += 0.28;
          if (/[.!?…]$/.test(antes.texto)) pausa += 0.42;
          if (t.inicioLinha) pausa += 0.22;
        }
        relogio += pausa * ritmo;
      }
      const pressa = 0.9 + p.sorte() * 0.22;
      t.tempos = new Float32Array(t.w);
      let acc = 0;
      for (let k = 0; k < t.w; k++) {
        const gi = t.glifoDe[k];
        const onda = 1 + 0.16 * Math.sin(k * 0.055 + 1.7 * gi) + 0.08 * Math.sin(k * 0.21 + gi);
        acc += t.esforco[k] * porEsforco * pressa * onda;
        t.tempos[k] = acc;
      }
      t.inicio = relogio;
      t.dur = acc;
      relogio += acc;
      t.esforco = null;
      t.glifoDe = null;
      t.tinta = null;
    });
    if (relogio > teto * ritmo) {
      // Só a letra dela tem teto: tudo encolhe na mesma proporção.
      const k = (teto * ritmo) / relogio;
      for (const t of p.tracos) {
        t.inicio *= k;
        t.dur *= k;
        for (let c = 0; c < t.tempos.length; c++) t.tempos[c] *= k;
      }
      relogio *= k;
    }
    p.duracao = relogio;
    tela.width = seca.width = U;
    tela.height = seca.height = p.altura;
    return p;
  }

  /** Planeja em fatias de 6 ms, cedendo a vez com setTimeout(0). Resolve o plano (ou null, se outro começou). */
  function prepararAosPoucos(texto, opcoes = {}) {
    const chave = `${texto}\u0000${JSON.stringify(opcoes)}`;
    if (plano?.chave === chave) return Promise.resolve(plano);
    const minha = ++geracao;
    const passos = planejar(texto, opcoes);
    return new Promise((resolve, reject) => {
      const fatia = () => {
        if (minha !== geracao) {
          resolve(null);
          return;
        }
        const ate = performance.now() + 6;
        try {
          for (;;) {
            const r = passos.next();
            if (r.done) {
              parar();
              plano = r.value;
              plano.chave = chave;
              resolve(plano);
              return;
            }
            if (performance.now() >= ate) break;
          }
        } catch (erro) {
          reject(erro);
          return;
        }
        setTimeout(fatia, 0);
      };
      fatia();
    });
  }

  /* ---- tempo e tinta molhada --------------------------------------------------- */

  /** Quantas colunas a ponta já passou em `tr` segundos do trecho. */
  function colunaNoTempo(t, tr) {
    const v = t.tempos;
    let lo = 0;
    let hi = v.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (v[m] <= tr) lo = m + 1;
      else hi = m;
    }
    return lo;
  }

  const tempoNaColuna = (t, c) => (c <= 0 ? 0 : t.tempos[Math.min(c, t.tempos.length) - 1]);
  const alturaDaPonta = (t, c) => t.ys[clamp(c, 0, t.ys.length - 1)];
  const umidade = (t, c, tr) => clamp(1 - (tr - tempoNaColuna(t, c)) / SECAGEM);

  /** Passa para a tela seca as colunas [gravado, ate) do trecho, na cor final. */
  function gravar(t, ate) {
    if (ate <= t.gravado) return;
    cSeca.save();
    cSeca.beginPath();
    cSeca.rect(t.x0 + t.gravado, 0, ate >= t.w ? U : ate - t.gravado, seca.height);
    cSeca.clip();
    cSeca.fillStyle = corSeca;
    desenharPalavra(cSeca, t, 0, 0, 'fill');
    cSeca.restore();
    t.gravado = ate;
  }

  /**
   * A parte molhada do trecho: do que ainda não secou até a ponta, com o bico
   * curvo apontando para a caneta, a cor de seca para fresca pela umidade e dois
   * contornos (a tinta molhada é mais gorda). A gota fica na ponta.
   */
  function desenharMolhada(t, tr) {
    const c = cTela;
    const fs = t.fs;
    const escrevendo = tr < t.dur;
    const arremate = escrevendo ? 0 : clamp((tr - t.dur) / ARREMATE);
    const col = escrevendo ? colunaNoTempo(t, tr) : t.w;
    const atraso = fs * (reduzido ? 0.04 : 0.13);
    const raio = fs * 0.055;
    const px = escrevendo ? t.x0 + col : t.x1 + (atraso + raio + 2) * arremate;
    const py = alturaDaPonta(t, col);
    const xa = t.x0 + t.gravado;
    if (px > xa) {
      const estilo = (g) => {
        const gx1 = g.x + g.adv * g.esc;
        if (gx1 + fs * 0.2 < xa || g.x - fs * 0.2 > px) return null;
        const grad = c.createLinearGradient(0, 0, Math.max(1, g.adv), 0);
        for (let k = 0; k <= 5; k++) {
          const coluna = Math.round(g.x + ((gx1 - g.x) * k) / 5) - t.x0;
          grad.addColorStop(k / 5, misturar(tinta, molhada, umidade(t, coluna, tr) ** 0.8));
        }
        return grad;
      };
      c.save();
      c.beginPath();
      if (arremate >= 1) c.rect(xa, t.topo, U - xa, t.base - t.topo);
      else {
        const xb = Math.max(xa, px - atraso);
        c.moveTo(xa, t.topo);
        c.lineTo(xb, t.topo);
        c.bezierCurveTo((xb + px) / 2 + raio, t.topo, px + raio, py - raio, px + raio * 0.3, py);
        c.bezierCurveTo(px + raio, py + raio, (xb + px) / 2 + raio, t.base, xb, t.base);
        c.lineTo(xa, t.base);
        c.closePath();
      }
      c.clip();
      desenharPalavra(c, t, 0, 0, 'fill', estilo);
      c.lineJoin = 'round';
      for (const [nivel, gordura] of [[0.55, 2 * GORDURA], [0.14, GORDURA]]) {
        const desde = Math.max(xa, t.x0 + colunaNoTempo(t, tr - (1 - nivel) * SECAGEM));
        if (desde >= px) continue;
        c.save();
        c.beginPath();
        c.rect(desde, t.topo, U - desde, t.base - t.topo);
        c.clip();
        c.lineWidth = 2 * gordura * fs;
        desenharPalavra(c, t, 0, 0, 'stroke', estilo);
        c.restore();
      }
      c.restore();
    }
    const viva = clamp(tr / 0.05) * (1 - arremate);
    if (!reduzido && viva > 0.02) {
      c.beginPath();
      c.arc(px, py, fs * 0.058 * viva, 0, Math.PI * 2);
      c.fillStyle = corFresca;
      c.fill();
    }
  }

  /* ---- o quadro ------------------------------------------------------------------ */

  function resolverAgora() {
    const r = resolver;
    resolver = null;
    r?.();
  }

  function passo(dt) {
    T += dt;
    const folga = 2;
    const sujas = [];
    let secas = 0;
    for (const t of plano.tracos) {
      if (T < t.inicio) break;
      if (t.estado === 2) {
        secas++;
        continue;
      }
      t.estado = 1;
      const tr = T - t.inicio;
      if (aoTraco && tr < t.dur) {
        const indice = Math.floor(clamp(tr / t.dur) * t.letras);
        while (t.traco < indice) {
          t.traco++;
          try {
            aoTraco(t.traco, t);
          } catch (erro) {
            console.error('[carta] aoTraco', erro);
          }
        }
      }
      const seco = tr - SECAGEM >= t.dur ? t.w : Math.min(t.w, colunaNoTempo(t, tr - SECAGEM));
      if (seco > t.gravado) gravar(t, seco);
      if (tr >= t.dur + ARREMATE + SECAGEM) {
        gravar(t, t.w);
        t.estado = 2;
        secas++;
      }
      const f = folga + t.fs * 0.25;
      sujas.push([Math.max(0, Math.floor(t.topo - f)), Math.min(tela.height, Math.ceil(t.base + f))]);
    }
    for (const [y0, y1] of juntar(sujas)) {
      const h = y1 - y0;
      if (h <= 0) continue;
      cTela.clearRect(0, y0, U, h);
      cTela.drawImage(seca, 0, y0, U, h, 0, y0, U, h);
      faixas.push([y0, y1]);
    }
    for (const t of plano.tracos) {
      if (T < t.inicio) break;
      if (t.estado === 1) desenharMolhada(t, T - t.inicio);
    }
    if (resolver && T >= fimEscrita + ARREMATE) resolverAgora();
    if (secas === plano.tracos.length) {
      ativo = false;
      resolverAgora();
    }
    return sujas.length > 0;
  }

  /** A frase inteira, seca, sem animação. */
  function completar() {
    if (plano) {
      for (const t of plano.tracos) {
        gravar(t, t.w);
        t.estado = 2;
      }
      cTela.clearRect(0, 0, U, tela.height);
      cTela.drawImage(seca, 0, 0);
      faixas.push([0, tela.height]);
    }
    ativo = false;
    resolverAgora();
  }

  function parar() {
    ativo = false;
    resolverAgora();
  }

  return {
    tela,
    get largura() {
      return U;
    },
    get plano() {
      return plano;
    },
    get ativo() {
      return ativo;
    },
    /** As faixas [y0, y1] da tela que mudaram desde a última chamada, juntas. */
    tirarFaixas() {
      const juntas = juntar(faixas).filter(([a, b]) => b > a);
      faixas.length = 0;
      return juntas;
    },
    prepararAosPoucos,
    /** Começa a escrever o plano pronto; resolve quando o último trecho acaba (+ 0,09 s). */
    iniciar(opcoes = {}) {
      resolverAgora();
      if (!plano?.tracos.length) return Promise.resolve();
      T = 0;
      falhas = 0;
      aoTraco = typeof opcoes.aoTraco === 'function' ? opcoes.aoTraco : null;
      for (const t of plano.tracos) {
        t.estado = 0;
        t.gravado = 0;
        t.traco = -1;
      }
      const ultimo = plano.tracos[plano.tracos.length - 1];
      fimEscrita = ultimo.inicio + ultimo.dur;
      cTela.clearRect(0, 0, U, tela.height);
      cSeca.clearRect(0, 0, U, seca.height);
      faixas.push([0, tela.height]);
      ativo = true;
      return new Promise((resolve) => {
        resolver = resolve;
      });
    },
    parar,
    /** Avança `dt` segundos; devolve se a tela mudou. Um erro entrega a frase inteira, seca. */
    avancar(dt) {
      if (!ativo || !plano) return false;
      try {
        return passo(Math.max(0, dt || 0));
      } catch (erro) {
        console.error('[carta] a escrita falhou; a frase entra inteira', erro);
        if (++falhas > 1) {
          ativo = false;
          resolverAgora();
          return false;
        }
        try {
          completar();
        } catch (erro2) {
          console.error('[carta] completar a escrita', erro2);
          ativo = false;
          resolverAgora();
        }
        return true;
      }
    },
  };
}

/* ---- a letra dela: o mesmo motor, outra instância ----------------------------- */

/**
 * Segunda instância do motor, ligada à escrita dele (mesma largura; a faixa vem
 * do plano dele), com espelho próprio e fila: uma composição por vez.
 */
function criarLetraDela({ amb, escritaDele, mostrar, esconder, liberar }) {
  const U = escritaDele.largura;
  const escrita = criarEscrita({ amb, largura: U, tinta: DELA.tinta, molhada: DELA.molhada, tempo: DELA.tempo, teto: DELA.teto });
  const espelho = espelhoParaLeitor();
  let vez = 0;
  let tem = false;
  let fila = Promise.resolve();

  function apagar() {
    vez++;
    tem = false;
    escrita.parar();
    esconder();
    anunciar(espelho, '');
  }

  async function escrever(texto, opcoes = {}) {
    apagar();
    const minha = vez;
    const limpo = textoDela(texto);
    if (!limpo) return;
    tem = true; // desde já a pétala não pousa no canto dela
    const composicao = fila.then(async () => {
      if (minha !== vez) return null;
      await fontePronta(limpo);
      if (minha !== vez) return null;
      const [plano] = await Promise.all([
        escrita.prepararAosPoucos(limpo, faixaDela(U, escritaDele.plano)),
        Promise.resolve().then(liberar).catch(() => {}),
      ]);
      return plano;
    });
    fila = composicao.catch(() => null);
    let plano = null;
    try {
      plano = await composicao;
    } catch (erro) {
      // Sem plano a pétala volta a poder pousar no canto dela.
      console.error('[carta] compor a letra dela', erro);
      if (minha === vez) tem = false;
      return;
    }
    if (minha !== vez) return;
    if (!plano?.cabe || !plano.tracos.length) {
      tem = false;
      return;
    }
    mostrar(plano);
    anunciar(espelho, plano.texto);
    await escrita.iniciar(opcoes);
  }

  return {
    escrita,
    escrever,
    apagar,
    get tem() {
      return tem;
    },
    dispose() {
      apagar();
      espelho.remove();
    },
  };
}

/** A frase dele e a letra dela, iguais nas duas versões; só o jeito de mostrar muda. */
function criarEscritas({ amb, U, ligarDele, mostrarDela, esconderDela, liberar }) {
  const escrita = criarEscrita({ amb, largura: U });
  const espelho = espelhoParaLeitor();
  const dela = criarLetraDela({ amb, escritaDele: escrita, mostrar: mostrarDela, esconder: esconderDela, liberar });
  let pronta = null; // { frase, promessa }
  let fim = false;

  const limpar = (texto) => String(texto ?? '').replace(/\r/g, '').trim();

  /** Compõe a frase (fonte com teto de 1,5 s, fatias de 6 ms) e liga a tinta. A mesma frase sai na hora. */
  function preparar(texto) {
    const frase = limpar(texto);
    if (pronta?.frase === frase) return pronta.promessa;
    const promessa = fontePronta(frase)
      .then(() => escrita.prepararAosPoucos(frase))
      .then((plano) => {
        if (plano && !fim && pronta?.promessa === promessa) ligarDele(plano);
        return plano;
      });
    pronta = { frase, promessa };
    promessa.catch(() => {
      if (pronta?.promessa === promessa) pronta = null;
    });
    return promessa;
  }

  async function escrever(texto, opcoes = {}) {
    const frase = limpar(texto);
    if (!frase || fim) return;
    anunciar(espelho, frase); // a frase inteira, uma vez; a tinta é só imagem
    let plano = null;
    try {
      plano = await preparar(frase);
    } catch (erro) {
      // Sem plano não há tinta; a cena segue (o leitor de tela já tem a frase).
      console.error('[carta] compor a frase', erro);
      return;
    }
    if (fim || !plano?.tracos.length) return;
    await escrita.iniciar(opcoes);
  }

  return {
    escrita,
    dela,
    preparar,
    escrever,
    dispose() {
      fim = true;
      escrita.parar();
      dela.dispose();
      espelho.remove();
    },
  };
}

/* ---- pétalas: um só ritmo para as duas versões ----------------------------------- */

/**
 * Espera 4,5 s; depois um pouso por vez. Os dois primeiros descansam 19 s, os
 * outros de 14 a 30 s; entre pousos, 15 s depois do primeiro e 16 a 38 s depois.
 * O canto da letra dela é pulado, sem espera, enquanto ela estiver na folha.
 */
async function vidaDasPetalas({ acabou, temDela, ciclo }) {
  await espera(4500);
  for (let i = 0; !acabou(); i++) {
    const pouso = POUSOS[i % POUSOS.length];
    if (pouso.dela && temDela()) continue;
    await ciclo(pouso, i < 2 ? 19 : 14 + Math.random() * 16);
    if (acabou()) return;
    await espera(i === 0 ? 15000 : 16000 + Math.random() * 22000);
  }
}

/* ---- geometria e desenho -------------------------------------------------------------- */

/** As 39 alturas (do topo, em m) das fileiras da malha, mais densas nos vincos. */
function fileiras() {
  const s = [];
  const trechos = [[0, 0.292, 7], [0.292, 0.308, 8], [0.308, 0.583, 6], [0.583, 0.617, 10], [0.617, ALTURA, 7]];
  for (const [a, b, n] of trechos) for (let i = 0; i < n; i++) s.push(a + ((b - a) * i) / n);
  s.push(ALTURA);
  return s;
}

/** Catmull-Rom convertido em Bézier: o path do fio da versão DOM. */
function caminhoSuave(p) {
  const f = (v) => Math.round(v * 10) / 10;
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)];
    const b = p[i];
    const c = p[i + 1];
    const e = p[Math.min(p.length - 1, i + 2)];
    d += `C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} `
      + `${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`;
  }
  return d;
}

/* ---- a fábrica ------------------------------------------------------------------------ */

/** A folha final: 3D dentro do mundo, ou DOM em CSS 3D sem WebGL. */
export function criarFolha(mundo) {
  return mundo?.ok ? criarFolha3D(mundo) : criarFolhaLeve(mundo);
}

/* ============================================================================
   A FOLHA 3D
   ============================================================================
   Cores em sRGB cru (sem colorspace_fragment), como o fio: o papel sai #fbf7f0
   na tela e a tinta sai com a cor do canvas.
   ========================================================================== */

const VERTICE_PAPEL = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENTO_PAPEL = /* glsl */ `
uniform sampler2D uTinta;
uniform sampler2D uTinta2;
uniform vec4 uFaixa;
uniform vec4 uFaixa2;
uniform float uTemTinta;
uniform float uTemTinta2;
uniform float uFechado;
uniform vec2 uTamanho;
uniform float uFino;
varying vec2 vUv;
varying vec3 vNormal;

float acaso(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float ruido(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(acaso(i), acaso(i + vec2(1.0, 0.0)), f.x), mix(acaso(i + vec2(0.0, 1.0)), acaso(i + vec2(1.0, 1.0)), f.x), f.y);
}
// A tinta de uma letra: textura pré-multiplicada, só dentro da faixa dela.
vec4 tintaNa(sampler2D t, vec4 faixa) {
  vec2 q = (vUv - faixa.xy) / faixa.zw;
  float dentro = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
  return texture2D(t, clamp(q, 0.0, 1.0)) * dentro;
}
void main() {
  vec3 cor = vec3(0.984, 0.969, 0.941); // #fbf7f0 (--papel)
  float s = (1.0 - vUv.y) * uTamanho.y; // m, do topo
  float x = (vUv.x - 0.5) * uTamanho.x;
  float frente = gl_FrontFacing ? 1.0 : 0.0;

  // Fibra: dois fios cruzados de ruído, grão e mancha (nada no nível baixo).
  float fibra = 0.5 * (ruido(vUv * vec2(20.0, 160.0)) + ruido(vUv * vec2(160.0, 20.0)));
  float grao = acaso(floor(vUv * vec2(230.0, 460.0)));
  float mancha = ruido(vUv * 4.2);
  cor *= 1.0 + uFino * ((fibra - 0.5) * 0.026 + (grao - 0.5) * 0.018 + (mancha - 0.5) * 0.028);
  fibra = mix(0.5, fibra, uFino);

  // Luz do alto e da esquerda; o verso nunca fica escuro demais.
  vec3 n = normalize(vNormal) * (frente * 2.0 - 1.0);
  float luz = clamp(0.995 + (dot(n, normalize(vec3(-0.34, 0.62, 0.71))) - 0.71) * 0.18, 0.92, 1.0);
  luz = mix(max(luz, 0.945), luz, frente);

  // As abas sombreiam o meio, mais largo quanto mais fechadas.
  float terco = uTamanho.y / 3.0;
  float meio = step(terco, s) * step(s, 2.0 * terco);
  float y = abs(s - uTamanho.y * 0.5);
  luz *= 1.0 - 0.17 * meio * exp(-max(0.0, uTamanho.y / 6.0 - y) / (0.02 + 0.24 * uFechado));

  // Vincos: risco de 1 px, penumbra e realce do lado da luz.
  float dC = s - terco;
  float dB = s - 2.0 * terco;
  float px = max(fwidth(s), 1e-6);
  float risco = max(1.0 - smoothstep(0.4, 1.4, abs(dC) / px), 1.0 - smoothstep(0.4, 1.4, abs(dB) / px));
  float pC = exp(-abs(dC) / 0.011);
  float pB = exp(-abs(dB) / 0.011);
  luz *= 1.0 - 0.06 * risco - 0.016 * (pC + pB);
  luz += 0.014 * (pC * step(dC, 0.0) + pB * step(dB, 0.0));

  // Borda: 3,5% mais escura nos últimos 3,5 mm.
  float borda = min(min(s, uTamanho.y - s), uTamanho.x * 0.5 - abs(x));
  luz *= 1.0 - 0.035 * (1.0 - smoothstep(0.0, 0.0035, borda));
  cor *= luz;

  // A tinta pega no papel conforme a fibra; só na face de dentro.
  float pega = 0.94 + 0.12 * (fibra - 0.5);
  vec4 t1 = tintaNa(uTinta, uFaixa) * uTemTinta * frente;
  cor = cor * (1.0 - t1.a * pega) + t1.rgb * pega * luz;
  vec4 t2 = tintaNa(uTinta2, uFaixa2) * uTemTinta2 * frente;
  cor = cor * (1.0 - t2.a * pega) + t2.rgb * pega * luz;
  gl_FragColor = vec4(cor, 1.0);
}
`;

const VERTICE_PLANO = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// A sombra atrás: um retângulo macio do tamanho do que está aberto.
const FRAGMENTO_SOMBRA = /* glsl */ `
uniform vec2 uMeio;
uniform vec2 uCentro;
uniform float uMacio;
uniform float uForca;
varying vec2 vPos;
void main() {
  vec2 d = abs(vPos - uCentro) - uMeio;
  float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  float a = 1.0 - smoothstep(-0.35 * uMacio, uMacio, dist);
  gl_FragColor = vec4(0.165, 0.106, 0.133, a * a * uForca);
}
`;

// A mancha de sombra da pétala no papel.
const FRAGMENTO_MANCHA = /* glsl */ `
uniform float uForca;
uniform float uRaio;
varying vec2 vPos;
void main() {
  float a = 1.0 - smoothstep(0.15, 1.0, length(vPos) / uRaio);
  gl_FragColor = vec4(0.165, 0.106, 0.133, a * a * uForca);
}
`;

const VERTICE_SOMBRA_FIO = /* glsl */ `
attribute float aU;
attribute float aLado;
varying float vU;
varying float vLado;
void main() {
  vU = aU;
  vLado = aLado;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// A sombra do fio no papel acompanha o progresso dele.
const FRAGMENTO_SOMBRA_FIO = /* glsl */ `
uniform float uProgresso;
uniform float uForca;
varying float vU;
varying float vLado;
void main() {
  if (vU > uProgresso) discard;
  float a = 1.0 - vLado * vLado;
  gl_FragColor = vec4(0.165, 0.106, 0.133, a * a * uForca);
}
`;

const VERTICE_PETALA = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Pétala de sakura: fina na base, larga em cima, com o entalhe na ponta.
const FRAGMENTO_PETALA = /* glsl */ `
uniform vec3 uCor1;
uniform vec3 uCor2;
uniform float uTom;
uniform float uOpacidade;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float t = clamp((p.y + 1.0) * 0.5, 0.0, 1.0);
  float meia = 0.92 * sin(t * 2.55) + 0.04;
  float corte = 1.0 - 0.2 * (1.0 - smoothstep(0.0, 0.32, abs(p.x)));
  float d = max(abs(p.x) - meia, p.y - corte);
  float aa = max(fwidth(d) * 1.5, 1e-4);
  float a = (1.0 - smoothstep(-aa, aa, d)) * uOpacidade;
  if (a < 0.003) discard;
  vec3 cor = mix(uCor1, uCor2, smoothstep(-0.9, 0.7, p.y)) * (0.9 + 0.16 * uTom);
  cor *= 1.0 - 0.12 * (1.0 - smoothstep(0.0, 0.08, abs(p.x))) * (1.0 - t);
  gl_FragColor = vec4(cor, a);
}
`;

function criarFolha3D(mundo) {
  const THREE = mundo.THREE;
  const gsap = window.gsap;
  const amb = mundo.amb || {};
  const R = !!amb.reduzido;
  const baixo = amb.nivel === 'baixo';
  // px de canvas por largura de folha: 1536 só em tela 3× no nível alto.
  const U = baixo ? 768 : amb.nivel === 'alto' && (window.devicePixelRatio || 1) > 2 ? 1536 : 1024;
  const renderer = mundo.renderer;
  const gl = renderer?.getContext?.();
  const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  const animacoes = [];
  const guardar = (a) => {
    animacoes.push(a);
    return a;
  };

  const grupo = new THREE.Group();
  grupo.name = 'folha';
  grupo.visible = false; // só entra na cena em mostrar()
  const interno = new THREE.Group(); // o que flutua
  grupo.add(interno);

  /* ---- malha: uma só, dobrada pelo perfil ------------------------------------ */

  const S = fileiras();
  const N = S.length;
  const V = COLUNAS + 1;
  const posicoes = new Float32Array(N * V * 3);
  const normais = new Float32Array(N * V * 3);
  const uvs = new Float32Array(N * V * 2);
  const indices = [];
  for (let r = 0; r < N; r++) {
    for (let j = 0; j < V; j++) {
      const i = r * V + j;
      posicoes[i * 3] = (j / COLUNAS - 0.5) * LARGURA;
      uvs[i * 2] = j / COLUNAS;
      uvs[i * 2 + 1] = 1 - S[r] / ALTURA;
      if (r < N - 1 && j < COLUNAS) indices.push(i, i + V, i + 1, i + V, i + V + 1, i + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  const atrPos = new THREE.BufferAttribute(posicoes, 3).setUsage(THREE.DynamicDrawUsage);
  const atrNor = new THREE.BufferAttribute(normais, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', atrPos);
  geo.setAttribute('normal', atrNor);
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const vazia = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  vazia.needsUpdate = true;
  const u = {
    uTinta: { value: vazia },
    uFaixa: { value: new THREE.Vector4(0, 0, 1, 1) },
    uTemTinta: { value: 0 },
    uTinta2: { value: vazia },
    uFaixa2: { value: new THREE.Vector4(0, 0, 1, 1) },
    uTemTinta2: { value: 0 },
    uFechado: { value: 1 },
    uTamanho: { value: new THREE.Vector2(LARGURA, ALTURA) },
    uFino: { value: baixo ? 0 : 1 },
  };
  const papel = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: VERTICE_PAPEL,
    fragmentShader: FRAGMENTO_PAPEL,
    side: THREE.DoubleSide,
  }));
  // Opaco e primeiro: a profundidade dele descarta a alameda atrás. Se virar
  // transparente, a alameda aparece por cima.
  papel.renderOrder = -20;
  papel.frustumCulled = false;
  interno.add(papel);

  const uSombra = {
    uMeio: { value: new THREE.Vector2(0.225, 0.15) },
    uCentro: { value: new THREE.Vector2(0.008, -0.022) },
    uMacio: { value: 0.07 },
    uForca: { value: 0 },
  };
  const sombra = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.4), new THREE.ShaderMaterial({
    uniforms: uSombra,
    vertexShader: VERTICE_PLANO,
    fragmentShader: FRAGMENTO_SOMBRA,
    transparent: true,
    depthWrite: false,
  }));
  sombra.position.z = -0.03;
  sombra.renderOrder = 1;
  interno.add(sombra);

  const geoPetala = new THREE.PlaneGeometry(1, 1.2, 6, 6);
  const pp = geoPetala.attributes.position;
  for (let i = 0; i < pp.count; i++) pp.setZ(i, (pp.getX(i) ** 2 - 0.08) * 0.9); // leve concha
  const uPetala = {
    uCor1: { value: new THREE.Vector3(0.702, 0.071, 0.227) }, // #b3123a
    uCor2: { value: new THREE.Vector3(0.843, 0.149, 0.31) }, // #d7264f
    uTom: { value: 0.5 },
    uOpacidade: { value: 0 },
  };
  const petala = new THREE.Mesh(geoPetala, new THREE.ShaderMaterial({
    uniforms: uPetala,
    vertexShader: VERTICE_PETALA,
    fragmentShader: FRAGMENTO_PETALA,
    transparent: true,
    depthWrite: false,
    // Ela vem sempre da frente: sem teste de profundidade a concha e a
    // inclinação nunca a enterram no papel.
    depthTest: false,
    side: THREE.DoubleSide,
  }));
  petala.scale.setScalar(0.062);
  petala.renderOrder = 4;
  petala.visible = false;
  interno.add(petala);
  const uMancha = { uForca: { value: 0 }, uRaio: { value: 0.0425 } };
  const mancha = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.085), new THREE.ShaderMaterial({
    uniforms: uMancha,
    vertexShader: VERTICE_PLANO,
    fragmentShader: FRAGMENTO_MANCHA,
    transparent: true,
    depthWrite: false,
  }));
  mancha.renderOrder = 2;
  mancha.visible = false;
  interno.add(mancha);

  /* ---- dobras ------------------------------------------------------------------ */

  const dobra = { cima: FECHADA_CIMA, baixo: FECHADA_BAIXO };
  const antes = { cima: dobra.cima, baixo: dobra.baixo };
  const cede = { cima: 0, baixo: 0 }; // a ponta livre da aba se atrasa enquanto ela gira
  const Y = new Float32Array(N);
  const Z = new Float32Array(N);
  const NY = new Float32Array(N);
  const NZ = new Float32Array(N);
  const ancora = S.reduce((m, s, i) => (Math.abs(s - ALTURA / 2) < Math.abs(S[m] - ALTURA / 2) ? i : m), 0);
  let sujo = true;

  const anguloBaixo = (s) => dobra.baixo * suave((s - (VINCO_BAIXO - RAIO_BAIXO)) / (2 * RAIO_BAIXO))
    + cede.baixo * clamp((s - VINCO_BAIXO) / (ALTURA - VINCO_BAIXO)) ** 1.4;
  const anguloCima = (s) => dobra.cima * suave((VINCO_CIMA + RAIO_CIMA - s) / (2 * RAIO_CIMA))
    + cede.cima * clamp((VINCO_CIMA - s) / VINCO_CIMA) ** 1.4;

  function refazerMalha() {
    Y[ancora] = ALTURA / 2 - S[ancora];
    Z[ancora] = 0;
    NY[ancora] = 0;
    NZ[ancora] = 1;
    for (let r = ancora + 1; r < N; r++) {
      const ds = S[r] - S[r - 1];
      const a = anguloBaixo((S[r] + S[r - 1]) / 2);
      Y[r] = Y[r - 1] - Math.cos(a) * ds;
      Z[r] = Z[r - 1] + Math.sin(a) * ds;
      const an = anguloBaixo(S[r]);
      NY[r] = Math.sin(an);
      NZ[r] = Math.cos(an);
    }
    for (let r = ancora - 1; r >= 0; r--) {
      const ds = S[r + 1] - S[r];
      const a = anguloCima((S[r] + S[r + 1]) / 2);
      Y[r] = Y[r + 1] + Math.cos(a) * ds;
      Z[r] = Z[r + 1] + Math.sin(a) * ds;
      const an = anguloCima(S[r]);
      NY[r] = -Math.sin(an);
      NZ[r] = Math.cos(an);
    }
    for (let r = 0; r < N; r++) {
      for (let j = 0; j < V; j++) {
        const i = (r * V + j) * 3;
        posicoes[i + 1] = Y[r];
        posicoes[i + 2] = Z[r];
        normais[i + 1] = NY[r];
        normais[i + 2] = NZ[r];
      }
    }
    atrPos.needsUpdate = true;
    atrNor.needsUpdate = true;
    // A sombra atrás tem o tamanho do que está aberto.
    const topo = 0.15 + 0.3 * Math.max(0, Math.cos(dobra.cima));
    const fundo = -0.15 - 0.3 * Math.max(0, Math.cos(dobra.baixo));
    uSombra.uMeio.value.set(0.225, (topo - fundo) / 2);
    uSombra.uCentro.value.set(0.008, (topo + fundo) / 2 - 0.022);
    u.uFechado.value = clamp(dobra.cima / Math.PI); // as sombras das abas no shader dependem disto
    sujo = false;
  }
  refazerMalha();

  /** O ponto do papel em (x, s), `acima` metros pela normal; fora da folha, segue o último segmento. */
  function superficie(x, s, acima = 0, alvo = new THREE.Vector3(), normal = null) {
    let r = 0;
    while (r < N - 2 && S[r + 1] < s) r++;
    const k = (s - S[r]) / (S[r + 1] - S[r]);
    const kn = clamp(k);
    let ny = lerp(NY[r], NY[r + 1], kn);
    let nz = lerp(NZ[r], NZ[r + 1], kn);
    const l = Math.hypot(ny, nz) || 1;
    ny /= l;
    nz /= l;
    alvo.set(x, lerp(Y[r], Y[r + 1], k) + ny * acima, lerp(Z[r], Z[r + 1], k) + nz * acima);
    normal?.set(0, ny, nz);
    return alvo;
  }

  /* ---- tinta: textura e subida parcial ------------------------------------------- */

  const telasFaixa = new Map(); // altura → canvas auxiliar da subida parcial
  let quadros = 0;
  const blocos = {
    dele: { escrita: null, textura: null, tinta: 'uTinta', faixa: 'uFaixa', tem: 'uTemTinta' },
    dela: { escrita: null, textura: null, tinta: 'uTinta2', faixa: 'uFaixa2', tem: 'uTemTinta2' },
  };

  /** Uma textura nova sobre a tela (o tamanho muda a cada plano). Supõe planejar já feito. */
  function ligarTextura(bloco, plano) {
    bloco.textura?.dispose();
    const tex = new THREE.CanvasTexture(bloco.escrita.tela);
    tex.premultiplyAlpha = true;
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    if (baixo) {
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
    } else {
      tex.anisotropy = Math.min(4, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    }
    bloco.textura = tex;
    u[bloco.tinta].value = tex;
    const total = 2 * U;
    u[bloco.faixa].value.set(0, 1 - plano.topoFolha / total - plano.altura / total, 1, plano.altura / total);
    bloco.escrita.tirarFaixas(); // nada de faixa antiga
  }

  /**
   * Sobe só as faixas que mudaram (tirou 68% dos pixels copiados). Upload
   * inteiro se não houver WebGL2, se forem mais de quatro faixas, se uma passar
   * de meia altura ou se a textura ainda não subiu uma vez.
   */
  function subirTinta(bloco) {
    const faixas = bloco.escrita.tirarFaixas();
    const tex = bloco.textura;
    if (!faixas.length || !tex) return;
    const alt = bloco.escrita.tela.height;
    const props = renderer?.properties?.get?.(tex);
    const parcial = webgl2 && props?.__webglTexture && props.__version === tex.version
      && faixas.length <= 4 && faixas.every(([a, b]) => b - a <= alt / 2);
    if (!parcial) {
      tex.needsUpdate = true;
      return;
    }
    try {
      renderer.state.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      for (const [a0, b0] of faixas) {
        // Alturas em degraus de 32 px: poucas telas auxiliares, e não uma por
        // palavra (cada corpo de palavra muda a altura da faixa em alguns px).
        const h = Math.min(alt, Math.ceil((b0 - a0) / 32) * 32);
        const b = Math.min(alt, a0 + h);
        const a = b - h;
        let tela = telasFaixa.get(h);
        if (!tela) {
          tela = document.createElement('canvas');
          tela.width = U;
          tela.height = h;
          telasFaixa.set(h, tela);
        }
        const c = tela.getContext('2d');
        c.clearRect(0, 0, U, h);
        c.drawImage(bloco.escrita.tela, 0, a, U, h, 0, 0, U, h);
        // flipY: a linha a da tela vira a linha alt − b da textura.
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, alt - b, gl.RGBA, gl.UNSIGNED_BYTE, tela);
      }
      if (tex.generateMipmaps && tex.minFilter !== THREE.LinearFilter && tex.minFilter !== THREE.NearestFilter) gl.generateMipmap(gl.TEXTURE_2D);
    } catch (erro) {
      console.error('[carta] subir a tinta', erro);
      tex.needsUpdate = true;
    }
  }

  function avancarBloco(bloco, passo) {
    const e = bloco.escrita;
    if (!e?.ativo) return;
    const mudou = e.avancar(passo);
    if (!e.ativo) {
      // Acabou: uma subida inteira e as telas auxiliares vão embora.
      e.tirarFaixas();
      if (bloco.textura) bloco.textura.needsUpdate = true;
      telasFaixa.clear();
      return;
    }
    if (mudou && (!baixo || quadros % 2 === 0)) subirTinta(bloco);
  }

  /* ---- estado e pose ------------------------------------------------------------- */

  const origem = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), escala: 0.72, definida: false };
  const leitura = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), distancia: 1 };
  const viagem = { p: 0, ativa: false };
  const flutua = { x: 0, y: 0, forca: 0 };
  const recuo = { z: 0 };
  const fioEstado = { p: 0 };
  let margemFim = 0;
  let noLugar = false;
  let mostrada = false;
  let descartada = false;
  let saiu = false;
  let vivendo = false;
  let fio = null;
  let sombraFio = null;

  const tangente = () => Math.tan(THREE.MathUtils.degToRad(mundo.camera?.fov || 50) / 2);

  /** Distância em que a folha inteira cabe na tela com a margem do fim. */
  function medirLeitura() {
    const tg = tangente();
    const largura = mundo.tamanho?.largura || innerWidth;
    const altura = mundo.tamanho?.altura || innerHeight;
    const fracao = altura < TELA_BAIXA ? 0.9 : Math.min(0.8, 1 - (2 * margemFim) / altura);
    const d = Math.max(ALTURA / (2 * tg * fracao), LARGURA / (2 * tg * (largura / altura) * 0.86));
    const rig = mundo.rig?.position || { x: 0, z: 0 };
    leitura.distancia = d;
    leitura.pos.set(rig.x, ALTURA_OLHOS, rig.z - d);
    if (mostrada) {
      mundo.petalas?.definirFoco?.(d);
      mundo.alameda?.afastar?.(d + 0.25); // as árvores não atravessam a folha
    }
    return d;
  }
  medirLeitura();

  function aplicarViagem(p) {
    grupo.position.lerpVectors(origem.pos, leitura.pos, p);
    if (!R) grupo.position.y += Math.sin(p * Math.PI) * 0.035; // um arco de 3,5 cm
    grupo.quaternion.slerpQuaternions(origem.quat, leitura.quat, p);
    grupo.scale.setScalar(lerp(origem.escala, 1, p));
  }

  function mostrar() {
    if (descartada) return;
    if (!grupo.parent) mundo.cena.add(grupo);
    grupo.visible = true;
    if (!mostrada) {
      mostrada = true;
      medirLeitura();
    }
  }

  const pararRedim = mundo.aoRedimensionar?.(() => {
    if (descartada) return;
    medirLeitura();
    if (viagem.ativa || noLugar) aplicarViagem(viagem.p);
  });

  /* ---- a escrita ---------------------------------------------------------------- */

  const comum = criarEscritas({
    amb,
    U,
    ligarDele: (plano) => {
      ligarTextura(blocos.dele, plano);
      u.uTemTinta.value = 1;
    },
    mostrarDela: (plano) => {
      ligarTextura(blocos.dela, plano);
      u.uTemTinta2.value = 1;
    },
    esconderDela: () => {
      u.uTemTinta2.value = 0;
    },
    liberar: () => levantarPetala(),
  });
  blocos.dele.escrita = comum.escrita;
  blocos.dela.escrita = comum.dela.escrita;

  /* ---- pétalas ---------------------------------------------------------------- */

  const alvoP = new THREE.Vector3();
  const normalP = new THREE.Vector3();
  const saidaP = new THREE.Vector3();
  const manchaAlvo = new THREE.Vector3();
  const manchaSaida = new THREE.Vector3();
  const deitada = new THREE.Euler();
  let pousando = null;
  let tlPetala = null;
  let fimPetala = () => {};

  /** Um pouso inteiro: cai em 4,2 s, descansa, desliza até a borda e cai (5,0 s). */
  function cicloPetala(pouso, descanso) {
    if (descartada || saiu) return Promise.resolve();
    return new Promise((resolve) => {
      let feito = false;
      fimPetala = () => {
        if (feito) return;
        feito = true;
        petala.visible = false;
        mancha.visible = false;
        pousando = null;
        tlPetala = null;
        resolve();
      };
      pousando = pouso;
      const lado = Math.sign(pouso.x) || 1;
      superficie(pouso.x * LARGURA, pouso.s * ALTURA, 0.004, alvoP, normalP);
      superficie(pouso.x * LARGURA, pouso.s * ALTURA, 0.0015, manchaAlvo);
      const ex = (pouso.x + pouso.sai[0]) * LARGURA;
      const es = (pouso.s + pouso.sai[1]) * ALTURA;
      superficie(ex, es, 0.004, saidaP);
      superficie(ex, es, 0.0015, manchaSaida);
      const deita = Math.atan2(-normalP.y, normalP.z); // a inclinação do papel ali
      deitada.set(deita - 0.1, 0.12, pouso.giro);
      mancha.position.copy(manchaAlvo);
      mancha.rotation.set(deita, 0, pouso.giro);
      uPetala.uTom.value = Math.random();
      uPetala.uOpacidade.value = 0;
      uMancha.uForca.value = 0;
      petala.visible = true;
      mancha.visible = true;
      const tl = guardar(gsap.timeline({ onComplete: () => fimPetala() }));
      tlPetala = tl;

      if (R) {
        // Reduzido: só opacidade, sem movimento.
        petala.position.copy(alvoP);
        petala.rotation.copy(deitada);
        tl.to(uPetala.uOpacidade, { value: 1, duration: 1.4 }, 0)
          .to(uMancha.uForca, { value: 0.2, duration: 1.4 }, 0)
          .to(uPetala.uOpacidade, { value: 0, duration: 1.4 }, 1.4 + descanso)
          .to(uMancha.uForca, { value: 0, duration: 1.4 }, 1.4 + descanso);
        return;
      }

      const queda = { e: 0 };
      const posar = () => {
        const e = queda.e;
        const resto = 1 - e;
        petala.position.set(
          alvoP.x + lado * 0.2 * resto + Math.sin(e * 9.5) * 0.07 * resto,
          alvoP.y + 0.62 * resto,
          alvoP.z + 0.3 * resto + Math.sin(e * 6 + 1) * 0.03 * resto,
        );
        petala.rotation.set(
          deitada.x + resto * resto * 5.2 + Math.sin(e * 11) * 0.5 * resto,
          deitada.y + resto * 3.1,
          deitada.z + resto * 2.4 * lado,
        );
        uPetala.uOpacidade.value = clamp(5 * e);
        uMancha.uForca.value = 0.2 * clamp((e - 0.72) / 0.28) ** 2;
      };
      posar();
      const s0 = 4.2 + descanso;
      const desliza = { k: 0 };
      const cai = { k: 0 };
      tl.to(queda, { e: 1, duration: 4.2, ease: 'sine.out', onUpdate: posar }, 0)
        .to(desliza, {
          k: 1,
          duration: 2.6,
          ease: 'power2.in',
          onUpdate: () => {
            petala.position.lerpVectors(alvoP, saidaP, desliza.k);
            petala.rotation.z = deitada.z + lado * 0.5 * desliza.k;
            mancha.position.lerpVectors(manchaAlvo, manchaSaida, desliza.k);
          },
        }, s0)
        .to(uMancha.uForca, { value: 0, duration: 0.5 }, s0 + 2.3)
        .to(cai, {
          k: 1,
          duration: 2.4,
          ease: 'power1.in',
          onUpdate: () => {
            const k = cai.k;
            petala.position.set(saidaP.x + pouso.sai[0] * 0.9 * LARGURA * k, saidaP.y - 0.5 * k, saidaP.z + 0.12 * k);
            petala.rotation.x = deitada.x + 3.4 * k;
            petala.rotation.y = deitada.y + 1.6 * k;
          },
        }, s0 + 2.6)
        .to(uPetala.uOpacidade, { value: 0, duration: 0.9 }, s0 + 4.1);
    });
  }

  /** A letra dela vai começar: a pétala do canto dela levanta antes da primeira letra. */
  function levantarPetala() {
    if (!pousando?.dela || !petala.visible) return Promise.resolve();
    tlPetala?.kill();
    const de = petala.position.clone();
    const rx = petala.rotation.x;
    const rz = petala.rotation.z;
    const op = uPetala.uOpacidade.value;
    const sm = uMancha.uForca.value;
    const k = { v: 0 };
    return comoPromise(guardar(gsap.to(k, {
      v: 1,
      duration: R ? 0.4 : 0.7,
      ease: 'power1.in',
      onUpdate: () => {
        if (!R) {
          petala.position.set(de.x - 0.05 * k.v, de.y + 0.03 * k.v, de.z + 0.06 * k.v);
          petala.rotation.x = rx + 1.1 * k.v;
          petala.rotation.z = rz - 0.6 * k.v;
        }
        uPetala.uOpacidade.value = op * (1 - k.v);
        uMancha.uForca.value = sm * (1 - k.v);
      },
    }))).then(() => fimPetala());
  }

  /* ---- o fio que repousa ---------------------------------------------------------- */

  function aplicarFio() {
    fio?.progresso(fioEstado.p);
    if (sombraFio) sombraFio.material.uniforms.uProgresso.value = fioEstado.p;
  }

  /** A sombra do fio no papel: uma fita de 7,5 mm de meia-largura, de `encosta` até a ponta. */
  function criarSombraFio(pts, primeiro, total) {
    const m = pts.length;
    const pos = new Float32Array(m * 6);
    const aU = new Float32Array(m * 2);
    const aLado = new Float32Array(m * 2);
    const t = new THREE.Vector3();
    const lado = new THREE.Vector3();
    const frente = new THREE.Vector3(0, 0, 1);
    const idx = [];
    for (let i = 0; i < m; i++) {
      t.subVectors(pts[Math.min(m - 1, i + 1)], pts[Math.max(0, i - 1)]);
      lado.crossVectors(t, frente).normalize().multiplyScalar(0.0075);
      for (let k = 0; k < 2; k++) {
        const sinal = k ? 1 : -1;
        const o = (i * 2 + k) * 3;
        pos[o] = pts[i].x + 0.004 + lado.x * sinal;
        pos[o + 1] = pts[i].y - 0.0055 + lado.y * sinal;
        pos[o + 2] = pts[i].z - 0.0025 + lado.z * sinal;
        aU[i * 2 + k] = (primeiro + i) / total;
        aLado[i * 2 + k] = sinal;
      }
      if (i < m - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
    g.setAttribute('aLado', new THREE.BufferAttribute(aLado, 1));
    g.setIndex(idx);
    const malha = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { uProgresso: { value: 0 }, uForca: { value: 0.34 } },
      vertexShader: VERTICE_SOMBRA_FIO,
      fragmentShader: FRAGMENTO_SOMBRA_FIO,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    malha.renderOrder = 2;
    malha.frustumCulled = false;
    interno.add(malha);
    return malha;
  }

  /* ---- a API ---------------------------------------------------------------------- */

  return {
    grupo,
    preparar: (texto) => comum.preparar(texto),

    /** Toma a pose do papel da carta (e o esconde). Sem papel, nasce atrás da leitura, menor. */
    assumir(papelCarta) {
      if (descartada) return;
      medirLeitura();
      if (papelCarta?.matrixWorld) {
        papelCarta.updateWorldMatrix?.(true, false);
        const esc = new THREE.Vector3();
        papelCarta.matrixWorld.decompose(origem.pos, origem.quat, esc);
        const g = papelCarta.geometry;
        if (g && !g.parameters?.width && !g.boundingBox) g.computeBoundingBox?.();
        const base = g?.parameters?.width ?? (g?.boundingBox ? g.boundingBox.max.x - g.boundingBox.min.x : 0);
        origem.escala = base > 0 ? (base * Math.abs(esc.x)) / LARGURA : 0.72;
        papelCarta.visible = false;
      } else {
        origem.pos.copy(leitura.pos).add(new THREE.Vector3(0, -0.05, -0.25));
        origem.quat.identity();
        origem.escala = 0.72;
      }
      origem.definida = true;
      mostrar();
      aplicarViagem(0);
    },

    /** Viaja até a leitura e abre as abas; resolve no label `aberta` (3,75 s; 1,15 s reduzido). */
    desdobrar() {
      if (descartada) return Promise.resolve();
      if (!origem.definida) {
        medirLeitura();
        origem.pos.copy(leitura.pos);
        origem.pos.z -= 0.3;
        origem.quat.identity();
        origem.escala = 0.72;
        origem.definida = true;
      }
      mostrar();
      aplicarViagem(viagem.p);
      viagem.ativa = true;
      return new Promise((resolve) => {
        const tl = guardar(gsap.timeline({ onInterrupt: resolve }));
        const ida = R ? 1 : 2.3;
        tl.to(viagem, {
          p: 1,
          duration: ida,
          ease: R ? curvas.branco.entrar : curvas.branco.camera,
          onUpdate: () => aplicarViagem(viagem.p),
        }, 0).to(uSombra.uForca, { value: 0.2, duration: ida }, 0);
        const t0 = R ? 0.35 : 1.25;
        if (R) {
          tl.to(dobra, { cima: ABERTA_CIMA, baixo: ABERTA_BAIXO, duration: 0.8, ease: 'power3.out' }, t0);
        } else {
          // O balanço cresce no meio da viagem e só fica cheio depois de chegar;
          // a folha se afasta enquanto as abas giram.
          tl.to(flutua, { forca: 1, duration: 2.5 }, 1.15)
            .to(recuo, { z: 0.26, duration: 1.1, ease: curvas.branco.deriva }, 0.75)
            .to(recuo, { z: 0, duration: 2.2, ease: curvas.branco.deriva }, 2)
            .to(dobra, { baixo: ABERTA_BAIXO * 0.55, duration: 1.7, ease: 'power3.out' }, t0)
            .to(dobra, { baixo: ABERTA_BAIXO, duration: 1.3, ease: curvas.branco.deriva }, t0 + 1.7)
            .to(dobra, { cima: ABERTA_CIMA * 0.5, duration: 1.8, ease: 'power3.out' }, t0 + 0.55)
            .to(dobra, { cima: ABERTA_CIMA, duration: 1.3, ease: curvas.branco.deriva }, t0 + 2.35);
        }
        // final.js começa a escrever aqui, não no fim da timeline (~4,9 s).
        tl.addLabel('aberta', t0 + (R ? 0.8 : 2.5)).call(() => {
          viagem.ativa = false;
          noLugar = true;
          resolve();
        }, null, 'aberta');
      });
    },

    escrever: (texto, opcoes = {}) => comum.escrever(texto, opcoes),
    escreverDela: (texto, opcoes = {}) => comum.dela.escrever(texto, opcoes),
    apagarDela: () => comum.dela.apagar(),

    /** O fio sobe pela borda de baixo e se deita no canto de baixo à direita (4,4 s; 1,6 s reduzido). */
    repousarFio() {
      if (fio || descartada) return Promise.resolve();
      const borda = superficie(0, ALTURA, 0);
      const y0 = borda.y;
      const zBorda = borda.z;
      const pontos = [new THREE.Vector3(0, y0 - 1.3, zBorda + 0.05)];
      for (const [px, py] of FIO_REPOUSO) {
        const x = (px / 1000 - 0.5) * LARGURA;
        if (py <= 2000) pontos.push(superficie(x, (py / 2000) * ALTURA, 0.0035));
        else {
          const abaixo = (py - 2000) / 2000;
          pontos.push(new THREE.Vector3(x, y0 - abaixo * ALTURA, zBorda + 0.006 + abaixo * 0.065));
        }
      }
      const amostras = new THREE.CatmullRomCurve3(pontos, false, 'centripetal').getSpacedPoints(160);
      const total = amostras.length - 1;
      let entra = 0;
      let encosta = 0;
      amostras.forEach((p, i) => {
        if (p.y < y0 - 0.2) entra = i;
        if (p.y < y0) encosta = i;
      });
      try {
        // Sem a sombra do chão: em tela 3× ela virava um risco claro sob a frase.
        fio = criarFio(mundo, { curva: amostras, largura: 0.0058, sombra: false });
      } catch (erro) {
        console.error('[carta] o fio da folha', erro);
        fio = null;
        return Promise.resolve();
      }
      // Dentro do que flutua: o fio repousa no papel e balança com ele.
      interno.add(fio.objeto);
      sombraFio = criarSombraFio(amostras.slice(encosta), encosta, total);
      fioEstado.p = Math.max(0, entra / total - 0.04);
      aplicarFio();
      return comoPromise(guardar(gsap.to(fioEstado, {
        p: 1,
        duration: R ? 1.6 : 4.4,
        ease: R ? 'none' : 'power2.out',
        onUpdate: aplicarFio,
      }))).then(() => {
        if (!descartada) fio?.respirar(0.2);
      });
    },

    /** As pétalas começam a pousar (uma vez só). */
    viver() {
      if (vivendo || descartada) return;
      vivendo = true;
      vidaDasPetalas({
        acabou: () => descartada || saiu,
        temDela: () => comum.dela.tem,
        ciclo: cicloPetala,
      }).catch((erro) => console.error('[carta] as pétalas da folha', erro));
    },

    /** Afasta a folha para deixar livres o contador no alto e o botão embaixo. */
    recuar() {
      if (descartada) return;
      margemFim = MARGEM_FIM;
      const de = leitura.distancia;
      const para = medirLeitura();
      const z = mundo.rig?.position?.z ?? 0;
      if (para <= de + 1e-4) {
        if (noLugar) aplicarViagem(viagem.p);
        return;
      }
      leitura.pos.z = z - de;
      const k = { v: 0 };
      guardar(gsap.to(k, {
        v: 1,
        duration: R ? 1.2 : 2.4,
        ease: curvas.branco.deriva,
        onUpdate: () => {
          leitura.pos.z = z - lerp(de, para, k.v);
          if (noLugar) aplicarViagem(viagem.p);
        },
      }));
    },

    /** O fio se solta e a folha sobe para fora da tela. Não descarta nada. */
    irEmbora() {
      if (descartada || saiu || !grupo.visible) return Promise.resolve();
      saiu = true;
      noLugar = false;
      const sobe = ALTURA / 2 + tangente() * leitura.distancia + 0.12;
      const y = grupo.position.y;
      const k = { v: 0 };
      const tl = guardar(gsap.timeline());
      if (!R && fio) tl.to(fioEstado, { p: 0, duration: 1.5, ease: 'power2.in', onUpdate: aplicarFio }, 0);
      tl.to(k, {
        v: 1,
        duration: R ? 0.01 : 2.7,
        ease: 'power2.inOut',
        onUpdate: () => {
          grupo.position.y = lerp(y, ALTURA_OLHOS + sobe, k.v);
        },
      }, 0);
      return comoPromise(tl).then(() => {
        grupo.visible = false;
      });
    },

    atualizar(dt, t) {
      if (descartada || !grupo.visible) return;
      const passo = Math.max(0, dt || 0);
      quadros++;
      // O papel cede: a ponta livre da aba se atrasa enquanto ela gira.
      const dC = dobra.cima - antes.cima;
      const dB = dobra.baixo - antes.baixo;
      antes.cima = dobra.cima;
      antes.baixo = dobra.baixo;
      if (!R && passo > 0) {
        cede.cima = amortecer(cede.cima, clamp((-dC / passo) * 0.07, -0.32, 0.32), 7, passo);
        cede.baixo = amortecer(cede.baixo, clamp((-dB / passo) * 0.07, -0.32, 0.32), 7, passo);
        if (Math.abs(cede.cima) < 1e-5) cede.cima = 0;
        if (Math.abs(cede.baixo) < 1e-5) cede.baixo = 0;
      }
      if (sujo || dC || dB || cede.cima || cede.baixo) refazerMalha();

      const f = R ? 0 : flutua.forca;
      flutua.x = amortecer(flutua.x, mundo.ponteiro?.x || 0, 2.2, passo);
      flutua.y = amortecer(flutua.y, mundo.ponteiro?.y || 0, 2.2, passo);
      interno.position.set(0, Math.sin(t * 0.62) * 0.004 * f, -recuo.z);
      interno.rotation.set(
        (-flutua.y * 0.05 + Math.sin(t * 0.33 + 2) * 0.008) * f,
        (flutua.x * 0.075 + Math.sin(t * 0.27) * 0.012) * f,
        Math.sin(t * 0.41 + 0.8) * 0.0087 * f,
      );

      const rapido = amb.rapido || 1;
      avancarBloco(blocos.dele, passo * rapido);
      avancarBloco(blocos.dela, passo * rapido);
    },

    dispose() {
      if (descartada) return;
      descartada = true;
      for (const a of animacoes) a.kill();
      animacoes.length = 0;
      gsap.killTweensOf([viagem, flutua, recuo, dobra, fioEstado]);
      fimPetala();
      pararRedim?.();
      comum.dispose();
      if (fio) {
        interno.remove(fio.objeto);
        fio.dispose();
        fio = null;
      }
      grupo.parent?.remove(grupo);
      grupo.traverse((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
      blocos.dele.textura?.dispose();
      blocos.dela.textura?.dispose();
      vazia.dispose();
      telasFaixa.clear();
    },
  };
}

/* ============================================================================
   A FOLHA DOM (sem WebGL)
   ============================================================================
   .folha-leve > .fl-corpo > [.fl-sombra, .fl-painel.fl-meio, .fl-aba.fl-cima,
   .fl-aba.fl-baixo]; a tinta dele é um canvas no corpo, a dela um canvas na aba
   de baixo (move junto com ela). Mesmas durações da 3D, em GSAP e CSS.
   ========================================================================== */

function criarFolhaLeve(mundo) {
  const gsap = window.gsap;
  const amb = mundo?.amb || {};
  const R = !!amb.reduzido;
  const U = amb.nivel === 'baixo' ? 768 : 1024;
  const raiz = mundo?.recipienteLeve || document.getElementById('mundo-leve') || document.body;
  const animacoes = [];
  const guardar = (a) => {
    animacoes.push(a);
    return a;
  };

  const escuroCima = el('i', 'fl-escuro');
  const escuroBaixo = el('i', 'fl-escuro');
  const abaCima = el('div', 'fl-aba fl-cima', [el('div', 'fl-painel'), escuroCima]);
  const abaBaixo = el('div', 'fl-aba fl-baixo', [el('div', 'fl-painel'), escuroBaixo]);
  const sombra = el('div', 'fl-sombra');
  const petalaEl = el('i', 'fl-petala');
  const corpo = el('div', 'fl-corpo', [sombra, el('div', 'fl-painel fl-meio'), abaCima, abaBaixo]);
  // A tinta é só imagem: o leitor de tela ouve a frase no espelho (#palco).
  const folhaEl = el('div', { class: 'folha-leve', 'aria-hidden': 'true' }, corpo);

  const terco = (2 * U) / 3;
  const comum = criarEscritas({
    amb,
    U,
    ligarDele: (plano) => {
      tinta.style.top = `${(plano.topoFolha / (2 * U)) * 100}%`;
    },
    mostrarDela: (plano) => {
      tintaDela.style.top = `${((plano.topoFolha - 2 * terco) / terco) * 100}%`;
      tintaDela.hidden = false;
    },
    esconderDela: () => {
      tintaDela.hidden = true;
    },
    liberar: () => levantarPetala(),
  });
  const tinta = comum.escrita.tela;
  tinta.className = 'fl-tinta';
  const tintaDela = comum.dela.escrita.tela;
  tintaDela.className = 'fl-tinta';
  tintaDela.hidden = true;
  corpo.append(tinta, petalaEl);
  abaBaixo.append(tintaDela); // mexer na aba de baixo move a letra dela junto
  raiz.append(folhaEl);

  // Pose inicial: dobrada em três, a aba de baixo por fora.
  gsap.set(folhaEl, { autoAlpha: 0 });
  gsap.set(abaCima, { rotationX: -178.5, z: 1 });
  gsap.set(abaBaixo, { rotationX: 176, z: 2.5 });
  gsap.set([escuroCima, escuroBaixo], { opacity: 0.035 });
  gsap.set(sombra, { z: -2, scaleY: 1 / 3, opacity: 0 });
  gsap.set(petalaEl, { z: 28, opacity: 0 });

  const flutua = { x: 0, y: 0, forca: 0 };
  const recorte = { f: 0 };
  let noBolso = 0;
  let assumida = false;
  let descartada = false;
  let saiu = false;
  let vivendo = false;
  let fioEl = null;

  /** O recorte do bolso: a parte do papel ainda dentro do envelope não aparece. */
  function recortar(fracao) {
    const valor = fracao === null ? '' : `inset(0 0 ${(33.3334 + fracao * 33.3333).toFixed(4)}% 0)`;
    folhaEl.style.webkitClipPath = valor;
    folhaEl.style.clipPath = valor;
  }

  /** Posição e escala do papel da carta; `topoBolso` é a boca do envelope na tela. */
  function entrar(de, topoBolso) {
    const caixa = raiz.getBoundingClientRect();
    const L = folhaEl.offsetWidth || 1;
    noBolso = topoBolso == null ? 0 : clamp(de.bottom - topoBolso, 0, 0.9 * de.height);
    gsap.set(folhaEl, {
      x: de.left + de.width / 2 - (caixa.left + caixa.width / 2),
      y: de.top + de.height / 2 - (caixa.top + caixa.height / 2),
      scale: de.width / L,
    });
    recorte.f = noBolso / de.height;
    recortar(noBolso > 0 ? recorte.f : null);
  }

  /* ---- pétalas (px dentro do corpo) ------------------------------------------- */

  let pousando = null;
  let tlPetala = null;
  let fimPetala = () => {};
  const grau = 180 / Math.PI;

  function cicloPetala(pouso, descanso) {
    if (descartada || saiu) return Promise.resolve();
    return new Promise((resolve) => {
      let feito = false;
      fimPetala = () => {
        if (feito) return;
        feito = true;
        gsap.set(petalaEl, { opacity: 0 });
        pousando = null;
        tlPetala = null;
        resolve();
      };
      pousando = pouso;
      const L = corpo.offsetWidth || 1;
      const A = corpo.offsetHeight || 2;
      const lado = Math.sign(pouso.x) || 1;
      const ax = (0.5 + pouso.x) * L;
      const ay = pouso.s * A;
      const giro = pouso.giro * grau;
      const tl = guardar(gsap.timeline({ onComplete: () => fimPetala() }));
      tlPetala = tl;

      if (R) {
        gsap.set(petalaEl, { x: ax, y: ay, z: 28, rotation: giro, rotationX: 0, scale: 1, opacity: 0 });
        tl.to(petalaEl, { opacity: 1, duration: 1.4 }, 0).to(petalaEl, { opacity: 0, duration: 1.4 }, 1.4 + descanso);
        return;
      }

      const queda = { e: 0 };
      const posar = () => {
        const e = queda.e;
        const resto = 1 - e;
        gsap.set(petalaEl, {
          x: ax + lado * 0.42 * L * resto + Math.sin(e * 9.5) * 0.16 * L * resto,
          y: ay - 0.72 * A * resto,
          z: 28,
          rotation: giro + 150 * lado * resto,
          rotationX: 300 * resto * resto + 28 * Math.sin(e * 11) * resto,
          scale: 1 + 0.5 * resto,
          opacity: clamp(5 * e),
        });
      };
      posar();
      const s0 = 4.2 + descanso;
      const bx = ax + pouso.sai[0] * L;
      const by = ay + pouso.sai[1] * A;
      tl.to(queda, { e: 1, duration: 4.2, ease: 'sine.out', onUpdate: posar }, 0)
        .to(petalaEl, { x: bx, y: by, rotation: giro + 28 * lado, duration: 2.6, ease: 'power2.in' }, s0)
        .to(petalaEl, {
          x: bx + pouso.sai[0] * 0.9 * L,
          y: by + 0.45 * A,
          rotation: giro + (28 + 160) * lado,
          duration: 2.4,
          ease: 'power1.in',
        }, s0 + 2.6)
        .to(petalaEl, { opacity: 0, duration: 0.9 }, s0 + 4.1);
    });
  }

  function levantarPetala() {
    if (!pousando?.dela) return Promise.resolve();
    tlPetala?.kill();
    const L = corpo.offsetWidth || 1;
    const alvo = R
      ? { opacity: 0 }
      : { x: `-=${0.12 * L}`, y: `-=${0.07 * L}`, rotation: '-=34', rotationX: '+=70', scale: 1.15, opacity: 0 };
    return comoPromise(guardar(gsap.to(petalaEl, { ...alvo, duration: R ? 0.4 : 0.7, ease: 'power1.in' })))
      .then(() => fimPetala());
  }

  /* ---- a API ---------------------------------------------------------------------- */

  return {
    grupo: objetoLeve(),
    preparar: (texto) => comum.preparar(texto),

    assumir(papelCarta) {
      if (descartada) return;
      let de = null;
      let topoBolso = null;
      try {
        if (typeof papelCarta?.getBoundingClientRect === 'function') {
          de = papelCarta.getBoundingClientRect();
          const pai = papelCarta.parentElement;
          const corpoCarta = pai?.matches?.('.cl-corpo') ? pai : pai?.querySelector?.('.cl-corpo');
          if (corpoCarta) topoBolso = corpoCarta.getBoundingClientRect().top;
        }
      } catch {
        de = null;
      }
      if (de && de.width > 0 && de.height > 0) entrar(de, topoBolso);
      else {
        noBolso = 0;
        gsap.set(folhaEl, { x: 0, y: innerHeight * 0.04, scale: 0.74 });
      }
      if (papelCarta) {
        try {
          papelCarta.visible = false;
        } catch {
          /* papel sem a propriedade: fica onde está, por baixo da folha */
        }
      }
      assumida = true;
      gsap.set(folhaEl, { autoAlpha: 1 });
    },

    /** Sobe o que falta do bolso, vem ao centro e abre; resolve no label `aberta`. */
    desdobrar() {
      if (descartada) return Promise.resolve();
      if (!assumida) {
        gsap.set(folhaEl, { x: 0, y: innerHeight * 0.04, scale: 0.74 });
        assumida = true;
      }
      gsap.set(folhaEl, { autoAlpha: 1 });
      return new Promise((resolve) => {
        const tl = guardar(gsap.timeline({ onInterrupt: resolve }));
        let t = 0;
        if (noBolso > 0) {
          const sobe = R ? 0.3 : 0.55;
          tl.to(folhaEl, { y: `-=${noBolso}`, duration: sobe, ease: curvas.branco.deriva }, 0)
            .to(recorte, { f: 0, duration: sobe, ease: curvas.branco.deriva, onUpdate: () => recortar(recorte.f) }, 0)
            .call(() => recortar(null), null, sobe);
          t = sobe;
        }
        tl.to(folhaEl, { x: 0, y: 0, scale: 1, duration: R ? 0.9 : 2.1, ease: curvas.branco.entrar }, t);
        const t0 = t + (R ? 0.3 : 1.15);
        if (R) {
          tl.to(abaBaixo, { rotationX: 4, duration: 0.8, ease: 'power3.out' }, t0)
            .to(abaCima, { rotationX: -3, duration: 0.8, ease: 'power3.out' }, t0)
            .to([escuroCima, escuroBaixo], { opacity: 0, duration: 0.8 }, t0)
            .to(sombra, { scaleY: 1, opacity: 1, duration: 0.8 }, t0);
        } else {
          tl.to(flutua, { forca: 1, duration: 2.5 }, t + 1.05)
            .to(abaBaixo, { rotationX: 2.5, duration: 1.7, ease: 'power3.out' }, t0)
            .to(abaBaixo, { rotationX: 4.5, duration: 1.3, ease: curvas.branco.deriva }, t0 + 1.7)
            .to(escuroBaixo, { opacity: 0, duration: 1.5 }, t0)
            .to(abaCima, { rotationX: -1.5, duration: 1.8, ease: 'power3.out' }, t0 + 0.55)
            .to(abaCima, { rotationX: -3, duration: 1.3, ease: curvas.branco.deriva }, t0 + 2.35)
            .to(escuroCima, { opacity: 0.012, duration: 1.6 }, t0 + 0.55)
            .to(sombra, { opacity: 0.3, duration: 0.4 }, t0)
            .to(sombra, { scaleY: 1, duration: 2.4, ease: 'sine.inOut' }, t0 + 0.2)
            .to(sombra, { opacity: 1, duration: 1.2 }, t0 + 1.9);
        }
        tl.addLabel('aberta', t0 + (R ? 0.8 : 2.5)).call(resolve, null, 'aberta');
      });
    },

    escrever: (texto, opcoes = {}) => comum.escrever(texto, opcoes),
    escreverDela: (texto, opcoes = {}) => comum.dela.escrever(texto, opcoes),
    apagarDela: () => comum.dela.apagar(),

    /** O fio em SVG já aparece com 30% do traço e termina de se deitar (4,4 s; 1,6 s reduzido). */
    repousarFio() {
      if (fioEl || descartada) return Promise.resolve();
      const d = caminhoSuave(FIO_REPOUSO);
      // #fl-fio-mascara é fixo: só cabe uma folha DOM por página.
      fioEl = svg(`<svg class="fl-fio" viewBox="0 0 1000 2000" aria-hidden="true" focusable="false">
        <defs><mask id="fl-fio-mascara" maskUnits="userSpaceOnUse" x="-500" y="-500" width="2000" height="4500">
          <path class="fl-fio-traco" d="${d}" fill="none" stroke="#fff" stroke-width="60" stroke-linecap="round" stroke-linejoin="round"/>
        </mask></defs>
        <g mask="url(#fl-fio-mascara)" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path class="fl-fio-sombra" d="${d}" stroke="rgba(42,27,34,0.16)" stroke-width="22" transform="translate(9 13)"/>
          <path class="fl-fio-brilho" d="${d}" stroke="#ffbf7a" stroke-width="34"/>
          <path d="${d}" stroke="#d7192d" stroke-width="13"/>
          <path d="${d}" stroke="#a80f22" stroke-width="13" stroke-dasharray="7 15" opacity="0.55"/>
        </g>
      </svg>`);
      corpo.append(fioEl);
      const traco = fioEl.querySelector('.fl-fio-traco');
      let comprimento = 2600;
      try {
        comprimento = traco.getTotalLength() || comprimento;
      } catch {
        /* sem medida: o valor padrão cobre o caminho */
      }
      traco.style.strokeDasharray = String(comprimento);
      return comoPromise(guardar(gsap.fromTo(traco,
        { strokeDashoffset: 0.7 * comprimento },
        { strokeDashoffset: 0, duration: R ? 1.6 : 4.4, ease: R ? 'none' : 'power2.out' },
      ))).then(() => {
        if (!descartada) fioEl?.classList.add('fl-fio-respira');
      });
    },

    viver() {
      if (vivendo || descartada) return;
      vivendo = true;
      vidaDasPetalas({
        acabou: () => descartada || saiu,
        temDela: () => comum.dela.tem,
        ciclo: cicloPetala,
      }).catch((erro) => console.error('[carta] as pétalas da folha', erro));
    },

    /** Encolhe para caber entre o contador e o botão; em tela baixa, nada. */
    recuar() {
      if (descartada || innerHeight < TELA_BAIXA) return;
      const alvo = Math.min(1, (innerHeight - 2 * MARGEM_FIM) / (folhaEl.offsetHeight || 1));
      guardar(gsap.to(folhaEl, { scale: alvo, duration: R ? 1.2 : 2.4, ease: curvas.branco.deriva }));
    },

    irEmbora() {
      if (descartada || saiu) return Promise.resolve();
      saiu = true;
      if (fioEl) guardar(gsap.to(fioEl, { opacity: 0, duration: R ? 0.01 : 0.9 }));
      return comoPromise(guardar(gsap.to(folhaEl, { yPercent: -120, duration: R ? 0.01 : 2.7, ease: 'power2.inOut' })))
        .then(() => {
          if (!descartada) gsap.set(folhaEl, { autoAlpha: 0 });
        });
    },

    atualizar(dt, t) {
      if (descartada) return;
      const passo = Math.max(0, dt || 0) * (amb.rapido || 1);
      for (const e of [comum.escrita, comum.dela.escrita]) {
        if (!e.ativo) continue;
        e.avancar(passo);
        e.tirarFaixas(); // o canvas já está na tela: nada a subir
      }
      if (R || !assumida) return;
      const f = flutua.forca;
      flutua.x = amortecer(flutua.x, mundo?.ponteiro?.x || 0, 2.2, dt || 0);
      flutua.y = amortecer(flutua.y, mundo?.ponteiro?.y || 0, 2.2, dt || 0);
      corpo.style.transform = `translate3d(0, ${(Math.sin(t * 0.62) * 3 * f).toFixed(2)}px, 0)`
        + ` rotateZ(${(Math.sin(t * 0.41 + 0.8) * 0.5 * f).toFixed(3)}deg)`
        + ` rotateY(${((flutua.x * 3.2 + Math.sin(t * 0.27) * 0.6) * f).toFixed(3)}deg)`
        + ` rotateX(${((flutua.y * 2.2 + Math.sin(t * 0.33 + 2) * 0.4) * f).toFixed(3)}deg)`;
    },

    dispose() {
      if (descartada) return;
      descartada = true;
      for (const a of animacoes) a.kill();
      animacoes.length = 0;
      gsap.killTweensOf([folhaEl, abaCima, abaBaixo, escuroCima, escuroBaixo, sombra, petalaEl, flutua, recorte]);
      fimPetala();
      comum.dispose();
      folhaEl.remove();
    },
  };
}
