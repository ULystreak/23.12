/* ============================================================================
   MAIN: o boot da carta
   ============================================================================
   Detecta o aparelho, liga o tempo e o movimento, cria recursos e som, arma o
   desbloqueio de áudio no primeiro gesto dela, monta o ctx com o mundo 3D
   preguiçoso, cria música, bolsa, voz e letra, decide se o mundo sobe já ou
   logo depois da primeira tela (a senha não espera o mundo 3D) e entrega tudo
   ao diretor. Três redes de segurança: a tela acesa (wake lock), o vigia de
   perda de contexto WebGL e a recarga no modo leve quando o mundo não monta.
   ========================================================================== */

import { detectarAmbiente } from './nucleo/ambiente.js';
import { configurarTempo, espera, el } from './nucleo/util.js';
import { iniciarMovimento } from './nucleo/movimento.js';
import { criarDiretor } from './nucleo/diretor.js';
import { criarRecursos } from './nucleo/recursos.js';
import { criarSom } from './som.js';
import { criarMusica } from './musica.js';
import { criarPergaminho } from './pergaminho.js';
import { criarInventario } from './inventario.js';
import { criarBolso } from './cenas/bolso.js';
import { ligarHora } from './mundo/hora.js';
import { ligarToque } from './mundo/toque.js';

const diretor = criarDiretor();
let jaFalhou = false;

// O som só existe depois do primeiro toque dela, em qualquer lugar. Rolar a
// folha com o dedo não termina em pointerup, e a música voltaria só no primeiro
// toque parado: por isso quatro gestos.
const GESTOS = ['pointerup', 'touchend', 'click', 'keydown'];

async function iniciar() {
  const conteudo = window.CONTEUDO || {};
  const gsap = window.gsap;
  if (!gsap) throw new Error('GSAP não carregou');
  if (conteudo.pagina?.titulo) document.title = conteudo.pagina.titulo;

  const amb = detectarAmbiente();

  // Lenis só com mouse: no iPhone nunca ligava e custava 19 KB e dois pedidos.
  if (!amb.toque && !amb.reduzido) {
    document.head.append(el('link', { rel: 'stylesheet', href: 'lib/lenis.css' }));
    document.head.append(el('script', { src: 'lib/lenis.min.js' }));
  }

  configurarTempo(amb.rapido);
  iniciarMovimento(amb);

  const recursos = criarRecursos(conteudo);
  const som = criarSom(conteudo, amb);

  const faixaAnterior = amb.params.has('musica') ? Number(amb.params.get('musica')) : -1;
  const destravar = () => {
    for (const g of GESTOS) window.removeEventListener(g, destravar, true);
    som.destravar();
    if (Number.isInteger(faixaAnterior) && faixaAnterior >= 0) som.tocar(faixaAnterior);
    manterTelaAcesa(diretor);
  };
  for (const g of GESTOS) window.addEventListener(g, destravar, true);

  const naEntrada = ['senha', 'musica'].includes(diretor.cenaInicial());

  const ctx = {
    conteudo, amb, mundo: null, som, musica: null, pergaminho: null,
    inventario: null, bolso: null, diretor, gsap, recursos, estado: {},
  };

  let montando = null;
  const montarMundo = () => {
    montando ||= import('./mundo/mundo.js')
      .then((m) => new Promise((resolve) => setTimeout(() => resolve(m), 0)))
      .then(({ criarMundo }) => criarMundo({
        amb,
        canvas: document.getElementById('mundo'),
        recipienteLeve: document.getElementById('mundo-leve'),
      }))
      .then((mundo) => {
        if (naEntrada) mundo.desligar();
        window.__carta.gpu = mundo.gpu || null;
        ligarHora({ mundo, diretor, amb });
        ctx.mundo = mundo;
        ctx.pergaminho = criarPergaminho({ raiz: document.getElementById('pergaminho'), mundo, amb, som, conteudo, recursos });
        ctx.bolso = criarBolso({ conteudo, amb, som, mundo, raiz: document.getElementById('bolso') });
        ligarToque(ctx);
        vigiarContexto(ctx);
        return mundo;
      });
    return montando;
  };

  // Em caso de falha a promessa nunca resolve: a página vai recarregar no modo leve.
  ctx.mundoPronto = () => montarMundo().catch((erro) => {
    falhou(erro);
    return new Promise(() => {});
  });

  ctx.musica = criarMusica({ conteudo, som, amb, recursos, mini: document.getElementById('mini') });
  ctx.inventario = criarInventario({ conteudo, amb, som, recursos, raiz: document.getElementById('inventario') });
  ctx.voz = (await import('./voz.js')).criarVoz(ctx);
  try {
    ctx.letra = (await import('./letra.js')).criarLetra(ctx);
  } catch (erro) {
    console.error('[carta] a letra não ligou', erro);
  }

  if (!naEntrada) {
    await montarMundo();
  } else {
    // A tela preta já pinta. O mundo 3D é baixado depois da primeira etapa
    // publicada e montado atrás do preto.
    let baixou = false;
    const montarNaHora = () => {
      if (diretor.etapaAtual !== 'senha-certa') {
        ctx.mundoPronto();
        return;
      }
      // Rede lenta: a senha já foi aceita; espera o preto entre a senha e a música.
      const parar = diretor.aoMudar(() => {
        parar();
        ctx.mundoPronto();
      });
    };
    const baixar = () => {
      if (baixou) return;
      baixou = true;
      Promise.all([
        import('./mundo/mundo.js').catch(() => {}),
        import('../lib/three.module.min.js').catch(() => {}),
        espera(1600),
      ]).then(montarNaHora);
    };
    const parar = diretor.aoMudar(() => {
      parar();
      requestAnimationFrame(() => setTimeout(baixar, 0));
    });
    setTimeout(baixar, 3000);
  }

  await diretor.rodar(ctx, diretor.cenaInicial());
}

