# Prompts das imagens geradas

Nenhuma destas imagens existe ainda (em 14/11/2026 o Higgsfield recusou por falta de plano e a chave OpenAI estava inválida).
O site funciona sem elas. Quando gerar, exporte em WebP (ou AVIF), até ~350 KB, no máximo 1600 px no lado maior,
salve em `assets/images/` com o nome indicado e escreva o caminho no campo correspondente de `js/content.js`.

Regra para todas: arte original no clima das quatro imagens do filme que já estão no projeto (céus luminosos, nuvens detalhadas,
luz de fim de tarde, traço de anime de cinema). Sem texto, logotipo ou marca d'água, sempre com uma área calma para o texto.
Não copiar quadros, personagens ou logotipos do filme ou do jogo.

| Arquivo | Formato | Campo em `content.js` |
|---|---|---|
| `yourname-fundo.webp` | vertical 9:16 | `yourname.fundo` |
| `yourname-escadaria.webp` | 16:9 | bloco `imagem` do capítulo Your Name |
| `yourname-cordao.webp` | faixa larga, fundo transparente | bloco `cordao` (`arquivo`) |
| `mao-akai-ito.webp` | vertical, fundo transparente | `mao.imagem` |
| `poppy-fundo.webp` | vertical 9:16 | `poppy.fundo` |
| `poppy-1.webp` | 16:9 | bloco `imagem` do capítulo Poppy |
| `poppy-2.webp` | 16:9 | bloco `imagem` do capítulo Poppy |
| `og-capa.jpg` | 1200×630 (JPG, para o WhatsApp) | já apontado no `index.html` |

## yourname-fundo

Vertical hand-painted anime feature-film background, no characters. Twilight over a calm mountain lake with a small lakeside town whose windows glow warm. High in the sky a bright comet with two diverging tails leaves luminous cyan and magenta trails. Sky gradient from deep indigo (#090e33) at the top, through violet (#4a398c) and rose (#b25d9b), to warm peach (#ffd1a1) at the horizon. Richly detailed layered cumulus clouds catching the last light, the first stars appearing, soft reflections on the water. Luminous, cinematic, painterly. Keep the middle third of the frame calm open sky so text can sit over it. No people, no text, no letters, no logo, no watermark.

## yourname-escadaria

Hand-painted anime feature-film background, wide 16:9. A neighborhood stone staircase in a quiet Tokyo residential district in late afternoon, with a red handrail running down its middle, seen from a distance. Two small distant figures pass each other on the steps, one going up and one going down, faces not visible, simple silhouettes in everyday clothes. Golden-hour light, long soft shadows, luminous detailed clouds, power lines, greenery, low apartment buildings. Keep the upper third a calm glowing sky so text can sit over it. Original composition. No text, no letters, no signs, no logo, no watermark.

## yourname-cordao

A single braided kumihimo cord made of red and orange silk threads, shown in macro, running horizontally across the whole frame from the left edge to the right edge in a very gentle wave, vertically centered, thin relative to the frame. Crisp woven fiber detail, soft even studio light, painterly anime-film finish. Isolated on a fully transparent background, no cast shadow, no other objects, no text, no watermark.

## mao-akai-ito

First-person point of view looking down at a young woman's own open hand and forearm reaching forward, palm up, fingers relaxed and slightly apart. A braided red kumihimo cord is tied around the wrist with a small knot and one short loose end. Clean anime feature-film line art with gentle cel shading and soft warm late-afternoon light on the skin. Vertical composition: the forearm enters from the bottom edge, the hand sits in the lower-middle of the frame, generous empty space above. Isolated on a fully transparent background, no cast shadow, no sleeve, no jewelry, no text, no watermark.

Depois de gerar, ajuste `mao.ancoraFio` em `content.js` para o ponto do nó no pulso (x e y de 0 a 1 dentro da imagem).

## poppy-fundo

Vertical 9:16 illustration of the main hall of an abandoned toy factory at night, seen from the floor. Very low light. Peeling paint in faded toy colors (red, yellow, blue, green) on walls and machines, a black-and-white checkered floor receding in perspective, long conveyor belts carrying a few plain wooden blocks and generic simple toys, hanging industrial lamps that barely glow, pipes and catwalks fading into darkness. Deep petroleum-teal shadows (#0d2534) dominate the whole image; it must be dark and low-contrast enough for white text to be read on top, with the central area the darkest and calmest. Subtle analog VHS grain and slight color bleeding. Original design: no characters, no mascots, no faces, no text, no letters, no signs, no logo, no watermark.

## poppy-1

Wide 16:9 illustration. An old tube television glowing in a dark room, its curved screen showing soft blue-white static, with a plain black VHS cassette lying beside it on a worn black-and-white checkered floor. Faded toy-colored shapes barely visible in the dark background, deep petroleum-teal shadows, the TV light spilling softly onto the floor. Analog VHS grain, faint scanline glow. No text, no letters, no blank or written labels, no logo, no watermark.

## poppy-2

Wide 16:9 illustration. Two toy hands at the ends of flexible cables, one bright blue coming from the left and one bright red coming from the right, reaching toward each other and almost touching in the center of the frame, tiny electric sparks jumping between the fingertips. Simple rounded glossy plastic glove-like hands with four fingers and a thumb, original generic toy design. Dark abandoned toy factory in deep petroleum-teal behind them, soft rim light on the plastic, analog VHS grain. No characters, no faces, no text, no letters, no logo, no watermark.

## og-capa

A sealed white paper envelope, tied crosswise with a thin red cord and closed with a small deep-red wax seal, floating slightly tilted in the center of a pure white empty space. A few red rose petals fall around it, some small and sharp in the distance, two or three large and softly out of focus in the foreground. A very soft, faint shadow beneath the envelope. High-key, minimal, elegant, lots of white space on every side, wide 3:2 composition with the envelope occupying about a third of the width. No text, no letters, no logo, no watermark.

(Enquanto esta não existir, a prévia do link usa uma captura do próprio envelope do site.)

## Vídeo opcional: yourname-ceu.mp4

Loop curto e sem emenda (4 a 6 s), vertical, mudo, até 2,5 MB: o céu de crepúsculo da `yourname-fundo` com as nuvens andando devagar e o cometa de duas caudas cintilando. Campo: `yourname.video`.
