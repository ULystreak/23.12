// Música: o seletor na folha e o mini seletor fixo no canto (contrato 4.6).
//
//   musica.escolher(perg.folha) → Promise   resolve quando ela escolheu e tocou em continuar
//                                            (sem faixas válidas, resolve na hora)
//   musica.mostrarMini() / musica.esconderMini()
//
// Ganchos para os testes (não mudar): [data-acao="faixa"], [data-acao="continuar"],
// [data-acao="mini"], [data-acao="mini-alternar"].
//
// NA FOLHA. A folha em branco vira o encarte de uma fita gravada para ela: o
// título em cima e as faixas como uma lista escrita à mão, cada capa colada com
// um pedaço de fita de papel. Com uma faixa só, a capa cresce e vira a capa de um
// compacto, com o disco aparecendo de dentro. Tocar numa faixa faz a capa
// descolar, o fio vermelho dar a volta no nome e a música entrar. No continuar, o
// disco (ou a capa) voa até o canto e vira o mini seletor: a folha entrega um
// elemento para o resto da carta.
//
// NO CANTO. Um disco pequeno com a capa, girando enquanto toca, com o fio em
// volta marcando o progresso. Abre num painel com tocar/pausar, a lista e o
// volume (uma conta num fio). Muda de pele com a cena e se recolhe enquanto ela
// rola um capítulo, para nunca ficar em cima do que ela está lendo.

import { el, svg, espera, quadro, semente, clamp, debounce } from './nucleo/util.js';
import { curvas, revelarPalavras } from './nucleo/movimento.js';

// ---- desenhos (SVG; nada de glifo fazendo papel de ícone) -------------------------------
const ICONE_TOCAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.7 5.3c.2 4.5.1 8.9-.1 13.4 3.6-2 7-4.2 10.5-6.6-3.4-2.4-6.8-4.7-10.4-6.8z" fill="currentColor" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
const ICONE_PAUSA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.4 5.6c.2 4.2.1 8.5-.1 12.8M15.7 5.4c-.2 4.3-.1 8.6.1 13" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round"/></svg>';
const ICONE_SETA = '<svg class="musica-seta" viewBox="0 0 44 20" aria-hidden="true"><path d="M2.5 11.2c9.2-2.3 22-2.8 37.6-1.3"/><path d="M32.4 3.6c2.7 2.2 5.2 4.1 7.9 6.2-3 1.7-5.7 3.5-8.5 6.1"/></svg>';
const ICONE_VOLUME = '<svg class="mini-volume-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 9.4c1.2-.1 2.3-.1 3.4 0 1.5-1.2 2.9-2.3 4.3-3.5.2 4 .2 8.1 0 12.2-1.5-1.1-2.9-2.2-4.3-3.4-1.1.1-2.3.1-3.4 0-.1-1.8-.1-3.5 0-5.3z"/><path d="M14.4 9.6c1 1.5 1 3.4 0 4.9M17.2 7.3c2.2 2.9 2.2 6.6 0 9.5"/></svg>';

const PERIODO_GIRO = 9000;       // ms por volta: o disco gira devagar
const RAIO_ANEL = 22.6;          // raio do fio de progresso em volta do disco (caixa de 48)
const VOLTA_ANEL = 2 * Math.PI * RAIO_ANEL;

const n2 = (v) => Math.round(v * 100) / 100;
const FIM_SEM_BOTAO = new Set(['desdobrando', 'escrevendo', 'fim']);   // etapas da cena final sem o mini

// Quem abriu a carta pelo teclado ganha o foco na primeira faixa; quem tocou, não
// (senão o anel de foco aparece no iPhone como se a faixa já estivesse escolhida).
let viaTeclado = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => { viaTeclado = true; }, true);
  window.addEventListener('pointerdown', () => { viaTeclado = false; }, true);
}

