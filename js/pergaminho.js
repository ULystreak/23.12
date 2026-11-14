// Pergaminho: a folha DOM (contrato 4.5).
//
// No celular cobre a tela; no computador é uma coluna central (até ~720 px) com
// o mundo branco e as pétalas visíveis dos lados.
//
//   perg.retanguloAlvo() → DOMRect      onde o papel 3D deve pousar
//   perg.receberPapel() → Promise       a folha aparece exatamente ali (troca invisível)
//   perg.folha                          elemento em branco (o seletor de música é montado aqui)
//   perg.desenrolar(capitulo) → Promise desenrola de cima para baixo e libera a rolagem
//   perg.enrolar() → Promise            enrola de volta até virar a folha em branco
//   perg.soltar() → Promise             a folha vai embora e o mundo volta
//   perg.rolagem → { el, progresso, y, aoRolar(fn(progresso, y)), irPara(y, { imediato }) }
//
// Além do contrato:
//   perg.esperarFechar() → Promise      resolve quando o capítulo chama api.fechar()
//   perg.estado                         'oculto' | 'folha' | 'aberto'
//
// Capítulo: { id, montar(raiz, api) → { destruir() } }, com
//   api = { conteudo, amb, som, rolagem, fundo, gsap, ScrollTrigger, fechar(), recursos }
// O fio de progresso na borda é do pergaminho, não do capítulo.
//
// ScrollTrigger: o rolador é `api.rolagem.el` (já vem como padrão em ScrollTrigger.defaults).
//
// Versão do esqueleto: desenrolar/enrolar com clip-path simples e um "rolo" que
// acompanha a borda. As assinaturas acima não mudam.

import { clamp, debounce, el } from './nucleo/util.js';
import { curvas } from './nucleo/movimento.js';

