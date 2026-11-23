/* ============================================================================
   FINAL: a última carta, da mão dele até a folha escrita
   ============================================================================
   Quatro momentos. 1) A carta chega: ele está de frente, de mão estendida, com
   a carta (entregaNaMao, chamada pelo encontro sob o clarão, ou aqui mesmo na
   entrada direta), e ela voa da mão dele até ela. 2) A carta abre e o papel
   vira a folha de js/mundo/folha.js, que desdobra e recebe a frase, letra por
   letra; depois o fio repousa no canto. 3) O contador e a resposta dela
   (js/cenas/resposta.js). 4) O estado final, sem "fim" escrito; com o bloco
   menu, a pílula leva à cena menu.

   Sem WebGL: ele é a figura pintada .ele-leve, parada atrás da carta, e o fio
   do caminho é um traço SVG (criarFioLeve). ?frase= troca a frase (só teste).

   Etapas daqui: carta-chegando, desdobrando, escrevendo, contador, resposta e
   fim. carta-espera e carta-abrindo são de js/cenas/carta.js.
   ========================================================================== */

import { espera, compilarComPrazo, clamp, lerp, el, svg } from '../nucleo/util.js';
import { curvas, comoPromise, revelarPalavras, ocultarPalavras } from '../nucleo/movimento.js';
import { temMenu } from '../nucleo/diretor.js';
import { cenaCarta, poseParada } from './carta.js';
import { criarDepois } from './resposta.js';
import { criarFio } from '../mundo/fio.js';
import { criarFolha } from '../mundo/folha.js';
import { criarEle, pintarEleEntrega } from '../mundo/ele.js';
import { criarEnvelope } from '../mundo/envelope.js';

const ALTURA_OLHOS = 1.5; // m (contrato 4.3, o mesmo de folha.js)
// Ele de frente, a 2,25 m e um nada à esquerda: a mão estendida cai no meio da tela.
const ELE_PERTO = 2.25;
const ELE_LADO = -0.05;
// A carta na mão dele fica baixa (o `baixar` de carta.js): o rosto dele fica livre.
const NA_MAO = 0.45;
const ARCO = 0.05; // m, no meio do voo
const DISTANCIA_PADRAO = 4; // m, quando mao.js não deixou estado.distanciaFinal
const DISTANCIA_FRIO = 5;
const LARGURA_CAMINHO = 0.014; // m
// A ponta do laço desce 1,3 cm além da borda de baixo da carta (16 cm de altura):
// é por ali que o fio do caminho chega.
const PONTA_DO_LACO = 0.093;
const TRACO_MIN = 2; // px, o traço do caminho sem WebGL
const TRACO_MAX = 3.2;

/**
 * Põe ele de frente para ela com a carta na mão e marca estado.entrega.
 * Feita uma vez, devolve true sem refazer. Devolve false, sem mudar nada, sem
 * WebGL, sem carta ou com a carta já aberta, com mao.ele === false ou se algo falha.
 */
export function entregaNaMao(ctx) {
  const { mundo, estado, conteudo } = ctx;
  const env = estado?.envelope;
  if (!mundo?.ok || !env || env.aberto || env.descartado || conteudo?.mao?.ele === false) return false;
  if (estado.entrega) return true;

  let novo = null;
  try {
    if (!estado.ele) novo = criarEle(mundo);
    const ele = estado.ele || novo;
    if (!ele?.entregar()) {
      novo?.dispose();
      return false;
    }
    if (novo) mundo.cena.add(novo.grupo);
    const rig = mundo.rig.position;
    ele.grupo.position.set(rig.x + ELE_LADO, 0, rig.z - ELE_PERTO);
    ele.grupo.rotation.set(0, 0, 0);
    ele.mostrar(0);
    // A carta pousa logo acima da palma, um pouco puxada na direção dos olhos dela.
    ele.ancoraCarta(new mundo.THREE.Vector3(rig.x, ALTURA_OLHOS, rig.z), env.grupo.position);
    env.grupo.visible = true;
    if (!env.grupo.parent) mundo.cena.add(env.grupo);
    estado.ele = ele;
    estado.cartaEscondida = false;
    // O fio do caminho larga o dedinho dele e volta para o laço da carta.
    estado.seguidorFio?.ancorar?.(null);
    estado.entrega = true;
    return true;
  } catch (erro) {
    console.error('[carta] a entrega na mão', erro);
    novo?.dispose();
    return false;
  }
}

