// A tela preta do começo: a senha e, depois da música, o preto que se desfaz.
// (_dev/ROTEIRO2.md, grupo A)
//
//   cenaSenha(ctx, { frio }) → Promise   resolve quando ela acertou e o campo já saiu
//                                        (o preto de #entrada continua: a música entra nele)
//   sairDaEntrada(ctx) → Promise         o preto se desfaz sobre o mundo e #entrada sai do DOM
//
// Etapas: senha → senha-certa
// DOM (index.html): #entrada > #entrada-senha (esta cena) e #entrada-musica (o seletor).
// Gancho para os testes (não mudar): input[data-acao="senha"]. O campo aceita qualquer
// coisa (números, letras, sinais) e não mostra quantos caracteres a senha tem. Ela
// confirma com Enter/"ir" do teclado ou com a setinha; a senha certa também é aceita
// assim que termina de ser digitada. Errou: o campo treme e esvazia, aparece o aviso
// de erro e, a cada erro, a dica seguinte de content.js (senha.dicas).
//
// No acerto, o fio vermelho corre por baixo do campo, de ponta a ponta, e tudo se desfaz.
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

  const dicas = (Array.isArray(dados.dicas) ? dados.dicas : [dados.dica]).map((d) => String(d || '').trim()).filter(Boolean);
  const igual = (v) => String(v).trim().toLowerCase() === codigo.toLowerCase();

  const frase = dados.frase ? el('p', 'senha-frase', dados.frase) : null;
  const fio = el('i', 'senha-fio');
  const campo = el('input', {
    class: 'senha-campo',
    type: 'text',
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
    'aria-label': dados.rotulo || 'Senha',
    dataset: { acao: 'senha' },
  });
  const ir = el('button', { class: 'senha-ir', type: 'button', 'aria-label': dados.rotuloConfirmar || 'Confirmar', dataset: { acao: 'senha-ir' } }, '→');
  const quadro = el('div', 'senha-quadro', [campo, el('i', 'senha-traco'), fio, ir]);
  const aviso = el('p', 'senha-erro');
  aviso.setAttribute('role', 'alert');
  const dica = el('p', 'senha-dica');
  dica.setAttribute('aria-live', 'polite');
  const forma = el('div', 'senha', [frase, quadro, aviso, dica]);
  caixa.append(forma);

  // Entra do preto, devagar. (Só a opacidade: o campo já vale desde o primeiro quadro.)
  gsap.fromTo(forma, { opacity: 0 }, { opacity: 1, duration: 1.4, delay: 0.25, ease: 'power1.out' });

  // No computador o campo já espera o teclado; no celular o teclado só sobe com o toque dela
  // (um toque em qualquer lugar do preto vale: o foco vai para o campo).
  const focar = () => { try { campo.focus({ preventScroll: true }); } catch { /* sem foco programático */ } };
  if (!amb.toque) focar();
  const aoTocar = (e) => { if (e.target !== campo && e.target !== ir && !campo.disabled) focar(); };
  caixa.addEventListener('click', aoTocar);

  let erros = 0;
  await new Promise((resolver) => {
    let conferindo = false;
    const acertou = () => { campo.disabled = true; ir.disabled = true; resolver(); };
    const errar = async () => {
      conferindo = true;
      erros += 1;
      forma.dataset.erro = '1';
      campo.dataset.erro = '1';
      const novaDica = dicas.length ? dicas[Math.min(erros, dicas.length) - 1] : '';
      aviso.textContent = '';
      await espera(520);
      delete forma.dataset.erro;
      delete campo.dataset.erro;
      campo.value = '';
      forma.removeAttribute('data-tem');
      aviso.textContent = dados.erro || 'Senha errada.';
      gsap.fromTo(aviso, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'none' });
      if (novaDica && dica.textContent !== novaDica) {
        dica.textContent = novaDica;
        gsap.fromTo(dica, { opacity: 0 }, { opacity: 1, duration: 1.2, delay: 0.3, ease: 'none' });
      }
      conferindo = false;
    };
    const confirmar = () => {
      if (conferindo || campo.disabled || !campo.value.trim()) return;
      if (igual(campo.value)) acertou(); else errar();
    };
    campo.addEventListener('input', () => {
      forma.toggleAttribute('data-tem', !!campo.value);
      if (!conferindo && igual(campo.value)) acertou();
    });
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } });
    ir.addEventListener('click', () => { confirmar(); focar(); });
  });

  diretor.etapa('senha-certa');
  som.destravar();
  caixa.removeEventListener('click', aoTocar);
  campo.blur();
  forma.dataset.certa = '1';
  aviso.textContent = '';
  // O fio corre por baixo do campo, de ponta a ponta; depois tudo se desfaz no preto.
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
