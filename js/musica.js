/* ============================================================================
   MÚSICA: o seletor de capas na tela preta e o disco no canto
   ============================================================================
   Dois modos. Na tela preta (#entrada-musica), um carrossel de capas: ela
   passa com o dedo (arrasto com inércia, uma capa por gesto, elástico nas
   pontas), com as setas ou com o teclado, toca na capa do centro para ouvir e
   em "Continuar" para seguir. Tem de ficar bom com uma faixa só e com várias.
   No Continuar, o disco voa até o canto e vira o mini (#mini): um disco que
   gira enquanto a música toca, com tocar/pausar, a lista, o volume e o elo
   "Voltar ao menu". O mini veste a pele do capítulo (data-pele), recolhe
   enquanto ela rola uma folha e some onde a carta pede o papel inteiro.

   Faixa cujo arquivo não existe (HEAD 404/410) ou que não toca
   (som.estado.falhou) sai em silêncio. O índice de cada faixa é a posição em
   musica.faixas: o mesmo de som.js, da letra e de ?musica=N. O campo `letra`
   nunca é lido aqui.

   API: criarMusica({ conteudo, som, amb, recursos, mini })
        → { escolher(folha), mostrarMini(), esconderMini() }
   ========================================================================== */

import { el, svg, espera, quadro, semente, clamp, debounce, menuLembrado, enderecoDaCena } from './nucleo/util.js';
import { temMenu } from './nucleo/diretor.js';
import { curvas, revelarPalavras, comoPromise } from './nucleo/movimento.js';

const PERIODO_GIRO = 9000; // ms por volta do disco
const RAIO_ANEL = 22.6; // o anel de progresso, no SVG de 48 px do mini
const VOLTA_ANEL = 2 * Math.PI * RAIO_ANEL;
const MARGEM_LACO = 7; // folga entre o laço e a borda do SVG que o contém
const CAPITULOS = new Set(['poppy', 'yourname']);
// Nesses passos da cena final a folha não tem botão nenhum: o mini sai.
// Não pode incluir 'fim': o final mostra o mini de novo ali.
const FIM_SEM_BOTAO = new Set(['desdobrando', 'escrevendo']);
const semBotao = () => document.documentElement.dataset.cena === 'final' && FIM_SEM_BOTAO.has(document.documentElement.dataset.etapa);
// Onde o canto é olhado, em fração da caixa do botão do mini.
const AMOSTRAS = [[0.5, 0.5], [0.1, 0.15], [0.9, 0.15], [0.1, 0.9], [0.9, 0.9], [0.5, 1.02], [-0.04, 0.5]];
const TOCAVEL = 'a, button, input, textarea, select, label, [role="button"], [tabindex]';
const FIGURA = 'img, picture, video, canvas, svg, figure';
const temTexto = (no) => [...no.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.nodeValue.trim());
const VOLTAR = 'Voltar ao menu'; // o padrão de menu.rotulos.voltar

// Os padrões são os textos do content.js: rótulo vazio nunca deixa botão sem nome.
const ROTULOS = {
  abrir: 'Música',
  pausar: 'Pausar a música',
  tocar: 'Tocar a música',
  volume: 'Volume',
  anterior: 'Música anterior',
  proxima: 'Próxima música',
  continuar: 'Continuar',
};

const ICONE_TOCAR = '<svg class="ui-icone icone-tocar" viewBox="0 0 24 24" aria-hidden="true"><path class="icone-cheio" d="M8.5 5.8v12.4L18.6 12z"/></svg>';
const ICONE_PAUSA = '<svg class="ui-icone icone-pausa" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.5v11M15 6.5v11"/></svg>';
const ICONE_SETA = '<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>';
const ICONE_SEGUIR = '<svg class="ui-icone musica-seta" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.4c4.6-.6 9.3-.6 14 0M13.6 7l5 5.4-5 5.4"/></svg>';
const ICONE_VOLUME = '<svg class="ui-icone mini-volume-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9.6h3.2L12 6v12l-4.3-3.6H4.5z"/><path d="M15.6 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/></svg>';

// Teclado ou dedo? O foco automático na capa do centro só vale para quem chegou pelo teclado.
let viaTeclado = false;
window.addEventListener('keydown', () => { viaTeclado = true; }, true);
window.addEventListener('pointerdown', () => { viaTeclado = false; }, true);

const limpo = (v) => (typeof v === 'string' ? v.trim() : '');

/* ---- o laço desenhado à mão ------------------------------------------------- */

const n2 = (v) => Math.round(v * 100) / 100;

