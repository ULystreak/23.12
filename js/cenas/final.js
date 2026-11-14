// Final: a última carta, amarrada só com o fio. A folha em branco desdobra e a
// frase é escrita à mão, letra por letra. Fica ali com as pétalas. Sem botão, sem "fim".
//
//   cenaFinal(ctx, { frio }) → Promise que nunca resolve
//
// Etapas: carta-chegando → carta-espera → carta-abrindo → desdobrando → escrevendo → fim
// Versão do esqueleto: coreografia simples. A assinatura não muda.

import { curvas } from '../nucleo/movimento.js';
import { cenaCarta } from './carta.js';
import { criarFio } from '../mundo/fio.js';
import { criarFolha } from '../mundo/folha.js';

export async function cenaFinal(ctx, { frio } = {}) {
  const { conteudo, diretor, mundo, som, musica, estado } = ctx;
  const gsap = window.gsap;

  let distancia = estado.distanciaFinal ?? 4;
  if (frio) {
    musica.mostrarMini();
    mundo.petalas.definirDensidade(1);
    distancia = 5;
  }

  // Entrou direto: não há fio vindo da mão, então desenha um do chão até a carta.
  if (!estado.fio && mundo.ok) {
    const { THREE } = mundo;
    const z0 = mundo.rig.position.z;
    const total = distancia + 1.25;
    const fio = criarFio(mundo, {
      largura: 0.014,
      curva: [
        new THREE.Vector3(0.12, 0.03, z0 - 0.9),
        new THREE.Vector3(-0.25, 0.03, z0 - total * 0.45),
        new THREE.Vector3(0.2, 0.03, z0 - total * 0.75),
        new THREE.Vector3(0, 0.04, z0 - total + 1.1),
        new THREE.Vector3(0, 1.28, z0 - total + 0.02),
      ],
    });
    fio.progresso(1);
    mundo.cena.add(fio.objeto);
    estado.fio = fio;
  }

  const { env, papel, parar } = await cenaCarta(ctx, {
    lacre: null,
    amarracao: 'fio',
    distancia,
    entregar: false,
    anunciarCaminhada: false,
  });

  // A folha nasce onde o papel saiu e vem até a frente dela enquanto desdobra.
  diretor.etapa('desdobrando');
  som.efeito('papel');
  const folha = criarFolha(mundo);
  const pararFolha = mundo.aoQuadro((dt, t) => folha.atualizar(dt, t));

  if (mundo.ok) {
    const { THREE } = mundo;
    const origem = new THREE.Vector3();
    papel.updateWorldMatrix(true, false);
    origem.setFromMatrixPosition(papel.matrixWorld);
    const destino = mundo.telaParaMundo(0, 0.02, 1.0);
    destino.x = mundo.rig.position.x;                    // centrada, sem herdar o balanço do instante
    folha.grupo.position.copy(origem);
    folha.grupo.scale.setScalar(0.72);
    mundo.cena.add(folha.grupo);
    papel.visible = false;
    gsap.to(folha.grupo.position, { x: destino.x, y: destino.y, z: destino.z, duration: 2.2, ease: curvas.branco.entrar });
    gsap.to(folha.grupo.scale, { x: 1, y: 1, z: 1, duration: 2.2, ease: curvas.branco.entrar });
  } else if (papel) {
    papel.visible = false;
  }

  // A carta e o fio do caminho se afastam: sobra só a folha.
  env.irEmbora().then(() => { parar(); env.dispose(); });
  estado.envelope = null;

  await folha.desdobrar();

  diretor.etapa('escrevendo');
  som.efeito('caneta');
  await folha.escrever(conteudo.final?.frase || '');

  diretor.etapa('fim');
  estado.folha = folha;
  estado.pararFolha = pararFolha;
  await new Promise(() => {});                           // fica aqui, com as pétalas
}
