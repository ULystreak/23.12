/* ============================================================================
   RESPOSTA: o contador dos dias dela e a folha em que ela escreve de volta
   ============================================================================
   Não é cena. js/cenas/final.js chama criarDepois, contar, escrever, repousar
   e seguir; js/cenas/menu.js chama criarDepois, noAlto, limparFim, reposicionar
   e reescrever. Tudo mora em div.depois, dentro de #palco: o véu da noite, o
   contador (o número na letra da senha, a flor de pontinhos, os dias que
   importam e a virada da meia-noite), a folha "Escrever de volta" e a fileira
   de baixo (a pena e, com o menu do fim, a pílula "Continuar").

   O texto dela fica só no aparelho dela (localStorage carta2312:resposta).
   NADA é enviado sozinho e não há servidor: o toque dela em "Enviar para ele"
   abre o WhatsApp com o texto pronto, e é ela quem aperta enviar.

   Teste: ?hoje=AAAA-MM-DD finge outro dia. Vira um desvio em dias sobre o
   calendário do aparelho, então o dia fingido também vira à meia-noite.
   ========================================================================== */

import { el, svg, suave, espera, menuLembrado, debounce } from '../nucleo/util.js';
import { comoPromise } from '../nucleo/movimento.js';
import { temMenu } from '../nucleo/diretor.js';

const CHAVE = 'carta2312:resposta';
const ESCALA_ALTO = 0.46; // o contador pequeno no alto
const PASSO_DIA = 3.1; // s entre os dias que importam: entra 0,5, fica 2,2, sai 0,4
const DIA_MS = 86400000;
const OURO = (137.508 * Math.PI) / 180; // ângulo de ouro: a espiral das sementes do girassol
const PETALA = (2 * Math.PI) / 14; // a flor tem 14 pétalas

// Ícones da papelaria: grade 24, traço 1,75 (.ui-icone), pontas redondas.
const ICONE_PENA = `<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M4.5 19.5 15 9"/>
  <path d="M7.6 16.4C6.4 11 10.4 5.6 19.5 4.5c-.9 8.9-6.3 12.9-11.9 11.9Z"/>
</svg>`;
const ICONE_ENVIAR = `<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M20.5 3.5 3.8 10.4c-.6.3-.6 1.1 0 1.3l6.2 2.3 2.3 6.2c.2.6 1.1.6 1.3 0Z"/>
  <path d="m10 14 5.2-5.2"/>
</svg>`;
const CORACAO = `<svg class="resposta-coracao" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
  <path d="M10 16.8C4.6 12.6 2.4 9.8 2.4 6.9a3.9 3.9 0 0 1 7.6-1.3 3.9 3.9 0 0 1 7.6 1.3c0 2.9-2.2 5.7-7.6 9.9Z"/>
</svg>`;
const SETA = `<svg class="ui-icone depois-ir-seta" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M4.5 12.4c4.7-.7 9.6-.8 15 0"/>
  <path d="m14 6.8 5.6 5.6-5.7 5.3"/>
</svg>`;

/* ---- datas ------------------------------------------------------------------ */

/** 'AAAA-MM-DD' → { a, m, d }, conferida por ida e volta em Date.UTC; null se inválida. */
function lerData(texto) {
  const partes = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(texto ?? '').trim());
  if (!partes) return null;
  const a = Number(partes[1]);
  const m = Number(partes[2]);
  const d = Number(partes[3]);
  const t = new Date(Date.UTC(a, m - 1, d));
  if (t.getUTCFullYear() !== a || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return { a, m, d };
}

// Um Date vale pelo ano, mês e dia do calendário do aparelho: sem erro de fuso.
function dataDe(valor) {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : { a: valor.getFullYear(), m: valor.getMonth() + 1, d: valor.getDate() };
  }
  return lerData(valor);
}

const emUtc = ({ a, m, d }) => Date.UTC(a, m - 1, d);

/** Dias entre `nascimento` ('AAAA-MM-DD') e `hoje` (Date ou 'AAAA-MM-DD'); null se vazia, inválida ou futura. */
export function diasDeVida(nascimento, hoje = new Date()) {
  const n = lerData(nascimento);
  const h = dataDe(hoje);
  if (!n || !h) return null;
  const dias = Math.round((emUtc(h) - emUtc(n)) / DIA_MS);
  return dias >= 0 ? dias : null;
}

