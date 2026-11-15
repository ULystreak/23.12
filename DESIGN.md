---
name: Para você
description: Uma carta que é um lugar — mundo branco, pétalas vermelhas e um fio que amarra tudo.
colors:
  branco: "#ffffff"
  tinta: "#2a1b22"
  tinta-suave: "#6b5961"
  tinta-fraca: "#8a7a81"
  rosa-petala: "#b3123a"
  fio: "#d7192d"
  fio-escuro: "#a80f22"
  papel: "#fbf7f0"
  papel-sombra: "#efe7da"
  papel-linha: "#e3d9c8"
  poppy-fundo: "#0d2534"
  poppy-fundo-claro: "#16384c"
  poppy-vermelho: "#e2332f"
  poppy-amarelo: "#f6c12d"
  poppy-azul: "#2f8fd8"
  poppy-verde: "#3fb86b"
  poppy-texto: "#f2ead8"
  poppy-tinta: "#0f1c24"
  yn-noite: "#090e33"
  yn-crepusculo: "#4a398c"
  yn-rosa: "#b25d9b"
  yn-pessego: "#ffd1a1"
  yn-texto: "#fdf6ee"
  yn-tinta-dia: "#0a1245"
typography:
  frase:
    fontFamily: "Shippori Mincho, Hiragino Mincho ProN, Yu Mincho, Georgia, serif"
    fontSize: "clamp(1.625rem, 6.6vw, 2.75rem)"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.02em"
  titulo:
    fontFamily: "Shippori Mincho, Hiragino Mincho ProN, Yu Mincho, Georgia, serif"
    fontSize: "clamp(1.75rem, 1.2rem + 3vw, 3.25rem)"
    fontWeight: 400
    lineHeight: 1.32
    letterSpacing: "0.01em"
  titulo-filme:
    fontFamily: "Shippori Mincho, Hiragino Mincho ProN, Yu Mincho, Georgia, serif"
    fontSize: "clamp(2.1rem, 1.3rem + 5vw, 3.5rem)"
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: "0.01em"
  subtitulo:
    fontFamily: "Shippori Mincho, Hiragino Mincho ProN, Yu Mincho, Georgia, serif"
    fontSize: "clamp(1.0625rem, 0.95rem + 0.6vw, 1.375rem)"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0.02em"
  manuscrito:
    fontFamily: "Klee One, Shippori Mincho, Hiragino Maru Gothic ProN, Georgia, serif"
    fontSize: "clamp(1.0625rem, 1rem + 0.35vw, 1.25rem)"
    fontWeight: 400
    lineHeight: 1.6
  manuscrito-nome:
    fontFamily: "Klee One, Shippori Mincho, Georgia, serif"
    fontSize: "clamp(1.75rem, 1.4rem + 1.6vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.01em"
  brinquedo:
    fontFamily: "Fredoka, Trebuchet MS, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.0625rem, 1rem + 0.35vw, 1.25rem)"
    fontWeight: 500
    lineHeight: 1.6
  fita:
    fontFamily: "VT323, Courier New, ui-monospace, monospace"
    fontSize: "clamp(0.875rem, 0.84rem + 0.2vw, 1rem)"
    fontWeight: 400
    letterSpacing: "0.06em"
  label:
    fontFamily: "Shippori Mincho, Georgia, serif"
    fontSize: "clamp(0.875rem, 0.84rem + 0.2vw, 1rem)"
    fontWeight: 400
    letterSpacing: "0.14em"
rounded:
  corte: "2px"
  raio: "14px"
  mini: "14px"
  disco: "50%"
spacing:
  esp-1: "4px"
  esp-2: "8px"
  esp-3: "12px"
  esp-4: "16px"
  esp-5: "24px"
  esp-6: "32px"
  esp-7: "48px"
  esp-8: "72px"
  esp-9: "112px"
  margem: "clamp(22px, 6vw, 56px)"
  coluna: "720px"
  alvo: "44px"
