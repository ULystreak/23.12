// Capítulo 2: o filme. Um céu que passa do dia à noite com a rolagem.
//
//   export const capitulo = { id, montar(raiz, api) → { destruir() } }
//   api = { conteudo, amb, som, rolagem, fundo, gsap, ScrollTrigger, fechar(), recursos }
//
// Blocos (conteudo.yourname.blocos), em ordem livre:
//   { tipo: 'texto', texto }
//   { tipo: 'cordao', arquivo? }
//   { tipo: 'imagem-cheia', arquivo, alt }
//   { tipo: 'imagem', arquivo, alt, legenda }
//   { tipo: 'par', dele, dela, legendaDele, legendaDela, fioDele?, fioDela? }
//
// Peças:
//   yourname/tempo.js    relógio do céu (hora e cometa amortecidos) e quem pinta
//   yourname/ceu.js      o céu em WebGL puro (shader em ceu-glsl.js)
//   yourname/ceu-leve.js o mesmo céu sem WebGL
//   yourname/paleta.js   as cores de cada hora e a geometria do cometa
//   yourname/cordao.js   o cordão trançado e a linha central suave
//
// Tudo o que mexe com a rolagem é lido num laço só (requestAnimationFrame), a
// partir de medidas tiradas uma vez em `medir()` (refeitas quando muda o tamanho).
// Gancho para os testes (não mudar): [data-acao="fechar-capitulo"].

import { el, clamp, suave, espera, debounce } from '../nucleo/util.js';
import { curvas, revelarPalavras } from '../nucleo/movimento.js';
import { criarTempo } from './yourname/tempo.js';
import { criarCordao, amostrar } from './yourname/cordao.js';

const NS = 'http://www.w3.org/2000/svg';
const svgVazio = (classe) => {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('class', classe);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  return s;
};
const caminho = (atributos) => {
  const p = document.createElementNS(NS, 'path');
  for (const [k, v] of Object.entries(atributos)) p.setAttribute(k, v);
  return p;
};
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const saida = (t) => 1 - Math.pow(1 - clamp(t), 3);

// Onde a fita vermelha está em cada imagem do par (0..1), se o conteúdo não disser.
const FIO_DELE = { x: 0.27, y: 0.86 };
const FIO_DELA = { x: 0.02, y: 0.81 };

/**
 * O texto inteiro num <span class="so-leitor"> (o leitor de tela lê a frase de
 * uma vez, mesmo com as palavras ainda escondidas) e os pedaços animados num
 * invólucro aria-hidden.
 */
function paraLeitor(p, texto) {
  p.removeAttribute('aria-label');
  if (p.getAttribute('role') === 'text') p.removeAttribute('role');
  for (const filho of p.children) filho.setAttribute('aria-hidden', 'true');
  p.prepend(el('span', 'so-leitor', String(texto).replace(/\s+/g, ' ').trim()));
}

/** Divide um texto em palavras (spans) para florescer; devolve as palavras. */
function emPalavras(p, texto) {
  p.textContent = '';
  const palavras = [];
  const partes = String(texto).split(/(\s+)/);
  for (const parte of partes) {
    if (!parte) continue;
    if (/^\s+$/.test(parte)) { p.append(document.createTextNode(' ')); continue; }
    const s = document.createElement('span');
    s.className = 'yn-p';
    // nasce escondida (o mesmo que gsap.set autoAlpha 0, sem o custo de uma
    // animação da GSAP para cada uma das centenas de palavras na montagem)
    s.style.opacity = '0';
    s.style.visibility = 'hidden';
    s.textContent = parte;
    p.append(s);
    palavras.push(s);
  }
  const pedacos = document.createElement('span');
  pedacos.setAttribute('aria-hidden', 'true');
  pedacos.append(...p.childNodes);
  p.append(pedacos);
  p.prepend(el('span', 'so-leitor', String(texto).replace(/\s+/g, ' ').trim()));
  return palavras;
}

