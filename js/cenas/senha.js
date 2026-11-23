/* ============================================================================
   SENHA: a noite funda do começo
   ============================================================================
   Um campo de uma linha, sem casas, para não entregar o tamanho da senha, sob
   uma lanterna de papel apagada. Cada tecla que aumenta o texto toca uma nota
   do Parabéns numa caixinha de música e dá um pouco mais de chama à lanterna;
   a senha certa (ou a mestra) é aceita assim que termina de ser digitada, sem
   botão. O erro encolhe a chama até a brasa, faz o campo dizer não e o
   esvazia, e as dicas vêm em sequência num papelzinho aceso; um palpite
   esperado responde no lugar do aviso, sem contar erro (a lanterna só
   balança); antes de liberaEm a senha certa diz "ainda não", com a contagem
   regressiva até o dia. No acerto a lanterna acende inteira, o fio vermelho é
   costurado por baixo do campo, o coração pousa na ponta, duas notas fecham a
   frase e a luz da lanterna se abre sobre a tela.

   sairDaEntrada abre as pálpebras, tingidas de luz quente, sobre a alameda e
   tira #entrada do DOM.

   Não é segurança: o código está em content.js (senha.codigo). É um ritual.
   ========================================================================== */

import { el, svg, espera } from '../nucleo/util.js';
import { curvas, comoPromise } from '../nucleo/movimento.js';
import { aquecerAbertura } from './abertura.js';

// A cor da barra do navegador: a noite funda da entrada, e o céu quando o mundo aparece.
const COR_ENTRADA = '#060914';
const COR_MUNDO = '#0b1026';

// O Parabéns (Hill, 1893, domínio público; só a melodia), uma oitava acima, no
// registro de caixinha de música. O caractere N toca a nota N; depois da 19ª recomeça.
const PARABENS = [784, 784, 880, 784, 1174.7, 1046.5, 784, 784, 1568, 1318.5, 1046.5, 987.8, 880, 1396.9, 1396.9, 1318.5, 1046.5, 1174.7, 1046.5];
// As duas notas que fecham a primeira frase da melodia, tocadas no acerto.
const FECHO = [1046.5, 987.8];

const RESPOSTA = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
// A luz da lanterna pulsa duas vezes quando o dia chega (1100 ms).
const BATIDAS = [
  { transform: 'scale(1)', easing: 'ease-in-out' },
  { transform: 'scale(1.3)', offset: 0.14, easing: RESPOSTA },
  { transform: 'scale(1)', offset: 0.36, easing: 'ease-in-out' },
  { transform: 'scale(1.3)', offset: 0.5, easing: RESPOSTA },
  { transform: 'scale(1)' },
];
const PULSO = [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }];

// O olho que abre: hesita meio aberto e então se abre de vez.
const CURVA_OLHOS = 'M0,0 C0.15,0 0.25,0.17 0.4,0.2 0.55,0.23 0.62,1 1,1';

const ROTULOS_CONTA = ['dias', 'horas', 'min', 'seg'];
const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

const SETA = '<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M12.8 6.5 18.5 12l-5.7 5.5"/></svg>';

