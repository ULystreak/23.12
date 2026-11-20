// A carta: caminha, a carta chega, espera o toque, abre e entrega o papel.
// Usada três vezes (coração, estrela e a última, amarrada só com o fio).
//
//   cenaCarta(ctx, { tema, lacre, amarracao, distancia, entregar = true, anunciarCaminhada = true, baixar = 0.12, chacoalhar = '' })
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
//   chacoalhar         o convite para chacoalhar o celular (só a última carta passa; '' = desligado).
//                      O toque na carta pede o sensor de movimento (no iPhone, a janela do sistema,
//                      dentro do gesto); com ele, a dica vira este texto, a carta treme de leve e
//                      abre quando o aparelho é chacoalhado. Nunca prende: sem sensor, com a
//                      permissão negada, no mouse, no teclado, no leitor de tela ou com movimento
//                      reduzido o toque abre na hora; depois do convite um segundo toque também
//                      abre, e em ~10 s a dica volta a pedir o toque.
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
// Chacoalhar (a última carta): o aparelho parado dá ~0 m/s² (sem a gravidade), andar com
// ele na mão fica em 2 a 5 e um chacoalhão de leve passa de 14. Vale com três picos em 1 s.
const FORCA_CHACOALHO = 11;        // m/s² para contar um pico
const PICOS_CHACOALHO = 3;
const JANELA_CHACOALHO = 1000;     // ms em que os picos têm que caber
const ESPERA_CHACOALHO = 10000;    // ms sem chacoalhar até a dica voltar a pedir o toque

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
  const { tema = null, lacre = 'coracao', amarracao = 'cordao', distancia = 7, entregar = true, anunciarCaminhada = true, baixar = BAIXAR, chacoalhar = '' } = opcoes;
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
  await esperarToque(ctx, env, baixar, chacoalhar);

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

/**
 * Espera ela tocar na carta. Depois de alguns segundos sem toque, mostra a dica.
 * Com `textoChacoalhar` (a última carta) e sensor de movimento, o toque vira o convite
 * para chacoalhar o celular (ver o cabeçalho).
 */
