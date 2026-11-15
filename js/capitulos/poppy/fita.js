// Cena "fita": uma fita de vídeo com etiqueta escrita à mão, vista de cima,
// sendo empurrada para dentro do aparelho.
//
// Rolar a página para cima é o gesto de empurrar: a fita sobe com a rolagem e
// os carretéis giram. Quando entra o bastante, o mecanismo puxa o resto com um
// clunk (`som.efeito('fita')`), a luz acende e a tela inteira perde o tracking
// por um instante. Rolando de volta, o aparelho devolve a fita.
//
//   criarFita(bloco, ctx) → { el, quadro(dt, info), medir(), destruir() }
//   bloco = { etiqueta, data }   (o que vai escrito na etiqueta)
//   ctx = { amb, gsap, som, anima, falha(forca, ms), piscarModo(nome, ms) }
//
// Desenho original: nenhuma marca, nenhum logotipo.

import { clamp, el, lerp, svg } from '../../nucleo/util.js';
import { curvas } from '../../nucleo/movimento.js';

const APARELHO = `
  <svg class="vcr-aparelho-desenho" viewBox="0 0 400 118" aria-hidden="true" focusable="false">
    <path d="M12 0h376a12 12 0 0 1 12 12v84H0V12A12 12 0 0 1 12 0z" fill="#111a20"/>
    <path d="M12 0h376a12 12 0 0 1 12 12v3H0v-3A12 12 0 0 1 12 0z" fill="#1d2a32"/>
    <rect x="16" y="14" width="368" height="70" rx="6" fill="#0d151a"/>
    <g stroke="#060b0e" stroke-width="3.2" stroke-linecap="round">
      <path d="M34 28h112M34 36h112M34 44h112M34 52h112M34 60h112M34 68h112"/>
    </g>
    <g stroke="#1b272e" stroke-width="1" stroke-linecap="round">
      <path d="M34 30h112M34 38h112M34 46h112M34 54h112M34 62h112M34 70h112"/>
    </g>
    <rect x="262" y="26" width="104" height="40" rx="5" fill="#141f26" stroke="#24333b" stroke-width="1.5"/>
    <rect x="272" y="35" width="50" height="7" rx="2" fill="#0a1114"/>
    <rect x="272" y="48" width="32" height="7" rx="2" fill="#0a1114"/>
    <circle cx="350" cy="46" r="9" fill="#0a1114"/>
    <circle cx="350" cy="46" r="5.5" fill="#1d2a32"/>
    <circle cx="24" cy="21" r="2.4" fill="#27353d"/><circle cx="376" cy="21" r="2.4" fill="#27353d"/>
    <circle cx="24" cy="77" r="2.4" fill="#27353d"/><circle cx="376" cy="77" r="2.4" fill="#27353d"/>
    <rect x="0" y="90" width="400" height="28" rx="6" fill="#1f2b32"/>
    <rect x="0" y="90" width="400" height="3.5" fill="#34444d"/>
    <rect x="0" y="113" width="400" height="5" rx="2.5" fill="#0b1216"/>
    <rect x="40" y="96" width="320" height="15" rx="4.5" fill="#010304"/>
    <rect x="40" y="96" width="320" height="3" rx="1.5" fill="#0c1317"/>
    <rect x="10" y="99" width="20" height="8" rx="3" fill="#3a4a52"/>
    <rect x="10" y="99" width="20" height="2.5" rx="1.2" fill="#55676f"/>
  </svg>`;