// A lanterna de papel, desenhada à mão no viewBox 48 × 72: cordão, tampa, corpo
// com varetas, base e borla. Por dentro, o papel aceso (opacidade da GSAP) e a
// chama, que cresce a partir do pé (24, 49.5).
const ORIGEM_CHAMA = '24 49.5';
const CORPO = 'M16 13.2C6.5 15.5 3.6 25 3.8 35.6S7.6 54.2 16.4 57.4c4.6 1.2 11 1.2 15.4-.1 8.8-2.9 12.5-11.3 12.4-21.9S41.3 15.6 32 13.1c-5-.8-11-.7-16 .1z';
const LANTERNA = '<svg class="senha-lanterna-svg" viewBox="0 0 48 72" aria-hidden="true">'
  + '<defs>'
  + '<radialGradient id="senha-luz-papel" cx="50%" cy="64%" r="64%">'
  + '<stop offset="0" style="stop-color:var(--papel)"/>'
  + '<stop offset="0.36" style="stop-color:var(--ouro-claro)"/>'
  + '<stop offset="0.78" style="stop-color:var(--chama)"/>'
  + '<stop offset="1" style="stop-color:var(--brasa)"/>'
  + '</radialGradient>'
  + '<radialGradient id="senha-luz-chama">'
  + '<stop offset="0" style="stop-color:var(--chama);stop-opacity:0.85"/>'
  + '<stop offset="1" style="stop-color:var(--brasa);stop-opacity:0"/>'
  + '</radialGradient>'
  + '</defs>'
  + '<path class="senha-l-corda" d="M24 0v9.4"/>'
  + `<path class="senha-l-papel" d="${CORPO}"/>`
  + `<path class="senha-l-luz" d="${CORPO}"/>`
  + '<g class="senha-chama"><g class="senha-chama-viva">'
  + '<circle class="senha-chama-halo" cx="24" cy="44.5" r="11"/>'
  + '<path class="senha-chama-fogo" d="M24 35.6c1.7 3.1 4.5 6 4.5 9.4a4.5 4.5 0 0 1-9 0c0-3.4 2.8-6.3 4.5-9.4z"/>'
  + '<path class="senha-chama-miolo" d="M24 41.4c.9 1.5 2.2 2.9 2.2 4.5a2.2 2.2 0 0 1-4.4 0c0-1.6 1.3-3 2.2-4.5z"/>'
  + '</g></g>'
  + '<path class="senha-l-varetas" d="M7.4 20.4Q24 23 40.6 20.4M5.2 27.6Q24 30.6 42.8 27.6M4.3 35.4Q24 38.6 43.8 35.4M5.2 43.2Q24 46.2 42.9 43.2M8.2 50.4Q24 52.8 39.8 50.4"/>'
  + '<path class="senha-l-tampa" d="M15.4 9.3c3-.9 14.2-.9 17.2 0l.5 3.9c-3.2.6-15.2.6-18.2 0z"/>'
  + '<path class="senha-l-base" d="M16.2 57.3c3.8.9 11.8.9 15.6 0l.4 3.6c-4 .7-12.4.7-16.4 0z"/>'
  + '<path class="senha-l-borla" d="M24 61.2v3.4"/>'
  + '<path class="senha-l-franja" d="M22.6 64.4h2.8l.7 5.8c-1.4.5-2.8.5-4.2 0z"/>'
  + '</svg>';

const texto = (v) => (typeof v === 'string' ? v : '');

function corDoNavegador(cor) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cor);
}

