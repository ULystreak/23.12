/* ============================================================================
   CARTA: a cena do envelope que chega, espera o toque e abre
   ============================================================================
   Usada três vezes: a carta de coração (poppy, em `inicio`), a de estrela
   (yourname, em `carta2`) e a última, branca e amarrada só com o fio
   (final.js). Ela caminha até a carta (ou já a encontra perto), a carta chega
   e para numa pose calculada, a cena espera o toque (na última, o chacoalhar
   do celular), a carta abre e, com `entregar`, o papel voa até o pergaminho.

   O envelope vem de criarEnvelope (js/mundo/envelope.js), 3D ou leve, com a
   mesma API. Se `estado.envelope` já tem uma carta igual e fechada, ela é
   reaproveitada. Etapas: caminhada → carta-chegando → carta-espera →
   carta-abrindo → papel. Gancho: [data-acao="abrir-carta"] (o alvo de foco).
   ========================================================================== */

import { clamp, el, espera, lerp, pxParaNdc, vibrar } from '../nucleo/util.js';
import { curvas } from '../nucleo/movimento.js';
import { criarEnvelope } from '../mundo/envelope.js';

const ALTURA_OLHOS = 1.5; // m; igual a mundo.js
const LARGURA_CARTA = 0.23; // o envelope tem 23 × 16 cm
const ALTURA_CARTA = 0.16;
const ESPERA_DICA = 4000; // ms sem toque até a dica aparecer
const LONGE = 2.6; // m: a carta nasce além do ponto de parada e vem até ele
const BAIXAR = 0.12; // a carta para um nada abaixo dos olhos (em meias-alturas da tela)
// Chacoalhar: parado dá perto de 0 m/s²; andando com o aparelho na mão, 2 a 5;
// um chacoalhão leve passa de 14. Três picos em 1 s, com 90 ms entre eles.
const FORCA_CHACOALHO = 11;
const PICOS_CHACOALHO = 3;
const JANELA_CHACOALHO = 1000;
const ENTRE_PICOS = 90;
const ESPERA_CHACOALHO = 10000; // ms: depois disso a dica volta a pedir o toque
const DEPOIS_DO_CONVITE = 600; // ms: o segundo toque de um toque duplo não abre
const ARRASTO = 14; // px: o dedo andou mais que isso, é arrasto

// A dica é luar sobre um véu anil que se desfaz nas bordas (sem caixa nem
// filete: não é botão), centrada e do tamanho do texto.
const ESTILO_DICA = {
  fontFamily: 'var(--fonte-titulo)',
  fontWeight: '500',
  letterSpacing: '0.07em',
  fontSize: 'clamp(1rem, 0.94rem + 0.3vw, 1.125rem)',
  color: 'var(--luar)',
  width: 'fit-content',
  maxWidth: 'calc(100% - 2 * var(--margem))',
  marginInline: 'auto',
  padding: '14px 34px 12px',
  background: 'radial-gradient(closest-side, rgba(11, 16, 38, 0.82), rgba(11, 16, 38, 0.66) 62%, rgba(11, 16, 38, 0))',
};

// O anel de foco só aparece com teclado: um toque nunca mostra anel. O teclado
// numérico do iPhone dispara keydown na senha, por isso #entrada não conta.
let usouTeclado = false;
function aoTeclar(e) {
  if (e.target?.closest?.('#entrada')) return;
  usouTeclado = true;
  window.removeEventListener('keydown', aoTeclar, true);
}
window.addEventListener('keydown', aoTeclar, true);

const meiaTela = (mundo) => Math.tan(((mundo?.camera?.fov || 58) * Math.PI) / 360);

/** A distância em que a carta ocupa 72% da largura em pé e 28% deitado, nunca mais de 46% da altura. */
function distanciaDaCarta(mundo) {
  const camera = mundo?.camera;
  if (!camera) return 0.62;
  const aspecto = camera.aspect || 1;
  const meia = meiaTela(mundo);
  const fracao = lerp(0.72, 0.28, clamp((aspecto - 0.75) / 0.75));
  const pelaLargura = LARGURA_CARTA / (fracao * 2 * meia * aspecto);
  const pelaAltura = ALTURA_CARTA / (0.46 * 2 * meia);
  return Math.max(pelaLargura, pelaAltura, 0.4);
}

