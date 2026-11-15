// O relógio do capítulo 2: escolhe quem pinta o céu (WebGL ou leve), amortece a
// hora e o cometa no tempo e desenha a cada quadro.
//
//   const tempo = criarTempo({ fundo, amb, aoQuadro, aoDividir })
//   tempo.definir({ hora, k, rol })   alvos vindos da rolagem (hora 0..1, k 0..2)
//   tempo.encerrar()                  o céu acaba de anoitecer (ao fechar)
//   tempo.redimensionar()
//   tempo.destruir()
//
// aoQuadro(estado) roda depois de cada quadro desenhado em que a hora mudou
// (é onde o capítulo acerta os véus dos textos). aoDividir() roda no instante em
// que o cometa se parte, uma vez a cada passagem para a frente.

import { clamp, suave } from '../../nucleo/util.js';
import { novoEstado, misturar, cometa } from './paleta.js';
import { criarPintorWebGL } from './ceu.js';
import { criarPintorLeve } from './ceu-leve.js';

export function criarTempo({ fundo, amb, aoQuadro, aoDividir }) {
  let pintor = amb.webgl ? criarPintorWebGL(fundo, amb) : null;
  if (!pintor) pintor = criarPintorLeve(fundo, amb);

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
  let parado = 0;              // quadros seguidos sem nada mudando

  // Qualidade adaptativa só do céu: se o quadro médio passar do limite, baixa a
  // resolução um degrau; se baixar não ajudar (tela de 30 Hz, modo de pouca
  // energia), para de tentar.
  let soma = 0;
  let conta = 0;
  let mediaAntes = 0;
  let desistiu = amb.forcado;

  function medirRitmo(dt) {
    if (desistiu || dt > 0.25) return;
    soma += dt; conta++;
    if (conta < 90) return;
    const media = soma / conta;
    soma = 0; conta = 0;
    if (media < 0.024) { mediaAntes = 0; return; }
    if (mediaAntes && media > mediaAntes * 0.88) { desistiu = true; return; }
    mediaAntes = media;
    if (!pintor.baixar()) desistiu = true;
  }

  function quadro(agora) {
    if (!vivo) return;
    id = requestAnimationFrame(quadro);
    const dt = anterior ? Math.min(0.1, (agora - anterior) / 1000) : 0.016;
    anterior = agora;

    // Com o céu parado (ela lendo), 30 quadros por segundo bastam para a deriva
    // das nuvens e o cintilar; com rolagem, todos os quadros.
    const mexendo = Math.abs(alvo.hora - hora) > 0.0004 || Math.abs(alvo.k - k) > 0.0004
      || Math.abs(alvo.rol - rol) > 0.002 || e.clarao > 0.003 || encerrando;
    parado = mexendo ? 0 : parado + 1;
    if (parado > 12 && parado % 2 === 1 && !primeira) { e.tempo += dt * (amb.reduzido ? 0.4 : 1); return; }

    if (primeira) {
      hora = alvo.hora; k = alvo.k; rol = alvo.rol;
      primeira = false;
    } else {
      const f = 1 - Math.exp(-dt * 6.5);
      hora += (alvo.hora - hora) * f;
      rol += (alvo.rol - rol) * (1 - Math.exp(-dt * 9));
      const kAntes = k;
      k += (alvo.k - k) * (1 - Math.exp(-dt * 8));
      if (kAntes < 1 && k >= 1) {
        e.clarao = 1;
        if (aoDividir) { try { aoDividir(); } catch (erro) { console.error(erro); } }
      }
    }
    if (encerrando) fim = Math.min(1, fim + dt / 1.1);

    e.tempo += dt * (amb.reduzido ? 0.4 : 1);
    e.clarao *= Math.exp(-dt * 2.4);
    if (e.clarao < 0.002) e.clarao = 0;
    e.fim = suave(fim);
    e.rol = amb.reduzido ? 0 : rol;

    // Quando o cometa vem, o céu já precisa estar escuro, seja qual for a ordem dos blocos.
    const horaCeu = Math.max(clamp(hora + 0.1 * e.fim), 0.62 * suave(k / 0.4));
    misturar(horaCeu, e);
    cometa(k, pintor.aspecto || 1, e.cometa);
    pintor.desenhar(e);

    if (aoQuadro && Math.abs(horaCeu - horaAvisada) > 0.002) {
      horaAvisada = horaCeu;
      try { aoQuadro(e); } catch (erro) { console.error(erro); }
    }
    medirRitmo(dt);
  }
  id = requestAnimationFrame(quadro);

  return {
    estado: e,
    get tipo() { return pintor.tipo; },

    definir({ hora: h, k: kk, rol: r }) {
      if (h !== undefined) alvo.hora = clamp(h);
      if (kk !== undefined) alvo.k = clamp(kk, 0, 2);
      if (r !== undefined) alvo.rol = r;
    },

    /** Põe o céu no alvo de uma vez (ao montar e depois de redimensionar). */
    assentar() { primeira = true; },

    encerrar() { encerrando = true; },

    redimensionar() { pintor.redimensionar(); },

    destruir() {
      vivo = false;
      cancelAnimationFrame(id);
      pintor.destruir();
    },
  };
}
