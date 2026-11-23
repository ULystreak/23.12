/* ============================================================================
   TEMPO: o relógio do céu do capítulo 2
   ============================================================================
   O céu começa sempre pelo pintor leve (montar fica barato e a folha desenrola
   sem engasgo). Com WebGL, o contexto e o shader são criados depois, numa hora
   calma (`quando`), compilados sem segurar a thread principal, e o canvas entra
   por cima do céu leve com uma dissolvência; aí o leve sai. Sem WebGL afinal,
   o céu leve completo (com nuvens e estrelas) entra do mesmo jeito.

   A cada quadro: amortece a hora, a rolagem e o cometa rumo aos alvos que
   yourname.js define, mistura a paleta e desenha. Com o céu parado (ela
   lendo), 30 quadros por segundo bastam para a deriva das nuvens e o cintilar;
   com rolagem, todos os quadros.

   Qualidade adaptativa só do céu: se o quadro médio passar do limite, baixa a
   resolução do WebGL um degrau; se baixar não ajudar (tela de 30 Hz, modo de
   pouca energia), para de tentar.
   ========================================================================== */

import { clamp, suave } from '../../nucleo/util.js';
import { novoEstado, misturar, cometa } from './paleta.js';
import { criarPintorWebGL } from './ceu.js';
import { criarPintorLeve } from './ceu-leve.js';

// Segundos da troca do céu leve pelo WebGL.
const DISSOLVER = 0.9;

export function criarTempo({ fundo, amb = {}, aoQuadro, aoDividir, quando, aoTrocar }) {
  const reduzido = !!amb.reduzido;
  let pintor = criarPintorLeve(fundo, amb, { provisorio: !!amb.webgl });
  let entrando = null;
  let dissolve = 0;
  const e = novoEstado();
  const alvo = { hora: 0, k: 0, rol: 0 };
  let hora = 0;
  let k = 0;
  let rol = 0;
  let fim = 0;
  let encerrando = false;
  let primeira = true;
  let anterior = 0;
  let id = 0;
  let vivo = true;
  let horaAvisada = -1;
  let parado = 0;
  let soma = 0;
  let conta = 0;
  let mediaAntes = 0;
  // Com ?nivel= na URL a qualidade é a pedida: não se adapta.
  let desistiu = !!amb.forcado;

  function medirRitmo(dt) {
    if (desistiu || entrando || dt > 0.25) return;
    soma += dt;
    conta += 1;
    if (conta < 90) return;
    const media = soma / conta;
    soma = 0;
    conta = 0;
    // Mais de 41 quadros por segundo: está bom; a referência recomeça.
    if (media < 0.024) {
      mediaAntes = 0;
      return;
    }
    // Baixar da última vez não deixou o quadro pelo menos 12% mais rápido: para.
    if (mediaAntes && media > mediaAntes * 0.88) {
      desistiu = true;
      return;
    }
    mediaAntes = media;
    if (!pintor.baixar()) desistiu = true;
  }

  function dissolver(dt) {
    entrando.desenhar(e);
    dissolve = reduzido ? 1 : Math.min(1, dissolve + dt / DISSOLVER);
    entrando.tela.style.opacity = suave(dissolve).toFixed(3);
    if (dissolve < 1) return;
    entrando.tela.style.opacity = '';
    const velho = pintor;
    pintor = entrando;
    entrando = null;
    velho.destruir();
    soma = 0;
    conta = 0;
    mediaAntes = 0;
    desistiu = !!amb.forcado;
    aoTrocar?.(pintor.tipo);
  }

  function quadro(agora) {
    if (!vivo) return;
    id = requestAnimationFrame(quadro);
    const dt = anterior ? Math.min(0.1, (agora - anterior) / 1000) : 0.016;
    anterior = agora;
    e.tempo += dt * (reduzido ? 0.4 : 1);

    const mexendo = primeira || !!entrando || e.clarao > 0 || (encerrando && fim < 1)
      || Math.abs(alvo.hora - hora) > 1e-4 || Math.abs(alvo.k - k) > 1e-4 || Math.abs(alvo.rol - rol) > 1e-3;
    parado = mexendo ? 0 : parado + 1;
    // Parado, os quadros ímpares só deixam o relógio andar.
    if (parado > 12 && parado % 2) return;

    const kAntes = k;
    if (primeira) {
      primeira = false;
      hora = alvo.hora;
      k = alvo.k;
      rol = alvo.rol;
    } else {
      hora += (alvo.hora - hora) * (1 - Math.exp(-6.5 * dt));
      rol += (alvo.rol - rol) * (1 - Math.exp(-9 * dt));
      k += (alvo.k - k) * (1 - Math.exp(-8 * dt));
    }
    if (kAntes < 1 && k >= 1) {
      e.clarao = 1;
      aoDividir?.();
    }
    if (e.clarao > 0) {
      e.clarao *= Math.exp(-2.4 * dt);
      if (e.clarao < 0.002) e.clarao = 0;
    }
    if (encerrando) fim = Math.min(1, fim + dt / 1.1);
    e.fim = suave(fim);
    e.rol = reduzido ? 0 : rol;

    // Quando o cometa vem, o céu já precisa estar escuro, seja qual for a ordem dos blocos.
    const horaCeu = Math.max(clamp(hora + 0.1 * e.fim), 0.62 * suave(k / 0.4));
    misturar(horaCeu, e);
    cometa(k, pintor.aspecto, e.cometa);
    pintor.desenhar(e);
    if (entrando) dissolver(dt);
    if (Math.abs(horaCeu - horaAvisada) > 0.002) {
      horaAvisada = horaCeu;
      aoQuadro?.(e);
    }
    medirRitmo(dt);
  }

  // Mais um respiro antes do contexto novo: a GPU não pode estar ocupada.
  const ocioso = () => new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 600 });
    else setTimeout(resolve, 120);
  });

  async function trazerWebGL() {
    try {
      await quando;
    } catch {
      /* a liberação falhou: o céu vem assim mesmo */
    }
    if (!vivo) return;
    await ocioso();
    if (!vivo) return;
    let novo = null;
    try {
      novo = criarPintorWebGL(fundo, amb);
      if (novo && !(await novo.pronto)) {
        novo.destruir();
        novo = null;
      }
    } catch (erro) {
      console.warn('[carta] o céu em WebGL não montou', erro);
      novo?.destruir();
      novo = null;
    }
    if (!vivo) {
      novo?.destruir();
      return;
    }
    novo ||= criarPintorLeve(fundo, amb);
    novo.tela.style.opacity = '0';
    novo.desenhar(e);
    entrando = novo;
    dissolve = 0;
  }

  id = requestAnimationFrame(quadro);
  if (amb.webgl) trazerWebGL();

  return {
    estado: e,
    get tipo() {
      return pintor.tipo;
    },
    definir({ hora: h, k: kk, rol: r } = {}) {
      if (h !== undefined) alvo.hora = clamp(h);
      if (kk !== undefined) alvo.k = clamp(kk, 0, 2);
      if (r !== undefined) alvo.rol = r;
    },
    // O próximo quadro põe o céu direto no alvo, sem amortecer.
    assentar() {
      primeira = true;
    },
    encerrar() {
      encerrando = true;
    },
    redimensionar() {
      pintor.redimensionar();
      entrando?.redimensionar();
    },
    destruir() {
      vivo = false;
      cancelAnimationFrame(id);
      pintor.destruir();
      entrando?.destruir();
      entrando = null;
    },
  };
}
