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
// Desenho (_dev/UI.md, "Papelaria da alameda"): um cadeado pequeno com um coração na
// fechadura, o traço em pesponto, a setinha num botão redondo da noite, o aviso e a dica
// como bilhete. No acerto o cadeado abre, o fio vermelho costura por baixo do campo, de
// ponta a ponta, um coração fecha o ponto e tudo se desfaz.
//
// Não é segurança: o código está em content.js (senha.codigo). É um ritual.

import { el, svg, espera } from '../nucleo/util.js';
import { aquecerAbertura } from './abertura.js';

const COR_MUNDO = '#ffffff';

// Desenhos na grade de 24 (traço e pontas vêm de .ui-icone, em css/base.css).
const ICONE_IR = '<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M12.8 6.5 18.5 12l-5.7 5.5"/></svg>';
const ICONE_CADEADO = '<svg class="ui-icone senha-cadeado" viewBox="0 0 24 24" aria-hidden="true">'
  + '<path class="senha-cadeado-arco" d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'
  + '<rect x="5.5" y="10.5" width="13" height="9.5" rx="3"/>'
  + '<path class="senha-cadeado-coracao" d="M12 17.6c-1.9-1.4-2.6-2.4-2.6-3.4a1.35 1.35 0 0 1 2.6-.5 1.35 1.35 0 0 1 2.6.5c0 1-.7 2-2.6 3.4z"/></svg>';

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
  const mestra = String(dados.mestra || '').trim();
  const mesmo = (v, c) => !!c && String(v).trim().toLowerCase() === c.toLowerCase();
  // A senha dela só vale a partir do dia marcado (dados.liberaEm, AAAA-MM-DD, pela data do
  // aparelho; ?hoje=AAAA-MM-DD finge a data nos testes). A senha mestra vale sempre.
  const fingido = new URLSearchParams(location.search).get('hoje');
  const agora = () => (fingido && /^\d{4}-\d{2}-\d{2}$/.test(fingido) ? new Date(`${fingido}T12:00:00`) : new Date());
  const dia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const liberaEm = /^\d{4}-\d{2}-\d{2}$/.test(String(dados.liberaEm || '')) ? dados.liberaEm : '';
  const cedo = () => !!liberaEm && dia(agora()) < liberaEm;
  const igual = (v) => mesmo(v, mestra) || (mesmo(v, codigo) && !cedo());
  const antesDaHora = (v) => mesmo(v, codigo) && cedo();

  const frase = dados.frase ? el('p', 'senha-frase', dados.frase) : null;
  const cadeado = svg(ICONE_CADEADO);
  const fioLinha = el('i', 'senha-fio-linha');
  const fio = el('i', 'senha-fio', fioLinha);
  const ponto = el('i', { class: 'senha-ponto ui-coracao', 'aria-hidden': 'true' });
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
  const ir = el('button', {
    class: 'senha-ir ui-redondo', type: 'button', tabindex: '-1',
    'aria-label': dados.rotuloConfirmar || 'Confirmar', dataset: { acao: 'senha-ir', tom: 'noite' },
  }, svg(ICONE_IR));
  const quadro = el('div', 'senha-quadro', [campo, el('i', 'senha-traco'), fio, ponto, ir]);
  const aviso = el('p', 'senha-erro');
  aviso.setAttribute('role', 'alert');
  const dica = el('p', 'senha-dica ui-nota');
  dica.setAttribute('aria-live', 'polite');
  // Contagem até o dia: dias, horas, minutos e segundos, que somem quando o dia chega.
  const contagem = cedo() && dados.contagem !== false ? (() => {
    const rot = dados.contagemRotulos || {};
    const casa = (nome) => {
      const n = el('span', 'senha-conta-n', '00');
      return { n, no: el('span', 'senha-conta-casa', [n, el('span', 'senha-conta-r', nome)]) };
    };
    const c = { d: casa(rot.dias || 'dias'), h: casa(rot.horas || 'horas'), m: casa(rot.minutos || 'min'), s: casa(rot.segundos || 'seg') };
    const no = el('div', { class: 'senha-conta', role: 'timer', 'aria-live': 'off' }, [
      dados.contagemFrase ? el('p', 'senha-conta-frase', dados.contagemFrase) : null,
      el('div', 'senha-conta-casas', [c.d.no, c.h.no, c.m.no, c.s.no]),
    ]);
    const alvo = new Date(`${liberaEm}T00:00:00`);
    let t = 0;
    const tique = () => {
      const falta = Math.max(0, alvo - agora());
      const seg = Math.floor(falta / 1000);
      c.d.n.textContent = String(Math.floor(seg / 86400));
      c.h.n.textContent = String(Math.floor(seg / 3600) % 24).padStart(2, '0');
      c.m.n.textContent = String(Math.floor(seg / 60) % 60).padStart(2, '0');
      c.s.n.textContent = String(seg % 60).padStart(2, '0');
      no.setAttribute('aria-label', `${c.d.n.textContent} ${rot.dias || 'dias'}, ${c.h.n.textContent} ${rot.horas || 'horas'}`);
      if (!falta) { clearInterval(t); gsap.to(no, { opacity: 0, duration: 0.8, onComplete: () => no.remove() }); }
    };
    tique();
    t = setInterval(tique, 1000);
    return { no, parar: () => clearInterval(t) };
  })() : null;
  const forma = el('div', 'senha ui-escuro', [contagem && contagem.no, frase, cadeado, quadro, aviso, dica]);
  caixa.append(forma);

  // Entra do preto, devagar. (Só a opacidade: o campo já vale desde o primeiro quadro.)
  gsap.fromTo(forma, { opacity: 0 }, { opacity: 1, duration: 1.2, delay: 0.25, ease: 'power1.out' });
  if (!calmo) gsap.fromTo(cadeado, { y: 8, scale: 0.9 }, { y: 0, scale: 1, duration: 0.9, delay: 0.35, ease: 'back.out(1.5)', clearProps: 'transform' });

  // Cada tecla: o cadeado dá um pulinho (ele ouviu). Animação do navegador, só transform.
  const pulinho = () => {
    if (calmo || !cadeado.animate) return;
    cadeado.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.14) rotate(-5deg)' }, { transform: 'scale(1)' }],
      { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  };

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
    const errar = async (motivo) => {
      const aindaNao = motivo === 'cedo';
      conferindo = true;
      if (!aindaNao) erros += 1;
      forma.dataset.erro = '1';
      campo.dataset.erro = '1';
      const novaDica = aindaNao ? '' : (dicas.length && erros ? dicas[Math.min(erros, dicas.length) - 1] : '');
      aviso.textContent = '';
      await espera(440);
      delete forma.dataset.erro;
      delete campo.dataset.erro;
      campo.value = '';
      forma.removeAttribute('data-tem');
      ir.tabIndex = -1;
      aviso.textContent = aindaNao ? (dados.cedo || 'Ainda não. Volta no dia certo.') : (dados.erro || 'Senha errada.');
      // O aviso chega depressa; a dica vem logo atrás, como um bilhete posto na mesa.
      gsap.fromTo(aviso, { opacity: 0, y: calmo ? 0 : 6 }, { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out', clearProps: 'transform' });
      if (novaDica && dica.textContent !== novaDica) {
        dica.textContent = novaDica;
        if (calmo) gsap.fromTo(dica, { opacity: 0 }, { opacity: 1, duration: 0.4, delay: 0.15, ease: 'none' });
        else {
          gsap.fromTo(dica, { opacity: 0, y: 10, scale: 0.95, rotation: -2.5 },
            { opacity: 1, y: 0, scale: 1, rotation: -1, duration: 0.5, delay: 0.16, ease: 'back.out(1.7)' });
        }
      }
      conferindo = false;
    };
    const confirmar = () => {
      if (conferindo || campo.disabled || !campo.value.trim()) return;
      if (igual(campo.value)) acertou(); else errar(antesDaHora(campo.value) ? 'cedo' : '');
    };
    campo.addEventListener('input', () => {
      forma.toggleAttribute('data-tem', !!campo.value);
      ir.tabIndex = campo.value ? 0 : -1;
      pulinho();
      if (!conferindo && igual(campo.value)) acertou();
    });
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } });
    ir.addEventListener('click', () => { confirmar(); focar(); });
  });

  diretor.etapa('senha-certa');
  som.destravar();
  caixa.removeEventListener('click', aoTocar);
  contagem?.parar();
  campo.blur();
  forma.dataset.certa = '1';
  aviso.textContent = '';
  gsap.to(dica, { opacity: 0, duration: 0.2, ease: 'none', overwrite: true });   // o bilhete já serviu
  // O fio corre por baixo do campo, de ponta a ponta; depois tudo se desfaz no preto.
  await new Promise((ok) => {
    const tl = gsap.timeline({ onComplete: ok });
    if (calmo) {
      gsap.set([fio, fioLinha], { xPercent: 0 });
      tl.fromTo([fio, ponto], { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'none' }, 0.1);
    } else {
      // A janela do fio anda para a direita e o fio anda o mesmo tanto para a esquerda:
      // o desenho fica parado e aparece ponto a ponto, sem esticar (só transform).
      gsap.set(fio, { opacity: 1 });
      tl.fromTo(fio, { xPercent: -100 }, { xPercent: 0, duration: 0.8, ease: 'power2.inOut' }, 0.15);
      tl.fromTo(fioLinha, { xPercent: 100 }, { xPercent: 0, duration: 0.8, ease: 'power2.inOut' }, 0.15);
      // O coração fecha o ponto no fim do fio e pulsa uma vez.
      tl.fromTo(ponto, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.42, ease: 'back.out(2.4)' }, 0.86);
      tl.to(ponto, { scale: 1.28, duration: 0.16, ease: 'power2.out' }, '+=0.08');
      tl.to(ponto, { scale: 1, duration: 0.3, ease: 'power2.inOut' });
    }
    tl.to(forma, { opacity: 0, y: calmo ? 0 : -10, duration: 0.8, ease: 'power1.inOut' }, '+=0.3');
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
