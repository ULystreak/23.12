// Final: a última carta, amarrada só com o fio. A folha em branco desdobra e a
// frase é escrita à mão, letra por letra. Fica ali com as pétalas. Sem botão, sem "fim".
//
//   cenaFinal(ctx, { frio }) → Promise que nunca resolve
//
// Etapas: carta-chegando → carta-espera → carta-abrindo → desdobrando → escrevendo → fim
//
// O papel que sai da carta é trocado, na mesma pose, pela folha de criarFolha()
// (js/mundo/folha.js), que vem até a frente dela e desdobra. O fio que a trouxe
// até aqui se solta com o laço e some; quando a frase termina, ele volta e
// repousa, solto, sobre o canto de baixo da folha.
//
// Parâmetro só de teste: ?frase=… troca a frase (para ver uma longa e uma curta).

import { espera } from '../nucleo/util.js';
import { cenaCarta } from './carta.js';
import { criarFio } from '../mundo/fio.js';
import { criarFolha } from '../mundo/folha.js';

const ALTURA_OLHOS = 1.5;
const PARADA = 1.25;               // a carta para a esta distância dela (igual a carta.js)

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

  // Entrou direto: não há fio vindo da mão. Desenha um trecho que chega pelo
  // chão do lado direito e sobe de lado até a carta (assim não passa por baixo
  // da dica, que fica embaixo, no meio).
  if (!estado.fio && mundo.ok) {
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

  const { env, papel, parar } = await cenaCarta(ctx, {
    lacre: null,
    amarracao: 'fio',
    distancia,
    entregar: false,
    anunciarCaminhada: false,
  });

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

  diretor.etapa('fim');
  estado.folha = folha;
  estado.pararFolha = pararFolha;
  if (folha.viver) folha.viver();
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
