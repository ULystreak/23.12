// Mundo leve: o mesmo contrato do mundo.js, sem WebGL.
// Pétalas em CSS dentro de <div id="mundo-leve">; a carta, o fio e a folha têm
// as suas variantes leves nos próprios arquivos (envelope.js, fio.js, folha.js).
//
// mundo.ok é false. Tudo o que é 3D (THREE, renderer, cena, camera) vem null;
// rig e os vetores devolvidos são objetos simples com x, y, z (vetorLeve e
// objetoLeve, em js/nucleo/util.js), para as cenas poderem escrever
// `obj.position.set(...)` sem testar o modo a cada linha.
//
// Convenção do modo leve: telaParaMundo devolve um vetor com .px e .py (posição
// em px de tela) e petalas.rajada aceita { px, py }.

import { clamp, vetorLeve, objetoLeve } from '../nucleo/util.js';
import { curvas } from '../nucleo/movimento.js';
import { criarPonteiro } from './mundo.js';

export function criarMundoLeve({ amb, canvas, recipienteLeve }) {
  const gsap = window.gsap;
  const recipiente = recipienteLeve || document.getElementById('mundo-leve');
  if (canvas) canvas.style.display = 'none';

  // ---- pétalas em CSS -----------------------------------------------------------
  const camada = document.createElement('div');
  camada.className = 'petalas-leve';
  const quantas = amb.reduzido ? 7 : 20;
  for (let i = 0; i < quantas; i++) {
    const p = document.createElement('i');
    p.className = 'petala-leve';
    const tamanho = 10 + Math.random() * 22;
    p.style.setProperty('--x', `${(Math.random() * 100).toFixed(1)}%`);
    p.style.setProperty('--tam', `${tamanho.toFixed(0)}px`);
    p.style.setProperty('--dur', `${((amb.reduzido ? 22 : 9) + Math.random() * 9).toFixed(1)}s`);
    p.style.setProperty('--atraso', `${(-Math.random() * 18).toFixed(1)}s`);
    p.style.setProperty('--deriva', `${(Math.random() * 16 - 4).toFixed(0)}vw`);
    p.style.setProperty('--giro', `${(Math.random() * 720 - 360).toFixed(0)}deg`);
    p.style.opacity = (0.45 + Math.random() * 0.5).toFixed(2);
    if (tamanho > 26) p.classList.add('petala-leve-perto');
    camada.append(p);
  }
  camada.style.opacity = '0';
  recipiente.append(camada);

  const petalas = {
    objeto: camada,
    definirDensidade(k) {
      camada.style.opacity = String(clamp(Number(k) || 0));
    },
    rajada(pos, n = 10) {
      if (!gsap) return;
      const cx = pos && Number.isFinite(pos.px) ? pos.px : innerWidth / 2;
      const cy = pos && Number.isFinite(pos.py) ? pos.py : innerHeight / 2;
      const quantia = Math.min(amb.reduzido ? 4 : n, 18);
      for (let i = 0; i < quantia; i++) {
        const p = document.createElement('i');
        p.className = 'petala-leve petala-leve-solta';
        p.style.setProperty('--tam', `${(10 + Math.random() * 12).toFixed(0)}px`);
        p.style.left = `${cx}px`;
        p.style.top = `${cy}px`;
        recipiente.append(p);
        const angulo = Math.random() * Math.PI * 2;
        const alcance = 60 + Math.random() * 140;
        gsap.fromTo(p,
          { x: 0, y: 0, rotation: 0, autoAlpha: 1, scale: 0.6 },
          {
            x: Math.cos(angulo) * alcance,
            y: Math.sin(angulo) * alcance + 90,
            rotation: Math.random() * 400 - 200,
            scale: 1,
            autoAlpha: 0,
            duration: 1.6 + Math.random(),
            ease: curvas.branco.entrar,
            onComplete: () => p.remove(),
          });
      }
    },
    atualizar() {},
    dispose() { camada.remove(); },
  };

  // ---- laço simples (só para quem registrou aoQuadro) ---------------------------------
  const ouvintes = new Set();
  const ponteiro = criarPonteiro(amb);
  let ligado = true;
  let idQuadro = 0;
  let ultimo = 0;
  let tempo = 0;

  function laco(agora) {
    idQuadro = requestAnimationFrame(laco);
    const dt = Math.min(Math.max(agora - ultimo, 0) / 1000, 0.05);
    ultimo = agora;
    tempo += dt;
    ponteiro.atualizar(dt);
    for (const fn of ouvintes) {
      try { fn(dt, tempo); } catch (erro) { ouvintes.delete(fn); console.error('[carta] aoQuadro falhou', erro); }
    }
  }
  function atualizarLaco() {
    cancelAnimationFrame(idQuadro);
    if (ligado && !document.hidden) {
      ultimo = performance.now();
      idQuadro = requestAnimationFrame(laco);
    }
    camada.classList.toggle('parada', !ligado);
  }
  document.addEventListener('visibilitychange', atualizarLaco);

  const rig = objetoLeve();
  let filaCaminhada = Promise.resolve();

  const mundo = {
    ok: false,
    amb,
    THREE: null,
    renderer: null,
    cena: objetoLeve(),
    camera: null,
    rig,
    canvas,
    recipienteLeve: recipiente,
    gpu: '',
    tamanho: { get largura() { return innerWidth; }, get altura() { return innerHeight; }, dpr: 1 },
    ponteiro,
    get ligado() { return ligado; },

    aoQuadro(fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },
    ligar() { ligado = true; atualizarLaco(); },
    desligar() { ligado = false; atualizarLaco(); },

    /** Sem câmera para andar: as pétalas respiram e o tempo da caminhada passa. */
    caminhar({ distancia = 6, duracao = 5, curva } = {}) {
      const andar = () => new Promise((resolver) => {
        if (!gsap || !(distancia > 0)) { resolver(); return; }
        const tempoReal = amb.reduzido ? Math.min(duracao, 1.6) : duracao;
        gsap.to(rig.position, { z: rig.position.z - distancia, duration: tempoReal, ease: curva || curvas.branco.camera, onComplete: resolver });
        if (!amb.reduzido) {
          gsap.fromTo(camada, { scale: 1 }, { scale: 1.12, duration: tempoReal, ease: curvas.branco.camera });
          gsap.to(camada, { scale: 1, duration: 1.2, delay: tempoReal, ease: curvas.branco.deriva });
        }
      });
      filaCaminhada = filaCaminhada.then(andar, andar);
      return filaCaminhada;
    },

    telaParaMundo(xNdc, yNdc, distancia = 1) {
      const v = vetorLeve(xNdc, yNdc, -distancia);
      v.px = (xNdc * 0.5 + 0.5) * innerWidth;
      v.py = (-yNdc * 0.5 + 0.5) * innerHeight;
      return v;
    },
    mundoParaTela(v) {
      return {
        x: v && Number.isFinite(v.px) ? v.px : innerWidth / 2,
        y: v && Number.isFinite(v.py) ? v.py : innerHeight / 2,
        visivel: true,
      };
    },
    retanguloParaPose() { return null; },
    aoMudarNivel() { return () => {}; },
    aoRedimensionar(fn) {
      const ouvir = () => fn(mundo.tamanho);
      window.addEventListener('resize', ouvir, { passive: true });
      return () => window.removeEventListener('resize', ouvir);
    },
    petalas,
  };

  atualizarLaco();
  return mundo;
}
