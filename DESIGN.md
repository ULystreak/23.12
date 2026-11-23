---
nome: Para você — Noite de lanternas
cores:
  noite: "#0b1026"         # o céu e o fundo das telas
  noite-funda: "#060914"   # a tela da senha, os cantos
  anil: "#18204a"          # painéis
  vidro: "rgba(14, 19, 46, 0.74)"     # vidro escuro das telas de toque
  vidro-forte: "rgba(10, 14, 34, 0.88)"
  fio-ouro: "rgba(233, 194, 122, 0.34)" # o filete dourado das bordas
  ouro: "#e9c27a"
  ouro-claro: "#f6dca6"
  ouro-escuro: "#a97c35"
  chama: "#ffb45e"         # a luz das lanternas
  brasa: "#ff8a3d"
  luar: "#f4efe6"          # texto principal sobre o escuro (16:1 sobre a noite)
  luar-suave: "#bdb7cc"    # texto secundário (9:1)
  luar-fraco: "#8d88a3"    # só traços
  fio: "#e3283c"           # o fio vermelho, que brilha
  fio-brilho: "rgba(255, 64, 78, 0.55)"
  sakura: "#f2b6c6"        # pétalas sob a luz das lanternas
  washi: "#f7ecd6"         # o papel das cartas, aceso por dentro
  washi-sombra: "#e8d6b4"
  tinta: "#2a1b22"         # a letra dele no papel
tipos:
  frase: { familia: "Shippori Mincho", tamanho: "clamp(1.625rem, 6.6vw, 2.75rem)", linha: 1.5, letra: "0.04em", cor: luar }
  titulo: { familia: "Shippori Mincho", peso: 600, letra: "0.08em", cor: ouro-claro }
  rotulo: { familia: "Shippori Mincho", tamanho: "0.8125rem", letra: "0.22em", caixa: "versalete" }
  manuscrito: { familia: "Klee One", linha: 1.6 }   # a letra dele e a dela, no papel
  brinquedo: { familia: "Fredoka" }                  # só no capítulo do jogo
  fita: { familia: "VT323" }                         # só no capítulo do jogo
raios: { vidro: 18px, chip: 12px, pilula: 999px, lanterna: "46% 46% 40% 40% / 30% 30% 22% 22%" }
alvo: 44px
---

# Para você: Noite de lanternas (sistema de design da v2)

A v1 é uma alameda de cerejeiras de dia, em branco absoluto, com papelaria creme. A v2 conta a mesma história, com o mesmo roteiro, os mesmos textos e as mesmas funções, **numa noite iluminada por lanternas de papel**. O caminho é o mesmo; a luz é outra.

## A estrela do norte: o caminho que se acende para ela
A carta começa na hora azul, logo depois do pôr do sol, com as lanternas apagadas. A cada parte que ela vive, mais lanternas se acendem ao longo da alameda, até a noite estrelada do fim, com o cometa. Ela nunca anda no escuro: a luz vai na frente dela. O fio vermelho é a única linha que brilha por conta própria.

## Regras com nome
- **Ouro e um vermelho.** O mundo é anil e preto-azulado. A luz quente (ouro e chama) é das lanternas e dos vaga-lumes. O vermelho cheio é do fio, e de nada mais por tela: lacres e botões principais são dourados, não vermelhos.
- **O fio brilha, não se anuncia.** O fio tem um halo vermelho suave (`--fio-brilho`) e nunca recebe legenda, ícone ou explicação.
- **Luz respira, não pisca.** Chamas e vaga-lumes mudam de intensidade devagar (períodos de 2 a 6 s, amplitude pequena). Nada de tremeluzir rápido, nada de piscar.
- **Vidro para tocar, papel para ler.** Tudo o que ela toca (senha, música, bolsa, botões, menu, folhas de interface) é vidro escuro com filete dourado. Tudo o que ela lê dele (as cartas, os capítulos, a folha final) é papel washi aceso por trás, quente.
- **Sombra é noite.** Sombras em anil profundo (`rgba(3, 5, 18, …)`), nunca preto puro; o brilho é ouro.
- **Pedaço por pedaço.** Frases entram palavra por palavra, como se acendessem (sobem 0,3em, saem do desfoque, ganham um leve brilho dourado que assenta). Manuscrito letra por letra.
- **A fonte tem endereço.** Shippori Mincho para frases e títulos (agora mais espaçada, com versalete nos rótulos); Klee One para o que é escrito à mão; Fredoka e VT323 só no capítulo do jogo.
- **Um por vez.** Uma frase, um objeto e uma ação por tela.

## Formas
- **Lanterna** é a forma-assinatura: o corpo de papel arredondado (raio `46% 46% 40% 40% / 30% 30% 22% 22%`), com tampa e base escuras. Ela aparece no cadeado da senha, nos pontinhos do carrossel, nas etiquetas do menu, no selo da bolsa.
- **Vidro**: painel `--vidro` com `backdrop-filter: blur(10px)` só em peças pequenas, filete de 1 px em `--fio-ouro`, raio de 18 px, sombra anil. Sem pesponto tracejado (era da v1).
- **Botão principal**: pílula com borda dourada de 1 px, texto em ouro claro, fundo vidro; ao tocar, acende (o fundo vira um degradê de chama muito suave por 160 ms). Um por tela.
- **Botão do mundo** (`.botao`, texto solto sobre a alameda): letra luar, sublinhado de luz dourada que se acende da esquerda para a direita.
- **Ícones**: SVG 24 × 24, traço 1,5 em ouro, sem preenchimento.

## O mundo
- Céu de anil a preto-azulado com estrelas pequenas e nítidas; perto do horizonte, um véu violeta.
- Névoa azul-violeta (não branca), que esconde o fim da alameda.
- Cerejeiras escuras, com as flores rosadas iluminadas de baixo pela luz das lanternas.
- Lanternas de papel em postes baixos dos dois lados do caminho (no lugar dos pilaretes com corrente da v1) e fieiras de lanternas penduradas entre as árvores. Elas se acendem por etapas, conduzidas pela hora.
- Vaga-lumes: poucos, dourados, que derivam devagar e respiram; fogem do dedo como as pétalas.
- Pétalas: continuam caindo, menos numerosas, rosadas e aquecidas pela luz.
- A hora da v2 (mesmos nomes internos da v1, para não quebrar contratos): `manha` = hora azul, lanternas apagadas; `dia` = primeiras lanternas; `entardecer` = lanternas acesas; `crepusculo` = noite; `noite` = noite estrelada com o cometa.

## Movimento
- Mundo: entradas longas e macias (1,2 a 2,4 s, `curvas.branco.entrar`); lanternas balançam como pêndulo leve (±2°, 4 a 6 s).
- Acender: a luz cresce em 600 a 900 ms com `curvas.yourname.florescer`, sem quique.
- Interface: 120 a 200 ms, nunca ease-in.
- Movimento reduzido: sem balanço, sem deriva de vaga-lumes (ficam parados e só respiram, ou somem), passagens por opacidade.

## Acessibilidade
Texto luar sobre a noite passa de 15:1; luar-suave passa de 9:1; ouro (#e9c27a) sobre a noite passa de 10:1. Texto sobre imagem ou sobre a alameda tem véu anil atrás. Alvos de 44 px, foco visível em ouro (2 px), teclado e leitor de tela em todas as telas.
