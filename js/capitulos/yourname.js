/* ============================================================================
   CAPÍTULO 2: o filme (o céu do dia à noite, o cometa e o cordão)
   ============================================================================
   Montado dentro da folha do pergaminho com o `api` que js/pergaminho.js
   entrega: { conteudo, amb, som, rolagem, fundo, gsap, recursos, fechar(),
   aberto }. Lê conteudo.yourname: título, subtítulo, capa, fundo, vídeo,
   blocos (texto, cordao, imagem-cheia, imagem, par) e o fecho.

   Três peças seguem a rolagem num laço só, a partir de medidas feitas uma vez
   em medir(): o céu (yourname/tempo.js: a hora sobe do dia à noite e o cometa
   cruza e se divide no céu livre), o cordão trançado (yourname/cordao.js: se
   acende conforme a leitura passa) e o fio vermelho (do par de fotos, uma à
   outra, e depois até o sublinhado de "Guardar no bolso", que engrossa e
   acende ao fechar).

   As imagens têm um prazo comum de 7 s: um pedido que nunca responde não
   segura a folha em branco. O céu WebGL só nasce numa hora calma, com a folha
   aberta e o título assentado, e nunca espera mais de 5 s. Nada é guardado
   entre aberturas: destruir() desfaz o que foi montado.
   ========================================================================== */

import { el, clamp, suave, espera, debounce } from '../nucleo/util.js';
import { curvas, revelarPalavras } from '../nucleo/movimento.js';
import { criarTempo } from './yourname/tempo.js';
import { criarCordao, amostrar } from './yourname/cordao.js';

const NS = 'http://www.w3.org/2000/svg';
// Onde a fita vermelha fica em cada foto do par (fração da largura e da
// altura), quando o bloco não traz fioDele / fioDela.
const FIO_DELE = { x: 0.27, y: 0.86 };
const FIO_DELA = { x: 0.02, y: 0.81 };
const PRAZO_IMAGENS = 7000;

const texto = (v) => (typeof v === 'string' ? v.trim() : '');
const f1 = (v) => String(Math.round(v * 10) / 10);
// O par entra com ease-out cúbico.
const saida = (t) => 1 - (1 - clamp(t)) ** 3;

function svgVazio(classe) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('class', classe);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  return s;
}

function caminho(atributos) {
  const p = document.createElementNS(NS, 'path');
  for (const [chave, valor] of Object.entries(atributos)) p.setAttribute(chave, valor);
  return p;
}

// O que revelarPalavras montou fica só para os olhos; o leitor de tela lê a frase inteira.
function paraLeitor(p, frase) {
  p.removeAttribute('aria-label');
  p.removeAttribute('role');
  for (const filho of p.children) filho.setAttribute('aria-hidden', 'true');
  p.prepend(el('span', 'so-leitor', frase.replace(/\s+/g, ' ')));
}

// As palavras de um verso já nascem escondidas, sem esperar o primeiro quadro.
// Nada de innerHTML: o so-leitor e a contagem de palavras dependem de textContent.
function emPalavras(p, frase) {
  p.textContent = '';
  const inteiro = frase.replace(/\s+/g, ' ').trim();
  const corpo = el('span', { 'aria-hidden': 'true' });
  const palavras = [];
  inteiro.split(' ').forEach((termo, i) => {
    if (i) corpo.append(' ');
    const s = el('span', { class: 'yn-p', style: { opacity: '0', visibility: 'hidden' } }, termo);
    corpo.append(s);
    palavras.push(s);
  });
  p.append(el('span', 'so-leitor', inteiro), corpo);
  return palavras;
}

function ancora(v, padrao) {
  const x = Number(v?.x);
  const y = Number(v?.y);
  return { x: clamp(Number.isFinite(x) ? x : padrao.x), y: clamp(Number.isFinite(y) ? y : padrao.y) };
}

// A curva amostrada vira o `d` de um path, terminando no último ponto de controle.
function tracado(c, ultimo) {
  if (!c.n) return '';
  let d = `M${f1(c.x[0])} ${f1(c.y[0])}`;
  for (let i = 1; i < c.n; i++) d += `L${f1(c.x[i])} ${f1(c.y[i])}`;
  return `${d}L${f1(ultimo.x)} ${f1(ultimo.y)}`;
}

