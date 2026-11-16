# Product

Carta interativa de aniversário, em primeira pessoa, feita por uma pessoa para a namorada. Um link só, aberto uma vez, no dia 23/12.

## Platform

web

## Stack

HTML, CSS e JavaScript puros, módulos ES, sem etapa de build. Publicado direto pelo GitHub Pages (repositório `ULystreak/23.12`, branch `main`). Bibliotecas ficam em `lib/` como arquivos locais (Three.js, GSAP com ScrollTrigger/SplitText/DrawSVG/CustomEase, Lenis). Fontes hospedadas em `assets/fonts/`.

## Users

Uma única pessoa: a namorada do autor. Abre no iPhone, em pé, sozinha, sem saber o que é, com atenção total. Vai ver uma vez só. O segundo usuário é o autor, que edita textos, músicas e imagens em `js/content.js` e testa partes com `?cena=`.

## Product Purpose

Fazer ela sentir que cada segundo foi feito para ela. Ela caminha por um mundo branco, abre três cartas, escolhe uma música do casal e lê dois capítulos, cada um com o tema de algo que é dos dois (o jogo em que se conheceram, o filme deles). No fim, uma folha em branco e uma frase escrita à mão.

## Positioning

A régua é a de um site premiado no Awwwards: direção de arte própria, movimento com intenção, transições contínuas, nada com cara de modelo pronto. Vale investir em momentos que seriam exagero num site comum.

## Operating Context

- Celular em pé primeiro (360 a 430 px), iPhone/Safari é o alvo principal; no computador também precisa ficar bonito.
- Som só depois do primeiro toque dela.
- Do link até a última frase ela nunca pode ficar sem saber o que fazer, e nunca vê um corte seco.

## Capabilities and Constraints

- Todo texto, música e imagem editável em um único arquivo: `js/content.js`. O que está entre [colchetes] é exemplo.
- Atalhos `?cena=inicio`, `poppy`, `carta2`, `yourname`, `mao`, `encontro`, `final`.
- Site estático, sem build, sem login, sem analytics, sem cookies. `noindex`. Título e prévia do link neutros ("Para você").
- Fluido num Android intermediário; aparelho fraco, sem WebGL ou com movimento reduzido cai para uma versão mais leve, nunca quebrada.
- Primeira tela aparece rápido; o resto carrega enquanto ela vê a abertura.
- Imagem ou música que faltar some sem deixar buraco nem aviso.

## Brand Commitments

- O fio vermelho (akai ito) amarra tudo e ela só deve perceber no final: cordão dos envelopes, linha de progresso na borda do pergaminho, cordão trançado do capítulo do filme, fio entre as duas imagens, laço no pulso, caminho até a última carta.
- Uma câmera só: cada cena entrega um elemento para a próxima.
- Cada mundo tem a sua física: mundo branco lento e leve; Poppy com molas, quiques e interferência de vídeo; Your Name com luz, brilho e tempo passando.
- Paleta: branco `#ffffff`, tinta `#2a1b22`, rosa `#b3123a`, fio `#d7192d`; Poppy em azul-petróleo `#0d2534` com vermelho, amarelo, azul e verde de brinquedo; Your Name de `#090e33` a `#4a398c`, `#b25d9b` e `#ffd1a1`.
- Letras: Shippori Mincho (títulos), Klee One (manuscrito), Fredoka e VT323 (capítulo do jogo).
- Fora: emoji, grade de cartões iguais, gradiente genérico, qualquer coisa que pareça modelo pronto. Nada de copiar quadros, personagens ou logotipos do filme ou do jogo.

## Evidence on Hand

- Imagens do autor em `assets/images/`: `yourname-capa.png` (533×300), `yourname-encontro.webp` (860×484), `yourname-visao-dele.webp` (640×1139), `yourname-visao-dela.webp` (720×1280).
- Música em `assets/music/`: `undressed.mp3` (sombr) com capa `undressed.webp`. Outras faixas virão depois.
- Imagens geradas (fundos, mão, cordão) ainda não existem: cada cena precisa ficar completa sem elas e ganhar com elas quando chegarem.

## Product Principles

1. Nenhum efeito entra para constar: cada um serve à cena.
2. Ela sempre sabe o que tocar.
3. Continuidade acima de tudo: o elemento de uma cena vira o da próxima.
4. O autor troca conteúdo sem tocar em código.

## Accessibility & Inclusion

Texto sobre vidro e sobre imagem com contraste de pelo menos 4,5:1. `prefers-reduced-motion` respeitado com versão mais calma. Áreas seguras e `100dvh`. Alvos de toque de pelo menos 44 px.
