// Depois da frase final: o contador dos dias dela e a folha em que ela escreve de volta.
//
//   criarDepois(ctx) → {
//     temContador, temResposta,
//     contar()   → Promise   o número da senha volta e conta de 0 até os dias de vida dela hoje
//     escrever() → Promise   a folha em branco sobe; resolve quando ela toca em "Guardar"
//     repousar()             o estado final: o contador pequeno no alto e o botão de reabrir a folha
//     Com o menu do fim (o bloco menu do content.js; js/cenas/menu.js), mais:
//     seguir     Promise     resolve quando ela toca na pílula "Continuar" / "Voltar ao menu"
//     reescrever() → Promise abre a folha de resposta de novo; resolve depois do "Guardar", com a noite já saindo
//     noAlto()               monta a raiz e mostra o contador já pequeno no alto, sem contar (entrada fria no menu)
//     limparFim() → Promise  a pena e a pílula saem de cena (0,3 s) e são removidas (o menu chegou)
//     reposicionar()         a tela mudou de tamanho: o contador pequeno volta ao lugar dele
//     raiz                   a .depois (o menu entra no palco logo antes dela)
//   }
//   diasDeVida(nascimento, hoje?) → número de dias (ou null se a data não vale)
//
// Tudo é DOM dentro de #palco (some sozinho enquanto ela relê uma carta pela bolsa):
//   .depois
//     .depois-veu          a noite por cima da folha final, para o número se ler
//     .contador-flor       a flor dos dias (canvas 2D atrás do número) e .contador-hoje, o ponto de hoje;
//                          .contador-dia, um pontinho para cada dia de contador.dias
//     .contador            .contador-numero + .contador-rotulo + .contador-frase (+ .contador-lembra, a
//                          linha de cada dia de contador.dias, e .contador-brilho, a luz da virada do dia)
//     .resposta            a folha: .resposta-convite, textarea, botões
//     .depois-reabrir      no estado final: abre a folha de novo (com o menu do fim: só a pena, à esquerda)
//     .depois-ir           com o menu do fim: a pílula que leva ao menu, no meio
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
// "resposta-abrir", "menu-ir" (a pílula que leva ao menu); .contador[data-dias].
// Parâmetro só de teste: ?hoje=AAAA-MM-DD finge a data de hoje (o dia fingido também vira à
// meia-noite do aparelho, um a mais).
//
// Os dias que importam (contador.dias, opcional): quando o número chega, até 3 dias da lista
// acendem na flor, um de cada vez, com a linha "no seu dia 7.412: ..." no lugar em que o fio e
// o rótulo vêm depois. Lista vazia = nada muda, nem o tempo.
// A virada do dia: com o contador pequeno no alto (o fim e o menu), um temporizador espera a
// próxima meia-noite do aparelho (refeito quando a página volta a ficar visível) e o número
// passa para o dia novo na frente dela.

import { el, svg, suave, espera, menuLembrado } from '../nucleo/util.js';
import { temMenu } from '../nucleo/diretor.js';

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
// A seta da pílula que leva ao menu: para cima, de onde o fio desce.
const SETA = `
  <svg class="ui-icone depois-ir-seta" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 19.2 V5.4 M6.8 10.4 L12 5.2 L17.2 10.4"/>
  </svg>`;

const CHAVE = 'carta2312:resposta';
const ESCALA_ALTO = 0.46;            // o contador pequeno, no alto

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