const CASSETE = `
  <svg class="vcr-cassete-desenho" viewBox="0 0 300 170" aria-hidden="true" focusable="false">
    <rect x="1" y="5" width="298" height="165" rx="11" fill="#02060a" opacity=".6"/>
    <rect x="1" y="1" width="298" height="165" rx="11" fill="#14181c"/>
    <rect x="1" y="1" width="298" height="165" rx="11" fill="none" stroke="#2d363d" stroke-width="1.5"/>
    <path d="M12 2.2h276" stroke="#3b464e" stroke-width="1.6" stroke-linecap="round"/>
    <g stroke="#0a0d10" stroke-width="2.4" stroke-linecap="round">
      <path d="M12 92v52M18 92v52M24 92v52M30 92v52M270 92v52M276 92v52M282 92v52M288 92v52"/>
    </g>
    <rect x="22" y="13" width="256" height="64" rx="4" fill="#ece2cc"/>
    <rect x="22" y="13" width="256" height="9" rx="4" fill="#c5362f"/>
    <rect x="22" y="18" width="256" height="4" fill="#c5362f"/>
    <path d="M34 44h232M34 60h232" stroke="#2a1b22" stroke-opacity=".16" stroke-width="1.2"/>
    <rect x="56" y="88" width="188" height="64" rx="9" fill="#07090b"/>
    <rect x="56" y="88" width="188" height="64" rx="9" fill="none" stroke="#2d363d" stroke-width="1.5"/>
    <circle class="rolo esq" cx="104" cy="120" r="27" fill="#3b2a21"/>
    <circle class="rolo dir" cx="196" cy="120" r="15" fill="#3b2a21"/>
    <g class="carretel esq">
      <circle cx="104" cy="120" r="12.5" fill="#e8e3d6"/>
      <circle cx="104" cy="120" r="5" fill="#07090b"/>
      <path d="M104 108.5v5M104 126.5v5M94.1 114.2l4.3 2.5M109.6 123.3l4.3 2.5M94.1 125.8l4.3-2.5M109.6 116.7l4.3-2.5" stroke="#07090b" stroke-width="2.6" stroke-linecap="round"/>
    </g>
    <g class="carretel dir">
      <circle cx="196" cy="120" r="12.5" fill="#e8e3d6"/>
      <circle cx="196" cy="120" r="5" fill="#07090b"/>
      <path d="M196 108.5v5M196 126.5v5M186.1 114.2l4.3 2.5M201.6 123.3l4.3 2.5M186.1 125.8l4.3-2.5M201.6 116.7l4.3-2.5" stroke="#07090b" stroke-width="2.6" stroke-linecap="round"/>
    </g>
    <rect x="138" y="96" width="24" height="48" rx="3" fill="#14181c"/>
    <path d="M64 93c40-4 90-4 172 0" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="3" stroke-linecap="round"/>
    <circle cx="13" cy="14" r="2.6" fill="#2d363d"/><circle cx="287" cy="14" r="2.6" fill="#2d363d"/>
    <circle cx="13" cy="156" r="2.6" fill="#2d363d"/><circle cx="287" cy="156" r="2.6" fill="#2d363d"/>
    <circle cx="150" cy="158" r="2.6" fill="#2d363d"/>
  </svg>`;

