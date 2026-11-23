/* ============================================================================
   POPPY / FITA: a fita com etiqueta escrita à mão entrando no aparelho
   ============================================================================
   Rolar a folha para cima é o gesto de empurrar: a fita sobe com a rolagem e
   os carretéis giram. Quando ela entra o bastante, o mecanismo puxa o resto
   com um clunk, a luz do aparelho acende, a tela perde o tracking por um
   instante e o OSD mostra PLAY. Rolando de volta, o aparelho devolve a fita.
   Desenho original: nenhuma marca, nenhum logotipo.
   ========================================================================== */

import { clamp, el, lerp, svg } from '../../nucleo/util.js';
import { curvas } from '../../nucleo/movimento.js';

// O aparelho de frente: tampa, visor, painel, botões e a boca embaixo, onde a fita entra.
const APARELHO = `<svg class="vcr-aparelho-desenho" viewBox="0 0 400 118" aria-hidden="true" focusable="false">
  <rect x="26" y="102" width="44" height="14" rx="3" fill="#27353d"/>
  <rect x="330" y="102" width="44" height="14" rx="3" fill="#27353d"/>
  <rect x="2" y="4" width="396" height="100" rx="9" fill="#111a20"/>
  <rect x="2" y="4" width="396" height="14" rx="9" fill="#1d2a32"/>
  <rect x="2" y="12" width="396" height="6" fill="#1d2a32"/>
  <path d="M20 30h210M20 38h210M20 46h210M20 54h210" stroke="#1d2a32" stroke-width="2.4" stroke-linecap="round"/>
  <rect x="252" y="22" width="132" height="56" rx="5" fill="#141f26"/>
  <rect x="262" y="29" width="54" height="22" rx="3" fill="#0d151a"/>
  <path d="M268 40h8M280 40h8M292 40h8" stroke="#1d2a32" stroke-width="3" stroke-linecap="round"/>
  <circle cx="332.4" cy="37.7" r="7.6" fill="#0a1114"/>
  <rect x="262" y="60" width="18" height="9" rx="2" fill="#0a1114"/>
  <rect x="285" y="60" width="18" height="9" rx="2" fill="#0a1114"/>
  <rect x="308" y="60" width="18" height="9" rx="2" fill="#0a1114"/>
  <rect x="331" y="60" width="18" height="9" rx="2" fill="#0a1114"/>
  <rect x="354" y="60" width="22" height="9" rx="2" fill="#0a1114"/>
  <rect x="46" y="84" width="308" height="18" rx="4" fill="#0a1114"/>
  <rect x="2" y="96" width="396" height="8" rx="3" fill="#1f2b32"/>
  <rect x="50" y="96" width="300" height="8" fill="#0a1114"/>
</svg>`;

// A fita vista de cima: etiqueta creme com a faixa vermelha, janela com os dois rolos e os carretéis.
const CASSETE = `<svg class="vcr-cassete-desenho" viewBox="0 0 300 170" aria-hidden="true" focusable="false">
  <rect x="0" y="0" width="300" height="170" rx="10" fill="#14181c"/>
  <rect x="27" y="18" width="246" height="62" rx="3" fill="#ece2cc"/>
  <rect x="27" y="18" width="246" height="7" rx="2" fill="#c5362f"/>
  <rect x="64" y="90" width="172" height="60" rx="8" fill="#0c1013"/>
  <circle class="rolo esq" cx="104" cy="120" r="27" fill="#3b2a21"/>
  <circle class="rolo dir" cx="196" cy="120" r="15" fill="#3b2a21"/>
  <g class="carretel esq"><circle cx="104" cy="120" r="12.5" fill="#e8e3d6"/><path d="M104 110v20M95.3 115l17.4 10M95.3 125l17.4-10" stroke="#14181c" stroke-width="2.4"/><circle cx="104" cy="120" r="3.4" fill="#14181c"/></g>
  <g class="carretel dir"><circle cx="196" cy="120" r="12.5" fill="#e8e3d6"/><path d="M196 110v20M187.3 115l17.4 10M187.3 125l17.4-10" stroke="#14181c" stroke-width="2.4"/><circle cx="196" cy="120" r="3.4" fill="#14181c"/></g>
  <path d="M20 158h40M240 158h40" stroke="#22282d" stroke-width="3" stroke-linecap="round"/>
</svg>`;

