/* ============================================================================
   CAPÍTULO 2: o filme (um voo pelo céu, do dia à noite, atrás do cordão)
   ============================================================================
   Montado dentro da folha do pergaminho com o `api` que js/pergaminho.js
   entrega: { conteudo, amb, som, rolagem, fundo, gsap, recursos, fechar(),
   aberto }. Lê conteudo.yourname: título, subtítulo, capa, blocos (texto,
   cordao, imagem-cheia, imagem, par) e o fecho.

   Com WebGL e movimento livre, o capítulo é um voo em 3D (yourname/voo.js): a
   rolagem leva a câmera, com amortecimento, por cima do mar de nuvens, através
   dele no crepúsculo e até a noite sobre o lago. Cada bloco é uma parada do
   voo. O HTML fica num palco preso à janela (sticky) e cada texto é posto na
   tela pela projeção do seu ponto no espaço; as fotos são quadros no próprio
   3D, inteiros na tela. O cordão vermelho vai na frente e acaba no botão.

   Sem WebGL (?webgl=0) ou com movimento reduzido, o mesmo DOM vira uma página
   corrida (classe yn-plano): céu em degradê que anda com a leitura, fotos em
   <img>, o cordão na margem. Nada é guardado entre aberturas.
   ========================================================================== */

import { el, clamp, suave, lerp, espera, debounce, amortecer } from '../nucleo/util.js';
import { curvas, revelarPalavras } from '../nucleo/movimento.js';
import { criarVoo } from './yourname/voo.js';

// Onde a fita vermelha fica em cada foto do par (fração da largura e da
// altura), quando o bloco não traz fioDele / fioDela.
const FIO_DELE = { x: 0.27, y: 0.86 };
const FIO_DELA = { x: 0.02, y: 0.81 };
const PRAZO_IMAGENS = 7000;
// Quanto de rolagem (em telas) cada tipo de parada ocupa.
const PESO = { abre: 1, texto: 1, no: 0.7, quadro: 1.2, par: 1.4, fim: 0.8 };
// O véu atrás dos textos, pela hora do céu: dia, crepúsculo, noite.
const VEUS = [[0, [18, 44, 98]], [0.42, [44, 36, 96]], [0.6, [46, 26, 84]], [0.85, [8, 12, 34]], [1, [8, 12, 34]]];
// Com a câmera andando, o véu só é repintado quando a cor andou isto (em 255): cada
// troca refaz o texto e a sombra dele. Quando a câmera pousa, a cor fica exata.
const VEU_FOLGA = 3;

const texto = (v) => (typeof v === 'string' ? v.trim() : '');
const meio = (v) => String(Math.round(v * 2) / 2);

// O que revelarPalavras montou fica só para os olhos; o leitor de tela lê a frase inteira.
function paraLeitor(p, frase) {
  p.removeAttribute('aria-label');
  p.removeAttribute('role');
  for (const filho of p.children) filho.setAttribute('aria-hidden', 'true');
  p.prepend(el('span', 'so-leitor', frase.replace(/\s+/g, ' ')));
}

// As palavras de um verso nascem apagadas e se acendem em fila quando o verso ganha `viu`.
// Nada de innerHTML: o so-leitor e a contagem de palavras dependem de textContent.
function emPalavras(p, frase) {
  const inteiro = frase.replace(/\s+/g, ' ').trim();
  const corpo = el('span', { 'aria-hidden': 'true' });
  inteiro.split(' ').forEach((termo, i) => {
    if (i) corpo.append(' ');
    const s = el('span', 'yn-p', termo);
    s.style.setProperty('--i', String(i));
    corpo.append(s);
  });
  p.append(el('span', 'so-leitor', inteiro), corpo);
}

function ancora(v, padrao) {
  const x = Number(v?.x);
  const y = Number(v?.y);
  return { x: clamp(Number.isFinite(x) ? x : padrao.x), y: clamp(Number.isFinite(y) ? y : padrao.y) };
}

function veuDaHora(h, cor) {
  let i = 1;
  while (i < VEUS.length - 1 && h > VEUS[i][0]) i++;
  const [h0, a] = VEUS[i - 1];
  const [h1, b] = VEUS[i];
  const t = clamp((h - h0) / (h1 - h0));
  for (let j = 0; j < 3; j++) cor[j] = Math.round(lerp(a[j], b[j], t));
  return cor;
}

