/* ============================================================================
   SENHA: a tela preta do começo
   ============================================================================
   Um campo de uma linha, sem casas, para não entregar o tamanho da senha.
   Cada tecla que aumenta o texto toca uma nota do Parabéns numa caixinha de
   música; a senha certa (ou a mestra) é aceita assim que termina de ser
   digitada, sem botão. O erro treme e esvazia o campo, e as dicas vêm em
   sequência; um palpite esperado responde no lugar do aviso, sem tremer e sem
   contar erro; antes de liberaEm a senha certa diz "ainda não", com a contagem
   regressiva até o dia. No acerto o fio vermelho é costurado por baixo do
   campo, o coração pousa na ponta, duas notas fecham a frase e tudo some.

   sairDaEntrada abre as pálpebras sobre a alameda e tira #entrada do DOM.

   Não é segurança: o código está em content.js (senha.codigo). É um ritual.
   ========================================================================== */

import { el, svg, espera } from '../nucleo/util.js';
import { curvas, comoPromise } from '../nucleo/movimento.js';
import { aquecerAbertura } from './abertura.js';

// A cor da barra do navegador quando o mundo aparece.
const COR_MUNDO = '#ffffff';

// O Parabéns (Hill, 1893, domínio público; só a melodia), uma oitava acima, no
// registro de caixinha de música. O caractere N toca a nota N; depois da 19ª recomeça.
const PARABENS = [784, 784, 880, 784, 1174.7, 1046.5, 784, 784, 1568, 1318.5, 1046.5, 987.8, 880, 1396.9, 1396.9, 1318.5, 1046.5, 1174.7, 1046.5];
// As duas notas que fecham a primeira frase da melodia, tocadas no acerto.
const FECHO = [1046.5, 987.8];

const RESPOSTA = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
// O coração do cadeado bate duas vezes quando o dia chega (1100 ms).
const BATIDAS = [
  { transform: 'scale(1)', easing: 'ease-in-out' },
  { transform: 'scale(1.5)', offset: 0.14, easing: RESPOSTA },
  { transform: 'scale(1)', offset: 0.36, easing: 'ease-in-out' },
  { transform: 'scale(1.5)', offset: 0.5, easing: RESPOSTA },
  { transform: 'scale(1)' },
];
const PULINHO = [{ transform: 'scale(1)' }, { transform: 'scale(1.14) rotate(-5deg)' }, { transform: 'scale(1)' }];
const PULSO = [{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }];

// O olho que abre: hesita meio aberto e então se abre de vez.
const CURVA_OLHOS = 'M0,0 C0.15,0 0.25,0.17 0.4,0.2 0.55,0.23 0.62,1 1,1';

const ROTULOS_CONTA = ['dias', 'horas', 'min', 'seg'];
const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