/* ---- redes de segurança ------------------------------------------------------ */

// A tela fica acesa enquanto ela lê. Solta no menu, em final:fim e depois de
// 10 minutos sem toque nem tecla (ela pode largar o celular no meio da carta).
function manterTelaAcesa(diretor) {
  if (!navigator.wakeLock) return;
  let trava = null;
  let pedindo = false;
  let largou = false;
  let timer = 0;

  const descansa = () => largou
    || (diretor.cena === 'final' && diretor.etapaAtual === 'fim')
    || diretor.cena === 'menu';

  const soltar = () => {
    const t = trava;
    trava = null;
    t?.release?.().catch(() => {});
  };

  const conferir = async () => {
    if (descansa()) {
      soltar();
      return;
    }
    if (trava || pedindo || document.hidden) return;
    pedindo = true;
    try {
      trava = await navigator.wakeLock.request('screen');
      trava.addEventListener('release', () => { trava = null; });
      if (descansa()) soltar();
    } catch {
      /* o navegador negou; a tela apaga como de costume */
    } finally {
      pedindo = false;
    }
  };

  const mexeu = () => {
    largou = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      largou = true;
      conferir();
    }, 600000);
    conferir();
  };

  window.addEventListener('pointerdown', mexeu, { capture: true, passive: true });
  window.addEventListener('keydown', mexeu, { capture: true, passive: true });
  diretor.aoMudar(conferir);
  document.addEventListener('visibilitychange', conferir);
  mexeu();
}

// Recarrega a página na cena atual, sem WebGL, levando a música que tocava.
function recarregarLeve(som) {
  const params = new URLSearchParams(location.search);
  params.set('cena', document.documentElement.dataset.cena || 'inicio');
  params.set('webgl', '0');
  const indice = som?.estado?.indice;
  if (som?.estado?.tocando && Number.isInteger(indice) && indice >= 0) params.set('musica', String(indice));
  else params.delete('musica');
  location.replace(`${location.pathname}?${params}`);
}

// Se o navegador não devolve o contexto WebGL em ~4 s, a tela ficaria vazia até
// o fim. A recarga espera a folha sair e a aba voltar.
function vigiarContexto({ mundo, som, pergaminho }) {
  if (!mundo?.ok || !mundo.canvas) return;
  const ESPERA_MS = 4000;
  let perdido = false;
  let timer = 0;

  const folhaNaFrente = () => {
    if (pergaminho && 'estado' in pergaminho) return pergaminho.estado !== 'oculto';
    const p = document.getElementById('pergaminho');
    return !!p && !p.hidden;
  };

  const conferir = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!perdido) return;
      if (document.hidden || !mundo.ligado || folhaNaFrente()) {
        conferir();
        return;
      }
      recarregarLeve(som);
    }, ESPERA_MS);
  };

  mundo.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault?.();
    perdido = true;
    conferir();
  });
  mundo.canvas.addEventListener('webglcontextrestored', () => {
    perdido = false;
    clearTimeout(timer);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && perdido) conferir();
  });
}

function falhou(erro) {
  if (jaFalhou) return;
  jaFalhou = true;
  console.error('[carta] o mundo não montou', erro);
  if (new URLSearchParams(location.search).get('webgl') !== '0') {
    recarregarLeve(null);
    return;
  }
  window.__carta.erro = String(erro?.message || erro);
}

iniciar().catch((erro) => {
  console.error('[carta] falha ao iniciar', erro);
  const semWebgl = new URLSearchParams(location.search).get('webgl') === '0';
  if (window.gsap && !semWebgl && !window.__carta.ctx) {
    recarregarLeve(null);
    return;
  }
  window.__carta.erro = String(erro?.message || erro);
});
