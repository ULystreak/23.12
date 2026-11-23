# UI: vidro e lanterna

Direção visual das peças em DOM na v2 (senha, música, bolsa, voz, cartas do chão, contador, resposta, menu, botões e dicas), na direção "Noite de lanternas" (DESIGN.md). Regra principal: **vidro para tocar, papel para ler**. Tudo o que ela toca é vidro escuro (`--vidro`, `--vidro-forte`) com filete dourado (`--fio-ouro`) e cantinhos de luz; tudo o que ela lê dele é papel washi aceso por trás (`data-tom="papel"`). As fichas e as classes ficam em `css/base.css`, bloco "Vidro e lanterna"; as cenas usam as classes e acertam posição e tamanho nos próprios arquivos.

## Fichas (css/base.css)
- **Cor:** `--noite` #0b1026; `--noite-funda` #060914; `--vidro` e `--vidro-forte` (anil translúcido); `--fio-ouro` (filete); `--ouro` #e9c27a; `--ouro-claro` #f6dca6; `--chama` #ffb45e; `--luar` #f4efe6 (texto, 15:1); `--luar-suave` #bdb7cc (9:1); `--fio` #e3283c com `--fio-brilho`; `--papel` #f7ecd6 (washi); `--tinta` #2a1b22 (a letra dele no papel).
- **Raio:** `--raio-p` 10 px; `--raio-m` 16 px; `--raio-g` 26 px; `--raio-pilula` 999 px.
- **Sombra:** anil profundo, nunca preto puro; o brilho é ouro (`--brilho-ouro`).
- **Tipo:** `--fonte-mao` (Klee One) para a papelaria; `--fonte-titulo` (Shippori Mincho) para frases.
- **Movimento:** `--mola` (com `linear()` no Safari 17.2+), `--mola-firme` para folhas grandes, `--curva-sair`, `--curva-ui`; `--dur-toque` 120 ms, `--dur-ui` 160 ms, `--dur-mola` 460 ms, `--dur-folha` 420 ms, `--dur-sair` 180 ms; `--passo` 45 ms entre itens.

## Peças
| Classe | O que é | Medida |
|---|---|---|
| `.botao` | botão do mundo, letra de luar com sublinhado de luz dourada | alvo 44 px |
| `.ui-pilula` | vidro com filete dourado; `data-tom="fio"` é a ação principal acesa (ouro); `"noite"` é vidro mais fechado | altura 52 px |
| `.ui-redondo` | botão de ícone; mesmos tons | 48 × 48 px |
| `.ui-folha` | vidro com cantinhos dourados; `data-tom="papel"` (washi aceso), `data-borda="base"` (folha de baixo) | no computador, até 520 px |
| `.ui-puxador` | a barrinha da folha de baixo | 44 × 4 px |
| `.ui-titulo`, `.ui-nota` | título em Shippori ouro claro; nota em Klee One luar suave | |
| `.ui-campo` | campo de escrever | fonte de 16 px ou mais |
| `.ui-icone` | SVG 24 × 24, traço 1,75, sem preenchimento, `currentColor` | 24 px |
| `.ui-laco`, `.ui-petala`, `.ui-coracao`, `.ui-fio` | enfeites, um por peça, `aria-hidden` | |
| `.ui-selo` | contagem pequena (itens na bolsa, cartas que faltam) | 20 px |
| `.ui-rola` | área que rola por dentro de uma folha | |
| `.ui-escuro` | contexto escuro (o padrão da v2): foco em ouro | |
| `.ui-entra` | entrada com mola, escalonada por `--i` | 460 ms |
| `@keyframes ui-pulo` | o pulinho de guardar na bolsa | |

## Regras
1. Cada peça usa as classes `ui-*`; a cena só acerta posição e tamanho.
2. Entrar é com mola; sair é rápido e sem mola. Só `transform` e `opacity`. Nada de ease-in.
3. Folha grande entra com `--mola-firme`: de baixo (`translateY(100%)`) ou do centro (`scale(.94)` com opacidade). O véu atrás só muda a opacidade.
4. Ícones em SVG 24 × 24, traço 1,75, sem preenchimento, `currentColor`; um ponto cheio opcional (`.cheio`). Nada de glifo unicode: o "×" também é SVG.
5. `#dica` é um bilhete em Klee One com uma pétala boiando embaixo.
6. No computador, as folhas têm de 440 a 520 px de largura, centradas; a folha de baixo vira cartão flutuante com os quatro cantos.
7. Coração só onde fala de afeto: a fita da voz, o envio da resposta, a carta "Nossos momentos".
8. Ouro e um vermelho: o vermelho cheio é só do fio; a ação principal é dourada.
9. Alvo de pelo menos 44 px (pílula 52, redondo 48).

## Casos especiais
- `html.reduzido` e `prefers-reduced-motion`: as peças `ui-*` viram dissolvência (240 ms, linear).
- `?webgl=0`: nenhuma peça depende do canvas.