const SETA = '<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M12.8 6.5 18.5 12l-5.7 5.5"/></svg>';
const CADEADO = '<svg class="ui-icone senha-cadeado" viewBox="0 0 24 24" aria-hidden="true">'
  + '<path class="senha-cadeado-arco" d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'
  + '<rect x="5.5" y="10.5" width="13" height="9.5" rx="3"/>'
  + '<path class="senha-cadeado-coracao" d="M12 17.6c-1.9-1.4-2.6-2.4-2.6-3.4a1.35 1.35 0 0 1 2.6-.5 1.35 1.35 0 0 1 2.6.5c0 1-.7 2-2.6 3.4z"/>'
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
  const chave = (v) => texto(v).normalize('NFD').replace(/[\u0300-\u036f\s]/g, '').toLowerCase();
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
  const cadeado = svg(CADEADO);
  const coracao = cadeado.querySelector('.senha-cadeado-coracao');
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
    cadeado,
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

  /* ---- o ritual -------------------------------------------------------------- */

  let resolver;
  const aceita = new Promise((r) => { resolver = r; });
  // A única guarda contra corrida entre erro, Enter, digitação e virada.
  let conferindo = false;
  let erros = 0;
  let tamanho = 0;
  let relogio = 0;

  const focar = () => campo.focus({ preventScroll: true });
  const pulinho = () => {
    if (!calmo) cadeado.animate?.(PULINHO, { duration: 240, easing: RESPOSTA });
  };
  // No celular o teclado só sobe com o toque dela: tocar no preto foca o campo.
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
      pulinho();
    } else {
      forma.dataset.erro = '1';
      campo.dataset.erro = '1';
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
    aviso.textContent = resposta
      || (motivo === 'cedo' ? texto(dados.cedo) || 'Ainda não. Volta no dia certo.' : texto(dados.erro) || 'Senha errada.');
    gsap.fromTo(aviso, { opacity: 0, y: calmo ? 0 : 6 }, { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out', clearProps: 'transform' });
    // A cada erro a próxima dica; do último em diante fica a última.
    const nova = comum && dicas.length ? dicas[Math.min(erros, dicas.length) - 1] : '';
    if (nova && nova !== dica.textContent) {
      dica.textContent = nova;
      // Um bilhete da noite, posto um pouco torto.
      if (calmo) {
        gsap.fromTo(dica, { opacity: 0, rotation: -1 }, { opacity: 1, duration: 0.4, delay: 0.15, ease: 'none' });
      } else {
        gsap.fromTo(dica,
          { opacity: 0, y: 10, scale: 0.95, rotation: -2.5 },
          { opacity: 1, y: 0, scale: 1, rotation: -1, duration: 0.5, delay: 0.16, ease: 'back.out(1.7)' });
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

  // A virada: o coração do cadeado acende e bate, e o campo é conferido de novo.
  function chegou() {
    if (document.hidden) {
      document.addEventListener('visibilitychange', chegou, { once: true });
      return;
    }
    aviso.textContent = '';
    forma.dataset.chegou = '1';
    if (!calmo) coracao?.animate?.(BATIDAS, { duration: 1100 });
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
    pulinho();
    if (!conferindo && igual(v)) acertou();
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

  gsap.fromTo(forma, { opacity: 0 }, { opacity: 1, duration: 1.2, delay: 0.25, ease: 'power1.out' });
  if (!calmo) {
    gsap.fromTo(cadeado, { y: 8, scale: 0.9 }, { y: 0, scale: 1, duration: 0.9, delay: 0.35, ease: 'back.out(1.5)', clearProps: 'transform' });
  }
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
      tl.fromTo([fio, ponto], { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'none' }, 0.1)
        .to(forma, { opacity: 0, duration: 0.8, ease: 'power1.inOut' }, '+=0.3');
    } else {
      // A janela do fio e o desenho andam em sentidos opostos: o fio é costurado da esquerda para a direita.
      tl.fromTo(fio, { xPercent: -100, opacity: 1 }, { xPercent: 0, duration: 0.8, ease: 'power2.inOut' }, 0.15)
        .fromTo(linha, { xPercent: 100 }, { xPercent: 0, duration: 0.8, ease: 'power2.inOut' }, 0.15)
        .fromTo(ponto, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.42, ease: 'back.out(2.4)' }, 0.86)
        .to(ponto, { scale: 1.28, duration: 0.16, ease: 'power2.out' }, '+=0.08')
        .to(ponto, { scale: 1, duration: 0.3, ease: 'power2.inOut' })
        .to(forma, { opacity: 0, y: -10, duration: 0.8, ease: 'power1.inOut' }, '+=0.3');
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

/** Abre o preto sobre o mundo, tira #entrada e marca html.sem-entrada. Nunca rejeita. */
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
      const luz = el('i', 'entrada-luz');
      const cima = el('i', 'entrada-palpebra');
      const baixo = el('i', 'entrada-palpebra entrada-palpebra-baixo');
      entrada.append(el('div', { class: 'entrada-olhos', 'aria-hidden': 'true' }, [luz, cima, baixo]));
      entrada.style.background = 'transparent';
      const ease = window.CustomEase?.create('abrirOlhos', CURVA_OLHOS) ? 'abrirOlhos' : curvas.branco.camera;
      tl.to(cima, { yPercent: -100, duration: 2.2, ease }, 0)
        .to(baixo, { yPercent: 100, duration: 2.1, ease }, 0.1)
        .to(luz, { opacity: 0, duration: 1.6, ease: 'sine.inOut' }, 0.45)
        // A barra do Safari só fica branca com o olho mais de meio aberto.
        .call(corDoNavegador, [COR_MUNDO], 1.35);
    }
    await comoPromise(tl);
  } catch (erro) {
    console.error('[carta] a tela preta não abriu', erro);
  }
  corDoNavegador(COR_MUNDO);
  entrada.remove();
  document.documentElement.classList.add('sem-entrada');
}
