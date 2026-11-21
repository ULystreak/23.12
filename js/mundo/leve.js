// Mundo leve: o mesmo contrato do mundo.js, sem WebGL.
// É o que ela vê se o WebGL do aparelho faltar ou morrer no meio: precisa ser
// bonito por conta própria, não um resto.
//
// Pétalas em <div id="mundo-leve">, em três camadas de profundidade:
//   longe   pequenas e nítidas, lentas, somem perto do horizonte
//   meio    as que se leem como pétala: desenhadas, com luz e nervura
//   perto   poucas, enormes, já desenhadas macias (nenhum filtro roda em tempo real)
// e as do chão, deitadas, que dão o horizonte. Cada pétala é uma imagem pintada
// uma vez num canvas 2D (o desfoque das macias também é pintado uma vez); o que
// se move depois é só transform e opacity, em animações de CSS.
// A caminhada é um avanço das camadas: cada uma cresce a partir do horizonte no
// seu ritmo (a de perto muito, a de longe quase nada) e dá lugar a uma camada
// nova que vem do fundo.
//
// mundo.ok é false. Tudo o que é 3D (THREE, renderer, cena, camera) vem null;
// rig e os vetores devolvidos são objetos simples com x, y, z (vetorLeve e
// objetoLeve, em js/nucleo/util.js), para as cenas poderem escrever
// `obj.position.set(...)` sem testar o modo a cada linha.
//
// Convenção do modo leve: telaParaMundo devolve um vetor com .px e .py (posição
// em px de tela) e petalas.rajada aceita { px, py }.

import { clamp, vetorLeve, objetoLeve, semente, espera } from '../nucleo/util.js';
import { curvas } from '../nucleo/movimento.js';
import { criarPonteiro, curvaDaCaminhada } from './mundo.js';
import { criarHora } from './hora.js';

// Contornos (caixa de 100×100, a base da pétala embaixo): colher larga e mais
// alta que larga, de lados cheios e base curta e cega (onde prendia na flor);
// a primeira e a terceira com um entalhe raso e arredondado fora do centro.
// Lados retos que convergem numa ponta, ou entalhe fundo no meio, leem como
// coração, e isso a pétala não pode ser.
const CONTORNOS = [
  'M50 94C41 94 36 89 33 81C28 69 15 57 15 39C15 20 30 7 45 7C48 7 49 9 51.5 9C54 9 55 6.5 59 6.5C75 7 86 20 85 39C85 57 72 69 67 81C64 89 59 94 50 94Z',
  'M48 94C40 93 36 88 34 80C30 67 18 56 19 37C20 18 33 6 50 6C67 6 81 18 81 37C81 56 68 68 64 80C61 89 56 95 48 94Z',
  'M52 93C43 94 38 89 35 81C30 68 12 58 12 40C12 22 26 10 42 9C51 9 54 11.5 58 11.5C61 11.5 62 9.5 66 9.5C80 10 90 24 89 40C88 58 74 69 69 81C66 89 60 93 52 93Z',
];

function novaTela(tam) {
  const tela = document.createElement('canvas');
  tela.width = tam;
  tela.height = tam;
  const g = tela.getContext('2d');
  return g ? { tela, g } : null;
}