/** Onde a carta para: à frente dos olhos, `baixar` meias-alturas da tela abaixo deles. */
export function poseParada(mundo, baixar = BAIXAR, zOlhos = mundo.rig.position.z) {
  const d = distanciaDaCarta(mundo);
  return {
    x: mundo.rig.position.x,
    y: ALTURA_OLHOS - d * meiaTela(mundo) * baixar,
    z: zOlhos - d,
  };
}

const temaValido = (t) => (t === 'poppy' || t === 'yourname' ? t : null);

export async function cenaCarta(ctx, opcoes = {}) {
  const {
    tema = null,
    lacre = 'coracao',
    amarracao = 'cordao',
    distancia = 7,
    entregar = true,
    anunciarCaminhada = true,
    baixar = BAIXAR,
    chacoalhar = '',
  } = opcoes;
  const { mundo, estado, diretor, som, pergaminho } = ctx;
  const gsap = ctx.gsap || window.gsap;
  const metros = Math.max(0, Number(distancia) || 0);
  const duracao = metros > 0 ? 2.4 + 0.6 * metros : 0;

  // Uma carta igual e ainda fechada (por exemplo, na mão dele) é reaproveitada.
  const anterior = estado.envelope;
  const reaproveitada = !!anterior && !anterior.aberto && !anterior.descartado
    && anterior.amarracao === amarracao
    && (anterior.lacre ?? null) === (lacre ?? null)
    && temaValido(anterior.tema) === temaValido(tema);

  let env = anterior;
  if (!reaproveitada) {
    if (anterior) {
      estado.envelope = null;
      Promise.resolve(anterior.irEmbora?.()).then(() => anterior.dispose?.()).catch(() => {});
    }
    env = criarEnvelope(mundo, { tema, lacre, amarracao, chegada: false });
    estado.envelope = env;
  }
  env.aoMarco = (marco) => {
    if (marco === 'lacre' || marco === 'papel') som?.efeito?.(marco);
  };

  let pronta = Promise.resolve(env.preparar?.()).catch(() => {});
  if (mundo.ok) {
    mundo.petalas?.preparar?.();
    const pose = poseParada(mundo, baixar, mundo.rig.position.z - metros);
    if (reaproveitada) {
      gsap.to(env.grupo.position, { ...pose, duration: Math.max(1.6, duracao), ease: curvas.branco.camera });
    } else {
      env.grupo.position.set(pose.x, pose.y, pose.z);
      // O grupo só entra na cena depois de compilado: o primeiro quadro não engasga.
      pronta = pronta.then(() => {
        if (!env.descartado && !env.grupo.parent) mundo.cena.add(env.grupo);
      });
    }
  }

  const parar = mundo.aoQuadro((dt, t) => env.atualizar?.(dt, t));
  // Nada desfocado passa entre a lente e a carta, nem ao abrir.
  mundo.petalas?.protegerRetangulo?.(() => {
    const c = env.caixaTela?.();
    return c && {
      left: c.left - c.width * 0.18,
      right: c.right + c.width * 0.18,
      top: c.top - c.height * 1.4,
      bottom: c.bottom + c.height * 0.25,
    };
  });

  if (metros > 0) {
    diretor.etapa(anunciarCaminhada ? 'caminhada' : 'carta-chegando');
    const frases = document.getElementById('frases');
    const vazio = !frases || frases.children.length === 0;
    // Com frase na tela, a carta espera mais para começar a chegar.
    const inicio = duracao * (anunciarCaminhada ? (vazio ? 0.28 : 0.5) : 0.25);
    const andar = mundo.caminhar({ distancia: metros, duracao });
    // A reaproveitada já está à vista: chegar de novo a faria pular para longe.
    if (!reaproveitada) env.chegar?.({ duracao: duracao - inicio + 0.8, distancia: LONGE, atraso: inicio });
    if (anunciarCaminhada) {
      espera(inicio * 1000).then(() => {
        if (diretor.etapa() === 'caminhada') diretor.etapa('carta-chegando');
      });
    }
    await Promise.all([andar, pronta]);
    await espera(500);
  } else {
    diretor.etapa('carta-chegando');
    await pronta;
    if (reaproveitada) {
      await espera(1200);
    } else {
      const chegada = env.chegar?.({ duracao: 2.6, distancia: 3.6 });
      await (typeof chegada?.then === 'function' ? chegada : espera(2600));
    }
  }

  diretor.etapa('carta-espera');
  await esperarToque(ctx, env, baixar, chacoalhar);

  diretor.etapa('carta-abrindo');
  const { papel } = await env.abrir();
  mundo.petalas?.protegerRetangulo?.(null);

  // Quem segura a carta (final.js) chama parar() quando acabar.
  if (!entregar) return { env, papel, parar };

  diretor.etapa('papel');
  som?.efeito?.('papel');
  await env.entregarPapel(pergaminho.retanguloAlvo());
  await pergaminho.receberPapel();
  if (papel) papel.visible = false;
  parar();
  return { env, papel, parar };
}