components:
  botao-mundo:
    backgroundColor: "transparent"
    textColor: "{colors.tinta}"
    typography: "{typography.subtitulo}"
    padding: "10px 6px 12px"
    height: "44px"
  botao-mundo-hover:
    textColor: "{colors.rosa-petala}"
  folha:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.corte}"
    width: "{spacing.coluna}"
  musica-faixa:
    backgroundColor: "transparent"
    textColor: "{colors.tinta}"
    typography: "{typography.manuscrito-nome}"
    rounded: "10px"
  mini:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.mini}"
  poppy-vidro:
    backgroundColor: "rgba(8, 22, 32, 0.8)"
    textColor: "{colors.poppy-texto}"
    typography: "{typography.brinquedo}"
    rounded: "{rounded.raio}"
    padding: "clamp(22px, 5.6vw, 34px) clamp(22px, 5.6vw, 36px)"
  poppy-fechar:
    textColor: "{colors.poppy-texto}"
    typography: "{typography.fita}"
    size: "60px"
  yn-fechar:
    backgroundColor: "transparent"
    textColor: "{colors.yn-texto}"
    typography: "{typography.subtitulo}"
    padding: "14px 16px 22px"
    height: "56px"
  yn-fechar-hover:
    textColor: "{colors.yn-pessego}"
---

# Design System: Para você

## Overview

**Creative North Star: "Uma carta que é um lugar"**

Ela não lê uma página: ela anda. O chão e o céu são um branco absoluto, a câmera é uma só e tudo nasce da névoa branca e volta para ela. Não existem seções, cartões em grade, hero nem barra; existe um objeto por vez (um envelope, uma folha, uma mão) e um fio vermelho que passa por todos eles sem nunca ser apresentado. O sistema é feito de **três mundos com física própria** dentro de um mesmo papel: o mundo branco (lento, leve, nada quica), o capítulo do jogo (uma fita VHS numa fábrica de brinquedos: molas, quiques, cortes de vídeo) e o capítulo do filme (um céu que vai do dia à noite com a rolagem: luz, brilho, tempo).

A densidade é mínima de propósito. Na tela do mundo branco cabem no máximo uma frase, um objeto e uma ação. A folha (`papel`) é morna o bastante para se separar do branco sem precisar de borda. A cor de verdade é só o vermelho: pétalas e fio. Cada capítulo pode trazer a sua paleta inteira, mas sempre dentro da janela recortada no papel, nunca derramando no mundo.

O que este sistema recusa: página de rolagem com seções, botão com fundo chapado no mundo branco, cartões iguais lado a lado, gradiente genérico ou em texto, emoji, glifo unicode no lugar de ícone, rótulo pequeno acima de título, e qualquer quadro, personagem ou logotipo do filme ou do jogo.

**Key Characteristics:**
- Branco absoluto como espaço; o vermelho é "nós" e é a única cor do mundo branco.
- Uma câmera contínua: cada cena entrega um objeto para a próxima (papel → folha → pergaminho → fio → caminho).
- Texto entra em pedaços (palavra por palavra, letra por letra), nunca em bloco.
- Profundidade física (sombras de papel, WebGL, névoa), não elevação de interface.
- Cada mundo tem curva, tipo e paleta próprios; o fio é o único elemento comum aos três.

## Colors

Uma paleta de tinta e papel com um único vermelho, e duas paletas de capítulo que só vivem dentro da janela do pergaminho.

### Primary
- **Fio Vermelho** (`fio`): o akai ito. Cordão dos envelopes, linha de progresso e costura na borda do pergaminho, sublinhado dos botões do mundo branco, anel de foco, cordão trançado do filme, fio entre as duas imagens, laço no pulso, caminho até a última carta. `fio-escuro` é a sombra dele (cera, marcas do mini seletor).
- **Rosa Pétala** (`rosa-petala`): as pétalas que caem no mundo branco, o hover dos botões do mundo e a cor de seleção de texto. Mais fechado e mais frio que o fio, para as pétalas nunca se confundirem com ele.

