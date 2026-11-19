// A carta: caminha, a carta chega, espera o toque, abre e entrega o papel.
// Usada três vezes (coração, estrela e a última, amarrada só com o fio).
//
//   cenaCarta(ctx, { tema, lacre, amarracao, distancia, entregar = true, anunciarCaminhada = true, baixar = 0.12 })
//     → Promise<{ env, papel, parar }>
//
//   tema               'poppy' | 'yourname' | null: a cara da carta (null = a carta branca, a última)
//   lacre              'coracao' | 'estrela' | null
//   amarracao          'cordao' | 'fio'
//   distancia          metros de caminhada até a carta (0 = ela já está na frente)
//   entregar           true: o papel voa até o pergaminho e vira a folha DOM (etapa `papel`)
//                      false: para depois de abrir (a cena final assume o papel, que fica
//                      fora do envelope, de frente e parado)
//   anunciarCaminhada  false: não publica a etapa `caminhada` (a cena final começa em `carta-chegando`)
//   baixar             quanto a carta para abaixo da linha dos olhos, em meias-alturas da tela
//                      (0,12: um nada abaixo; a última, na mão dele, para mais baixo e deixa o rosto dele livre)
//
// Etapas: caminhada → carta-chegando → carta-espera → carta-abrindo → papel
// O envelope fica em ctx.estado.envelope até a cena seguinte mandá-lo embora.
// Se a cena anterior já deixou em estado.envelope uma carta igual e ainda fechada
// (a cena da mão cria a última carta para o fio terminar nela), ela é reaproveitada.
//
// Extras exportados: distanciaDaCarta(mundo) → metros entre os olhos e a carta parada
// (~72% da largura da tela em pé, ~28% no computador); poseParada(mundo, baixar?, zOlhos?)
// → { x, y, z }, onde a carta para.
//
// Gancho para os testes: tocar no centro da tela na etapa `carta-espera`.

import { clamp, el, espera, lerp, pxParaNdc } from '../nucleo/util.js';
import { curvas } from '../nucleo/movimento.js';
import { criarEnvelope } from '../mundo/envelope.js';

const ALTURA_OLHOS = 1.5;          // contrato 4.3: câmera a 1,5 m do chão
const LARGURA_CARTA = 0.23;        // o envelope tem 23 × 16 cm
const ALTURA_CARTA = 0.16;
const ESPERA_DICA = 4000;          // ms sem toque até a dica aparecer
const LONGE = 2.6;                 // metros além do ponto de parada de onde a carta vem
const BAIXAR = 0.12;               // a carta para um nada abaixo da linha dos olhos (em meias-alturas da tela)

// Ela já usou o teclado? (só então o foco levado até a carta pede o anel; um toque nunca o vê)
let usouTeclado = false;
if (typeof window !== 'undefined') {
  // (digitar a senha na tela preta não conta: no iPhone o teclado numérico também dispara keydown)
  const aoTeclar = (e) => {
    if (e.target && e.target.closest && e.target.closest('#entrada')) return;
    usouTeclado = true;
    window.removeEventListener('keydown', aoTeclar, true);
  };
  window.addEventListener('keydown', aoTeclar, true);
}

/** Distância (m) em que a carta para: ~72% da largura no celular em pé, ~28% no computador. */
export function distanciaDaCarta(mundo) {
  const camera = mundo.camera;
  if (!camera) return 0.62;
  const aspecto = camera.aspect || 1;
  const meia = Math.tan((camera.fov * Math.PI) / 360);
  const fracao = lerp(0.72, 0.28, clamp((aspecto - 0.75) / (1.5 - 0.75)));
  const pelaLargura = LARGURA_CARTA / (fracao * 2 * meia * aspecto);
  const pelaAltura = ALTURA_CARTA / (0.46 * 2 * meia);      // nunca mais que ~46% da altura
  return Math.max(pelaLargura, pelaAltura, 0.4);
}