export function criarPergaminho({ raiz, mundo, amb, som, conteudo, recursos }) {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger || null;

  // ---- estrutura ------------------------------------------------------------------
  const folha = el('div', 'perg-folha');
  const fundo = el('div', { class: 'perg-fundo', 'aria-hidden': 'true' });
  const conteudoEl = el('div', 'perg-conteudo');
  const rolagemEl = el('div', { class: 'perg-rolagem', tabindex: '-1' }, conteudoEl);
  const fioTraco = el('i');
  const fio = el('div', { class: 'perg-fio', 'aria-hidden': 'true' }, fioTraco);
  const camada = el('div', { class: 'perg-camada', hidden: true }, [fundo, rolagemEl, fio]);
  const rolo = el('div', { class: 'perg-rolo', 'aria-hidden': 'true', hidden: true });
  const moldura = el('div', 'perg-moldura', [folha, camada, rolo]);
  raiz.append(moldura);

  if (ScrollTrigger) ScrollTrigger.defaults({ scroller: rolagemEl });

  let estado = 'oculto';
  let instancia = null;          // o que capitulo.montar devolveu
  let lenis = null;
  let tiqueLenis = null;
  let liberarFechar = null;
  let promessaFechar = Promise.resolve();

  const tween = (alvo, vars) => new Promise((resolver) => { gsap.to(alvo, { ...vars, onComplete: resolver }); });
  const cobreTela = () => moldura.getBoundingClientRect().width >= innerWidth - 1;

  // ---- rolagem ----------------------------------------------------------------------
  const ouvintesRolagem = new Set();
  let avisoPendente = false;

  const rolagem = {
    el: rolagemEl,
    get y() { return rolagemEl.scrollTop; },
    get progresso() {
      const max = rolagemEl.scrollHeight - rolagemEl.clientHeight;
      return max > 0 ? clamp(rolagemEl.scrollTop / max) : 0;
    },
    aoRolar(fn) {
      ouvintesRolagem.add(fn);
      return () => ouvintesRolagem.delete(fn);
    },
    irPara(y, { imediato = false } = {}) {
      if (lenis) lenis.scrollTo(y, { immediate: imediato || amb.reduzido });
      else rolagemEl.scrollTo({ top: y, behavior: imediato || amb.reduzido ? 'auto' : 'smooth' });
    },
  };

  function avisarRolagem() {
    avisoPendente = false;
    const p = rolagem.progresso;
    fioTraco.style.transform = `scaleY(${p.toFixed(4)})`;
    for (const fn of ouvintesRolagem) {
      try { fn(p, rolagemEl.scrollTop); } catch (erro) { console.error(erro); }
    }
  }
  rolagemEl.addEventListener('scroll', () => {
    if (avisoPendente) return;
    avisoPendente = true;
    requestAnimationFrame(avisarRolagem);
  }, { passive: true });

  function ligarRolagemSuave() {
    // Lenis só no computador; no toque a rolagem nativa é melhor (e é a do iPhone).
    if (amb.toque || amb.reduzido || !window.Lenis || lenis) return;
    try {
      lenis = new window.Lenis({ wrapper: rolagemEl, content: conteudoEl, autoRaf: false, lerp: 0.11 });
      tiqueLenis = (t) => lenis.raf(t * 1000);
      gsap.ticker.add(tiqueLenis);
      if (ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
    } catch {
      lenis = null;
    }
  }
  function desligarRolagemSuave() {
    if (!lenis) return;
    gsap.ticker.remove(tiqueLenis);
    lenis.destroy();
    lenis = null;
  }
  function travarRolagem(travar) {
    rolagemEl.style.overflowY = travar ? 'hidden' : '';
    if (lenis) travar ? lenis.stop() : lenis.start();
  }

  // Girar o aparelho ou mudar o tamanho da janela muda se a folha cobre a tela
  // inteira: o mundo atrás dela liga ou desliga junto (senão ficaria congelado nos lados).
  let saindo = false;
  window.addEventListener('resize', debounce(() => {
    if (estado === 'oculto' || saindo) return;
    if (cobreTela()) mundo.desligar();
    else mundo.ligar();
    if (lenis) lenis.resize();
  }, 180), { passive: true });

  // ---- API ----------------------------------------------------------------------------
  const perg = {
    el: raiz,
    folha,
    rolagem,
    get estado() { return estado; },

    retanguloAlvo() {
      // Mede a moldura mesmo com o pergaminho escondido.
      const estavaOculto = raiz.hidden;
      if (estavaOculto) {
        raiz.style.visibility = 'hidden';
        raiz.hidden = false;
      }
      gsap.set(moldura, { clearProps: 'transform' });
      const rect = moldura.getBoundingClientRect();
      if (estavaOculto) {
        raiz.hidden = true;
        raiz.style.visibility = '';
      }
      return rect;
    },

    async receberPapel() {
      if (estado !== 'oculto') return;
      folha.textContent = '';
      gsap.set(folha, { clearProps: 'opacity,visibility' });
      gsap.set(moldura, { clearProps: 'transform' });
      gsap.set(moldura, { autoAlpha: 0 });
      raiz.hidden = false;
      await tween(moldura, { autoAlpha: 1, duration: 0.35, ease: 'none' });
      estado = 'folha';
      if (cobreTela()) mundo.desligar();
    },

    async desenrolar(capitulo) {
      if (estado === 'aberto') await perg.enrolar();
      if (estado === 'oculto') await perg.receberPapel();

      promessaFechar = new Promise((resolver) => { liberarFechar = resolver; });
      const api = {
        conteudo, amb, som, rolagem, fundo, gsap, ScrollTrigger, recursos,
        fechar() {
          if (liberarFechar) { liberarFechar(); liberarFechar = null; }
        },
      };

      // Monta o capítulo escondido atrás do recorte.
      conteudoEl.textContent = '';
      rolagemEl.scrollTop = 0;
      camada.hidden = false;
      gsap.set(camada, { clipPath: 'inset(0% 0% 100% 0%)', autoAlpha: 1 });
      raiz.dataset.capitulo = capitulo.id || '';
      try {
        instancia = (await capitulo.montar(conteudoEl, api)) || null;
      } catch (erro) {
        // Capítulo que quebra não prende ninguém: fica vazio e já pode ser fechado.
        console.error(`[carta] o capítulo "${capitulo.id}" falhou ao montar`, erro);
        instancia = null;
        api.fechar();
      }
      ligarRolagemSuave();
      travarRolagem(true);
      avisarRolagem();

      som.efeito('desenrolar');
      gsap.to(folha, { autoAlpha: 0, duration: 0.4, ease: 'none' });
      if (amb.reduzido) {
        gsap.set(camada, { clipPath: 'none', autoAlpha: 0 });
        await tween(camada, { autoAlpha: 1, duration: 0.8, ease: 'none' });
      } else {
        const altura = moldura.clientHeight;
        rolo.hidden = false;
        gsap.fromTo(rolo, { y: 0, autoAlpha: 1 }, { y: altura, duration: 1.7, ease: curvas.branco.camera });
        await tween(camada, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.7, ease: curvas.branco.camera });
        rolo.hidden = true;
      }
      gsap.set(camada, { clearProps: 'clipPath' });

      estado = 'aberto';
      travarRolagem(false);
      if (lenis) lenis.resize();
      if (ScrollTrigger) ScrollTrigger.refresh();
      if (cobreTela()) mundo.desligar();
    },

    esperarFechar() {
      return promessaFechar;
    },

    async enrolar() {
      if (estado !== 'aberto') return;
      travarRolagem(true);
      som.efeito('desenrolar');
      gsap.set(folha, { autoAlpha: 1 });
      folha.textContent = '';

      if (amb.reduzido) {
        await tween(camada, { autoAlpha: 0, duration: 0.7, ease: 'none' });
      } else {
        const altura = moldura.clientHeight;
        rolo.hidden = false;
        gsap.fromTo(rolo, { y: altura, autoAlpha: 1 }, { y: 0, duration: 1.4, ease: curvas.branco.camera });
        gsap.set(camada, { clipPath: 'inset(0% 0% 0% 0%)' });
        await tween(camada, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.4, ease: curvas.branco.camera });
        rolo.hidden = true;
      }

      // Desmonta o capítulo e deixa a folha em branco.
      try { if (instancia && instancia.destruir) instancia.destruir(); } catch (erro) { console.error(erro); }
      instancia = null;
      if (ScrollTrigger) {
        for (const st of ScrollTrigger.getAll()) if (st.scroller === rolagemEl) st.kill();
      }
      desligarRolagemSuave();
      conteudoEl.textContent = '';
      conteudoEl.removeAttribute('class');
      conteudoEl.className = 'perg-conteudo';
      fundo.textContent = '';
      fundo.removeAttribute('style');
      fundo.className = 'perg-fundo';
      camada.hidden = true;
      gsap.set(camada, { clearProps: 'clipPath,opacity,visibility' });
      rolagemEl.scrollTop = 0;
      fioTraco.style.transform = 'scaleY(0)';
      travarRolagem(false);
      delete raiz.dataset.capitulo;
      estado = 'folha';
    },

    async soltar() {
      if (estado === 'aberto') await perg.enrolar();
      if (estado === 'oculto') return;
      saindo = true;
      mundo.ligar();
      await tween(moldura, amb.reduzido
        ? { autoAlpha: 0, duration: 0.7, ease: 'none' }
        : { autoAlpha: 0, yPercent: 14, duration: 1.2, ease: curvas.branco.sair });
      raiz.hidden = true;
      folha.textContent = '';
      gsap.set(moldura, { clearProps: 'transform,opacity,visibility' });
      gsap.set(folha, { clearProps: 'opacity,visibility' });
      estado = 'oculto';
      saindo = false;
    },
  };

  return perg;
}