### Secondary
- **Paleta da Fábrica** (capítulo do jogo): fundo `poppy-fundo` (azul-petróleo quase preto) com `poppy-fundo-claro` para planos próximos; os quatro plásticos de brinquedo `poppy-vermelho`, `poppy-amarelo`, `poppy-azul`, `poppy-verde` nos blocos do título, nas mãos e na esteira; texto creme `poppy-texto` sobre vidro escuro e `poppy-tinta` sobre plástico claro. O amarelo é o foco e a seleção deste mundo.

### Tertiary
- **Paleta do Céu** (capítulo do filme): uma escala de hora, de `yn-noite` (índigo profundo) passando por `yn-crepusculo` (violeta) e `yn-rosa` até `yn-pessego` (a luz do horizonte). Texto `yn-texto` sobre o céu escuro, `yn-tinta-dia` no título enquanto o céu ainda é dia. O pêssego é o foco, a seleção e o hover deste mundo.

### Neutral
- **Branco Absoluto** (`branco`): chão, céu, fundo do `body` e do canvas. Nunca cinza, nunca creme.
- **Tinta** (`tinta`): todo texto do mundo branco e da folha; também a base de todas as sombras do papel (`rgba(42, 27, 34, …)`).
- **Tinta Suave** (`tinta-suave`): texto secundário (artista da música, dica "Toque na carta."). 6,6:1 sobre branco.
- **Tinta Fraca** (`tinta-fraca`): só traços e detalhes desenhados, nunca texto corrido.
- **Papel** (`papel`): a folha, o mini seletor, a última folha. Um passo mais morno que o branco; é o que separa o objeto do mundo. `papel-sombra` e `papel-linha` fazem dobras, vincos e traços de tinta no papel.

### Named Rules
**The Um Vermelho Rule.** No mundo branco, a única cor permitida é o vermelho (pétala e fio). Qualquer outro matiz pertence a um capítulo e fica dentro da janela do pergaminho.

**The Fio Não Se Anuncia Rule.** O fio nunca recebe legenda, ícone, brilho de destaque ou explicação. Ele aparece como coisa (cordão, costura, sublinhado, caminho) e ela só percebe no fim.

**The Sombra É Tinta Rule.** Sombras são sempre a tinta `#2a1b22` com alfa, nunca preto puro; no céu do filme, índigo `rgba(3, 4, 22, …)`; na fábrica, petróleo `rgba(2, 8, 12, …)`.

## Typography

**Display Font:** Shippori Mincho (com Hiragino Mincho ProN, Yu Mincho, Georgia)
**Body Font:** Klee One para o que é manuscrito (com Shippori Mincho, Georgia)
**Mundo do jogo:** Fredoka (variável, 300–700) e VT323 para a tela do videocassete

**Character:** Um mincho japonês de traço fino e contraste alto dá voz às frases do mundo, como uma carta escrita com pincel; o Klee One é a mão dele. Fredoka e VT323 só existem dentro da fita: plástico de brinquedo e letreiro de vídeo. Todas as fontes são locais (`assets/fonts/`), com recorte latino.

### Hierarchy
- **Frase** (400, `clamp(1.625rem, 6.6vw, 2.75rem)`, 1.5): as frases do mundo branco, centradas no terço de cima (`top: 24%`), no máximo 16em, entrando palavra por palavra.
- **Título** (400, `clamp(1.75rem, 1.2rem + 3vw, 3.25rem)`, 1.32): o alto da folha ("Escolhe a nossa música.").
- **Título do filme** (600, `clamp(2.1rem, 1.3rem + 5vw, 3.5rem)`, 1.18): título do capítulo 2 sobre o céu de dia. No capítulo 1 o título vira blocos de brinquedo, uma letra por bloco, em Fredoka.
- **Subtítulo** (400, `clamp(1.0625rem, 0.95rem + 0.6vw, 1.375rem)`, 1.6): subtítulos e o texto dos botões do mundo (em 600, `letter-spacing: 0.06em`).
- **Manuscrito** (Klee One 400, `clamp(1.0625rem, 1rem + 0.35vw, 1.25rem)`, 1.6): os versos do filme, legendas, a dica; o nome de cada música em 600, `clamp(1.75rem, 1.4rem + 1.6vw, 2.25rem)`. A frase final é escrita à mão letra por letra numa textura dentro do mundo 3D.
- **Label** (Shippori 400, `clamp(0.875rem, 0.84rem + 0.2vw, 1rem)`, `letter-spacing: 0.14em`): a dica discreta; em VT323, o contador e o OSD da fita.

