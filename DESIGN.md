---
nome: Para você
cores:
  branco: "#ffffff"
  tinta: "#2a1b22"
  tinta-suave: "#6b5961"   # 6,6:1 sobre branco
  tinta-fraca: "#8a7a81"   # só traços
  rosa-petala: "#b3123a"
  fio: "#d7192d"
  fio-escuro: "#a80f22"
  papel: "#fbf7f0"
  papel-sombra: "#efe7da"
  papel-linha: "#e3d9c8"
  sakura: "#f4b8c8"
  sakura-clara: "#fbe6ec"
  sakura-tinta: "#8f1f45"  # cerca de 8:1 sobre o papel
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
tipos:
  frase: { familia: "Shippori Mincho", tamanho: "clamp(1.625rem, 6.6vw, 2.75rem)", linha: 1.5, letra: "0.02em" }
  titulo: { familia: "Shippori Mincho", tamanho: "clamp(1.75rem, ..., 3.25rem)", linha: 1.32 }
  titulo-filme: { familia: "Shippori Mincho", peso: 600, tamanho: "clamp(2.1rem, ..., 3.5rem)", linha: 1.18 }
  subtitulo: { familia: "Shippori Mincho", tamanho: "clamp(1.0625rem, ..., 1.375rem)", linha: 1.6 }
  manuscrito: { familia: "Klee One", tamanho: "clamp(1.0625rem, ..., 1.25rem)", linha: 1.6 }
  nome-musica: { familia: "Klee One", peso: 600, tamanho: "clamp(1.75rem, ..., 2.25rem)" }
  brinquedo: { familia: "Fredoka", peso: 500, linha: 1.6 }
  fita: { familia: "VT323", tamanho: "clamp(0.875rem, ..., 1rem)", letra: "0.06em" }
  rotulo: { familia: "Shippori Mincho", letra: "0.14em" }
raios: { corte: 2px, raio: 14px, disco: 50%, p: 10px, m: 16px, g: 26px, pilula: 999px }
espacos: [4, 8, 12, 16, 24, 32, 48, 72, 112]
margem: "clamp(22px, 6vw, 56px)"
coluna: 720px
alvo: 44px
---

# Para você: sistema de design

## A estrela do norte: uma carta que é um lugar
Branco absoluto, uma câmera contínua, três mundos com física própria e o fio vermelho como único elemento comum. Recusamos: rolagem por seções, cartões em grade, hero, barra de navegação, gradiente genérico, emoji, glifo unicode como ícone, rótulo pequeno acima de título, e quadros, personagens ou logotipos do filme ou do jogo copiados.

