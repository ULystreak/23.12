// Música: o carrossel de capas na tela preta e o mini seletor fixo no canto
// (_dev/ROTEIRO2.md, 3b).
//
//   musica.escolher(recipiente) → Promise   recipiente = #entrada-musica. Resolve quando ela
//                                            escolheu e tocou em continuar (sem faixas
//                                            válidas, resolve na hora)
//   musica.mostrarMini() / musica.esconderMini()
//
// Ganchos para os testes (não mudar): [data-acao="faixa"] (o primeiro do DOM é a capa
// do centro ao abrir), [data-acao="continuar"], [data-acao="mini"], [data-acao="mini-alternar"].
//
// NA TELA PRETA. Uma capa grande por vez, com o disco espiando de dentro dela. Ela
// passa para o lado com o dedo: o trilho segue o dedo e, ao soltar, encaixa na capa
// mais perto (no máximo uma por gesto; nas pontas ele resiste como um elástico). As
// vizinhas espiam pela borda, menores e apagadas, e os pontos embaixo dizem quantas
// há. No computador também valem as setas da tela, as do teclado e a roda de lado.
// Tocar na capa do centro escolhe: o disco escorrega para fora e gira, o fio
// vermelho dá a volta no nome e a música entra. Tocar numa vizinha só a traz para o
// centro. No continuar, o disco voa até o canto e vira o mini seletor.
// Funciona igual com uma faixa só (sem pontos, sem setas) e com muitas.
//
// NO CANTO. Um disco pequeno com a capa, girando enquanto toca, com o fio em
// volta marcando o progresso. Abre num painel com tocar/pausar, a lista e o
// volume (uma conta num fio). Muda de pele com a cena e se recolhe enquanto ela
// rola um capítulo, para nunca ficar em cima do que ela está lendo.

import { el, svg, espera, quadro, semente, clamp, debounce } from './nucleo/util.js';
import { curvas, revelarPalavras } from './nucleo/movimento.js';

// ---- desenhos (SVG; nada de glifo fazendo papel de ícone) -------------------------------
// Todos na grade de 24, traço e pontas de .ui-icone (css/base.css).
const ICONE_TOCAR = '<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true"><path class="icone-cheio" d="M8.6 6.4a1.3 1.3 0 0 1 2-1.1l8.4 5.6a1.3 1.3 0 0 1 0 2.2l-8.4 5.6a1.3 1.3 0 0 1-2-1.1z"/></svg>';
const ICONE_PAUSA = '<svg class="ui-icone icone-pausa" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.5v11M15 6.5v11"/></svg>';
const ICONE_SETA = '<svg class="ui-icone musica-seta" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M12.8 6.5 18.5 12l-5.7 5.5"/></svg>';
const ICONE_PASSAR = '<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>';
const ICONE_VOLUME = '<svg class="ui-icone mini-volume-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9.5h3.3L11 6v12l-4.2-3.5H3.5z"/><path d="M14.4 9.6c1 1.5 1 3.4 0 4.9M17.2 7.3c2.2 2.9 2.2 6.6 0 9.5"/></svg>';

const PERIODO_GIRO = 9000;       // ms por volta: o disco gira devagar
const RAIO_ANEL = 22.6;          // raio do fio de progresso em volta do disco (caixa de 48)
const VOLTA_ANEL = 2 * Math.PI * RAIO_ANEL;