### Named Rules
**The Pedaço Por Pedaço Rule.** Texto de cena nunca aparece em bloco: frases entram palavra por palavra (cada palavra sobe ~0,4em com desfoque que some), o manuscrito letra por letra. Com movimento reduzido, só opacidade.

**The Fonte Tem Endereço Rule.** Fredoka e VT323 nunca saem do capítulo do jogo; Shippori e Klee One nunca entram no plástico da fábrica.

## Layout

Celular em pé primeiro (360–430 px), sobre `100dvh` (`--tela`) com as quatro áreas seguras (`env(safe-area-inset-*)`). Não há grade: há camadas fixas empilhadas — o mundo (canvas WebGL, ou `#mundo-leve` sem WebGL), o pergaminho, o palco com frases e ações, e o mini seletor no canto.

- **Mundo branco:** frase no terço de cima, objeto no centro, ação embaixo (`bottom: seguro-base + clamp(48px, 12vh, 112px)`). A carta para a ~72% da largura da tela em pé e ~28% no computador, nunca mais de 46% da altura.
- **Pergaminho:** no celular cobre a tela, com uma moldura de papel de 10 px (16 px a partir de 760 px) e a borda direita mais larga (18/28 px), onde passa a costura do fio. No computador é uma coluna central de até 720 px (`--coluna`) e o mundo branco com as pétalas continua visível dos lados.
- **Ritmo:** escala de espaços de 4 a 112 px (`esp-1`…`esp-9`), respiro lateral fluido `clamp(22px, 6vw, 56px)`. Dentro do capítulo do filme o ritmo é medido em altura de tela (`--yn-vh`): versos separados por 20% da tela, o céu livre ocupa 1,6 tela.
- **Computador:** os versos do filme alternam de lado; os cartões da fábrica se encostam à esquerda, à direita ou ao meio (`data-lado`), nunca em grade.

**The Um Por Vez Rule.** Uma tela do mundo branco tem no máximo uma frase, um objeto e uma ação. Se precisar de mais, é outra etapa.

## Elevation & Depth

A profundidade é física, não de interface. O mundo branco tem profundidade real em WebGL: névoa branca de 2,5 a 9,5 m (as coisas nascem do branco), pétalas em três distâncias (três ou quatro enormes e desfocadas perto da câmera, dezenas pequenas e nítidas ao longe), luz hemisférica e uma direcional. No DOM, a única coisa que "levanta" é papel, e a sombra imita papel: várias camadas largas e baixas na cor da tinta, que surgem por opacidade depois que a folha pousa.

### Shadow Vocabulary
- **Folha pousada** (`0 2px 3px rgba(42,27,34,.05), 0 16px 30px -14px rgba(42,27,34,.17), 0 46px 110px -26px rgba(42,27,34,.2)`): o pergaminho sobre o mundo.
- **Folha no ar** (`0 34px 70px -18px rgba(42,27,34,.2), 0 90px 150px -40px rgba(42,27,34,.18)`): a folha enquanto ainda flutua; troca com a pousada por opacidade.
- **Espessura do corte** (`0 1px 0 rgba(255,255,255,.95), 1px 0 0 rgba(255,255,255,.7), 0 -1px 0 rgba(42,27,34,.09), -1px 0 0 rgba(42,27,34,.06)`): a aresta da janela recortada no papel; embaixo e à direita pega luz.
- **Mini seletor** (`0 1px 2px rgba(42,27,34,.08), 0 18px 40px -14px rgba(42,27,34,.32)`): o disco que fica no canto.
- **Vidro da fábrica** (`0 18px 38px rgba(2,8,12,.42), inset 0 1px 0 rgba(242,234,216,.08)`): cartões de texto do capítulo do jogo.
- **Postal no céu** (`0 2px 6px rgba(3,4,22,.3), 0 24px 52px rgba(3,4,22,.5)`): imagens do capítulo do filme.