export async function cenaSenha(ctx) {
  const { conteudo, diretor, som, amb, recursos } = ctx;
  diretor.etapa('senha');
  const raiz = document.getElementById('entrada-senha');
  const dados = conteudo?.senha || {};
  const codigo = texto(dados.codigo).trim();
  if (!raiz || !codigo) return;

  const gsap = ctx.gsap || window.gsap;
  const calmo = !!amb?.reduzido;
  const mestra = texto(dados.mestra).trim();
  const liberaEm = DATA.test(texto(dados.liberaEm)) ? dados.liberaEm : '';
  const dicas = Array.isArray(dados.dicas)
    ? dados.dicas.filter((d) => texto(d).trim())
    : [texto(dados.dica).trim()].filter(Boolean);
  const palpites = Array.isArray(dados.palpites) ? dados.palpites : [];
  corDoNavegador(COR_ENTRADA);

  // ?hoje=AAAA-MM-DD: o dia vira meio-dia local, e o relógio anda dali em diante.
  const pedido = DATA.exec(new URLSearchParams(location.search).get('hoje') || '');
  const base = pedido ? new Date(+pedido[1], pedido[2] - 1, +pedido[3], 12).getTime() : 0;
  const inicio = Date.now();
  const agora = () => (base ? base + Date.now() - inicio : Date.now());
  const dia = (t) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const cedo = () => !!liberaEm && dia(agora()) < liberaEm;

  // Senha e mestra: sem diferença de maiúsculas nem de espaços nas pontas.
  const mesmo = (v, c) => !!c && v.trim().toLowerCase() === c.toLowerCase();
  const igual = (v) => (mesmo(v, codigo) && !cedo()) || mesmo(v, mestra);
  const antesDaHora = (v) => mesmo(v, codigo) && cedo();
  // Palpites: também sem acentos e sem espaço nenhum ('Te Amo' = 'teamo').
  // A faixa dos acentos vai escrita em \u: o caractere combinante solto some ao salvar.
  const chave = (v) => texto(v).normalize('NFD').replace(/[̀-ͯ\s]/g, '').toLowerCase();
  const palpite = (v) => {
    const k = chave(v);
    const achado = k && palpites.find((p) => chave(p?.se) === k);
    return achado ? texto(achado.diz) : '';
  };

  /* ---- a forma -------------------------------------------------------------- */

  const forma = el('div', 'senha ui-escuro');
  const campo = el('input', {
    class: 'senha-campo',
    type: 'text',
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
    'aria-label': texto(dados.rotulo).trim() || 'Senha',
    dataset: { acao: 'senha' },
  });
  const ir = el('button', {
    class: 'senha-ir ui-redondo',
    type: 'button',
    tabindex: '-1',
    'aria-label': texto(dados.rotuloConfirmar).trim() || 'Confirmar',
    dataset: { acao: 'senha-ir', tom: 'noite' },
  }, svg(SETA));
  const desenho = svg(LANTERNA);
  const chama = desenho.querySelector('.senha-chama');
  const papelAceso = desenho.querySelector('.senha-l-luz');
  const brilho = el('i', 'senha-halo-luz');
  const halo = el('i', { class: 'senha-halo', 'aria-hidden': 'true' }, brilho);
  const lanterna = el('div', 'senha-lanterna', [halo, desenho]);
  const linha = el('i', 'senha-fio-linha');
  const fio = el('i', 'senha-fio', linha);
  const ponto = el('i', { class: 'senha-ponto ui-coracao', 'aria-hidden': 'true' });
  const aviso = el('p', { class: 'senha-erro', role: 'alert' });
  const dica = el('p', { class: 'senha-dica ui-nota', 'aria-live': 'polite' });

  // A contagem até o dia: só antes de liberaEm, e se o autor não a desligou.
  let conta = null;
  if (cedo() && dados.contagem !== false) {
    const nomes = Array.isArray(dados.contagemRotulos) ? dados.contagemRotulos : [];
    const rotulos = ROTULOS_CONTA.map((r, i) => texto(nomes[i]).trim() || r);
    const frase = texto(dados.contagemFrase).trim();
    const casas = rotulos.map((r) => {
      const n = el('span', 'senha-conta-n');
      return { n, no: el('div', 'senha-conta-casa', [n, el('span', 'senha-conta-r', r)]) };
    });
    // O leitor de tela ouve o rótulo inteiro; as casas e a frase não se repetem.
    const no = el('div', { class: 'senha-conta', role: 'timer', 'aria-live': 'off' }, [
      frase ? el('p', { class: 'senha-conta-frase', 'aria-hidden': 'true' }, frase) : null,
      el('div', { class: 'senha-conta-casas', 'aria-hidden': 'true' }, casas.map((c) => c.no)),
    ]);
    const [a, m, d] = liberaEm.split('-').map(Number);
    conta = { no, casas, rotulos, frase, alvo: new Date(a, m - 1, d).getTime() };
  }

  forma.append(...[
    conta?.no,
    texto(dados.frase).trim() ? el('p', 'senha-frase', dados.frase.trim()) : null,
    lanterna,
    el('div', 'senha-quadro', [campo, el('i', 'senha-traco'), fio, ponto, ir]),
    aviso,
    dica,
  ].filter(Boolean));
  raiz.textContent = '';
  raiz.append(forma);

  // As capas sobem enquanto ela digita: a escolha da música já nasce pronta.
  for (const f of Array.isArray(conteudo?.musica?.faixas) ? conteudo.musica.faixas : []) {
    if (texto(f?.arquivo) && texto(f?.capa)) recursos?.imagem?.(f.capa);
  }

  /* ---- a luz ------------------------------------------------------------------ */

  // O dia que chegou deixa a lanterna meio acesa antes de ela digitar.
  let piso = 0;
  // A chama vai da brasa (campo vazio) até perto do cheio com oito letras; o
  // cheio é só do acerto. No calmo o tamanho fica parado e só a opacidade muda.
  const nivel = (n) => 0.85 * (piso + (1 - piso) * (Math.min(n, 8) / 8));
  // Resposta de teclado: curta, para a chama acompanhar o dedo.
  function acender(n, duracao = 0.3) {
    const k = nivel(n);
    gsap.to(chama, { scale: calmo ? 0.72 : 0.24 + 0.66 * k, opacity: 0.45 + 0.55 * k, duration: duracao, ease: 'power2.out', overwrite: 'auto' });
    // Até a brasa aquece um pouco o pé do papel.
    gsap.to(papelAceso, { opacity: 0.07 + 0.4 * k, duration: duracao * 2, ease: 'power1.out', overwrite: 'auto' });
    gsap.to(halo, { opacity: 0.2 + 0.55 * k, scale: calmo ? 1 : 0.8 + 0.3 * k, duration: duracao * 2, ease: 'power1.out', overwrite: 'auto' });
  }
  // O erro: a chama encolhe até a brasa e treme de leve, como num sopro.
  function apagar() {
    gsap.to(chama, { scale: calmo ? 0.72 : 0.14, opacity: 0.3, duration: 0.34, ease: 'power2.out', overwrite: 'auto' });
    gsap.to(papelAceso, { opacity: 0, duration: 0.34, ease: 'power1.out', overwrite: 'auto' });
    gsap.to(halo, { opacity: 0.1, duration: 0.34, ease: 'power1.out', overwrite: 'auto' });
    if (!calmo) gsap.to(chama, { keyframes: { rotation: [0, -9, 7, -4, 2, 0] }, duration: 0.6, ease: 'sine.inOut' });
  }
  // Um palpite esperado: a lanterna balança no cordão, como quem acena.
  const balancar = () => {
    if (!calmo) gsap.to(desenho, { keyframes: { rotation: [0, -5, 3.5, -1.5, 0] }, duration: 1.1, ease: 'sine.inOut', overwrite: 'auto' });
  };

  /* ---- o ritual -------------------------------------------------------------- */

  let resolver;
  const aceita = new Promise((r) => { resolver = r; });
  // A única guarda contra corrida entre erro, Enter, digitação e virada.
  let conferindo = false;
  let erros = 0;
  let tamanho = 0;
  let relogio = 0;

  const focar = () => campo.focus({ preventScroll: true });
  // No celular o teclado só sobe com o toque dela: tocar na noite foca o campo.
  const aoTocar = (e) => {
    if (e.target !== campo && !ir.contains(e.target)) focar();
  };

  function acertou() {
    campo.disabled = true;
    ir.disabled = true;
    resolver();
  }

  async function errar(motivo, resposta) {
    conferindo = true;
    const comum = !motivo && !resposta;
    if (comum) erros += 1;
    if (resposta) {
      balancar();
    } else {
      forma.dataset.erro = '1';
      campo.dataset.erro = '1';
      apagar();
    }
    await espera(resposta ? 260 : 440);
    delete forma.dataset.erro;
    delete campo.dataset.erro;
    // O dia chegou durante o tremor: a senha que ela digitou já vale.
    if (motivo === 'cedo' && !cedo()) {
      acertou();
      return;
    }
    campo.value = '';
    tamanho = 0;
    forma.removeAttribute('data-tem');
    ir.tabIndex = -1;
    acender(0, 0.6);
    aviso.textContent = resposta
      || (motivo === 'cedo' ? texto(dados.cedo) || 'Ainda não. Volta no dia certo.' : texto(dados.erro) || 'Senha errada.');
    gsap.fromTo(aviso, { opacity: 0, y: calmo ? 0 : 6 }, { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out', clearProps: 'transform' });
    // A cada erro a próxima dica; do último em diante fica a última.
    const nova = comum && dicas.length ? dicas[Math.min(erros, dicas.length) - 1] : '';
    if (nova && nova !== dica.textContent) {
      dica.textContent = nova;
      // Um papelzinho aceso que pousa, um pouco torto.
      if (calmo) {
        gsap.fromTo(dica, { opacity: 0, rotation: -1 }, { opacity: 1, duration: 0.4, delay: 0.15, ease: 'none' });
      } else {
        gsap.fromTo(dica,
          { opacity: 0, y: -8, rotation: -3.5 },
          { opacity: 1, y: 0, rotation: -1, duration: 0.8, delay: 0.16, ease: curvas.branco.entrar });
      }
    }
    conferindo = false;
  }

  function confirmar() {
    const v = campo.value;
    if (!v.trim() || conferindo) return;
    if (igual(v)) acertou();
    else if (antesDaHora(v)) errar('cedo', '');
    else errar('', palpite(v));
  }

  // A virada: a lanterna acorda meio acesa, a luz pulsa duas vezes e o campo é conferido de novo.
  function chegou() {
    if (document.hidden) {
      document.addEventListener('visibilitychange', chegou, { once: true });
      return;
    }
    aviso.textContent = '';
    forma.dataset.chegou = '1';
    piso = 0.45;
    acender(tamanho, 0.9);
    if (!calmo) brilho.animate?.(BATIDAS, { duration: 1100 });
    if (!conferindo && igual(campo.value)) acertou();
  }

  // Arredonda para cima: o 00 só aparece junto com a virada.
  const contar = () => {
    const falta = conta.alvo - agora();
    const seg = Math.max(0, Math.ceil(falta / 1000));
    const partes = [Math.floor(seg / 86400), Math.floor(seg / 3600) % 24, Math.floor(seg / 60) % 60, seg % 60];
    partes.forEach((v, i) => {
      conta.casas[i].n.textContent = i ? String(v).padStart(2, '0') : String(v);
    });
    const dito = partes.map((v, i) => `${v} ${conta.rotulos[i]}`).join(', ');
    conta.no.setAttribute('aria-label', conta.frase ? `${conta.frase} ${dito}` : dito);
    if (seg > 0) {
      if (falta <= 10000 && !calmo) conta.casas[3].no.animate?.(PULSO, { duration: 420, easing: RESPOSTA });
      return;
    }
    clearInterval(relogio);
    gsap.to(conta.no, { autoAlpha: 0, duration: 0.8 });
    chegou();
  };

  campo.addEventListener('input', () => {
    const v = campo.value;
    // Uma tecla, uma nota; apagar não toca.
    if (v.length > tamanho) som?.efeito?.('caixinha', { nota: PARABENS[(v.length - 1) % PARABENS.length] });
    tamanho = v.length;
    forma.toggleAttribute('data-tem', v.length > 0);
    ir.tabIndex = v ? 0 : -1;
    if (conferindo) return;
    acender(v.length);
    if (igual(v)) acertou();
  });
  campo.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    confirmar();
  });
  ir.addEventListener('click', () => {
    confirmar();
    focar();
  });
  raiz.addEventListener('click', aoTocar);

  // A lanterna nasce apagada, com uma brasa, e desce devagar no cordão.
  gsap.set(chama, { svgOrigin: ORIGEM_CHAMA, scale: calmo ? 0.72 : 0.24, opacity: 0.45 });
  gsap.set(papelAceso, { opacity: 0.07 });
  gsap.set(halo, { opacity: 0.2, scale: calmo ? 1 : 0.8 });
  gsap.set(desenho, { transformOrigin: '50% 0%' });
  gsap.fromTo(forma, { opacity: 0 }, { opacity: 1, duration: 1.2, delay: 0.25, ease: 'power1.out' });
  if (!calmo) gsap.fromTo(desenho, { y: -12 }, { y: 0, duration: 1.8, delay: 0.3, ease: curvas.branco.entrar });
  // No computador o campo nasce com o foco; no celular, o teclado espera o toque dela.
  if (!amb?.toque) focar();
  if (conta) {
    contar();
    relogio = setInterval(contar, 1000);
  }

  try {
    await aceita;
    diretor.etapa('senha-certa');
    // O toque no campo é o primeiro gesto dela.
    som?.destravar?.();
    raiz.removeEventListener('click', aoTocar);
    clearInterval(relogio);
    campo.blur();
    forma.dataset.certa = '1';
    aviso.textContent = '';
    gsap.to(dica, { opacity: 0, duration: 0.2, overwrite: true });

    const tl = gsap.timeline();
    if (calmo) {
      tl.to([chama, papelAceso, halo], { opacity: 1, duration: 0.6, ease: 'none', overwrite: 'auto' }, 0)
        .fromTo([fio, ponto], { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'none' }, 0.1)
        .to(forma, { opacity: 0, duration: 0.8, ease: 'power1.inOut' }, '+=0.5');
    } else {
      const florescer = curvas.yourname.florescer;
      tl.to(chama, { scale: 1.15, opacity: 1, rotation: 0, duration: 0.9, ease: florescer, overwrite: 'auto' }, 0)
        .to(papelAceso, { opacity: 1, duration: 0.8, ease: florescer, overwrite: 'auto' }, 0.05)
        .to(halo, { opacity: 1, scale: 1.5, duration: 0.9, ease: florescer, overwrite: 'auto' }, 0)
        // A janela do fio e o desenho andam em sentidos opostos: o fio é costurado da esquerda para a direita.
        .fromTo(fio, { xPercent: -100, opacity: 1 }, { xPercent: 0, duration: 0.8, ease: 'power2.inOut' }, 0.15)
        .fromTo(linha, { xPercent: 100 }, { xPercent: 0, duration: 0.8, ease: 'power2.inOut' }, 0.15)
        .fromTo(ponto, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.42, ease: 'back.out(1.8)' }, 0.86)
        .to(ponto, { scale: 1.22, duration: 0.16, ease: 'power2.out' }, 1.36)
        .to(ponto, { scale: 1, duration: 0.3, ease: 'power2.inOut' }, 1.52)
        // A luz da lanterna se abre sobre a tela e se desfaz na noite.
        .to(halo, { scale: 9, duration: 1.7, ease: 'sine.inOut' }, 1.3)
        .to(forma, { opacity: 0, y: -10, duration: 1, ease: 'power1.inOut' }, 1.95);
    }
    tl.call(() => som?.efeito?.('caixinha', { nota: FECHO[0] }), null, 0.5)
      .call(() => som?.efeito?.('caixinha', { nota: FECHO[1] }), null, 0.86);
    await comoPromise(tl);
  } finally {
    clearInterval(relogio);
    raiz.removeEventListener('click', aoTocar);
  }
  forma.remove();
}