const n2 = (v) => Math.round(v * 100) / 100;
const FIM_SEM_BOTAO = new Set(['desdobrando', 'escrevendo']);   // etapas da cena final sem o mini (em 'fim' ele volta: final.js chama mostrarMini)

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

  // ---- carrossel na tela preta -------------------------------------------------------------------

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
    const limpar = [];                       // o que desfazer quando o seletor for embora
    let terminado = false;
    let escolhida = null;
    let atual = 0;                           // qual capa está no centro (posição em `vivas`)
    let passo = 0;                           // px entre o centro de uma capa e o da vizinha
    const pos = { x: 0 };                    // onde o trilho está, em capas (0 = a primeira no centro)

    const titulo = el('h2', 'musica-titulo');
    const trilho = el('ul', 'car-trilho');
    const janela = el('div', 'car-janela', trilho);
    // Fora do Tab: as setas do teclado já passam as capas, e depois de escolher o Tab vai direto ao continuar.
    const seta = (dir, rotulo) => el('button', {
      class: 'car-seta ui-redondo', type: 'button', tabindex: '-1', 'aria-label': rotulo || '', dataset: { dir: String(dir), tom: 'noite' },
    }, svg(ICONE_PASSAR));
    const setaAntes = seta(-1, rotulos.anterior);
    const setaDepois = seta(1, rotulos.proxima);
    const palco = el('div', 'car-palco', [janela, setaAntes, setaDepois]);
    const pontos = el('div', { class: 'car-pontos', 'aria-hidden': 'true' });
    const rotuloContinuar = el('span', 'musica-continuar-texto', dados.continuar || '');
    const continuar = el('button', {
      class: 'musica-continuar ui-pilula', type: 'button', dataset: { acao: 'continuar', tom: 'noite' },
    }, [rotuloContinuar, svg(ICONE_SETA)]);
    // Quem entra e sai é a caixa; o botão fica livre para o toque em mola.
    const caixaContinuar = el('div', 'musica-continuar-caixa', continuar);
    // Sem texto visível, a seta sozinha precisa de um nome para o leitor de tela.
    if (!dados.continuar && rotulos.continuar) continuar.setAttribute('aria-label', rotulos.continuar);
    const painel = el('div', {
      class: 'musica carrossel', dataset: { quantas: String(faixas.length) },
    }, [titulo, palco, pontos, caixaContinuar]);
    if (faixas.length < 2) painel.dataset.unica = '';

    continuar.disabled = true;
    // (o continuar fica escondido só depois da pintura de aquecimento, lá embaixo)

    // ---- as capas ----
    const linhas = faixas.map((faixa, posicao) => {
      const item = el('li', 'car-item');
      const moldura = el('span', 'car-moldura', [
        el('span', 'car-capa'),
        el('span', 'car-tocar ui-redondo', svg(ICONE_TOCAR)),
        el('span', 'car-laco ui-laco'),          // o lacinho do fio: aparece na capa escolhida
      ]);
      const disco = criarDisco('disco-vinil car-disco');
      // O trilho é por onde o disco escorrega para fora da capa (o CSS move o trilho; o voo move o disco).
      const objeto = el('span', { class: 'car-objeto', 'aria-hidden': 'true' }, [el('span', 'car-disco-trilho', disco.no), moldura]);
      disco.capa(faixa);
      limpar.push(disco.giro.soltar);

      const nome = el('span', 'car-nome', faixa.titulo || '');
      const artista = faixa.artista ? el('span', 'car-artista', faixa.artista) : null;
      const texto = el('span', 'car-texto', [nome, artista]);
      const laco = criarFioDesenhado('musica-laco', texto, folgaDoLaco,
        (l, a, f) => caminhoDoLaco(l, a, semente(faixa.indice * 31 + 5), f));
      texto.append(laco.no);
      limpar.push(laco.soltar);

      const botao = el('button', {
        class: 'car-faixa', type: 'button', 'aria-pressed': 'false',
        dataset: { acao: 'faixa', indice: String(faixa.indice) },
      }, [objeto, texto]);
      item.append(botao);
      const ponto = el('i', 'car-ponto');
      pontos.append(ponto);

      const linha = { faixa, item, botao, objeto, moldura, disco, texto, nome, artista, laco, ponto, temCapa: false };

      const receberCapa = (img, atrasada) => {
        if (terminado) return;
        if (img) {
          img.draggable = false;
          moldura.firstChild.append(img);
          linha.temCapa = true;
          // Capa que chegou depois: aparece devagar, no lugar.
          if (atrasada) gsap.fromTo(img, { opacity: 0 }, { opacity: 1, duration: 0.7, ease: 'none', clearProps: 'opacity' });
        }
        item.classList.toggle('sem-capa', !linha.temCapa);
      };
      if (prontas) receberCapa(prontas[posicao], false);
      else {
        item.classList.add('sem-capa');
        capas[posicao].then((img) => receberCapa(img, true));
      }

      linha.botao = botao;
      linha.acionar = () => {
        const onde = vivas().indexOf(linha);
        if (onde !== atual) { irPara(onde); return; }     // capa do lado: vem para o centro
        aoEscolher(linha);
      };
      botao.addEventListener('click', () => {
        // o dedo estava arrastando, ou o toque já foi atendido ao soltar o dedo (ver soltarDedo)
        if (performance.now() < semClique) return;
        linha.acionar();
      });
      trilho.append(item);
      return linha;
    });
    const vivas = () => linhas.filter((l) => !l.item.hidden);

    // ---- o trilho: onde cada capa está ----
    function medir() {
      const [primeira] = vivas();
      if (!primeira) return;
      const largura = primeira.item.offsetWidth;
      if (!largura) return;
      passo = largura + (parseFloat(getComputedStyle(trilho).columnGap) || 0);
      desenhar();
    }
    function desenhar() {
      trilho.style.transform = `translate3d(${n2(-pos.x * passo)}px,0,0)`;
      const lista = vivas();
      for (let i = 0; i < lista.length; i++) {
        // A do centro inteira; as vizinhas menores e apagadas, espiando pela borda.
        const longe = clamp(Math.abs(i - pos.x));
        const estilo = lista[i].item.style;
        estilo.transform = calmo() ? '' : `scale(${n2(1 - 0.16 * longe)})`;
        estilo.opacity = String(n2(1 - 0.66 * longe));
      }
    }
    /** O que muda quando outra capa chega ao centro: os pontos, as setas e por onde o Tab passa. */
    function marcarCentro() {
      const lista = vivas();
      lista.forEach((l, i) => {
        l.botao.tabIndex = i === atual ? 0 : -1;
        l.item.toggleAttribute('data-centro', i === atual);
        l.ponto.toggleAttribute('data-atual', i === atual);
        l.ponto.toggleAttribute('data-escolhida', l === escolhida);
      });
      setaAntes.disabled = atual <= 0;
      setaDepois.disabled = atual >= lista.length - 1;
      painel.toggleAttribute('data-unica', lista.length < 2);
    }
    function irPara(indice, { duracao } = {}) {
      const max = vivas().length - 1;
      atual = Math.round(clamp(indice, 0, Math.max(0, max)));
      marcarCentro();
      gsap.killTweensOf(pos);
      gsap.to(pos, {
        x: atual,
        duration: duracao ?? (calmo() ? 0.25 : 0.62),
        ease: calmo() ? 'none' : 'power3.out',       // chega depressa e assenta: o encaixe
        onUpdate: desenhar,
      });
    }
    const passar = (dir) => {
      const antes = atual;
      irPara(atual + dir);
      if (atual !== antes) som.efeito('toque');
      return atual !== antes;
    };
    setaAntes.addEventListener('click', () => { if (!terminado) passar(-1); });
    setaDepois.addEventListener('click', () => { if (!terminado) passar(1); });

    // ---- passar com o dedo: o trilho segue o dedo, e ao soltar encaixa na capa mais perto ----
    let arrasto = null;
    let semClique = 0;
    janela.addEventListener('pointerdown', (e) => {
      if (terminado || (e.pointerType === 'mouse' && e.button !== 0)) return;
      arrasto = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: pos.x, vale: false, x: e.clientX, t: e.timeStamp, v: 0 };
    });
    janela.addEventListener('pointermove', (e) => {
      const a = arrasto;
      if (!a || e.pointerId !== a.id || !passo) return;
      const dx = e.clientX - a.x0;
      if (!a.vale) {
        // Só vira arrasto quando o dedo anda de lado de verdade (um toque trêmulo continua toque).
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - a.y0)) return;
        a.vale = true;
        a.x0 = e.clientX;
        a.p0 = pos.x;
        gsap.killTweensOf(pos);
        try { janela.setPointerCapture(e.pointerId); } catch { /* segue sem captura */ }
        painel.toggleAttribute('data-arrastando', true);
        return;
      }
      const dt = e.timeStamp - a.t;
      if (dt > 0) {
        a.v = a.v * 0.55 + ((e.clientX - a.x) / dt) * 0.45;
        a.x = e.clientX;
        a.t = e.timeStamp;
      }
      let x = a.p0 - dx / passo;
      const max = vivas().length - 1;
      // Nas pontas (e com uma capa só) o trilho resiste, como um elástico.
      if (x < 0) x *= 0.3;
      else if (x > max) x = max + (x - max) * 0.3;
      pos.x = x;
      desenhar();
    });
    const soltarDedo = (e) => {
      const a = arrasto;
      if (!a || e.pointerId !== a.id) return;
      arrasto = null;
      if (!a.vale) {
        // Toque parado com o dedo: atende já, sem esperar o "click". Logo depois de um
        // arrasto o navegador às vezes engole o click do primeiro toque, e a capa do
        // centro parecia não responder. O click que vier em seguida é ignorado.
        if (e.type === 'pointerup' && e.pointerType === 'touch' && performance.now() >= semClique
          && Math.abs(e.clientX - a.x0) < 10 && Math.abs(e.clientY - a.y0) < 10) {
          const tocada = linhas.find((l) => l.botao && e.target instanceof Node && l.botao.contains(e.target));
          if (tocada && !tocada.item.hidden) {
            semClique = performance.now() + 700;
            tocada.acionar();
          }
        }
        return;
      }
      painel.toggleAttribute('data-arrastando', false);
      semClique = performance.now() + 320;
      // Parado há um instante, o dedo não está mais lançando: vale só a posição.
      const v = e.timeStamp - a.t > 90 ? 0 : a.v;
      const origem = Math.round(a.p0);
      // Para onde o impulso levaria; no máximo uma capa por gesto. Arrastou mais de um
      // quinto do caminho e soltou parado: também passa (não precisa chegar à metade).
      const andou = pos.x - origem;
      const lancado = Math.round(pos.x - (v * 190) / passo);
      const alvo = clamp(Math.abs(andou) > 0.2 && lancado === origem ? origem + Math.sign(andou) : lancado, origem - 1, origem + 1);
      const antes = atual;
      irPara(alvo);
      if (atual !== antes) som.efeito('toque');
    };
    janela.addEventListener('pointerup', soltarDedo);
    janela.addEventListener('pointercancel', soltarDedo);
    // No computador: a roda de lado (ou dois dedos no trackpad) passa uma capa por vez.
    let roda = 0;
    let rodaAte = 0;
    janela.addEventListener('wheel', (e) => {
      if (terminado || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const agora = performance.now();
      if (agora < rodaAte) return;
      roda += e.deltaX;
      if (Math.abs(roda) > 46) {
        passar(Math.sign(roda));
        roda = 0;
        rodaAte = agora + 480;
      }
    }, { passive: false });
    // Setas do teclado: passam a capa e o foco vai junto.
    // (Ouvidas no documento: valem mesmo com o foco solto, enquanto o carrossel existir.)
    const aoTeclar = (e) => {
      if (terminado || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey) return;
      const ativo = document.activeElement;
      if (ativo && ativo !== document.body && !painel.contains(ativo)) return;
      const naFaixa = !!ativo?.closest?.('.car-faixa');
      if (passar(e.key === 'ArrowRight' ? 1 : -1) && naFaixa) {
        try { vivas()[atual].botao.focus({ preventScroll: true }); } catch { /* segue */ }
      }
      e.preventDefault();
    };
    document.addEventListener('keydown', aoTeclar);
    limpar.push(() => document.removeEventListener('keydown', aoTeclar));
    // O foco nunca rola a janela para o lado: quem posiciona as capas é o trilho.
    const semRolar = () => { if (janela.scrollLeft) janela.scrollLeft = 0; };
    janela.addEventListener('scroll', semRolar, { passive: true });
    trilho.addEventListener('focusin', (e) => {
      const onde = vivas().findIndex((l) => l.botao === e.target);
      if (onde >= 0 && onde !== atual && !terminado) irPara(onde);
    });
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(medir);
      ro.observe(janela);
      limpar.push(() => ro.disconnect());
    }
    window.addEventListener('resize', medir, { passive: true });
    limpar.push(() => window.removeEventListener('resize', medir));
    limpar.push(() => gsap.killTweensOf(pos));

    // ---- escolher ----
    function marcar(linha) {
      const anterior = escolhida;
      escolhida = linha;
      for (const l of linhas) l.botao.setAttribute('aria-pressed', String(l === linha));
      marcarCentro();
      if (anterior && anterior !== linha) anterior.laco.apagar();
      // Trocar de faixa: o laço se desfaz na antiga e só então se refaz na nova.
      linha.laco.desenhar({ atraso: anterior && anterior !== linha && !calmo() ? 0.22 : 0.3 });

      if (continuar.disabled && !terminado) {
        continuar.disabled = false;
        // A pílula sobe na mola logo depois do laço; assentada, a setinha fica chamando o próximo
        // toque (o botão em si fica parado: é nele que o dedo, e o teste, vão tocar).
        gsap.fromTo(caixaContinuar,
          { autoAlpha: 0, y: calmo() ? 0 : 14, scale: calmo() ? 1 : 0.94 },
          {
            autoAlpha: 1, y: 0, scale: 1, duration: calmo() ? 0.4 : 0.6, delay: 0.3,
            ease: calmo() ? 'none' : 'back.out(1.6)', clearProps: 'transform', overwrite: true,
            onComplete: () => { if (!terminado && !continuar.disabled) continuar.dataset.chama = ''; },
          });
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

    // O disco gira enquanto a faixa dele toca.
    const pararDeOuvir = som.aoMudar((estado) => {
      for (const l of linhas) l.disco.giro.definir(estado.tocando && estado.indice === l.faixa.indice);
    });
    limpar.push(pararDeOuvir);

    // ---- faixa que não toca: some do carrossel, em silêncio ----
    const semFaixa = (indice) => {
      const linha = linhas.find((l) => l.faixa.indice === indice);
      if (!linha || terminado || linha.item.hidden) return;
      linha.botao.disabled = true;
      if (escolhida === linha) {
        escolhida = null;
        linha.botao.setAttribute('aria-pressed', 'false');
        linha.laco.apagar();
        continuar.disabled = true;
        delete continuar.dataset.chama;
        gsap.to(caixaContinuar, { autoAlpha: 0, duration: 0.2, ease: 'none', overwrite: true });
      }
      if (!validas().length) { encerrar(null); return; }
      gsap.to(linha.botao, {
        autoAlpha: 0, duration: 0.35, ease: 'none',
        onComplete: () => {
          if (terminado) return;
          const noCentro = vivas()[atual];
          linha.item.hidden = true;
          linha.ponto.hidden = true;
          // Quem estava no centro continua no centro (ou a vizinha, se era ela que saiu).
          const lista = vivas();
          const onde = lista.indexOf(noCentro);
          atual = onde >= 0 ? onde : Math.min(atual, lista.length - 1);
          pos.x = atual;
          gsap.killTweensOf(pos);
          marcarCentro();
          medir();
        },
      });
    };
    aoDescartar.add(semFaixa);
    limpar.push(() => aoDescartar.delete(semFaixa));

    // ---- continuar: o disco sai da capa e voa para o canto ----
    continuar.addEventListener('click', () => {
      if (terminado || !escolhida) return;
      som.efeito('toque');
      encerrar(escolhida);
    }, { once: true });

    async function encerrar(linha) {
      if (terminado) return;
      terminado = true;
      arrasto = null;
      painel.toggleAttribute('data-saindo', true);     // a brasa atrás da capa se apaga
      continuar.disabled = true;
      delete continuar.dataset.chama;
      setaAntes.disabled = true;
      setaDepois.disabled = true;
      for (const l of linhas) l.botao.disabled = true;

      const voa = linha && mini && !calmo() ? linha.disco.no : null;
      const resto = [titulo, caixaContinuar, pontos, setaAntes, setaDepois, ...linhas.flatMap((l) => (l === linha ? [l.texto] : [l.item]))];

      try {
        if (voa) {
          // Se ela confirmou olhando outra capa, a escolhida volta ao centro antes de o disco sair.
          const onde = vivas().indexOf(linha);
          if (onde >= 0 && onde !== atual) irPara(onde, { duracao: 0.45 });
          // O que não vai junto se apaga; o disco fica um instante sozinho no preto e então voa.
          gsap.to(resto, { autoAlpha: 0, duration: 0.45, ease: 'none' });
          // A capa se afasta para o outro lado e some depressa; o disco só levanta voo
          // quando ela já não está lá (a cópia que voa fica na frente de tudo, e não
          // pode parecer que o disco pulou de trás da capa para a frente dela).
          gsap.to(linha.moldura, { xPercent: -12, rotation: -3, duration: 0.6, ease: curvas.branco.entrar });
          gsap.to(linha.moldura, { autoAlpha: 0, duration: 0.34, ease: 'power1.out' });
          await espera(560);
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

    // ---- entra ----
    // Antes de qualquer coisa se mexer, o seletor inteiro já no lugar final é pintado
    // uma vez quase transparente (0,002: nada que se veja). A primeira pintura das
    // capas, dos discos e das letras (decodificar a capa, montar os gradientes, as
    // sombras, o recorte) cai aqui, parada, e não no meio da capa chegando.
    folha.textContent = '';
    titulo.textContent = dados.titulo || '';
    painel.style.opacity = '0.002';
    painel.style.pointerEvents = 'none';
    folha.append(painel);
    marcarCentro();
    medir();
    entrar().catch((erro) => {
      console.error(erro);
      painel.style.opacity = '';
      painel.style.pointerEvents = '';
    });

    async function entrar() {
      // quadro() resolve no rAF, antes da pintura: com dois, um quadro inteiro é pintado assim.
      await quadro();
      await quadro();
      gsap.set(caixaContinuar, { autoAlpha: 0 });
      painel.style.opacity = '';
      painel.style.pointerEvents = '';
      if (terminado || !painel.isConnected) return;
      medir();
      animarEntrada();
    }

    function animarEntrada() {
      // Quem digitou a senha num teclado de verdade continua nele: o foco vai para a
      // capa do centro (só se estava solto no body). No celular não: o anel de foco
      // apareceria como se a faixa já estivesse escolhida.
      const focarPrimeira = () => {
        const ativo = document.activeElement;
        if (!viaTeclado || amb?.toque || terminado || !painel.isConnected || (ativo && ativo !== document.body)) return;
        try { vivas()[atual].botao.focus({ preventScroll: true }); } catch { /* segue */ }
      };
      focarPrimeira();
      espera(700).then(focarPrimeira);
      revelarPalavras(titulo, dados.titulo || '', { intervalo: 0.12, duracao: 1.2 });

      const depois = [pontos, setaAntes, setaDepois];
      if (calmo()) {
        gsap.fromTo([palco, ...depois], { opacity: 0 }, { opacity: 1, duration: 0.8, delay: 0.3, ease: 'none', clearProps: 'opacity' });
        return;
      }
      // As capas chegam do fundo do preto; os nomes sobem um pouco depois.
      // (Só opacidade, nunca visibility: o toque e o foco já valem desde o primeiro quadro.)
      gsap.fromTo(janela, { opacity: 0, y: 30, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 1.6, delay: 0.35, ease: curvas.branco.entrar, clearProps: 'transform,opacity' });
      gsap.fromTo(linhas.map((l) => l.texto), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 1.1, delay: 1.0, ease: curvas.branco.entrar, clearProps: 'transform,opacity' });
      gsap.fromTo(depois, { opacity: 0 }, { opacity: 1, duration: 0.9, delay: 1.3, ease: 'none', clearProps: 'opacity' });
      // Com mais de uma, o trilho dá um passinho para o lado e volta: há mais capas ali.
      if (linhas.length > 1) {
        espera(2100).then(() => {
          if (terminado || arrasto || escolhida || atual !== 0 || gsap.isTweening(pos)) return;
          gsap.timeline()
            .to(pos, { x: 0.2, duration: 0.55, ease: 'power2.out', onUpdate: desenhar })
            .to(pos, { x: 0, duration: 0.9, ease: 'power3.inOut', onUpdate: desenhar });
        });
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
    alternar.append(svg(ICONE_PAUSA), svg(ICONE_TOCAR));     // os dois ficam; o CSS mostra o que vale (troca em escala e opacidade)
    const nomeAtual = el('span', 'mini-nome');
    const artistaAtual = el('span', 'mini-artista');
    const agora = el('div', 'mini-agora', [alternar, el('p', 'mini-atual', [nomeAtual, artistaAtual])]);

    // A lista só existe quando há o que trocar.
    const lista = el('ul', { class: 'mini-lista', 'aria-label': rotulos.trocar || rotulos.abrir || '' });
    const itens = todas.map((faixa, ordem) => {
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
      li.style.setProperty('--i', String(ordem));       // a fila de entrada quando o painel abre
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
    const folhaPele = document.getElementById('pergaminho');
    const vestir = () => {
      const { cena, etapa } = raiz.dataset;
      let pele = mini.dataset.pele || 'papel';
      // Relendo um capítulo pela bolsa a cena é outra: quem diz o capítulo é a folha.
      const relendo = folhaPele && folhaPele.hasAttribute('data-releitura') ? folhaPele.dataset.capitulo : '';
      if (relendo === 'poppy' || relendo === 'yourname') pele = relendo;
      else if (cena === 'poppy' || cena === 'yourname') pele = cena;
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
    if (folhaPele) new MutationObserver(vestir).observe(folhaPele, { attributes: true, attributeFilter: ['data-capitulo', 'data-releitura'] });
    vestir();

    // ---- o som manda no que o mini mostra ----
    const faixaAtual = (estado) => todas.find((f) => f.indice === estado.indice && !fora.has(f.indice)) || validas()[0] || null;
    refletir = (estado) => {
      const faixa = faixaAtual(estado);
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