/* ---- a espera: alvo de foco, dica, toques e chacoalhar ------------------------ */

function esperarToque(ctx, env, baixar, textoChacoalhar) {
  const { conteudo, mundo, som, amb, inventario } = ctx;
  const gsap = ctx.gsap || window.gsap;
  const acoes = document.getElementById('acoes');
  const dica = document.getElementById('dica');
  const textoDica = conteudo?.abertura?.dicaCarta || '';
  const mouseFino = !!window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches;
  const naMao = baixar > BAIXAR && mundo.ok;
  // Na última carta a dica fica acima do laço, nunca no rosto dele. Sem 3D, com
  // a figura dele pintada, ela fica embaixo.
  const dicaAcima = env.amarracao === 'fio' && (mundo.ok || !document.querySelector('.ele-leve'));
  const DM = window.DeviceMotionEvent;
  const podeChacoalhar = !!textoChacoalhar && !amb?.reduzido && typeof DM !== 'undefined';
  const pedePermissao = typeof DM?.requestPermission === 'function';

  return new Promise((resolve) => {
    let terminado = false;
    let fase = ''; // '' | 'pedindo' | 'chacoalhar'
    let convidadoEm = 0;
    let inicio = null;
    let apertado = false;
    let sobre = false;
    let tremor = null;
    let picos = [];
    let ultimoPico = 0;
    let mediuSensor = false;
    let dicaVisivel = false;
    let textoAtual = '';
    let geracaoDica = 0;
    const cancelar = [];
    const ouvir = (alvo, evento, fn, op) => {
      alvo.addEventListener(evento, fn, op);
      cancelar.push(() => alvo.removeEventListener(evento, fn, op));
    };

    // O alvo invisível dá foco e nome; a dica visível fica aria-hidden para não repetir.
    const alvo = el('button', {
      type: 'button',
      class: 'alvo-carta',
      'aria-label': textoDica || null,
      dataset: { acao: 'abrir-carta' },
    });
    acoes?.append(alvo);
    dica?.setAttribute('aria-hidden', 'true');
    if (!document.activeElement || document.activeElement === document.body) {
      alvo.focus({ preventScroll: true, focusVisible: usouTeclado });
    }

    // Com a carta na mão, o topo vem da pose (distância e altura do cartão), não
    // da caixa do instante; nas outras, da caixa que está na tela.
    const caixaDaDica = () => {
      if (!naMao) return env.caixaTela?.() || null;
      const A = innerHeight;
      const altura = (ALTURA_CARTA / (2 * distanciaDaCarta(mundo) * meiaTela(mundo))) * A;
      const centro = (A / 2) * (1 + baixar);
      return { top: centro - altura / 2, bottom: centro + altura / 2, height: altura };
    };

    const posicionarDica = () => {
      const c = caixaDaDica();
      if (!c || !dica) return;
      let folga = Math.max(22, c.height * 0.14);
      if (dicaAcima) {
        if (naMao) folga *= 2;
        Object.assign(dica.style, { top: 'auto', bottom: `${Math.max(16, innerHeight - c.top + folga)}px` });
      } else {
        if (mouseFino) folga += 56;
        Object.assign(dica.style, { bottom: 'auto', top: `${Math.min(innerHeight - 64, c.bottom + folga)}px` });
      }
    };

    const posicionar = () => {
      const c = env.caixaTela?.();
      if (c) {
        Object.assign(alvo.style, {
          left: `${c.left}px`, top: `${c.top}px`, width: `${c.width}px`, height: `${c.height}px`, transform: 'none',
        });
      }
      if (dicaVisivel) posicionarDica();
    };

    const mostrarDica = (texto = textoDica) => {
      if (terminado || !texto || !dica) return;
      if (dicaVisivel && texto === textoAtual) return;
      const minha = ++geracaoDica;
      const entrar = () => {
        if (minha !== geracaoDica || terminado) return;
        textoAtual = texto;
        dica.textContent = texto;
        Object.assign(dica.style, ESTILO_DICA);
        dica.hidden = false;
        dicaVisivel = true;
        posicionarDica();
        gsap.fromTo(dica, { autoAlpha: 0, y: amb?.reduzido ? 0 : 8 }, {
          autoAlpha: 1, y: 0, duration: 1.4, ease: curvas.branco.entrar, overwrite: true,
        });
      };
      if (dicaVisivel) gsap.to(dica, { autoAlpha: 0, duration: 0.3, ease: 'none', overwrite: true, onComplete: entrar });
      else entrar();
    };

    // A carta "na mão" fica mais baixa; o toque na altura de sempre também vale.
    const acertou = (x, y) => {
      const n = pxParaNdc(x, y);
      if (env.acertou?.(n.x, n.y)) return true;
      return baixar > BAIXAR && !!env.acertou?.(n.x, n.y - (baixar - BAIXAR));
    };
    // A bolsa abre por cima da carta: toque nela ou no mini não conta.
    const foraDaCarta = (e) => !!inventario?.aberto || !!e.target?.closest?.('#mini, #inventario');

    const soltar = () => {
      if (!apertado) return;
      apertado = false;
      env.pressionar?.(false);
    };

    const marcarSobre = (sim) => {
      if (sim === sobre) return;
      sobre = sim;
      document.documentElement.style.cursor = sim ? 'pointer' : '';
      if (!mundo.ok || amb?.reduzido) return;
      const k = sim ? 1.025 : 1;
      gsap.to(env.grupo.scale, { x: k, y: k, z: k, duration: sim ? 0.35 : 0.5, ease: curvas.branco.entrar, overwrite: 'auto' });
    };

    const tremer = () => {
      tremor?.kill();
      tremor = gsap.timeline({ repeat: -1, repeatDelay: 1.5, delay: 0.5 });
      if (mundo.ok) {
        const r = env.grupo.rotation;
        tremor
          .to(r, { z: 0.045, duration: 0.09, ease: 'sine.out' })
          .to(r, { z: -0.04, duration: 0.12, ease: 'sine.inOut' })
          .to(r, { z: 0.03, duration: 0.12, ease: 'sine.inOut' })
          .to(r, { z: -0.018, duration: 0.12, ease: 'sine.inOut' })
          .to(r, { z: 0, duration: 0.2, ease: 'sine.out' });
      } else {
        // Sem 3D a carta não gira: quatro apertos curtos fazem o tremor.
        tremor
          .call(() => env.pressionar?.(true), null, 0)
          .call(() => env.pressionar?.(false), null, 0.14)
          .call(() => env.pressionar?.(true), null, 0.34)
          .call(() => env.pressionar?.(false), null, 0.48)
          .to({}, { duration: 0.3 });
      }
    };

    const concluir = () => {
      if (terminado) return;
      terminado = true;
      som?.destravar?.();
      for (const fn of cancelar) fn();
      window.removeEventListener('devicemotion', aoMexer);
      if (tremor) {
        tremor.kill();
        tremor = null;
        if (mundo.ok) gsap.to(env.grupo.rotation, { z: 0, duration: 0.18, ease: 'sine.out' });
        else env.pressionar?.(false); // o tremor sem 3D pode ter parado num aperto
      }
      if (sobre) marcarSobre(false);
      document.documentElement.style.cursor = '';
      alvo.remove();
      geracaoDica++;
      if (dica) {
        // Sem desfazer aria-hidden e style, a dica ficaria muda e presa na posição.
        const limpar = () => {
          dica.hidden = true;
          dica.textContent = '';
          dica.removeAttribute('style');
          dica.removeAttribute('aria-hidden');
        };
        if (dicaVisivel) gsap.to(dica, { autoAlpha: 0, duration: 0.4, ease: 'none', overwrite: true, onComplete: limpar });
        else limpar();
      }
      resolve();
    };

    function aoMexer(e) {
      const a = e.acceleration;
      const g = e.accelerationIncludingGravity;
      let forca = null;
      if (Number.isFinite(a?.x)) forca = Math.hypot(a.x, a.y || 0, a.z || 0);
      else if (Number.isFinite(g?.x)) forca = Math.abs(Math.hypot(g.x, g.y || 0, g.z || 0) - 9.81);
      if (forca === null) return;
      mediuSensor = true;
      if (fase !== 'chacoalhar' || terminado || inventario?.aberto) return;
      const agora = performance.now();
      if (forca < FORCA_CHACOALHO || agora - ultimoPico < ENTRE_PICOS) return; // é o mesmo tranco
      ultimoPico = agora;
      picos = picos.filter((t) => agora - t < JANELA_CHACOALHO);
      picos.push(agora);
      if (picos.length >= PICOS_CHACOALHO) {
        vibrar(amb);
        concluir();
      }
    }

    const convidar = () => {
      if (terminado) return;
      fase = 'chacoalhar';
      convidadoEm = performance.now();
      // No iPhone, os eventos só chegam a quem se inscreve depois da permissão.
      window.removeEventListener('devicemotion', aoMexer);
      window.addEventListener('devicemotion', aoMexer);
      mostrarDica(textoChacoalhar);
      tremer();
      espera(ESPERA_CHACOALHO).then(() => {
        if (!terminado) mostrarDica(textoDica);
      });
    };

    // Chacoalhar nunca prende: negado ou sem sensor, o toque abre.
    const pedirSensor = () => {
      if (pedePermissao) {
        fase = 'pedindo';
        som?.destravar?.();
        let pedido;
        try {
          pedido = DM.requestPermission(); // só dentro do toque
        } catch {
          concluir();
          return;
        }
        Promise.resolve(pedido).then(
          (resposta) => (resposta === 'granted' ? convidar() : concluir()),
          () => concluir(),
        );
      } else if (mediuSensor) {
        convidar();
      } else {
        concluir();
      }
    };

    ouvir(window, 'pointerdown', (e) => {
      if (terminado || foraDaCarta(e)) return;
      inicio = { x: e.clientX, y: e.clientY };
      if (acertou(e.clientX, e.clientY)) {
        apertado = true;
        env.pressionar?.(true);
      }
    });
    ouvir(window, 'pointerup', (e) => {
      if (terminado || !inicio) return;
      const de = inicio;
      inicio = null;
      if (Math.hypot(e.clientX - de.x, e.clientY - de.y) > ARRASTO) {
        soltar();
        return;
      }
      if (!acertou(e.clientX, e.clientY)) {
        soltar();
        mostrarDica();
        return;
      }
      if (e.pointerType === 'touch' && fase === '' && podeChacoalhar) {
        soltar();
        pedirSensor();
        return;
      }
      if (fase === 'chacoalhar' && performance.now() - convidadoEm < DEPOIS_DO_CONVITE) {
        soltar();
        return;
      }
      concluir();
    });
    ouvir(window, 'pointercancel', () => {
      inicio = null;
      soltar();
    });
    ouvir(window, 'pointermove', (e) => {
      if (e.pointerType !== 'mouse' || terminado) return;
      marcarSobre(!foraDaCarta(e) && acertou(e.clientX, e.clientY));
    }, { passive: true });
    ouvir(window, 'pointerout', (e) => {
      if (e.pointerType === 'mouse' && !e.relatedTarget) marcarSobre(false);
    });
    // Enter, Espaço e leitor de tela.
    ouvir(alvo, 'click', () => {
      if (!inventario?.aberto) concluir();
    });
    // No Android não há pedido de permissão: basta saber se o sensor mede.
    if (podeChacoalhar && !pedePermissao) window.addEventListener('devicemotion', aoMexer);

    const pararTamanho = mundo.aoRedimensionar?.(() => {
      if (terminado) return;
      if (!mundo.ok) {
        posicionar();
        return;
      }
      const pose = poseParada(mundo, baixar);
      if (amb?.reduzido) {
        env.grupo.position.set(pose.x, pose.y, pose.z);
        posicionar();
      } else {
        gsap.to(env.grupo.position, { ...pose, duration: 0.6, ease: curvas.branco.entrar, onComplete: posicionar });
      }
    });
    if (pararTamanho) cancelar.push(pararTamanho);

    posicionar();
    espera(ESPERA_DICA).then(() => mostrarDica());
  });
}
