# Product

Carta interativa de aniversário, em primeira pessoa, feita por uma pessoa para a namorada. Um link só, aberto uma vez, no dia 23/12.

## Platform

web

## Stack

HTML, CSS e JavaScript puros, módulos ES, sem etapa de build. Publicado direto pelo GitHub Pages (repositório `ULystreak/23.12`, branch `main`). Bibliotecas ficam em `lib/` como arquivos locais (Three.js, GSAP com ScrollTrigger/SplitText/DrawSVG/CustomEase, Lenis). Fontes hospedadas em `assets/fonts/`.

## Users

Uma única pessoa: a namorada do autor. Abre no iPhone, em pé, sozinha, sem saber o que é, com atenção total. Vai ver uma vez só. O segundo usuário é o autor, que edita textos, músicas e imagens em `js/content.js` e testa partes com `?cena=`.

## Product Purpose

Fazer ela sentir que cada segundo foi feito para ela. Ela digita uma senha que só ela sabe (os dias que já viveu), escolhe uma música do casal e entra numa alameda de cerejeiras. Caminha até duas cartas, cada uma com a cara e o capítulo de algo que é dos dois (o jogo em que se conheceram, o filme deles), e guarda cada uma no bolso; o que ela guarda fica na bolsa, para rever quando quiser. Ao guardar a segunda, o fio vermelho aparece no pulso: ela corre por ele até ele e, perto dele, encontra cartas no chão com vídeos dos amigos e uma Surpresinha com momentos dos dois. Depois, o encontro, uma folha em branco e uma frase escrita à mão.

## Positioning

A régua é a de um site premiado no Awwwards: direção de arte própria, movimento com intenção, transições contínuas, nada com cara de modelo pronto. Vale investir em momentos que seriam exagero num site comum.

## Operating Context

- Celular em pé primeiro (360 a 430 px), iPhone/Safari é o alvo principal; no computador também precisa ficar bonito.
- Som só depois do primeiro toque dela (a senha e a escolha da música são esse toque).
- A senha é um ritual, não segurança: o site é estático e o número está no `content.js`.
- Do link até a última frase ela nunca pode ficar sem saber o que fazer, e nunca vê um corte seco.

## Capabilities and Constraints

- Todo texto, música, imagem e vídeo editável em um único arquivo: `js/content.js` (a senha, as músicas do carrossel, os vídeos dos amigos e as mídias da Surpresinha também). O que está entre [colchetes] é exemplo.
- Atalhos `?cena=senha`, `musica`, `inicio`, `poppy`, `carta2`, `yourname`, `mao`, `cartas`, `encontro`, `final`. Sem atalho, começa na senha; os atalhos de `inicio` em diante pulam a tela preta.
- Carta do chão sem vídeo aparece do mesmo jeito e abre um cartão de exemplo ("[vídeo de Sariel vem aqui]"); vídeo que falha mostra só o nome e nada trava.
- A bolsa (canto inferior direito) mostra só o que ela já guardou; tocar num item reabre aquele conteúdo.
- Site estático, sem build, sem login, sem analytics, sem cookies. `noindex`. Título e prévia do link neutros ("Para você").
- Fluido num Android intermediário; aparelho fraco, sem WebGL ou com movimento reduzido cai para uma versão mais leve, nunca quebrada.
- Primeira tela aparece rápido; o resto carrega enquanto ela vê a abertura.
- Imagem ou música que faltar some sem deixar buraco nem aviso.
- A continuação depois de "Seguir em frente" ainda vai ser decidida pelo autor; por enquanto leva ao encontro e à última carta.

## Brand Commitments

- O fio vermelho (akai ito) amarra tudo e ela só deve perceber no final: o traço sob a senha, a volta no nome da música, cordão dos envelopes, linha de progresso na borda do pergaminho, cordão trançado do capítulo do filme, fio entre as duas imagens, laço no pulso, caminho até ele, o que amarra as cartas do chão, caminho até a última carta.
- Uma câmera só: cada cena entrega um elemento para a próxima.
- Cada mundo tem a sua física: mundo branco lento e leve; Poppy com molas, quiques e interferência de vídeo; Your Name com luz, brilho e tempo passando.
- Paleta: branco `#ffffff`, tinta `#2a1b22`, rosa `#b3123a`, fio `#d7192d`; Poppy em azul-petróleo `#0d2534` com vermelho, amarelo, azul e verde de brinquedo; Your Name de `#090e33` a `#4a398c`, `#b25d9b` e `#ffd1a1`.
- Letras: Shippori Mincho (títulos), Klee One (manuscrito), Fredoka e VT323 (capítulo do jogo).
- Fora: emoji, grade de cartões iguais, gradiente genérico, qualquer coisa que pareça modelo pronto. Nada de copiar quadros, personagens ou logotipos do filme ou do jogo.

## Evidence on Hand

- Imagens do autor em `assets/images/`: `yourname-capa.png` (533×300), `yourname-encontro.webp` (860×484), `yourname-visao-dele.webp` (640×1139), `yourname-visao-dela.webp` (720×1280).
- Música em `assets/music/`: `undressed.mp3` (sombr) com capa `undressed.webp`. Outras faixas virão depois (o carrossel já funciona com uma ou com várias).
- Vídeos dos amigos (Sariel, Ana, Mirai, Alpha, Pocoyoh, Nup) e mídias da Surpresinha ainda não existem: vão em `assets/videos/` e `assets/images/`.
- Imagens geradas (fundos, mão, cordão) ainda não existem: cada cena precisa ficar completa sem elas e ganhar com elas quando chegarem.

## Product Principles

1. Nenhum efeito entra para constar: cada um serve à cena.
2. Ela sempre sabe o que tocar.
3. Continuidade acima de tudo: o elemento de uma cena vira o da próxima.
4. O autor troca conteúdo sem tocar em código.

## Accessibility & Inclusion

Texto sobre vidro e sobre imagem com contraste de pelo menos 4,5:1. `prefers-reduced-motion` respeitado com versão mais calma. Áreas seguras e `100dvh`. Alvos de toque de pelo menos 44 px.