/** Onde a carta para, com a câmera em `zOlhos`: `baixar` meias-alturas da tela abaixo da linha dos olhos. */
export function poseParada(mundo, baixar = BAIXAR, zOlhos = mundo.rig.position.z) {
  const d = distanciaDaCarta(mundo);
  const meia = Math.tan(((mundo.camera?.fov || 58) * Math.PI) / 360);
  return { x: mundo.rig.position.x, y: ALTURA_OLHOS - d * meia * baixar, z: zOlhos - d };
}

export async function cenaCarta(ctx, opcoes = {}) {
  const { tema = null, lacre = 'coracao', amarracao = 'cordao', distancia = 7, entregar = true, anunciarCaminhada = true, baixar = BAIXAR } = opcoes;
  const { mundo, diretor, pergaminho, som, estado } = ctx;
  const gsap = window.gsap;

  const duracao = distancia > 0 ? 2.4 + distancia * 0.6 : 0;
  const anterior = estado.envelope;
  const reaproveitar = !!(anterior && !anterior.aberto && anterior.amarracao === amarracao
    && (anterior.lacre ?? null) === (lacre ?? null) && (anterior.tema ?? null) === (tema ?? null));
  if (anterior && !reaproveitar) {
    // sobrou uma carta de antes: vai embora no branco
    estado.envelope = null;
    Promise.resolve(anterior.irEmbora?.()).catch(() => {}).then(() => anterior.dispose?.());
  }
  const env = reaproveitar ? anterior : criarEnvelope(mundo, { tema, lacre, amarracao, chegada: false });
  estado.envelope = env;
  env.aoMarco = (nome) => {
    if (nome === 'lacre') som.efeito('lacre');
    if (nome === 'papel') som.efeito('papel');
  };

  // Para onde ela anda e onde a carta para.
  const zOlhosFinal = mundo.rig.position.z - Math.max(0, distancia || 0);
  // Programas e texturas da carta prontos antes de ela entrar em cena (se a abertura
  // já a aqueceu, isto resolve na hora): o primeiro passo não engasga compilando.
  let pronta = Promise.resolve();
  // a rajada de pétalas do lacre: o programa dela já pronto (na carta inteira, a abertura já fez isto)
  if (mundo.ok) mundo.petalas?.preparar?.();
  if (mundo.ok) {
    const alvo = poseParada(mundo, baixar, zOlhosFinal);
    if (reaproveitar) {
      gsap.to(env.grupo.position, { x: alvo.x, y: alvo.y, z: alvo.z, duration: Math.max(1.6, duracao), ease: curvas.branco.camera });
    } else {
      env.grupo.position.set(alvo.x, alvo.y, alvo.z);
      pronta = Promise.resolve(env.preparar?.()).then(() => {
        if (!env.descartado && !env.grupo.parent) mundo.cena.add(env.grupo);
      });
    }
  }
  const parar = mundo.aoQuadro((dt, t) => env.atualizar(dt, t));

  if (distancia > 0) {
    diretor.etapa(anunciarCaminhada ? 'caminhada' : 'carta-chegando');
    // Com uma frase ainda saindo (a primeira carta), a carta nasce da névoa na segunda
    // metade da caminhada; com o mundo vazio ela aparece bem antes, como um ponto ao longe.
    const vazio = !document.querySelector('#frases > *');
    const andar = mundo.caminhar({ distancia, duracao });
    const inicio = anunciarCaminhada ? duracao * (vazio ? 0.28 : 0.5) : duracao * 0.25;
    if (!reaproveitar) env.chegar({ duracao: duracao - inicio + 0.8, distancia: LONGE, atraso: inicio });
    if (anunciarCaminhada) {
      await espera(inicio * 1000);
      diretor.etapa('carta-chegando');
    }
    await andar;
    await pronta;
    await espera(500);
  } else {
    diretor.etapa('carta-chegando');
    await pronta;
    if (!reaproveitar) await env.chegar({ duracao: 2.6, distancia: LONGE + 1 });
    else await espera(1200);
  }

  diretor.etapa('carta-espera');
  await esperarToque(ctx, env, baixar);

  diretor.etapa('carta-abrindo');
  const { papel } = await env.abrir();
  mundo.petalas.protegerRetangulo?.(null);

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
function esperarToque(ctx, env, baixar) {
  const { conteudo, som, mundo, amb } = ctx;
  const gsap = window.gsap;
  const dica = document.getElementById('dica');
  const acoes = document.getElementById('acoes');
  const textoDica = conteudo.abertura?.dicaCarta || '';
  // Na última carta o fio sobe do chão até o laço: a dica fica acima, longe dele.
  const dicaAcima = env.amarracao === 'fio';

  return new Promise((resolver) => {
    let terminado = false;

    // Alvo invisível sobre a carta: dá foco de teclado e nome para leitores de tela.
    // (pointer-events: none no CSS; o toque de verdade é medido contra a carta.)
    const alvo = el('button', {
      class: 'alvo-carta', type: 'button', 'aria-label': textoDica, dataset: { acao: 'abrir-carta' },
    });
    acoes.append(alvo);
    // Quem lê a tela ouve o nome do alvo; a dica visível não repete a frase.
    dica.setAttribute('aria-hidden', 'true');
    // Se o foco tinha ficado solto (no body), ele cai na carta: o leitor de tela anuncia
    // a carta e o teclado já a abre. O anel só aparece com :focus-visible (nunca num toque).
    if (!document.activeElement || document.activeElement === document.body) {
      try { alvo.focus({ preventScroll: true, focusVisible: usouTeclado }); } catch { /* sem foco programático */ }
    }

    // Nada desfocado passa entre a lente e a carta enquanto ela olha e abre
    // (a caixa sobe para cobrir também o papel que sai de dentro).
    mundo.petalas.protegerRetangulo?.(() => {
      const c = env.caixaTela?.();
      if (!c || !(c.width > 0)) return null;
      const mx = c.width * 0.18;
      return { left: c.left - mx, right: c.right + mx, top: c.top - c.height * 1.4, bottom: c.bottom + c.height * 0.25 };
    });

    const posicionar = () => {
      const caixa = env.caixaTela?.();
      if (!caixa || !(caixa.width > 0)) return;
      Object.assign(alvo.style, {
        left: `${caixa.left}px`, top: `${caixa.top}px`,
        width: `${caixa.width}px`, height: `${caixa.height}px`, transform: 'none',
      });
      if (dica.hidden) return;
      const folga = Math.max(22, caixa.height * 0.14);
      if (dicaAcima) {
        // (parada mais baixo, na mão dele, a dica fica onde ficaria com a carta na altura
        // de sempre: acima da cabeça dele, nunca no rosto, e o toque ali também vale. A
        // folga dobra: a carta flutua e o passo balança, e a dica parada não acompanha.)
        const baixou = ((baixar - BAIXAR) * innerHeight) / 2;
        dica.style.top = 'auto';
        dica.style.bottom = `${Math.max(16, innerHeight - caixa.top + baixou + folga * (baixou > 0 ? 2 : 1))}px`;
      } else {
        dica.style.bottom = 'auto';
        dica.style.top = `${Math.min(innerHeight - 64, caixa.bottom + folga)}px`;
      }
    };
    posicionar();

    // Se a tela girar, a carta refaz a distância (mesma proporção da tela) e a dica acompanha.
    const pararTamanho = mundo.aoRedimensionar(() => {
      if (terminado) return;
      if (mundo.ok) {
        const alvoPose = poseParada(mundo, baixar);
        gsap.to(env.grupo.position, { x: alvoPose.x, y: alvoPose.y, z: alvoPose.z, duration: 0.6, ease: curvas.branco.entrar, onComplete: posicionar });
      } else {
        posicionar();
      }
    });

    const mostrarDica = () => {
      if (terminado || !textoDica || !dica.hidden) return;
      dica.textContent = textoDica;
      Object.assign(dica.style, { fontFamily: 'var(--fonte-mao)', letterSpacing: '0.03em', fontSize: 'clamp(1rem, 0.94rem + 0.3vw, 1.15rem)' });
      dica.hidden = false;
      posicionar();
      gsap.fromTo(dica,
        { autoAlpha: 0, y: amb.reduzido ? 0 : 8 },
        { autoAlpha: 1, y: 0, duration: 1.4, ease: curvas.branco.entrar });
    };
    espera(ESPERA_DICA).then(mostrarDica);

    const concluir = () => {
      if (terminado) return;
      terminado = true;
      som.destravar();                    // primeiro gesto: libera o áudio
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointerdown', aoApertar);
      window.removeEventListener('pointercancel', aoCancelar);
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerout', aoMover);
      marcarSobre(false);
      pararTamanho();
      alvo.remove();
      if (!dica.hidden) {
        gsap.to(dica, {
          autoAlpha: 0, duration: 0.4, ease: 'none',
          onComplete: () => { dica.hidden = true; dica.textContent = ''; dica.removeAttribute('style'); dica.removeAttribute('aria-hidden'); },
        });
      } else {
        dica.removeAttribute('style');
        dica.removeAttribute('aria-hidden');
      }
      resolver();
    };

    // Toque é apertar e soltar no mesmo lugar: arrastar a carta para girá-la não abre.
    // (o mini da música e a bolsa são dela: um toque neles, ou com a bolsa aberta, não é na carta)
    const foraDaCarta = (e) => !!(ctx.inventario?.aberto
      || (e.target && e.target.closest && e.target.closest('#mini, #inventario')));
    // Parada mais baixo (na mão dele), um toque onde ela pararia normalmente (o meio
    // da tela, o rosto dele) também vale. `exato`: só a carta (para o cursor).
    const acertou = (e, exato = false) => {
      const { x, y } = pxParaNdc(e.clientX, e.clientY);
      return env.acertou(x, y) || (!exato && baixar > BAIXAR && env.acertou(x, y - (baixar - BAIXAR)));
    };
    let apertou = null;
    const aoApertar = (e) => {
      if (foraDaCarta(e)) return;
      apertou = { x: e.clientX, y: e.clientY };
      if (acertou(e)) env.pressionar?.(true);
    };
    const aoCancelar = () => { apertou = null; env.pressionar?.(false); };
    const aoSoltar = (e) => {
      if (foraDaCarta(e)) { apertou = null; return; }
      const arrastou = apertou && Math.hypot(e.clientX - apertou.x, e.clientY - apertou.y) > 14;
      apertou = null;
      if (arrastou) { env.pressionar?.(false); return; }
      if (acertou(e)) concluir();
      else { env.pressionar?.(false); mostrarDica(); }      // tocou fora: mostra logo onde é
    };

    // No mouse a carta diz que é alvo: a seta vira mão sobre ela e a carta vem um nada
    // para a frente. No toque não há nada disso (pointerType 'touch').
    let sobre = false;
    const marcarSobre = (sim) => {
      if (sim === sobre) return;
      sobre = sim;
      document.documentElement.style.cursor = sim ? 'pointer' : '';
      if (mundo.ok && !amb.reduzido) {
        const k = sim ? 1.025 : 1;
        gsap.to(env.grupo.scale, { x: k, y: k, z: k, duration: sim ? 0.35 : 0.5, ease: curvas.branco.entrar, overwrite: 'auto' });
      }
    };
    const aoMover = (e) => {
      // (pointerout sem relatedTarget: o mouse saiu da janela)
      if (e.pointerType !== 'mouse' || (e.type === 'pointerout' && e.relatedTarget)) return;
      marcarSobre(e.type === 'pointermove' && !foraDaCarta(e) && acertou(e, true));
    };

    window.addEventListener('pointerdown', aoApertar);
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('pointercancel', aoCancelar);
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerout', aoMover);
    alvo.addEventListener('click', () => { if (!ctx.inventario?.aberto) concluir(); });   // teclado (Enter/Espaço) e leitores de tela
  });
}