### Named Rules
**The Só Papel Levanta Rule.** Botões, rótulos e textos nunca têm sombra. Sombra é de papel, capa de disco, vidro ou foto: objetos que existem.

**The Sem Vidro Grande Rule.** `backdrop-filter` só em cartões pequenos (blur 7 px) e cai para fundo opaco (`rgba(8,22,32,.9)`) no nível baixo; nunca em área de tela inteira.

## Shapes

Formas de objetos, não de interface. Papel tem cantos quase vivos (`corte`, 2 px) e vincos; discos e furos são círculos; pétalas são gotas assimétricas (`border-radius: 60% 60% 55% 55% / 85% 85% 35% 35%`). O raio de interface (`raio`, 14 px) aparece só no mini seletor e no vidro da fábrica. Na fábrica cada cartão é "preso" de um jeito (fita adesiva, parafusos, etiqueta, ímã, pregador) e o raio acompanha o enfeite: 4, 8, 10/16, 18/4 ou 22 px. Os blocos do título têm raio proporcional ao lado (16%).

Ícones são sempre SVG desenhados à mão com traço redondo (`stroke-linecap: round`): a seta de descer na borda do rolo, os ícones do OSD da fita, a agulha com o laço do fio.

## Components

### Botão do mundo branco
*Texto em tinta sublinhado pelo fio.*
- **Forma:** sem fundo e sem borda; um traço de 2 px no `fio` com cantos de 2 px corre embaixo da palavra.
- **Tipo:** Shippori 600, tamanho de subtítulo, `letter-spacing: 0.06em`. Alvo mínimo de 44 × 44 px.
- **Estados:** `:active` em `scale(0.97)` (160 ms, `--curva-ui`); hover só com mouse fino: texto vai para `rosa-petala` e o fio se estica 6% (320 ms, curva de entrada do branco). Foco: anel de 2 px no `fio` com 4 px de afastamento.
- **Variante "Seguir o fio":** o sublinhado vira um fio SVG que se desenha (`stroke-dashoffset`) e depois vira o caminho no mundo.

### A folha (pergaminho)
*O papel que sai da carta e vira a página.*
- **Fundo:** `papel` com ladrilho de fibra (256 px, gerado no JS) e uma luz em diagonal, mais clara no alto à esquerda.
- **Janela:** o capítulo mora numa janela recortada no papel, com a espessura do corte desenhada por sombras de 1 px.
- **Costura:** na borda direita, pontos do fio em SVG que avançam com a rolagem (é a linha de progresso) e uma agulha que puxa o laço.
- **Rolo:** desenrola de cima para baixo para abrir um capítulo e enrola de volta para fechar; o rolo tem corpo, fibra, luz e sombra próprios.

### Seletor de música
*Compacto de vinil na folha, não lista de streaming.*
- **Uma faixa:** capa grande (`clamp(150px, min(58vw, 32% da tela), 300px)`) com o disco saindo de trás quando tocada; nome em Klee One 600, artista em `tinta-suave`.
- **Várias faixas:** lista alinhada à esquerda, capa de 60–88 px, traço de tinta entre linhas; o laço do fio dá a volta na faixa escolhida.
- **Estados:** `aria-pressed` move o disco 16% para fora; `:active` em `scale(0.985)`.

