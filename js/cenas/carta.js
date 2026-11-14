// A carta: caminha, a carta chega, espera o toque, abre e entrega o papel.
// Usada três vezes (coração, estrela e a última, amarrada só com o fio).
//
//   cenaCarta(ctx, { lacre, amarracao, distancia, entregar = true, anunciarCaminhada = true })
//     → Promise<{ env, papel, parar }>
//
//   lacre              'coracao' | 'estrela' | null
//   amarracao          'cordao' | 'fio'
//   distancia          metros de caminhada até a carta (0 = ela já está na frente)
//   entregar           true: o papel voa até o pergaminho e vira a folha DOM (etapa `papel`)
//                      false: para depois de abrir (a cena final assume o papel)
//   anunciarCaminhada  false: não publica a etapa `caminhada` (a cena final começa em `carta-chegando`)
//
// Etapas: caminhada → carta-chegando → carta-espera → carta-abrindo → papel
// O envelope fica em ctx.estado.envelope até a cena seguinte mandá-lo embora.
//
// Gancho para os testes: tocar no centro da tela na etapa `carta-espera`.
// Versão do esqueleto: coreografia simples. A assinatura não muda.

import { el, espera, pxParaNdc } from '../nucleo/util.js';
import { curvas } from '../nucleo/movimento.js';
import { criarEnvelope } from '../mundo/envelope.js';

const DISTANCIA_FINAL = 1.25;      // a carta para a esta distância dela
const ALTURA_OLHOS = 1.5;          // contrato 4.3: câmera a 1,5 m do chão
const ESPERA_DICA = 4000;          // ms sem toque até a dica aparecer

export async function cenaCarta(ctx, opcoes = {}) {
  const { lacre = 'coracao', amarracao = 'cordao', distancia = 7, entregar = true, anunciarCaminhada = true } = opcoes;
  const { mundo, diretor, pergaminho, som, estado } = ctx;
  const gsap = window.gsap;

  const duracao = distancia > 0 ? 2.4 + distancia * 0.6 : 0;
  const env = criarEnvelope(mundo, { lacre, amarracao, chegada: Math.max(1.2, duracao * 0.5) });
  estado.envelope = env;

  if (mundo.ok) {
    // A carta já está lá na frente, dentro da névoa; é ela quem caminha até a carta.
    env.grupo.position.set(mundo.rig.position.x, ALTURA_OLHOS - 0.04, mundo.rig.position.z - distancia - DISTANCIA_FINAL);
    mundo.cena.add(env.grupo);
    if (!(distancia > 0)) {
      // Sem caminhada, a carta vem do branco até ela.
      gsap.from(env.grupo.position, { z: env.grupo.position.z - 8, duration: 2.6, ease: curvas.branco.entrar });
    }
  }
  const parar = mundo.aoQuadro((dt, t) => env.atualizar(dt, t));

  if (distancia > 0) {
    diretor.etapa(anunciarCaminhada ? 'caminhada' : 'carta-chegando');
    const andar = mundo.caminhar({ distancia, duracao });
    if (anunciarCaminhada) {
      await espera(duracao * 1000 * 0.55);
      diretor.etapa('carta-chegando');
    }
    await andar;
  } else {
    diretor.etapa('carta-chegando');
    await espera(2200);
  }

  diretor.etapa('carta-espera');
  await esperarToque(ctx, env);

  diretor.etapa('carta-abrindo');
  som.efeito('lacre');
  const { papel } = await env.abrir();

  if (!entregar) return { env, papel, parar };

  diretor.etapa('papel');
  som.efeito('papel');
  await env.entregarPapel(pergaminho.retanguloAlvo());
  await pergaminho.receberPapel();
  if (papel) papel.visible = false;      // a folha DOM já está no lugar: troca invisível
  parar();
  return { env, papel, parar };
}

/** Espera ela tocar na carta. Depois de alguns segundos sem toque, mostra a dica. */
function esperarToque(ctx, env) {
  const { conteudo, som } = ctx;
  const gsap = window.gsap;
  const dica = document.getElementById('dica');
  const acoes = document.getElementById('acoes');
  const textoDica = conteudo.abertura?.dicaCarta || '';

  return new Promise((resolver) => {
    let terminado = false;

    // Alvo invisível: dá foco de teclado e nome para leitores de tela.
    // (pointer-events: none no CSS; o toque de verdade é medido contra a carta.)
    const alvo = el('button', {
      class: 'alvo-carta', type: 'button', 'aria-label': textoDica, dataset: { acao: 'abrir-carta' },
    });
    acoes.append(alvo);

    const mostrarDica = () => {
      if (terminado || !textoDica || !dica.hidden) return;
      dica.textContent = textoDica;
      dica.hidden = false;
      gsap.fromTo(dica, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.2, ease: 'none' });
    };
    espera(ESPERA_DICA).then(mostrarDica);

    const concluir = () => {
      if (terminado) return;
      terminado = true;
      som.destravar();                    // primeiro gesto: libera o áudio
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointerdown', aoApertar);
      alvo.remove();
      if (!dica.hidden) {
        gsap.to(dica, {
          autoAlpha: 0, duration: 0.4, ease: 'none',
          onComplete: () => { dica.hidden = true; dica.textContent = ''; },
        });
      }
      resolver();
    };

    // Toque é apertar e soltar no mesmo lugar: arrastar a carta para girá-la não abre.
    let apertou = null;
    const aoApertar = (e) => { apertou = { x: e.clientX, y: e.clientY }; };
    const aoSoltar = (e) => {
      if (e.target && e.target.closest && e.target.closest('#mini')) return;
      const arrastou = apertou && Math.hypot(e.clientX - apertou.x, e.clientY - apertou.y) > 14;
      apertou = null;
      if (arrastou) return;
      const ndc = pxParaNdc(e.clientX, e.clientY);
      if (env.acertou(ndc.x, ndc.y)) concluir();
      else mostrarDica();                 // tocou fora: mostra logo onde é
    };

    window.addEventListener('pointerdown', aoApertar);
    window.addEventListener('pointerup', aoSoltar);
    alvo.addEventListener('click', concluir);   // teclado (Enter/Espaço) e leitores de tela
  });
}
