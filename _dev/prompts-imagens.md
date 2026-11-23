# Imagens que a carta ainda pode receber

Cada imagem abaixo é opcional: sem ela, o site desenha a peça sozinho. Para pôr uma:

1. Gere a imagem com o prompt da seção (os prompts estão em inglês, porque os geradores entendem melhor).
2. Exporte em WebP (ou AVIF), até uns 350 KB, com no máximo 1600 px no lado maior.
3. Salve em `assets/images/` com o nome indicado e escreva o caminho no campo de `js/content.js`.
4. Para a mão, ajuste `mao.ancoraFio` (x e y de 0 a 1) para o ponto do pulso onde o fio está amarrado.

**Regra geral:** arte original, no clima das imagens do filme que já estão no projeto (céus luminosos, nuvens detalhadas, luz de fim de tarde, traço de anime de cinema). Sem texto, logotipo ou marca d'água. Sempre com uma área calma para o texto. Sem copiar quadros, personagens ou logotipos do filme ou do jogo.

| Arquivo | Formato | Campo |
|---|---|---|
| yourname-fundo.webp | 9:16 | `yourname.fundo` |
| yourname-escadaria.webp | 16:9 | bloco `imagem` do capítulo do filme |
| yourname-cordao.webp | faixa larga, fundo transparente | bloco `cordao` (`arquivo`) ou bloco `imagem` |
| mao-akai-ito.webp | vertical, fundo transparente | `mao.imagem` |
| poppy-fundo.webp | 9:16 | `poppy.fundo` |
| poppy-1.webp | 16:9 | bloco `imagem` do capítulo do jogo |
| poppy-2.webp | 16:9 | bloco `imagem` do capítulo do jogo |
| og-capa.jpg | 1200 × 630, JPG | já apontada no index.html (`og:image`) |
| yourname-ceu.mp4 (opcional) | loop de 4 a 6 s, vertical, mudo, até 2,5 MB | `yourname.video` |

## yourname-fundo.webp (9:16)
> Vertical cinematic anime-film background, twilight over a calm mountain lake, a small town with warm glowing windows along the shore, a two-tailed comet crossing a sky that fades from deep indigo at the top to soft peach near the horizon, layered detailed clouds lit from below, first stars appearing. The central third of the frame is calm, low-detail sky for overlaid text. No people, no text, no logo, no watermark. Original artwork.

## yourname-escadaria.webp (16:9)
> Wide cinematic anime-film scene, a stone stairway in a quiet residential neighborhood at late afternoon, a red handrail running down the middle, two small silhouettes passing each other halfway, long warm shadows, power lines and trees, glowing clouds. The top third is calm open sky. No text, no logo, no watermark. Original artwork, not a frame from any film.

## yourname-cordao.webp (faixa larga, fundo transparente)
> Macro photograph-like illustration of a single braided cord in red and orange silk threads, crossing the frame horizontally in a gentle wave, tiny fibers catching warm light, isolated on a fully transparent background, no shadow, no text.

## mao-akai-ito.webp (vertical, fundo transparente)
> A young woman's open hand seen from above, palm up, relaxed fingers, soft natural skin tones, a thin braided red cord tied around the wrist with a small neat knot, the loose end trailing out of frame. Gentle, delicate anime-film style. Vertical composition, fully transparent background, no sleeve, no jewelry, no text.

## poppy-fundo.webp (9:16)
> Vertical background of an abandoned toy factory hall at night, almost no light, faded toy colors (red, yellow, blue, green) on old machines and conveyor belts, black and white checkered floor in strong perspective toward a central vanishing point, deep petrol blue (#0d2534) dominating, subtle VHS grain and scanlines. The center is the darkest, calm area for overlaid text. No characters, no logos, no text. Original artwork.

## poppy-1.webp (16:9)
> A glowing old CRT television in a dark room, blue-white static on the screen, a black VHS tape lying on a black and white checkered floor in front of it, soft blue light spill, VHS grain. No characters, no logos, no text.

## poppy-2.webp (16:9)
> Two toy hands on long flexible cables, one blue and one red, reaching toward each other and almost touching in the center, tiny sparks between the fingertips, dark petrol-blue factory background with soft bokeh lights, playful but slightly eerie. No characters, no logos, no text. Original design.

## og-capa.jpg (1200 × 630)
> A white paper envelope tied with a thin red cord and sealed with a red wax seal shaped like a heart, resting among a few fallen pink cherry petals on a soft white surface, gentle daylight, lots of calm empty space around. No text. (Pode ser gerada pelo próprio site: `node _dev/capa.mjs`.)

## yourname-ceu.mp4 (opcional)
Se o gerador fizer vídeo: um loop curto e sem emenda do céu do yourname-fundo, com o cometa cruzando devagar. Vertical, mudo, de 4 a 6 segundos, até 2,5 MB. A imagem parada (yourname-fundo.webp) fica como reserva.