### Mini seletor
*O disco que fica com ela até o fim.*
- **Forma:** disco com a capa (furo e aro no `papel`), painel em `papel` com raio de 14 px e sombra de mini.
- **Pele:** troca de pele por mundo (`data-pele="poppy"`, céu do filme): fundo, texto, trilho e foco acompanham o capítulo; o fio do volume é sempre vermelho, com uma conta em gradiente radial.

### Cartão de vidro da fábrica
*Um recado preso na parede da fábrica.*
- **Fundo:** `rgba(8,22,32,.8)` com blur de 7 px, borda creme a 10%, texto `poppy-texto` em Fredoka.
- **Enfeite:** cada cartão tem um prendedor desenhado (fita, parafusos, etiqueta, ímã, pregador) e o raio muda com ele. Larguras e lados variam: nunca dois cartões iguais em sequência.

### Fechar o capítulo
- **No jogo:** a tecla de parar de um videocassete (60 × 60 px no mínimo) num painel com luz; o OSD escreve STOP em VT323.
- **No filme:** texto Shippori 600 em `yn-texto` sobre um halo radial índigo; hover em `yn-pessego`; ao fechar, o fio engrossa para 3 px e acende.

### O fio (assinatura)
*O akai ito: uma fita 3D voltada para a câmera, com textura trançada no shader, largura mínima em pixels e sombra suave no chão.* Aparece como cordão do envelope, costura do pergaminho, cordão trançado e fio entre as imagens do filme, laço no pulso, caminho até a última carta e o fio que amarra a carta final. Na versão sem WebGL ele é um SVG com uma sombra deslocada (`stroke: var(--fio)`, 2,1 px).

## Do's and Don'ts

### Do:
- **Do** usar as curvas nomeadas de cada mundo (`curvas.branco|poppy|yourname|ui` na GSAP, `--curva-*` no CSS): branco entra em 1,2–2,4 s com `cubic-bezier(0.16, 1, 0.3, 1)` e nada quica; a fábrica usa `elastic.out(1, 0.45)`, `bounce.out`, `back.out(2.2)` e cortes em `steps()` de 80–160 ms; o céu usa `sine.inOut` longo e brilhos que florescem e somem devagar.
- **Do** responder à interface em 120–200 ms (`--dur-ui: 160ms`), com `:active` em `scale(0.97)` e hover só em `(hover: hover) and (pointer: fine)`.
- **Do** entregar um objeto de uma cena para a próxima: a troca do papel 3D pela folha DOM é invisível, e o fio do filme vira o laço do pulso que vira o caminho.
- **Do** dar a cada mundo a sua versão calma (`html.reduzido`): sem balanço de passo, deslocamentos viram dissolvências, pétalas poucas e lentas, texto só com opacidade. Nunca tela vazia.
- **Do** manter contraste de pelo menos 4,5:1 sobre vidro e imagem (véus e halos índigo atrás do texto do céu) e alvos de toque de pelo menos 44 px.
- **Do** fazer cada peça ficar completa sem imagem gerada: o site desenha a fábrica, o céu, a mão e o cordão sozinho, e uma imagem que falta some sem buraco.

### Don't:
- **Don't** pôr qualquer cor além do vermelho no mundo branco, nem fundo cinza ou creme no lugar do branco absoluto.
- **Don't** usar emoji, glifo unicode como ícone, gradiente genérico, texto com gradiente, rótulo pequeno acima de título, ou grade de cartões iguais.
- **Don't** usar `ease-in` em resposta de interface, nem deslizar suave dentro da fábrica, nem quicar no mundo branco.
- **Don't** dar sombra a texto ou botão do mundo branco; sombra é de papel.
- **Don't** usar personagens, quadros ou logotipos do filme ou do jogo: as referências são objetos genéricos (mãos de brinquedo, fita, esteira, cometa, cordão).
- **Don't** anunciar o fio: sem legenda, sem brilho chamando atenção, sem a palavra "fio" na tela antes da hora.
- **Don't** usar `backdrop-filter` em área grande nem animar nada além de `transform` e `opacity` no DOM.
