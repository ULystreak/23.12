// Boot: detecta o ambiente, monta o contexto e entrega ao diretor.
//
//   ctx = { conteudo, amb, mundo, som, musica, pergaminho, inventario, bolso, diretor, gsap }
// mais dois apoios: ctx.recursos (pré-carga e imagens) e ctx.estado (objeto livre
// para uma cena deixar algo para a seguinte, como o envelope e o fio).

import { detectarAmbiente } from './nucleo/ambiente.js';
import { configurarTempo } from './nucleo/util.js';
import { iniciarMovimento } from './nucleo/movimento.js';
import { criarDiretor } from './nucleo/diretor.js';
import { criarRecursos } from './nucleo/recursos.js';
import { criarSom } from './som.js';
import { criarMusica } from './musica.js';
import { criarPergaminho } from './pergaminho.js';
import { criarInventario } from './inventario.js';
import { criarBolso } from './cenas/bolso.js';
import { criarMundo } from './mundo/mundo.js';
import { ligarHora } from './mundo/hora.js';
import { ligarToque } from './mundo/toque.js';

// O diretor nasce primeiro: é ele que instala window.__carta (com a Promise `pronto`).
const diretor = criarDiretor();

async function iniciar() {
  const conteudo = window.CONTEUDO || {};
  const gsap = window.gsap;
  if (!gsap) throw new Error('lib/gsap.min.js não carregou');

  if (conteudo.pagina?.titulo) document.title = conteudo.pagina.titulo;

  const amb = detectarAmbiente();
  configurarTempo(amb.rapido);
  iniciarMovimento(amb);

  const recursos = criarRecursos(conteudo);
  const som = criarSom(conteudo, amb);

  // O som só existe depois do primeiro toque dela, seja onde for.
  // ?musica=N (posto pela rede de segurança lá embaixo): a faixa que estava tocando
  // antes de a página recarregar volta nesse mesmo primeiro toque.
  const faixaAnterior = amb.params.has('musica') ? Number(amb.params.get('musica')) : -1;
  // (touchend e click também: depois de recarregar num capítulo, rolar a folha com o dedo
  // não termina em pointerup, e a música voltaria só no primeiro toque parado.)
  const GESTOS = ['pointerup', 'touchend', 'click', 'keydown'];
  let destravado = false;
  const destravar = () => {
    if (destravado) return;
    destravado = true;
    for (const tipo of GESTOS) window.removeEventListener(tipo, destravar, true);
    som.destravar();
    if (Number.isInteger(faixaAnterior) && faixaAnterior >= 0) som.tocar(faixaAnterior);
    manterTelaAcesa(diretor);
  };
  for (const tipo of GESTOS) window.addEventListener(tipo, destravar, true);

  const mundo = await criarMundo({
    amb,
    canvas: document.getElementById('mundo'),
    recipienteLeve: document.getElementById('mundo-leve'),
  });
  window.__carta.gpu = mundo.gpu || null;
  ligarHora({ mundo, diretor, amb });          // a hora do dia segue as cenas (js/mundo/hora.js)

  const pergaminho = criarPergaminho({
    raiz: document.getElementById('pergaminho'),
    mundo, amb, som, conteudo, recursos,
  });
  const musica = criarMusica({
    conteudo, som, amb, recursos,
    mini: document.getElementById('mini'),
  });

  // A bolsa (o que ela guardou) e a animação da carta indo para o bolso.
  const inventario = criarInventario({
    conteudo, amb, som, recursos,
    raiz: document.getElementById('inventario'),
  });
  const bolso = criarBolso({
    conteudo, amb, som, mundo,
    raiz: document.getElementById('bolso'),
  });

  const ctx = {
    conteudo, amb, mundo, som, musica, pergaminho, inventario, bolso, diretor, gsap,
    recursos,
    estado: {},
  };

  ctx.voz = (await import('./voz.js')).criarVoz(ctx);   // a fita com a voz dele, na bolsa
  try { ctx.letra = (await import('./letra.js')).criarLetra(ctx); } catch (erro) { console.error(erro); }   // a letra no alto
  ligarToque(ctx);             // pétalas que fogem do dedo nas esperas (js/mundo/toque.js)
  vigiarContexto(ctx);
  await diretor.rodar(ctx, diretor.cenaInicial());
}