export function criarFita(bloco, { amb, gsap, som, anima, falha, piscarModo }) {
  const reduzido = !!amb?.reduzido;
  const nome = typeof bloco?.etiqueta === 'string' ? bloco.etiqueta.trim() : '';
  const data = typeof bloco?.data === 'string' ? bloco.data.trim() : '';
  const rotulo = nome || data
    ? el('div', 'vcr-rotulo', [
      nome ? el('span', { class: 'vcr-rotulo-nome', texto: nome }) : null,
      data ? el('span', { class: 'vcr-rotulo-data', texto: data }) : null,
    ])
    : null;

  const desenhoCassete = svg(CASSETE);
  const cassete = el('div', 'vcr-cassete', [desenhoCassete, rotulo]);
  const boca = el('div', 'vcr-boca', [cassete, el('i', { class: 'vcr-labio', 'aria-hidden': 'true' })]);
  const aparelho = el('div', 'vcr-aparelho', [svg(APARELHO), el('i', { class: 'vcr-luz', 'aria-hidden': 'true' })]);
  const raiz = el('div', 'poppy-cena poppy-vcr', el('div', 'vcr-palco', [aparelho, boca]));
  const carreteis = [...desenhoCassete.querySelectorAll('.carretel')];
  const rolos = [desenhoCassete.querySelector('.rolo.esq'), desenhoCassete.querySelector('.rolo.dir')];

  let medido = false;
  let descanso = 0;
  let agarra = 0;
  let dentro = 0;
  let meioNoConteudo = null;
  let estado = 'fora'; // fora | engolindo | dentro | saindo
  const pose = { y: 0 };
  let ultimaY = 0;
  let v = 0;
  let giro = 0;
  let primeiro = true;
  let transicao = null;
  let raiosDesenhados = '';

  function medir() {
    const alturaCassete = cassete.offsetHeight;
    descanso = boca.clientHeight - alturaCassete - 10;
    agarra = -0.5 * alturaCassete;
    dentro = -alturaCassete - 6;
    medido = alturaCassete > 0;
    // A posição no conteúdo é lida de novo no próximo quadro (uma vez por medida).
    meioNoConteudo = null;
  }

  function engolir() {
    estado = 'engolindo';
    transicao = anima(gsap.to(pose, {
      y: dentro,
      duration: reduzido ? 0.5 : 0.3,
      ease: reduzido ? 'none' : 'power2.in',
      onComplete() {
        estado = 'dentro';
        raiz.classList.add('carregada');
        som?.efeito?.('fita');
        if (!reduzido) {
          falha?.(1, 190);
          anima(gsap.fromTo(aparelho, { y: 7 }, { y: 0, duration: 0.7, ease: curvas.poppy.mola }));
        }
        piscarModo?.('tocar', 1500);
      },
    }));
  }

  function devolver(alvo) {
    estado = 'saindo';
    transicao = anima(gsap.to(pose, {
      y: alvo,
      duration: reduzido ? 0.5 : 0.55,
      ease: reduzido ? 'none' : 'back.out(2.4)',
      onComplete() {
        estado = 'fora';
        v = 0;
        raiz.classList.remove('carregada');
        som?.efeito?.('fita');
      },
    }));
  }

  // A fita passa de um rolo para o outro conforme entra.
  function desenhar(p) {
    cassete.style.transform = `translate3d(-50%, ${pose.y.toFixed(2)}px, 0)`;
    const g = `rotate(${(giro % 360).toFixed(1)}deg)`;
    for (const c of carreteis) c.style.transform = g;
    const raios = `${lerp(27, 17.5, p).toFixed(1)} ${lerp(15, 25, p).toFixed(1)}`;
    if (raios === raiosDesenhados) return;
    raiosDesenhados = raios;
    const [re, rd] = raios.split(' ');
    rolos[0].setAttribute('r', re);
    rolos[1].setAttribute('r', rd);
  }

  return {
    el: raiz,
    medir,

    quadro(dt, info) {
      if (!medido) medir();
      if (!medido) return;
      if (meioNoConteudo === null) {
        // Lida uma vez por medida: ler a caixa a cada quadro forçava um layout
        // depois do contador e do OSD escreverem.
        const r = raiz.getBoundingClientRect();
        meioNoConteudo = r.top + r.height / 2 - info.topo + info.y;
      }
      const centro = meioNoConteudo - info.y;
      const p = clamp((0.84 * info.altura - centro) / (0.4 * info.altura));
      const alvo = lerp(descanso, agarra, p);

      if (primeiro) {
        primeiro = false;
        if (p >= 0.985) {
          estado = 'dentro';
          pose.y = dentro;
          raiz.classList.add('carregada');
        } else {
          pose.y = alvo;
        }
        ultimaY = pose.y;
      }

      if (estado === 'fora') {
        if (reduzido) {
          pose.y = alvo;
        } else {
          // Um pouco de peso: a fita vai atrás do dedo e assenta.
          v += (210 * (alvo - pose.y) - 21 * v) * dt;
          pose.y += v * dt;
        }
        if (p >= 0.985 && Math.abs(alvo - pose.y) < 8) engolir();
      } else if (estado === 'dentro' && p < 0.7) {
        devolver(alvo);
      }
      // Os carretéis giram com o quanto a fita andou desde o último quadro (o tween
      // de devolver também anda entre um quadro e outro); engolindo, o motor puxa.
      if (estado === 'engolindo') giro += 900 * dt;
      else giro += (ultimaY - pose.y) * 1.5;
      ultimaY = pose.y;
      desenhar(p);
    },

    destruir() {
      transicao?.kill();
      transicao = null;
    },
  };
}