export const capitulo = {
  id: 'yourname',

  async montar(raiz, api) {
    const { amb, som, recursos, gsap, rolagem } = api;
    const c = api.conteudo.yourname || {};
    const blocos = Array.isArray(c.blocos) ? c.blocos : [];
    const reduzido = !!amb.reduzido;
    const baixo = amb.nivel === 'baixo';
    let vivo = true;

    raiz.classList.add('yn');
    api.fundo.classList.add('yn-fundo');

    // ---- carrega as imagens todas de uma vez (falta = null, e a peça some) -----------
    // Um pedido que nunca responde não segura a folha em branco: as imagens têm 7 s,
    // juntas, e a que não chegar fica de fora (o pedido da pré-carga continua o mesmo).
    const prazo = espera(7000).then(() => null);
    const img = (url, alt = '') => Promise.race([recursos.elementoImagem(url, alt), prazo]);
    const pedidoCapa = recursos.elementoImagem(c.capa, '');
    const [capa, ...imagensBlocos] = await Promise.all([
      Promise.race([pedidoCapa, prazo]),
      ...blocos.map((b) => {
        if (!b) return null;
        if (b.tipo === 'imagem-cheia' || b.tipo === 'imagem') return img(b.arquivo, b.alt || '');
        if (b.tipo === 'cordao') return img(b.arquivo, '');
        if (b.tipo === 'par') return Promise.all([img(b.dele, b.altDele || ''), img(b.dela, b.altDela || '')]);
        return null;
      }),
    ]);
    if (!vivo) return { destruir() {} };

    // ---- camadas de desenho -----------------------------------------------------------
    const svgTras = svgVazio('yn-cordao yn-cordao-tras');
    const svgFrente = svgVazio('yn-cordao yn-cordao-frente');
    const svgFio = svgVazio('yn-fio');
    const ponta = el('div', { class: 'yn-ponta', 'aria-hidden': 'true' });
    raiz.append(svgTras);

    // ---- capa e título -------------------------------------------------------------
    const tituloEl = c.titulo ? el('h2', 'yn-titulo', c.titulo) : null;
    const subEl = c.subtitulo ? el('p', 'yn-subtitulo', c.subtitulo) : null;
    let capaEl = capa ? el('div', 'yn-capa', capa) : null;
    const titulosEl = tituloEl || subEl ? el('div', 'yn-titulos', [tituloEl, subEl]) : null;
    const abre = el('header', 'yn-abre', [capaEl, titulosEl]);
    raiz.append(abre);

    // ---- blocos ------------------------------------------------------------------------
    const versos = [];        // { sec, veu, p, palavras, visto }
    const nos = [];           // { el, imagem }
    let encontro = null;      // { sec, palco, janela, img, pan }
    let livre = null;         // o trecho de céu onde o cometa se divide
    let par = null;           // { sec, a, b, quadroA, quadroB, ancA, ancB }
    let postais = [];
    const ordem = [];         // { tipo, el } na ordem da página (para o cordão)

    blocos.forEach((bloco, i) => {
      const imagem = imagensBlocos[i];
      switch (bloco?.tipo) {
        case 'texto': {
          if (!bloco.texto) break;
          const veu = el('div', { class: 'yn-veu', 'aria-hidden': 'true' });
          const p = el('p', 'yn-texto');
          const palavras = emPalavras(p, bloco.texto);
          const sec = el('section', 'yn-verso', [veu, p]);
          const v = { sec, veu, p, palavras, visto: false };
          versos.push(v);
          raiz.append(sec);
          ordem.push({ tipo: 'texto', el: sec, verso: v });
          break;
        }
        case 'cordao': {
          const no = el('div', { class: 'yn-no', 'aria-hidden': imagem ? null : 'true' }, imagem || null);
          nos.push({ el: no, imagem: !!imagem });
          raiz.append(no);
          ordem.push({ tipo: 'cordao', el: no, imagem: !!imagem });
          break;
        }
        case 'imagem-cheia': {
          if (!imagem) break;
          if (encontro) {
            // Uma segunda imagem cheia entra como postal sem legenda.
            const f = el('figure', 'yn-postal', el('div', 'yn-postal-foto', imagem));
            postais.push(f); raiz.append(f);
            break;
          }
          const janela = el('div', 'yn-encontro-janela', imagem);
          const palco = el('div', 'yn-encontro-palco', janela);
          const sec = el('figure', 'yn-encontro', palco);
          encontro = { sec, palco, janela, img: imagem, pan: false, larguraImg: 0, dist: 0 };
          raiz.append(sec);
          ordem.push({ tipo: 'encontro', el: sec });
          // Logo depois do encontro, um trecho de céu livre: é ali que o cometa se parte.
          livre = el('div', { class: 'yn-ceu-livre', 'aria-hidden': 'true' });
          raiz.append(livre);
          break;
        }
        case 'imagem': {
          if (!imagem) break;
          const f = el('figure', 'yn-postal', [
            el('div', 'yn-postal-foto', imagem),
            bloco.legenda ? el('figcaption', 'yn-halo', bloco.legenda) : null,
          ]);
          postais.push(f);
          raiz.append(f);
          break;
        }
        case 'par': {
          const [dele, dela] = imagem || [];
          if (dele && dela) {
            if (bloco.legendaDele) dele.alt = dele.alt || '';
            const quadroA = el('div', 'yn-par-quadro', dele);
            const quadroB = el('div', 'yn-par-quadro', dela);
            const a = el('figure', 'yn-par-lado yn-par-a', [quadroA, bloco.legendaDele ? el('figcaption', 'yn-halo', bloco.legendaDele) : null]);
            const b = el('figure', 'yn-par-lado yn-par-b', [quadroB, bloco.legendaDela ? el('figcaption', 'yn-halo', bloco.legendaDela) : null]);
            const sec = el('div', 'yn-par', [a, b]);
            const anc = (v, padrao) => ({
              x: clamp(Number.isFinite(v?.x) ? v.x : padrao.x),
              y: clamp(Number.isFinite(v?.y) ? v.y : padrao.y),
            });
            par = { sec, a, b, quadroA, quadroB, ancA: anc(bloco.fioDele, FIO_DELE), ancB: anc(bloco.fioDela, FIO_DELA) };
            raiz.append(sec);
          } else if (dele || dela) {
            const f = el('figure', 'yn-postal', [
              el('div', 'yn-postal-foto', dele || dela),
              (dele ? bloco.legendaDele : bloco.legendaDela) ? el('figcaption', 'yn-halo', dele ? bloco.legendaDele : bloco.legendaDela) : null,
            ]);
            postais.push(f);
            raiz.append(f);
          }
          break;
        }
        default:
          break;
      }
    });

    // Sem a imagem do encontro, o céu livre do cometa fica depois do bloco do meio.
    if (!livre) {
      livre = el('div', { class: 'yn-ceu-livre', 'aria-hidden': 'true' });
      const alvo = ordem[Math.floor(ordem.length * 0.6)]?.el;
      if (alvo && alvo.nextSibling) raiz.insertBefore(livre, alvo.nextSibling);
      else raiz.append(livre);
    }

    // ---- fecho: o texto com o fio por baixo -----------------------------------------------
    const fechar = el('button', {
      class: 'yn-fechar', type: 'button', dataset: { acao: 'fechar-capitulo' },
      'aria-label': c.fechar ? null : (c.rotuloFechar || null),
    }, c.fechar ? el('span', 'yn-fechar-texto', c.fechar) : null);
    if (!c.fechar) fechar.classList.add('so-fio');
    const fim = el('footer', 'yn-fim', fechar);
    raiz.append(fim);
    raiz.append(svgFrente, svgFio, ponta);

    // O fio do par (com balanço) e o resto do fio, até o sublinhado do botão.
    const fioSombra = caminho({ class: 'yn-fio-sombra', pathLength: '1' });
    const fioPar = caminho({ class: 'yn-fio-linha', pathLength: '1' });
    const restoSombra = caminho({ class: 'yn-fio-sombra', pathLength: '1' });
    const resto = caminho({ class: 'yn-fio-linha', pathLength: '1' });
    svgFio.append(fioSombra, restoSombra, fioPar, resto);

    // ---- o céu ------------------------------------------------------------------------
    const placas = [];
    // O céu WebGL só nasce numa hora calma: com a folha aberta e o título assentado.
    let liberarCeu = null;
    const quandoCeu = new Promise((r) => { liberarCeu = r; });
    const tempo = criarTempo({
      fundo: api.fundo,
      amb,
      quando: quandoCeu,
      aoQuadro: (e) => acertarLuz(e),
      aoDividir: () => { try { som.efeito('brilho'); } catch { /* sem som */ } },
      aoTrocar: (tipo) => { if (vivo) raiz.classList.toggle('yn-leve', tipo !== 'webgl'); },
    });
    raiz.classList.toggle('yn-leve', tempo.tipo !== 'webgl');

    // Placa opcional (imagem ou vídeo do autor) no crepúsculo.
    if (c.fundo) {
      recursos.elementoImagem(c.fundo, '').then((p) => {
        if (!p || !vivo) return;
        p.className = 'yn-placa';
        p.setAttribute('aria-hidden', 'true');
        api.fundo.append(p);
        placas.push(p);
      });
    }
    if (c.video && typeof c.video === 'string') {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
      v.preload = 'auto';
      v.className = 'yn-placa';
      v.addEventListener('canplay', () => {
        if (!vivo || v.isConnected) return;
        api.fundo.append(v);
        placas.push(v);
        v.play()?.catch?.(() => {});
      }, { once: true });
      v.addEventListener('error', () => v.remove(), { once: true });
      v.src = c.video;
    }

    function acertarLuz(e) {
      const a = e.veu.toFixed(3);
      const d = (1 - suave(e.hora / 0.5)).toFixed(3);
      for (const v of versos) {
        v.veu.style.opacity = a;
        v.veu.style.setProperty('--d', d);
      }
      if (placas.length) {
        const o = (suave((e.hora - 0.24) / 0.12) * (1 - suave((e.hora - 0.6) / 0.12))).toFixed(3);
        for (const p of placas) p.style.opacity = o;
      }
    }

    // ---- o cordão ------------------------------------------------------------------------
    const cordao = criarCordao({ tras: svgTras, frente: svgFrente });

    // ---- medidas ---------------------------------------------------------------------------
    const M = {
      vh: 1, w: 1, altura: 0,
      versos: [], livreTopo: 0, livreAlt: 1,
      enc: null, par: null, fimTopo: 0, linha: 0,
    };

    const topo = (no) => {
      let y = 0;
      let n = no;
      while (n && n !== raiz) { y += n.offsetTop; n = n.offsetParent; }
      return y;
    };
    const esquerda = (no) => {
      let x = 0;
      let n = no;
      while (n && n !== raiz) { x += n.offsetLeft; n = n.offsetParent; }
      return x;
    };

    function medir() {
      if (!vivo) return;
      const vh = rolagem.el.clientHeight || innerHeight;
      const w = raiz.clientWidth || innerWidth;
      M.vh = vh; M.w = w;
      raiz.style.setProperty('--yn-vh', `${vh}px`);

      // O encontro: no celular em pé, preso com panorâmica; senão, largura total.
      if (encontro) {
        const pan = !reduzido && w < vh * 0.9;
        encontro.pan = pan;
        encontro.sec.classList.toggle('pan', pan);
        if (pan) {
          const alt = vh * 0.56;
          const recorte = clamp(parseFloat(getComputedStyle(encontro.sec).getPropertyValue('--yn-recorte')) || 1, 0.3, 1);
          const larg = alt * ((encontro.img.naturalWidth || 860) / (encontro.img.naturalHeight || 484)) * recorte;
          encontro.larguraImg = larg;
          encontro.desloc = Math.max(0, larg - w);
          encontro.sec.style.setProperty('--yn-janela', `${Math.round(larg)}px`);
          encontro.dist = Math.round(encontro.desloc * 1.6);
          raiz.style.setProperty('--yn-pan', `${encontro.dist}px`);
          gsap.set(encontro.janela, { x: 0 });
        } else {
          raiz.style.removeProperty('--yn-pan');
          encontro.sec.style.removeProperty('--yn-janela');
          gsap.set(encontro.janela, { clearProps: 'transform' });
        }
      }
      // tira o transform das peças antes de medir
      if (par) gsap.set([par.a, par.b], { x: 0 });

      M.versos = versos.map((v) => ({ v, topo: topo(v.sec), alt: v.sec.offsetHeight }));
      M.livreTopo = topo(livre);
      M.livreAlt = livre.offsetHeight || vh;
      M.enc = encontro ? { topo: topo(encontro.sec), alt: encontro.sec.offsetHeight } : null;
      M.fimTopo = topo(fim);
      M.altura = raiz.scrollHeight;
      M.linha = vh * 0.62;

      construirCordao();
      construirFio();
      tempo.redimensionar();
      tempo.assentar();
      atualizar(true);
    }

    // A trança: começa sob o título, serpenteia entre os versos (por trás de uns,
    // pela frente de outros), dá um nó em cada bloco 'cordao' e mergulha no encontro.
    function construirCordao() {
      const { w, vh } = M;
      const pontos = [];
      const fimAbre = topo(abre) + abre.offsetHeight;
      const lado = Math.max(10, Math.min(26, w * 0.035));
      let ladoDireito = true;
      let nVerso = 0;
      pontos.push({ x: w * 0.8, y: fimAbre - vh * 0.16, camada: 'tras' });
      pontos.push({ x: w * 0.9, y: fimAbre + vh * 0.02, camada: 'tras' });

      for (const parte of ordem) {
        const t = topo(parte.el);
        const h = parte.el.offsetHeight;
        if (parte.tipo === 'texto') {
          // Onde há céu livre ao lado das letras (no celular, só a margem esquerda;
          // a direita é do fio de progresso do pergaminho).
          const p = parte.verso.p;
          const livreEsq = p.offsetLeft;
          const livreDir = w - (p.offsetLeft + p.offsetWidth);
          const xLivre = livreDir > 90 && livreDir > livreEsq ? w - Math.min(livreDir / 2, 70) : Math.max(lado * 0.6, Math.min(livreEsq / 2, 70));
          const xOposto = xLivre > w / 2 ? w * 0.16 : w * 0.84;
          const topoTexto = p.offsetTop / Math.max(1, h);
          if (nVerso % 2 === 0) {
            // por trás: cruza no respiro de cima, onde o véu já cobre, e desce rente às letras
            pontos.push({ x: xOposto, y: t + h * 0.03, camada: 'tras' });
            pontos.push({ x: (xOposto + xLivre) / 2, y: t + h * topoTexto * 0.62, camada: 'tras' });
            pontos.push({ x: xLivre, y: t + h * topoTexto * 1.05, camada: 'tras' });
            pontos.push({ x: xLivre + (xLivre > w / 2 ? -6 : 6), y: t + h * 0.62, camada: 'tras' });
            pontos.push({ x: xLivre, y: t + h * 0.92, camada: 'tras' });
          } else {
            // pela frente: corre rente às letras, por cima do véu, sem passar sobre elas
            const dentro = xLivre > w / 2 ? -1 : 1;
            pontos.push({ x: xLivre + dentro * lado * 0.6, y: t + h * 0.12, camada: 'frente' });
            pontos.push({ x: xLivre, y: t + h * 0.5, camada: 'frente' });
            pontos.push({ x: xLivre + dentro * lado * 0.6, y: t + h * 0.88, camada: 'frente' });
          }
          ladoDireito = xLivre > w / 2;
          nVerso++;
        } else if (parte.tipo === 'cordao') {
          const cx = w * 0.5;
          const cy = t + h * 0.5;
          if (parte.imagem) {
            pontos.push({ x: cx, y: t + h * 0.15, camada: 'tras' });
            pontos.push({ x: cx, y: t + h * 0.85, camada: 'tras' });
          } else {
            // O nó: entra, dá uma volta inteira cruzando sobre si mesmo e sai do outro lado.
            const r = Math.min(w * 0.15, h * 0.3, 90);
            const dir = ladoDireito ? 1 : -1;
            pontos.push({ x: cx + dir * r * 2.1, y: t + h * 0.06, camada: 'frente' });
            const voltas = 1.18;
            const passos = 14;
            for (let i = 0; i <= passos; i++) {
              const ang = -Math.PI / 2 + dir * (i / passos) * voltas * Math.PI * 2 - dir * 0.5;
              const rr = r * (0.92 + 0.08 * Math.sin(i * 0.9));
              pontos.push({ x: cx + Math.cos(ang) * rr * dir, y: cy + Math.sin(ang) * rr * 0.9 + (i / passos - 0.5) * r * 0.5, camada: 'frente' });
            }
            pontos.push({ x: cx - dir * r * 2.0, y: t + h * 0.96, camada: 'frente' });
            ladoDireito = !ladoDireito;
          }
        } else if (parte.tipo === 'encontro') {
          // mergulha atrás da imagem e se perde nela
          const fundo = encontro.pan ? vh * 0.3 : h * 0.45;
          pontos.push({ x: w * 0.5, y: t + fundo * 0.25, camada: 'tras' });
          pontos.push({ x: w * 0.45, y: t + fundo, camada: 'tras' });
          break;
        }
      }
      if (pontos.length < 4) { cordao.destruir(); return; }
      cordao.construir(pontos, { linha: M.linha });
    }

    // O fio do par: nasce na fita de uma imagem, chega na fita da outra, e desce
    // até virar o sublinhado do botão.
    function construirFio() {
      const { w } = M;
      M.par = null;
      // o sublinhado do botão
      const bt = topo(fechar);
      const bx = esquerda(fechar);
      const bw = fechar.offsetWidth;
      const bh = fechar.offsetHeight;
      const uy = bt + bh - 14;
      const u0 = { x: bx + 14, y: uy };
      const u1 = { x: bx + bw - 14, y: uy };
      M.botao = { topo: bt, alt: bh };

      if (par) {
        const qa = par.quadroA;
        const qb = par.quadroB;
        const A = { x: esquerda(qa) + qa.offsetWidth * par.ancA.x, y: topo(qa) + qa.offsetHeight * par.ancA.y };
        const B = { x: esquerda(qb) + qb.offsetWidth * par.ancB.x, y: topo(qb) + qb.offsetHeight * par.ancB.y };
        const parTopo = topo(par.sec);
        M.par = { A, B, topo: parTopo, alt: par.sec.offsetHeight };

        // do pulso dela até o botão: desce pela fresta, passa pela margem e vira sublinhado
        const fundoPar = parTopo + par.sec.offsetHeight;
        // No celular a margem do texto tem só ~24 px: o fio corre rente à borda
        // (a ~9 px) para não encostar na primeira letra das linhas.
        const margem = w < 600 ? 9 : Math.max(12, Math.min(28, w * 0.04));
        const pts = [
          B,
          { x: B.x - 4, y: B.y + 40 },
          { x: Math.max(margem, B.x - w * 0.12), y: fundoPar + 30 },
        ];
        // atravessa o que houver entre o par e o fim pela margem esquerda, com folga
        const entre = fim.offsetTop - fundoPar;
        if (entre > M.vh * 0.5) {
          pts.push({ x: margem + (w < 600 ? 2 : 6), y: fundoPar + entre * 0.35 });
          pts.push({ x: margem, y: fundoPar + entre * 0.7 });
        }
        pts.push({ x: u0.x - 30, y: uy - 46 });
        pts.push({ x: u0.x, y: uy });
        // o sublinhado: uma onda bem leve
        const n = 6;
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          pts.push({ x: u0.x + (u1.x - u0.x) * t, y: uy + Math.sin(t * Math.PI * 2) * 1.6 });
        }
        const d = linha(pts);
        resto.setAttribute('d', d);
        restoSombra.setAttribute('d', d);
        M.resto = { de: B.y, ate: uy };
        balancar(relogio, true);
      } else {
        const pts = [];
        const n = 6;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          pts.push({ x: u0.x + (u1.x - u0.x) * t, y: uy + Math.sin(t * Math.PI * 2) * 1.6 });
        }
        const d = linha(pts);
        resto.setAttribute('d', d);
        restoSombra.setAttribute('d', d);
        fioPar.removeAttribute('d');
        fioSombra.removeAttribute('d');
        M.resto = { de: uy - M.vh * 0.25, ate: uy };
      }
      M.restoVisto = -1;
      M.parVisto = -1;
    }

    const linha = (pts) => {
      const a = amostrar(pts, 3);
      let d = '';
      for (let i = 0; i < a.n; i++) d += `${i ? 'L' : 'M'}${f1(a.x[i])} ${f1(a.y[i])}`;
      return d;
    };

    // ---- reveal dos versos ----------------------------------------------------------------
    function florescer(v) {
      v.visto = true;
      const { palavras } = v;
      if (!palavras.length) return;
      if (reduzido) {
        gsap.fromTo(palavras, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.9, stagger: 0.02, ease: 'none' });
        return;
      }
      // Linhas pelo offsetTop; cada palavra nasce um pouco puxada para o meio da
      // linha e se abre até o lugar (o espaçamento "respira").
      const linhas = new Map();
      for (const p of palavras) {
        const y = p.offsetTop;
        if (!linhas.has(y)) linhas.set(y, []);
        linhas.get(y).push(p);
      }
      let iLinha = 0;
      for (const grupo of linhas.values()) {
        const ini = grupo[0].offsetLeft;
        const ult = grupo[grupo.length - 1];
        const meio = (ini + ult.offsetLeft + ult.offsetWidth) / 2;
        grupo.forEach((p, j) => {
          const centro = p.offsetLeft + p.offsetWidth / 2;
          const de = { autoAlpha: 0, x: (meio - centro) * 0.07, y: 6 };
          const para = {
            autoAlpha: 1, x: 0, y: 0,
            duration: 2.1, delay: iLinha * 0.2 + j * 0.035,
            ease: curvas.yourname.florescer,
          };
          if (!baixo) {
            de.filter = 'blur(7px)';
            para.filter = 'blur(0px)';
          }
          para.onComplete = () => gsap.set(p, { clearProps: 'filter,transform' });
          gsap.fromTo(p, de, para);
        });
        iLinha++;
      }
    }
    // As palavras dos versos já nascem escondidas (emPalavras): sem piscar antes da primeira medida.

    // ---- laço ---------------------------------------------------------------------------
    let sujo = true;
    let id = 0;
    let relogio = 0;
    let ultimoT = 0;
    const pararRolagem = rolagem.aoRolar(() => { sujo = true; });

    function atualizar(forcar = false) {
      const y = rolagem.el.scrollTop;
      const { vh } = M;

      // a hora e o cometa
      const max = Math.max(1, M.altura - vh);
      const comecaK = M.livreTopo - vh * 0.55;
      const divide = M.livreTopo + M.livreAlt * 0.5 - vh * 0.5;
      const acabaK = divide + vh * 0.85;
      let k = 0;
      if (y > comecaK) k = y < divide ? (y - comecaK) / Math.max(1, divide - comecaK) : 1 + (y - divide) / Math.max(1, acabaK - divide);
      tempo.definir({ hora: clamp(y / max), k: clamp(k, 0, 2), rol: y / vh });

      // capa: sobe em paralaxe e some; o título vem mais devagar
      const pc = clamp(y / (vh * 0.85));
      if (capaEl) {
        if (reduzido) capaEl.style.opacity = (1 - pc).toFixed(3);
        else {
          capaEl.style.transform = `translate3d(0, ${(-y * 0.32).toFixed(1)}px, 0) scale(${(1 + pc * 0.04).toFixed(4)})`;
          capaEl.style.opacity = (1 - suave(pc * 1.1)).toFixed(3);
        }
      }
      if (titulosEl) {
        if (reduzido) titulosEl.style.opacity = (1 - suave(pc * 1.2)).toFixed(3);
        else {
          titulosEl.style.transform = `translate3d(0, ${(-y * 0.12).toFixed(1)}px, 0)`;
          titulosEl.style.opacity = (1 - suave(pc * 1.25)).toFixed(3);
        }
      }

      // versos florescem quando entram
      for (const m of M.versos) {
        if (!m.v.visto && y + vh * 0.8 > m.topo + m.alt * 0.25) florescer(m.v);
      }

      // o cordão se desenha com a rolagem
      const pt = cordao.revelar(y);
      if (pt && !reduzido) {
        ponta.style.opacity = '1';
        ponta.style.zIndex = pt.camada === 'frente' ? '3' : '1';
        ponta.style.transform = `translate3d(${f1(pt.x)}px, ${f1(pt.y)}px, 0)`;
      } else ponta.style.opacity = '0';

      // o encontro
      if (encontro && M.enc) {
        if (encontro.pan) {
          const p = clamp((y - M.enc.topo) / Math.max(1, encontro.dist));
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          const x = -encontro.desloc * (p * 0.7 + e * 0.3);
          encontro.janela.style.transform = `translate3d(${f1(x)}px, 0, 0)`;
        } else if (!reduzido) {
          const p = clamp((y + vh - M.enc.topo) / (vh + M.enc.alt));
          encontro.img.style.transform = `scale(${(1.07 - 0.07 * p).toFixed(4)})`;
        }
      }

      // o par: entram de lados opostos e param com uma fresta
      if (par && M.par) {
        const e = saida((y + vh - M.par.topo) / (vh * 0.55));
        if (reduzido) {
          par.a.style.opacity = e.toFixed(3);
          par.b.style.opacity = e.toFixed(3);
        } else {
          par.a.style.transform = `translate3d(${f1(-(1 - e) * M.w * 0.32)}px, ${f1((1 - e) * 30)}px, 0) rotate(${((1 - e) * -3).toFixed(2)}deg)`;
          par.b.style.transform = `translate3d(${f1((1 - e) * M.w * 0.32)}px, ${f1((1 - e) * 60)}px, 0) rotate(${((1 - e) * 3).toFixed(2)}deg)`;
          // nunca 0 de todo: assim o navegador já pinta as duas imagens quando
          // elas chegam perto da tela, e não no quadro em que aparecem
          par.a.style.opacity = Math.max(0.004, clamp(e * 1.6)).toFixed(3);
          par.b.style.opacity = Math.max(0.004, clamp(e * 1.6)).toFixed(3);
        }
        const fp = e < 0.995 ? 0 : clamp((y + vh * 0.78 - M.par.A.y) / (vh * 0.24));
        M.fioPar = fp;
        if (fp !== M.parVisto || forcar) {
          M.parVisto = fp;
          const s = `${fp.toFixed(4)} 2`;
          fioPar.style.strokeDasharray = s;
          fioSombra.style.strokeDasharray = s;
        }
      }
      // o resto do fio, até o botão
      const ini = M.par ? (M.fioPar >= 1 ? M.resto.de : Infinity) : M.resto.de;
      const fr = clamp((y + vh * 0.8 - ini) / Math.max(1, M.resto.ate - ini));
      if (fr !== M.restoVisto || forcar) {
        M.restoVisto = fr;
        const s = `${fr.toFixed(4)} 2`;
        resto.style.strokeDasharray = s;
        restoSombra.style.strokeDasharray = s;
      }
    }

    // O fio do par balança de leve (é refeito só enquanto está à vista).
    function balancar(t, forcar = false) {
      if (!M.par) return;
      const { A, B } = M.par;
      const y = rolagem.el.scrollTop;
      if (!forcar && (A.y < y - 60 || A.y > y + M.vh + 60)) return;
      const dx = B.x - A.x;
      const folga = 22 + Math.abs(dx) * 0.14;
      const s = reduzido ? 0 : Math.sin(t * 0.85) * 5 + Math.sin(t * 1.9 + 1.3) * 1.6;
      const d = `M${f1(A.x)} ${f1(A.y)}C${f1(A.x + dx * 0.3)} ${f1(A.y + folga + s)} ${f1(B.x - dx * 0.32)} ${f1(B.y + folga * 0.85 + s * 0.8)} ${f1(B.x)} ${f1(B.y)}`;
      fioPar.setAttribute('d', d);
      fioSombra.setAttribute('d', d);
    }

    function laco(agora) {
      if (!vivo) return;
      id = requestAnimationFrame(laco);
      const dt = ultimoT ? Math.min(0.1, (agora - ultimoT) / 1000) : 0.016;
      ultimoT = agora;
      relogio += dt;
      if (sujo) { sujo = false; atualizar(); }
      if (M.par && (M.fioPar > 0)) balancar(relogio);
    }

    // ---- fechar ------------------------------------------------------------------------
    fechar.addEventListener('click', async () => {
      if (fechar.disabled) return;
      fechar.disabled = true;
      raiz.classList.add('yn-fechando');
      tempo.encerrar();
      try { som.efeito('toque'); } catch { /* sem som */ }
      await espera(reduzido ? 500 : 1100);
      if (vivo) api.fechar();
    }, { once: true });

    // ---- tamanho ------------------------------------------------------------------------
    let ultimoTam = '';
    const remedir = debounce(() => {
      const tam = `${raiz.clientWidth}x${rolagem.el.clientHeight}x${raiz.scrollHeight}`;
      if (tam === ultimoTam) return;
      medir();
      ultimoTam = `${raiz.clientWidth}x${rolagem.el.clientHeight}x${raiz.scrollHeight}`;
    }, 160);
    const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(remedir) : null;
    if (observador) { observador.observe(rolagem.el); observador.observe(raiz); } else window.addEventListener('resize', remedir);
    // As fontes podem chegar depois: o texto muda de altura e as medidas também.
    document.fonts?.ready?.then(() => { if (vivo) remedir(); });

    medir();
    ultimoTam = `${raiz.clientWidth}x${rolagem.el.clientHeight}x${raiz.scrollHeight}`;
    id = requestAnimationFrame(laco);

    // A capa que passou do prazo ainda entra, devagar, se ela estiver no alto da folha
    // (mais abaixo, nem veria); o título desce para dar lugar, sem pulo.
    if (!capa && !reduzido) pedidoCapa.then((tarde) => {
      if (!tarde || !vivo || rolagem.el.scrollTop > M.vh * 0.3) return;
      const antes = titulosEl ? titulosEl.offsetTop : 0;
      capaEl = el('div', 'yn-capa yn-tarde', tarde);
      abre.prepend(capaEl);
      titulosEl?.style.setProperty('--yn-desce', `${antes - titulosEl.offsetTop}px`);
      sujo = true;
    });

    // O título floresce palavra por palavra enquanto a folha termina de desenrolar.
    const revelacoes = [api.aberto || espera(1800)];
    if (tituloEl) revelacoes.push(revelarPalavras(tituloEl, c.titulo, { duracao: 2, intervalo: 0.17, atraso: reduzido ? 0.4 : 1.1, subida: '0.3em', curva: curvas.yourname.florescer }));
    if (subEl) {
      revelacoes.push(revelarPalavras(subEl, c.subtitulo, { duracao: 1.8, intervalo: 0.09, atraso: reduzido ? 0.8 : 1.9, subida: '0.25em', curva: curvas.yourname.florescer }));
      paraLeitor(subEl, c.subtitulo);
    }
    // Se ela já estiver rolando, o céu não espera o título: no máximo 5 s.
    Promise.race([Promise.all(revelacoes), espera(5000)]).then(liberarCeu, liberarCeu);

    return {
      destruir() {
        vivo = false;
        cancelAnimationFrame(id);
        pararRolagem();
        remedir.cancelar();
        if (observador) observador.disconnect(); else window.removeEventListener('resize', remedir);
        for (const v of versos) gsap.killTweensOf(v.palavras);
        if (tituloEl) gsap.killTweensOf(tituloEl.querySelectorAll('.palavra'));
        if (subEl) gsap.killTweensOf(subEl.querySelectorAll('.palavra'));
        cordao.destruir();
        tempo.destruir();
        for (const p of placas) { try { p.pause?.(); } catch { /* nada */ } p.remove(); }
        raiz.classList.remove('yn', 'yn-leve', 'yn-fechando');
        raiz.style.removeProperty('--yn-vh');
        raiz.style.removeProperty('--yn-pan');
        api.fundo.classList.remove('yn-fundo');
        api.fundo.textContent = '';
        raiz.textContent = '';
      },
    };
  },
};
