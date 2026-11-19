// Final: a última carta está na mão dele. Depois do abraço ele está de frente
// para ela, de mão estendida; a carta (amarrada só com o fio) sai da mão dele e
// vem até ela. A folha em branco desdobra e a frase é escrita à mão, letra por
// letra. Depois: o número da senha volta e conta os dias dela (contador), a folha
// em que ela escreve de volta (resposta) e o estado final, calmo: a noite, a
// música, a bolsa. Sem "fim" escrito.
//
//   cenaFinal(ctx, { frio }) → Promise que nunca resolve
//   entregaNaMao(ctx) → boolean   põe ele perto, de frente, com a carta na mão
//                                  (o encontro chama debaixo do clarão)
//
// Etapas: carta-chegando → carta-espera → carta-abrindo → desdobrando → escrevendo
//         → contador → resposta → fim
// (contador não existe sem contador.nascimento; resposta não existe sem a seção resposta)
//
// Sem WebGL ele é a mesma figura pintada, parada atrás da carta (.ele-leve).
//
// O papel que sai da carta é trocado, na mesma pose, pela folha de criarFolha()
// (js/mundo/folha.js), que vem até a frente dela e desdobra. O fio que a trouxe
// até aqui se solta com o laço e some; quando a frase termina, ele volta e
// repousa, solto, sobre o canto de baixo da folha.
//
// Parâmetro só de teste: ?frase=… troca a frase (para ver uma longa e uma curta).

import { espera } from '../nucleo/util.js';
import { cenaCarta, poseParada } from './carta.js';
import { criarFio } from '../mundo/fio.js';
import { criarFolha } from '../mundo/folha.js';
import { criarEle, pintarEleEntrega } from '../mundo/ele.js';
import { criarEnvelope } from '../mundo/envelope.js';
import { criarDepois } from './resposta.js';

const ALTURA_OLHOS = 1.5;
const PARADA = 1.25;               // a carta para a esta distância dela (igual a carta.js)
const ELE_PERTO = 2.25;            // na entrega ele fica a esta distância dela (m)
const ELE_LADO = -0.05;            // e um nada para a esquerda: a mão estendida cai no meio da tela
const NA_MAO = 0.45;               // na entrega a carta para na altura da mão dele (o `baixar` de carta.js): o rosto fica livre

/**
 * A entrega: ele vem para perto, de frente, e a última carta (que a cena da mão
 * deixou escondida) aparece pousada na mão estendida dele. Chamado debaixo do
 * clarão do encontro (ou pela cena final, quando se entra direto nela).
 * Devolve false se não houver ele, carta ou WebGL (a carta chega do jeito antigo).
 */
export function entregaNaMao(ctx) {
  const { mundo, estado, conteudo } = ctx;
  const env = estado.envelope;
  if (estado.entrega) return true;
  if (!mundo.ok || !env || !env.grupo || env.aberto || conteudo.mao?.ele === false) return false;
  // Entrou por atalho depois da corrida: ele ainda não existe. Nasce aqui, já de frente.
  let ele = estado.ele;
  if (!ele) {
    try { ele = criarEle(mundo); } catch (erro) { console.error(erro); ele = null; }
    if (ele) { mundo.cena.add(ele.grupo); estado.ele = ele; }
  }
  if (!ele || typeof ele.entregar !== 'function') return false;
  try {
    if (!ele.entregar()) return false;
    const { THREE } = mundo;
    const rig = mundo.rig.position;
    ele.grupo.position.set(rig.x + ELE_LADO, 0, rig.z - ELE_PERTO);
    ele.mostrar(0);
    env.grupo.position.copy(ele.ancoraCarta(new THREE.Vector3(rig.x, ALTURA_OLHOS, rig.z)));
    env.grupo.visible = true;
    estado.cartaEscondida = false;
    // o fio, que subia até a mão dele, volta a terminar no laço da carta (que está na mão dele)
    estado.seguidorFio?.ancorar?.(null);
    estado.entrega = true;
    return true;
  } catch (erro) {
    console.error('[carta] a entrega falhou', erro);
    return false;
  }
}