export function criarFita(bloco, { amb, gsap, som, anima, falha, piscarModo }) {
  const nome = String(bloco?.etiqueta || '').trim();
  const data = String(bloco?.data || '').trim();

  const desenhoCassete = svg(CASSETE);
  const rotulo = (nome || data)
    ? el('div', 'vcr-rotulo', [nome ? el('span', 'vcr-rotulo-nome', nome) : null, data ? el('span', 'vcr-rotulo-data', data) : null])
    : null;
  const cassete = el('div', 'vcr-cassete', [desenhoCassete, rotulo]);
  const boca = el('div', 'vcr-boca', [cassete, el('i', { class: 'vcr-labio', 'aria-hidden': 'true' })]);
  const luz = el('i', { class: 'vcr-luz', 'aria-hidden': 'true' });
  const aparelho = el('div', 'vcr-aparelho', [svg(APARELHO), luz]);
  const palco = el('div', 'vcr-palco', [aparelho, boca]);
  const raiz = el('div', 'poppy-cena poppy-vcr', palco);

  const carreteis = [...desenhoCassete.querySelectorAll('.carretel')];
  const rolos = [...desenhoCassete.querySelectorAll('.rolo')];

  // Medidas em px, relativas ao topo da boca (onde a fita some).
  let alturaCassete = 0;
  let descanso = 0;      // y do topo da fita parada do lado de fora
  let agarra = 0;        // y em que o mecanismo puxa
  let dentro = 0;        // y com a fita toda engolida

  let meioNoConteudo = null;
  function medir() {
    meioNoConteudo = null;
    alturaCassete = cassete.offsetHeight;
    if (!alturaCassete) return;
    descanso = boca.clientHeight - alturaCassete - 10;
    agarra = -alturaCassete * 0.5;
    dentro = -alturaCassete - 6;
  }

  const pose = { y: 0 };
  let v = 0;
  let estado = 'fora';          // 'fora' | 'engolindo' | 'dentro' | 'saindo'
  let iniciado = false;
  let giro = 0;
  let yRolagem = null;
  let transicao = null;

  function engolir() {
    estado = 'engolindo';
    transicao = anima(gsap.to(pose, {
      y: dentro, duration: amb.reduzido ? 0.5 : 0.3, ease: amb.reduzido ? 'none' : 'power2.in',
      onComplete() {
        estado = 'dentro';
        raiz.classList.add('carregada');
        som.efeito('fita');
        if (!amb.reduzido) {
          falha(1, 190);
          anima(gsap.fromTo(aparelho, { y: 7 }, { y: 0, duration: 0.7, ease: curvas.poppy.mola }));
        }
        piscarModo('tocar', 1500);
      },
    }));
  }

  function devolver(alvo) {
    estado = 'saindo';
    raiz.classList.remove('carregada');
    som.efeito('fita');
    transicao = anima(gsap.to(pose, {
      y: alvo, duration: amb.reduzido ? 0.5 : 0.55, ease: amb.reduzido ? 'none' : 'back.out(2.4)',
      onComplete() { estado = 'fora'; v = 0; },
    }));
  }

  function desenhar(p) {
    cassete.style.transform = `translate3d(-50%, ${pose.y.toFixed(2)}px, 0)`;
    for (const c of carreteis) {
      const cx = c.classList.contains('esq') ? 104 : 196;
      c.setAttribute('transform', `rotate(${(giro % 360).toFixed(1)} ${cx} 120)`);
    }
    // a fita passa de um carretel para o outro conforme o capítulo avança
    rolos[0].setAttribute('r', lerp(27, 17.5, p).toFixed(1));
    rolos[1].setAttribute('r', lerp(15, 25, p).toFixed(1));
  }

  return {
    el: raiz,
    medir,

    quadro(dt, info) {
      if (!alturaCassete) medir();
      if (!alturaCassete) return;
      // posição no conteúdo medida uma vez (e de novo em medir()): ler a caixa a
      // cada quadro forçava um layout depois do contador e do OSD escreverem
      if (meioNoConteudo === null) {
        const caixa = raiz.getBoundingClientRect();
        meioNoConteudo = caixa.top - info.topo + info.y + caixa.height / 2;
      }
      const centro = meioNoConteudo - info.y;
      const p = clamp((info.altura * 0.84 - centro) / (info.altura * 0.4));
      const alvo = lerp(descanso, agarra, p);

      const andou = yRolagem === null ? 0 : info.y - yRolagem;
      yRolagem = info.y;

      if (!iniciado) {
        iniciado = true;
        if (p >= 0.985) { estado = 'dentro'; pose.y = dentro; raiz.classList.add('carregada'); }
        else pose.y = alvo;
      }

      if (estado === 'fora') {
        if (amb.reduzido) pose.y = alvo;
        else {
          // um pouco de peso: a fita vai atrás do dedo e assenta
          v += (210 * (alvo - pose.y) - 21 * v) * dt;
          pose.y += v * dt;
        }
        giro += andou * 1.5;
        if (p >= 0.985 && Math.abs(alvo - pose.y) < 8) engolir();
      } else if (estado === 'engolindo') {
        giro += 900 * dt;
      } else if (estado === 'dentro') {
        if (p < 0.7) devolver(alvo);
      }
      desenhar(p);
    },

    destruir() {
      if (transicao) transicao.kill();
    },
  };
}
