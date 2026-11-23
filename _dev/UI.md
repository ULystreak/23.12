# UI: a papelaria da alameda

Direção visual das peças em DOM: senha, música, bolsa, voz, cartas do chão, contador, resposta, menu, botões e dicas. Tudo o que ela toca parece papelaria feita à mão por ele: papel creme com pesponto, letra à mão, o fio vermelho como costura e lacinho, pétala de cerejeira como enfeite. As fichas e as classes ficam em `css/base.css`, bloco "Papelaria da alameda". Só o integrador edita base.css; as cenas usam as classes e acertam posição e tamanho nos próprios arquivos.

## Fichas (css/base.css)
- **Cor:** `--papel` #fbf7f0; `--papel-linha` #e3d9c8; `--tinta` #2a1b22; `--tinta-suave` #6b5961; `--fio` #d7192d; `--sakura` #f4b8c8; `--sakura-clara` #fbe6ec; `--sakura-tinta` #8f1f45 (cerca de 8:1 sobre o papel); `--noite-veu` rgba(9, 12, 40, 0.66); `--luar` #fdf6ee; `--luar-suave` #cfc6dc; `--estrela` #ffd1a1; `--ponto` rgba(120, 96, 84, 0.34); `--ponto-noite` rgba(255, 209, 161, 0.42).
- **Raio:** `--raio-p` 10 px; `--raio-m` 16 px; `--raio-g` 26 px; `--raio-pilula` 999 px.
- **Sombra:** `--sombra-papel`, `--sombra-flutua`, `--sombra-baixa`, sempre com deslocamento e tinta arroxeada.
- **Tipo:** `--fonte-mao` (Klee One) para a papelaria; `--fonte-titulo` (Shippori Mincho) para frases.
- **Movimento:** `--mola` (com `linear()` no Safari 17.2+), `--mola-firme` para folhas grandes, `--curva-sair`, `--curva-ui`; `--dur-toque` 120 ms, `--dur-ui` 160 ms, `--dur-mola` 460 ms, `--dur-folha` 420 ms, `--dur-sair` 180 ms; `--passo` 45 ms entre itens.

## Peças
| Classe | O que é | Medida |
|---|---|---|
| `.botao` | botão do mundo branco, sublinhado de fio costurado | alvo 44 px |
| `.ui-pilula` | a ação principal; `data-tom="fio"` (vermelho) ou `"noite"` (vidro azul escuro) | altura 52 px |
| `.ui-redondo` | botão de ícone; mesmos tons | 48 × 48 px |
| `.ui-folha` | papel creme com pesponto; `data-borda="base"` (folha de baixo), `data-tom="noite"` | no computador, até 520 px |
| `.ui-puxador` | a barrinha da folha de baixo | 44 × 4 px |
| `.ui-titulo`, `.ui-nota` | título e nota em Klee One | |
| `.ui-campo` | campo de escrever | fonte de 16 px ou mais |
| `.ui-icone` | SVG 24 × 24, traço 1,75, sem preenchimento, `currentColor` | 24 px |
| `.ui-laco`, `.ui-petala`, `.ui-coracao`, `.ui-fio` | enfeites, um por peça, `aria-hidden` | |
| `.ui-selo` | contagem pequena (itens na bolsa, cartas que faltam) | 20 px |
| `.ui-rola` | área que rola por dentro de uma folha | |
| `.ui-escuro` | contexto escuro: notas em luar e foco em estrela | |
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
8. Vermelho cheio só em UMA coisa por tela.
9. Alvo de pelo menos 44 px (pílula 52, redondo 48).

## Casos especiais
- `html.reduzido` e `prefers-reduced-motion`: as peças `ui-*` viram dissolvência (240 ms, linear).
- `?webgl=0`: nenhuma peça depende do canvas.