export async function cenaFinal(ctx, { frio } = {}) {
  const { conteudo, diretor, mundo, som, musica, estado, amb } = ctx;
  const gsap = window.gsap;
  const frase = (amb.params && amb.params.get('frase')) || conteudo.final?.frase || '';

  let distancia = estado.distanciaFinal ?? 4;
  if (frio) {
    musica.mostrarMini();
    mundo.petalas.definirDensidade(1);
    distancia = 5;
  }
  // Entrou por atalho (aqui ou no encontro): não há carta nem ele. Os dois nascem
  // agora: ele de frente, com a carta na mão.
  if (mundo.ok && !estado.entrega && !estado.envelope && conteudo.mao?.ele !== false) {
    try {
      const env = criarEnvelope(mundo, { lacre: null, amarracao: 'fio', chegada: false });
      await Promise.resolve(env.preparar?.()).catch(() => {});
      if (env.grupo && !env.grupo.parent) mundo.cena.add(env.grupo);
      estado.envelope = env;
      if (!entregaNaMao(ctx)) { env.dispose(); estado.envelope = null; }
    } catch (erro) { console.error(erro); }
  }

  // A carta sai da mão dele e vem até ela (primeira pessoa). A cena da carta, logo
  // abaixo, reaproveita a mesma carta, já parada diante dela.
  if (estado.entrega && estado.envelope && mundo.ok) {
    distancia = 0;
    diretor.etapa('carta-chegando');
    const env = estado.envelope;
    const pararEnv = mundo.aoQuadro((dt, t) => env.atualizar(dt, t));
    await espera(amb.reduzido ? 500 : 1300);              // ela o vê, de mão estendida
    const alvo = poseParada(mundo, NA_MAO);
    const de = env.grupo.position.clone();
    const voo = { k: 0 };
    som.efeito('papel');
    await new Promise((ok) => gsap.to(voo, {
      k: 1,
      duration: amb.reduzido ? 1.2 : 2.6,
      ease: 'power2.inOut',
      onUpdate: () => {
        const k = voo.k;
        // sobe um pouco no meio do caminho, como quem entrega com cuidado
        env.grupo.position.set(de.x + (alvo.x - de.x) * k, de.y + (alvo.y - de.y) * k + Math.sin(k * Math.PI) * 0.05, de.z + (alvo.z - de.z) * k);
      },
      onComplete: ok,
    }));
    pararEnv();
  }

  // Sem WebGL: a mesma figura pintada, parada atrás da carta que chega.
  if (!mundo.ok && mundo.recipienteLeve && conteudo.mao?.ele !== false) {
    const figura = pintarEleEntrega();
    if (figura) {
      figura.className = 'ele-leve';
      figura.setAttribute('aria-hidden', 'true');
      mundo.recipienteLeve.prepend(figura);
      gsap.to(figura, { opacity: 1, duration: amb.reduzido ? 0.8 : 1.8, ease: 'none' });
    }
  }

  // Entrou direto: não há fio vindo da mão. Desenha um trecho que chega pelo
  // chão do lado direito e sobe de lado até a carta (assim não passa por baixo
  // da dica, que fica embaixo, no meio).
  if (!estado.fio && mundo.ok && !estado.entrega) {
    const { THREE } = mundo;
    const z0 = mundo.rig.position.z;
    const x0 = mundo.rig.position.x;
    const zCarta = z0 - distancia - PARADA;
    const fio = criarFio(mundo, {
      largura: 0.014,
      curva: [
        new THREE.Vector3(x0 + 0.35, 0.03, z0 - 0.6),
        new THREE.Vector3(x0 + 0.9, 0.03, z0 - distancia * 0.4),
        new THREE.Vector3(x0 + 0.55, 0.03, z0 - distancia * 0.75),
        new THREE.Vector3(x0 + 0.95, 0.03, zCarta + 0.9),
        new THREE.Vector3(x0 + 0.55, 0.75, zCarta + 0.35),
        new THREE.Vector3(x0 + 0.12, 1.22, zCarta + 0.06),
        new THREE.Vector3(x0, ALTURA_OLHOS - 0.04 - 0.125, zCarta + 0.008),
      ],
    });
    fio.progresso(1);
    mundo.cena.add(fio.objeto);
    estado.fio = fio;
  }

  // Sem WebGL (inclusive quando o WebGL morreu e a carta recarregou aqui), o
  // trecho de fio é um traço SVG que sai da carta e desce até a borda de baixo,
  // pelo lado direito (longe da dica, que fica embaixo, no meio).
  const fioLeve = !estado.fio && !mundo.ok && mundo.recipienteLeve ? criarFioLeve(ctx) : null;

  // A folha nasce agora (invisível) e já compõe a frase: nada engasga depois do toque.
  const folha = criarFolha(mundo);
  const pronta = (folha.preparar ? folha.preparar(frase) : Promise.resolve())
    // os programas da folha compilam agora, invisíveis, e não no primeiro quadro em que ela aparece
    .then(() => aquecer(mundo, folha.grupo))
    .catch((erro) => {
      console.error('[carta] não consegui compor a frase', erro);
    });

  // No toque, o laço se desfaz em fios de luz: poeira de luz sai do ponto onde o
  // fio chega à carta (o brilho do nó é do envelope).
  const pararFaisca = diretor.aoMudar((cenaAgora, etapa) => {
    if (cenaAgora !== 'final' || etapa !== 'carta-abrindo') return;
    try {
      const a = estado.envelope && estado.envelope.ancoraFio;
      if (mundo.ok && a && estado.fio && estado.fio.faiscar) estado.fio.faiscar(a, 44);
    } catch { /* carta descartada no meio: sem faísca */ }
  });

  const { env, papel, parar } = await cenaCarta(ctx, {
    lacre: null,
    amarracao: 'fio',
    distancia,
    entregar: false,
    anunciarCaminhada: false,
    baixar: estado.entrega ? NA_MAO : undefined,
  });

  pararFaisca();
  // A folha toma o lugar do papel, na mesma pose, e vem até a frente dela.
  diretor.etapa('desdobrando');
  som.efeito('papel');
  // A folha final não tem botão nenhum: o mini seletor sai de cena (a música continua).
  musica.esconderMini();
  if (folha.assumir) folha.assumir(papel);
  else if (papel) papel.visible = false;
  const pararFolha = mundo.aoQuadro((dt, t) => folha.atualizar(dt, t));

  // A carta vai embora (depois que a folha terminou de sair dela); o fio, solto
  // do laço, escorre de volta e some.
  espera(amb.reduzido ? 0 : 420)
    .then(() => env.irEmbora())
    .then(() => { parar(); env.dispose(); });
  estado.envelope = null;
  if (fioLeve) fioLeve.soltar();
  const fioCaminho = estado.fio;
  estado.fio = null;
  if (fioCaminho) {
    const solta = { p: fioCaminho.progresso() || 1 };
    gsap.to(solta, {
      p: 0,
      duration: amb.reduzido ? 1.2 : 2.6,
      ease: amb.reduzido ? 'none' : 'power2.in',
      onUpdate: () => fioCaminho.progresso(solta.p),
      onComplete: () => fioCaminho.dispose(),
    });
  }

  await Promise.all([folha.desdobrar(), pronta]);

  diretor.etapa('escrevendo');
  // A cena fica quase parada daqui em diante: a frase ganha a resolução cheia da tela.
  if (amb.nivel !== 'baixo') mundo.nitidezMaxima?.(true);
  await espera(amb.reduzido ? 200 : 450);              // a mão pousa antes da primeira letra
  let letras = 0;
  await folha.escrever(frase, {
    aoTraco: () => {
      // a caneta raspa o papel, abaixo da música; uma em cada duas letras basta
      if (letras++ % 2 === 0) som.efeito('caneta');
    },
  });

  // O fio volta e repousa no canto. Só então a carta está no seu estado final.
  await espera(amb.reduzido ? 400 : 1600);
  if (folha.repousarFio) await folha.repousarFio();

  estado.folha = folha;
  estado.pararFolha = pararFolha;
  if (folha.viver) folha.viver();

  // O número da senha volta e conta os dias dela; depois, a folha em que ela escreve de volta.
  const depois = criarDepois(ctx);
  if (depois.temContador) {
    await espera(amb.reduzido ? 300 : 1400);
    diretor.etapa('contador');
    await depois.contar();
  }
  if (depois.temResposta) {
    diretor.etapa('resposta');
    await depois.escrever();
  }

  // O estado final, calmo: a noite, a música, a bolsa (o diretor a devolve nesta etapa).
  diretor.etapa('fim');
  depois.repousar();
  // O contador fica no alto e o botão de reabrir embaixo: em tela baixa a folha recua um pouco.
  if (depois.temContador || depois.temResposta) folha.recuar();
  musica.mostrarMini();
  await new Promise(() => {});                           // fica aqui, com as pétalas
}