/** Pétala nítida: base escura, margem viva, a sombra do côncavo, a luz do alto e a nervura. */
function pintarNitida(tam, contorno, noChao = false) {
  const t = novaTela(tam);
  if (!t) return '';
  const { tela, g } = t;
  const k = (tam / 100) * 0.84;
  const borda = tam * 0.08;
  const caminho = new Path2D(contorno);

  if (noChao) {
    // sombra de contato: uma mancha escura mínima, deslocada um nada
    g.save();
    g.shadowColor = 'rgba(42, 27, 34, 0.2)';
    g.shadowBlur = tam * 0.07;
    g.shadowOffsetX = tam * 3 + tam * 0.03;
    g.shadowOffsetY = tam * 0.05;
    g.translate(-tam * 3 + borda, borda);
    g.scale(k, k);
    g.fill(caminho);
    g.restore();
  }

  g.translate(borda, borda);
  g.scale(k, k);
  const cor = g.createLinearGradient(50, 92, 50, 8);
  cor.addColorStop(0, '#650920');
  cor.addColorStop(0.42, '#a01035');
  cor.addColorStop(1, '#cb1c4d');
  g.fillStyle = cor;
  g.fill(caminho);

  g.save();
  g.clip(caminho);
  const fundo = g.createRadialGradient(50, 62, 3, 50, 58, 40);
  fundo.addColorStop(0, 'rgba(66, 4, 22, 0.3)');
  fundo.addColorStop(1, 'rgba(66, 4, 22, 0)');
  g.fillStyle = fundo;
  g.fillRect(0, 0, 100, 100);
  const luz = g.createRadialGradient(34, 26, 2, 38, 34, 46);
  luz.addColorStop(0, 'rgba(255, 156, 180, 0.36)');
  luz.addColorStop(1, 'rgba(255, 156, 180, 0)');
  g.fillStyle = luz;
  g.fillRect(0, 0, 100, 100);
  g.strokeStyle = 'rgba(78, 6, 26, 0.2)';
  g.lineWidth = 1.1;
  g.beginPath();
  g.moveTo(50, 90);
  g.quadraticCurveTo(52.5, 55, 50, 20);
  g.stroke();
  g.strokeStyle = 'rgba(238, 104, 136, 0.5)';      // a margem é mais fina e deixa passar luz
  g.lineWidth = 2.6;
  g.stroke(caminho);
  g.restore();

  return tela.toDataURL('image/png');
}

/**
 * Pétala fora de foco, pintada uma vez. O desenho fica fora do canvas e só a
 * "sombra" dele (que o canvas desfoca) cai dentro: funciona em todo navegador,
 * ao contrário de ctx.filter. Se a sombra não vier, cai para um degradê redondo.
 */
function pintarMacia(tam, contorno, desfoque, alfa) {
  const t = novaTela(tam);
  if (!t) return '';
  const { tela, g } = t;
  const escala = 1 - desfoque * 2.7;
  const k = (tam / 100) * escala;
  const borda = (tam * (1 - escala)) / 2;
  const caminho = new Path2D(contorno);
  const longe = tam * 3;

  const passar = (cor, raio, encolhe) => {
    g.save();
    g.shadowColor = cor;
    g.shadowBlur = tam * raio;
    g.shadowOffsetX = longe;
    g.translate(-longe + borda + (tam * escala * (1 - encolhe)) / 2, borda + (tam * escala * (1 - encolhe)) / 2);
    g.scale(k * encolhe, k * encolhe);
    g.fill(caminho);
    g.restore();
  };
  passar(`rgba(204, 44, 84, ${alfa})`, desfoque, 1);
  passar(`rgba(160, 18, 56, ${alfa * 0.45})`, desfoque * 0.9, 0.6);      // o miolo um pouco mais fundo

  let veio = false;
  try { veio = g.getImageData(tam >> 1, tam >> 1, 1, 1).data[3] > 8; } catch { veio = true; }
  if (!veio) {
    g.clearRect(0, 0, tam, tam);
    const mancha = g.createRadialGradient(tam / 2, tam / 2, 0, tam / 2, tam / 2, tam / 2);
    mancha.addColorStop(0, `rgba(196, 40, 78, ${alfa})`);
    mancha.addColorStop(0.45, `rgba(204, 52, 90, ${alfa * 0.7})`);
    mancha.addColorStop(1, 'rgba(210, 60, 98, 0)');
    g.fillStyle = mancha;
    g.fillRect(0, 0, tam, tam);
  }
  return tela.toDataURL('image/png');
}

/** Pinta as imagens e as publica como classes (.leve-s0 … .leve-sN). Devolve os índices por tipo. */
function prepararImagens() {
  const urls = [];
  const tipos = { nitidas: [], macias: [], manchas: [], chao: [] };
  const por = (tipo, url) => { if (url) { tipos[tipo].push(urls.length); urls.push(url); } };
  try {
    for (const c of CONTORNOS) por('nitidas', pintarNitida(128, c));
    por('macias', pintarMacia(144, CONTORNOS[1], 0.045, 0.92));
    por('macias', pintarMacia(144, CONTORNOS[2], 0.06, 0.88));
    por('manchas', pintarMacia(224, CONTORNOS[0], 0.14, 0.66));
    por('manchas', pintarMacia(224, CONTORNOS[1], 0.16, 0.58));
    for (const c of CONTORNOS) por('chao', pintarNitida(128, c, true));
  } catch (erro) {
    console.error('[carta] pétalas leves', erro);
  }
  if (!urls.length) return null;
  if (!document.getElementById('estilo-petalas-leves')) {
    const estilo = document.createElement('style');
    estilo.id = 'estilo-petalas-leves';
    estilo.textContent = urls.map((url, i) => `.leve-s${i}{background-image:url("${url}")}`).join('\n');
    document.head.append(estilo);
  }
  for (const tipo of Object.keys(tipos)) if (!tipos[tipo].length) tipos[tipo] = tipos.nitidas.length ? tipos.nitidas : [0];
  return tipos;
}