/**
 * A tela não apaga sozinha enquanto a carta anda: o iPhone escurece com 30 s sem toque,
 * e o encontro e a última folha têm trechos mais longos que isso. Chamada no primeiro
 * toque dela; o navegador solta a trava quando a aba some, então ela é pedida de novo
 * na volta (e a cada etapa, caso um pedido tenha falhado). No estado final (final:fim)
 * e no menu a carta descansa: a trava é solta e a tela volta a apagar como sempre.
 * Sem a API (Safari antes do 16.4) ou com o pedido negado (pouca bateria), nada muda.
 * E se ela largar o celular no meio da carta (10 min sem toque nem tecla, bem mais que
 * qualquer trecho que anda sozinho), a trava também é solta, para a tela não passar a
 * noite acesa; o próximo toque pede de novo.
 */
function manterTelaAcesa(diretor) {
  const api = navigator.wakeLock;
  if (!api || typeof api.request !== 'function') return;
  let largou = false;
  let espera = 0;
  const descansa = () => largou || (diretor.cena === 'final' && diretor.etapaAtual === 'fim') || diretor.cena === 'menu';
  let trava = null;
  let pedindo = false;
  const soltar = () => {
    const antiga = trava;
    trava = null;
    if (antiga) Promise.resolve(antiga.release()).catch(() => {});
  };
  const conferir = async () => {
    if (descansa()) { soltar(); return; }
    if (trava || pedindo || document.hidden) return;
    pedindo = true;
    try {
      const nova = await api.request('screen');
      nova.addEventListener('release', () => { if (trava === nova) trava = null; });
      trava = nova;
      if (descansa()) soltar();          // a carta chegou ao fim enquanto o pedido estava no ar
    } catch { /* negado: a tela apaga como antes */ } finally {
      pedindo = false;
    }
  };
  const mexeu = () => {
    largou = false;
    clearTimeout(espera);
    espera = setTimeout(() => { largou = true; soltar(); }, 600000);
    conferir();
  };
  diretor.aoMudar(conferir);
  document.addEventListener('visibilitychange', conferir);
  for (const tipo of ['pointerdown', 'keydown']) window.addEventListener(tipo, mexeu, { capture: true, passive: true });
  mexeu();
}

/** Recarrega a página na cena atual, no modo leve (sem WebGL), mantendo os outros parâmetros. */
function recarregarLeve(som) {
  const params = new URLSearchParams(location.search);
  params.set('cena', document.documentElement.dataset.cena || 'inicio');
  params.set('webgl', '0');
  if (som && som.estado.tocando && som.estado.indice >= 0) params.set('musica', String(som.estado.indice));
  else params.delete('musica');
  location.replace(`${location.pathname}?${params}`);
}

/**
 * Rede de segurança do WebGL. O navegador pode tirar o contexto (memória, placa
 * de vídeo que reinicia) e quase sempre devolve em seguida: o mundo.js cuida
 * disso. Se ele NÃO devolver em ~4 s com o mundo branco à vista, a tela ficaria
 * vazia até o fim; então a carta recarrega na mesma cena, no modo leve.
 * Enquanto ela lê um capítulo (a folha na frente) nada é recarregado: espera a
 * folha sair.
 */
function vigiarContexto({ mundo, som, pergaminho }) {
  if (!mundo.ok || !mundo.canvas) return;
  const ESPERA_MS = 4000;
  const raizFolha = document.getElementById('pergaminho');
  const folhaNaFrente = () => (pergaminho.estado ? pergaminho.estado !== 'oculto' : !!raizFolha && !raizFolha.hidden);
  let perdido = false;
  let id = 0;
  const conferir = () => {
    clearTimeout(id);
    if (!perdido) return;
    id = setTimeout(() => {
      if (!perdido) return;
      // Aba oculta ou folha na frente: ninguém está olhando para o mundo; espera mais.
      if (document.hidden || !mundo.ligado || folhaNaFrente()) { conferir(); return; }
      recarregarLeve(som);
    }, ESPERA_MS);
  };
  mundo.canvas.addEventListener('webglcontextlost', () => { perdido = true; conferir(); });
  mundo.canvas.addEventListener('webglcontextrestored', () => { perdido = false; clearTimeout(id); });
  // Ao voltar para a aba, o navegador ganha o prazo inteiro de novo para devolver o contexto.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) conferir(); });
}

iniciar().catch((erro) => {
  console.error('[carta] falha ao iniciar', erro);
  // Se o que quebrou foi o mundo 3D, a versão leve ainda pode abrir a carta (uma tentativa só).
  const params = new URLSearchParams(location.search);
  if (window.gsap && params.get('webgl') !== '0' && !window.__carta.ctx) {
    recarregarLeve(null);
    return;
  }
  window.__carta.erro = String(erro && erro.message ? erro.message : erro);   // os testes param aqui em vez de esperar
});