/** Compila os shaders de um objeto (mesmo invisível) antes do primeiro quadro dele; no máximo ~1,2 s. */
function aquecer(mundo, objeto) {
  const r = mundo.renderer;
  if (!mundo.ok || !objeto || !r || typeof r.compileAsync !== 'function') return Promise.resolve();
  let compilando;
  try { compilando = r.compileAsync(objeto, mundo.camera, mundo.cena).catch(() => {}); } catch { return Promise.resolve(); }
  return Promise.race([compilando, espera(1200)]);
}

/** O fio do caminho no modo leve: acompanha a carta a cada quadro até ela abrir. */
function criarFioLeve(ctx) {
  const { mundo, estado, amb } = ctx;
  const gsap = window.gsap;
  const NS = 'http://www.w3.org/2000/svg';
  const desenho = document.createElementNS(NS, 'svg');
  desenho.setAttribute('aria-hidden', 'true');
  desenho.setAttribute('class', 'fio-leve-caminho');
  const traco = document.createElementNS(NS, 'path');
  traco.setAttribute('fill', 'none');
  traco.setAttribute('stroke', '#d7192d');
  traco.setAttribute('stroke-linecap', 'round');
  desenho.append(traco);
  // atrás da carta: a ponta de cima some sob o envelope
  mundo.recipienteLeve.prepend(desenho);
  gsap.set(desenho, { autoAlpha: 0 });

  let visto = false;
  const parar = mundo.aoQuadro(() => {
    const env = estado.envelope;
    if (!env) return;
    const a = env.ancoraFio;
    if (!a || !Number.isFinite(a.px)) return;
    const w = innerWidth;
    const h = innerHeight;
    const ax = a.px;
    const ay = a.py - 6;
    const fim = { x: w * 0.8, y: h + 24 };
    traco.setAttribute('d', `M${ax.toFixed(1)} ${ay.toFixed(1)}`
      + ` C${ax.toFixed(1)} ${(ay + (h - ay) * 0.42).toFixed(1)}`
      + ` ${(w * 0.97).toFixed(1)} ${(h * 0.74).toFixed(1)}`
      + ` ${fim.x.toFixed(1)} ${fim.y.toFixed(1)}`);
    traco.setAttribute('stroke-width', String(Math.max(2, Math.min(3.2, w / 150)).toFixed(2)));
    if (!visto) {
      visto = true;
      gsap.to(desenho, { autoAlpha: 1, duration: amb.reduzido ? 0.8 : 1.6, ease: 'none' });
    }
  });

  return {
    soltar() {
      parar();
      gsap.to(desenho, {
        autoAlpha: 0,
        duration: amb.reduzido ? 0.8 : 1.6,
        ease: 'none',
        onComplete: () => desenho.remove(),
      });
    },
  };
}