export function criarMundoLeve({ amb, canvas, recipienteLeve, fundo = null }) {
  const gsap = window.gsap;
  const recipiente = recipienteLeve || document.getElementById('mundo-leve');
  if (canvas) canvas.style.display = 'none';

  const sorte = semente(231223);
  const entre = (a, b) => a + sorte() * (b - a);
  const escolher = (lista) => lista[Math.floor(sorte() * lista.length) % lista.length];
  const criar = (tag, classe) => { const no = document.createElement(tag); no.className = classe; return no; };

  const imagens = prepararImagens();

  // Em tela grande cabem mais pétalas, e maiores; aparelho fraco e movimento reduzido levam menos.
  const area = (innerWidth * innerHeight) / (390 * 844);
  const fartura = clamp(Math.sqrt(area), 1, 2) * (amb.nivel === 'baixo' ? 0.7 : 1) * (amb.reduzido ? 0.45 : 1);
  const porte = clamp(Math.min(innerWidth, innerHeight) / 390, 1, 1.7);
  const calma = amb.reduzido ? 2.3 : 1;                 // movimento reduzido: tudo mais lento

  // nome, quantas, tamanho (px), duração da queda (s), balanço (px), opacidade,
  // onde a queda termina (vh), deriva para o lado do vento (vw), o quanto avança
  // por metro de caminhada, e de que imagens é feita.
  const CAMADAS = imagens ? [
    { nome: 'longe', n: 28, tam: [9, 17], dur: [17, 26], bal: [4, 9], alfa: [0.42, 0.78], fim: [54, 70], deriva: [3, 8], avanco: 0.02, de: imagens.nitidas },
    { nome: 'meio', n: 17, tam: [22, 42], dur: [10.5, 15], bal: [12, 22], alfa: [0.92, 1], fim: [84, 108], deriva: [7, 15], avanco: 0.085, de: [...imagens.nitidas, ...imagens.nitidas, ...imagens.macias] },
    { nome: 'perto', n: 4, tam: [120, 200], dur: [7.5, 10.5], bal: [18, 34], alfa: [0.7, 0.95], fim: [128, 136], deriva: [14, 26], avanco: 0.26, de: imagens.manchas },
  ] : [];

  const raiz = criar('div', 'leve-mundo');
  const todas = [];                                    // { no, sorte, camada }

  function novaPetala(c) {
    const no = criar('i', 'leve-petala');
    const face = criar('b', `leve-s${escolher(c.de)}`);
    const tam = entre(c.tam[0], c.tam[1]) * porte;
    const dur = entre(c.dur[0], c.dur[1]) * calma;
    const x0 = entre(-10, 96);
    const estilo = no.style;
    estilo.setProperty('--tam', `${tam.toFixed(0)}px`);
    estilo.setProperty('--dur', `${dur.toFixed(1)}s`);
    estilo.setProperty('--atraso', `${(-sorte() * dur).toFixed(1)}s`);      // já estão no ar
    estilo.setProperty('--x0', `${x0.toFixed(1)}vw`);
    estilo.setProperty('--x1', `${(x0 + entre(c.deriva[0], c.deriva[1])).toFixed(1)}vw`);
    estilo.setProperty('--y1', `${entre(c.fim[0], c.fim[1]).toFixed(0)}vh`);
    estilo.setProperty('--alfa', entre(c.alfa[0], c.alfa[1]).toFixed(2));
    const tombo = entre(3.2, 6.4) * calma;
    const sentido = sorte() < 0.5 ? -1 : 1;
    const giro = entre(-180, 180);
    const fe = face.style;
    fe.setProperty('--tombo', `${tombo.toFixed(1)}s`);
    fe.setProperty('--fase', `${(-sorte() * tombo * 2).toFixed(1)}s`);
    fe.setProperty('--bal', `${(entre(c.bal[0], c.bal[1]) * porte).toFixed(0)}px`);
    fe.setProperty('--r0', `${giro.toFixed(0)}deg`);
    fe.setProperty('--r1', `${(giro + sentido * entre(40, 130)).toFixed(0)}deg`);
    // a de perto quase não mostra o perfil (uma mancha não tem perfil)
    fe.setProperty('--s0', (c.nome === 'perto' ? entre(0.82, 1) : entre(0.7, 1)).toFixed(2));
    fe.setProperty('--s1', (c.nome === 'perto' ? entre(0.62, 0.86) : entre(0.16, 0.6)).toFixed(2));
    no.append(face);
    const registro = { no, sorte: sorte(), camada: c.nome, atraso: [c.nome === 'perto' ? 2.2 : 0, c.nome === 'perto' ? 7 : 5.6] };
    todas.push(registro);
    return no;
  }

  function novoChao() {
    const chao = criar('div', 'leve-chao');
    if (!imagens) return chao;
    const quantas = Math.round(24 * fartura / (amb.reduzido ? 0.7 : 1));
    for (let i = 0; i < quantas; i++) {
      const no = criar('i', `leve-s${escolher(imagens.chao)}`);
      // perspectiva: perto do horizonte são miúdas e achatadas; cá embaixo, grandes
      const fundo = sorte() ** 1.7;                     // 0 = no horizonte, 1 = aos pés dela
      const tam = (7 + fundo * 34) * porte;
      no.style.left = `${entre(-4, 104).toFixed(1)}%`;
      no.style.top = `${(8 + fundo * 90).toFixed(1)}%`;
      no.style.setProperty('--tam', `${tam.toFixed(0)}px`);
      no.style.setProperty('--r', `${entre(0, 360).toFixed(0)}deg`);
      no.style.setProperty('--achata', (0.24 + fundo * 0.26).toFixed(2));
      no.style.setProperty('--alfa', (0.3 + fundo * 0.7).toFixed(2));
      chao.append(no);
      todas.push({ no, sorte: sorte(), camada: 'chao', atraso: null });
    }
    return chao;
  }

  // Cada camada existe duas vezes: a que está à vista e a que espera lá no fundo
  // para tomar o lugar dela durante a caminhada.
  function novoPar(c) {
    const fazer = () => {
      const no = c ? criar('div', `leve-camada leve-${c.nome}`) : novoChao();
      if (c) for (let i = 0; i < Math.max(2, Math.round(c.n * fartura)); i++) no.append(novaPetala(c));
      return no;
    };
    const par = { a: fazer(), b: fazer(), avanco: c ? c.avanco : 0.075 };
    par.b.style.visibility = 'hidden';
    par.b.classList.add('parada');
    return par;
  }

  const pares = [];
  if (imagens) {
    const [longe, meio, perto] = CAMADAS;
    const pLonge = novoPar(longe);
    const pChao = novoPar(null);
    const pMeio = novoPar(meio);
    const pPerto = novoPar(perto);
    pares.push(pLonge, pChao, pMeio, pPerto);
    // a que distância (m) cada camada "está": só serve ao balanço do passo
    pLonge.prof = 6; pChao.prof = 3.2; pMeio.prof = 2; pPerto.prof = 0.9;
    // ordem de pintura: longe, chão, meio; a de perto e as soltas passam na frente da carta
    raiz.append(pLonge.b, pLonge.a, pChao.b, pChao.a, pMeio.b, pMeio.a);
    const frente = criar('div', 'leve-frente');
    frente.append(pPerto.b, pPerto.a);
    raiz.append(frente);
  }
  const soltas = criar('div', 'leve-frente leve-soltas');
  raiz.append(soltas);
  recipiente.append(raiz);

  // ---- densidade ------------------------------------------------------------------
  let densidade = 1;
  let chaoLiberado = true;                             // na abertura o chão só junta pétalas depois que elas caíram
  const criadoEm = performance.now();
  let jaDefinida = false;
  function aplicarDensidade() {
    for (const p of todas) {
      const k = p.camada === 'chao' && !chaoLiberado ? 0 : densidade;
      p.no.classList.toggle('fora', p.sorte > k);
    }
  }
  /** Sem a transição: logo depois de criar, a cena ainda está montando o primeiro quadro. */
  function aplicarJa() {
    raiz.classList.add('leve-instante');
    aplicarDensidade();
    void raiz.offsetWidth;
    raiz.classList.remove('leve-instante');
  }

  let ligado = true;
  function pausar() {
    for (const par of pares) par.a.classList.toggle('parada', !ligado);
  }

  const petalas = {
    objeto: raiz,

    definirDensidade(k) {
      densidade = clamp(Number(k) || 0);
      // a primeira chamada (a cena montando o primeiro quadro) não tem transição
      if (!jaDefinida || performance.now() - criadoEm < 1200) aplicarJa();
      else aplicarDensidade();
      jaDefinida = true;
    },

    /** Sem lente não há foco para puxar; existe para as cenas chamarem sem testar o modo. */
    definirFoco() {},

    /**
     * As manchas de perto saem da frente do que ela está olhando. Sem lente o
     * retângulo exato não importa: a camada de perto inteira recua (o CSS faz o
     * mesmo sozinho nas etapas de foco, por html[data-etapa]).
     */
    protegerRetangulo(r) {
      raiz.classList.toggle('leve-protege', !!r);
    },

    /** Abertura: as pétalas deixam de estar no ar e entram por cima, aos poucos. */
    comecar() {
      raiz.classList.add('leve-zerar');
      chaoLiberado = false;
      aplicarJa();
      espera(4200).then(() => { chaoLiberado = true; aplicarDensidade(); });
      for (const p of todas) {
        if (!p.atraso) continue;
        p.no.style.setProperty('--atraso', `${(entre(p.atraso[0], p.atraso[1]) * calma).toFixed(2)}s`);
      }
      void raiz.offsetWidth;                            // recomeça as animações com os atrasos novos
      raiz.classList.remove('leve-zerar');
    },

    /** Abertura: três manchas enormes cruzam a tela devagar, para o lado do vento. */
    protagonistas() {
      if (!gsap || !imagens || amb.reduzido) return;
      const lado = Math.min(innerWidth, innerHeight);
      const roteiros = [
        { de: [-0.3, 0.2], ate: [1.3, 0.56], atraso: 0, dura: 6.6 },
        { de: [0.55, -0.25], ate: [1.3, 0.42], atraso: 2.1, dura: 5.6 },
        { de: [-0.3, 0.52], ate: [0.72, 1.3], atraso: 4, dura: 6.2 },
      ];
      for (const r of roteiros.slice(0, amb.nivel === 'baixo' ? 2 : 3)) {
        const no = criar('i', `leve-solta leve-s${escolher(imagens.manchas)}`);
        no.style.setProperty('--tam', `${(lado * entre(0.62, 0.84)).toFixed(0)}px`);
        soltas.append(no);
        gsap.timeline({ delay: r.atraso, onComplete: () => no.remove() })
          .fromTo(no,
            { x: r.de[0] * innerWidth, y: r.de[1] * innerHeight, rotation: entre(-40, 40), scaleY: entre(0.7, 0.95) },
            { x: r.ate[0] * innerWidth, y: r.ate[1] * innerHeight, rotation: `+=${entre(-50, 50)}`, scaleY: entre(0.8, 1), duration: r.dura, ease: 'none' }, 0)
          .fromTo(no, { autoAlpha: 0 }, { autoAlpha: 0.9, duration: r.dura * 0.16, ease: 'none' }, 0)
          .to(no, { autoAlpha: 0, duration: r.dura * 0.16, ease: 'none' }, r.dura * 0.84);
      }
    },

    /** Pétalas que saltam de um ponto da tela, em leque, e caem. */
    rajada(pos, n = 10) {
      if (!gsap || !imagens) return;
      const cx = pos && Number.isFinite(pos.px) ? pos.px : innerWidth / 2;
      const cy = pos && Number.isFinite(pos.py) ? pos.py : innerHeight / 2;
      const quantia = Math.min(amb.reduzido ? Math.ceil(n / 3) : n, 18);
      const forca = amb.reduzido ? 0.5 : 1;
      for (let i = 0; i < quantia; i++) {
        const no = criar('i', `leve-solta leve-s${escolher(imagens.nitidas)}`);
        no.style.setProperty('--tam', `${(entre(16, 30) * porte).toFixed(0)}px`);
        soltas.append(no);
        const angulo = sorte() * Math.PI * 2;
        const alcance = entre(50, 170) * forca * porte;
        const sobe = entre(0.38, 0.6);
        const dura = entre(2.6, 3.8);
        const dx = Math.cos(angulo) * alcance;
        const dy = Math.sin(angulo) * alcance * 0.7 - 34 * forca;
        gsap.timeline({ onComplete: () => no.remove() })
          .set(no, { x: cx, y: cy, scale: 0.5, rotation: entre(0, 360), autoAlpha: 1 }, 0)
          // sai em leque, o ar freia...
          .to(no, { x: cx + dx, duration: dura * sobe, ease: 'power2.out' }, 0)
          .to(no, { y: cy + dy, duration: dura * sobe, ease: 'power2.out' }, 0)
          .to(no, { scale: 1, duration: 0.5, ease: 'power2.out' }, 0)
          // ... e ela passa a cair como as outras, para o lado do vento
          .to(no, { x: cx + dx + entre(14, 46), duration: dura * (1 - sobe), ease: 'sine.inOut' }, dura * sobe)
          .to(no, { y: cy + dy + entre(150, 300) * porte, duration: dura * (1 - sobe), ease: 'power1.in' }, dura * sobe)
          .to(no, { rotation: `+=${entre(-320, 320)}`, scaleX: entre(0.2, 0.7), duration: dura, ease: 'sine.inOut' }, 0)
          .to(no, { autoAlpha: 0, duration: dura * 0.36, ease: 'none' }, dura * 0.64);
      }
    },

    atualizar() {},
    dispose() { raiz.remove(); },
  };

  // ---- laço simples (só para quem registrou aoQuadro) ---------------------------------
  const ouvintes = new Set();
  const ponteiro = criarPonteiro(amb);
  let ultimo = 0;
  let tempo = 0;

  // Ouvinte do ticker do GSAP, como o laço do mundo.js: depois dos tweens, em ms reais.
  function laco() {
    const agora = performance.now();
    const dt = Math.min(Math.max(agora - ultimo, 0) / 1000, 0.05);
    ultimo = agora;
    tempo += dt;
    ponteiro.atualizar(dt);
    // O passo de base (= mundo.js): ela está sempre andando; uma caminhada mais
    // rápida toma o lugar dele. No movimento reduzido a foto fica parada.
    if (!amb.reduzido) {
      const caminhada = dt > 0 ? Math.min(4, Math.abs(rig.position.z - zAnterior) / dt) : 0;
      deriva += (Math.hypot(PASSO_BASE, caminhada) - caminhada) * dt;
    }
    zAnterior = rig.position.z;
    for (const fn of ouvintes) {
      try { fn(dt, tempo); } catch (erro) { ouvintes.delete(fn); console.error('[carta] aoQuadro falhou', erro); }
    }
    // A foto da alameda: aproxima com o avanço e balança como algo a ~8 m.
    if (fundo && fundo.ativo) {
      fundo.atualizar({ z: rig.position.z - deriva, roll: (balanco.rol * Math.PI) / 180, dx: balanco.x / 8, dy: balanco.y / 8 });
    }
  }
  function atualizarLaco() {
    gsap.ticker.remove(laco);
    if (ligado && !document.hidden) {
      ultimo = performance.now();
      gsap.ticker.add(laco);
    }
    pausar();
  }
  document.addEventListener('visibilitychange', atualizarLaco);

  // ---- caminhada: as camadas avançam ---------------------------------------------------
  const rig = objetoLeve();
  const PASSO_BASE = 0.42;                             // m/s (= mundo.js)
  let deriva = 0;
  let zAnterior = 0;
  const balanco = { x: 0, y: 0, rol: 0 };              // o passo de agora, em px (a foto lê)
  let filaCaminhada = Promise.resolve();
  const degrau = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  function caminhar({ distancia = 6, duracao = 5, curva } = {}) {
    const andar = () => new Promise((resolver) => {
      if (!gsap || !(distancia > 0)) { rig.position.z -= Math.max(0, distancia); resolver(); return; }
      const z0 = rig.position.z;
      const estado = { p: 0 };
      fundo?.caminhada(distancia);
      // Movimento reduzido: o mesmo avanço, bem mais curto e sem pressa (vira quase uma dissolvência).
      const alcance = distancia * (amb.reduzido ? 0.3 : 1);
      const fatores = pares.map((par) => Math.min(Math.exp(par.avanco * alcance), 5.5));
      for (const par of pares) {
        par.b.style.visibility = '';
        par.b.classList.toggle('parada', !ligado);
      }
      // Balanço de passo, como o da câmera do mundo.js: ~2,5 cm na vertical, ~1,2 cm
      // de lado e ~0,3° de rolagem, ~1,8 passo por segundo, com a amplitude seguindo
      // a velocidade (entra e sai com o andar). Cada camada desloca na proporção
      // inversa da distância: a de perto balança muito, a de longe quase nada.
      const pxPorMetro = innerHeight / (innerWidth > innerHeight ? 0.77 : 1.11);
      const passo = { fase: 0, amp: 0, p: 0, t: 0, x: 0, y: 0, rol: 0 };
      const balancar = (tempo, p) => {
        const dt = tempo - passo.t;
        if (!(dt > 0)) return;
        const velocidade = ((p - passo.p) / dt) * duracao;      // 1 = a média da caminhada
        passo.t = tempo;
        passo.p = p;
        const alvo = amb.reduzido ? 0 : clamp(velocidade);
        passo.amp += (alvo - passo.amp) * (1 - Math.exp(-(alvo > passo.amp ? 3.4 : 2.2) * dt));
        passo.fase += dt * 1.8 * clamp(passo.amp * 4);
        const ciclo = passo.fase * Math.PI * 2;
        // nas pontas a camada troca de lugar com a do fundo: ali o balanço já é zero
        const a = passo.amp * Math.min(degrau(0, 0.08, p), 1 - degrau(0.86, 1, p));
        passo.y = (Math.cos(ciclo) + 0.18 * Math.cos(ciclo * 2 + 0.7)) * 0.025 * a * pxPorMetro;
        passo.x = Math.sin(ciclo * 0.5) * 0.012 * a * pxPorMetro;
        passo.rol = Math.sin(ciclo * 0.5 + 0.4) * 0.3 * a;
      };
      const desenhar = (p) => {
        pares.forEach((par, i) => {
          const f = fatores[i];
          const prof = par.prof || 3;
          const balanco = `translate3d(${(passo.x / prof).toFixed(2)}px, ${(passo.y / prof).toFixed(2)}px, 0) rotate(${passo.rol.toFixed(3)}deg) `;
          par.a.style.transform = `${balanco}scale(${(f ** p).toFixed(4)})`;
          par.a.style.opacity = (1 - degrau(0.4, 1, p)).toFixed(3);
          par.b.style.transform = `${balanco}scale(${(f ** (p - 1)).toFixed(4)})`;
          par.b.style.opacity = degrau(0, 0.62, p).toFixed(3);
        });
      };
      desenhar(0);
      gsap.to(estado, {
        p: 1,
        duration: duracao,
        ease: amb.reduzido ? curvas.branco.deriva : (curva || curvaDaCaminhada),
        onUpdate() {
          rig.position.z = z0 - distancia * estado.p;
          balancar(this.time(), estado.p);
          balanco.x = passo.x; balanco.y = passo.y; balanco.rol = passo.rol;
          desenhar(estado.p);
        },
        onComplete() {
          // a que veio do fundo passa a ser a camada à vista; a outra volta a esperar
          for (const par of pares) {
            const antiga = par.a;
            par.a = par.b;
            par.b = antiga;
            par.a.style.transform = '';
            par.a.style.opacity = '';
            antiga.style.visibility = 'hidden';
            antiga.style.transform = '';
            antiga.style.opacity = '';
            antiga.classList.add('parada');
          }
          balanco.x = 0; balanco.y = 0; balanco.rol = 0;
          resolver();
        },
      });
    });
    filaCaminhada = filaCaminhada.then(andar, andar);
    return filaCaminhada;
  }

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
    get deriva() { return deriva; },

    aoQuadro(fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },
    ligar() { ligado = true; fundo?.ligar(); atualizarLaco(); },
    desligar() { ligado = false; fundo?.desligar(); atualizarLaco(); },
    caminhar,

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
    fundo,
  };

  // A hora do dia (js/mundo/hora.js): aqui ela é pintada sobre a imagem da alameda.
  criarHora(mundo, amb, (e) => fundo?.aplicarHora?.(e));

  atualizarLaco();
  return mundo;
}