/** 7412 → '7.412'. */
function comPonto(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

/* ---- o texto dela, só neste aparelho ---------------------------------------- */

// Modo privado do Safari, armazenamento cheio ou bloqueado: nada trava.
const guardado = {
  ler() {
    try {
      return localStorage.getItem(CHAVE) || '';
    } catch {
      return '';
    }
  },
  gravar(valor) {
    try {
      if (String(valor ?? '').trim()) localStorage.setItem(CHAVE, valor);
      else localStorage.removeItem(CHAVE);
      return true;
    } catch {
      return false;
    }
  },
};

/* ---- o depois da frase final ------------------------------------------------ */

export function criarDepois(ctx) {
  const { conteudo = {}, amb = {}, som } = ctx;
  const gsap = ctx.gsap || window.gsap;
  const html = document.documentElement;
  const calmo = !!amb.reduzido;
  const c = conteudo.contador || {};
  const r = conteudo.resposta && typeof conteudo.resposta === 'object' ? conteudo.resposta : null;
  const rotulos = r?.rotulos || {};
  const comMenu = temMenu(conteudo);

  // ?hoje= (só teste): desvio fixo em dias sobre a data local do aparelho.
  const fingido = lerData(amb.params?.get?.('hoje'));
  const desvio = fingido ? Math.round((emUtc(fingido) - emUtc(dataDe(new Date()))) / DIA_MS) : 0;
  const hojeAgora = () => {
    const agora = new Date();
    return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + desvio);
  };

  let dias = diasDeVida(c.nascimento, hojeAgora());
  const temContador = dias !== null;
  const temResposta = !!r && r.ativa !== false;
  const rotulo = typeof c.rotulo === 'string' ? c.rotulo.trim() : 'dias até aqui';

  const raiz = el('div', { class: 'depois' });
  const veu = el('div', { class: 'depois-veu', 'aria-hidden': 'true' });
  raiz.append(veu);

  // contador
  let contador = null;
  let numero = null;
  let fio = null;
  let rotuloEl = null;
  let frase = null;
  let lembra = null;
  let brilho = null;
  let anuncio = null;
  let flor = null;
  const casas = [];
  let contado = false;
  let alto = false;
  let timerDia = 0;
  // noite: o véu está fechado (ou fechando) e o mundo pode dormir
  let noite = false;
  let relendo = html.classList.contains('relendo');
  // folha
  let folha = null;
  let campo = null;
  let aviso = null;
  let enviar = null;
  let outro = null;
  let aberta = false;
  let reescrevendo = false;
  let aoGuardar = null;
  // fileira
  let reabrir = null;
  let ir = null;
  let resolverSeguir;
  const seguir = new Promise((resolve) => { resolverSeguir = resolve; });

  function montar() {
    if (!raiz.isConnected) document.getElementById('palco')?.append(raiz);
  }

  /* ---- a noite: o mundo dorme sob o véu --------------------------------------- */

  // O quadro do mundo com DPR 3 é o mais caro da carta: sob a noite fechada ele
  // não aparece, então desliga. Sem WebGL não há o que poupar.
  function dormir() {
    if (!noite || relendo || !ctx.mundo?.ok) return;
    if (Number(gsap.getProperty(veu, 'opacity')) < 0.99) return;
    ctx.mundo.desligar?.();
  }

  function acordar() {
    noite = false;
    if (ctx.mundo && !ctx.mundo.ligado) ctx.mundo.ligar?.();
  }

  function cobrir(duracao) {
    noite = true;
    gsap.killTweensOf(veu);
    return gsap.to(veu, { opacity: 1, duration: duracao, ease: 'sine.inOut', onComplete: dormir });
  }

  function descobrir(duracao, aoFim) {
    acordar();
    gsap.killTweensOf(veu);
    gsap.to(veu, { opacity: 0, duration: duracao, ease: 'sine.inOut', onComplete: aoFim });
  }

  // Quando a bolsa relê uma carta, o #palco some (e o véu junto): o mundo acorda.
  new MutationObserver(() => {
    const agora = html.classList.contains('relendo');
    if (agora === relendo) return;
    relendo = agora;
    if (!agora) dormir();
    else if (noite && ctx.mundo && !ctx.mundo.ligado) ctx.mundo.ligar?.();
  }).observe(html, { attributes: true, attributeFilter: ['class'] });

  /* ---- o contador ------------------------------------------------------------- */

  function montarContador() {
    if (contador) return;
    numero = el('span', { class: 'contador-numero', 'aria-hidden': 'true' });
    fio = el('span', { class: 'contador-fio', 'aria-hidden': 'true' });
    rotuloEl = el('span', { class: 'contador-rotulo', 'aria-hidden': 'true', texto: rotulo });
    const textoFrase = texto(c.frase);
    frase = textoFrase ? el('p', { class: 'contador-frase', texto: textoFrase }) : null;
    contador = el('div', { class: 'contador', role: 'group' }, [numero, fio, rotuloEl, frase]);
    rotular();
    raiz.append(contador);
  }

  function rotular() {
    contador.dataset.dias = String(dias);
    contador.setAttribute('aria-label', rotulo ? `${dias} ${rotulo}` : String(dias));
  }

  // Uma caixa de 0,66em por algarismo: o número cresce sem tremer.
  function mostrarDias(n) {
    const algarismos = String(n);
    while (casas.length < algarismos.length) {
      const casa = el('span', 'contador-casa');
      casas.push(casa);
      numero.append(casa);
    }
    while (casas.length > algarismos.length) casas.pop().remove();
    casas.forEach((casa, i) => {
      if (casa.textContent !== algarismos[i]) casa.textContent = algarismos[i];
    });
  }

  // Até 3 válidos (dentro da vida, até hoje, com texto), na ordem da lista; exibidos por data.
  function diasQueImportam() {
    return (Array.isArray(c.dias) ? c.dias : [])
      .map((item) => ({ n: diasDeVida(c.nascimento, item?.data), fala: texto(item?.texto) }))
      .filter((dia) => dia.n !== null && dia.n <= dias && dia.fala)
      .slice(0, 3)
      .sort((a, b) => a.n - b.n);
  }

  /**
   * A flor: cada dia dela é um pontinho numa espiral de girassol atrás do número,
   * do miolo para fora; hoje é o ponto vermelho na ponta de baixo. Mede o número
   * já montado; sem lugar na tela, devolve null e a contagem segue sem flor.
   */
  function criarFlor(lembrados) {
    const N = dias;
    if (N < 2) return null;
    const caixa = raiz.getBoundingClientRect();
    const rn = numero.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(numero).fontSize) || 64;
    const R = fs * 2.08; // ≈140 px no iPhone de referência
    const miolo = R / 2;
    const cx = rn.left + rn.width / 2 - caixa.left;
    const cy = rn.top + rn.height / 2 - caixa.top;
    const topo = parseFloat(getComputedStyle(raiz).paddingTop) || 0;
    if (cy - R < topo + 8) return null;
    // Fio, rótulo e frase descem para fora da flor; se passarem do pé da tela, não há flor.
    const d = Math.max(0, cy + R + 16 - (fio.getBoundingClientRect().top - caixa.top));
    // Rótulo vazio fica display:none (retângulo zerado): a última peça passa a ser o fio.
    const ultimo = (frase || (rotulo ? rotuloEl : fio)).getBoundingClientRect();
    if (ultimo.bottom - caixa.top + d > caixa.height - 16) return null;

    // Ali atrás do número não nasce pontinho.
    const ax = (String(N).length * 0.66 * fs) / 2 + 4;
    const ay = 0.36 * fs + 6;
    const atras = (x, y) => (x / ax) ** 2 + (y / ay) ** 2;
    const rp = Math.min(0.8, 0.25 * Math.sqrt((Math.PI * (R * R - miolo * miolo)) / N));
    const i0 = (N * miolo * miolo) / (R * R - miolo * miolo);
    const juntos = Math.min(N, diasDeVida(c.conhecemos, hojeAgora()) ?? 0);
    const posicao = (i) => {
      const raio = R * Math.sqrt((i + i0) / (N - 1 + i0));
      const a = (i - N + 1) * OURO;
      return { raio, a, x: -raio * Math.sin(a), y: raio * Math.cos(a) };
    };

    const lado = Math.ceil(2 * R + 4);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const canvas = el('canvas', {
      class: 'contador-flor',
      'aria-hidden': 'true',
      width: Math.round(lado * dpr),
      height: Math.round(lado * dpr),
      style: { width: `${lado}px`, height: `${lado}px`, left: `${cx - lado / 2}px`, top: `${cy - lado / 2}px` },
    });
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.setTransform(dpr, 0, 0, dpr, (lado * dpr) / 2, (lado * dpr) / 2);
    const tokens = getComputedStyle(html);
    const corFio = tokens.getPropertyValue('--fio').trim() || '#d7192d';
    const corLuar = tokens.getPropertyValue('--luar').trim() || '#fdf6ee';

    const hoje = el('span', { class: 'contador-hoje', 'aria-hidden': 'true', style: { left: `${cx}px`, top: `${cy + R}px` } });
    const marcas = [];
    lembrados.forEach((dia, k) => {
      if (dia.n < 1 || dia.n >= N) return;
      const p = posicao(dia.n - 1);
      if (atras(p.x, p.y) < 1) return;
      marcas.push({ k, el: el('span', { class: 'contador-dia', 'aria-hidden': 'true', style: { left: `${cx + p.x}px`, top: `${cy + p.y}px` } }) });
    });

    const pecas = [canvas, hoje, ...marcas.map((m) => m.el)];
    contador.before(...pecas);
    fio.style.marginTop = `${d}px`;

    // Desenha só os pontinhos novos: a flor cresce do miolo para fora junto com o número.
    let feitos = 0;
    function desenhar(v) {
      const ate = Math.min(Math.floor(v), N - 1);
      for (; feitos < ate; feitos++) {
        const { raio, a, x, y } = posicao(feitos);
        const limpo = suave((atras(x, y) - 1) / 0.6);
        if (limpo <= 0) continue;
        const s = (raio - miolo) / (R - miolo);
        const meia = 0.72 * PETALA * Math.sqrt(Math.max(0, s * (1 - s))) + 0.012;
        const naPetala = 1 - suave((Math.abs(a - PETALA * Math.round(a / PETALA)) / meia - 0.55) / 0.45);
        // Os dias desde que eles se conheceram são os últimos, em vermelho.
        const vermelho = feitos >= N - juntos;
        g.globalAlpha = (vermelho ? 0.7 * (0.12 + 0.88 * naPetala) : 0.04 + 0.18 * naPetala) * limpo;
        g.fillStyle = vermelho ? corFio : corLuar;
        g.beginPath();
        g.arc(x, y, rp, 0, Math.PI * 2);
        g.fill();
      }
    }

    return { canvas, hoje, marcas, pecas, desenhar };
  }

  // A flor se dissolve no lugar; a margem do fio sai (recolherContador anima a volta).
  function soltarFlor() {
    if (!flor) return;
    const { pecas } = flor;
    flor = null;
    fio.style.marginTop = '';
    gsap.killTweensOf(pecas);
    gsap.to(pecas, {
      autoAlpha: 0,
      duration: calmo ? 0.4 : 0.9,
      ease: 'sine.inOut',
      onComplete: () => pecas.forEach((p) => p.remove()),
    });
  }

  /**
   * A contagem: a noite cobre a folha, o número volta e conta de 0 até os dias
   * dela hoje, a flor cresce junto, os dias que importam acendem um por vez, e
   * depois vêm o fio, o rótulo e a frase. Resolve quando ela já leu.
   */
  async function contar() {
    if (!temContador || contado) return;
    contado = true;
    montar();
    montarContador();
    // O leitor de tela ouve o número quando ele chega (o desenho é aria-hidden).
    anuncio = el('p', { class: 'so-leitor', role: 'status' });
    raiz.append(anuncio);
    mostrarDias(calmo ? dias : 0);
    gsap.set([numero, fio, rotuloEl, frase].filter(Boolean), { autoAlpha: 0 });

    const lembrados = diasQueImportam();
    const f = criarFlor(lembrados);
    flor = f;
    if (f) gsap.set(f.pecas, { autoAlpha: 0 });
    if (lembrados.length) {
      // "no seu dia 7.411:" em cima, a fala embaixo, onde ficarão o fio e o rótulo.
      lembra = el('p', { class: 'contador-lembra', role: 'status' }, [
        el('span', 'contador-lembra-dia'),
        el('span', 'contador-lembra-fala'),
      ]);
      lembra.style.top = `${fio.offsetTop}px`;
      gsap.set(lembra, { opacity: 0 });
      contador.append(lembra);
    }

    const tl = gsap.timeline();
    tl.add(cobrir(calmo ? 0.8 : 1.6), 0);
    let chegou;
    if (calmo) {
      tl.to(numero, { autoAlpha: 1, duration: 0.4 }, 0.4);
      tl.call(() => som?.efeito?.('brilho'), null, 0.4);
      if (f) {
        f.desenhar(dias);
        tl.to([f.canvas, f.hoje], { autoAlpha: 1, duration: 0.4 }, 0.9);
      }
      chegou = 1.4 + (f ? 1.2 : 0);
    } else {
      tl.to(numero, { autoAlpha: 1, duration: 0.9 }, 0.9);
      if (f) tl.set(f.canvas, { autoAlpha: 1 }, 1.3);
      const conta = { v: 0 };
      tl.to(conta, {
        v: dias,
        duration: 3.4,
        ease: 'power2.out',
        onUpdate: () => {
          const v = Math.round(conta.v);
          mostrarDias(v);
          f?.desenhar(v);
        },
        onComplete: () => som?.efeito?.('brilho'),
      }, 1.3);
      tl.to(numero, { scale: 1.07, duration: 0.16, ease: 'power2.out' }, 4.7);
      tl.to(numero, { scale: 1, duration: 0.5, ease: 'back.out(2.2)' }, 4.86);
      if (f) {
        tl.fromTo(f.hoje, { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 2.4, duration: 0.16, ease: 'power2.out' }, 4.7);
        tl.to(f.hoje, { scale: 1, duration: 0.5, ease: 'back.out(2.2)' }, 4.86);
      }
      chegou = 4.9 + (f ? 0.7 : 0);
    }
    tl.call(() => { if (anuncio) anuncio.textContent = contador.getAttribute('aria-label'); }, null, chegou);

    // Um dia de cada vez; a linha entra e sai por opacidade para o leitor ler a troca.
    lembrados.forEach((dia, k) => {
      const t = chegou + PASSO_DIA * k;
      tl.call(() => {
        if (!lembra) return;
        lembra.firstChild.textContent = `no seu dia ${comPonto(dia.n)}:`;
        lembra.lastChild.textContent = dia.fala;
      }, null, t);
      tl.fromTo(lembra, { opacity: 0, y: calmo ? 0 : 8 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, t);
      tl.to(lembra, { opacity: 0, duration: 0.4 }, t + 2.7);
      const marca = f?.marcas.find((m) => m.k === k)?.el;
      if (!marca) return;
      if (calmo) {
        tl.to(marca, { autoAlpha: 1, duration: 0.5 }, t);
        tl.to(marca, { opacity: 0.7, duration: 0.4 }, t + 2.7);
      } else {
        tl.fromTo(marca, { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 2.2, duration: 0.16, ease: 'power2.out' }, t);
        tl.to(marca, { scale: 1.25, duration: 0.5, ease: 'back.out(2.2)' }, t + 0.16);
        tl.to(marca, { opacity: 0.7, scale: 0.8, duration: 0.4 }, t + 2.7);
      }
    });

    const depois = chegou + PASSO_DIA * lembrados.length;
    if (lembra) {
      tl.call(() => {
        lembra?.remove();
        lembra = null;
      }, null, depois);
    }
    if (f) tl.to(f.canvas, { opacity: 0.35, duration: 0.9 }, depois - 0.6);
    if (calmo) tl.to(fio, { autoAlpha: 1, duration: 0.9 }, depois - 0.1);
    else tl.fromTo(fio, { autoAlpha: 0, scaleX: 0 }, { autoAlpha: 1, scaleX: 1, duration: 0.9, ease: 'power3.out' }, depois - 0.1);
    tl.to(rotuloEl, { autoAlpha: 1, duration: 0.9 }, calmo ? depois : depois + 0.25);
    if (frase) {
      if (calmo) tl.to(frase, { autoAlpha: 1, duration: 1.4 }, depois + 1.1);
      else tl.fromTo(frase, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 1.4, ease: 'power2.out' }, depois + 1.1);
    }
    tl.to({}, { duration: frase ? 3.6 : 2.2 }); // ela lê
    await comoPromise(tl);
  }

  // O destino no alto: o centro do número 30 px abaixo do topo seguro, já na escala pequena.
  function yNoAlto() {
    const topo = parseFloat(getComputedStyle(raiz).paddingTop) || 0;
    const centro = numero.offsetTop + numero.offsetHeight / 2;
    return topo + 30 - centro * ESCALA_ALTO - contador.offsetTop;
  }

  /**
   * Leva o contador para o alto. A flor solta antes (senão subiria junto). A
   * margem da flor some e o rótulo do alto é maior: as duas mudanças entram de
   * uma vez no desenho, e o transform devolve cada peça ao lugar de antes e a
   * leva ao novo enquanto o contador sobe (sem pulo).
   */
  function recolherContador() {
    if (!contador || alto) return;
    alto = true;
    anuncio?.remove();
    anuncio = null;
    const duracao = calmo ? 0.01 : 1.5;
    const pecas = [fio, rotuloEl, frase].filter(Boolean);
    gsap.killTweensOf([contador, numero, ...pecas]);
    if (frase) gsap.to(frase, { autoAlpha: 0, duration: calmo ? 0.3 : 0.7 });
    const antes = pecas.map((p) => p.offsetTop);
    const corpo = parseFloat(getComputedStyle(rotuloEl).fontSize) || 1;
    soltarFlor();
    contador.setAttribute('data-alto', '');
    const corpoAlto = parseFloat(getComputedStyle(rotuloEl).fontSize) || 1;
    pecas.forEach((p, i) => {
      const de = { y: antes[i] - p.offsetTop, scale: p === rotuloEl ? corpo / corpoAlto : 1 };
      gsap.fromTo(p, de, { y: 0, scale: 1, duration: duracao, ease: 'power2.inOut' });
    });
    gsap.to(contador, { y: yNoAlto(), scale: ESCALA_ALTO, duration: duracao, ease: 'power2.inOut' });
  }

  /** Entrada fria do menu: o contador já pequeno no alto, sem contar, sem flor. */
  function noAlto() {
    montar();
    raiz.setAttribute('data-fim', '');
    if (!temContador) return;
    montarContador();
    mostrarDias(dias);
    if (frase) gsap.set(frase, { autoAlpha: 0 });
    alto = true;
    contador.setAttribute('data-alto', '');
    gsap.set(contador, { y: yNoAlto(), scale: ESCALA_ALTO });
    conferirDia();
  }

  /**
   * A virada da meia-noite: um temporizador até a meia-noite local + 500 ms.
   * O iPhone para temporizadores de aba escondida, por isso a conta é refeita
   * quando a aba volta (visibilitychange).
   */
  function conferirDia() {
    clearTimeout(timerDia);
    if (!alto || !contador?.isConnected || document.hidden) return;
    const agora = new Date();
    const meiaNoite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
    timerDia = setTimeout(conferirDia, Math.max(1000, meiaNoite - agora + 500));
    const novo = diasDeVida(c.nascimento, hojeAgora());
    if (novo === null || novo === dias) return;
    dias = novo;
    rotular();
    if (calmo) {
      mostrarDias(dias);
      return;
    }
    if (!brilho) {
      brilho = el('span', { class: 'contador-brilho', 'aria-hidden': 'true' });
      contador.append(brilho);
    }
    som?.efeito?.('brilho');
    gsap.timeline()
      .to(numero, { scale: 1.12, duration: 0.16, ease: 'power2.out', overwrite: true }, 0)
      .call(() => mostrarDias(dias), null, 0.16)
      .to(numero, { scale: 1, duration: 0.5, ease: 'back.out(2.2)' }, 0.16)
      .fromTo(brilho, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.3 }, 0)
      .to(brilho, { opacity: 0, duration: 1.4, ease: 'sine.inOut' }, 0.3);
  }

  function reposicionar() {
    if (!alto || !contador?.isConnected || gsap.isTweening(contador)) return;
    gsap.set(contador, { y: yNoAlto() });
  }

  // Nunca removidos: na prática há um criarDepois por página.
  window.addEventListener('resize', debounce(reposicionar, 150));
  document.addEventListener('visibilitychange', conferirDia);

  /* ---- a folha "Escrever de volta" --------------------------------------------- */

  // O iPhone só aplica :active com um ouvinte de toque no elemento.
  const sentirToque = (b) => b?.addEventListener('touchstart', () => {}, { passive: true });

  function montarFolha() {
    if (folha) return;
    campo = el('textarea', {
      class: 'resposta-texto ui-campo',
      dataset: { acao: 'resposta-texto' },
      rows: 6,
      placeholder: texto(r.dica),
      'aria-label': texto(rotulos.campo) || texto(r.convite) || 'O que você quer dizer',
      autocapitalize: 'sentences',
      spellcheck: 'false',
      enterkeyhint: 'enter',
    });
    campo.value = guardado.ler();
    aviso = el('p', { class: 'resposta-aviso ui-nota', role: 'status' });
    const guardar = el('button', {
      type: 'button',
      class: 'resposta-guardar ui-pilula',
      dataset: { acao: 'resposta-guardar' },
    }, texto(rotulos.guardar) || 'Guardar');
    enviar = el('a', {
      class: 'resposta-enviar ui-pilula',
      dataset: { tom: 'fio', acao: 'resposta-enviar' },
      href: '#',
      target: '_blank',
      rel: 'noopener noreferrer',
    }, [svg(ICONE_ENVIAR), el('span', null, texto(rotulos.enviar) || 'Enviar para ele'), svg(CORACAO)]);
    // "enviar de outro jeito" depende do compartilhar do aparelho, não de ser celular.
    if (typeof navigator.share === 'function') {
      outro = el('button', {
        type: 'button',
        class: 'resposta-outro',
        dataset: { acao: 'resposta-compartilhar' },
      }, texto(rotulos.outro) || 'enviar de outro jeito');
    }
    const convite = texto(r.convite);
    folha = el('section', {
      class: 'resposta ui-folha',
      'aria-label': texto(rotulos.folha) || 'Folha em branco',
      tabindex: '-1',
    }, [
      el('span', { class: 'ui-laco', dataset: { onde: 'topo' }, 'aria-hidden': 'true' }),
      convite ? el('p', { class: 'resposta-convite ui-titulo' }, convite) : null,
      campo,
      aviso,
      el('div', 'resposta-botoes', [guardar, enviar]),
      outro,
    ]);

    // Cada tecla: guarda, avisa e atualiza o link.
    campo.addEventListener('input', () => {
      if (guardado.gravar(campo.value)) avisar(campo.value.trim() ? texto(r.guardado) : '');
      atualizar();
    });
    guardar.addEventListener('click', () => {
      guardado.gravar(campo.value); // vazio apaga a chave
      aoGuardar?.();
    });
    // Quem manda é o toque dela: o navegador só segue o link que ela tocou.
    enviar.addEventListener('click', (e) => {
      if (!campo.value.trim()) {
        e.preventDefault();
        negar();
        return;
      }
      enviar.href = enderecoWhats();
      avisar(texto(r.enviando));
    });
    outro?.addEventListener('click', () => {
      if (!campo.value.trim()) {
        negar();
        return;
      }
      try {
        navigator.share({ text: mensagem() }).catch(() => {}); // cancelar não faz nada
      } catch {
        /* o aparelho recusou o compartilhar */
      }
    });
    [guardar, enviar, outro].forEach(sentirToque);
  }

  function avisar(msg, erro = false) {
    aviso.removeAttribute('data-erro');
    if (erro) {
      aviso.textContent = msg; // reescrito para o leitor de tela repetir o aviso
      void aviso.offsetWidth; // reinicia a sacudida
      aviso.setAttribute('data-erro', '');
    } else if (aviso.textContent !== msg) {
      aviso.textContent = msg;
    }
  }

  function negar() {
    avisar(texto(r.vazio), true);
    campo.focus({ preventScroll: true });
  }

  function mensagem() {
    const escrito = campo.value.trim();
    if (!escrito) return '';
    const antes = texto(r.antes);
    return antes ? `${antes}\n\n${escrito}` : escrito;
  }

  // Sem número, o WhatsApp abre e ela mesma escolhe o contato.
  function enderecoWhats() {
    const numeroWhats = String(r.whatsapp ?? '').replace(/\D/g, '');
    return `https://wa.me/${numeroWhats}?text=${encodeURIComponent(mensagem())}`;
  }

  function atualizar() {
    const tem = !!campo.value.trim();
    folha.toggleAttribute('data-tem', tem);
    enviar.href = tem ? enderecoWhats() : '#';
    enviar.setAttribute('aria-disabled', String(!tem));
  }

  // Zoom alto do Safari ou teclado aberto: a folha rola por dentro, sem levar a página.
  function conferirRola() {
    folha.toggleAttribute('data-rola', folha.scrollHeight > folha.clientHeight + 1);
  }

  // O teclado do iPhone cobre a metade de baixo: a folha sobe e usa só o que sobra.
  function aoViewport() {
    if (!folha) return;
    const vv = window.visualViewport;
    const vista = vv ? vv.height : innerHeight;
    raiz.style.setProperty('--depois-vista', `${Math.round(vista)}px`);
    const teclado = !!vv && vista < innerHeight * 0.78;
    raiz.toggleAttribute('data-teclado', teclado);
    conferirRola();
    // O Safari rola a página para mostrar o campo; a carta volta ao lugar.
    if (teclado && (window.scrollY > 0 || vv.offsetTop > 0)) window.scrollTo(0, 0);
  }

  function ouvirViewport(sim) {
    const metodo = sim ? 'addEventListener' : 'removeEventListener';
    window.visualViewport?.[metodo]('resize', aoViewport);
    window.visualViewport?.[metodo]('scroll', aoViewport);
    window[metodo]('resize', aoViewport);
  }

  // Com a folha aberta, o Tab circula dentro dela; na reabertura, Esc fecha.
  function aoTecla(e) {
    if (!aberta) return;
    if (e.key === 'Escape' && reescrevendo) {
      e.preventDefault();
      aoGuardar?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const focaveis = [...folha.querySelectorAll('textarea, button, a[href]')]
      .filter((n) => !n.disabled && n.getClientRects().length);
    if (!focaveis.length) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const ativo = document.activeElement;
    const dentro = ativo !== folha && folha.contains(ativo);
    if (!dentro || ativo === (e.shiftKey ? primeiro : ultimo)) {
      e.preventDefault();
      (e.shiftKey ? ultimo : primeiro).focus();
    }
  }

  const botoesDaFileira = () => [reabrir, ir].filter((b) => b?.isConnected);

  function abrirFolha() {
    montar();
    montarFolha();
    aberta = true;
    gsap.killTweensOf(folha);
    raiz.append(folha);
    raiz.setAttribute('data-folha', '');
    ouvirViewport(true);
    document.addEventListener('keydown', aoTecla);
    const fileira = botoesDaFileira();
    if (fileira.length) gsap.to(fileira, { autoAlpha: 0, duration: 0.3, overwrite: true });
    cobrir(0.8);
    som?.efeito?.('papel');
    avisar(campo.value.trim() ? texto(r.guardado) : '');
    atualizar();
    aoViewport();
    if (calmo) {
      gsap.fromTo(folha, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 });
    } else {
      gsap.fromTo(folha,
        { autoAlpha: 0, y: 34, scale: 0.94, rotation: 1.6 },
        { autoAlpha: 1, y: 0, scale: 1, rotation: 0, duration: 0.62, ease: 'back.out(1.3)' });
    }
    // No celular o foco no campo subiria o teclado por cima da folha que ainda entra:
    // o foco vai para a folha (o leitor de tela a anuncia) e ela toca no campo.
    if (amb.toque) folha.focus({ preventScroll: true });
    else campo.focus({ preventScroll: true });
  }

  async function fecharFolha() {
    aberta = false;
    if (folha.contains(document.activeElement)) document.activeElement.blur();
    ouvirViewport(false);
    document.removeEventListener('keydown', aoTecla);
    gsap.killTweensOf(folha);
    await comoPromise(calmo
      ? gsap.to(folha, { autoAlpha: 0, duration: 0.3 })
      : gsap.to(folha, { autoAlpha: 0, y: 14, scale: 0.97, duration: 0.24, ease: 'power2.out' }));
    if (aberta) return; // reaberta no meio da saída
    folha.remove();
    raiz.removeAttribute('data-folha');
    raiz.removeAttribute('data-teclado');
  }

  function esperarGuardar() {
    return new Promise((resolve) => {
      aoGuardar = () => {
        aoGuardar = null;
        resolve();
      };
    });
  }

  /** A primeira vez (final:resposta): recolhe o contador, abre a folha e espera o Guardar. O véu continua fechado. */
  async function escrever() {
    if (!temResposta) return;
    recolherContador();
    abrirFolha();
    await esperarGuardar();
    await fecharFolha();
  }

  /**
   * A letra dela na folha dele, com a mesma caneta, depois que a noite sai.
   * Os erros só vão para o console: a carta segue.
   */
  async function escreverNaFolha() {
    if (!temResposta) return;
    const textoDela = (campo ? campo.value : guardado.ler()).trim();
    const folhaFinal = ctx.estado?.folha;
    if (!textoDela || typeof folhaFinal?.escreverDela !== 'function') return;
    await espera(calmo ? 200 : 450);
    if (aberta || reescrevendo) return;
    let letras = 0;
    try {
      await folhaFinal.escreverDela(textoDela, {
        aoTraco: () => {
          if (letras++ % 2 === 0) som?.efeito?.('caneta', { duracao: 0.7, intensidade: 0.7 });
        },
      });
    } catch (erro) {
      console.error('[carta] a letra dela', erro);
    }
  }

  /** A folha de novo, pela pena do fim ou pelo "Escrever de volta" do menu. Esc ou toque fora fecham. */
  async function reescrever() {
    if (aberta || reescrevendo || ctx.inventario?.aberto || !temResposta) return;
    reescrevendo = true;
    const fora = (e) => {
      if (!folha.contains(e.target)) aoGuardar?.();
    };
    try {
      abrirFolha();
      document.addEventListener('pointerdown', fora, true);
      await esperarGuardar();
      ctx.estado?.folha?.apagarDela?.(); // a letra antiga sai ainda sob a noite
      await fecharFolha();
      descobrir(1.2, escreverNaFolha);
      const fileira = botoesDaFileira();
      if (fileira.length) {
        gsap.killTweensOf(fileira);
        gsap.set(fileira, { visibility: 'inherit' }); // focável já, antes de terminar de aparecer
        gsap.to(fileira, { opacity: 1, duration: 0.8 });
      }
      focarReabrir();
    } finally {
      // Não tirar: sem isto a folha não abre de novo.
      document.removeEventListener('pointerdown', fora, true);
      document.removeEventListener('keydown', aoTecla);
      aoGuardar = null;
      reescrevendo = false;
    }
  }

  /* ---- o estado final e a fileira de baixo ------------------------------------- */

  function montarFileira() {
    if (!reabrir && temResposta) {
      const nome = texto(rotulos.reabrir) || 'Escrever de volta';
      // Com o menu, a pena fica sozinha à esquerda e o meio é da pílula "Continuar".
      reabrir = comMenu
        ? el('button', {
          type: 'button',
          class: 'depois-reabrir ui-redondo',
          dataset: { acao: 'resposta-abrir', tom: 'noite', so: 'pena' },
          'aria-label': nome,
        }, svg(ICONE_PENA))
        : el('button', {
          type: 'button',
          class: 'depois-reabrir ui-pilula',
          dataset: { acao: 'resposta-abrir', tom: 'noite' },
        }, [svg(ICONE_PENA), el('span', null, nome)]);
      reabrir.addEventListener('click', () => reescrever());
      sentirToque(reabrir);
      raiz.append(reabrir);
    }
    if (!ir && comMenu) {
      const rm = conteudo.menu?.rotulos || {};
      const nome = (menuLembrado() ? texto(rm.voltar) : '') || texto(rm.continuar) || 'Continuar';
      ir = el('button', {
        type: 'button',
        class: 'depois-ir ui-pilula',
        dataset: { acao: 'menu-ir' },
      }, [el('span', null, nome), svg(SETA)]);
      ir.addEventListener('click', () => {
        if (aberta || reescrevendo || ctx.inventario?.aberto || !raiz.hasAttribute('data-fim')) return;
        resolverSeguir();
      });
      sentirToque(ir);
      raiz.append(ir);
    }
    return botoesDaFileira();
  }

  // Só no teclado: no celular, focar um botão não ajuda e pode rolar a tela.
  function focarReabrir() {
    if (amb.toque) return;
    const ativo = document.activeElement;
    if (ativo && ativo !== document.body && ativo.isConnected) return;
    const alvo = ir?.isConnected ? ir : reabrir?.isConnected ? reabrir : null;
    alvo?.focus({ preventScroll: true });
  }

  /** O estado final: o contador no alto, o véu sai (a letra dela entra na folha) e a fileira aparece. */
  function repousar() {
    montar();
    recolherContador();
    conferirDia();
    descobrir(calmo ? 0.8 : 2.2, escreverNaFolha);
    raiz.setAttribute('data-fim', '');
    const fileira = montarFileira();
    if (fileira.length) {
      gsap.fromTo(fileira, { autoAlpha: 0 }, {
        autoAlpha: 1,
        duration: calmo ? 0.2 : 1.2,
        delay: calmo ? 0 : 1.2,
        onComplete: focarReabrir,
      });
    }
  }

  /** O menu chega: a pena e a pílula saem em 0,3 s e deixam o DOM. */
  function limparFim() {
    const botoes = botoesDaFileira();
    if (!botoes.length) return Promise.resolve();
    for (const b of botoes) {
      b.disabled = true;
      b.style.pointerEvents = 'none';
    }
    gsap.killTweensOf(botoes);
    return comoPromise(gsap.to(botoes, { autoAlpha: 0, duration: 0.3 }))
      .then(() => botoes.forEach((b) => b.remove()));
  }

  return {
    temContador,
    temResposta,
    get dias() {
      return dias;
    },
    contar,
    escrever,
    repousar,
    seguir,
    reescrever,
    noAlto,
    limparFim,
    reposicionar,
    raiz,
  };
}