function esperarToque(ctx, env, baixar, textoChacoalhar = '') {
  const { conteudo, som, mundo, amb } = ctx;
  const gsap = window.gsap;
  const dica = document.getElementById('dica');
  const acoes = document.getElementById('acoes');
  const textoDica = conteudo.abertura?.dicaCarta || '';
  // Na última carta o fio sobe do chão até o laço: a dica fica acima, longe dele.
  // (sem WebGL, com a figura dele pintada, a dica fica embaixo: acima, cairia no rosto dele)
  const dicaAcima = env.amarracao === 'fio' && (mundo.ok || !document.querySelector('.ele-leve'));

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
        // (parada mais baixo, na mão dele, a dica fica acima de onde ficaria o alto da carta
        // na altura de sempre, com a folga dobrada: acima da cabeça dele, nunca no rosto, e o
        // toque ali também vale. A conta é pela pose, não pela caixa de agora: o passo e o
        // mouse mexem a carta, que está perto, bem mais que a cabeça dele, e a dica não acompanha.)
        const naMao = baixar > BAIXAR && mundo.ok;
        const meia = Math.tan(((mundo.camera?.fov || 58) * Math.PI) / 360);
        const topo = naMao ? ((1 + BAIXAR - ALTURA_CARTA / (2 * distanciaDaCarta(mundo) * meia)) * innerHeight) / 2 : caixa.top;
        dica.style.top = 'auto';
        dica.style.bottom = `${Math.max(16, innerHeight - topo + folga * (naMao ? 2 : 1))}px`;
      } else {
        // (no mouse a câmera segue o ponteiro e a carta anda ~45 px na tela: a dica, parada,
        // fica mais longe para a carta não passar por cima dela)
        const mouse = matchMedia('(hover: hover) and (pointer: fine)').matches ? 56 : 0;
        dica.style.bottom = 'auto';
        dica.style.top = `${Math.min(innerHeight - 64, caixa.bottom + folga + mouse)}px`;
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

    let textoAgora = textoDica;         // o que a dica diz agora (o convite para chacoalhar troca)
    const mostrarDica = () => {
      if (terminado || !textoAgora || !dica.hidden) return;
      dica.textContent = textoAgora;
      Object.assign(dica.style, { fontFamily: 'var(--fonte-mao)', letterSpacing: '0.03em', fontSize: 'clamp(1rem, 0.94rem + 0.3vw, 1.15rem)' });
      dica.hidden = false;
      posicionar();
      gsap.fromTo(dica,
        { autoAlpha: 0, y: amb.reduzido ? 0 : 8 },
        { autoAlpha: 1, y: 0, duration: 1.4, ease: curvas.branco.entrar });
    };
    espera(ESPERA_DICA).then(mostrarDica);
    // A dica passa a dizer outra coisa: a frase de antes sai e a nova entra no mesmo lugar.
    const trocarDica = (texto) => {
      if (terminado || texto === textoAgora) return;
      textoAgora = texto;
      if (dica.hidden) { mostrarDica(); return; }
      gsap.to(dica, {
        autoAlpha: 0, duration: 0.3, ease: 'none', overwrite: true,
        onComplete: () => {
          if (terminado) return;
          dica.hidden = true;
          mostrarDica();
        },
      });
    };

    // ---- chacoalhar (só a última carta) ---------------------------------------------
    const Movimento = typeof window !== 'undefined' ? window.DeviceMotionEvent : undefined;
    const podeChacoalhar = !!textoChacoalhar && !amb.reduzido && typeof Movimento !== 'undefined';
    let fase = '';                      // '' → 'pedindo' (a janela do sistema) → 'chacoalhar'
    let sensor = false;                 // já chegou alguma medida de verdade?
    let picos = [];
    let tremor = null;
    let bater = null;                   // o vibrar de mao.js, carregado no convite
    const aoMexer = (e) => {
      const a = e.acceleration;
      const g = e.accelerationIncludingGravity;
      let forca;
      if (a && a.x != null) forca = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
      else if (g && g.x != null) forca = Math.abs(Math.hypot(g.x || 0, g.y || 0, g.z || 0) - 9.81);
      else return;                      // (o computador às vezes manda um evento vazio)
      sensor = true;
      if (fase !== 'chacoalhar' || terminado || forca < FORCA_CHACOALHO || ctx.inventario?.aberto) return;
      const agora = performance.now();
      if (picos.length && agora - picos[picos.length - 1] < 90) return;      // o mesmo tranco
      picos = picos.filter((t) => agora - t < JANELA_CHACOALHO);
      picos.push(agora);
      if (picos.length < PICOS_CHACOALHO) return;
      try { bater?.(amb); } catch { /* sem háptico */ }
      concluir();
    };
    const pararTremor = () => {
      if (!tremor) return;
      tremor.kill();
      tremor = null;
      if (mundo.ok) gsap.to(env.grupo.rotation, { z: 0, duration: 0.18, ease: 'power2.out', overwrite: true });
    };
    const convidar = () => {
      if (terminado) return;
      fase = 'chacoalhar';
      picos = [];
      // (no iPhone os eventos só chegam a quem se inscreve depois da permissão)
      window.removeEventListener('devicemotion', aoMexer);
      window.addEventListener('devicemotion', aoMexer);
      import('./mao.js').then((m) => { bater = m.vibrar; }).catch(() => {});
      trocarDica(textoChacoalhar);
      // a carta treme de leve, de tempos em tempos, pedindo (sem WebGL: afunda duas vezes)
      tremor = gsap.timeline({ repeat: -1, repeatDelay: 1.5, delay: 0.5 });
      if (mundo.ok) {
        const r = env.grupo.rotation;
        tremor.to(r, { z: 0.045, duration: 0.09, ease: 'sine.out' })
          .to(r, { z: -0.04, duration: 0.12, ease: 'sine.inOut' })
          .to(r, { z: 0.03, duration: 0.12, ease: 'sine.inOut' })
          .to(r, { z: -0.018, duration: 0.12, ease: 'sine.inOut' })
          .to(r, { z: 0, duration: 0.2, ease: 'sine.out' });
      } else {
        tremor.call(() => env.pressionar?.(true), null, 0).call(() => env.pressionar?.(false), null, 0.14)
          .call(() => env.pressionar?.(true), null, 0.34).call(() => env.pressionar?.(false), null, 0.48)
          .to({}, { duration: 0.3 });
      }
      // ninguém chacoalhou: a dica volta a dizer que pode tocar (chacoalhar ainda vale)
      espera(ESPERA_CHACOALHO).then(() => {
        if (terminado) return;
        pararTremor();
        trocarDica(textoDica);
      });
    };
    /** Dentro do toque: pede o sensor. Devolve false se não há o que pedir (a carta abre já). */
    const pedirChacoalho = () => {
      if (typeof Movimento.requestPermission === 'function') {
        let pedido;
        try { pedido = Movimento.requestPermission(); } catch { return false; }
        fase = 'pedindo';
        som.destravar();
        Promise.resolve(pedido).then((r) => r === 'granted', () => false).then((sim) => {
          if (terminado) return;
          if (sim) convidar();
          else concluir();              // negou: abre como sempre
        });
        return true;
      }
      if (!sensor) return false;        // sem janela de permissão e sem medida nenhuma: não há sensor
      som.destravar();
      convidar();
      return true;
    };
    if (podeChacoalhar) window.addEventListener('devicemotion', aoMexer);

    const concluir = () => {
      if (terminado) return;
      terminado = true;
      som.destravar();                    // primeiro gesto: libera o áudio
      window.removeEventListener('devicemotion', aoMexer);
      pararTremor();
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
          autoAlpha: 0, duration: 0.4, ease: 'none', overwrite: true,
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
      if (acertou(e)) {
        // a última carta, no toque do dedo: o primeiro toque pede para chacoalhar; o segundo abre
        if (podeChacoalhar && !fase && e.pointerType === 'touch' && pedirChacoalho()) env.pressionar?.(false);
        else concluir();
      } else { env.pressionar?.(false); mostrarDica(); }      // tocou fora: mostra logo onde é
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
