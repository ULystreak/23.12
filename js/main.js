// Boot: detecta o ambiente, monta o contexto e entrega ao diretor.
//
//   ctx = { conteudo, amb, mundo, som, musica, pergaminho, inventario, bolso, diretor, gsap }
// (na tela preta do começo, mundo, pergaminho e bolso chegam um pouco depois: ctx.mundoPronto())
// mais dois apoios: ctx.recursos (pré-carga e imagens) e ctx.estado (objeto livre
// para uma cena deixar algo para a seguinte, como o envelope e o fio).

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

// O diretor nasce primeiro: é ele que instala window.__carta (com a Promise `pronto`).
const diretor = criarDiretor();

async function iniciar() {
  const conteudo = window.CONTEUDO || {};
  const gsap = window.gsap;
  if (!gsap) throw new Error('lib/gsap.min.js não carregou');

  if (conteudo.pagina?.titulo) document.title = conteudo.pagina.titulo;

  const amb = detectarAmbiente();
  // O Lenis só liga com mouse (pergaminho.js); no toque nem é baixado. Chega durante a
  // senha e a música, bem antes do primeiro capítulo (sem ele, a rolagem é a nativa).
  if (!amb.toque && !amb.reduzido) {
    document.head.append(el('link', { rel: 'stylesheet', href: 'lib/lenis.css' }), el('script', { src: 'lib/lenis.min.js' }));
  }
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

  // O mundo 3D (o Three.js e a alameda, uns 270 kB) só aparece quando o preto se desfaz,
  // depois da música. Na tela preta (a senha ou a música) a carta não espera por ele: a
  // senha aparece primeiro, e o mundo baixa e se monta atrás do preto enquanto ela digita
  // (cenas.musica espera ctx.mundoPronto() antes de o preto se desfazer). Pelos atalhos
  // (?cena= de "inicio" em diante) ele é esperado antes, como sempre foi.
  const naEntrada = ['senha', 'musica'].includes(diretor.cenaInicial());
  const ctx = {
    conteudo, amb, mundo: null, som, musica: null, pergaminho: null, inventario: null, bolso: null, diretor, gsap,
    recursos,
    estado: {},
  };
  let montando = null;
  const montarMundo = () => {
    montando ||= import('./mundo/mundo.js')
      // (uma tarefa própria: não soma com o que a cena estiver montando neste instante)
      .then((modulo) => new Promise((ok) => setTimeout(() => ok(modulo), 0)))
      .then(({ criarMundo }) => criarMundo({
        amb,
        canvas: document.getElementById('mundo'),
        recipienteLeve: document.getElementById('mundo-leve'),
      }))
      .then((mundo) => {
        // Atrás do preto ninguém vê o mundo: ele só é ligado quando o preto se desfaz.
        if (naEntrada) mundo.desligar();
        window.__carta.gpu = mundo.gpu || null;
        ligarHora({ mundo, diretor, amb });          // a hora do dia segue as cenas (js/mundo/hora.js)
        ctx.mundo = mundo;
        ctx.pergaminho = criarPergaminho({
          raiz: document.getElementById('pergaminho'),
          mundo, amb, som, conteudo, recursos,
        });
        // A animação da carta indo para o bolso.
        ctx.bolso = criarBolso({
          conteudo, amb, som, mundo,
          raiz: document.getElementById('bolso'),
        });
        ligarToque(ctx);             // pétalas que fogem do dedo nas esperas (js/mundo/toque.js)
        vigiarContexto(ctx);
        return mundo;
      });
    return montando;
  };
  // Resolve com o mundo. Se a montagem falhar, a página recarrega no modo leve (falhou)
  // e esta espera não volta mais.
  ctx.mundoPronto = () => montarMundo().catch((erro) => { falhou(erro); return new Promise(() => {}); });

  ctx.musica = criarMusica({
    conteudo, som, amb, recursos,
    mini: document.getElementById('mini'),
  });
  // A bolsa (o que ela guardou).
  ctx.inventario = criarInventario({
    conteudo, amb, som, recursos,
    raiz: document.getElementById('inventario'),
  });

  ctx.voz = (await import('./voz.js')).criarVoz(ctx);   // a fita com a voz dele, na bolsa
  try { ctx.letra = (await import('./letra.js')).criarLetra(ctx); } catch (erro) { console.error(erro); }   // a letra no alto

  if (!naEntrada) {
    await montarMundo();
  } else {
    // O mundo começa a baixar logo depois de a primeira tela ser pintada (as fontes dela já
    // pedidas), para não disputar a rede com ela. A montagem é um trabalho de uns 0,3 s em
    // CPU lenta: ela espera a senha terminar de aparecer (0,25 + 1,2 s de fade) e cai num
    // momento parado, com ela no campo. Se o mundo só chegar depois do acerto (rede fraca),
    // a montagem não prende o fio correndo: espera o preto entre a senha e a música (a
    // etapa seguinte), antes de as capas começarem a entrar.
    let comecou = false;
    const montarNaHora = () => {
      if (diretor.etapaAtual !== 'senha-certa') { ctx.mundoPronto(); return; }
      const parar = diretor.aoMudar(() => { parar(); ctx.mundoPronto(); });
    };
    const baixar = () => {
      if (comecou) return;
      comecou = true;
      Promise.all([
        import('./mundo/mundo.js').catch(() => {}),
        import('../lib/three.module.min.js').catch(() => {}),   // (sem ele, criarMundo cai no leve)
        espera(1600),
      ]).then(montarNaHora);
    };
    const parar = diretor.aoMudar(() => {
      parar();
      requestAnimationFrame(() => setTimeout(baixar, 0));
    });
    setTimeout(baixar, 3000);      // (rede de segurança: sem etapa nenhuma, começa assim mesmo)
  }
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

/** O mundo não montou com a carta já andando: a mesma saída do boot (modo leve, uma vez só). */
let jaFalhou = false;
function falhou(erro) {
  if (jaFalhou) return;
  jaFalhou = true;
  console.error('[carta] o mundo não montou', erro);
  if (new URLSearchParams(location.search).get('webgl') !== '0') { recarregarLeve(null); return; }
  window.__carta.erro = String(erro && erro.message ? erro.message : erro);
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
