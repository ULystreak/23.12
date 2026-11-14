// Música: o seletor na folha e o mini seletor fixo no canto (contrato 4.6).
//
//   musica.escolher(perg.folha) → Promise   resolve quando ela escolheu e tocou em continuar
//                                            (sem faixas válidas, resolve na hora)
//   musica.mostrarMini() / musica.esconderMini()
//
// Ganchos para os testes (não mudar): [data-acao="faixa"], [data-acao="continuar"],
// [data-acao="mini"].
//
// Versão do esqueleto: lista simples e mini seletor básico. As assinaturas não mudam.

import { el, svg } from './nucleo/util.js';
import { curvas, revelarPalavras } from './nucleo/movimento.js';

const ICONE_NOTA = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 18.5V6.2l9-2v10.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="6.6" cy="18.4" rx="2.6" ry="2" fill="currentColor"/><ellipse cx="15.6" cy="14.9" rx="2.6" ry="2" fill="currentColor"/></svg>';
const ICONE_PAUSA = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 5.5v13M16 5.5v13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const ICONE_TOCAR = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8.5 5.2v13.6L19 12z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';

export function criarMusica({ conteudo, som, amb, recursos, mini }) {
  const gsap = window.gsap;
  const dados = conteudo?.musica || {};
  const rotulos = dados.rotulos || {};

  // Faixa válida = tem arquivo. As outras nem aparecem.
  const faixas = (Array.isArray(dados.faixas) ? dados.faixas : [])
    .map((faixa, indice) => ({ ...faixa, indice }))
    .filter((f) => typeof f.arquivo === 'string' && f.arquivo.trim());

  function capaDe(faixa, classe) {
    const moldura = el('span', { class: classe, 'aria-hidden': 'true' });
    recursos.elementoImagem(faixa.capa, '').then((img) => {
      if (img) moldura.append(img);
      else moldura.classList.add('sem-capa');      // capa que falta: só o papel, sem buraco
    });
    return moldura;
  }

  // ---- seletor na folha ---------------------------------------------------------------
  function escolher(folha) {
    if (!faixas.length || !folha) return Promise.resolve();

    return new Promise((resolver) => {
      const titulo = el('h2', 'musica-titulo');
      const lista = el('ul', { class: 'musica-lista', dataset: { quantas: String(faixas.length) } });
      const continuar = el('button', {
        class: 'botao musica-continuar', type: 'button', dataset: { acao: 'continuar' }, texto: dados.continuar || '',
      });
      const painel = el('div', 'musica', [titulo, lista, continuar]);
      gsap.set(continuar, { autoAlpha: 0 });
      continuar.disabled = true;

      const botoes = faixas.map((faixa) => {
        const botao = el('button', {
          class: 'musica-faixa', type: 'button', 'aria-pressed': 'false',
          dataset: { acao: 'faixa', indice: String(faixa.indice) },
        }, [
          capaDe(faixa, 'musica-capa'),
          el('span', 'musica-nome', faixa.titulo || ''),
          el('span', 'musica-artista', faixa.artista || ''),
        ]);
        botao.addEventListener('click', () => {
          som.destravar();
          som.efeito('toque');
          som.tocar(faixa.indice);
          for (const b of botoes) b.setAttribute('aria-pressed', String(b === botao));
          if (continuar.disabled) {
            continuar.disabled = false;
            gsap.fromTo(continuar, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: curvas.branco.entrar });
          }
        });
        lista.append(el('li', null, botao));
        return botao;
      });

      continuar.addEventListener('click', async () => {
        continuar.disabled = true;
        som.efeito('toque');
        await new Promise((ok) => gsap.to(painel, { autoAlpha: 0, duration: 0.6, ease: 'none', onComplete: ok }));
        painel.remove();
        resolver();
      }, { once: true });

      folha.textContent = '';
      folha.append(painel);
      revelarPalavras(titulo, dados.titulo || '', { intervalo: 0.12, duracao: 1.2 });
      gsap.fromTo(lista.children,
        { autoAlpha: 0, y: amb.reduzido ? 0 : 18 },
        { autoAlpha: 1, y: 0, duration: 1.1, stagger: 0.12, delay: 0.5, ease: curvas.branco.entrar });
    });
  }

  // ---- mini seletor ---------------------------------------------------------------------
  let miniMontado = false;
  let alternar = null;
  let painelMini = null;
  let botaoMini = null;

  function montarMini() {
    if (miniMontado || !mini) return;
    miniMontado = true;

    botaoMini = el('button', {
      class: 'mini-botao', type: 'button', 'aria-label': rotulos.abrir || '', 'aria-expanded': 'false',
      dataset: { acao: 'mini' },
    }, svg(ICONE_NOTA));

    alternar = el('button', { class: 'mini-alternar', type: 'button', dataset: { acao: 'mini-alternar' } });
    const lista = el('ul', 'mini-lista');
    const itens = faixas.map((faixa) => {
      const item = el('button', {
        class: 'mini-faixa', type: 'button', 'aria-pressed': 'false', dataset: { indice: String(faixa.indice) },
      }, [
        capaDe(faixa, 'mini-capa'),
        el('span', 'mini-nome', faixa.titulo || ''),
        el('span', 'mini-artista', faixa.artista || ''),
      ]);
      item.addEventListener('click', () => { som.destravar(); som.tocar(faixa.indice); });
      lista.append(el('li', null, item));
      return item;
    });

    const volume = el('input', {
      class: 'mini-volume', type: 'range', min: '0', max: '1', step: '0.01',
      value: String(som.volume()), 'aria-label': rotulos.volume || '',
    });
    volume.addEventListener('input', () => som.volume(Number(volume.value)));

    painelMini = el('div', { class: 'mini-painel', hidden: true }, [alternar, lista, volume]);
    mini.append(botaoMini, painelMini);

    const abrir = (aberto) => {
      painelMini.hidden = !aberto;
      botaoMini.setAttribute('aria-expanded', String(aberto));
      if (aberto) gsap.fromTo(painelMini, { autoAlpha: 0, y: -6 }, { autoAlpha: 1, y: 0, duration: 0.18, ease: curvas.ui.resposta });
    };
    botaoMini.addEventListener('click', () => { som.destravar(); abrir(painelMini.hidden); });
    alternar.addEventListener('click', () => {
      som.destravar();
      if (som.estado.tocando) som.pausar();
      else if (som.estado.indice >= 0) som.retomar();
      else if (faixas[0]) som.tocar(faixas[0].indice);
    });
    document.addEventListener('pointerdown', (e) => {
      if (!painelMini.hidden && !mini.contains(e.target)) abrir(false);
    }, { passive: true });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !painelMini.hidden) { abrir(false); botaoMini.focus(); }
    });

    const refletir = (estado) => {
      alternar.replaceChildren(svg(estado.tocando ? ICONE_PAUSA : ICONE_TOCAR));
      alternar.setAttribute('aria-label', (estado.tocando ? rotulos.pausar : rotulos.tocar) || '');
      botaoMini.classList.toggle('tocando', estado.tocando);
      for (const item of itens) item.setAttribute('aria-pressed', String(Number(item.dataset.indice) === estado.indice));
      if (document.activeElement !== volume) volume.value = String(estado.volume);
    };
    som.aoMudar(refletir);
    refletir(som.estado);
  }

  return {
    escolher,

    mostrarMini() {
      if (!faixas.length || !mini) return;
      montarMini();
      if (!mini.hidden) return;
      mini.hidden = false;
      gsap.fromTo(mini, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, ease: 'none' });
    },

    esconderMini() {
      if (!mini || mini.hidden) return;
      gsap.to(mini, { autoAlpha: 0, duration: 0.4, ease: 'none', onComplete: () => { mini.hidden = true; } });
    },
  };
}