/** Path SVG que passa por todos os pontos (Catmull-Rom convertido em Bézier). */
function caminhoSuave(p) {
  if (p.length < 2) return '';
  let d = `M${n2(p[0][0])} ${n2(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i];
    const b = p[i];
    const c = p[i + 1];
    const e = p[i + 2] || c;
    d += `C${n2(b[0] + (c[0] - a[0]) / 6)} ${n2(b[1] + (c[1] - a[1]) / 6)}`
      + ` ${n2(c[0] - (e[0] - b[0]) / 6)} ${n2(c[1] - (e[1] - b[1]) / 6)}`
      + ` ${n2(c[0])} ${n2(c[1])}`;
  }
  return d;
}

/** A folga do laço em volta de um texto de l × a px: { x, y, rx, ry, n }. */
function folgaDoLaco(l, a) {
  const hx = Math.max(8, l / 2);
  const hy = Math.max(8, a / 2);
  // Texto alto (nome em duas linhas) pede um laço mais quadrado.
  const n = 2.6 + clamp((hy - 26) / 30) * 2.4;
  const px = clamp(hx * 0.1, 11, 16);
  // A superelipse tem de passar por fora do canto do texto, não só do meio.
  const kx = hx / (hx + px);
  const ky = (1 - kx ** n) ** (1 / n);
  const ry = Math.max(hy + 6, hy / ky);
  return { x: Math.round(px + MARGEM_LACO), y: Math.round(ry - hy + MARGEM_LACO), rx: hx + px, ry, n };
}

/** Uma volta e um pouco mais numa superelipse, com tremor de mão e a ponta aberta. */
function caminhoDoLaco(l, a, sorte, f) {
  const u = sorte();
  const f1 = sorte() * Math.PI * 2;
  const f2 = sorte() * Math.PI * 2;
  const inicio = -2.45 + (u - 0.5) * 0.3; // começa no alto, à esquerda
  const volta = Math.PI * 2 + 0.6 + 0.25 * u;
  const e = 2 / f.n;
  const giro = (u - 0.5) * 0.035;
  const cx = f.x + l / 2;
  const cy = f.y + a / 2;
  const cg = Math.cos(giro);
  const sg = Math.sin(giro);
  const pontos = [];
  for (let i = 0; i <= 52; i++) {
    const k = i / 52;
    const ang = inicio + volta * k;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    // O tremor da mão e a abertura: a segunda passada corre por fora da primeira.
    const extra = 1.2 + 1.2 * Math.sin(2 * ang + f1) + 0.7 * Math.sin(3.3 * ang + f2) + 4.2 * k;
    const x = (f.rx + extra) * Math.sign(c) * Math.abs(c) ** e;
    const y = (f.ry + extra) * Math.sign(s) * Math.abs(s) ** e;
    pontos.push([cx + x * cg - y * sg, cy + x * sg + y * cg]);
  }
  return caminhoSuave(pontos);
}

/* ---- a música --------------------------------------------------------------- */

export function criarMusica({ conteudo, som, amb, recursos, mini }) {
  const gsap = window.gsap;
  const dados = conteudo?.musica || {};
  const perg = document.getElementById('pergaminho');
  const calmo = () => !!amb?.reduzido;
  const rotulo = (chave) => limpo(dados.rotulos?.[chave]) || ROTULOS[chave];

  // Só as faixas com arquivo; `indice` é a posição original em musica.faixas.
  const todas = (Array.isArray(dados.faixas) ? dados.faixas : [])
    .map((f, indice) => ({
      indice,
      titulo: limpo(f?.titulo),
      artista: limpo(f?.artista),
      capa: limpo(f?.capa),
      arquivo: limpo(f?.arquivo),
    }))
    .filter((f) => f.arquivo);

  const fora = new Set();
  const aoDescartar = new Set();
  let conferencia = null;
  let pecas = null; // o mini montado
  let escondendo = false;
  // Trocada em montarMini; antes disso o voo pode chamá-la sem efeito.
  let refletir = () => {};

  const validas = () => todas.filter((f) => !fora.has(f.indice));
  // Faixa sem título ainda tem nome: "Música 2".
  const tituloDa = (faixa) => faixa.titulo || `${rotulo('abrir')} ${todas.indexOf(faixa) + 1}`;
  const nomeDa = (faixa) => [tituloDa(faixa), faixa.artista].filter(Boolean).join(', ');
  const imagemDa = (faixa) => (recursos?.elementoImagem ? recursos.elementoImagem(faixa.capa, '') : Promise.resolve(null));

  /** Tira a faixa em silêncio: do carrossel, da lista do mini e do "tocar a primeira". */
  function descartar(indice) {
    if (fora.has(indice) || !todas.some((f) => f.indice === indice)) return;
    fora.add(indice);
    for (const fn of [...aoDescartar]) {
      try {
        fn(indice);
      } catch (erro) {
        console.error('[carta] descartar faixa', erro);
      }
    }
  }

  /** Confere cada arquivo com HEAD, num momento ocioso. 404/410 tira; erro de rede deixa para o tocar. */
  function conferirArquivos() {
    conferencia ||= new Promise((resolve) => {
      if (typeof fetch !== 'function' || !todas.length) {
        resolve();
        return;
      }
      const conferir = () => {
        Promise.all(todas.map((f) => fetch(f.arquivo, { method: 'HEAD' })
          .then((r) => {
            if (r.status === 404 || r.status === 410) descartar(f.indice);
          })
          .catch(() => {}))).then(() => resolve());
      };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(conferir, { timeout: 2500 });
      else espera(700).then(conferir);
    });
    return conferencia;
  }

  /* ---- peças: o giro, o disco e o fio que se desenha --------------------------- */

  /** O disco gira por WAAPI (9 s por volta) e tem inércia: acelera em 1,1 s e para em 1,9 s. */
  function criarGiro(alvo) {
    const ritmo = { v: 0 };
    let girando = false;
    let anim = null;
    // Na versão calma o disco não gira.
    if (!calmo() && typeof alvo.animate === 'function') {
      try {
        anim = alvo.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: PERIODO_GIRO, iterations: Infinity });
        anim.pause();
      } catch {
        anim = null;
      }
    }
    const aplicar = () => {
      if (anim) anim.playbackRate = ritmo.v;
    };
    return {
      /** `imediato` pula a inércia: usado quando o disco troca de corpo no meio do giro (o voo). */
      definir(sim, imediato = false) {
        if (!anim || (sim === girando && !imediato)) return;
        girando = sim;
        gsap.killTweensOf(ritmo);
        if (sim) anim.play();
        if (imediato) {
          ritmo.v = sim ? 1 : 0;
          aplicar();
          if (!sim) anim.pause();
          return;
        }
        gsap.to(ritmo, {
          v: sim ? 1 : 0,
          duration: sim ? 1.1 : 1.9,
          ease: 'power2.out',
          onUpdate: aplicar,
          onComplete: () => {
            if (!girando) anim?.pause();
          },
        });
      },
      get fase() {
        if (!anim) return 0;
        const t = Number(anim.currentTime) || 0;
        return ((t % PERIODO_GIRO) + PERIODO_GIRO) % PERIODO_GIRO;
      },
      set fase(ms) {
        if (anim) anim.currentTime = ms;
      },
      soltar() {
        gsap.killTweensOf(ritmo);
        anim?.cancel();
        anim = null;
      },
    };
  }

  /** O disco: sulcos, rótulo com a capa que gira e o furo. Sem capa, vidro com uma lanterna (CSS). */
  function criarDisco(classe) {
    const gira = el('span', 'disco-gira');
    const etiqueta = el('span', 'disco-rotulo', gira);
    const no = el('span', { class: `disco ${classe}`, 'aria-hidden': 'true' }, [el('span', 'disco-sulcos'), etiqueta, el('span', 'disco-furo')]);
    const giro = criarGiro(gira);
    let atual = null;
    return {
      no,
      gira,
      rotulo: etiqueta,
      giro,
      async capa(faixa) {
        if (!faixa || faixa === atual) return;
        atual = faixa;
        const img = await imagemDa(faixa);
        if (atual !== faixa) return; // trocou de novo enquanto a imagem chegava
        const antiga = gira.querySelector('img');
        if (!img) {
          no.classList.add('sem-capa');
          antiga?.remove();
          return;
        }
        no.classList.remove('sem-capa');
        gira.append(img);
        // Capa nova sem capa anterior entra sem fade.
        if (antiga && !calmo()) {
          gsap.fromTo(img, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: 'none', onComplete: () => antiga.remove() });
        } else {
          antiga?.remove();
        }
      },
    };
  }

  /** O fio vermelho que se desenha em volta de `hospede`. Remede quando o hospede muda de tamanho. */
  function criarFioDesenhado(classe, hospede, folga, gerar) {
    const no = svg(`<svg class="${classe}" aria-hidden="true" focusable="false"><path class="fio-sombra"/><path class="fio-linha"/></svg>`);
    const tracos = [...no.querySelectorAll('path')];
    const desenha = !calmo() && !!window.DrawSVGPlugin;
    gsap.set(no, { autoAlpha: 0 });

    function medir() {
      const l = hospede.offsetWidth;
      const a = hospede.offsetHeight;
      // Hospede ainda sem tamanho (fonte chegando, fora da tela): espera o próximo aviso.
      if (l <= 12 || a <= 6) return;
      const f = folga(l, a);
      const largura = Math.round(l + f.x * 2);
      const altura = Math.round(a + f.y * 2);
      no.setAttribute('width', String(largura));
      no.setAttribute('height', String(altura));
      no.setAttribute('viewBox', `0 0 ${largura} ${altura}`);
      no.style.left = `${-f.x}px`;
      no.style.top = `${-f.y}px`;
      const d = gerar(l, a, f);
      for (const t of tracos) t.setAttribute('d', d);
    }

    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => medir()) : null;
    ro?.observe(hospede);

    return {
      no,
      medir,
      desenhar({ duracao = 0.95, atraso = 0 } = {}) {
        gsap.killTweensOf([no, ...tracos]);
        if (!desenha) {
          gsap.fromTo(no, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, delay: atraso, ease: 'none' });
          return;
        }
        gsap.set(no, { autoAlpha: 1 });
        gsap.fromTo(tracos, { drawSVG: '0% 0%' }, {
          drawSVG: '0% 100%',
          duration: duracao,
          delay: atraso,
          ease: 'power2.inOut',
          // Desenhado, o traço fica inteiro: se o nome mudar de tamanho, o novo caminho aparece todo.
          onComplete: () => gsap.set(tracos, { clearProps: 'strokeDasharray,strokeDashoffset' }),
        });
      },
      apagar({ duracao = 0.4 } = {}) {
        gsap.killTweensOf([no, ...tracos]);
        if (!desenha) {
          gsap.to(no, { autoAlpha: 0, duration: 0.3, ease: 'none' });
          return;
        }
        gsap.to(tracos, {
          drawSVG: '100% 100%',
          duration: duracao,
          ease: 'power1.inOut',
          onComplete: () => gsap.set(no, { autoAlpha: 0 }),
        });
      },
      soltar() {
        ro?.disconnect();
        gsap.killTweensOf([no, ...tracos]);
      },
    };
  }

  /* ---- escolher: o carrossel na tela preta ------------------------------------- */

  /** Monta o carrossel em `folha` e resolve quando ela toca em Continuar (ou já, sem faixa válida). */
  async function escolher(folha) {
    if (!folha || !validas().length) return;
    try {
      await Promise.race([conferirArquivos(), espera(1200)]);
      const faixas = validas();
      if (!faixas.length) return;
      const capas = faixas.map(imagemDa);
      // Capa que demora mais de 900 ms não segura a folha: entra depois.
      const prontas = await Promise.race([Promise.all(capas), espera(900).then(() => null)]);
      await new Promise((resolve) => montarSeletor(folha, faixas, capas, prontas, resolve));
    } catch (erro) {
      // O seletor nunca prende a carta: sem ele, ela segue sem escolher.
      console.error('[carta] o seletor de música falhou', erro);
      folha.textContent = '';
    }
  }

  /**
   * O carrossel. `atual`, vivas() e a posição do trilho contam só as faixas
   * visíveis (li sem hidden). A ordem no DOM é a de musica.faixas e a primeira
   * capa do DOM é a do centro ao abrir: os testes contam com isso.
   */
  function montarSeletor(folha, faixas, capas, prontas, resolver) {
    let escolhida = null;
    let atual = 0;
    let passo = 1; // px entre os centros de duas capas
    // A posição do trilho, em capas. Quem escreve é o GSAP (irPara) ou o dedo;
    // escrever aqui sem matar o tween faz os dois brigarem.
    const pos = { x: 0 };
    let arrasto = null;
    let semClique = 0; // até quando o click que vem depois de um toque já atendido é ignorado
    let roda = 0;
    let rodaAte = 0;
    let terminado = false;
    let mexeu = false; // ela já passou ou tocou: o convite do trilho não roda mais
    const limpezas = [];

    const textoTitulo = limpo(dados.titulo);
    const textoContinuar = limpo(dados.continuar);
    const titulo = textoTitulo ? el('h2', 'musica-titulo', textoTitulo) : null;
    const trilho = el('ul', 'car-trilho');
    const janela = el('div', 'car-janela', trilho);
    const criarSeta = (dir) => el('button', {
      type: 'button',
      class: 'car-seta ui-redondo',
      'data-dir': String(dir),
      'data-tom': 'noite',
      'aria-label': rotulo(dir < 0 ? 'anterior' : 'proxima'),
      tabindex: '-1', // no teclado, quem passa são as setas do próprio teclado
    }, svg(ICONE_SETA));
    const setaAnt = criarSeta(-1);
    const setaProx = criarSeta(1);
    const palco = el('div', 'car-palco', [janela, setaAnt, setaProx]);
    const pontos = el('div', { class: 'car-pontos', 'aria-hidden': 'true' });
    const continuar = el('button', {
      type: 'button',
      class: 'musica-continuar ui-pilula',
      'data-acao': 'continuar',
      'data-tom': 'fio', // a pílula principal, acesa (ouro em base.css)
      'aria-label': textoContinuar ? null : rotulo('continuar'),
      disabled: true,
    }, [textoContinuar ? el('span', 'musica-continuar-texto', textoContinuar) : null, svg(ICONE_SEGUIR)]);
    const caixaContinuar = el('div', 'musica-continuar-caixa', continuar);
    const painel = el('div', 'musica carrossel', [titulo, palco, pontos, caixaContinuar]);

    const linhas = faixas.map((faixa, n) => {
      const disco = criarDisco('disco-vinil car-disco');
      const capa = el('span', 'car-capa');
      const moldura = el('span', 'car-moldura', [capa, el('span', 'car-tocar ui-redondo', svg(ICONE_TOCAR)), el('span', 'car-laco ui-laco')]);
      const objeto = el('span', { class: 'car-objeto', 'aria-hidden': 'true' }, [el('span', 'car-disco-trilho', disco.no), moldura]);
      const texto = el('span', 'car-texto', [
        faixa.titulo ? el('span', 'car-nome', faixa.titulo) : null,
        faixa.artista ? el('span', 'car-artista', faixa.artista) : null,
      ]);
      const botao = el('button', {
        type: 'button',
        class: 'car-faixa',
        'data-acao': 'faixa',
        'data-indice': String(faixa.indice),
        'aria-pressed': 'false',
        'aria-label': nomeDa(faixa),
      }, [objeto, texto]);
      const li = el('li', 'car-item', botao);
      const ponto = el('i', 'car-ponto');
      // Uma semente por faixa: o laço de cada nome é sempre o mesmo, mesmo depois de remedir.
      const laco = criarFioDesenhado('musica-laco', texto, folgaDoLaco, (l, a, f) => caminhoDoLaco(l, a, semente(faixa.indice * 31 + 5), f));
      texto.append(laco.no);
      disco.capa(faixa);
      const pronta = prontas?.[n];
      if (pronta) {
        capa.append(pronta);
      } else {
        // Sem capa (ou atrasada): o disco de vidro com a lanterna; a capa que chegar depois entra devagar.
        li.classList.add('sem-capa');
        capas[n].then((img) => {
          if (!img || terminado) return;
          capa.append(img);
          li.classList.remove('sem-capa');
          gsap.fromTo(img, { opacity: 0 }, { opacity: 1, duration: 0.7, ease: 'none', clearProps: 'opacity' });
        });
      }
      trilho.append(li);
      pontos.append(ponto);
      return { faixa, li, botao, objeto, moldura, texto, ponto, disco, laco };
    });

    const vivas = () => linhas.filter((l) => !l.li.hidden);
    const linhaDe = (no) => (no ? linhas.find((l) => l.botao === no) : null);

    /* -- o trilho -- */

    function desenhar() {
      trilho.style.transform = `translate3d(${n2(-pos.x * passo)}px, 0, 0)`;
      vivas().forEach((l, i) => {
        const d = clamp(Math.abs(i - pos.x));
        // As vizinhas encolhem e apagam; na versão calma só apagam.
        l.li.style.transform = calmo() ? '' : `scale(${(1 - 0.16 * d).toFixed(4)})`;
        l.li.style.opacity = (1 - 0.66 * d).toFixed(4);
      });
    }

    function medir() {
      const ref = vivas()[0]?.li;
      if (ref?.offsetWidth) passo = ref.offsetWidth + (parseFloat(getComputedStyle(trilho).columnGap) || 0);
      desenhar();
    }

    function marcarCentro() {
      const v = vivas();
      atual = clamp(atual, 0, Math.max(0, v.length - 1));
      const centro = v[atual];
      for (const l of linhas) {
        const eh = l === centro;
        l.botao.tabIndex = eh ? 0 : -1; // só a capa do centro fica no Tab
        l.li.toggleAttribute('data-centro', eh);
        l.ponto.toggleAttribute('data-atual', eh);
        l.ponto.toggleAttribute('data-escolhida', l === escolhida);
      }
      setaAnt.disabled = terminado || atual <= 0;
      setaProx.disabled = terminado || atual >= v.length - 1;
      painel.toggleAttribute('data-unica', v.length < 2);
    }

    function irPara(i, { duracao = calmo() ? 0.25 : 0.62 } = {}) {
      atual = Math.round(clamp(i, 0, Math.max(0, vivas().length - 1)));
      marcarCentro();
      gsap.killTweensOf(pos);
      gsap.to(pos, { x: atual, duration: duracao, ease: calmo() ? 'none' : 'power3.out', onUpdate: desenhar });
    }

    /** Leva a capa `i` ao centro; cada passo que muda o centro faz o toque. */
    function centrar(i) {
      const antes = atual;
      irPara(i);
      if (atual !== antes) som?.efeito?.('toque');
    }

    function passar(dir) {
      if (terminado) return;
      mexeu = true;
      centrar(atual + dir);
    }

    /* -- escolher -- */

    function marcar(linha) {
      const anterior = escolhida;
      escolhida = linha;
      for (const l of linhas) l.botao.setAttribute('aria-pressed', String(l === linha));
      marcarCentro();
      anterior?.laco.apagar();
      linha.laco.desenhar({ atraso: anterior && !calmo() ? 0.22 : 0.3 });
      if (!continuar.disabled) return;
      continuar.disabled = false;
      gsap.set(caixaContinuar, { visibility: 'inherit' });
      const de = calmo() ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.94 };
      const para = calmo()
        ? { opacity: 1, duration: 0.4, ease: 'none' }
        : { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.6)', clearProps: 'transform' };
      gsap.fromTo(caixaContinuar, de, {
        ...para,
        delay: 0.3,
        overwrite: true,
        onComplete: () => continuar.setAttribute('data-chama', ''),
      });
    }

    function aoEscolher(linha) {
      if (terminado || fora.has(linha.faixa.indice)) return;
      mexeu = true;
      som?.destravar?.();
      som?.efeito?.('toque');
      // Trocar de faixa não pausa nada. Tocar de novo na escolhida não troca nada
      // (e traz a música de volta, se ela tinha parado).
      if (escolhida !== linha || !som?.estado?.tocando) som?.tocar?.(linha.faixa.indice);
      if (escolhida !== linha) marcar(linha);
    }

    /** Toque numa capa: a do centro é escolhida; uma vizinha só vem para o centro. */
    function atender(linha) {
      if (terminado || fora.has(linha.faixa.indice)) return;
      const i = vivas().indexOf(linha);
      if (i < 0) return;
      if (i === atual) {
        aoEscolher(linha);
      } else {
        mexeu = true;
        centrar(i);
      }
    }

    function aoClicar(e) {
      const linha = linhaDe(e.currentTarget);
      if (!linha || performance.now() < semClique) return;
      const i = vivas().indexOf(linha);
      // Clique sem ponteiro numa vizinha (leitor de tela): traz ao centro e já escolhe.
      if (e.detail === 0 && i >= 0 && i !== atual) {
        centrar(i);
        aoEscolher(linha);
        return;
      }
      atender(linha);
    }

    /* -- o dedo: arrasto com inércia, uma capa por gesto -- */

    function soltarDedo(e) {
      const a = arrasto;
      if (!a || e.pointerId !== a.id) return;
      arrasto = null;
      if (!a.vale) {
        // Toque parado é atendido já no pointerup: no iPhone o click às vezes some
        // depois de um arrasto. O click que vier logo depois é ignorado (semClique).
        if (e.type === 'pointerup' && e.pointerType !== 'mouse' && Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < 10) {
          const linha = linhaDe(e.target?.closest?.('.car-faixa'));
          if (linha) {
            semClique = performance.now() + 700;
            atender(linha);
          }
        }
        return;
      }
      painel.removeAttribute('data-arrastando');
      try {
        janela.releasePointerCapture(e.pointerId);
      } catch {
        /* já solto */
      }
      semClique = performance.now() + 320;
      // Dedo parado antes de soltar: sem lançamento.
      const v = e.timeStamp - a.t > 90 ? 0 : a.v;
      const origem = Math.round(a.p0);
      const andou = pos.x - origem;
      const lancado = Math.round(pos.x - (v * 190) / passo);
      // Andou um pouco e não foi lançado: passa uma mesmo assim. Nunca mais de uma.
      const alvo = Math.abs(andou) > 0.2 && lancado === origem ? origem + Math.sign(andou) : lancado;
      centrar(clamp(alvo, origem - 1, origem + 1));
    }

    janela.addEventListener('pointerdown', (e) => {
      if (terminado || arrasto?.vale || (e.pointerType === 'mouse' && e.button !== 0)) return;
      arrasto = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: pos.x, vale: false, x: e.clientX, t: e.timeStamp, v: 0 };
    });
    // Move e solta ficam na janela do navegador: se o Safari recusar a captura e o
    // dedo sair do carrossel, o gesto termina do mesmo jeito (sem trilho preso).
    const aoMover = (e) => {
      const a = arrasto;
      if (!a || e.pointerId !== a.id) return;
      const dx = e.clientX - a.x0;
      if (!a.vale) {
        // Vira arrasto com 8 px de lado, e mais de lado do que de pé: o resto é rolagem.
        if (vivas().length < 2 || Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - a.y0)) return;
        a.vale = true;
        mexeu = true;
        gsap.killTweensOf(pos);
        a.p0 = pos.x;
        try {
          janela.setPointerCapture(e.pointerId);
        } catch {
          /* o Safari pode recusar; o arrasto segue sem captura */
        }
        painel.setAttribute('data-arrastando', '');
      }
      const dt = e.timeStamp - a.t;
      if (dt > 0) a.v = a.v * 0.55 + ((e.clientX - a.x) / dt) * 0.45;
      a.x = e.clientX;
      a.t = e.timeStamp;
      const max = vivas().length - 1;
      let x = a.p0 - dx / passo;
      // Nas pontas o trilho resiste.
      if (x < 0) x *= 0.3;
      else if (x > max) x = max + (x - max) * 0.3;
      pos.x = x;
      desenhar();
    };
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', soltarDedo);
    window.addEventListener('pointercancel', soltarDedo);

    // A roda de lado (trackpad): uma capa a cada 46 px, depois um respiro de 480 ms.
    janela.addEventListener('wheel', (e) => {
      if (terminado || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      if (performance.now() < rodaAte) return;
      roda += e.deltaX;
      if (Math.abs(roda) < 46) return;
      passar(Math.sign(roda));
      roda = 0;
      rodaAte = performance.now() + 480;
    }, { passive: false });

    // O navegador rola a janela sozinho para mostrar uma capa focada; quem anda é o trilho.
    janela.addEventListener('scroll', () => {
      janela.scrollLeft = 0;
    });

    trilho.addEventListener('focusin', (e) => {
      // Foco que vem de um clique (o Chrome foca o botão no mousedown) não passa a capa:
      // senão o click seguinte já acharia a vizinha no centro e a escolheria.
      if (arrasto) return;
      const i = vivas().indexOf(linhaDe(e.target));
      if (i >= 0 && i !== atual) passar(i - atual);
    });

    for (const l of linhas) l.botao.addEventListener('click', aoClicar);
    setaAnt.addEventListener('click', () => passar(-1));
    setaProx.addEventListener('click', () => passar(1));
    continuar.addEventListener('click', () => {
      if (!escolhida || terminado) return;
      som?.efeito?.('toque');
      // Se o navegador recusou o play da escolha, este toque é a nova chance.
      if (!som?.estado?.tocando) som?.tocar?.(escolhida.faixa.indice);
      encerrar(escolhida);
    });

    const aoTeclar = (e) => {
      if (terminado || e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      const foco = document.activeElement;
      if (foco && foco !== document.body && !painel.contains(foco)) return;
      e.preventDefault();
      const naFaixa = !!linhaDe(foco);
      passar(e.key === 'ArrowLeft' ? -1 : 1);
      if (naFaixa) vivas()[atual]?.botao.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', aoTeclar);

    const aoRedimensionar = () => medir();
    window.addEventListener('resize', aoRedimensionar);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(aoRedimensionar) : null;
    ro?.observe(janela);

    // Só o disco da faixa que toca gira.
    const girar = (e = som?.estado || {}) => {
      for (const l of linhas) l.disco.giro.definir(!!e.tocando && e.indice === l.faixa.indice);
    };
    const pararGiro = som?.aoMudar?.(girar);
    girar();

    /* -- faixa que cai no meio da escolha -- */

    function semFaixa(indice) {
      const linha = linhas.find((l) => l.faixa.indice === indice);
      if (!linha || terminado) return;
      const tinhaFoco = linha.botao === document.activeElement;
      linha.botao.disabled = true;
      if (escolhida === linha) {
        escolhida = null;
        linha.botao.setAttribute('aria-pressed', 'false');
        linha.laco.apagar();
        continuar.disabled = true;
        continuar.removeAttribute('data-chama');
        gsap.to(caixaContinuar, { autoAlpha: 0, duration: 0.2, ease: 'none', overwrite: true });
      }
      if (!linhas.some((l) => !fora.has(l.faixa.indice))) {
        encerrar(null);
        return;
      }
      gsap.to(linha.botao, {
        autoAlpha: 0,
        duration: 0.35,
        ease: 'none',
        onComplete: () => {
          if (terminado) return;
          // Até aqui a faixa ainda contava entre as visíveis; agora sai do trilho.
          const centro = vivas()[atual];
          linha.li.hidden = true;
          linha.ponto.hidden = true;
          const v = vivas();
          atual = centro && centro !== linha ? v.indexOf(centro) : Math.min(atual, v.length - 1);
          gsap.killTweensOf(pos);
          pos.x = atual;
          marcarCentro();
          medir();
          if (tinhaFoco) v[atual]?.botao.focus({ preventScroll: true });
        },
      });
    }
    aoDescartar.add(semFaixa);

    limpezas.push(
      () => window.removeEventListener('pointermove', aoMover),
      () => window.removeEventListener('pointerup', soltarDedo),
      () => window.removeEventListener('pointercancel', soltarDedo),
      () => document.removeEventListener('keydown', aoTeclar),
      () => window.removeEventListener('resize', aoRedimensionar),
      () => ro?.disconnect(),
      () => pararGiro?.(),
      () => aoDescartar.delete(semFaixa),
      () => gsap.killTweensOf(pos),
      () => {
        for (const l of linhas) {
          l.disco.giro.soltar();
          l.laco.soltar();
        }
      },
    );

    /* -- entrada -- */

    function focarPrimeira() {
      if (terminado || !viaTeclado || amb?.toque) return;
      const ativo = document.activeElement;
      if (ativo && ativo !== document.body) return;
      vivas()[atual]?.botao.focus({ preventScroll: true });
    }

    /** Um balanço curto do trilho, se ela ainda não mexeu: mostra que as capas passam. */
    function convidar() {
      if (terminado || calmo() || mexeu || escolhida || arrasto || vivas().length < 2 || gsap.isTweening(pos)) return;
      const de = atual;
      gsap.timeline()
        .to(pos, { x: de + 0.2, duration: 0.55, ease: 'power2.out', onUpdate: desenhar })
        .to(pos, { x: de, duration: 0.9, ease: 'power3.inOut', onUpdate: desenhar });
    }

    function animarEntrada() {
      focarPrimeira();
      espera(700).then(focarPrimeira);
      if (titulo) revelarPalavras(titulo, textoTitulo, { intervalo: 0.12, duracao: 1.2 });
      // `from` termina na opacidade de cada um: a seta desabilitada para em 0,28.
      if (calmo()) {
        gsap.from([palco, pontos], { opacity: 0, duration: 0.8, delay: 0.3, ease: 'none', clearProps: 'opacity' });
        return;
      }
      gsap.fromTo(janela, { opacity: 0, y: 30, scale: 0.94 }, {
        opacity: 1, y: 0, scale: 1, duration: 1.6, delay: 0.35, ease: curvas.branco.entrar, clearProps: 'transform,opacity',
      });
      gsap.fromTo(linhas.map((l) => l.texto), { opacity: 0, y: 12 }, {
        opacity: 1, y: 0, duration: 1.1, delay: 1.0, ease: curvas.branco.entrar, clearProps: 'transform,opacity',
      });
      gsap.from([pontos, setaAnt, setaProx], { opacity: 0, duration: 0.9, delay: 1.3, ease: 'none', clearProps: 'opacity' });
      if (vivas().length > 1) espera(2100).then(convidar);
    }

    /* -- saída: o disco voa para o canto -- */

    async function encerrar(linha) {
      if (terminado) return;
      terminado = true;
      arrasto = null;
      painel.setAttribute('data-saindo', '');
      painel.removeAttribute('data-arrastando');
      continuar.disabled = true;
      setaAnt.disabled = true;
      setaProx.disabled = true;
      for (const l of linhas) l.botao.disabled = true;
      const voa = linha && mini && !calmo() ? linha.disco.no : null;
      try {
        if (voa) {
          const onde = vivas().indexOf(linha);
          if (onde >= 0 && onde !== atual) irPara(onde, { duracao: 0.45 });
          // As transições de CSS brigariam com o GSAP nestes três.
          for (const no of [linha.moldura, setaAnt, setaProx]) no.style.transition = 'none';
          const resto = [
            titulo, caixaContinuar, pontos, setaAnt, setaProx,
            ...linhas.map((l) => l.texto),
            ...linhas.filter((l) => l !== linha).map((l) => l.objeto),
          ].filter(Boolean);
          gsap.to(resto, { autoAlpha: 0, duration: 0.45, ease: 'none', overwrite: 'auto' });
          // A capa sai primeiro e some; só então o disco levanta voo, para a cópia
          // não pular de trás da capa para a frente dela.
          gsap.to(linha.moldura, { xPercent: -12, rotation: -3, duration: 0.6, ease: curvas.branco.entrar });
          gsap.to(linha.moldura, { autoAlpha: 0, duration: 0.34, ease: 'power1.out' });
          await espera(560);
          await voarParaOCanto(linha, voa);
        } else {
          await comoPromise(gsap.to(painel, { autoAlpha: 0, duration: 0.6, ease: 'none' }));
        }
      } catch (erro) {
        console.error('[carta] a saída do seletor falhou', erro);
      } finally {
        // Sempre: o mini de verdade visível, nenhuma cópia sobrando, nada ouvindo.
        mostrarVisual();
        for (const no of document.querySelectorAll('.musica-voador')) no.remove();
        for (const fn of limpezas) {
          try {
            fn();
          } catch (erro) {
            console.error('[carta] limpar o seletor', erro);
          }
        }
        painel.remove();
        resolver();
      }
    }

    /* -- montagem -- */

    folha.textContent = '';
    // Pintado quase invisível e sem receber toques: capas, discos e letras chegam
    // ao primeiro quadro antes de a entrada começar.
    painel.style.opacity = '0.002';
    painel.style.pointerEvents = 'none';
    folha.append(painel);
    marcarCentro();
    medir();
    (async () => {
      await quadro();
      await quadro();
      if (terminado) return;
      gsap.set(caixaContinuar, { autoAlpha: 0 });
      painel.style.opacity = '';
      painel.style.pointerEvents = '';
      medir();
      for (const l of linhas) l.laco.medir();
      animarEntrada();
    })().catch((erro) => console.error('[carta] a entrada do seletor falhou', erro));
  }

  /* ---- o voo: o disco da folha pousa no canto ------------------------------------- */

  // Chamado sempre no fim da saída, com ou sem voo: sem isso o mini fica invisível.
  function mostrarVisual() {
    if (pecas) pecas.visual.style.visibility = '';
  }

  /** O vinil da escolhida voa da folha até o canto e vira o disco do mini. */
  async function voarParaOCanto(linha, origem) {
    if (!montarMini()) return;
    const { faixa } = linha;
    const estavaEscondido = mini.hidden;
    gsap.killTweensOf(mini);
    escondendo = false;
    mini.hidden = false;
    gsap.set(mini, { autoAlpha: 1 });
    // O disco do canto só aparece quando a cópia pousa nele.
    if (estavaEscondido) pecas.visual.style.visibility = 'hidden';
    const copia = criarDisco('disco-vinil');
    // Capa presa na rede não segura o voo (nem a carta): ela entra quando chegar.
    await Promise.race([Promise.all([pecas.disco.capa(faixa), copia.capa(faixa)]), espera(900)]);

    // A origem anda dentro de transforms: o centro vem da caixa, o tamanho do layout.
    const r = origem.getBoundingClientRect();
    const de = { l: origem.offsetWidth, a: origem.offsetHeight };
    de.x = r.left + r.width / 2 - de.l / 2;
    de.y = r.top + r.height / 2 - de.a / 2;
    const para = pecas.disco.no.getBoundingClientRect();
    if (Math.min(de.l, de.a, para.width, para.height) < 4) {
      copia.giro.soltar();
      mostrarVisual();
      return;
    }

    // A cópia sai na mesma fase da origem e segue girando no voo; o mini continua dela.
    const tocando = () => !!som?.estado?.tocando && som.estado.indice === faixa.indice;
    copia.giro.fase = linha.disco.giro.fase;
    copia.giro.definir(tocando(), true);
    const voador = copia.no;
    voador.classList.add('musica-voador');
    Object.assign(voador.style, { left: `${n2(de.x)}px`, top: `${n2(de.y)}px`, width: `${de.l}px`, height: `${de.a}px` });
    document.body.append(voador);
    origem.style.visibility = 'hidden';

    const dx = para.left + para.width / 2 - (de.x + de.l / 2);
    const dy = para.top + para.height / 2 - (de.y + de.a / 2);
    // O lado e a descida têm curvas diferentes (a descida e a escala seguem a câmera
    // do mundo branco): o caminho faz um arco. O rótulo cresce de 40% para 90% do
    // disco, o tamanho do rótulo no mini.
    const voo = gsap.timeline()
      .to(voador, { x: dx, duration: 1.15, ease: 'power2.inOut' }, 0)
      .to(voador, { y: dy, scale: para.width / de.l, duration: 1.15, ease: curvas.branco.camera }, 0)
      .to(copia.rotulo, { scale: 0.9 / 0.4, duration: 0.92, ease: 'power2.inOut' }, 0.23);
    await comoPromise(voo);

    pecas.disco.giro.fase = copia.giro.fase;
    pecas.disco.giro.definir(tocando(), true);
    mostrarVisual();
    refletir(som?.estado);
    await comoPromise(gsap.to(voador, { autoAlpha: 0, duration: 0.3, delay: 0.05, ease: 'none' }));
    copia.giro.soltar();
    voador.remove();
  }

  /* ---- o mini: o disco no canto ---------------------------------------------------- */

  /** Monta o mini uma vez (no voo ou no primeiro mostrarMini). Devolve as peças, ou null sem #mini. */
  function montarMini() {
    if (pecas || !mini) return pecas;

    const disco = criarDisco('disco-mini');
    const anel = svg(`<svg class="mini-anel" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle class="mini-anel-trilho" cx="24" cy="24" r="${RAIO_ANEL}"/>
      <circle class="mini-anel-fio" cx="24" cy="24" r="${RAIO_ANEL}" transform="rotate(-90 24 24)"/></svg>`);
    const anelFio = anel.querySelector('.mini-anel-fio');
    anelFio.style.strokeDasharray = n2(VOLTA_ANEL);
    anelFio.style.strokeDashoffset = n2(VOLTA_ANEL);
    anelFio.style.opacity = '0';
    const visual = el('span', 'mini-visual', [anel, disco.no]);
    const botao = el('button', {
      type: 'button',
      class: 'mini-botao',
      'data-acao': 'mini',
      'aria-controls': 'mini-painel',
      'aria-expanded': 'false',
      'aria-label': rotulo('abrir'),
    }, visual);

    const alternar = el('button', {
      type: 'button',
      class: 'mini-alternar',
      'data-acao': 'mini-alternar',
      'aria-label': rotulo('tocar'),
    }, [svg(ICONE_TOCAR), svg(ICONE_PAUSA)]);
    const nome = el('span', 'mini-nome');
    const artista = el('span', 'mini-artista');
    const agora = el('div', 'mini-agora', [alternar, el('p', 'mini-atual', [nome, artista])]);

    // A lista só aparece quando há o que trocar (duas faixas ou mais).
    const lista = el('ul', { class: 'mini-lista', 'aria-label': limpo(dados.rotulos?.trocar) || rotulo('abrir') });
    const itens = todas.map((faixa, i) => {
      const capa = el('span', { class: 'mini-capa', 'aria-hidden': 'true' });
      imagemDa(faixa).then((img) => {
        if (img) capa.append(img);
        else capa.classList.add('sem-capa');
      });
      const botaoFaixa = el('button', {
        type: 'button',
        class: 'mini-faixa',
        'data-indice': String(faixa.indice),
        'aria-pressed': 'false',
        'aria-label': nomeDa(faixa),
      }, [
        capa,
        el('span', 'mini-faixa-nome', tituloDa(faixa)),
        faixa.artista ? el('span', 'mini-faixa-artista', faixa.artista) : null,
      ]);
      botaoFaixa.addEventListener('click', () => {
        som?.destravar?.();
        som?.efeito?.('toque');
        som?.tocar?.(faixa.indice);
      });
      const li = el('li', null, botaoFaixa);
      li.style.setProperty('--i', String(i)); // a fila de entrada da lista
      lista.append(li);
      return { faixa, li, botao: botaoFaixa };
    });

    const controle = el('input', {
      type: 'range',
      class: 'mini-volume-controle',
      min: '0',
      max: '1',
      step: '0.01',
      'aria-label': rotulo('volume'),
    });
    const volume = el('div', 'mini-volume', [svg(ICONE_VOLUME), el('span', { class: 'mini-volume-fio', 'aria-hidden': 'true' }), controle]);
    const porcento = (v) => `${Math.round(clamp(Number(v) || 0) * 100)}%`;

    // O elo do menu só existe com o bloco menu, e só aparece depois que ela já chegou lá.
    const elo = temMenu(conteudo)
      ? el('a', {
        class: 'mini-menu',
        'data-acao': 'mini-menu',
        href: enderecoDaCena('menu', {}, som),
        hidden: !menuLembrado(),
      }, el('span', null, limpo(conteudo.menu.rotulos?.voltar) || VOLTAR))
      : null;
    const acertarElo = () => {
      if (!elo) return;
      elo.href = enderecoDaCena('menu', {}, som); // leva a faixa que toca agora
      elo.hidden = !menuLembrado();
    };

    const painel = el('div', {
      class: 'mini-painel',
      id: 'mini-painel',
      role: 'group',
      'aria-label': rotulo('abrir'),
    }, [agora, lista, volume, elo]);

    mini.textContent = '';
    mini.setAttribute('aria-label', rotulo('abrir'));
    mini.append(botao, painel);

    let aberto = false;
    let quieto = false;
    let rolador = null; // o último elemento da folha que rolou por baixo do disco
    let naMao = false;
    let ultimo = 0; // o último progresso, para ver a faixa recomeçar

    /* -- abrir, fechar e recolher -- */

    function abrir(sim) {
      if (sim === aberto) return;
      aberto = sim;
      mini.toggleAttribute('data-aberto', sim);
      botao.setAttribute('aria-expanded', String(sim));
      if (sim) {
        recolher(false);
        acertarElo();
        return;
      }
      // O painel some com visibility: o foco que estava nele volta ao disco.
      if (painel.contains(document.activeElement)) botao.focus({ preventScroll: true });
      assentar();
    }

    function recolher(sim) {
      quieto = sim;
      mini.toggleAttribute('data-quieto', sim);
    }

    /** Nada da folha embaixo do disco? Olha sete pontos em volta do botão, ignorando o próprio mini. */
    function cantoLivre() {
      const r = botao.getBoundingClientRect();
      if (!r.width || !perg || perg.hidden) return true;
      const rolagem = rolador && perg.contains(rolador) ? rolador : perg;
      for (const [fx, fy] of AMOSTRAS) {
        for (const no of document.elementsFromPoint(r.left + r.width * fx, r.top + r.height * fy)) {
          // Fora da folha, o próprio mini e as caixas que contêm a rolagem não contam.
          if (mini.contains(no) || !perg.contains(no) || no.contains(rolagem)) continue;
          if (no.matches(TOCAVEL) || (no.matches(FIGURA) && rolagem.contains(no)) || temTexto(no)) return false;
        }
      }
      return true;
    }

    // Um segundo depois de a rolagem parar: o disco volta se o canto está livre.
    const assentar = debounce(() => {
      if (!aberto) recolher(naMao || !cantoLivre());
    }, 1000);

    const cruza = (alvo) => {
      const a = alvo.getBoundingClientRect();
      const b = botao.getBoundingClientRect();
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    };

    /* -- pele e posição -- */

    function vestir() {
      const raiz = document.documentElement;
      const cena = raiz.dataset.cena || '';
      const etapa = raiz.dataset.etapa || '';
      const capitulo = perg?.dataset.capitulo || '';
      const relendo = perg?.hasAttribute('data-releitura') && CAPITULOS.has(capitulo) ? capitulo : '';
      // Enquanto a folha enrola, a pele do capítulo fica até ela sair.
      if (relendo || CAPITULOS.has(cena)) mini.dataset.pele = relendo || cena;
      else if (etapa !== 'enrolando' || !mini.dataset.pele) mini.dataset.pele = 'papel';
      // No mundo branco do fim o disco fica pequeno e sem cor; relendo, a folha cobre o branco.
      mini.toggleAttribute('data-longe', !relendo && ((cena === 'mao' && etapa !== 'enrolando') || cena === 'final'));
      naMao = !relendo && cena === 'mao' && (etapa === 'olha' || etapa === 'mao-espera');
      if (naMao) {
        abrir(false);
        recolher(true);
      }
      if (semBotao()) esconderMini();
      assentar();
    }

    /* -- o que toca -- */

    const faixaAtual = (e) => validas().find((f) => f.indice === e?.indice) || validas()[0] || null;

    refletir = (e = som?.estado || {}) => {
      const tocando = !!e.tocando;
      const faixa = faixaAtual(e);
      alternar.setAttribute('aria-label', rotulo(tocando ? 'pausar' : 'tocar'));
      mini.toggleAttribute('data-tocando', tocando);
      nome.textContent = faixa ? tituloDa(faixa) : '';
      artista.textContent = faixa?.artista || '';
      if (faixa) disco.capa(faixa);
      disco.giro.definir(tocando);
      lista.hidden = validas().length < 2;
      for (const it of itens) {
        it.li.hidden = fora.has(it.faixa.indice);
        it.botao.setAttribute('aria-pressed', String(it.faixa.indice === e.indice));
      }
      // A posição é a raiz do volume; o fio não pula enquanto ela o arrasta.
      if (document.activeElement !== controle) controle.value = String(Math.sqrt(clamp(Number(e.volume) || 0)));
      controle.setAttribute('aria-valuetext', porcento(e.volume));
    };

    function marcarProgresso(p) {
      const v = clamp(Number(p) || 0);
      if (v < ultimo - 0.02) {
        // A faixa recomeçou: o anel some sem desenrolar para trás e volta do zero.
        anelFio.style.transition = 'none';
        anelFio.style.opacity = '0';
        anelFio.style.strokeDashoffset = n2(VOLTA_ANEL * (1 - v));
        anelFio.getBoundingClientRect();
        anelFio.style.transition = '';
      }
      ultimo = v;
      anelFio.style.strokeDashoffset = n2(VOLTA_ANEL * (1 - v));
      anelFio.style.opacity = v > 0.004 ? '1' : '0';
    }

    /* -- eventos (o mini é único na página: estes ouvintes ficam para sempre) -- */

    botao.addEventListener('click', () => {
      som?.destravar?.();
      som?.efeito?.('toque');
      abrir(!aberto);
    });
    alternar.addEventListener('click', () => {
      som?.destravar?.();
      const e = som?.estado || {};
      if (e.tocando) {
        som?.pausar?.();
      } else if (validas().some((f) => f.indice === e.indice)) {
        som?.retomar?.();
      } else {
        const primeira = validas()[0];
        if (primeira) som?.tocar?.(primeira.indice);
      }
    });
    controle.addEventListener('input', () => {
      const p = clamp(Number(controle.value) || 0);
      // O ouvido não é linear: com o quadrado, os 30% caem perto do meio do fio.
      som?.volume?.(p * p);
      controle.setAttribute('aria-valuetext', porcento(p * p));
    });
    elo?.addEventListener('click', acertarElo);

    document.addEventListener('pointerdown', (e) => {
      if (aberto && !mini.contains(e.target)) abrir(false);
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && aberto) abrir(false);
    });
    // O Tab que sai do painel também o fecha (o painel não prende o foco).
    mini.addEventListener('focusout', (e) => {
      if (aberto && e.relatedTarget && !mini.contains(e.relatedTarget)) abrir(false);
    });
    // Ela rola a folha por baixo do disco: ele fecha e vira uma conta na margem.
    document.addEventListener('scroll', (e) => {
      const alvo = e.target;
      if (mini.hidden || !perg || !(alvo instanceof Element) || !perg.contains(alvo)) return;
      if (!quieto && cruza(alvo)) {
        rolador = alvo;
        abrir(false);
        recolher(true);
      }
      assentar();
    }, { capture: true, passive: true });
    window.addEventListener('resize', assentar);

    const observador = new MutationObserver(vestir);
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-cena', 'data-etapa'] });
    if (perg) observador.observe(perg, { attributes: true, attributeFilter: ['data-capitulo', 'data-releitura'] });

    som?.aoMudar?.(refletir);
    som?.aoTempo?.(marcarProgresso);
    aoDescartar.add(() => {
      refletir();
      if (!validas().length) esconderMini();
    });

    pecas = { visual, disco, abrir };
    vestir();
    refletir();
    return pecas;
  }

  /* ---- API do mini ---------------------------------------------------------------- */

  function mostrarMini() {
    if (!mini || !validas().length || semBotao() || !montarMini()) return;
    if (!mini.hidden && !escondendo) return;
    // Se estava sumindo, volta de onde está.
    if (!escondendo) gsap.set(mini, { autoAlpha: 0 });
    escondendo = false;
    mini.hidden = false;
    gsap.to(mini, { autoAlpha: 1, duration: 0.9, ease: 'none', overwrite: true });
  }

  function esconderMini() {
    if (!mini || mini.hidden || escondendo) return;
    pecas?.abrir(false);
    escondendo = true;
    gsap.to(mini, {
      autoAlpha: 0,
      duration: 0.4,
      ease: 'none',
      overwrite: true,
      onComplete: () => {
        escondendo = false;
        mini.hidden = true;
      },
    });
  }

  /* ---- boot ---------------------------------------------------------------------- */

  som?.aoMudar?.((e) => {
    if (e?.falhou && e.indice >= 0) descartar(e.indice);
  });
  conferirArquivos();

  return { escolher, mostrarMini, esconderMini };
}