/** Curva suave (Catmull-Rom → Bézier) passando por todos os pontos. */
function caminhoSuave(p) {
  let d = `M${n2(p[0][0])} ${n2(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)];
    const b = p[i];
    const c = p[i + 1];
    const e = p[Math.min(p.length - 1, i + 2)];
    d += `C${n2(b[0] + (c[0] - a[0]) / 6)} ${n2(b[1] + (c[1] - a[1]) / 6)} ${n2(c[0] - (e[0] - b[0]) / 6)} ${n2(c[1] - (e[1] - b[1]) / 6)} ${n2(c[0])} ${n2(c[1])}`;
  }
  return d;
}

/**
 * Quanto o laço precisa sair da caixa do texto (l × a) para dar a volta sem
 * passar por cima de nenhuma letra. É uma curva arredondada (superelipse): num
 * nome de uma ou duas linhas, quase uma elipse (expoente 2,6); num nome que
 * quebra em várias linhas, mais quadrada (até 5), para não invadir as linhas
 * vizinhas. De lado ela sai pouco; a altura é a que deixa o canto do texto dentro.
 */
const MARGEM_LACO = 7;           // o tremor e a abertura da volta cabem aqui
function folgaDoLaco(l, a) {
  const hx = Math.max(8, l / 2);
  const hy = Math.max(8, a / 2);
  const n = 2.6 + clamp((hy - 26) / 30) * 2.4;
  const px = clamp(hx * 0.1, 11, 16);
  const kx = hx / (hx + px);
  const ky = (1 - kx ** n) ** (1 / n);
  const ry = Math.max(hy + 6, hy / ky);
  return { x: Math.round(px + MARGEM_LACO), y: Math.round(ry - hy + MARGEM_LACO), rx: hx + px, ry, n };
}

/**
 * O laço: uma volta desenhada à mão em torno da caixa do texto. Começa em cima, à
 * esquerda, dá a volta e passa do começo, um pouco mais aberto, como quem circula
 * um nome sem levantar a caneta. Nunca entra na caixa do texto.
 */
function caminhoDoLaco(l, a, sorte, f) {
  const cx = l / 2;
  const cy = a / 2;
  const inicio = -2.45 + (sorte() - 0.5) * 0.3;
  const volta = Math.PI * 2 + 0.6 + sorte() * 0.25;
  const f1 = sorte() * 6.28;
  const f2 = sorte() * 6.28;
  const inclina = (sorte() - 0.5) * 0.035;          // a mão não segura a caneta reta
  const e = 2 / f.n;
  const pontos = [];
  const passos = 52;
  for (let i = 0; i <= passos; i++) {
    const k = i / passos;
    const ang = inicio + volta * k;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const sx = Math.sign(c) * Math.abs(c) ** e;
    const sy = Math.sign(s) * Math.abs(s) ** e;
    // o tremor só empurra para fora; a volta abre aos poucos (o fim não fecha no começo)
    const tremor = 1.2 + Math.sin(ang * 2 + f1) * 1.2 + Math.sin(ang * 3.3 + f2) * 0.7;
    const abre = 4.2 * k;
    const x = (f.rx + tremor + abre) * sx;
    const y = (f.ry + (tremor + abre) * 0.7) * sy;
    pontos.push([cx + x - y * inclina, cy + y + x * inclina]);
  }
  return caminhoSuave(pontos);
}

/** O sublinhado do continuar: um fio quase reto, com um respiro no meio e a ponta subindo. */
function caminhoDoSublinhado(l, a, sorte) {
  const y = a * 0.55;
  const pontos = [];
  const passos = 7;
  for (let i = 0; i <= passos; i++) {
    const k = i / passos;
    pontos.push([2 + (l - 4) * k, y + Math.sin(k * 5.2 + sorte() * 0.8) * 1.1 - (k > 0.86 ? (k - 0.86) * 16 : 0)]);
  }
  return caminhoSuave(pontos);
}

/**
 * O traço de tinta entre duas linhas da lista: um risco de pincel fino. Começa
 * carregado de tinta, afina aos poucos e termina seco (a ponta se parte em dois).
 */
function tracoDeTinta(sorte) {
  const cima = [];
  const baixo = [];
  const x0 = 2 + sorte() * 14;
  const x1 = 298 - sorte() * 30;
  const fase = sorte() * 6;
  const passos = 12;
  for (let i = 0; i <= passos; i++) {
    const k = i / passos;
    const x = x0 + (x1 - x0) * k;
    const meio = 5 + Math.sin(k * 3.9 + fase) * 0.9 + (sorte() - 0.5) * 0.35;
    // grosso logo depois do começo, afinando até o fim
    const carga = Math.min(1, k * 9) * (1 - k) ** 0.8;
    const meia = 0.2 + carga * (0.75 + sorte() * 0.5);
    cima.push([x, meio - meia]);
    baixo.unshift([x, meio + meia * 0.9]);
  }
  // o resto de tinta que a ponta seca ainda deixa, um pouco adiante
  const xr = x1 + 3 + sorte() * 5;
  const yr = cima[passos][1] + (sorte() - 0.5) * 0.8;
  const resto = `M${n2(xr)} ${n2(yr)}C${n2(xr + 4)} ${n2(yr - 0.5)} ${n2(xr + 9)} ${n2(yr + 0.1)} ${n2(xr + 13)} ${n2(yr - 0.2)}C${n2(xr + 9)} ${n2(yr + 0.6)} ${n2(xr + 4)} ${n2(yr + 0.5)} ${n2(xr)} ${n2(yr)}Z`;
  return svg(`<svg class="musica-traco" viewBox="0 0 320 10" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${caminhoSuave([...cima, ...baixo, cima[0]])}Z${resto}"/></svg>`);
}