/** Abre a noite sobre o mundo, tira #entrada e marca html.sem-entrada. Nunca rejeita. */
export async function sairDaEntrada(ctx) {
  const entrada = document.getElementById('entrada');
  if (!entrada) return;
  try {
    const gsap = ctx.gsap || window.gsap;
    const calmo = !!ctx.amb?.reduzido;
    const petalas = ctx.mundo?.petalas;
    aquecerAbertura(ctx);
    entrada.style.pointerEvents = 'none';
    // A chuva começa com o olho ainda fechado; recomeçá-la depois apagaria as pétalas que ela viu.
    if (!calmo) petalas?.comecar?.();
    petalas?.definirDensidade?.(0.4);
    petalas?.definirFoco?.(0.8);

    const tl = gsap.timeline();
    if (calmo) {
      tl.to(entrada, { autoAlpha: 0, duration: 0.8, ease: 'power1.inOut' }, 0)
        .call(corDoNavegador, [COR_MUNDO], 0.4);
    } else {
      // Duas pálpebras em amêndoa: o desfoque é o próprio degradê, pintado uma vez; só o translateY anda.
      // A luz entre elas é quente, a da lanterna que ela acendeu.
      const luz = el('i', 'entrada-luz');
      const cima = el('i', 'entrada-palpebra');
      const baixo = el('i', 'entrada-palpebra entrada-palpebra-baixo');
      entrada.append(el('div', { class: 'entrada-olhos', 'aria-hidden': 'true' }, [luz, cima, baixo]));
      // As estrelas da entrada se recolhem: o céu agora é o do mundo.
      entrada.dataset.abrindo = '';
      entrada.style.background = 'transparent';
      const ease = window.CustomEase?.create('abrirOlhos', CURVA_OLHOS) ? 'abrirOlhos' : curvas.branco.camera;
      tl.to(cima, { yPercent: -100, duration: 2.2, ease }, 0)
        .to(baixo, { yPercent: 100, duration: 2.1, ease }, 0.1)
        .to(luz, { opacity: 0, duration: 1.8, ease: 'sine.inOut' }, 0.45)
        // A barra do Safari só vira céu com o olho mais de meio aberto.
        .call(corDoNavegador, [COR_MUNDO], 1.35);
    }
    await comoPromise(tl);
  } catch (erro) {
    console.error('[carta] a noite da entrada não abriu', erro);
  }
  corDoNavegador(COR_MUNDO);
  entrada.remove();
  document.documentElement.classList.add('sem-entrada');
}
