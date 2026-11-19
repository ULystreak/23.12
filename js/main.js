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
  let destravado = false;
  const destravar = () => {
    if (destravado) return;
    destravado = true;
    window.removeEventListener('pointerup', destravar, true);
    window.removeEventListener('keydown', destravar, true);
    som.destravar();
    if (Number.isInteger(faixaAnterior) && faixaAnterior >= 0) som.tocar(faixaAnterior);
  };
  window.addEventListener('pointerup', destravar, true);
  window.addEventListener('keydown', destravar, true);

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