export function criarMusica({ conteudo, som, amb, recursos, mini }) {
  const gsap = window.gsap;
  const dados = conteudo?.musica || {};
  const rotulos = dados.rotulos || {};
  const calmo = () => !!amb?.reduzido;
  const temDesenho = () => !!window.DrawSVGPlugin;

  // Faixa válida = tem arquivo. As outras nem aparecem.
  const todas = (Array.isArray(dados.faixas) ? dados.faixas : [])
    .map((faixa, indice) => ({ ...(faixa || {}), indice }))
    .filter((f) => typeof f.arquivo === 'string' && f.arquivo.trim());
  const fora = new Set();                    // faixas cujo arquivo não existe: somem em silêncio
  const aoDescartar = new Set();
  const validas = () => todas.filter((f) => !fora.has(f.indice));

  function descartar(indice) {
    if (fora.has(indice) || !todas.some((f) => f.indice === indice)) return;
    fora.add(indice);
    for (const fn of [...aoDescartar]) {
      try { fn(indice); } catch (erro) { console.error(erro); }
    }
  }

  // O arquivo que não existe é descoberto antes de ela ver a lista (um pedido só de
  // cabeçalho, sem baixar a música). Só um "não existe" certo tira a faixa; rede
  // lenta ou servidor que não responde a esse pedido deixam a decisão para a hora de tocar.
  let conferencia = null;
  function conferirArquivos() {
    if (!conferencia) {
      conferencia = Promise.all(todas.map(async (faixa) => {
        try {
          const resposta = await fetch(faixa.arquivo, { method: 'HEAD' });
          if (resposta.status === 404 || resposta.status === 410) descartar(faixa.indice);
        } catch { /* decide na hora de tocar */ }
      }));
    }
    return conferencia;
  }
  if (todas.length) {
    if (window.requestIdleCallback) window.requestIdleCallback(conferirArquivos, { timeout: 2500 });
    else espera(700).then(conferirArquivos);
  }
  // Arquivo que existe mas não toca: sai da lista assim que falhar.
  som.aoMudar((estado) => {
    if (estado.falhou && estado.indice >= 0) descartar(estado.indice);
  });

  // ---- peças compartilhadas ---------------------------------------------------------------

  /** Um giro com inércia: acelera ao tocar e vai parando ao pausar (animação do navegador, fora do JS). */
  function criarGiro(alvo) {
    let anim = null;
    let tween = null;
    const ritmo = { v: 0 };
    const garantir = () => {
      if (!anim && alvo.animate && !calmo()) {
        anim = alvo.animate(
          [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
          { duration: PERIODO_GIRO, iterations: Infinity },
        );
        anim.pause();
      }
      return anim;
    };
    return {
      definir(girando) {
        if (!garantir()) return;
        if (tween) tween.kill();
        if (girando) anim.play();
        tween = gsap.to(ritmo, {
          v: girando ? 1 : 0,
          duration: girando ? 1.1 : 1.9,
          ease: 'power2.out',
          onUpdate: () => { anim.playbackRate = ritmo.v; },
          onComplete: () => { if (!girando) anim.pause(); },
        });
      },
      /** Em que ponto da volta está (ms dentro do período). */
      get fase() { return anim ? (Number(anim.currentTime) || 0) % PERIODO_GIRO : 0; },
      set fase(ms) { if (garantir()) anim.currentTime = ms; },
      soltar() {
        if (tween) tween.kill();
        if (anim) anim.cancel();
        anim = null;
      },
    };
  }

  /**
   * O disco: sulcos parados (a luz não gira com o disco) e um rótulo com a capa,
   * que é o que gira. `classe` escolhe o tamanho do rótulo (vinil ou mini).
   */
  function criarDisco(classe) {
    const gira = el('span', 'disco-gira');
    const rotulo = el('span', 'disco-rotulo', gira);
    const no = el('span', { class: `disco ${classe}`, 'aria-hidden': 'true' }, [
      el('span', 'disco-sulcos'), rotulo, el('span', 'disco-furo'),
    ]);
    let pedido = 0;
    let atual = null;
    return {
      no, rotulo, gira,
      giro: criarGiro(gira),
      /** Põe a capa da faixa no rótulo (ou o rótulo vermelho, se ela não tiver capa). */
      async capa(faixa) {
        if (!faixa || faixa.indice === atual) return;
        atual = faixa.indice;
        const meu = ++pedido;
        const img = await recursos.elementoImagem(faixa.capa, '');
        if (meu !== pedido) return;
        no.classList.toggle('sem-capa', !img);
        const antigas = [...gira.children];
        if (img) {
          gira.append(img);
          if (antigas.length && !calmo()) {
            gsap.fromTo(img, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: 'none', onComplete: () => antigas.forEach((a) => a.remove()) });
            return;
          }
        }
        antigas.forEach((a) => a.remove());
      },
    };
  }

  /**
   * Um traço que se desenha (o laço, o sublinhado). O desenho é refeito em pixels
   * de verdade sempre que a caixa `hospede` muda de tamanho, para a espessura do
   * fio não esticar junto.
   */
  function criarFioDesenhado(classe, hospede, folga, gerar) {
    const no = svg(`<svg class="${classe}" aria-hidden="true" focusable="false"><path class="fio-sombra"/><path class="fio-linha"/></svg>`);
    const caminhos = [...no.querySelectorAll('path')];
    let visivel = false;
    let tween = null;
    const parado = () => !tween || !tween.isActive();
    const fixar = () => {
      if (temDesenho()) gsap.set(caminhos, { drawSVG: visivel ? '0% 100%' : '0% 0%' });
      gsap.set(no, { autoAlpha: visivel ? 1 : 0 });
    };
    const medir = () => {
      const f = typeof folga === 'function' ? folga(hospede.offsetWidth, hospede.offsetHeight) : folga;
      const l = hospede.offsetWidth + f.x * 2;
      const a = hospede.offsetHeight + f.y * 2;
      if (l < 12 || a < 6) return;
      no.setAttribute('width', l);
      no.setAttribute('height', a);
      no.setAttribute('viewBox', `0 0 ${l} ${a}`);
      if (typeof folga === 'function') {
        no.style.left = `${-f.x}px`;
        no.style.top = `${-f.y}px`;
      }
      const d = gerar(l, a, f);
      for (const c of caminhos) c.setAttribute('d', d);
      if (parado()) fixar();
    };
    const observador = 'ResizeObserver' in window ? new ResizeObserver(medir) : null;
    if (observador) observador.observe(hospede);
    gsap.set(no, { autoAlpha: 0 });

    return {
      no,
      medir,
      desenhar({ duracao = 0.95, atraso = 0 } = {}) {
        if (tween) tween.kill();
        visivel = true;
        if (!caminhos[0].getAttribute('d')) medir();
        if (calmo() || !temDesenho()) {
          if (temDesenho()) gsap.set(caminhos, { drawSVG: '0% 100%' });
          tween = gsap.to(no, { autoAlpha: 1, duration: 0.5, delay: atraso, ease: 'none' });
          return;
        }
        gsap.set(caminhos, { drawSVG: '0% 0%' });
        tween = gsap.timeline({ delay: atraso })
          .set(no, { autoAlpha: 1 })
          .to(caminhos, { drawSVG: '0% 100%', duration: duracao, ease: 'power2.inOut' });
      },
      apagar({ duracao = 0.4 } = {}) {
        if (tween) tween.kill();
        if (!visivel) return;
        visivel = false;
        if (calmo() || !temDesenho()) {
          tween = gsap.to(no, { autoAlpha: 0, duration: 0.3, ease: 'none' });
          return;
        }
        // Desfaz no mesmo sentido em que foi feito: o começo corre atrás do fim.
        tween = gsap.timeline()
          .to(caminhos, { drawSVG: '100% 100%', duration: duracao, ease: 'power1.inOut' })
          .set(no, { autoAlpha: 0 });
      },
      soltar() {
        if (observador) observador.disconnect();
        if (tween) tween.kill();
      },
    };
  }

  // ---- seletor na folha -------------------------------------------------------------------

  function escolher(folha) {
    if (!folha || !validas().length) return Promise.resolve();
    return (async () => {
      // Dá um instante para a conferência dos arquivos terminar (quase sempre já terminou).
      await Promise.race([conferirArquivos(), espera(1200)]);
      const faixas = validas();
      if (!faixas.length) return;
      // As capas já vêm da pré-carga; uma que demorar entra depois, sem segurar a folha.
      const capas = faixas.map((f) => recursos.elementoImagem(f.capa, ''));
      const prontas = await Promise.race([
        Promise.all(capas),
        espera(900).then(() => null),
      ]);
      await new Promise((resolver) => montarSeletor(folha, faixas, capas, prontas, resolver));
    })().catch((erro) => {
      // A música nunca prende a carta: se algo aqui quebrar, ela segue adiante sem escolher.
      console.error('[carta] o seletor de música falhou', erro);
      folha.textContent = '';
    });
  }

  function montarSeletor(folha, faixas, capas, prontas, resolver) {
    const unica = faixas.length === 1;
    const limpar = [];                       // o que desfazer quando a folha for embora
    let terminado = false;
    let escolhida = null;

    const titulo = el('h2', 'musica-titulo');
    const lista = el('ul', 'musica-lista');
    const rotuloContinuar = el('span', 'musica-continuar-texto', dados.continuar || '');
    const continuar = el('button', {
      class: 'musica-continuar', type: 'button', dataset: { acao: 'continuar' },
    }, [rotuloContinuar, svg(ICONE_SETA)]);
    // Sem texto visível, a seta sozinha precisa de um nome para o leitor de tela.
    if (!dados.continuar && rotulos.continuar) continuar.setAttribute('aria-label', rotulos.continuar);
    // Poucas faixas: linhas largas, capas maiores. De cinco em diante, linhas mais juntas (seis ainda cabem
    // na tela do celular); passando disso, a lista rola dentro da folha.
    const folga = faixas.length <= 3 ? 'larga' : faixas.length <= 4 ? 'media' : 'justa';
    const painel = el('div', {
      class: 'musica', dataset: { modo: unica ? 'unica' : 'lista', quantas: String(faixas.length), folga },
    }, [titulo, lista, continuar]);

    const sublinhado = criarFioDesenhado('musica-sublinhado', rotuloContinuar, { x: 4, y: 0 },
      (l) => caminhoDoSublinhado(l, 9, semente(77)));
    rotuloContinuar.append(sublinhado.no);
    limpar.push(sublinhado.soltar);
    continuar.disabled = true;
    // (o continuar fica escondido só depois da pintura de aquecimento, lá embaixo)

    // ---- as linhas ----
    const linhas = faixas.map((faixa, posicao) => {
      const sorte = semente(faixa.indice * 97 + 13);
      const lado = posicao % 2 ? 1 : -1;
      const angulo = unica ? -1.3 : lado * (1.2 + sorte() * 2.2);
      const item = el('li', 'musica-item');
      // Cada capa é colada de um jeito: o ângulo, o quanto a linha entra e onde a fita pegou.
      // (Variáveis de CSS não passam pelo style{} do el(), que usa Object.assign.)
      item.style.setProperty('--ang', `${n2(angulo)}deg`);
      item.style.setProperty('--dx', `${Math.round(sorte() * 12)}px`);
      item.style.setProperty('--fita-ang', `${n2(-angulo * 1.6 + (sorte() - 0.5) * 7)}deg`);
      item.style.setProperty('--fita-x', `${Math.round((sorte() - 0.5) * 26)}%`);

      const objeto = el('span', { class: 'musica-objeto', 'aria-hidden': 'true' });
      const moldura = el('span', 'musica-moldura', [el('span', 'musica-capa'), el('i', 'musica-fita')]);
      const disco = unica ? criarDisco('disco-vinil musica-disco') : null;
      if (disco) {
        // O trilho é por onde o disco escorrega para fora da capa (o CSS move o trilho; a entrada move o disco).
        objeto.append(el('span', 'musica-disco-trilho', disco.no));
        disco.capa(faixa);
        limpar.push(disco.giro.soltar);
      }

      const nome = el('span', 'musica-nome', faixa.titulo || '');
      const artista = faixa.artista ? el('span', 'musica-artista', faixa.artista) : null;
      const texto = el('span', 'musica-texto', [nome, artista]);
      const laco = criarFioDesenhado('musica-laco', texto, folgaDoLaco,
        (l, a, f) => caminhoDoLaco(l, a, semente(faixa.indice * 31 + 5), f));
      texto.append(laco.no);
      limpar.push(laco.soltar);

      const botao = el('button', {
        class: 'musica-faixa', type: 'button', 'aria-pressed': 'false',
        dataset: { acao: 'faixa', indice: String(faixa.indice) },
      }, [objeto, texto]);
      item.append(botao);

      const linha = { faixa, item, botao, objeto, moldura, disco, texto, nome, artista, laco, temCapa: false };

      const receberCapa = (img, atrasada) => {
        if (terminado) return;
        if (img) {
          moldura.firstChild.append(img);
          if (!moldura.isConnected) objeto.append(moldura);
          linha.temCapa = true;
          // Capa que chegou depois da folha: aparece devagar, no lugar.
          if (atrasada && !gsap.isTweening(moldura)) gsap.fromTo(moldura, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.7, ease: 'none', clearProps: 'opacity,visibility' });
        }
        item.classList.toggle('sem-capa', !linha.temCapa);
      };
      if (prontas) receberCapa(prontas[posicao], false);
      else {
        item.classList.add('sem-capa');
        capas[posicao].then((img) => receberCapa(img, true));
      }

      botao.addEventListener('click', () => aoEscolher(linha));
      lista.append(item);
      return linha;
    });

    // Entre as linhas, um traço de tinta (nunca uma borda).
    if (!unica) {
      linhas.slice(0, -1).forEach((linha, i) => {
        linha.traco = tracoDeTinta(semente(linha.faixa.indice * 53 + 7 + i));
        linha.item.append(linha.traco);
      });
    }

    // ---- escolher ----
    function marcar(linha) {
      const anterior = escolhida;
      escolhida = linha;
      for (const l of linhas) l.botao.setAttribute('aria-pressed', String(l === linha));
      if (anterior && anterior !== linha) anterior.laco.apagar();
      // Trocar de faixa: o laço se desfaz na antiga e só então se refaz na nova.
      linha.laco.desenhar({ atraso: anterior && anterior !== linha && !calmo() ? 0.22 : 0.05 });

      if (continuar.disabled && !terminado) {
        continuar.disabled = false;
        gsap.fromTo(continuar,
          { autoAlpha: 0, y: calmo() ? 0 : 10 },
          { autoAlpha: 1, y: 0, duration: 1.1, delay: 0.25, ease: curvas.branco.entrar, clearProps: 'transform' });
        sublinhado.desenhar({ duracao: 0.8, atraso: 0.7 });
        if (!calmo() && temDesenho()) {
          gsap.fromTo(continuar.querySelectorAll('.musica-seta path'),
            { drawSVG: '0% 0%' },
            { drawSVG: '0% 100%', duration: 0.5, stagger: 0.28, delay: 0.95, ease: 'power2.out' });
        }
      }
    }

    function aoEscolher(linha) {
      if (terminado || fora.has(linha.faixa.indice)) return;
      som.destravar();
      som.efeito('toque');
      // Tocar de novo na escolhida não troca nada (e traz a música de volta, se estava pausada).
      if (escolhida !== linha || !som.estado.tocando) som.tocar(linha.faixa.indice);
      if (escolhida !== linha) marcar(linha);
    }

    // O disco do compacto gira enquanto a faixa dele toca.
    const pararDeOuvir = som.aoMudar((estado) => {
      for (const l of linhas) {
        if (l.disco) l.disco.giro.definir(estado.tocando && estado.indice === l.faixa.indice);
      }
    });
    limpar.push(pararDeOuvir);

    // ---- faixa que não toca: some da lista, em silêncio ----
    const semFaixa = (indice) => {
      const linha = linhas.find((l) => l.faixa.indice === indice);
      if (!linha || terminado) return;
      linha.botao.disabled = true;
      if (escolhida === linha) {
        escolhida = null;
        linha.laco.apagar();
        continuar.disabled = true;
        gsap.to(continuar, { autoAlpha: 0, duration: 0.3, ease: 'none', overwrite: true });
      }
      if (!validas().length) { encerrar(null); return; }
      gsap.to(linha.item, { autoAlpha: 0, duration: 0.35, ease: 'none', onComplete: () => { linha.item.hidden = true; marcarRolagem(); } });
    };
    aoDescartar.add(semFaixa);
    limpar.push(() => aoDescartar.delete(semFaixa));

    // ---- continuar: a folha entrega o disco para o canto ----
    continuar.addEventListener('click', () => {
      if (terminado || !escolhida) return;
      som.efeito('toque');
      encerrar(escolhida);
    }, { once: true });

    async function encerrar(linha) {
      if (terminado) return;
      terminado = true;
      continuar.disabled = true;
      for (const l of linhas) l.botao.disabled = true;

      const voa = linha && mini && !calmo() && (linha.disco || linha.temCapa) ? (linha.disco ? linha.disco.no : linha.moldura) : null;
      const resto = [titulo, continuar, ...linhas.flatMap((l) => (l === linha ? [l.texto, l.traco] : [l.item]))]
        .filter(Boolean);

      try {
        if (voa) {
          // O que não vai junto se apaga; o disco fica um instante sozinho na folha e então voa.
          gsap.to(resto, { autoAlpha: 0, duration: 0.45, ease: 'none' });
          if (linha.disco) {
            // A capa se afasta para o outro lado e some depressa; o disco só levanta voo
            // quando ela já não está lá (a cópia que voa fica na frente de tudo, e não
            // pode parecer que o disco pulou de trás da capa para a frente dela).
            gsap.to(linha.moldura, { xPercent: -12, rotation: -3, duration: 0.6, ease: curvas.branco.entrar });
            gsap.to(linha.moldura, { autoAlpha: 0, duration: 0.34, ease: 'power1.out' });
            await espera(520);
          } else {
            await espera(340);
          }
          await voarParaOCanto(linha, voa);
        } else {
          await new Promise((ok) => gsap.to(painel, { autoAlpha: 0, duration: 0.6, ease: 'none', onComplete: ok }));
        }
      } catch (erro) {
        console.error(erro);
      }
      // Aconteça o que acontecer no voo, o mini fica à vista e nada sobra voando.
      if (pecas) pecas.visual.style.visibility = '';
      for (const sobra of document.querySelectorAll('.musica-voador')) sobra.remove();
      for (const fn of limpar) {
        try { fn(); } catch (erro) { console.error(erro); }
      }
      painel.remove();
      resolver();
    }

    // ---- a lista que não cabe rola dentro da folha ----
    function marcarRolagem() {
      if (unica) return;
      const rola = lista.scrollHeight > lista.clientHeight + 2;
      lista.toggleAttribute('data-rola', rola);
    }
    if ('ResizeObserver' in window && !unica) {
      const ro = new ResizeObserver(marcarRolagem);
      ro.observe(lista);
      limpar.push(() => ro.disconnect());
    }

    // ---- entra ----
    // Antes de qualquer coisa se mexer, a folha inteira já no lugar final é pintada
    // uma vez quase transparente (0,002: nada que se veja). A primeira pintura das
    // capas, do disco, da fita e das letras (decodificar a capa, montar os gradientes,
    // as sombras, o recorte) cai aqui, com a folha ainda em branco e parada, e não no
    // meio da capa pousando. É o mesmo cuidado do pergaminho antes do rolo sair.
    folha.textContent = '';
    titulo.textContent = dados.titulo || '';
    painel.style.opacity = '0.002';
    painel.style.pointerEvents = 'none';
    folha.append(painel);
    marcarRolagem();
    entrar().catch((erro) => {
      console.error(erro);
      painel.style.opacity = '';
      painel.style.pointerEvents = '';
    });

    async function entrar() {
      // quadro() resolve no rAF, antes da pintura: com dois, um quadro inteiro é pintado
      // assim. (Pintar também o começo da entrada, em camadas próprias, foi medido e
      // dobrou a espera sem tirar o último tranco: não vale.)
      await quadro();
      await quadro();
      gsap.set(continuar, { autoAlpha: 0 });
      painel.style.opacity = '';
      painel.style.pointerEvents = '';
      if (terminado || !painel.isConnected) return;
      animarEntrada();
    }

    function animarEntrada() {
      // O foco que estava na carta sumiu com ela: vai para a primeira faixa (só se
      // estava solto no body, para não tirar nada do lugar de ninguém).
      // A carta pode sair um instante depois da folha chegar: confere de novo.
      const focarPrimeira = () => {
        const ativo = document.activeElement;
        if (!viaTeclado || terminado || !painel.isConnected || (ativo && ativo !== document.body)) return;
        try { linhas[0].botao.focus({ preventScroll: true }); } catch { /* segue */ }
      };
      focarPrimeira();
      espera(700).then(focarPrimeira);
      revelarPalavras(titulo, dados.titulo || '', { intervalo: 0.12, duracao: 1.2 });

      if (calmo()) {
        gsap.fromTo(linhas.map((l) => l.item), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, stagger: 0.05, delay: 0.3, ease: 'none' });
        return;
      }
      if (unica) {
        const [l] = linhas;
        // A capa pousa na folha, a fita de papel prende, o disco escorrega para fora, o nome é escrito.
        gsap.fromTo(l.moldura, { autoAlpha: 0, y: 26, scale: 1.05 }, { autoAlpha: 1, y: 0, scale: 1, duration: 1.5, delay: 0.3, ease: curvas.branco.entrar, clearProps: 'transform,opacity,visibility' });
        gsap.fromTo(l.moldura.querySelector('.musica-fita'), { autoAlpha: 0, scaleX: 0.7 }, { autoAlpha: 1, scaleX: 1, duration: 0.7, delay: 1.0, ease: curvas.branco.entrar, clearProps: 'transform,opacity,visibility' });
        if (l.disco) gsap.fromTo(l.disco.no, { autoAlpha: 0, xPercent: l.temCapa ? -24 : 0 }, { autoAlpha: 1, xPercent: 0, duration: 1.7, delay: 0.75, ease: curvas.branco.entrar, clearProps: 'transform,opacity,visibility' });
        gsap.fromTo(l.nome, { clipPath: 'inset(-20% 100% -20% -6%)' }, { clipPath: 'inset(-20% -6% -20% -6%)', duration: 1.1, delay: 1.0, ease: 'power2.inOut', clearProps: 'clipPath' });
        if (l.artista) gsap.fromTo(l.artista, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.9, delay: 1.7, ease: 'none', clearProps: 'opacity,visibility' });
      } else {
        // Linhas escalonadas; o toque já vale desde o primeiro quadro.
        gsap.fromTo(linhas.map((l) => l.item), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 1.0, stagger: 0.05, delay: 0.35, ease: curvas.branco.entrar, clearProps: 'transform,opacity' });
        gsap.fromTo(linhas.map((l) => l.traco).filter(Boolean), { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, stagger: 0.06, delay: 0.8, ease: 'power2.inOut', clearProps: 'clipPath' });
      }
    }
  }

  /**
   * O disco (ou a capa) sai da folha, encolhe e pousa no canto, onde vira o mini
   * seletor. Quem voa é uma cópia presa à tela; a troca pelo mini de verdade
   * acontece no pouso, no mesmo lugar e do mesmo tamanho.
   */
  async function voarParaOCanto(linha, origem) {
    montarMini();
    if (!pecas) return;
    const jaVisivel = !mini.hidden;
    const mostrarVisual = () => { pecas.visual.style.visibility = ''; };
    mini.hidden = false;
    gsap.killTweensOf(mini);
    gsap.set(mini, { autoAlpha: 1 });
    // Escondido sem mexer na opacidade: assim o disco de verdade aparece inteiro, de uma vez, no pouso.
    if (!jaVisivel) pecas.visual.style.visibility = 'hidden';
    await pecas.disco.capa(linha.faixa);

    // A origem pode estar torta na folha: vale o tamanho de verdade dela, em volta do centro que se vê.
    const caixa = origem.getBoundingClientRect();
    const de = {
      width: origem.offsetWidth || caixa.width,
      height: origem.offsetHeight || caixa.height,
    };
    de.left = caixa.left + caixa.width / 2 - de.width / 2;
    de.top = caixa.top + caixa.height / 2 - de.height / 2;
    const para = pecas.disco.no.getBoundingClientRect();
    if (de.width < 4 || para.width < 4) { mostrarVisual(); return; }

    const ehDisco = !!linha.disco;
    let voador;
    let rotulo = null;
    if (ehDisco) {
      const copia = criarDisco('disco-vinil');
      await copia.capa(linha.faixa);
      // A cópia nasce no mesmo ângulo em que o disco estava; o mini continua desse ponto.
      const fase = linha.disco.giro.fase;
      copia.gira.style.transform = `rotate(${n2((fase / PERIODO_GIRO) * 360)}deg)`;
      pecas.disco.giro.fase = fase;
      voador = copia.no;
      rotulo = copia.rotulo;
    } else {
      voador = el('span', { class: 'musica-voador-capa', 'aria-hidden': 'true' });
      const img = await recursos.elementoImagem(linha.faixa.capa, '');
      if (img) voador.append(img);
    }
    voador.classList.add('musica-voador');
    Object.assign(voador.style, { left: `${de.left}px`, top: `${de.top}px`, width: `${de.width}px`, height: `${de.height}px` });
    document.body.append(voador);
    origem.style.visibility = 'hidden';

    const escala = para.width / de.width;
    const dx = para.left + para.width / 2 - (de.left + de.width / 2);
    const dy = para.top + para.height / 2 - (de.top + de.height / 2);
    const duracao = 1.15;
    await new Promise((ok) => {
      const tl = gsap.timeline({ onComplete: ok });
      // x e y com curvas diferentes: o caminho sai em arco, não em linha reta.
      tl.to(voador, { x: dx, duration: duracao, ease: 'power2.inOut' }, 0);
      tl.to(voador, { y: dy, duration: duracao, ease: curvas.branco.camera }, 0);
      tl.to(voador, { scale: escala, duration: duracao, ease: curvas.branco.camera }, 0);
      if (rotulo) {
        // O rótulo cresce até quase a borda: o vinil vira o disquinho só com a capa.
        tl.to(rotulo, { scale: 0.9 / 0.4, duration: duracao * 0.8, ease: 'power2.inOut' }, duracao * 0.2);
      } else {
        tl.fromTo(voador, { rotation: parseFloat(getComputedStyle(linha.item).getPropertyValue('--ang')) || 0 },
          { rotation: 0, duration: duracao, ease: 'power2.inOut' }, 0);
        tl.to(voador, { borderRadius: '50%', duration: duracao * 0.7, ease: 'power2.in' }, duracao * 0.3);
      }
    });

    // Pouso: o mini de verdade aparece embaixo da cópia, que se desfaz.
    mostrarVisual();
    refletir(som.estado);
    await new Promise((ok) => gsap.to(voador, { autoAlpha: 0, duration: 0.3, delay: 0.05, ease: 'none', onComplete: ok }));
    voador.remove();
  }

  // ---- mini seletor -------------------------------------------------------------------------
  let pecas = null;             // os elementos do mini, depois de montado
  let refletir = () => {};

  function montarMini() {
    if (pecas || !mini) return;

    const disco = criarDisco('disco-mini');
    const anel = svg(`<svg class="mini-anel" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle class="mini-anel-trilho" cx="24" cy="24" r="${RAIO_ANEL}"/>
      <circle class="mini-anel-fio" cx="24" cy="24" r="${RAIO_ANEL}" transform="rotate(-90 24 24)"/>
    </svg>`);
    const fioAnel = anel.querySelector('.mini-anel-fio');
    fioAnel.style.strokeDasharray = `${n2(VOLTA_ANEL)}`;
    fioAnel.style.strokeDashoffset = `${n2(VOLTA_ANEL)}`;
    const visual = el('span', 'mini-visual', [anel, disco.no]);
    const botao = el('button', {
      class: 'mini-botao', type: 'button', 'aria-label': rotulos.abrir || '', 'aria-expanded': 'false',
      'aria-controls': 'mini-painel', dataset: { acao: 'mini' },
    }, visual);

    const alternar = el('button', { class: 'mini-alternar', type: 'button', dataset: { acao: 'mini-alternar' } });
    const nomeAtual = el('span', 'mini-nome');
    const artistaAtual = el('span', 'mini-artista');
    const agora = el('div', 'mini-agora', [alternar, el('p', 'mini-atual', [nomeAtual, artistaAtual])]);

    // A lista só existe quando há o que trocar.
    const lista = el('ul', { class: 'mini-lista', 'aria-label': rotulos.trocar || rotulos.abrir || '' });
    const itens = todas.map((faixa) => {
      const capa = el('span', { class: 'mini-capa', 'aria-hidden': 'true' });
      recursos.elementoImagem(faixa.capa, '').then((img) => {
        if (img) capa.append(img);
        else capa.classList.add('sem-capa');
      });
      const item = el('button', {
        class: 'mini-faixa', type: 'button', 'aria-pressed': 'false', dataset: { indice: String(faixa.indice) },
      }, [capa, el('span', 'mini-faixa-nome', faixa.titulo || ''), faixa.artista ? el('span', 'mini-faixa-artista', faixa.artista) : null]);
      item.addEventListener('click', () => {
        som.destravar();
        som.efeito('toque');
        som.tocar(faixa.indice);
      });
      const li = el('li', null, item);
      li.hidden = fora.has(faixa.indice);
      lista.append(li);
      return { faixa, item, li };
    });

    // O volume é uma conta num fio. Por baixo é um controle de verdade (teclado, leitor de tela).
    const controle = el('input', {
      class: 'mini-volume-controle', type: 'range', min: '0', max: '1', step: '0.01',
      'aria-label': rotulos.volume || '',
    });
    const volume = el('div', 'mini-volume', [svg(ICONE_VOLUME), el('span', { class: 'mini-volume-fio', 'aria-hidden': 'true' }), controle]);
    // A posição da conta é a raiz do volume: o ouvido não é linear, e assim os 30% caem perto do meio do fio.
    const posicaoDoVolume = (v) => Math.sqrt(clamp(v));
    controle.addEventListener('input', () => {
      const p = clamp(Number(controle.value) || 0);
      som.volume(p * p);
    });

    const painel = el('div', { class: 'mini-painel', id: 'mini-painel', role: 'group', 'aria-label': rotulos.abrir || '' }, [agora, lista, volume]);
    mini.append(botao, painel);
    mini.dataset.pele = 'papel';

    pecas = { botao, visual, disco, painel, alternar, lista, itens, controle };

    // ---- abrir e fechar ----
    let aberto = false;
    const abrir = (sim) => {
      if (aberto === sim) return;
      aberto = sim;
      mini.toggleAttribute('data-aberto', sim);
      botao.setAttribute('aria-expanded', String(sim));
      if (sim) recolher(false);
      else assentar();
    };
    pecas.abrir = abrir;
    botao.addEventListener('click', () => {
      som.destravar();
      som.efeito('toque');
      abrir(!aberto);
    });
    alternar.addEventListener('click', () => {
      som.destravar();
      if (som.estado.tocando) som.pausar();
      else if (som.estado.indice >= 0 && !fora.has(som.estado.indice)) som.retomar();
      else if (validas()[0]) som.tocar(validas()[0].indice);
    });
    document.addEventListener('pointerdown', (e) => {
      if (aberto && !mini.contains(e.target)) abrir(false);
    }, { passive: true });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !aberto) return;
      const dentro = mini.contains(document.activeElement);
      abrir(false);
      if (dentro) botao.focus();
    });

    // ---- recolher enquanto ela rola um capítulo ----
    // Durante a rolagem o disco encolhe até virar uma conta na margem da folha, fora
    // da coluna do texto. Quando ela para por um segundo, ele só volta ao tamanho
    // normal se não houver texto, imagem ou botão embaixo dele; senão continua
    // pequeno na margem (um toque naquele canto abre do mesmo jeito).
    let quieto = false;
    let rolador = null;
    // Na mão (olha, mao-espera) o disco fica recolhido de propósito: a cena é da mão e do fio.
    let naMao = false;
    const folhaRaiz = document.getElementById('pergaminho');
    function recolher(sim) {
      if (quieto === sim) return;
      quieto = sim;
      mini.toggleAttribute('data-quieto', sim);
    }
    const TOCAVEL = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA']);
    const FIGURA = new Set(['IMG', 'PICTURE', 'VIDEO']);
    function ocupado(no) {
      if (TOCAVEL.has(no.tagName)) return true;
      for (const filho of no.childNodes) {
        if (filho.nodeType === 3 && filho.nodeValue.trim()) return true;
      }
      // Imagem só conta quando é do que ela lê (rola junto); o fundo fixo do capítulo não.
      return FIGURA.has(no.tagName) && !!rolador && rolador.contains(no);
    }
    function cantoLivre() {
      if (!folhaRaiz || folhaRaiz.hidden) return true;
      const r = botao.getBoundingClientRect();
      const pontos = [[0.5, 0.5], [0.1, 0.15], [0.9, 0.15], [0.1, 0.9], [0.9, 0.9], [0.5, 1.02], [-0.04, 0.5]];
      for (const [px, py] of pontos) {
        const pilha = document.elementsFromPoint(r.left + r.width * px, r.top + r.height * py);
        for (const no of pilha) {
          if (mini.contains(no) || !folhaRaiz.contains(no)) continue;
          if (ocupado(no)) return false;
        }
      }
      return true;
    }
    const assentar = debounce(() => {
      if (aberto || mini.hidden) return;
      recolher(naMao || !cantoLivre());
    }, 1000);
    document.addEventListener('scroll', (e) => {
      if (mini.hidden) return;
      const alvo = e.target;
      if (!(alvo instanceof Element) || !alvo.closest('#pergaminho')) return;
      if (!quieto) {
        // No computador o mini fica fora da folha: não há o que recolher.
        const a = botao.getBoundingClientRect();
        const b = alvo.getBoundingClientRect();
        if (a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom) return;
        rolador = alvo;
        if (aberto) abrir(false);
        recolher(true);
      }
      assentar();
    }, { capture: true, passive: true });
    window.addEventListener('resize', assentar, { passive: true });

    // ---- a pele acompanha a cena ----
    const raiz = document.documentElement;
    const vestir = () => {
      const { cena, etapa } = raiz.dataset;
      let pele = mini.dataset.pele || 'papel';
      if (cena === 'poppy' || cena === 'yourname') pele = cena;
      // Enquanto o capítulo ainda está enrolando, o mini continua com a pele dele.
      else if (etapa && etapa !== 'enrolando') pele = 'papel';
      if (mini.dataset.pele !== pele) mini.dataset.pele = pele;
      // No mundo branco do fim (a mão, a última carta) o disco se recolhe ao canto,
      // pequeno e sem cor: o branco e o fio vermelho são o que importa ali.
      const longe = (cena === 'mao' && etapa !== 'enrolando') || cena === 'final';
      mini.toggleAttribute('data-longe', longe);
      // Enquanto ela olha a mão e decide seguir o fio, o disco vira a conta recolhida.
      const eraNaMao = naMao;
      naMao = cena === 'mao' && (etapa === 'olha' || etapa === 'mao-espera');
      if (naMao && !eraNaMao) {
        assentar.cancelar();
        if (aberto) abrir(false);
        recolher(true);
      }
      // A última folha é sem botão: o disco vai embora e a música continua.
      if (cena === 'final' && FIM_SEM_BOTAO.has(etapa)) api.esconderMini();
      // Cena nova, canto novo: confere de novo se há algo para ler embaixo do disco.
      assentar();
    };
    new MutationObserver(vestir).observe(raiz, { attributes: true, attributeFilter: ['data-cena', 'data-etapa'] });
    vestir();

    // ---- o som manda no que o mini mostra ----
    const faixaAtual = (estado) => todas.find((f) => f.indice === estado.indice && !fora.has(f.indice)) || validas()[0] || null;
    refletir = (estado) => {
      const faixa = faixaAtual(estado);
      alternar.replaceChildren(svg(estado.tocando ? ICONE_PAUSA : ICONE_TOCAR));
      alternar.setAttribute('aria-label', (estado.tocando ? rotulos.pausar : rotulos.tocar) || '');
      mini.toggleAttribute('data-tocando', !!estado.tocando);
      nomeAtual.textContent = faixa ? faixa.titulo || '' : '';
      artistaAtual.textContent = faixa ? faixa.artista || '' : '';
      artistaAtual.hidden = !artistaAtual.textContent;
      disco.capa(faixa);
      disco.giro.definir(!!estado.tocando);
      const visiveis = itens.filter((i) => !fora.has(i.faixa.indice));
      lista.hidden = visiveis.length < 2;
      for (const i of itens) {
        i.li.hidden = fora.has(i.faixa.indice);
        i.item.setAttribute('aria-pressed', String(faixa && i.faixa.indice === faixa.indice && estado.indice >= 0));
      }
      const pos = posicaoDoVolume(estado.volume);
      if (document.activeElement !== controle) controle.value = String(n2(pos));
      volume.style.setProperty('--volume', String(n2(pos)));
      controle.setAttribute('aria-valuetext', `${Math.round(estado.volume * 100)}%`);
    };
    som.aoMudar(refletir);
    refletir(som.estado);

    // O fio em volta do disco marca o progresso da faixa.
    let ultimo = 0;
    const marcarProgresso = (p) => {
      const voltou = p < ultimo - 0.02;       // a faixa recomeçou: o fio não desenrola, some e recomeça
      ultimo = p;
      if (voltou) fioAnel.style.transition = 'none';
      fioAnel.style.strokeDashoffset = `${n2(VOLTA_ANEL * (1 - p))}`;
      fioAnel.style.opacity = p > 0.004 ? '1' : '0';
      if (voltou) {
        fioAnel.getBoundingClientRect();
        fioAnel.style.transition = '';
      }
    };
    som.aoTempo(marcarProgresso);
    marcarProgresso(som.progresso());

    // Faixa que deixou de existir: sai do mini também; sem nenhuma, o mini vai embora.
    aoDescartar.add(() => {
      refletir(som.estado);
      if (!validas().length) api.esconderMini();
    });
  }

  const api = {
    escolher,

    mostrarMini() {
      if (!mini || !validas().length) return;
      montarMini();
      if (!mini.hidden) return;
      mini.hidden = false;
      gsap.killTweensOf(mini);
      gsap.fromTo(mini, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.9, ease: 'none' });
    },

    esconderMini() {
      if (!mini || mini.hidden) return;
      if (pecas && pecas.abrir) pecas.abrir(false);
      gsap.killTweensOf(mini);
      gsap.to(mini, { autoAlpha: 0, duration: 0.4, ease: 'none', onComplete: () => { mini.hidden = true; } });
    },
  };

  return api;
}