export async function cenaFinal(ctx, { frio = false } = {}) {
  const { conteudo, amb, mundo, som, musica, diretor, estado } = ctx;
  const gsap = ctx.gsap || window.gsap;
  const calmo = !!amb.reduzido;
  const frase = amb.params?.get('frase') || conteudo.final?.frase || '';
  const semEle = conteudo.mao?.ele === false;

  let distancia = estado.distanciaFinal ?? DISTANCIA_PADRAO;
  if (frio) {
    musica?.mostrarMini?.();
    mundo.petalas?.definirDensidade?.(1);
    distancia = DISTANCIA_FRIO;
  }

  // Entrada direta: a carta nasce aqui, já na mão dele.
  if (mundo.ok && !estado.entrega && !estado.envelope && !semEle) {
    const env = criarEnvelope(mundo, { lacre: null, amarracao: 'fio', chegada: false });
    Promise.resolve(env.preparar?.()).catch(() => {});
    mundo.cena.add(env.grupo);
    estado.envelope = env;
    if (!entregaNaMao(ctx)) {
      estado.envelope = null;
      env.dispose?.();
    }
  }

  if (estado.entrega) distancia = 0;
  if (mundo.ok && estado.entrega && estado.envelope) {
    diretor.etapa('carta-chegando');
    await voarAteEla(ctx, estado.envelope);
  }

  let fioLeve = null;
  let caminho = null;
  if (!mundo.ok) {
    if (!semEle) mostrarEleLeve(ctx);
    // Com o fio da mão ainda vivo (o caminho normal), um segundo traço dobraria o vermelho.
    if (!estado.fio) fioLeve = criarFioLeve(ctx);
  } else if (!estado.entrega && !estado.fio && distancia >= 1) {
    caminho = criarFioDoCaminho(mundo, distancia);
    estado.fio = caminho?.fio || null;
  }

  // A folha nasce invisível e compõe a frase antes de a carta abrir: nada engasga no toque.
  let folha = null;
  try {
    folha = criarFolha(mundo);
  } catch (erro) {
    console.error('[carta] a folha final não montou', erro);
  }
  const pronta = folha
    ? Promise.resolve()
      .then(() => folha.preparar(frase))
      .then(() => compilarComPrazo(mundo, folha.grupo))
      .catch((erro) => console.error('[carta] preparar a folha final', erro))
    : Promise.resolve();

  // Carta parada: o fio da entrada direta prende no laço de verdade. Carta abrindo:
  // a faísca sai do laço (só no 3D).
  let pararSeguir = null;
  const pararEtapas = diretor.aoMudar((cena, etapa) => {
    if (cena !== 'final' || !mundo.ok) return;
    if (etapa === 'carta-espera' && caminho && !pararSeguir) {
      pararSeguir = mundo.aoQuadro(() => caminho.prender(estado.envelope?.ancoraFio));
    }
    if (etapa === 'carta-abrindo') estado.fio?.faiscar?.(estado.envelope?.ancoraFio, 44);
  });
  let carta;
  try {
    carta = await cenaCarta(ctx, {
      lacre: null,
      amarracao: 'fio',
      distancia,
      entregar: false,
      anunciarCaminhada: false,
      baixar: estado.entrega ? NA_MAO : undefined,
      chacoalhar: conteudo.final?.dicaChacoalhar || '',
    });
  } finally {
    pararEtapas();
    pararSeguir?.();
    if (!carta) fioLeve?.soltar(); // a cena quebrou: o traço não fica órfão na tela
  }
  const { env, papel, parar } = carta;

  /* ---- desdobrar ------------------------------------------------------------ */
  diretor.etapa('desdobrando');
  som?.efeito?.('papel');
  // A folha final não tem botão nenhum: o mini sai de cena (a música continua).
  musica?.esconderMini?.();
  // assumir antes do quadro: é ela que esconde o papel da carta (papel pode ser nulo).
  folha?.assumir(papel);
  const pararFolha = folha ? mundo.aoQuadro((dt, t) => folha.atualizar(dt, t)) : null;

  estado.envelope = null;
  espera(calmo ? 0 : 420)
    .then(() => env.irEmbora?.())
    .catch((erro) => console.error('[carta] a carta indo embora', erro))
    .finally(() => {
      parar?.();
      env.dispose?.();
    });

  // O fio do caminho se solta com o laço e some. estado.fio fica zerado: o
  // seguidor de mao.js larga o fio e o menu não acha nada para descartar.
  const fio = estado.fio;
  estado.fio = null;
  if (fio) soltarFio(gsap, fio, calmo);
  fioLeve?.soltar();

  await Promise.all([folha?.desdobrar(), pronta]);

  /* ---- escrever ------------------------------------------------------------- */
  diretor.etapa('escrevendo');
  // Daqui em diante a cena fica quase parada: a frase ganha a resolução cheia da tela.
  if (amb.nivel !== 'baixo') mundo.nitidezMaxima?.(true);
  await espera(calmo ? 200 : 450); // a mão pousa no papel
  let reserva = null;
  if (folha) {
    let letras = 0;
    // A caneta raspa o papel abaixo da música; uma em cada duas letras basta.
    await folha.escrever(frase, {
      aoTraco: () => {
        if (letras++ % 2 === 0) som?.efeito?.('caneta');
      },
    });
    // Quando a frase termina, o fio volta e repousa (4,4 s; 1,6 s no reduzido).
    // O prazo só garante que as pétalas e o contador nunca fiquem presos.
    await espera(calmo ? 400 : 1600);
    await Promise.race([folha.repousarFio(), espera(calmo ? 3000 : 6500)]);
    estado.folha = folha;
    estado.pararFolha = pararFolha;
    folha.viver();
  } else if (frase) {
    // Sem a folha, a frase não se perde: entra no alto, palavra por palavra.
    reserva = el('p', 'frase');
    document.getElementById('frases')?.append(reserva);
    await revelarPalavras(reserva, frase);
  }

  /* ---- contador, resposta e o estado final ------------------------------------ */
  const depois = criarDepois(ctx);
  estado.depois = depois; // o menu reaproveita o contador
  if (depois.temContador) {
    await espera(calmo ? 300 : 1400);
    diretor.etapa('contador');
    await depois.contar();
  }
  if (depois.temResposta) {
    diretor.etapa('resposta');
    await depois.escrever();
  }

  diretor.etapa('fim');
  depois.repousar();
  // A folha recua e deixa livres o contador no alto e a pena embaixo.
  if (depois.temContador || depois.temResposta) folha?.recuar();
  musica?.mostrarMini?.();

  if (!temMenu(conteudo)) await new Promise(() => {}); // sem menu, a cena fica com as pétalas
  await depois.seguir;
  if (reserva) ocultarPalavras(reserva).then(() => reserva.remove());
}