export const capitulo = {
  id: 'yourname',

  async montar(raiz, api) {
    const { conteudo, amb = {}, som, rolagem, fundo, recursos } = api;
    const c = conteudo?.yourname || {};
    const blocos = Array.isArray(c.blocos) ? c.blocos : [];
    const reduzido = !!amb.reduzido;
    const quer3d = !!amb.webgl && !reduzido && !document.documentElement.classList.contains('sem-webgl');

    /* ---- 1. as imagens e o three, antes de qualquer DOM, num prazo só -------- */

    const prazo = espera(PRAZO_IMAGENS).then(() => null);
    const pedir = (url, alt) => {
      const endereco = texto(url);
      if (!endereco || !recursos?.elementoImagem) return Promise.resolve(null);
      return recursos.elementoImagem(endereco, texto(alt)).catch(() => null);
    };
    const noPrazo = (pedido) => Promise.race([pedido, prazo]);
    const [T, capaImg, ...imagens] = await Promise.all([
      quer3d ? import('../../lib/three.module.min.js').catch(() => null) : null,
      noPrazo(pedir(c.capa, '')),
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

    /* ---- 2. as paradas e o DOM, na ordem dos blocos ---------------------------- */

    let vivo = true;
    const palco = el('div', 'yn-palco');
    const paradas = [];
    let total = 0;
    const parada = (tipo, dados) => {
      const p = { tipo, a: total, b: total + PESO[tipo], ...dados };
      total = p.b;
      paradas.push(p);
      return p;
    };
    const veu = () => el('div', { class: 'yn-veu', 'aria-hidden': 'true' });
    // A foto: em 3D ela é um quadro no céu e aqui fica só o nome dela; na página corrida é um <img>.
    const fotoPlana = (img) => el('div', 'yn-moldura', img);
    const fotoFalada = (img) => (img.alt ? el('span', { class: 'so-leitor', role: 'img', 'aria-label': img.alt }) : null);
    const legendaDe = (frase) => (texto(frase) ? el('figcaption', 'yn-legenda', texto(frase)) : null);

    // A abertura: capa, título e subtítulo.
    const fraseTitulo = texto(c.titulo);
    const fraseSub = texto(c.subtitulo);
    const titulo = fraseTitulo ? el('h2', 'yn-titulo') : null;
    const subtitulo = fraseSub ? el('p', 'yn-subtitulo') : null;
    const titulos = el('div', 'yn-titulos', [veu(), titulo, subtitulo]);
    const capaPlana = capaImg ? el('div', 'yn-capa yn-moldura', capaImg) : null;
    const abre = el('header', 'yn-abre', [capaPlana, titulos]);
    palco.append(abre);
    parada('abre', { el: titulos, capa: capaImg });

    const versos = [];
    const quadroDe = (img, legenda) => {
      const cap = legendaDe(legenda);
      const figura = el('figure', 'yn-figura', [fotoPlana(img), fotoFalada(img), cap]);
      palco.append(figura);
      parada('quadro', { el: figura, img, legenda: cap });
    };

    blocos.forEach((b, i) => {
      const img = imagens[i];
      switch (b?.tipo) {
        case 'texto': {
          const frase = texto(b.texto);
          if (!frase) return;
          const p = el('p', 'yn-texto');
          emPalavras(p, frase);
          const secao = el('section', 'yn-verso', [veu(), p]);
          palco.append(secao);
          versos.push(secao);
          parada('texto', { el: secao });
          return;
        }
        case 'cordao': {
          if (img) {
            quadroDe(img, '');
            return;
          }
          // Sem imagem, é ali que o cordão dá o nó.
          const no = el('div', { class: 'yn-no', 'aria-hidden': 'true' }, el('span', 'yn-no-laco'));
          palco.append(no);
          parada('no', { el: no });
          return;
        }
        case 'imagem-cheia':
          if (img) quadroDe(img, '');
          return;
        case 'imagem':
          // Sem arquivo, o bloco some junto com a legenda.
          if (img) quadroDe(img, b.legenda);
          return;
        case 'par': {
          const [dele, dela] = img || [];
          if (dele && dela && !paradas.some((p) => p.tipo === 'par')) {
            const capA = legendaDe(b.legendaDele);
            const capB = legendaDe(b.legendaDela);
            const fioA = ancora(b.fioDele, FIO_DELE);
            const fioB = ancora(b.fioDela, FIO_DELA);
            const fio = el('span', { class: 'yn-par-fio', 'aria-hidden': 'true' });
            // Na página corrida, o fio vai da fita de uma foto à da outra (as fotos ocupam 48% cada).
            fio.style.left = `${(fioA.x * 48).toFixed(1)}%`;
            fio.style.right = `${((1 - fioB.x) * 48).toFixed(1)}%`;
            fio.style.top = `${(((fioA.y + fioB.y) / 2) * 100).toFixed(1)}%`;
            const caixa = el('div', 'yn-par', [
              el('figure', 'yn-par-lado yn-par-a', [fotoPlana(dele), fotoFalada(dele), capA]),
              el('figure', 'yn-par-lado yn-par-b', [fotoPlana(dela), fotoFalada(dela), capB]),
              fio,
            ]);
            palco.append(caixa);
            parada('par', { el: caixa, dele, dela, capA, capB, fioA, fioB });
          } else {
            if (dele) quadroDe(dele, b.legendaDele);
            if (dela) quadroDe(dela, b.legendaDela);
          }
          return;
        }
        default:
      }
    });

    const fraseFechar = texto(c.fechar);
    const botao = el('button', { type: 'button', class: 'yn-fechar', dataset: { acao: 'fechar-capitulo' } });
    if (fraseFechar) {
      botao.append(el('span', 'yn-fechar-texto', fraseFechar));
    } else {
      // Sem texto, o fecho é só o fio; o nome fica para o leitor de tela.
      botao.classList.add('so-fio');
      botao.setAttribute('aria-label', texto(c.rotuloFechar) || 'Guardar no bolso');
    }
    botao.append(el('span', { class: 'yn-fechar-fio', 'aria-hidden': 'true' }));
    const fim = el('footer', 'yn-fim', botao);
    palco.append(fim);
    const paradaFim = parada('fim', { el: fim });

    /* ---- 3. o voo, se der ------------------------------------------------------- */

    const S = total;
    const s0 = 0.3 * PESO.abre;
    const sFim = S - 0.3;
    const paradaPar = paradas.find((p) => p.tipo === 'par');
    const paradaNo = paradas.find((p) => p.tipo === 'no');
    let voo = null;
    if (T) {
      try {
        voo = criarVoo(T, {
          fundo, amb, S, sFim,
          sDiv: paradaPar ? paradaPar.a : 0.68 * S,
          sNo: paradaNo ? (paradaNo.a + paradaNo.b) / 2 : null,
        });
      } catch (erro) {
        console.warn('[carta] o céu 3D não abriu; fica a página corrida', erro);
        fundo.querySelector('.yn-tela')?.remove();
        voo = null;
      }
    }
    const modo = voo ? 'yn-3d' : 'yn-plano';
    raiz.classList.add('yn', modo);
    fundo.classList.add('yn-fundo', `${modo}-fundo`);

    const nevoa = el('div', { class: 'yn-nevoa', 'aria-hidden': 'true' });
    const trilho = el('div', { class: 'yn-trilho', 'aria-hidden': 'true' });
    const fita = el('div', { class: 'yn-fita', 'aria-hidden': 'true' });
    const itens = []; // o HTML que o voo põe na tela
    if (voo) {
      // As fotos viram quadros no céu; os <img> não entram no DOM.
      for (const m of palco.querySelectorAll('.yn-moldura')) m.remove();
      fundo.append(nevoa);
      raiz.append(palco, trilho);
      for (const p of paradas) {
        switch (p.tipo) {
          case 'abre': {
            const anc = voo.ancorar({ a: p.a, b: p.b, fy: p.capa ? -0.2 : 0 });
            itens.push({ el: p.el, anc, kMin: 0.8 });
            if (p.capa) voo.figura(p.capa, voo.ancorar({ a: p.a, b: p.b, fy: 0.2 }), { fw: 0.82, fh: 0.34 });
            break;
          }
          case 'texto':
            itens.push({ el: p.el, anc: voo.ancorar({ a: p.a, b: p.b, fy: 0.03 }), kMin: 0.8, verso: true });
            break;
          case 'quadro': {
            const anc = voo.ancorar({ a: p.a, b: p.b, fy: 0.05 });
            const f = voo.figura(p.img, anc, { fw: 0.9, fh: 0.56 });
            if (p.legenda) itens.push({ el: p.legenda, anc, ponto: f.base, kMin: 0.8, topo: true });
            break;
          }
          case 'par': {
            const anc = voo.ancorar({ a: p.a, b: p.b, fy: 0.05 });
            const par = voo.par(p.dele, p.dela, anc, p.fioA, p.fioB);
            if (p.capA) itens.push({ el: p.capA, anc, ponto: par.baseA, kMin: 0.8, topo: true });
            if (p.capB) itens.push({ el: p.capB, anc, ponto: par.baseB, kMin: 0.8, topo: true });
            break;
          }
          case 'fim':
            itens.push({ el: p.el, anc: voo.fimAnc, kMin: 1, fim: true });
            break;
          default:
        }
      }
      for (const item of itens) item.el.classList.add('yn-anc');
    } else {
      fundo.append(
        el('div', { class: 'yn-ceu2d', 'aria-hidden': 'true' }, [el('span', 'yn-cometa2d'), el('span', 'yn-cometa2d yn-cometa2d-b')]),
        el('div', { class: 'yn-estrelas2d', 'aria-hidden': 'true' }),
      );
      palco.append(fita);
      raiz.append(palco);
    }

    /* ---- 4. título e subtítulo florescem já --------------------------------------- */

    if (titulo) {
      revelarPalavras(titulo, fraseTitulo, {
        duracao: 2, intervalo: 0.17, atraso: reduzido ? 0.4 : 1.1, subida: '0.3em', curva: curvas.yourname.florescer,
      });
    }
    if (subtitulo) {
      revelarPalavras(subtitulo, fraseSub, {
        duracao: 1.8, intervalo: 0.09, atraso: reduzido ? 0.8 : 1.9, subida: '0.25em', curva: curvas.yourname.florescer,
      });
      paraLeitor(subtitulo, fraseSub);
    }

    // O verso que acabou de se acender (a última palavra subiu) não se acende de novo
    // se a folha sumir e voltar.
    palco.addEventListener('animationend', (e) => {
      if (e.animationName !== 'yn-sobe' || e.target.nextElementSibling) return;
      e.target.closest?.('.yn-verso')?.classList.add('yn-aceso');
    });

    /* ---- 5. a rolagem leva a câmera -------------------------------------------------- */

    const progresso = () => {
      const caixa = rolagem?.el;
      if (!caixa) return 0;
      const max = caixa.scrollHeight - caixa.clientHeight;
      return max > 0 ? clamp(caixa.scrollTop / max) : 0;
    };
    const alvoS = () => lerp(s0, sFim, progresso());
    // Ler a rolagem obriga o navegador a refazer estilo e layout se algo está sujo, e
    // dentro do quadro quase sempre está (palavras se acendendo, o que o laço escreveu).
    // A leitura é feita no evento de rolagem, que chega antes do quadro e com tudo
    // limpo; o laço usa o valor guardado e, de meio em meio segundo, confere.
    let pLido = 0;
    let semLer = 0;
    const lerProgresso = () => {
      semLer = 0;
      pLido = progresso();
    };
    const P = { x: 0, y: 0, dist: 1 };
    let id = 0;
    let ultimoT = 0;
    let relogio = 0;
    let sCam = s0;
    let sPosto = -1;
    let W = 1;
    let H = 1;
    const veuAgora = [0, 0, 0];
    let ultimaNevoa = -1;
    let kAntes = 0;
    let pronto = false;
    let chegou = false;
    const lento = { soma: 0, n: 0, vezes: 0 };

    // Só escreve no DOM o que mudou; a peça só é camada (yn-perto) enquanto aparece.
    function colocar(item, assentou) {
      const { anc } = item;
      const alfa = item.fim ? clamp(anc.alfa * 1.4) : anc.alfa;
      if (alfa < 0.004) {
        if (item.alfa !== 0) {
          item.alfa = 0;
          item.ativo = false;
          item.posto = '';
          item.opaco = '0';
          item.el.style.opacity = '0';
          item.el.style.transform = '';
          item.el.classList.remove('yn-ativo', 'yn-perto');
        }
        return;
      }
      if (!item.alfa) item.el.classList.add('yn-perto');
      item.alfa = alfa;
      // O véu e a sombra do texto, pela hora: só nas peças que estão na tela.
      if (!item.fim) {
        const v = item.veu || (item.veu = [-9, -9, -9]);
        const d = Math.max(Math.abs(v[0] - veuAgora[0]), Math.abs(v[1] - veuAgora[1]), Math.abs(v[2] - veuAgora[2]));
        if (d >= VEU_FOLGA || (d > 0 && assentou)) {
          v[0] = veuAgora[0];
          v[1] = veuAgora[1];
          v[2] = veuAgora[2];
          item.el.style.setProperty('--yn-veu', `${v[0]}, ${v[1]}, ${v[2]}`);
        }
      }
      voo.projetar(item.ponto || anc.mundo, P);
      const k = clamp(anc.d / P.dist, item.kMin, 1);
      const y = item.fim ? clamp(P.y, H * 0.3, H - 28) : P.y;
      const prende = item.fim ? '-50%, -100%' : item.topo ? '-50%, 0' : '-50%, -50%';
      const posto = `translate3d(${meio(P.x)}px, ${meio(y)}px, 0) translate(${prende}) scale(${k.toFixed(3)})`;
      if (posto !== item.posto) {
        item.posto = posto;
        item.el.style.transform = posto;
      }
      const opaco = alfa.toFixed(3);
      if (opaco !== item.opaco) {
        item.opaco = opaco;
        item.el.style.opacity = opaco;
      }
      const ativo = alfa > 0.6;
      if (ativo !== item.ativo) {
        item.ativo = ativo;
        item.el.classList.toggle('yn-ativo', ativo);
      }
      if (item.verso && !item.viu && alfa > 0.2) {
        item.viu = true;
        item.el.classList.add('viu');
      }
    }

    function laco(agora) {
      if (!vivo) return;
      id = requestAnimationFrame(laco);
      const dt = ultimoT ? Math.min(0.1, (agora - ultimoT) / 1000) : 0.016;
      ultimoT = agora;
      relogio += dt;

      if (++semLer >= 30) lerProgresso();
      const p = pLido;
      const alvo = lerp(s0, sFim, p);
      const falta = alvo - sCam;
      // Um salto grande (retomar a leitura, ir ao fim) não vira uma viagem: chega quase lá e pousa.
      if (Math.abs(falta) > 2.5) sCam = alvo - Math.sign(falta) * 0.5;
      sCam = Math.abs(alvo - sCam) < 0.0004 ? alvo : amortecer(sCam, alvo, 5.5, dt);

      // Perto do botão a deriva assenta: o cordão acaba exatamente onde ele está.
      const e = voo.passo(sCam, relogio, 1 - suave((sCam - (sFim - 0.7)) / 0.6));

      if (sCam !== sPosto) {
        sPosto = sCam;
        veuDaHora(e.hora, veuAgora);
        const assentou = sCam === alvo;
        for (const item of itens) colocar(item, assentou);
        if (Math.abs(e.nevoa - ultimaNevoa) > 0.004) {
          ultimaNevoa = e.nevoa;
          nevoa.style.opacity = (e.nevoa * 0.94).toFixed(3);
          nevoa.style.backgroundColor = e.corNevoa;
        }
        if (kAntes < 1 && e.k >= 1 && e.k - kAntes < 0.25) som?.efeito?.('brilho');
        kAntes = e.k;
        const agoraChegou = sCam > sFim - 0.1;
        if (agoraChegou !== chegou) {
          chegou = agoraChegou;
          fim.classList.toggle('yn-chegou', chegou);
        }
      }
      // O botão vale assim que a rolagem chega ao fim, mesmo com a câmera ainda pousando.
      const agoraPronto = p > 0.93;
      if (agoraPronto !== pronto) {
        pronto = agoraPronto;
        fim.classList.toggle('yn-pronto', pronto);
      }

      // Quadros pesados por um bom tempo: a tela perde resolução (até duas vezes).
      if (relogio > 3 && lento.vezes < 2) {
        lento.soma += dt;
        lento.n += 1;
        if (lento.n >= 90) {
          if (lento.soma / lento.n > 0.0215 && voo.baixar()) lento.vezes += 1;
          lento.soma = 0;
          lento.n = 0;
        }
      }
    }

    // A página corrida: o céu anda com a leitura e os versos se acendem ao chegar.
    let pedido = 0;
    const acertarPlano = () => {
      pedido = 0;
      if (!vivo) return;
      const p = progresso();
      fundo.style.setProperty('--yn-p', p.toFixed(4));
      fundo.style.setProperty('--yn-n', suave((p - 0.6) / 0.3).toFixed(3));
    };
    let olheiro = null;

    function medir() {
      H = rolagem?.el?.clientHeight || innerHeight;
      W = raiz.clientWidth || innerWidth;
      raiz.style.setProperty('--yn-vh', `${H}px`);
      if (voo) {
        trilho.style.height = `${Math.round((S - 1) * H)}px`;
        voo.redimensionar(fundo.clientWidth || W, fundo.clientHeight || H);
        sPosto = -1;
        lerProgresso();
      } else {
        acertarPlano();
      }
    }

    medir();
    let pararRolagem = null;
    if (voo) {
      sCam = alvoS();
      rolagem?.el?.addEventListener('scroll', lerProgresso, { passive: true });
      // Os shaders são compilados já, atrás da folha fechada; as fotos sobem para a
      // placa depois de ela abrir, uma a uma. Nada disso fica para o meio da rolagem.
      try {
        voo.aquecer();
      } catch (erro) {
        console.warn('[carta] o céu não aqueceu; compila quando aparecer', erro);
      }
      Promise.resolve(api.aberto).then(() => {
        if (vivo) voo.adiantar();
      });
      id = requestAnimationFrame(laco);
      // Com o teclado, o botão chega ao foco antes de a leitura chegar ao fim.
      botao.addEventListener('focus', () => {
        if (!pronto && vivo) rolagem?.irPara?.(rolagem.el.scrollHeight);
      });
    } else {
      pararRolagem = rolagem?.aoRolar?.(() => {
        if (!pedido) pedido = requestAnimationFrame(acertarPlano);
      });
      if (typeof IntersectionObserver === 'function') {
        olheiro = new IntersectionObserver((entradas) => {
          for (const entrada of entradas) {
            if (!entrada.isIntersecting) continue;
            entrada.target.classList.add('viu');
            olheiro.unobserve(entrada.target);
          }
        }, { root: rolagem?.el || null, rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
        for (const v of versos) olheiro.observe(v);
      } else {
        for (const v of versos) v.classList.add('viu');
      }
    }

    let tamanho = `${W}x${H}`;
    const remedir = debounce(() => {
      if (!vivo) return;
      const agora = `${raiz.clientWidth}x${rolagem?.el?.clientHeight || innerHeight}`;
      if (agora === tamanho) return;
      medir();
      tamanho = `${W}x${H}`;
    }, 160);
    let observador = null;
    if (typeof ResizeObserver === 'function') {
      observador = new ResizeObserver(() => remedir());
      if (rolagem?.el) observador.observe(rolagem.el);
      observador.observe(raiz);
    } else {
      addEventListener('resize', remedir);
    }

    botao.addEventListener('click', async () => {
      if (botao.disabled || !vivo) return;
      botao.disabled = true;
      // O fio engrossa e acende, o texto do botão se recolhe e a noite se fecha.
      raiz.classList.add('yn-fechando');
      fundo.classList.add('yn-fundo-fechando');
      som?.efeito?.('toque');
      await espera(reduzido ? 500 : 1100);
      if (vivo) api.fechar?.();
    });

    return {
      destruir() {
        if (!vivo) return;
        vivo = false;
        cancelAnimationFrame(id);
        cancelAnimationFrame(pedido);
        pararRolagem?.();
        rolagem?.el?.removeEventListener('scroll', lerProgresso);
        remedir.cancelar();
        observador?.disconnect();
        olheiro?.disconnect();
        removeEventListener('resize', remedir);
        const gsap = api.gsap || window.gsap;
        gsap?.killTweensOf?.(raiz.querySelectorAll('.palavra'));
        voo?.destruir();
        raiz.classList.remove('yn', 'yn-3d', 'yn-plano', 'yn-fechando');
        raiz.style.removeProperty('--yn-vh');
        raiz.style.removeProperty('--yn-veu');
        fundo.classList.remove('yn-fundo', 'yn-3d-fundo', 'yn-plano-fundo', 'yn-fundo-fechando');
        fundo.style.removeProperty('--yn-p');
        fundo.style.removeProperty('--yn-n');
        raiz.textContent = '';
        fundo.textContent = '';
      },
    };
  },
};
