// A mão: o capítulo fecha, a carta vai embora, "Olha a sua mão.", a mão com o
// akai ito, o botão, e o fio vira o caminho.
//
//   cenaMao(ctx, { frio }) → Promise   resolve quando ela chegou perto da última carta
//
// Etapas: enrolando → olha → mao-espera → seguindo
// Deixa para a cena final: ctx.estado.fio (o fio já desenhado) e
// ctx.estado.distanciaFinal (metros que faltam até a última carta).
//
// Gancho para os testes (não mudar): [data-acao="seguir-fio"].
// Versão do esqueleto: mão desenhada em SVG simples quando não há imagem.

import { el, espera, svg, pxParaNdc, clamp } from '../nucleo/util.js';
import { curvas, revelarPalavras, ocultarPalavras } from '../nucleo/movimento.js';
import { voltarAoMundo } from '../nucleo/diretor.js';
import { criarFio } from '../mundo/fio.js';

const CAMINHADA = 8;          // metros andados nesta cena, seguindo o fio
const RESTO = 4;              // metros que ficam para a cena final (a carta nasce da névoa)
const PARADA = 1.25;          // distância em que a última carta fica dela

// Mão desenhada (reserva quando conteudo.mao.imagem está vazio): um pulso, a palma
// e o laço do fio. O laço fica em (0.5, 0.62) do desenho, igual ao ancoraFio padrão.
const MAO_DESENHADA = `
  <svg viewBox="0 0 200 260" aria-hidden="true">
    <g fill="none" stroke="#2a1b22" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M72 258V176c-14-12-24-30-26-52-1-12 12-15 16-4l10 26V52c0-13 17-13 17 0v52V38c0-13 17-13 17 0v66V48c0-13 17-13 17 0v60V70c0-12 16-12 16 0v72c0 18-6 28-14 36v80"/>
    </g>
    <path d="M66 162c22 7 52 7 76 0" fill="none" stroke="#d7192d" stroke-width="4" stroke-linecap="round"/>
    <path d="M100 163c-10-13-24-9-20 1 3 7 14 4 20-1 6 5 17 8 20 1 4-10-10-14-20-1z" fill="none" stroke="#d7192d" stroke-width="3" stroke-linejoin="round"/>
  </svg>`;

export async function cenaMao(ctx, { frio } = {}) {
  const { conteudo, diretor, mundo, som, musica, recursos, estado, amb } = ctx;
  const gsap = window.gsap;
  const dados = conteudo.mao || {};
  const palcoFrases = document.getElementById('frases');
  const palco = document.getElementById('palco');
  const acoes = document.getElementById('acoes');

  // 1. O capítulo fecha e a carta vai embora.
  diretor.etapa('enrolando');
  if (frio) musica.mostrarMini();
  else await voltarAoMundo(ctx);
  mundo.petalas.definirDensidade(1);

  // 2. A frase e a mão.
  diretor.etapa('olha');
  const frase = el('p', 'frase');
  palcoFrases.append(frase);
  await revelarPalavras(frase, dados.frase || '', { intervalo: 0.24, duracao: 1.8 });

  const imagem = await recursos.elementoImagem(dados.imagem, '');
  const mao = el('div', { class: 'mao', 'aria-hidden': 'true' }, imagem || svg(MAO_DESENHADA));
  palco.append(mao);
  await new Promise((ok) => gsap.fromTo(mao,
    { autoAlpha: 0, y: amb.reduzido ? 0 : 40 },
    { autoAlpha: 1, y: 0, duration: 1.8, ease: curvas.branco.entrar, onComplete: ok }));

  // 3. O botão.
  diretor.etapa('mao-espera');
  const botao = el('button', { class: 'botao', type: 'button', dataset: { acao: 'seguir-fio' }, texto: dados.botao || '' });
  acoes.append(botao);
  gsap.fromTo(botao, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.2, ease: 'none' });
  await new Promise((ok) => botao.addEventListener('click', ok, { once: true }));

  // 4. O fio sai do pulso e vira o caminho.
  diretor.etapa('seguindo');
  som.destravar();
  som.efeito('toque');
  botao.disabled = true;
  gsap.to(botao, { autoAlpha: 0, duration: 0.5, ease: 'none', onComplete: () => botao.remove() });
  ocultarPalavras(frase).then(() => frase.remove());

  // Ponto da tela onde o fio está amarrado.
  const rect = mao.getBoundingClientRect();
  const ancora = dados.ancoraFio || {};
  const ax = rect.left + rect.width * clamp(Number(ancora.x ?? 0.5));
  const ay = rect.top + rect.height * clamp(Number(ancora.y ?? 0.62));

  let fio;
  if (mundo.ok) {
    const { THREE } = mundo;
    const ndc = pxParaNdc(ax, ay);
    const inicio = mundo.telaParaMundo(ndc.x, ndc.y, 0.9);
    const z0 = mundo.rig.position.z;
    const x0 = mundo.rig.position.x;
    const total = CAMINHADA + RESTO + PARADA;
    fio = criarFio(mundo, {
      largura: 0.014,
      curva: [
        inicio,
        new THREE.Vector3(inicio.x * 0.6, 0.55, z0 - 1.9),
        new THREE.Vector3(x0 + 0.22, 0.03, z0 - 3.4),
        new THREE.Vector3(x0 - 0.3, 0.03, z0 - total * 0.45),
        new THREE.Vector3(x0 + 0.24, 0.03, z0 - total * 0.72),
        new THREE.Vector3(x0, 0.04, z0 - total + 1.1),
        new THREE.Vector3(x0, 1.28, z0 - total + 0.02),      // sobe até a carta
      ],
    });
    mundo.cena.add(fio.objeto);
  } else {
    fio = criarFio(mundo, {});
  }
  estado.fio = fio;
  estado.distanciaFinal = RESTO;

  const desenho = { p: 0 };
  const desenhar = new Promise((ok) => gsap.to(desenho, {
    p: 1,
    duration: amb.reduzido ? 1.2 : 3.2,
    ease: curvas.branco.camera,
    onUpdate: () => fio.progresso(desenho.p),
    onComplete: ok,
  }));

  await espera(700);
  gsap.to(mao, { autoAlpha: 0, y: amb.reduzido ? 0 : 60, duration: 1.4, ease: curvas.branco.sair, onComplete: () => mao.remove() });
  await mundo.caminhar({ distancia: CAMINHADA, duracao: 7.5 });
  await desenhar;
}