/** 7412 → '7.412'. */
const comPonto = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

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
  // O dia de hoje pelo calendário do aparelho. ?hoje= (só de teste) vira um desvio em dias, e
  // não uma data parada: o dia fingido também vira à meia-noite.
  const diaReal = () => { const a = new Date(); return Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) / 86400000; };
  const pedido = lerData(amb.params && amb.params.get('hoje'));
  const desvio = pedido ? Date.UTC(pedido.a, pedido.m - 1, pedido.d) / 86400000 - diaReal() : 0;
  const hojeAgora = () => new Date((diaReal() + desvio) * 86400000).toISOString().slice(0, 10);
  const hoje = hojeAgora();
  let dias = diasDeVida(dadosC.nascimento, hoje);
  const temContador = dias !== null;

  const dadosR = conteudo.resposta || null;
  const temResposta = !!dadosR && dadosR.ativa !== false;
  const r = dadosR || {};
  const rot = r.rotulos || {};

  // O menu do fim existe? Então a fileira de baixo muda: a pena sozinha à esquerda e, no
  // meio, a pílula que leva ao menu.
  const comMenu = temMenu(conteudo);
  const rotMenu = (comMenu && conteudo.menu.rotulos) || {};

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
  const rotular = () => {
    contador.dataset.dias = String(dias);
    contador.setAttribute('aria-label', `${dias} ${rotulo.textContent}`);
  };
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
  // Os dias que importam (contador.dias): os 3 primeiros da lista que caem dentro da vida dela,
  // em ordem de data. n é o número daquele dia, na mesma conta do contador.
  const lembrados = (Array.isArray(dadosC.dias) ? dadosC.dias : [])
    .map((d) => ({ n: diasDeVida(dadosC.nascimento, d && d.data), fala: texto(d && d.texto) }))
    .filter((d) => temContador && d.n !== null && d.n <= dias && d.fala)
    .slice(0, 3)
    .sort((a, b) => a.n - b.n);
  // a linha de cada um, no lugar em que o fio e o rótulo vêm depois (role="status": o leitor de tela lê cada uma)
  const lembraDia = el('span', 'contador-lembra-dia');
  const lembraFala = el('span', 'contador-lembra-fala');
  const lembra = lembrados.length ? el('p', { class: 'contador-lembra', role: 'status' }, [lembraDia, lembraFala]) : null;
  const PASSO_DIA = 3.1;                                   // entra (0,5 s), fica (2,2 s), sai (0,4 s)
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
    // cada dia que importa é um pontinho do fio em cima do pontinho dele na espiral (o de hoje já tem o seu)
    const marcas = lembrados.map(({ n }) => {
      if (n >= N) return null;
      const i = Math.max(0, n - 1);
      const r = R * Math.sqrt((i + i0) / (N - 1 + i0));
      const a = (i - N + 1) * ouro;
      const marca = el('span', { class: 'contador-dia', 'aria-hidden': 'true', style: { marginLeft: `${-r * Math.sin(a) - 2}px`, marginTop: `${meioY + r * Math.cos(a) - 2}px` } });
      raiz.insertBefore(marca, contador);
      return marca;
    });
    return { tela, ponto, d, desenhar, marcas };
  }

  /** A flor se dissolve onde está (não sobe com o contador) e o texto volta para baixo do número. */
  function soltarFlor() {
    if (!flor) return;
    const { tela, ponto, d } = flor;
    const pecas = [tela, ponto, ...flor.marcas.filter(Boolean)];
    flor = null;
    removeEventListener('resize', aoGirar);
    gsap.to(pecas, { autoAlpha: 0, duration: calmo ? 0.4 : 0.9, ease: 'none', overwrite: true, onComplete: () => { for (const no of pecas) no.remove(); } });
    // sai da margem e, na mesma hora, desliza de onde estava (nada pula)
    fio.style.marginTop = '';
    if (lembra) lembra.style.top = `${fio.offsetTop}px`;
    gsap.fromTo(frase ? [fio, rotulo, frase] : [fio, rotulo], { y: d }, { y: 0, duration: calmo ? 0.01 : 1.5, ease: 'power2.inOut' });
  }
  // girou o aparelho no meio da conta: a flor, medida para a outra tela, sai
  let largura = 0;
  const aoGirar = () => { if (innerWidth !== largura) soltarFlor(); };

  async function contar() {
    if (!temContador) return;
    montar();
    rotular();
    raiz.append(contador);
    gsap.set([contador, rotulo, fio, ...(frase ? [frase] : [])], { autoAlpha: 0 });
    gsap.set(contador, { autoAlpha: 1 });
    gsap.set(numero, { autoAlpha: 0 });
    flor = criarFlor();
    if (flor) {
      gsap.set([flor.tela, flor.ponto], { autoAlpha: 0 });
      fio.style.marginTop = `${flor.d}px`;                // o fio, o rótulo e a frase descem para fora da flor
      gsap.set(flor.marcas.filter(Boolean), { autoAlpha: 0 });
      largura = innerWidth;
      addEventListener('resize', aoGirar);
    }
    if (lembra) {
      contador.append(lembra);
      lembra.style.top = `${fio.offsetTop}px`;
      gsap.set(lembra, { autoAlpha: 0 });
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
      // os dias que importam: um de cada vez, o pontinho acende na flor e a linha diz o que foi
      const chegou = (calmo ? 1.4 : 4.9) + (flor ? (calmo ? 1.2 : 0.7) : 0);
      lembrados.forEach(({ n, fala }, k) => {
        const t = chegou + k * PASSO_DIA;
        const marca = flor && flor.marcas[k];
        tl.call(() => { lembraDia.textContent = `no seu dia ${comPonto(n)}:`; lembraFala.textContent = fala; }, null, t);
        tl.fromTo(lembra, { autoAlpha: 0, y: calmo ? 0 : 8 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: calmo ? 'none' : 'power2.out' }, t);
        tl.to(lembra, { autoAlpha: 0, duration: 0.4, ease: 'none' }, t + 2.7);
        if (!marca) return;
        if (calmo) tl.to(marca, { autoAlpha: 1, duration: 0.5, ease: 'none' }, t);
        else {
          tl.fromTo(marca, { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 2.2, duration: 0.16, ease: 'power2.out' }, t);
          tl.to(marca, { scale: 1.25, duration: 0.5, ease: 'back.out(2.2)' }, t + 0.16);
        }
        // deu lugar ao próximo: continua aceso, discreto
        tl.to(marca, { opacity: 0.7, scale: calmo ? 1 : 0.8, duration: 0.4, ease: 'sine.inOut' }, t + 2.7);
      });
      const depois = chegou + lembrados.length * PASSO_DIA;
      if (lembra) tl.call(() => lembra.remove(), null, depois);
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
    const escala = ESCALA_ALTO;
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

  /**
   * A mesma conta de recolherContador, feita pelas medidas de antes da escala (offset*): onde
   * o contador pequeno mora nesta tela. Serve para nascer já no alto (a entrada fria no menu).
   */
  const yNoAlto = () => {
    const seguro = parseFloat(getComputedStyle(raiz).getPropertyValue('--depois-topo')) || 0;
    return seguro + 30 - (numero.offsetTop + numero.offsetHeight / 2) * ESCALA_ALTO - contador.offsetTop;
  };

  /** Monta a raiz e mostra o contador já pequeno no alto, sem contar. */
  function noAlto() {
    montar();
    raiz.dataset.fim = '';
    if (!temContador || contador.dataset.alto !== undefined) return;
    rotular();
    mostrarDias(dias);
    if (frase) gsap.set(frase, { autoAlpha: 0 });
    raiz.append(contador);
    contador.dataset.alto = '';
    gsap.set(contador, { y: yNoAlto(), scale: ESCALA_ALTO });
    conferirDia();
  }

  // ---- a virada do dia ------------------------------------------------------------------
  // Com o contador pequeno no alto (o fim e o menu), um temporizador espera a próxima
  // meia-noite do aparelho; ao voltar a ficar visível, a conta é refeita (o iPhone para os
  // temporizadores da aba escondida). O número passa para o dia novo na frente dela, com o
  // mesmo pulinho da chegada e uma luz curta por trás (movimento reduzido: só troca).
  const brilho = el('span', { class: 'contador-brilho', 'aria-hidden': 'true' });
  let viraEm = 0;
  function conferirDia() {
    clearTimeout(viraEm);
    // com a aba escondida nada troca: a virada espera ela voltar, para acontecer na frente dela
    if (!temContador || contador.dataset.alto === undefined || !contador.isConnected || document.hidden) return;
    const agora = new Date();
    const falta = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1).getTime() - agora.getTime();
    viraEm = setTimeout(conferirDia, Math.max(1000, falta + 500));
    const novo = diasDeVida(dadosC.nascimento, hojeAgora());
    if (novo === null || novo === dias) return;
    dias = novo;
    rotular();
    if (calmo) { mostrarDias(dias); return; }
    if (!brilho.isConnected) contador.append(brilho);
    som.efeito?.('brilho');
    gsap.timeline()
      .to(numero, { scale: 1.12, duration: 0.16, ease: 'power2.out', overwrite: true })
      .call(() => mostrarDias(dias))
      .to(numero, { scale: 1, duration: 0.5, ease: 'back.out(2.2)' })
      .fromTo(brilho, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'power2.out' }, 0)
      .to(brilho, { opacity: 0, duration: 1.4, ease: 'sine.inOut' }, 0.3);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) conferirDia(); });

  // ---- a folha de resposta ------------------------------------------------------------
  let folha = null;
  let campo = null;
  let aviso = null;
  let enviar = null;
  let aoGuardar = null;
  let aberta = false;
  const nomeReabrir = texto(rot.reabrir) || 'Escrever de volta';
  // Com o menu do fim a pena fica sozinha, redonda, à esquerda (o nome vira aria-label).
  const reabrir = comMenu
    ? el('button', { class: 'depois-reabrir ui-redondo', type: 'button', 'aria-label': nomeReabrir, dataset: { acao: 'resposta-abrir', tom: 'noite', so: 'pena' } }, svg(PENA))
    : el('button', { class: 'depois-reabrir ui-pilula', type: 'button', dataset: { acao: 'resposta-abrir', tom: 'noite' } },
      [svg(PENA), el('span', { texto: nomeReabrir })]);
  // A pílula que leva ao menu: "Continuar" na primeira vez; depois, "Voltar ao menu".
  const ir = comMenu
    ? el('button', { class: 'depois-ir ui-pilula', type: 'button', dataset: { acao: 'menu-ir' } },
      [svg(SETA), el('span', { texto: (menuLembrado() ? texto(rotMenu.voltar) : texto(rotMenu.continuar)) || texto(rotMenu.continuar) || texto(rotMenu.voltar) || 'Continuar' })])
    : null;
  if (ir) ir.addEventListener('touchstart', () => {}, { passive: true });   // (no iPhone, :active só vale com um ouvinte de toque)
  let resolverSeguir = null;
  const seguir = new Promise((ok) => { resolverSeguir = ok; });
  /** O que fica na fileira de baixo no estado final. */
  const fileira = () => [temResposta ? reabrir : null, ir].filter(Boolean);

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
    gsap.killTweensOf([folha, veu, ...fileira()]);
    gsap.to(fileira(), { autoAlpha: 0, duration: 0.3, ease: 'none' });
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
    // com o menu do fim, o próximo passo é a pílula que leva a ele
    const alvo = ir && ir.isConnected ? ir : reabrir;
    if (!alvo.isConnected) return;
    try { alvo.focus({ preventScroll: true }); } catch { /* sem foco */ }
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
    conferirDia();
    acordar();
    gsap.to(veu, { opacity: 0, duration: calmo ? 0.8 : 2.2, ease: 'sine.inOut', overwrite: true, onComplete: escreverNaFolha });
    raiz.dataset.fim = '';
    const pecas = fileira();
    if (!pecas.length) return;
    raiz.toggleAttribute('data-menu', !!ir);
    raiz.append(...pecas);
    gsap.fromTo(pecas, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.2, delay: calmo ? 0.2 : 1.2, ease: 'none', onComplete: focarReabrir });
  }

  /**
   * Abre a folha de resposta de novo (o botão do estado final e, no menu do fim, a folha
   * com a pena do chão). Resolve depois do "Guardar", com a noite já saindo da frente.
   */
  let reescrevendo = false;
  async function reescrever() {
    if (!temResposta || reescrevendo || aberta || ctx.inventario?.aberto) return;
    reescrevendo = true;
    try {
      await abrirFolha();
      await new Promise((ok) => { aoGuardar = ok; });
      aoGuardar = null;
      folhaFinal()?.apagarDela?.();                        // a letra antiga sai ainda debaixo da noite
      await fecharFolha();
      acordar();
      gsap.to(veu, { opacity: 0, duration: 1.2, ease: 'sine.inOut', overwrite: true, onComplete: escreverNaFolha });
      gsap.to(fileira(), { autoAlpha: 1, duration: 0.8, ease: 'none', onComplete: focarReabrir });
    } finally {
      reescrevendo = false;
    }
  }
  reabrir.addEventListener('click', () => { reescrever(); });
  if (ir) {
    ir.addEventListener('click', () => {
      // com a folha de resposta ou a bolsa na frente, o toque não é para ela
      if (aberta || reescrevendo || ctx.inventario?.aberto || !raiz.hasAttribute('data-fim')) return;
      resolverSeguir();
    });
  }

  /** O menu chegou: a pena e a pílula saem de cena e são removidas. */
  function limparFim() {
    const pecas = fileira().filter((no) => no.isConnected);
    raiz.removeAttribute('data-menu');
    if (!pecas.length) return Promise.resolve();
    gsap.killTweensOf(pecas);
    for (const no of pecas) { no.disabled = true; no.style.pointerEvents = 'none'; }
    return new Promise((ok) => gsap.to(pecas, {
      autoAlpha: 0, duration: 0.3, ease: 'none', onComplete: () => { for (const no of pecas) no.remove(); ok(); },
    }));
  }

  /** A tela mudou de tamanho com o contador já no alto: ele volta ao lugar dele nesta tela. */
  function reposicionar() {
    if (!temContador || contador.dataset.alto === undefined || !contador.isConnected || gsap.isTweening(contador)) return;
    gsap.set(contador, { y: yNoAlto() });
  }

  return { temContador, temResposta, get dias() { return dias; }, contar, escrever, repousar, seguir, reescrever, noAlto, limparFim, reposicionar, raiz };
}
