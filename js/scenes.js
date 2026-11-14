/* As cenas desenhadas que aparecem entre os textos.
   Cada uma é um SVG; as animações ficam em css/poppy.css e css/yourname.css. */

window.Scenes = (() => {
  const NS = 'xmlns="http://www.w3.org/2000/svg"';

  const hand = `
    <rect class="gp__h" x="26" y="6" width="48" height="15" rx="7.5"/>
    <rect class="gp__h" x="30" y="24" width="48" height="15" rx="7.5"/>
    <rect class="gp__h" x="26" y="42" width="46" height="15" rx="7.5"/>
    <rect class="gp__h" x="6" y="-12" width="15" height="34" rx="7.5" transform="rotate(24 13 20)"/>
    <rect class="gp__h" x="0" y="2" width="44" height="60" rx="18"/>
    <circle class="gp__palm" cx="22" cy="32" r="11"/>`;

  /* três fios trançados, para o cordão */
  function braid(phase) {
    let d = "";
    for (let x = 14; x <= 386; x += 3) {
      const y = 35 + Math.sin((x / 40) * Math.PI * 2 + phase) * 10;
      d += `${x === 14 ? "M" : "L"}${x} ${y.toFixed(1)} `;
    }
    return d;
  }

  const figure = {
    boy: `
      <circle cx="0" cy="-37" r="5.4"/>
      <path d="M-4.6 -30 h9.2 l1.6 18 h-12.4 Z"/>
      <path class="dusk__line" d="M-3 -13 v13 M3 -13 v13 M4 -27 l10 6"/>`,
    girl: `
      <circle cx="0" cy="-37" r="5.4"/>
      <path d="M3 -40 c8 -1 10 7 6 14 c0 -6 -2 -9 -6 -10 Z"/>
      <path d="M-4.4 -30 h8.8 l5.6 20 h-20 Z"/>
      <path class="dusk__line" d="M-3 -11 v11 M3 -11 v11 M-4 -27 l-10 6"/>
      <circle class="dusk__ribbon" cx="5" cy="-39" r="1.9"/>`,
  };

  const svg = {
    maos: `
<svg ${NS} viewBox="0 0 400 170" class="scene" role="img" aria-label="Duas mãos, uma azul e uma vermelha, se encontrando">
  <g class="gp gp--blue">
    <path class="gp__cable" d="M-60 104 C 10 124, 70 70, 128 84"/>
    <g transform="translate(122 50)">${hand}</g>
  </g>
  <g class="gp gp--red">
    <path class="gp__cable" d="M460 104 C 390 124, 330 70, 272 84"/>
    <g transform="translate(278 50) scale(-1 1)">${hand}</g>
  </g>
  <g class="gp__spark">
    <path class="gp__heart" transform="translate(200 34) scale(1.7)" d="M0 5 C-11 -4 -5 -12 0 -5 C5 -12 11 -4 0 5Z"/>
    <path class="gp__rays" d="M180 58 l-9 -9 M220 58 l9 -9 M172 82 h-12 M228 82 h12"/>
  </g>
</svg>`,

    fita: `
<svg ${NS} viewBox="0 0 400 230" class="scene" role="img" aria-label="Uma fita VHS">
  <rect class="vhs__body" x="40" y="16" width="320" height="196" rx="14"/>
  <rect class="vhs__label" x="58" y="30" width="284" height="66" rx="5"/>
  <rect x="58" y="30" width="71" height="6" fill="#f0443e"/>
  <rect x="129" y="30" width="71" height="6" fill="#ffd23f"/>
  <rect x="200" y="30" width="71" height="6" fill="#43b85c"/>
  <rect x="271" y="30" width="71" height="6" fill="#2f7df6"/>
  <text class="vhs__text" x="200" y="74" text-anchor="middle" data-label=""></text>
  <rect class="vhs__window" x="86" y="110" width="228" height="76" rx="10"/>
  <rect class="vhs__tape" x="150" y="126" width="100" height="44" rx="4"/>
  <g class="vhs__reel">
    <circle class="vhs__disc" cx="140" cy="148" r="27"/>
    <path class="vhs__spoke" d="M140 126 v44 M121 137 l38 22 M121 159 l38 -22"/>
    <circle class="vhs__hub" cx="140" cy="148" r="8"/>
  </g>
  <g class="vhs__reel">
    <circle class="vhs__disc" cx="260" cy="148" r="27"/>
    <path class="vhs__spoke" d="M260 126 v44 M241 137 l38 22 M241 159 l38 -22"/>
    <circle class="vhs__hub" cx="260" cy="148" r="8"/>
  </g>
  <text class="vhs__brand" x="340" y="203" text-anchor="end">VHS</text>
</svg>`,

    espiada: `
<svg ${NS} viewBox="0 0 400 170" preserveAspectRatio="xMaxYMid meet" class="scene" role="img" aria-label="Um robozinho de brinquedo espiando pelo canto e acenando">
  <g class="peek">
    <g class="peek__arm">
      <path class="peek__limb" d="M460 150 C 412 150, 356 142, 316 114"/>
      <rect class="peek__claw" x="288" y="92" width="30" height="30" rx="10" transform="rotate(-22 303 107)"/>
      <path class="peek__heart" transform="translate(296 66) scale(1.5)" d="M0 5 C-11 -4 -5 -12 0 -5 C5 -12 11 -4 0 5Z"/>
    </g>
    <path class="peek__antenna" d="M374 24 V8"/>
    <circle class="peek__bulb" cx="374" cy="4" r="6"/>
    <rect class="peek__head" x="334" y="24" width="160" height="112" rx="26"/>
    <rect class="peek__visor" x="348" y="42" width="150" height="48" rx="18"/>
    <circle class="peek__eye" cx="374" cy="66" r="10"/>
    <circle class="peek__eye" cx="410" cy="66" r="10"/>
    <circle class="peek__pupil" cx="371" cy="67" r="4.5"/>
    <circle class="peek__pupil" cx="407" cy="67" r="4.5"/>
    <path class="peek__smile" d="M378 106 q14 12 28 0"/>
    <circle class="peek__rivet" cx="348" cy="122" r="2.5"/>
    <circle class="peek__rivet" cx="348" cy="38" r="2.5"/>
  </g>
</svg>`,

    esteira: `
<div class="belt" role="img" aria-label="Uma esteira de fábrica levando brinquedos coloridos e um coração">
  <div class="belt__run">
    <svg ${NS} viewBox="0 0 800 110" class="belt__toys" aria-hidden="true">
      <g id="belt-set">
        <rect x="30" y="62" width="34" height="34" rx="6" fill="#f0443e"/>
        <rect x="37" y="69" width="20" height="20" rx="4" fill="#ff7a73"/>
        <circle cx="120" cy="79" r="17" fill="#ffd23f"/>
        <path d="M103 79 a17 17 0 0 0 34 0 z" fill="#f2a900"/>
        <path d="M190 96 l19 -38 l19 38 z" fill="#43b85c"/>
        <path transform="translate(284 80) scale(1.9)" d="M0 8 C-13 -4 -6 -13 0 -6 C6 -13 13 -4 0 8Z" fill="#ff5d7a"/>
        <rect x="338" y="66" width="30" height="30" rx="15" fill="#2f7df6"/>
        <circle cx="353" cy="81" r="6" fill="#9cc4ff"/>
      </g>
      <use href="#belt-set" x="400"/>
    </svg>
  </div>
  <svg ${NS} viewBox="0 0 400 150" class="scene belt__base" aria-hidden="true">
    <rect class="belt__body" x="-10" y="96" width="420" height="20" rx="10"/>
    <path class="belt__tread" d="M-10 106 H410"/>
    <g class="belt__rollers"><circle cx="20" cy="106" r="6"/><circle cx="65" cy="106" r="6"/><circle cx="110" cy="106" r="6"/><circle cx="155" cy="106" r="6"/><circle cx="200" cy="106" r="6"/><circle cx="245" cy="106" r="6"/><circle cx="290" cy="106" r="6"/><circle cx="335" cy="106" r="6"/><circle cx="380" cy="106" r="6"/></g>
    <path class="belt__legs" d="M70 117 v28 M330 117 v28 M50 146 h40 M310 146 h40"/>
  </svg>
</div>`,

    cometa: `
<svg ${NS} viewBox="0 0 400 200" class="scene" role="img" aria-label="Um cometa que se divide em dois">
  <defs>
    <linearGradient id="yn-tail-a" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8fd3ff" stop-opacity="0"/>
      <stop offset=".7" stop-color="#8fd3ff"/>
      <stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <linearGradient id="yn-tail-b" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff9ec4" stop-opacity="0"/>
      <stop offset=".7" stop-color="#ff9ec4"/>
      <stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <filter id="yn-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  <path class="comet__tail comet__tail--a" pathLength="1" stroke="url(#yn-tail-a)" d="M392 14 C 280 58, 150 108, 60 150"/>
  <path class="comet__tail comet__tail--b" pathLength="1" stroke="url(#yn-tail-b)" d="M262 70 C 222 98, 172 150, 120 186"/>
  <g class="comet__head comet__head--a">
    <circle cx="60" cy="150" r="11" fill="#bfe6ff" filter="url(#yn-glow)"/>
    <circle cx="60" cy="150" r="4.6" fill="#ffffff"/>
  </g>
  <g class="comet__head comet__head--b">
    <circle cx="120" cy="186" r="8" fill="#ffc4dc" filter="url(#yn-glow)"/>
    <circle cx="120" cy="186" r="3.2" fill="#ffffff"/>
  </g>
</svg>`,

    cordao: `
<svg ${NS} viewBox="0 0 400 70" class="scene" role="img" aria-label="Um cordão trançado vermelho">
  <path class="cord cord--c" pathLength="1" d="${braid(4.19)}"/>
  <path class="cord cord--b" pathLength="1" d="${braid(2.09)}"/>
  <path class="cord cord--a" pathLength="1" d="${braid(0)}"/>
</svg>`,

    crepusculo: `
<svg ${NS} viewBox="0 0 400 200" class="scene" role="img" aria-label="Duas pessoas se encontrando no crepúsculo">
  <defs>
    <radialGradient id="yn-sun">
      <stop offset="0" stop-color="#fff6d8"/>
      <stop offset=".35" stop-color="#ffc98a" stop-opacity=".75"/>
      <stop offset="1" stop-color="#ffc98a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="yn-ridge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#15123f"/>
      <stop offset=".45" stop-color="#15123f" stop-opacity=".9"/>
      <stop offset="1" stop-color="#15123f" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <circle cx="200" cy="150" r="96" fill="url(#yn-sun)"/>
  <path class="dusk__ridge" d="M0 200 C 60 162, 130 157, 200 155 C 270 153, 340 160, 400 200 Z"/>
  <g transform="translate(172 157)"><g class="dusk__who dusk__who--boy">${figure.boy}</g></g>
  <g transform="translate(228 157)"><g class="dusk__who dusk__who--girl">${figure.girl}</g></g>
  <path class="dusk__thread" pathLength="1" d="M186 136 C 194 148, 206 148, 214 136"/>
</svg>`,
  };

  /* o fio que passa de uma imagem para a outra no bloco "par"
     (a proporção 100 x 86.2 é a de duas imagens 9:16 lado a lado) */
  svg.fio = `
<svg ${NS} viewBox="0 0 100 86.2" class="pair__thread" aria-hidden="true">
  <path pathLength="1" d="M46.5 54.6 C 50.5 55.4, 48.6 66.4, 52.6 68"/>
</svg>`;

  /* a fábrica ao fundo do capítulo do jogo: cabos pendurados, uma lâmpada, tinta descascando, uma esteira longe */
  svg.fabrica = `
<svg ${NS} viewBox="0 0 400 300" preserveAspectRatio="xMidYMin slice" class="pp-fabrica" aria-hidden="true">
  <g class="pp-pipes">
    <rect x="-10" y="14" width="420" height="10" rx="5" fill="#b93a33"/>
    <rect x="-10" y="16" width="420" height="3" rx="1.5" fill="#e0574f" opacity=".8"/>
    <rect x="60" y="10" width="14" height="18" rx="3" fill="#8a1f1b"/>
    <rect x="300" y="10" width="14" height="18" rx="3" fill="#8a1f1b"/>
    <rect x="-10" y="34" width="420" height="6" rx="3" fill="#c99a16"/>
    <rect x="-10" y="35" width="420" height="2" rx="1" fill="#ffd23f" opacity=".7"/>
    <rect x="180" y="31" width="10" height="12" rx="2" fill="#8d6b0d"/>
    <circle cx="340" cy="37" r="7" fill="#2f7df6" stroke="#113a8c" stroke-width="2"/>
  </g>
  <path class="pp-cable" d="M-20 0 C 60 118, 140 118, 220 0"/>
  <path class="pp-cable--sheen pp-cable--sheen" d="M-10 8 C 60 112, 130 112, 200 14"/>
  <path class="pp-cable pp-cable--thin" d="M120 0 C 200 150, 300 150, 420 8"/>
  <path class="pp-cable pp-cable--thin" d="M-10 30 C 100 100, 250 96, 410 40"/>
  <g class="pp-far" transform="translate(0 6)">
    <rect x="262" y="206" width="180" height="9" rx="4.5"/>
    <path d="M282 215 v34 M420 215 v34 M272 249 h20 M410 249 h20"/>
    <rect x="296" y="186" width="20" height="20" rx="4"/>
    <circle cx="348" cy="196" r="10"/>
    <path d="M378 206 l11 -20 l11 20 z"/>
  </g>
</svg>`;

  /* a lâmpada pendurada, à parte, para balançar sem repintar a fábrica inteira */
  svg.lampada = `
<svg ${NS} viewBox="0 0 80 110" class="pp-lamp" aria-hidden="true">
  <defs>
    <radialGradient id="pp-glow">
      <stop offset="0" stop-color="#fff1c8" stop-opacity=".95"/>
      <stop offset=".25" stop-color="#ffe3a0" stop-opacity=".45"/>
      <stop offset="1" stop-color="#ffd27a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <path class="pp-wire" d="M40 0 V52"/>
  <rect class="pp-socket" x="33" y="48" width="14" height="10" rx="2"/>
  <circle cx="40" cy="68" r="36" fill="url(#pp-glow)"/>
  <circle class="pp-bulb" cx="40" cy="67" r="8.5"/>
</svg>`;

  /* as montanhas no fundo do capítulo de Your Name */
  svg.serra = `
<svg ${NS} viewBox="0 0 400 120" preserveAspectRatio="none" class="yn-hills">
  <path fill="#2a2466" d="M0 120 L0 70 C 40 52, 70 60, 110 40 C 150 22, 180 50, 220 44 C 270 36, 300 12, 340 30 C 370 42, 390 36, 400 40 L400 120 Z"/>
  <path fill="#15123f" d="M0 120 L0 96 C 50 80, 90 92, 140 78 C 200 62, 240 88, 290 80 C 330 74, 370 84, 400 72 L400 120 Z"/>
</svg>`;

  /* Devolve o elemento <svg> da cena pedida (ou null se o nome não existir). */
  function build(name) {
    if (!svg[name]) return null;
    const source = svg[name].trim();
    if (source.startsWith("<div")) {
      const tpl = document.createElement("template");
      tpl.innerHTML = source;
      return tpl.content.firstElementChild;
    }
    const doc = new DOMParser().parseFromString(source, "image/svg+xml");
    return document.importNode(doc.documentElement, true);
  }

  return { build };
})();