## Regras com nome
- **Um vermelho.** No mundo branco, a única cor é o vermelho (a pétala e o fio). Os outros matizes pertencem a um capítulo e ficam dentro da janela do pergaminho. Numa tela, o vermelho cheio é de uma coisa só: o fio ou um botão principal.
- **O fio não se anuncia.** Nunca recebe legenda, ícone, brilho de destaque ou explicação. Ela só percebe no fim.
- **Sombra é tinta.** Sombra sempre com a tinta (#2a1b22, arroxeada), nunca preto puro; no céu, índigo; na fábrica, petróleo. Sempre com deslocamento.
- **Pedaço por pedaço.** Texto de cena nunca entra em bloco. Frases entram por palavra (cada palavra sobe 0,4em e perde o desfoque); o manuscrito entra letra por letra. Com movimento reduzido, só opacidade.
- **A fonte tem endereço.** Fredoka e VT323 só existem no capítulo do jogo; Shippori e Klee One nunca entram no plástico da fábrica.
- **Um por vez.** Uma tela do mundo branco tem no máximo uma frase, um objeto e uma ação.
- **Só papel levanta.** Botões, rótulos e textos nunca têm sombra; papel tem.
- **Sem vidro grande.** `backdrop-filter` só em cartões pequenos (blur de 7 px); nunca em área grande.

## Layout
- Celular em pé de 360 a 430 px, sobre `100dvh` (`--tela`) e as áreas seguras (`--seguro-*`).
- A frase fica no terço de cima (`top: 24%`), com no máximo 16em. O objeto fica no centro e a ação embaixo.
- A carta ocupa cerca de 72% da largura em pé e 28% no computador, nunca mais de 46% da altura.
- O pergaminho tem moldura de papel de 10 px (16 px a partir de 760 px) e borda direita de 18 px (28 px no computador), onde passa a costura do fio, que é a linha de progresso.
- No computador, coluna central de até 720 px. Folhas da papelaria com largura de 440 a 520 px, centradas.
- Os versos do filme ficam separados por cerca de 20% da tela; o céu livre ocupa 1,6 tela.

## Profundidade
Névoa branca de 2,5 a 9,5 m. Pétalas em três distâncias: três ou quatro enormes e desfocadas perto da câmera, dezenas pequenas e nítidas ao longe. A sombra da folha pousada aparece por opacidade quando a folha assenta.

## Formas
Pétalas com `border-radius: 60% 60% 55% 55% / 85% 85% 35% 35%`. Cartões da fábrica com raios variados (4, 8, 10/16, 18/4 ou 22 px), nunca iguais em sequência. Blocos do título com raio de 16% do lado.

## Sombras de papel
- Folha pousada: `--sombra-papel`. Folha no ar: `--sombra-flutua`. Detalhe: `--sombra-baixa`.
- Vidro da fábrica: `0 18px 38px rgba(2, 8, 12, .42)`.
- Postal no céu: `0 2px 6px rgba(3, 4, 22, .3), 0 24px 52px rgba(3, 4, 22, .5)`.

## Movimento
- **Mundo branco:** entra em 1,2 a 2,4 s com `cubic-bezier(0.16, 1, 0.3, 1)`, sem quique. Nada quica.
- **Fábrica:** `elastic.out(1, 0.45)`, `bounce.out`, `back.out(2.2)` e cortes em `steps()` de 80 a 160 ms. Nada desliza suave.
- **Céu:** `sine.inOut` longo. Luz e tempo.
- **Interface:** resposta em 120 a 200 ms (`--dur-ui: 160ms`), nunca ease-in. `:active` em `scale(0.97)` por 160 ms. Hover de 320 ms, só com ponteiro fino.
- As curvas são nomeadas e registradas no GSAP (`curvas.branco`, `curvas.poppy`, `curvas.yourname`, `curvas.ui` em `js/nucleo/movimento.js`); as que o CSS usa estão em `--curva-*`.
- No DOM, só `transform`, `opacity` e cor. Nada pisca, nada treme sem motivo.
- **Movimento reduzido** (`html.reduzido`): sem balanço de passo; deslocamentos viram dissolvências; poucas pétalas, lentas; texto só com opacidade. Nunca tela vazia.

## Peças
- **Botão do mundo** (`.botao`): texto em Shippori 600 com 44 px de alvo; o sublinhado é o fio costurado à mão (uma onda miúda que se repete). "Seguir o fio": o sublinhado vira um fio SVG que se desenha e depois vira o caminho no mundo.
- **Papelaria** (`.ui-*`, ver `_dev/UI.md`): pílula de 52 px, redondo de 48 px, folha creme com pesponto, puxador, título e nota em Klee One, enfeites (laço, pétala, coração, fio) um por peça, selo de contagem.
- **Mini seletor de música:** disco com a capa no canto, sempre à vista; muda de pele por capítulo (`data-pele`). O fio do volume é sempre vermelho.
- **Fechar da fábrica:** a tecla STOP de um videocassete, com 60 px. **Fechar do filme:** texto em `yn-texto` sobre um halo índigo, hover em pêssego; ao fechar, o fio engrossa para 3 px e acende.
- **Fio:** fita 3D voltada para a câmera, textura trançada no shader, largura mínima em pixels e sombra suave no chão. Sem WebGL, um SVG com sombra deslocada (stroke `var(--fio)`, 2,1 px).
- **Última carta:** a frase é escrita à mão, letra por letra, numa textura dentro do mundo 3D.

## Acessibilidade
Contraste de pelo menos 4,5:1 sobre vidro e sobre imagem, com véus e halos índigo atrás do texto do céu. Alvos de 44 px. Foco visível (2 px de fio; estrela no escuro). Hover só em `(hover: hover) and (pointer: fine)`. Cada peça fica completa sem imagem gerada: o site desenha a fábrica, o céu, a mão e o cordão.
