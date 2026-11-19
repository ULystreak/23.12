# UI — Papelaria da alameda

A linguagem das peças em DOM (senha, música, bolsa, voz, cartas do chão, contador, resposta, botões e dicas).
Ideia: tudo o que ela toca parece **papelaria feita à mão por ele**: papel creme com pesponto, letra à mão, o fio vermelho
como costura e lacinho, pétala de cerejeira como enfeite. Fofo sem ser infantil: um enfeite por peça, nada de emoji, nada piscando.
As fichas e as classes estão em `css/base.css` (bloco "Papelaria da alameda"). **Só o diretor edita `base.css`**; as cenas usam.
Amostra de tudo: `output/ui/amostra.html` (foto em `output/ui/amostra.png`); capturas: `node output/ui/capturar.mjs depois iphone`.

## Fichas (`:root`)
- **Cor.** Papel `--papel` (fundo de folha), `--papel-linha`, tinta `--tinta` / `--tinta-suave`. Fio `--fio` (ação principal, costura, selo).
  Cerejeira: `--sakura` (enfeite), `--sakura-clara` (fundo de realce), `--sakura-tinta` (texto rosa, 7:1 no papel).
  Noite: `--noite-veu` (véu atrás de folha aberta), `--luar` / `--luar-suave` (texto), `--estrela` (detalhe e foco no escuro).
  Pesponto: `--ponto` (no papel), `--ponto-noite`. Vermelho cheio só em UMA coisa por tela.
- **Raio.** `--raio-p` 10 (miniatura, campo), `--raio-m` 16 (item, cartão), `--raio-g` 26 (folha, painel), `--raio-pilula`.
- **Sombra.** `--sombra-papel` (folha), `--sombra-flutua` (botão), `--sombra-baixa` (miniatura). Sempre com deslocamento; nunca halo, nunca animada.
- **Tipo.** Interface em Klee One 600 (`--fonte-mao`): botões, títulos de folha (`.ui-titulo`), notas (`.ui-nota`), dica. Shippori fica nas frases
  do mundo e no `.botao` de texto. Números de selo em Fredoka. Campo de escrever ≥ 16 px (`.ui-campo`).
- **Movimento.** `--mola` (passa 5% e assenta; `linear()` no Safari 17.2+, cubic-bezier de reserva), `--mola-firme` (folhas grandes),
  `--curva-sair`. `--dur-toque` 120 ms (afundar), `--dur-mola` 460 ms (soltar/entrar), `--dur-folha` 420 ms, `--dur-sair` 180 ms, `--passo` 45 ms.
  Só `transform` e `opacity`. Entrar é mola; sair é rápido e sem mola. Nada de `ease-in`.

## Peças (classes)
- **`.botao`** (texto do mundo): Shippori 600 com o fio costurado embaixo (onda miúda); afunda a 0,96 e volta na mola.
- **`.ui-pilula`**: o botão de papel. 52 px de altura, pílula, creme, Klee 600, pesponto a 4 px por dentro, `--sombra-flutua`.
  `data-tom="fio"` (vermelho, texto branco: a ação principal) e `"noite"` (vidro azul, texto luar: tela preta e fim).
  Ícone opcional antes do texto. `disabled`/`aria-disabled` a 45%.
- **`.ui-redondo`**: 48 px, só ícone (fechar, tocar/pausar, setas, baixar). Mesmos tons. Sempre com `aria-label`.
- **`.ui-folha`**: cartão de papel, `--raio-g`, pesponto a 8 px, `--sombra-papel`. `data-borda="base"` = folha que sobe de baixo (área segura já
  incluída); `data-tom="noite"` = o mesmo cartão em vidro azul. Dentro: `.ui-puxador`, `.ui-titulo`, `.ui-nota`, `.ui-fio` (divisor costurado).
- **`.ui-icone`**: SVG 24×24, traço `1.75`, pontas e juntas redondas, sem preenchimento, `currentColor`. Um ponto cheio opcional no fio
  (`.cheio`) ou na tinta (`.cheio-tinta`, ex.: o triângulo de tocar). Desenhe todos nessa grade; nada de glifo unicode (o "×" também é SVG).
- **Enfeites** (`aria-hidden`): `.ui-laco` (lacinho do fio; `data-onde="topo"` prende no alto da folha), `.ui-petala`, `.ui-coracao`, `.ui-selo` (contagem).
  Coração só onde fala de afeto: a fita da voz, o envio da resposta, a Surpresinha.
- **Utilitários**: `.ui-toque` (qualquer coisa apertável), `.ui-rola`, `.ui-escuro` (foco em `--estrela`),
  `.ui-entra` (+ `style="--i:n"` para fila); `@keyframes ui-pulo` (algo foi guardado: o selo da bolsa).
- **`#dica`**: bilhete em Klee com uma pétala boiando embaixo.

## Regras para os construtores
1. Não edite `css/base.css`, `js/content.js`, os `[data-acao]`, as etapas, nem as cenas 3D. Acrescente as classes `ui-*` aos elementos que já
   existem (sem trocar os ganchos) e apague do CSS da cena o que a classe já faz.
2. Alvo ≥ 44 px (pílula 52, redondo 48); 16 px de respiro das bordas + `--seguro-*`; nada colado na barra de gestos.
3. `html.reduzido` e `prefers-reduced-motion`: as `ui-*` já viram dissolvência; animação nova da cena precisa da mesma versão calma.
   `?webgl=0`: nenhuma peça pode depender do canvas.
4. Sem `backdrop-filter` em área grande, sem animar sombra/altura/cor de fundo. Hover só em `(hover: hover) and (pointer: fine)`.
5. Folha grande entra com `--mola-firme` de `translateY(100%)` (de baixo) ou `scale(.94)`+opacidade (centro); véu só com opacidade.
6. Desktop: folhas com `max-width` ~440–520 px, centradas; a folha de baixo vira cartão flutuante com os quatro cantos.
