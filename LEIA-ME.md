# Página de aniversário (23/12)

Tudo o que você edita está em **`js/content.js`**: frases, músicas, textos dos capítulos, a frase final
e os caminhos das imagens. O que está entre `[colchetes]` é texto de exemplo.

## Ver no seu computador

Abra um terminal nesta pasta e rode:

```bash
python -m http.server 8123
```

Depois abra `http://localhost:8123` no navegador.
Se você mudar algo e a página não mudar, aperte **Ctrl+F5** (o navegador guarda a versão antiga).

Para ir direto a uma parte, sem passar por tudo:

| Endereço | Onde começa |
|---|---|
| `http://localhost:8123/?cena=inicio` | do começo (igual a abrir sem nada) |
| `http://localhost:8123/?cena=poppy` | capítulo do jogo |
| `http://localhost:8123/?cena=carta2` | segunda carta |
| `http://localhost:8123/?cena=yourname` | capítulo do filme |
| `http://localhost:8123/?cena=mao` | a mão com o fio vermelho |
| `http://localhost:8123/?cena=final` | última carta |
| `http://localhost:8123/?cena=og` | só a carta parada (serve para a imagem da prévia do link) |

## Como o site é feito

- `index.html`, `css/` e `js/`: HTML, CSS e JavaScript puros, sem build. É só publicar a pasta.
- As pétalas são desenhadas em WebGL (`js/petals.js`), com desfoque de profundidade. Sem WebGL,
  ou com "reduzir movimento" ligado no aparelho, entra um canvas 2D mais simples.
- O céu do capítulo do filme é um shader (`js/sky.js`): vai do dia à noite conforme ela rola,
  com sol, estrelas, cometa que se divide e o reflexo no lago. Sem WebGL, fica um céu em camadas CSS.
- Os sons (lacre, papel, fio, caneta) são gerados na hora (`js/sfx.js`), sem arquivos. Sempre abaixo da música.
- `js/content.js` é o único arquivo que você precisa editar.

## Imagens

Salve cada imagem em `assets/images/` e escreva o caminho em `js/content.js` (há um comentário em cada lugar).
Se um arquivo não existir, o bloco simplesmente some no site publicado; no seu computador aparece um aviso.

| Arquivo (sugestão de nome) | Onde entra | Campo em `content.js` | Situação |
|---|---|---|---|
| `yourname-capa.png` | capa que abre o capítulo do filme | `capitulo2.capa` | já colocada |
| `yourname-encontro.webp` | o encontro, de ponta a ponta | bloco `imagem` do capítulo 2 | já colocada |
| `yourname-visao-dele.webp`, `yourname-visao-dela.webp` | o par ligado pelo fio | bloco `par` do capítulo 2 | já colocadas |
| `yourname-fundo.webp` | o lago ao crepúsculo, atrás do capítulo 2 (aparece no auge do crepúsculo) | `capitulo2.fundo` | falta (o céu desenhado funciona sem ela) |
| `yourname-escadaria.webp` | foto entre os textos do capítulo 2 | bloco `imagem` comentado | falta |
| `yourname-cordao.webp` | o cordão trançado entre os textos | `{ tipo: "cena", cena: "cordao", arquivo: "..." }` | falta (o cordão desenhado funciona sem ela) |
| `mao-akai-ito.webp` | a mão em primeira pessoa com o cordão no pulso | `mao.imagem` e `mao.pulso` | falta (o desenho da mão funciona sem ela) |
| `poppy-fundo.webp` | a fábrica, atrás do capítulo 1 | `capitulo1.fundo` | falta (a fábrica desenhada funciona sem ela) |
| `poppy-1.webp`, `poppy-2.webp` | fotos entre os textos do capítulo 1 | blocos `imagem` comentados | faltam |
| `og-capa.jpg` | a prévia do link no WhatsApp | `index.html` (já aponta para ela) | gerada a partir do próprio site |

Tamanho bom: até 1600 px no lado maior e menos de 350 KB cada (WebP ou AVIF), para abrir rápido no celular.
A prévia do link precisa ser JPG ou PNG, 1200×630, porque o WhatsApp não aceita WebP ali.

### Prompts prontos para o Higgsfield

Cole um de cada vez. Em todos: sem texto, sem logotipo, sem marca d'água, traço de anime de cinema,
céus luminosos, nuvens detalhadas, luz de fim de tarde, e uma área calma onde o texto vai por cima.
Não use personagens nem quadros do filme ou do jogo.

- **yourname-fundo** (9:16): *Cinematic anime film background. Twilight sky over a calm lake, a small town with warm lights on the far shore, a comet with two tails crossing the sky, no people. Luminous gradient from deep indigo at the top to orange-pink at the horizon, detailed layered clouds, soft reflections on the water. The upper half is calm open sky with little detail. No text, no logos, no watermark.*
- **yourname-escadaria** (16:9): *Cinematic anime film background. A quiet residential staircase in a Tokyo neighborhood with a red handrail, late afternoon golden light, long shadows, two small distant figures passing each other on the stairs, seen from far away, cherry trees and utility poles, detailed clouds. No text, no logos, no watermark.*
- **yourname-cordao** (faixa larga, fundo transparente): *Macro close-up of a braided cord made of red and orange threads, horizontal, isolated on a transparent background, soft studio light, anime film illustration style, highly detailed fibers. No text.*
- **mao-akai-ito** (vertical, fundo branco puro): *First-person point of view looking down at a young woman's open hand, palm up, fingers relaxed, a thin braided red cord tied around the wrist, pure white background, soft diffuse light, anime film illustration style with delicate line work and soft shading. No text.*
- **poppy-fundo** (9:16): *Cinematic anime background. Interior of an abandoned toy factory warehouse at night, very dark and moody, peeling colorful paint (red, yellow, blue, green) on concrete walls, checkered floor tiles, conveyor belts, hanging cables, a single dim light bulb, dust in the air, VHS grain. Mostly dark so white text stays readable. No characters, no text, no logos.*
- **poppy-1** (16:9): *Cinematic anime background. A glowing CRT tube television turned on in a dark room showing colorful static, a VHS tape lying next to it on the floor, abandoned toy factory setting, dust, moody light. No text, no logos.*
- **poppy-2** (16:9): *Cinematic anime illustration. Two toy robot hands on long cables reaching toward each other and almost touching, one blue and one red, small electric sparks between the fingertips, dark toy factory background, dramatic rim light. No text, no logos.*

Para `mao-akai-ito`, depois de salvar, ajuste `mao.pulso` em `content.js` (porcentagem da largura e da altura
onde fica o laço) para o fio sair do lugar certo.

## Músicas

1. Coloque os arquivos em `assets/music/` (mp3 é o mais seguro).
2. Em `js/content.js`, na lista `musica.lista`, escreva o título, o artista, o caminho e a capa (quadrada) de cada uma.
3. Apague `exemplo-1.wav` e `exemplo-2.wav` quando não precisar mais.

Se o nome do arquivo estiver errado, a própria lista mostra "Arquivo não encontrado".

No iPhone o site não consegue controlar o volume: a música toca no volume do aparelho.
Se quiser que fique baixinha lá também, diminua o volume do próprio arquivo antes de colocar.

## Publicar (GitHub Pages)

Cada `git push` na branch `main` republica em `https://ulystreak.github.io/23.12/` em cerca de um minuto.

A página pede aos buscadores para não ser indexada, mas quem tiver o link consegue abrir.
Teste o link no seu celular antes do dia 23.
