// Depois da frase final: o contador dos dias dela e a folha em que ela escreve de volta.
//
//   criarDepois(ctx) → {
//     temContador, temResposta,
//     contar()   → Promise   o número da senha volta e conta de 0 até os dias de vida dela hoje
//     escrever() → Promise   a folha em branco sobe; resolve quando ela toca em "Guardar"
//     repousar()             o estado final: o contador pequeno no alto e o botão de reabrir a folha
//   }
//   diasDeVida(nascimento, hoje?) → número de dias (ou null se a data não vale)
//
// Tudo é DOM dentro de #palco (some sozinho enquanto ela relê uma carta pela bolsa):
//   .depois
//     .depois-veu          a noite por cima da folha final, para o número se ler
//     .contador-flor       a flor dos dias (canvas 2D atrás do número) e .contador-hoje, o ponto de hoje
//     .contador            .contador-numero + .contador-rotulo + .contador-frase
//     .resposta            a folha: .resposta-convite, textarea, botões
//     .depois-reabrir      no estado final: abre a folha de novo
//
// O que ela escreve fica só no aparelho dela (localStorage). Nada é enviado
// sozinho: o botão de enviar abre o WhatsApp com o texto pronto, e é ela que
// manda. Onde existir, "enviar de outro jeito" usa o compartilhar do aparelho.
//
// Duas letras na mesma folha: quando ela toca em "Guardar" com texto, a folha dela
// fecha, a noite sai da frente e, já com a folha da frase dele à vista, as palavras
// dela são escritas à mão, pela mesma caneta (um pouco mais rápida e mais baixa), em
// tinta rosa, no terço de baixo da folha dele (folha.escreverDela, js/mundo/folha.js:
// ela tira os emoji, diminui o corpo antes de cortar e corta na palavra; o texto
// inteiro continua guardado aqui). "Escrever de volta" → "Guardar" apaga a letra
// antiga ainda debaixo da noite e escreve a nova; guardar vazio só apaga.
//
// Ganchos de teste: [data-acao="resposta-texto"] (o textarea), "resposta-enviar"
// (um <a> de verdade para wa.me), "resposta-compartilhar", "resposta-guardar",
// "resposta-abrir"; .contador[data-dias].
// Parâmetro só de teste: ?hoje=AAAA-MM-DD finge a data de hoje.

import { el, svg, suave, espera } from '../nucleo/util.js';

// Ícones da papelaria (_dev/UI.md): grade 24, traço 1.75, pontas redondas.
const AVIAO = `
  <svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M20.6 3.6 C14.6 5.8 9 8 3.4 10.4 C5.6 11.4 7.6 12.3 9.8 13.4 C10.8 15.6 11.6 17.6 12.6 19.8 C15.2 14.4 18 9 20.6 3.6 Z M9.8 13.4 C13.4 10.2 17 6.8 20.6 3.6"/>
  </svg>`;
const CORACAO = `
  <svg class="resposta-coracao" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <path d="M10 16.8C4.6 12.6 2.4 9.8 2.4 6.9a3.9 3.9 0 0 1 7.6-1.3 3.9 3.9 0 0 1 7.6 1.3c0 2.9-2.2 5.7-7.6 9.9z"/>
  </svg>`;
const PENA = `
  <svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M4.6 19.4 C5 17.4 5.6 15.6 6.4 14 C9.6 10.6 12.8 7.4 16 4.4 C17.6 3.6 20.2 6.2 19.6 7.8 C16.4 11 13.2 14.2 10 17.4 C8.2 18.2 6.4 18.8 4.6 19.4 Z M14.2 6.2 C15.4 7.4 16.6 8.6 17.8 9.8"/>
  </svg>`;

const CHAVE = 'carta2312:resposta';

/** 'AAAA-MM-DD' → { a, m, d } (ou null). */
function lerData(texto) {
  const r = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(typeof texto === 'string' ? texto : '');
  if (!r) return null;
  const [a, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  const data = new Date(Date.UTC(a, m - 1, d));
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) return null;
  return { a, m, d };
}

/**
 * Dias inteiros do nascimento até hoje, pelo calendário do aparelho dela (o dia
 * vira à meia-noite de onde ela está; a conta é feita em datas, não em horas,
 * então fuso e horário de verão não tiram nem põem um dia).
 */
