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
//     .contador            .contador-numero + .contador-rotulo + .contador-frase
//     .resposta            a folha: .resposta-convite, textarea, botões
//     .depois-reabrir      no estado final: abre a folha de novo
//
// O que ela escreve fica só no aparelho dela (localStorage). Nada é enviado
// sozinho: o botão de enviar abre o WhatsApp com o texto pronto, e é ela que
// manda. Onde existir, "enviar de outro jeito" usa o compartilhar do aparelho.
//
// Ganchos de teste: [data-acao="resposta-texto"] (o textarea), "resposta-enviar"
// (um <a> de verdade para wa.me), "resposta-compartilhar", "resposta-guardar",
// "resposta-abrir"; .contador[data-dias].
// Parâmetro só de teste: ?hoje=AAAA-MM-DD finge a data de hoje.

import { el } from '../nucleo/util.js';

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
  const dias = diasDeVida(dadosC.nascimento, (amb.params && amb.params.get('hoje')) || new Date());
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

  // ---- o contador ---------------------------------------------------------------------
  const numero = el('span', { class: 'contador-numero', 'aria-hidden': 'true', texto: '0' });
  const rotulo = el('span', { class: 'contador-rotulo', 'aria-hidden': 'true', texto: texto(dadosC.rotulo) || 'dias até aqui' });
  const frase = texto(dadosC.frase) ? el('p', { class: 'contador-frase', texto: texto(dadosC.frase) }) : null;
  const contador = el('div', { class: 'contador', role: 'group' }, [numero, rotulo, frase]);
  const mostrarDias = (n) => { numero.textContent = String(Math.round(n)); };

  async function contar() {
    if (!temContador) return;
    montar();
    contador.dataset.dias = String(dias);
    contador.setAttribute('aria-label', `${dias} ${rotulo.textContent}`);
    raiz.append(contador);
    gsap.set([contador, rotulo, ...(frase ? [frase] : [])], { autoAlpha: 0 });
    gsap.set(contador, { autoAlpha: 1 });
    gsap.set(numero, { autoAlpha: 0 });
    await new Promise((ok) => {
      const tl = gsap.timeline({ onComplete: ok });
      tl.to(veu, { opacity: 1, duration: calmo ? 0.8 : 1.6, ease: 'sine.inOut' }, 0);
      tl.to(numero, { autoAlpha: 1, duration: 0.9, ease: 'none' }, calmo ? 0.4 : 0.9);
      if (calmo) {
        tl.call(() => mostrarDias(dias), null, 0);
      } else {
        const conta = { v: 0 };
        tl.to(conta, {
          v: dias, duration: 3.4, ease: 'power2.out',
          onUpdate: () => mostrarDias(conta.v),
          onComplete: () => { mostrarDias(dias); som.efeito?.('brilho'); },
        }, 1.3);
      }
      const depois = calmo ? 1.4 : 4.9;
      tl.to(rotulo, { autoAlpha: 1, duration: 0.9, ease: 'none' }, depois);
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
  const reabrir = el('button', { class: 'depois-reabrir', type: 'button', dataset: { acao: 'resposta-abrir' }, texto: texto(rot.reabrir) || 'Escrever de volta' });

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
  const avisar = (frase_) => { if (aviso) aviso.textContent = frase_ || ''; };

  function montarFolha() {
    if (folha) return;
    campo = el('textarea', {
      class: 'resposta-texto', rows: '6', dataset: { acao: 'resposta-texto' },
      placeholder: texto(r.dica), 'aria-label': texto(rot.campo) || texto(r.convite) || 'Sua resposta',
      autocapitalize: 'sentences', spellcheck: 'false', enterkeyhint: 'enter',
    });
    campo.value = guardado.ler();
    aviso = el('p', { class: 'resposta-aviso', role: 'status', texto: campo.value ? texto(r.guardado) : '' });
    enviar = el('a', {
      class: 'resposta-enviar', href: '#', target: '_blank', rel: 'noopener noreferrer',
      dataset: { acao: 'resposta-enviar' }, texto: texto(rot.enviar) || 'Enviar para ele',
    });
    const outro = (typeof navigator !== 'undefined' && typeof navigator.share === 'function')
      ? el('button', { class: 'resposta-outro', type: 'button', dataset: { acao: 'resposta-compartilhar' }, texto: texto(rot.outro) || 'enviar de outro jeito' })
      : null;
    const guardar = el('button', { class: 'resposta-guardar', type: 'button', dataset: { acao: 'resposta-guardar' }, texto: texto(rot.guardar) || 'Guardar' });
    folha = el('section', { class: 'resposta', 'aria-label': texto(rot.folha) || 'Folha em branco' }, [
      texto(r.convite) ? el('p', { class: 'resposta-convite', texto: texto(r.convite) }) : null,
      campo,
      aviso,
      el('div', { class: 'resposta-botoes' }, [enviar, guardar]),
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
        avisar(texto(r.vazio));
        try { campo.focus({ preventScroll: true }); } catch { /* sem foco */ }
        return;
      }
      enviar.href = enderecoWhats();                         // o toque dela é que abre o WhatsApp
      avisar(texto(r.enviando));
    });
    if (outro) {
      outro.addEventListener('click', async () => {
        if (!campo.value.trim()) { avisar(texto(r.vazio)); return; }
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
    gsap.to(veu, { opacity: 1, duration: 0.8, ease: 'sine.inOut' });
    som.efeito?.('papel');
    await new Promise((ok) => gsap.fromTo(folha,
      { autoAlpha: 0, y: calmo ? 0 : 46, rotation: calmo ? 0 : 1.2 },
      { autoAlpha: 1, y: 0, rotation: 0, duration: calmo ? 0.6 : 1.1, ease: 'power3.out', onComplete: ok }));
    // No computador o cursor já fica na folha; no celular o teclado só sobe com o toque dela.
    if (!amb.toque) { try { campo.focus({ preventScroll: true }); } catch { /* sem foco */ } }
  }

  async function fecharFolha() {
    if (!aberta) return;
    aberta = false;
    try { campo.blur(); } catch { /* nada */ }
    if (vv) { vv.removeEventListener('resize', aoViewport); vv.removeEventListener('scroll', aoViewport); }
    window.removeEventListener('resize', aoViewport);
    await new Promise((ok) => gsap.to(folha, { autoAlpha: 0, y: calmo ? 0 : 30, duration: calmo ? 0.4 : 0.7, ease: 'power2.in', onComplete: ok }));
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

  /** O estado final: a noite, a folha com a frase, o contador pequeno no alto. */
  function repousar() {
    montar();
    recolherContador();
    gsap.to(veu, { opacity: 0, duration: calmo ? 0.8 : 2.2, ease: 'sine.inOut' });
    raiz.dataset.fim = '';
    if (!temResposta) return;
    raiz.append(reabrir);
    gsap.fromTo(reabrir, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.2, delay: calmo ? 0.2 : 1.2, ease: 'none' });
    reabrir.addEventListener('click', async () => {
      if (aberta || ctx.inventario?.aberto) return;
      await abrirFolha();
      await new Promise((ok) => { aoGuardar = ok; });
      aoGuardar = null;
      await fecharFolha();
      gsap.to(veu, { opacity: 0, duration: 1.2, ease: 'sine.inOut' });
      gsap.to(reabrir, { autoAlpha: 1, duration: 0.8, ease: 'none' });
    });
  }

  return { temContador, temResposta, dias, contar, escrever, repousar };
}