/* ---- a carta sai da mão dele ------------------------------------------------- */

async function voarAteEla(ctx, env) {
  const { mundo, som, amb } = ctx;
  const gsap = ctx.gsap || window.gsap;
  const calmo = !!amb.reduzido;
  const parar = mundo.aoQuadro((dt, t) => env.atualizar?.(dt, t));
  try {
    await espera(calmo ? 500 : 1300); // ela vê ele de mão estendida
    const de = env.grupo.position.clone();
    const para = poseParada(mundo, NA_MAO);
    // Sem arco no reduzido: a carta só vem, sem balanço.
    const arco = calmo ? 0 : ARCO;
    const voo = { k: 0 };
    som?.efeito?.('papel');
    await comoPromise(gsap.to(voo, {
      k: 1,
      duration: calmo ? 1.2 : 2.6,
      ease: 'power2.inOut',
      onUpdate: () => env.grupo.position.set(
        lerp(de.x, para.x, voo.k),
        lerp(de.y, para.y, voo.k) + Math.sin(voo.k * Math.PI) * arco,
        lerp(de.z, para.z, voo.k),
      ),
    }));
  } finally {
    parar();
  }
}

/* ---- o fio do caminho (3D) ----------------------------------------------------- */

// Entrada direta sem ele: sete pontos. O fio nasce no chão à direita, corre ao
// lado do caminho, sobe pela direita (a subida cai em diagonal, longe da dica)
// e termina na ponta do laço, onde a carta vai parar. Aparece pronto.
function criarFioDoCaminho(mundo, distancia) {
  try {
    const { x: x0, z: z0 } = mundo.rig.position;
    const carta = poseParada(mundo, undefined, z0 - distancia);
    const yPonta = carta.y - PONTA_DO_LACO;
    const pontos = [
      [x0 + 0.35, 0.02, z0 - 0.6],
      [x0 + 0.9, 0.02, z0 - 0.4 * distancia],
      [x0 + 0.8, 0.03, carta.z + 0.9],
      [x0 + 0.55, 0.36, carta.z + 0.45],
      [x0 + 0.3, 0.86, carta.z + 0.2],
      [x0 + 0.1, yPonta - 0.12, carta.z + 0.05],
      [carta.x, yPonta, carta.z],
    ].map(([x, y, z]) => ({ x, y, z }));
    const fio = criarFio(mundo, { curva: pontos, largura: LARGURA_CAMINHO });
    mundo.cena.add(fio.objeto);
    fio.progresso(1);
    return {
      fio,
      // Com a carta parada, a última ponta acompanha o laço (a carta flutua).
      prender(ponta) {
        if (!Number.isFinite(ponta?.x)) return;
        const fim = pontos[6];
        if (fim.x === ponta.x && fim.y === ponta.y && fim.z === ponta.z) return;
        pontos[6] = { x: ponta.x, y: ponta.y, z: ponta.z };
        fio.definirCurva(pontos);
      },
    };
  } catch (erro) {
    console.error('[carta] o fio do caminho', erro);
    return null;
  }
}