export function diasDeVida(nascimento, hoje = new Date()) {
  const n = lerData(nascimento);
  if (!n) return null;
  const h = typeof hoje === 'string' ? lerData(hoje) : { a: hoje.getFullYear(), m: hoje.getMonth() + 1, d: hoje.getDate() };
  if (!h) return null;
  const dias = Math.round((Date.UTC(h.a, h.m - 1, h.d) - Date.UTC(n.a, n.m - 1, n.d)) / 86400000);
  return dias >= 0 ? dias : null;
}

const guardado = {
  ler() { try { return localStorage.getItem(CHAVE) || ''; } catch { return ''; } },
  gravar(texto) { try { if (texto) localStorage.setItem(CHAVE, texto); else localStorage.removeItem(CHAVE); return true; } catch { return false; } },
};

export function criarDepois(ctx) {
  const { conteudo, amb, som } = ctx;
  const gsap = window.gsap;
  const calmo = amb.reduzido;
  const texto = (v) => (typeof v === 'string' ? v.trim() : '');

  const dadosC = conteudo.contador || {};
  const hoje = (amb.params && amb.params.get('hoje')) || new Date();
  const dias = diasDeVida(dadosC.nascimento, hoje);
  const temContador = dias !== null;

  const dadosR = conteudo.resposta || null;
  const temResposta = !!dadosR && dadosR.ativa !== false;
  const r = dadosR || {};
  const rot = r.rotulos || {};

  const raiz = el('div', { class: 'depois' });
  const veu = el('div', { class: 'depois-veu', 'aria-hidden': 'true' });
  raiz.append(veu);
  let montado = false;
  const montar = () => {
    if (montado) return;
    montado = true;
    document.getElementById('palco').append(raiz);
  };

  // Debaixo da noite fechada o mundo 3D não precisa desenhar (a DPR 3, é o quadro mais caro
  // da carta): desliga quando o véu fecha e religa antes de ele abrir; o último quadro fica
  // parado atrás do véu. Sem WebGL fica ligado (lá desligar esconde a foto, e a borda do véu
  // clarearia). Se ela reler um capítulo pela bolsa com a folha reaberta, a noite sai da
  // frente (html.relendo): o mundo volta na hora.
  let vigia = null;
  const acordar = () => {
    if (!vigia) return;
    vigia.disconnect();
    vigia = null;
    ctx.mundo.ligar();
  };
  const relendo = () => document.documentElement.classList.contains('relendo');
  const dormir = () => {
    if (!ctx.mundo?.ok || !ctx.mundo.ligado || relendo()) return;
    ctx.mundo.desligar();
    vigia = new MutationObserver(() => { if (relendo()) acordar(); });
    vigia.observe(document.documentElement, { attributeFilter: ['class'] });
  };

  // ---- o contador ---------------------------------------------------------------------
  const numero = el('span', { class: 'contador-numero', 'aria-hidden': 'true', texto: '0' });
  const fio = el('span', { class: 'contador-fio', 'aria-hidden': 'true' });   // o mesmo fio costurado do traço da senha
  const rotulo = el('span', { class: 'contador-rotulo', 'aria-hidden': 'true', texto: texto(dadosC.rotulo) || 'dias até aqui' });
  const frase = texto(dadosC.frase) ? el('p', { class: 'contador-frase', texto: texto(dadosC.frase) }) : null;
  const contador = el('div', { class: 'contador', role: 'group' }, [numero, fio, rotulo, frase]);
  // cada algarismo numa casa de largura fixa: o número não treme enquanto conta
  let mostrado = '';
  const mostrarDias = (n) => {
    const s = String(Math.round(n));
    if (s === mostrado) return;
    mostrado = s;
    while (numero.childElementCount > s.length) numero.lastElementChild.remove();
    if (!numero.childElementCount) numero.textContent = '';
    while (numero.childElementCount < s.length) numero.append(el('span', 'contador-casa'));
    for (let i = 0; i < s.length; i++) { const c = numero.children[i]; if (c.textContent !== s[i]) c.textContent = s[i]; }
  };
  mostrarDias(0);

  // ---- a flor dos dias ------------------------------------------------------------------
  // Enquanto o número conta, cada dia de vida dela vira um pontinho de luz numa espiral de
  // girassol (filotaxia: o dia i no raio R·√(i/N), no ângulo i·137,508°), num canvas atrás
  // do número. O miolo fica vazio (o número mora na noite limpa) e a luz se junta em 14
  // pétalas. Os dias desde que eles se conheceram (contador.conhecemos) ficam em vermelho,
  // nas pontas; hoje é um ponto um pouco maior na ponta da pétala de baixo, logo acima do
  // fio, e pulsa quando o número chega. Antes do rótulo e da frase a flor baixa para 35%;
  // ao recolher o contador ela se dissolve ali mesmo (não sobe junto).
  const juntos = Math.min(dias || 0, diasDeVida(dadosC.conhecemos, hoje) || 0);
  let flor = null;
  function criarFlor() {
    const fs = parseFloat(getComputedStyle(numero).fontSize) || 60;
    const R = fs * 2.08;                                   // ~140 px no iPhone dela, proporcional no computador
    const miolo = R / 2;
    const n = numero.getBoundingClientRect();
    const tela0 = raiz.getBoundingClientRect();
    const cy = n.top + n.height / 2;
    // o fio, o rótulo e a frase descem para fora da flor; sem lugar (celular deitado), sem flor
    const d = cy + R + 16 - fio.getBoundingClientRect().top;
    if (cy - R < tela0.top + 8 || (frase || rotulo).getBoundingClientRect().bottom + d > tela0.bottom - 16) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const lado = Math.ceil(2 * R + 4);
    const meioY = cy - (tela0.top + tela0.height / 2);      // o centro do número, contado do meio da tela
    const tela = el('canvas', {
      class: 'contador-flor', 'aria-hidden': 'true', width: Math.round(lado * dpr), height: Math.round(lado * dpr),
      style: { width: `${lado}px`, height: `${lado}px`, marginLeft: `${-lado / 2}px`, marginTop: `${meioY - lado / 2}px` },
    });
    const ponto = el('span', { class: 'contador-hoje', 'aria-hidden': 'true', style: { marginTop: `${meioY + R - 2.5}px` } });
    const c = tela.getContext('2d');
    if (!c) return null;
    c.setTransform(dpr, 0, 0, dpr, (lado / 2) * dpr, (lado / 2) * dpr);
    const cor = (nome) => getComputedStyle(raiz).getPropertyValue(nome).trim();
    const luar = cor('--luar') || '#fdf6ee';
    const vermelho = cor('--fio') || '#d7192d';
    const N = dias;
    const i0 = (N * miolo * miolo) / (R * R - miolo * miolo);   // os dias que caberiam no miolo (ficam de fora)
    const ouro = (137.508 * Math.PI) / 180;
    const petala = (2 * Math.PI) / 14;                      // 14: uma pétala embaixo (a de hoje) e vãos nas pontas do número
    const rp = Math.min(0.8, 0.25 * Math.sqrt((Math.PI * (R * R - miolo * miolo)) / N));   // pontinho de ≤ 0,8 px
    const ax = (String(N).length * 0.66 * fs) / 2 + 4;     // a caixa do número: ali não nasce ponto
    const ay = 0.36 * fs + 6;
    let feitos = 0;
    const desenhar = (ate) => {
      for (const fim = Math.min(Math.floor(ate), N - 1); feitos < fim; feitos++) {   // o último é o ponto de hoje
        const i = feitos;
        const r = R * Math.sqrt((i + i0) / (N - 1 + i0));
        const a = (i - N + 1) * ouro;                       // hoje (a = 0) fica embaixo
        const x = -r * Math.sin(a);
        const y = r * Math.cos(a);
        const s = (r - miolo) / (R - miolo);                // 0 no miolo, 1 na borda
        const meia = 0.72 * petala * Math.sqrt(s * (1 - s)) + 0.012;   // a pétala é uma elipse
        const naPetala = 1 - suave((Math.abs(a - petala * Math.round(a / petala)) / meia - 0.55) / 0.45);
        const limpo = suave(((x / ax) ** 2 + (y / ay) ** 2 - 1) / 0.6);
        const nos = i >= N - juntos;
        c.globalAlpha = (nos ? 0.7 * (0.12 + 0.88 * naPetala) : 0.04 + 0.18 * naPetala) * limpo;
        c.fillStyle = nos ? vermelho : luar;
        c.beginPath();
        c.arc(x, y, rp, 0, Math.PI * 2);
        c.fill();
      }
    };
    raiz.insertBefore(tela, contador);
    raiz.insertBefore(ponto, contador);
    return { tela, ponto, d, desenhar };
  }

  /** A flor se dissolve onde está (não sobe com o contador) e o texto volta para baixo do número. */
  function soltarFlor() {
    if (!flor) return;
    const { tela, ponto, d } = flor;
    flor = null;
    removeEventListener('resize', aoGirar);
    gsap.to([tela, ponto], { autoAlpha: 0, duration: calmo ? 0.4 : 0.9, ease: 'none', overwrite: true, onComplete: () => { tela.remove(); ponto.remove(); } });
    // sai da margem e, na mesma hora, desliza de onde estava (nada pula)
    fio.style.marginTop = '';
    gsap.fromTo(frase ? [fio, rotulo, frase] : [fio, rotulo], { y: d }, { y: 0, duration: calmo ? 0.01 : 1.5, ease: 'power2.inOut' });
  }
  // girou o aparelho no meio da conta: a flor, medida para a outra tela, sai
  let largura = 0;
  const aoGirar = () => { if (innerWidth !== largura) soltarFlor(); };

  async function contar() {
    if (!temContador) return;
    montar();
    contador.dataset.dias = String(dias);
    contador.setAttribute('aria-label', `${dias} ${rotulo.textContent}`);
    raiz.append(contador);
    gsap.set([contador, rotulo, fio, ...(frase ? [frase] : [])], { autoAlpha: 0 });
    gsap.set(contador, { autoAlpha: 1 });
    gsap.set(numero, { autoAlpha: 0 });
    flor = criarFlor();
    if (flor) {
      gsap.set([flor.tela, flor.ponto], { autoAlpha: 0 });
      fio.style.marginTop = `${flor.d}px`;                // o fio, o rótulo e a frase descem para fora da flor
      largura = innerWidth;
      addEventListener('resize', aoGirar);
    }
    await new Promise((ok) => {
      const tl = gsap.timeline({ onComplete: ok });
      tl.to(veu, { opacity: 1, duration: calmo ? 0.8 : 1.6, ease: 'sine.inOut', onComplete: dormir }, 0);
      tl.to(numero, { autoAlpha: 1, duration: 0.9, ease: 'none' }, calmo ? 0.4 : 0.9);
      if (calmo) {
        tl.call(() => mostrarDias(dias), null, 0);
        // movimento reduzido: a flor já vem inteira, só a opacidade entra
        if (flor) {
          flor.desenhar(dias);
          tl.to([flor.tela, flor.ponto], { autoAlpha: 1, duration: 0.9, ease: 'none' }, 0.4);
        }
      } else {
        const conta = { v: 0 };
        if (flor) tl.set(flor.tela, { autoAlpha: 1 }, 1.3);
        tl.to(conta, {
          v: dias, duration: 3.4, ease: 'power2.out',
          onUpdate: () => { mostrarDias(conta.v); flor?.desenhar(conta.v); },
          onComplete: () => { mostrarDias(dias); flor?.desenhar(dias); som.efeito?.('brilho'); },
        }, 1.3);
        // chegou: o número assenta com um pulinho, e o ponto de hoje acende pulsando junto
        tl.fromTo(numero, { scale: 1 }, { scale: 1.07, duration: 0.16, ease: 'power2.out' }, 4.7);
        tl.to(numero, { scale: 1, duration: 0.5, ease: 'back.out(2.2)' }, 4.86);
        if (flor) {
          tl.fromTo(flor.ponto, { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 2.4, duration: 0.16, ease: 'power2.out' }, 4.7);
          tl.to(flor.ponto, { scale: 1, duration: 0.5, ease: 'back.out(2.2)' }, 4.86);
        }
      }
      const depois = (calmo ? 1.4 : 4.9) + (flor ? (calmo ? 1.2 : 0.7) : 0);
      if (flor) tl.to(flor.tela, { opacity: 0.35, duration: calmo ? 0.6 : 0.9, ease: 'sine.inOut' }, depois - 0.6);
      tl.fromTo(fio, { autoAlpha: 0, scaleX: calmo ? 1 : 0 }, { autoAlpha: 1, scaleX: 1, duration: calmo ? 0.6 : 0.9, ease: 'power3.out' }, depois - (calmo ? 0 : 0.1));
      tl.to(rotulo, { autoAlpha: 1, duration: 0.9, ease: 'none' }, depois + (calmo ? 0 : 0.25));
      if (frase) tl.fromTo(frase, { autoAlpha: 0, y: calmo ? 0 : 10 }, { autoAlpha: 1, y: 0, duration: 1.4, ease: 'power2.out' }, depois + 1.1);
      tl.to({}, { duration: frase ? 3.6 : 2.2 });       // ela lê
    });
  }

  /** O contador sobe e fica pequeno no alto (só transform e opacidade). */
  function recolherContador() {
    if (!temContador || contador.dataset.alto !== undefined) return Promise.resolve();
    contador.dataset.alto = '';
    const caixa = contador.getBoundingClientRect();
    const meioNumero = numero.getBoundingClientRect();
    const seguro = parseFloat(getComputedStyle(raiz).getPropertyValue('--depois-topo')) || 0;
    const escala = 0.46;
    // o número (escalado) fica centrado logo abaixo da área segura do alto
    const alvoY = seguro + 30;
    const origemY = caixa.top;                             // transform-origin: 50% 0
    const numY = (meioNumero.top + meioNumero.height / 2 - caixa.top) * escala;
    const y = alvoY - numY - origemY;
    if (frase) gsap.to(frase, { autoAlpha: 0, duration: 0.7, ease: 'none' });
    soltarFlor();
    return new Promise((ok) => gsap.to(contador, {
      y, scale: escala, duration: calmo ? 0.01 : 1.5, ease: 'power2.inOut', onComplete: ok,
    }));
  }

  // ---- a folha de resposta ------------------------------------------------------------
  let folha = null;
  let campo = null;
  let aviso = null;
  let enviar = null;
  let aoGuardar = null;
  let aberta = false;
  const reabrir = el('button', { class: 'depois-reabrir ui-pilula', type: 'button', dataset: { acao: 'resposta-abrir', tom: 'noite' } },
    [svg(PENA), el('span', { texto: texto(rot.reabrir) || 'Escrever de volta' })]);

  const mensagem = () => {
    const escrito = campo ? campo.value.trim() : '';
    const antes = texto(r.antes);
    return escrito ? (antes ? `${antes}\n\n${escrito}` : escrito) : '';
  };
  const enderecoWhats = () => {
    const numeroZap = String(r.whatsapp || '').replace(/\D/g, '');
    return `https://wa.me/${numeroZap}?text=${encodeURIComponent(mensagem())}`;
  };
  const atualizar = () => {
    if (!campo) return;
    const tem = !!campo.value.trim();
    folha.toggleAttribute('data-tem', tem);
    enviar.href = tem ? enderecoWhats() : '#';
    enviar.setAttribute('aria-disabled', tem ? 'false' : 'true');
  };
  // com zoom a folha pode não caber: aí ela rola por dentro (css/resposta.css)
  const conferirRola = () => folha.toggleAttribute('data-rola', folha.scrollHeight > folha.clientHeight + 1);
  /** O aviso pequeno embaixo do texto. erro = ela tocou em enviar sem ter escrito: o aviso balança. */
  const avisar = (frase_, erro = false) => {
    if (!aviso) return;
    const t = frase_ || '';
    const mudou = aviso.textContent !== t || erro;
    aviso.textContent = t;
    aviso.toggleAttribute('data-erro', !!erro && !!t);
    if (mudou && aberta) conferirRola();                 // o aviso em duas linhas pode não caber mais
    if (!mudou || !t) return;
    aviso.classList.remove('ui-entra', 'resposta-nega');
    void aviso.offsetWidth;                               // recomeça a animação
    aviso.classList.add(erro ? 'resposta-nega' : 'ui-entra');
  };

  function montarFolha() {
    if (folha) return;
    campo = el('textarea', {
      class: 'resposta-texto ui-campo', rows: '6', dataset: { acao: 'resposta-texto' },
      placeholder: texto(r.dica), 'aria-label': texto(rot.campo) || texto(r.convite) || 'Sua resposta',
      autocapitalize: 'sentences', spellcheck: 'false', enterkeyhint: 'enter',
    });
    campo.value = guardado.ler();
    aviso = el('p', { class: 'resposta-aviso ui-nota', role: 'status', texto: campo.value ? texto(r.guardado) : '' });
    enviar = el('a', {
      class: 'resposta-enviar ui-pilula', href: '#', target: '_blank', rel: 'noopener noreferrer',
      dataset: { acao: 'resposta-enviar', tom: 'fio' },
    }, [svg(AVIAO), el('span', { texto: texto(rot.enviar) || 'Enviar para ele' }), svg(CORACAO)]);
    const outro = (typeof navigator !== 'undefined' && typeof navigator.share === 'function')
      ? el('button', { class: 'resposta-outro', type: 'button', dataset: { acao: 'resposta-compartilhar' }, texto: texto(rot.outro) || 'enviar de outro jeito' })
      : null;
    const guardar = el('button', { class: 'resposta-guardar ui-pilula', type: 'button', dataset: { acao: 'resposta-guardar' }, texto: texto(rot.guardar) || 'Guardar' });
    folha = el('section', { class: 'resposta ui-folha', 'aria-label': texto(rot.folha) || 'Folha em branco' }, [
      el('span', { class: 'ui-laco', 'aria-hidden': 'true', dataset: { onde: 'topo' } }),
      texto(r.convite) ? el('p', { class: 'resposta-convite ui-titulo', texto: texto(r.convite) }) : null,
      campo,
      aviso,
      el('div', { class: 'resposta-botoes' }, [guardar, enviar]),
      outro,
    ]);

    campo.addEventListener('input', () => {
      const ok = guardado.gravar(campo.value);
      avisar(campo.value.trim() ? (ok ? texto(r.guardado) : '') : '');
      atualizar();
    });
    enviar.addEventListener('click', (e) => {
      if (!campo.value.trim()) {
        e.preventDefault();
        avisar(texto(r.vazio), true);
        try { campo.focus({ preventScroll: true }); } catch { /* sem foco */ }
        return;
      }
      enviar.href = enderecoWhats();                         // o toque dela é que abre o WhatsApp
      avisar(texto(r.enviando));
    });
    if (outro) {
      outro.addEventListener('click', async () => {
        if (!campo.value.trim()) { avisar(texto(r.vazio), true); return; }
        try { await navigator.share({ text: mensagem() }); } catch { /* ela desistiu: nada acontece */ }
      });
    }
    guardar.addEventListener('click', () => { guardado.gravar(campo.value); if (aoGuardar) aoGuardar(); });
    atualizar();
  }

  // O teclado do iPhone cobre a metade de baixo: a folha vive na parte de cima e
  // encolhe para caber no que sobra (visualViewport), com o texto sempre à vista.
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const aoViewport = () => {
    if (!aberta) return;
    const altura = vv ? vv.height : innerHeight;
    const comTeclado = altura < innerHeight * 0.78;
    raiz.style.setProperty('--depois-vista', `${Math.round(altura)}px`);
    raiz.toggleAttribute('data-teclado', comTeclado);
    conferirRola();
    // o Safari rola a página para mostrar o campo: a carta não rola, volta ao lugar
    if (comTeclado && (window.scrollY || document.documentElement.scrollTop)) window.scrollTo(0, 0);
  };

  async function abrirFolha() {
    montar();
    montarFolha();
    aberta = true;
    raiz.append(folha);
    raiz.dataset.folha = '';
    if (vv) { vv.addEventListener('resize', aoViewport); vv.addEventListener('scroll', aoViewport); }
    window.addEventListener('resize', aoViewport);
    aoViewport();
    gsap.killTweensOf([folha, veu, reabrir]);
    gsap.to(reabrir, { autoAlpha: 0, duration: 0.3, ease: 'none' });
    gsap.to(veu, { opacity: 1, duration: 0.8, ease: 'sine.inOut', onComplete: dormir });
    som.efeito?.('papel');
    await new Promise((ok) => gsap.fromTo(folha,
      { autoAlpha: 0, y: calmo ? 0 : 34, scale: calmo ? 1 : 0.94, rotation: calmo ? 0 : 1.6 },
      { autoAlpha: 1, y: 0, scale: 1, rotation: 0, duration: calmo ? 0.5 : 0.62, ease: calmo ? 'none' : 'back.out(1.3)', onComplete: ok }));
    // No computador o cursor já fica na folha; no celular o teclado só sobe com o toque dela.
    if (!amb.toque) { try { campo.focus({ preventScroll: true }); } catch { /* sem foco */ } }
  }

  async function fecharFolha() {
    if (!aberta) return;
    aberta = false;
    try { campo.blur(); } catch { /* nada */ }
    if (vv) { vv.removeEventListener('resize', aoViewport); vv.removeEventListener('scroll', aoViewport); }
    window.removeEventListener('resize', aoViewport);
    await new Promise((ok) => gsap.to(folha, { autoAlpha: 0, y: calmo ? 0 : 14, scale: calmo ? 1 : 0.97, duration: calmo ? 0.3 : 0.24, ease: 'power2.out', onComplete: ok }));
    folha.remove();
    delete raiz.dataset.folha;
    raiz.removeAttribute('data-teclado');
  }

  async function escrever() {
    if (!temResposta) return;
    await recolherContador();
    await abrirFolha();
    await new Promise((ok) => { aoGuardar = ok; });
    aoGuardar = null;
    await fecharFolha();
  }

  /** Sem toque (teclado, leitor de tela), o foco não fica perdido no body quando a folha sai. */
  const focarReabrir = () => {
    if (amb.toque || (document.activeElement && document.activeElement !== document.body)) return;
    try { reabrir.focus({ preventScroll: true }); } catch { /* sem foco */ }
  };

  // ---- a letra dela na folha dele -------------------------------------------------------
  const folhaFinal = () => ctx.estado && ctx.estado.folha;
  /** Com a noite já fora da frente: o que ela guardou vai para a folha da frase dele. */
  function escreverNaFolha() {
    const f = folhaFinal();
    if (!campo || !f || typeof f.escreverDela !== 'function' || !campo.value.trim()) return;
    let letras = 0;
    // a mão pousa antes da primeira letra, como na frase dele
    espera(calmo ? 200 : 450).then(() => {
      if (aberta) return;                                  // ela reabriu a folha: a letra vem quando guardar
      return f.escreverDela(campo.value, {
        // a caneta raspa o papel, um pouco mais rápida e mais baixa que a dele
        aoTraco: () => { if (letras++ % 2 === 0) som.efeito?.('caneta', { duracao: 0.7, intensidade: 0.7 }); },
      });
    }).catch((erro) => console.error('[carta] a letra dela', erro));
  }

  /** O estado final: a noite, a folha com a frase, o contador pequeno no alto. */
  function repousar() {
    montar();
    recolherContador();
    acordar();
    gsap.to(veu, { opacity: 0, duration: calmo ? 0.8 : 2.2, ease: 'sine.inOut', overwrite: true, onComplete: escreverNaFolha });
    raiz.dataset.fim = '';
    if (!temResposta) return;
    raiz.append(reabrir);
    gsap.fromTo(reabrir, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.2, delay: calmo ? 0.2 : 1.2, ease: 'none', onComplete: focarReabrir });
    reabrir.addEventListener('click', async () => {
      if (aberta || ctx.inventario?.aberto) return;
      await abrirFolha();
      await new Promise((ok) => { aoGuardar = ok; });
      aoGuardar = null;
      folhaFinal()?.apagarDela?.();                        // a letra antiga sai ainda debaixo da noite
      await fecharFolha();
      acordar();
      gsap.to(veu, { opacity: 0, duration: 1.2, ease: 'sine.inOut', overwrite: true, onComplete: escreverNaFolha });
      gsap.to(reabrir, { autoAlpha: 1, duration: 0.8, ease: 'none', onComplete: focarReabrir });
    });
  }

  return { temContador, temResposta, dias, contar, escrever, repousar };
}