export const capitulo = {
  id: 'yourname',

  async montar(raiz, api) {
    const { conteudo, amb = {}, som, rolagem, fundo, recursos } = api;
    const gsap = api.gsap || window.gsap;
    const c = conteudo?.yourname || {};
    const blocos = Array.isArray(c.blocos) ? c.blocos : [];
    const reduzido = !!amb.reduzido;
    const baixo = amb.nivel === 'baixo';
    raiz.classList.add('yn');
    fundo.classList.add('yn-fundo');

    /* ---- 1. as imagens, antes de qualquer DOM, num prazo só ---------------- */

    const prazo = espera(PRAZO_IMAGENS).then(() => null);
    const pedir = (url, alt) => {
      const endereco = texto(url);
      if (!endereco || !recursos?.elementoImagem) return Promise.resolve(null);
      return recursos.elementoImagem(endereco, texto(alt)).catch(() => null);
    };
    const noPrazo = (pedido) => Promise.race([pedido, prazo]);
    const promessaCapa = pedir(c.capa, '');
    const [capaImg, ...imagens] = await Promise.all([
      noPrazo(promessaCapa),
      ...blocos.map((b) => {
        switch (b?.tipo) {
          case 'imagem-cheia':
          case 'imagem':
          case 'cordao':
            return noPrazo(pedir(b.arquivo, b.alt));
          case 'par':
            return Promise.all([noPrazo(pedir(b.dele, b.altDele)), noPrazo(pedir(b.dela, b.altDela))]);
          default:
            return null;
        }
      }),
    ]);

    /* ---- 2. as camadas, na ordem do DOM ------------------------------------ */

    let vivo = true;
    const svgTras = svgVazio('yn-cordao yn-cordao-tras');
    const abre = el('header', 'yn-abre');
    let capaEl = capaImg ? el('div', 'yn-capa', capaImg) : null;
    const titulos = el('div', 'yn-titulos');
    const fraseTitulo = texto(c.titulo);
    const fraseSub = texto(c.subtitulo);
    const titulo = fraseTitulo ? el('h2', 'yn-titulo') : null;
    const subtitulo = fraseSub ? el('p', 'yn-subtitulo') : null;
    titulos.append(...[titulo, subtitulo].filter(Boolean));
    abre.append(...[capaEl, titulos].filter(Boolean));
    raiz.append(svgTras, abre);

    const versos = [];
    // Só texto, cordão e encontro: é a lista que o cordão percorre.
    const ordem = [];
    let encontro = null;
    let livre = null;
    let par = null;

    const postal = (img, legenda) => {
      const figura = el('figure', 'yn-postal', el('div', 'yn-postal-foto', img));
      if (texto(legenda)) figura.append(el('figcaption', 'yn-halo', texto(legenda)));
      raiz.append(figura);
    };

    const ladoDoPar = (img, legenda, classe) => {
      const quadro = el('div', 'yn-par-quadro', img);
      const figura = el('figure', `yn-par-lado ${classe}`, quadro);
      if (texto(legenda)) figura.append(el('figcaption', 'yn-halo', texto(legenda)));
      return { figura, quadro };
    };

    blocos.forEach((b, i) => {
      const img = imagens[i];
      switch (b?.tipo) {
        case 'texto': {
          const frase = texto(b.texto);
          if (!frase) return;
          const p = el('p', 'yn-texto');
          const palavras = emPalavras(p, frase);
          const veu = el('div', { class: 'yn-veu', 'aria-hidden': 'true' });
          const secao = el('section', 'yn-verso', [veu, p]);
          raiz.append(secao);
          const verso = { tipo: 'texto', el: secao, p, veu, palavras, floresceu: false, topo: 0, alt: 0 };
          versos.push(verso);
          ordem.push(verso);
          return;
        }
        case 'cordao': {
          // Sem imagem, o bloco fica vazio: é ali que o cordão dá o nó.
          const no = el('div', 'yn-no', img || null);
          if (!img) no.setAttribute('aria-hidden', 'true');
          raiz.append(no);
          ordem.push({ tipo: 'cordao', el: no, img: !!img, topo: 0, alt: 0 });
          return;
        }
        case 'imagem-cheia': {
          if (!img) return;
          if (encontro) {
            postal(img, '');
            return;
          }
          const janela = el('div', 'yn-encontro-janela', img);
          const figura = el('figure', 'yn-encontro', el('div', 'yn-encontro-palco', janela));
          // O céu livre logo depois: é onde o cometa se divide.
          livre = el('div', { class: 'yn-ceu-livre', 'aria-hidden': 'true' });
          raiz.append(figura, livre);
          encontro = { tipo: 'encontro', el: figura, janela, img, pan: false, desloc: 0, dist: 0, topo: 0, alt: 0, ultimo: '' };
          ordem.push(encontro);
          return;
        }
        case 'imagem':
          // Sem arquivo, o bloco some junto com a legenda.
          if (img) postal(img, b.legenda);
          return;
        case 'par': {
          const [dele, dela] = img || [];
          if (dele && dela && !par) {
            const a = ladoDoPar(dele, b.legendaDele, 'yn-par-a');
            const bb = ladoDoPar(dela, b.legendaDela, 'yn-par-b');
            const caixa = el('div', 'yn-par', [a.figura, bb.figura]);
            raiz.append(caixa);
            par = {
              el: caixa, a: a.figura, b: bb.figura, quadroA: a.quadro, quadroB: bb.quadro,
              ancA: ancora(b.fioDele, FIO_DELE), ancB: ancora(b.fioDela, FIO_DELA),
              A: { x: 0, y: 0 }, B: { x: 0, y: 0 }, topo: 0, e: -1,
            };
          } else {
            if (dele) postal(dele, b.legendaDele);
            if (dela) postal(dela, b.legendaDela);
          }
          return;
        }
        default:
      }
    });

    // Sem encontro, o céu livre entra depois de 60% dos itens do cordão.
    if (!livre) {
      livre = el('div', { class: 'yn-ceu-livre', 'aria-hidden': 'true' });
      const depoisDe = ordem[Math.floor(0.6 * ordem.length)];
      if (depoisDe) depoisDe.el.after(livre);
      else raiz.append(livre);
    }

    const fraseFechar = texto(c.fechar);
    const botao = el('button', { type: 'button', class: 'yn-fechar', dataset: { acao: 'fechar-capitulo' } });
    if (fraseFechar) {
      botao.append(el('span', 'yn-fechar-texto', fraseFechar));
    } else {
      // Sem texto, o fecho é só o fio sublinhado; o nome fica para o leitor de tela.
      botao.classList.add('so-fio');
      botao.setAttribute('aria-label', texto(c.rotuloFechar) || 'Guardar no bolso');
    }
    const fim = el('footer', 'yn-fim', botao);
    raiz.append(fim);

    const svgFrente = svgVazio('yn-cordao yn-cordao-frente');
    const svgFio = svgVazio('yn-fio');
    const fioPar = { caminhos: [caminho({ class: 'yn-fio-sombra', pathLength: '1' }), caminho({ class: 'yn-fio-linha', pathLength: '1' })], valor: '' };
    const fioResto = { caminhos: [caminho({ class: 'yn-fio-sombra', pathLength: '1' }), caminho({ class: 'yn-fio-linha', pathLength: '1' })], valor: '' };
    // As duas sombras por baixo, as duas linhas por cima.
    svgFio.append(fioPar.caminhos[0], fioResto.caminhos[0], fioPar.caminhos[1], fioResto.caminhos[1]);
    const ponta = el('div', { class: 'yn-ponta', 'aria-hidden': 'true' });
    raiz.append(svgFrente, svgFio, ponta);

    /* ---- 3. o céu, as placas e o cordão ------------------------------------ */

    const placas = [];
    let liberarCeu = () => {};
    const quandoCeu = new Promise((resolve) => {
      liberarCeu = resolve;
    });
    const tempo = criarTempo({
      fundo,
      amb,
      quando: quandoCeu,
      aoQuadro: acertarLuz,
      aoDividir: () => som?.efeito?.('brilho'),
      aoTrocar: (tipo) => raiz.classList.toggle('yn-leve', tipo !== 'webgl'),
    });
    raiz.classList.toggle('yn-leve', tempo.tipo !== 'webgl');

    if (texto(c.fundo)) {
      const img = el('img', { class: 'yn-placa', alt: '', 'aria-hidden': 'true', decoding: 'async', draggable: 'false' });
      img.addEventListener('error', () => img.remove(), { once: true });
      img.src = texto(c.fundo);
      fundo.append(img);
      placas.push(img);
    }
    if (texto(c.video)) {
      const video = el('video', { class: 'yn-placa', 'aria-hidden': 'true', muted: true, playsinline: true, loop: true, autoplay: true, preload: 'auto' });
      video.muted = true;
      video.playsInline = true;
      video.addEventListener('error', () => video.remove(), { once: true });
      video.src = texto(c.video);
      fundo.append(video);
      placas.push(video);
      video.play?.()?.catch?.(() => {});
    }

    const cordao = criarCordao({ tras: svgTras, frente: svgFrente });

    /* ---- 4. título e subtítulo florescem já --------------------------------- */

    const revTitulo = titulo
      ? revelarPalavras(titulo, fraseTitulo, {
        duracao: 2, intervalo: 0.17, atraso: reduzido ? 0.4 : 1.1, subida: '0.3em', curva: curvas.yourname.florescer,
      })
      : Promise.resolve();
    let revSub = Promise.resolve();
    if (subtitulo) {
      revSub = revelarPalavras(subtitulo, fraseSub, {
        duracao: 1.8, intervalo: 0.09, atraso: reduzido ? 0.8 : 1.9, subida: '0.25em', curva: curvas.yourname.florescer,
      });
      paraLeitor(subtitulo, fraseSub);
    }

    /* ---- medidas ------------------------------------------------------------ */

    const M = { vh: 0, w: 0, altura: 0, linha: 0, fimAbre: 0, comecaK: 0, divide: 0, acabaK: 0, uy: 0, fioPar: 0, ultimoPc: -1 };
    let ultimoTam = '';
    let sujo = true;
    let relogio = 0;
    let ultimoT = 0;
    let id = 0;
    let pontaAcesa = false;

    const lerY = () => rolagem?.y ?? rolagem?.el?.scrollTop ?? 0;
    const assinatura = () => `${raiz.clientWidth}x${rolagem?.el?.clientHeight || innerHeight}x${raiz.scrollHeight}`;

    // Posição dentro do capítulo, somando os offsets até a raiz.
    function topoDe(no) {
      let y = 0;
      for (let n = no; n && n !== raiz; n = n.offsetParent) y += n.offsetTop;
      return y;
    }
    function esquerdaDe(no) {
      let x = 0;
      for (let n = no; n && n !== raiz; n = n.offsetParent) x += n.offsetLeft;
      return x;
    }
    const naFoto = (quadro, anc) => ({
      x: esquerdaDe(quadro) + quadro.offsetWidth * anc.x,
      y: topoDe(quadro) + quadro.offsetHeight * anc.y,
    });

    function medir() {
      const vh = rolagem?.el?.clientHeight || innerHeight;
      const w = raiz.clientWidth || innerWidth;
      M.vh = vh;
      M.w = w;
      raiz.style.setProperty('--yn-vh', `${vh}px`);

      if (encontro) {
        // Celular em pé: a foto do encontro passa de lado (panorâmica).
        const pan = !reduzido && w < vh * 0.9;
        if (pan !== encontro.pan) {
          encontro.janela.style.transform = '';
          encontro.img.style.transform = '';
          encontro.ultimo = '';
        }
        encontro.pan = pan;
        encontro.el.classList.toggle('pan', pan);
        // Quanto da largura da imagem aparece, a partir da esquerda (o CSS lê o mesmo valor).
        const recorte = clamp(parseFloat(getComputedStyle(encontro.el).getPropertyValue('--yn-recorte')) || 0.7, 0.3, 1);
        const alt = vh * 0.56;
        // recursos.js já põe o tamanho natural em width/height: vale mesmo antes de a cópia decodificar.
        const natW = encontro.img.naturalWidth || Number(encontro.img.getAttribute('width')) || 860;
        const natH = encontro.img.naturalHeight || Number(encontro.img.getAttribute('height')) || 484;
        const larg = ((alt * natW) / natH) * recorte;
        encontro.desloc = pan ? Math.max(0, larg - w) : 0;
        encontro.dist = Math.round(encontro.desloc * 1.6);
        if (pan) raiz.style.setProperty('--yn-pan', `${encontro.dist}px`);
        else raiz.style.removeProperty('--yn-pan');
        encontro.el.style.setProperty('--yn-janela', `${Math.round(larg)}px`);
      }

      M.fimAbre = topoDe(abre) + abre.offsetHeight;
      for (const item of ordem) {
        item.topo = topoDe(item.el);
        item.alt = item.el.offsetHeight;
      }
      const livreTopo = topoDe(livre);
      M.comecaK = livreTopo - vh * 0.55;
      M.divide = livreTopo + livre.offsetHeight * 0.5 - vh * 0.5;
      M.acabaK = M.divide + vh * 0.85;
      if (par) par.topo = topoDe(par.el);
      M.altura = raiz.scrollHeight;
      M.linha = vh * 0.62;

      construirCordao();
      construirFio();
      tempo.redimensionar();
      tempo.assentar();
      ultimoTam = assinatura();
      par && (par.e = -1);
      M.ultimoPc = -1;
      atualizar();
    }

    /* ---- o cordão: a linha que ele segue ------------------------------------ */

    function construirCordao() {
      const { w, vh } = M;
      const lado = clamp(w * 0.035, 10, 26);
      const pts = [
        { x: 0.8 * w, y: M.fimAbre - 0.16 * vh, camada: 'tras' },
        { x: 0.9 * w, y: M.fimAbre + 0.02 * vh, camada: 'tras' },
      ];
      let direita = true;
      let iVerso = 0;
      for (const item of ordem) {
        const t = item.topo;
        const h = item.alt;
        if (item.tipo === 'texto') {
          const p = item.p;
          const livreDir = w - (p.offsetLeft + p.offsetWidth);
          const livreEsq = p.offsetLeft;
          // A margem direita é do fio de progresso do pergaminho: o cordão só
          // passa por ela se sobra espaço de verdade.
          const xLivre = livreDir > 90 && livreDir > livreEsq
            ? w - Math.min(livreDir / 2, 70)
            : Math.max(0.6 * lado, Math.min(livreEsq / 2, 70));
          const naDireita = xLivre > w / 2;
          const xOposto = naDireita ? 0.16 * w : 0.84 * w;
          const topoTexto = p.offsetTop / h;
          if (iVerso % 2 === 0) {
            // Verso par: o cordão cruza por trás do texto.
            pts.push(
              { x: xOposto, y: t + 0.03 * h, camada: 'tras' },
              { x: (xOposto + xLivre) / 2, y: t + 0.62 * topoTexto * h, camada: 'tras' },
              { x: xLivre, y: t + 1.05 * topoTexto * h, camada: 'tras' },
              { x: xLivre + (naDireita ? -6 : 6), y: t + 0.62 * h, camada: 'tras' },
              { x: xLivre, y: t + 0.92 * h, camada: 'tras' },
            );
          } else {
            // Verso ímpar: desce pela margem, pela frente.
            const d = naDireita ? -1 : 1;
            pts.push(
              { x: xLivre + d * lado * 0.6, y: t + 0.12 * h, camada: 'frente' },
              { x: xLivre, y: t + 0.5 * h, camada: 'frente' },
              { x: xLivre + d * lado * 0.6, y: t + 0.88 * h, camada: 'frente' },
            );
          }
          direita = naDireita;
          iVerso += 1;
        } else if (item.tipo === 'cordao' && item.img) {
          pts.push({ x: 0.5 * w, y: t + 0.15 * h, camada: 'tras' }, { x: 0.5 * w, y: t + 0.85 * h, camada: 'tras' });
        } else if (item.tipo === 'cordao') {
          // O nó: uma volta e um pouco, na frente, e o cordão sai do outro lado.
          const cx = 0.5 * w;
          const cy = t + 0.5 * h;
          const r = Math.min(0.15 * w, 0.3 * h, 90);
          const dir = direita ? 1 : -1;
          pts.push({ x: cx + dir * 2.1 * r, y: t + 0.06 * h, camada: 'frente' });
          for (let i = 0; i <= 14; i++) {
            const ang = -Math.PI / 2 + dir * (i / 14) * 1.18 * 2 * Math.PI - dir * 0.5;
            const rr = r * (0.92 + 0.08 * Math.sin(0.9 * i));
            pts.push({
              x: cx + Math.cos(ang) * rr * dir,
              y: cy + Math.sin(ang) * rr * 0.9 + (i / 14 - 0.5) * 0.5 * r,
              camada: 'frente',
            });
          }
          pts.push({ x: cx - dir * 2 * r, y: t + 0.96 * h, camada: 'frente' });
          direita = !direita;
        } else if (item.tipo === 'encontro') {
          // O cordão para no encontro: o que vem depois fica fora da trança.
          const f = item.pan ? 0.3 * vh : 0.45 * h;
          pts.push({ x: 0.5 * w, y: t + 0.25 * f, camada: 'tras' }, { x: 0.45 * w, y: t + f, camada: 'tras' });
          break;
        }
      }
      if (pts.length >= 4) cordao.construir(pts, { linha: M.linha });
      else cordao.destruir();
    }

    /* ---- o fio: do par até o sublinhado do botão ---------------------------- */

    function desenharFioPar(t) {
      const { A, B } = par;
      const dx = B.x - A.x;
      const folga = 22 + Math.abs(dx) * 0.14;
      const s = reduzido ? 0 : Math.sin(t * 0.85) * 5 + Math.sin(t * 1.9 + 1.3) * 1.6;
      const fundoY = Math.max(A.y, B.y) + folga;
      const d = `M${f1(A.x)} ${f1(A.y)}C${f1(A.x + dx * 0.3)} ${f1(fundoY + s)} ${f1(B.x - dx * 0.3)} ${f1(fundoY - s * 0.6)} ${f1(B.x)} ${f1(B.y)}`;
      for (const p of fioPar.caminhos) p.setAttribute('d', d);
    }

    function construirFio() {
      const { w, vh } = M;
      const margem = w < 600 ? 9 : clamp(w * 0.04, 12, 28);
      const bx = esquerdaDe(botao);
      const uy = topoDe(botao) + botao.offsetHeight - 14;
      const u0 = { x: bx + 14, y: uy };
      const u1x = bx + botao.offsetWidth - 14;
      M.uy = uy;
      // O sublinhado: uma onda de 1,6 px em seis trechos.
      const sublinhado = [];
      for (let i = 1; i <= 6; i++) {
        sublinhado.push({ x: u0.x + ((u1x - u0.x) * i) / 6, y: uy + (i === 6 ? 0 : (i % 2 ? 1.6 : -1.6)) });
      }

      let pts;
      if (par) {
        par.A = naFoto(par.quadroA, par.ancA);
        par.B = naFoto(par.quadroB, par.ancB);
        const B = par.B;
        const fundoPar = topoDe(par.el) + par.el.offsetHeight;
        const e = fim.offsetTop - fundoPar;
        pts = [B, { x: B.x - 4, y: B.y + 40 }, { x: Math.max(margem, B.x - 0.12 * w), y: fundoPar + 30 }];
        // Muito chão entre o par e o fim: o fio desce pela margem esquerda.
        if (e > 0.5 * vh) pts.push({ x: margem + (w < 600 ? 2 : 6), y: fundoPar + 0.35 * e }, { x: margem, y: fundoPar + 0.7 * e });
        desenharFioPar(relogio);
      } else {
        pts = [{ x: margem, y: uy - 0.3 * vh }];
      }
      pts.push({ x: u0.x - 30, y: uy - 46 }, u0, ...sublinhado);
      const d = tracado(amostrar(pts, 3), pts[pts.length - 1]);
      for (const p of fioResto.caminhos) p.setAttribute('d', d);
    }

    // Desenha a fração f do trecho (pathLength 1). Zero esconde: a ponta redonda faria um ponto.
    function tracar(trecho, f) {
      const valor = f > 0 ? `${f.toFixed(4)} 2` : '0 2';
      if (valor === trecho.valor) return;
      trecho.valor = valor;
      for (const p of trecho.caminhos) {
        p.style.strokeDasharray = valor;
        p.style.visibility = f > 0 ? '' : 'hidden';
      }
    }

    function balancar() {
      if (reduzido || !par) return;
      const y = lerY();
      if (par.A.y < y - 60 || par.A.y > y + M.vh + 60) return;
      desenharFioPar(relogio);
    }

    /* ---- a luz da hora nos véus e nas placas -------------------------------- */

    function acertarLuz(e) {
      const opacidade = e.veu.toFixed(3);
      // --d: quanto de azul de dia por cima do índigo da noite.
      const d = (1 - suave(e.hora / 0.5)).toFixed(3);
      for (const v of versos) {
        v.veu.style.opacity = opacidade;
        v.veu.style.setProperty('--d', d);
      }
      if (placas.length) {
        const h = e.hora;
        const o = (suave((h - 0.24) / 0.12) * (1 - suave((h - 0.6) / 0.12))).toFixed(3);
        for (const p of placas) p.style.opacity = o;
      }
    }

    /* ---- o verso que floresce ----------------------------------------------- */

    function florescer(v) {
      v.floresceu = true;
      const palavras = v.palavras;
      if (!palavras.length) return;
      if (!gsap) {
        for (const s of palavras) s.style.cssText = '';
        return;
      }
      if (reduzido) {
        gsap.fromTo(palavras, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.9, stagger: 0.02, ease: 'none' });
        return;
      }
      // Cada linha floresce depois da anterior; as palavras chegam ao centro do verso.
      const centro = v.p.offsetLeft + v.p.offsetWidth / 2;
      let linha = -1;
      let topoLinha = null;
      let j = 0;
      const dados = palavras.map((s) => {
        if (topoLinha === null || Math.abs(s.offsetTop - topoLinha) > 2) {
          linha += 1;
          topoLinha = s.offsetTop;
          j = 0;
        } else {
          j += 1;
        }
        return { atraso: linha * 0.2 + j * 0.035, x: (s.offsetLeft + s.offsetWidth / 2 - centro) * 0.07 };
      });
      const de = { autoAlpha: 0, y: 6, x: (i) => dados[i].x };
      const para = { autoAlpha: 1, y: 0, x: 0, duration: 2.1, stagger: (i) => dados[i].atraso, ease: curvas.yourname.florescer };
      if (!baixo) {
        de.filter = 'blur(7px)';
        para.filter = 'blur(0px)';
        // Texto parado com filter custa composição à toa.
        para.onComplete = () => gsap.set(palavras, { clearProps: 'filter' });
      }
      gsap.fromTo(palavras, de, para);
    }

    /* ---- a leitura, a cada quadro com rolagem -------------------------------- */

    function atualizar() {
      sujo = false;
      const y = lerY();
      const { vh, w } = M;

      // O céu: a hora pela página inteira; o cometa pelo céu livre.
      const max = Math.max(1, M.altura - vh);
      let k = 0;
      if (y > M.comecaK) {
        k = y < M.divide
          ? (y - M.comecaK) / (M.divide - M.comecaK)
          : 1 + (y - M.divide) / (M.acabaK - M.divide);
      }
      tempo.definir({ hora: clamp(y / max), k: clamp(k, 0, 2), rol: y / vh });

      // A capa e os títulos ficam para trás.
      const pc = clamp(y / (vh * 0.85));
      if (pc < 1 || M.ultimoPc < 1) {
        if (capaEl) {
          if (reduzido) {
            capaEl.style.opacity = (1 - pc).toFixed(3);
          } else {
            capaEl.style.transform = `translate3d(0, ${f1(-y * 0.32)}px, 0) scale(${(1 + pc * 0.04).toFixed(4)})`;
            capaEl.style.opacity = (1 - suave(pc * 1.1)).toFixed(3);
          }
        }
        if (reduzido) {
          titulos.style.opacity = (1 - suave(pc * 1.2)).toFixed(3);
        } else {
          titulos.style.transform = `translate3d(0, ${f1(-y * 0.12)}px, 0)`;
          titulos.style.opacity = (1 - suave(pc * 1.25)).toFixed(3);
        }
      }
      M.ultimoPc = pc;

      for (const v of versos) {
        if (!v.floresceu && y + vh * 0.8 > v.topo + v.alt * 0.25) florescer(v);
      }

      // O cordão se acende até a linha de leitura; a ponta de luz fica no último período.
      const acesa = cordao.revelar(y);
      if (acesa && !reduzido) {
        ponta.style.opacity = '1';
        ponta.style.zIndex = acesa.camada === 'frente' ? '3' : '1';
        ponta.style.transform = `translate3d(${f1(acesa.x)}px, ${f1(acesa.y)}px, 0)`;
        pontaAcesa = true;
      } else if (pontaAcesa) {
        ponta.style.opacity = '0';
        pontaAcesa = false;
      }

      if (encontro && !reduzido) {
        let t;
        if (encontro.pan) {
          const p = encontro.dist ? clamp((y - encontro.topo) / encontro.dist) : 0;
          const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
          t = `translate3d(${f1(-encontro.desloc * (p * 0.7 + e * 0.3))}px, 0, 0)`;
          if (t !== encontro.ultimo) encontro.janela.style.transform = t;
        } else {
          const p = clamp((y + vh - encontro.topo) / (vh + encontro.alt));
          t = `scale(${(1.07 - 0.07 * p).toFixed(4)})`;
          if (t !== encontro.ultimo) encontro.img.style.transform = t;
        }
        encontro.ultimo = t;
      }

      if (par) {
        // As duas fotos chegam de lados opostos.
        const e = saida((y + vh - par.topo) / (vh * 0.55));
        if (e !== par.e) {
          par.e = e;
          if (reduzido) {
            par.a.style.opacity = e.toFixed(3);
            par.b.style.opacity = e.toFixed(3);
          } else {
            const r = 1 - e;
            par.a.style.transform = `translate3d(${f1(-r * w * 0.32)}px, ${f1(r * 30)}px, 0) rotate(${f1(-3 * r)}deg)`;
            par.b.style.transform = `translate3d(${f1(r * w * 0.32)}px, ${f1(r * 60)}px, 0) rotate(${f1(3 * r)}deg)`;
            // Nunca 0: a foto continua rasterizada e não engasga ao aparecer.
            const o = Math.max(0.004, clamp(e * 1.6)).toFixed(3);
            par.a.style.opacity = o;
            par.b.style.opacity = o;
          }
        }
        // Assentadas as duas, o fio vai de uma à outra.
        M.fioPar = e < 0.995 ? 0 : clamp((y + vh * 0.78 - par.A.y) / (vh * 0.24));
        tracar(fioPar, M.fioPar);
      }

      // O resto do fio só começa quando o do par terminou (senão o fio pularia).
      const ini = par ? (M.fioPar >= 1 ? par.B.y : Infinity) : M.uy - vh * 0.25;
      tracar(fioResto, clamp((y + vh * 0.8 - ini) / Math.max(1, M.uy - ini)));
    }

    function laco(agora) {
      if (!vivo) return;
      id = requestAnimationFrame(laco);
      const dt = ultimoT ? Math.min(0.1, (agora - ultimoT) / 1000) : 0.016;
      ultimoT = agora;
      relogio += dt;
      if (sujo) atualizar();
      if (M.fioPar > 0) balancar();
    }

    /* ---- liga tudo ----------------------------------------------------------- */

    medir();
    id = requestAnimationFrame(laco);
    const pararRolagem = rolagem?.aoRolar?.(() => {
      sujo = true;
    });

    const remedir = debounce(() => {
      if (vivo && assinatura() !== ultimoTam) medir();
    }, 160);
    let observador = null;
    if (typeof ResizeObserver === 'function') {
      observador = new ResizeObserver(() => remedir());
      if (rolagem?.el) observador.observe(rolagem.el);
      observador.observe(raiz);
    } else {
      addEventListener('resize', remedir);
    }
    document.fonts?.ready?.then(() => {
      if (vivo) medir();
    });

    // A capa que chega depois do prazo surge devagar, e o título desce para dar lugar, sem pulo.
    if (!capaImg && texto(c.capa) && !reduzido) {
      promessaCapa.then((img) => {
        if (!vivo || !img || lerY() > M.vh * 0.3) return;
        const antes = titulos.getBoundingClientRect().top;
        capaEl = el('div', 'yn-capa yn-tarde', img);
        abre.insertBefore(capaEl, titulos);
        const depois = titulos.getBoundingClientRect().top;
        titulos.style.setProperty('--yn-desce', `${f1(antes - depois)}px`);
        M.ultimoPc = -1;
        sujo = true;
        remedir();
      });
    }

    // O céu WebGL nasce com a folha aberta e o título assentado; nunca depois de 5 s.
    const soltarCeu = () => liberarCeu();
    Promise.race([Promise.all([api.aberto, revTitulo, revSub]), espera(5000)]).then(soltarCeu, soltarCeu);

    botao.addEventListener('click', async () => {
      if (botao.disabled || !vivo) return;
      botao.disabled = true;
      // O fio engrossa e acende, o texto do botão se recolhe e a noite se fecha.
      raiz.classList.add('yn-fechando');
      tempo.encerrar();
      som?.efeito?.('toque');
      await espera(reduzido ? 500 : 1100);
      if (vivo) api.fechar?.();
    });

    return {
      destruir() {
        if (!vivo) return;
        vivo = false;
        cancelAnimationFrame(id);
        pararRolagem?.();
        remedir.cancelar();
        observador?.disconnect();
        removeEventListener('resize', remedir);
        gsap?.killTweensOf?.(raiz.querySelectorAll('.palavra, .yn-p'));
        cordao.destruir();
        tempo.destruir();
        for (const p of placas) {
          p.pause?.();
          p.removeAttribute('src');
          p.remove();
        }
        raiz.classList.remove('yn', 'yn-leve', 'yn-fechando');
        raiz.style.removeProperty('--yn-vh');
        raiz.style.removeProperty('--yn-pan');
        fundo.classList.remove('yn-fundo');
        raiz.textContent = '';
        fundo.textContent = '';
      },
    };
  },
};