// O fio recolhe até a ponta de onde veio e é descartado (3D ou SVG: mesma API).
function soltarFio(gsap, fio, calmo) {
  const atual = fio.progresso?.();
  const p = { v: Number.isFinite(atual) ? atual : 1 };
  gsap.to(p, {
    v: 0,
    duration: calmo ? 1.2 : 2.6,
    ease: calmo ? 'none' : 'power2.in',
    onUpdate: () => fio.progresso?.(p.v),
    onComplete: () => fio.dispose?.(),
  });
}

/* ---- sem WebGL ------------------------------------------------------------------ */

// A pose de entrega pintada, parada atrás da carta (o estilo está em css/resposta.css).
function mostrarEleLeve(ctx) {
  const { mundo, amb } = ctx;
  const gsap = ctx.gsap || window.gsap;
  const recipiente = mundo.recipienteLeve;
  if (!recipiente || recipiente.querySelector('.ele-leve')) return;
  const figura = pintarEleEntrega();
  if (!figura) return;
  figura.className = 'ele-leve';
  figura.setAttribute('aria-hidden', 'true');
  recipiente.prepend(figura);
  gsap.fromTo(figura, { opacity: 0 }, { opacity: 1, duration: amb.reduzido ? 0.8 : 1.8, ease: curvas.branco.deriva });
}

// O traço do caminho sem WebGL: a cada quadro, da ponta do laço (env.ancoraFio,
// em px de tela) até além da borda de baixo, à direita. Sai da ponta para o
// lado de fora e só então desce.
function criarFioLeve(ctx) {
  const { mundo, amb, estado } = ctx;
  const gsap = ctx.gsap || window.gsap;
  const recipiente = mundo.recipienteLeve;
  if (!recipiente) return null;
  const duracao = amb.reduzido ? 0.8 : 1.6;
  const traco = svg('<svg class="fio-leve-caminho" aria-hidden="true" focusable="false"><path fill="none" stroke="#d7192d" stroke-linecap="round"/></svg>');
  const caminho = traco.firstElementChild;
  // No início de #mundo-leve, atrás da figura dele: onde cruza o corpo, a mão ou o
  // rosto, o fio passa por trás e nunca encosta neles.
  recipiente.prepend(traco);

  let ultimo = '';
  const n = (v) => v.toFixed(1);
  const desenhar = () => {
    const env = estado.envelope;
    // Carta ainda fora da tela (antes de chegar): a ponta mediria (0, 0).
    if (!env?.caixaTela?.()?.width) return;
    const ponta = env.ancoraFio;
    const x = ponta?.px;
    const y = ponta?.py;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const w = innerWidth;
    const h = innerHeight;
    const fx = 0.8 * w;
    const fy = h + 24;
    const largura = clamp(w / 150, TRACO_MIN, TRACO_MAX).toFixed(2);
    const d = `M${n(x)} ${n(y)}C${n(x + (fx - x) * 0.45)} ${n(y + (fy - y) * 0.08)} ${n(fx - (fx - x) * 0.1)} ${n(fy - (fy - y) * 0.5)} ${n(fx)} ${n(fy)}`;
    if (d + largura === ultimo) return;
    ultimo = d + largura;
    caminho.setAttribute('d', d);
    caminho.setAttribute('stroke-width', largura);
  };
  desenhar();
  const pararQuadro = mundo.aoQuadro(desenhar);
  gsap.fromTo(traco, { opacity: 0 }, { opacity: 1, duration: duracao, ease: curvas.branco.deriva });

  return {
    soltar() {
      pararQuadro?.();
      gsap.killTweensOf(traco);
      gsap.to(traco, { opacity: 0, duration: duracao, ease: curvas.branco.sair, onComplete: () => traco.remove() });
    },
  };
}
