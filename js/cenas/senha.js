// A tela preta do começo: a senha e, depois da música, o preto que se desfaz.
// (_dev/ROTEIRO2.md, grupo A)
//
//   cenaSenha(ctx, { frio }) → Promise   resolve quando ela acertou e o campo já saiu
//                                        (o preto de #entrada continua: a música entra nele)
//   sairDaEntrada(ctx) → Promise         o preto se desfaz sobre o mundo e #entrada sai do DOM
//
// Etapas: senha → senha-certa
// DOM (index.html): #entrada > #entrada-senha (esta cena) e #entrada-musica (o seletor).
// Gancho para os testes (não mudar): input[data-acao="senha"]. Digitar os algarismos
// basta: com o campo cheio a senha é conferida sozinha, sem botão. Errou: o campo
// ganha data-erro por um instante, as casas tremem e esvaziam.
//
// O desenho: uma casa por algarismo, cada uma com um traço fino embaixo; a casa da
// vez pulsa devagar, para ela saber onde tocar. O campo de verdade fica por cima,
// invisível (é ele que chama o teclado numérico do iPhone). No acerto, o fio
// vermelho corre por baixo dos números, de ponta a ponta, e tudo se desfaz.
//
// Não é segurança: o código está em content.js (senha.codigo). É um ritual.

import { el, espera } from '../nucleo/util.js';
import { aquecerAbertura } from './abertura.js';

const COR_MUNDO = '#ffffff';

function corDoNavegador(cor) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', cor);
}

export async function cenaSenha(ctx) {
  const { conteudo, diretor, som, amb } = ctx;
  const gsap = window.gsap;
  const dados = conteudo.senha || {};
  const codigo = String(dados.codigo || '').trim();
  const caixa = document.getElementById('entrada-senha');
  diretor.etapa('senha');
  if (!caixa || !codigo) return;
  const calmo = !!amb.reduzido;

  const frase = dados.frase ? el('p', 'senha-frase', dados.frase) : null;
  const casas = Array.from({ length: codigo.length }, () => {
    const digito = el('span', 'senha-digito');
    return { no: el('span', 'senha-casa', [digito, el('i', 'senha-traco')]), digito };
  });
  const fio = el('i', 'senha-fio');
  const visor = el('div', { class: 'senha-casas', 'aria-hidden': 'true' }, [...casas.map((c) => c.no), fio]);
  const campo = el('input', {
    class: 'senha-campo',
    type: 'text',
    inputmode: 'numeric',
    pattern: '[0-9]*',
    maxlength: String(codigo.length),
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'done',
    'aria-label': dados.rotulo || 'Senha',
    dataset: { acao: 'senha' },
  });
  const quadro = el('div', 'senha-quadro', [visor, campo]);
  const dica = el('p', 'senha-dica');
  dica.setAttribute('aria-live', 'polite');
  const forma = el('div', 'senha', [frase, quadro, dica]);
  forma.style.setProperty('--casas', String(codigo.length));
  caixa.append(forma);

  // As casas acompanham o que está no campo.
  let mostrado = '';
  const refletir = () => {
    const valor = campo.value;
    casas.forEach((casa, i) => {
      const tem = i < valor.length;
      const novo = tem && valor[i] !== mostrado[i];
      casa.no.toggleAttribute('data-cheia', tem);
      casa.no.toggleAttribute('data-vez', i === valor.length);
      if (tem) casa.digito.textContent = valor[i];
      if (novo || (tem && i >= mostrado.length)) {
        gsap.killTweensOf(casa.digito);
        gsap.fromTo(casa.digito,
          { opacity: 0, y: calmo ? 0 : '0.28em' },
          { opacity: 1, y: 0, duration: 0.42, ease: 'power3.out' });
      } else if (!tem && casa.digito.textContent) {
        gsap.killTweensOf(casa.digito);
        const no = casa.digito;
        gsap.to(no, { opacity: 0, duration: 0.2, ease: 'none', onComplete: () => { if (!casa.no.hasAttribute('data-cheia')) no.textContent = ''; } });
      }
    });
    mostrado = valor;
  };
  refletir();

  // Entra do preto, devagar. (Só a opacidade: o campo já vale desde o primeiro quadro.)
  gsap.fromTo(forma, { opacity: 0 }, { opacity: 1, duration: 1.4, delay: 0.25, ease: 'power1.out' });

  // No computador o campo já espera o teclado; no celular o teclado só sobe com o toque dela
  // (um toque em qualquer lugar do preto vale: o foco vai para o campo).
  const focar = () => { try { campo.focus({ preventScroll: true }); } catch { /* sem foco programático */ } };
  if (!amb.toque) focar();
  const aoTocar = (e) => { if (e.target !== campo && !campo.disabled) focar(); };
  caixa.addEventListener('click', aoTocar);

  let erros = 0;
  await new Promise((resolver) => {
    let conferindo = false;
    const conferir = async () => {
      const limpo = campo.value.replace(/\D/g, '').slice(0, codigo.length);
      if (limpo !== campo.value) campo.value = limpo;
      if (conferindo) { campo.value = mostrado; return; }
      refletir();
      if (campo.value.length < codigo.length) return;
      if (campo.value === codigo) { campo.disabled = true; resolver(); return; }
      conferindo = true;
      erros += 1;
      await espera(140);                       // o último número ainda aparece antes do tremor
      campo.dataset.erro = '1';
      forma.dataset.erro = '1';
      await espera(520);
      delete campo.dataset.erro;
      delete forma.dataset.erro;
      campo.value = '';
      refletir();
      if (erros >= 3 && dados.dica && !dica.textContent) {
        dica.textContent = dados.dica;
        gsap.fromTo(dica, { opacity: 0 }, { opacity: 1, duration: 1.2, ease: 'none' });
      }
      conferindo = false;
    };
    campo.addEventListener('input', conferir);
  });

  diretor.etapa('senha-certa');
  som.destravar();
  caixa.removeEventListener('click', aoTocar);
  campo.blur();
  forma.dataset.certa = '1';
  // O fio corre por baixo dos números, de ponta a ponta; depois tudo se desfaz no preto.
  await new Promise((ok) => {
    const tl = gsap.timeline({ onComplete: ok });
    if (calmo) tl.fromTo(fio, { opacity: 0, scaleX: 1 }, { opacity: 1, duration: 0.5, ease: 'none' }, 0.1);
    else tl.fromTo(fio, { scaleX: 0, opacity: 1 }, { scaleX: 1, duration: 0.85, ease: 'power3.inOut' }, 0.1);
    tl.to(forma, { opacity: 0, y: calmo ? 0 : -10, duration: 0.9, ease: 'power1.inOut' }, '+=0.4');
  });
  forma.remove();
}

/** O preto se desfaz e o mundo aparece. Sem #entrada (atalho, cena que quebrou), não faz nada. */
export async function sairDaEntrada(ctx) {
  const gsap = window.gsap;
  const entrada = document.getElementById('entrada');
  if (!entrada) return;
  try {
    // Enquanto o preto se desfaz, a primeira carta já é preparada: a caminhada começa sem esperar.
    aquecerAbertura(ctx);
    corDoNavegador(COR_MUNDO);
    entrada.style.pointerEvents = 'none';
    await new Promise((ok) => gsap.to(entrada, { autoAlpha: 0, duration: ctx.amb.reduzido ? 0.8 : 1.8, ease: 'power1.inOut', onComplete: ok }));
  } catch (erro) {
    console.error(erro);
  }
  entrada.remove();
  document.documentElement.classList.add('sem-entrada');
}
