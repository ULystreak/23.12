# Direção e contrato técnico

Documento só de desenvolvimento (a pasta `_dev/` não é publicada). Leia junto com `PRODUCT.md`.
Quem constrói uma cena lê isto inteiro antes de escrever código.

## 1. Contrato de direção

**TESE.** Uma carta que é um lugar. Ela não lê uma página: ela anda até as cartas, e o que amarra tudo é um fio vermelho que só no fim ela percebe que estava ali o tempo todo. Recusa: página de rolagem com seções, hero com botão, cartões iguais.

**MUNDO PRÓPRIO.** Branco absoluto como chão e céu. A única cor do mundo branco é o vermelho (pétalas `#b3123a`, fio `#d7192d`): vermelho é "nós". Tinta `#2a1b22` para texto. Papel levemente morno (`#fbf7f0`) para se destacar do branco. Tipos: Shippori Mincho nas frases do mundo e títulos; Klee One no que é manuscrito; Fredoka e VT323 só dentro do capítulo do jogo. Cada capítulo é um mundo dentro do papel: Poppy é uma fita VHS de uma fábrica de brinquedos (petróleo `#0d2534` + vermelho, amarelo, azul, verde de brinquedo); Your Name é um céu que passa do dia à noite (`#090e33`, `#4a398c`, `#b25d9b`, `#ffd1a1`).

**HISTÓRIA.** Ela entende: isto foi feito para mim → tem algo esperando → é uma carta dele → é sobre como a gente se conheceu → é sobre o nosso filme → o fio do filme está no meu pulso → o fio me leva até uma folha em branco que a gente ainda vai escrever.

**PRIMEIRA TELA.** Branco total. Um segundo de silêncio. Pétalas vermelhas começam a cair com profundidade real (três ou quatro enormes e desfocadas cruzando perto da câmera, dezenas pequenas e nítidas ao longe). No terço superior, em Shippori Mincho, tinta escura, a frase aparece palavra por palavra: "Feliz aniversário." Nada mais na tela: sem logo, sem botão, sem barra.

**FORMA.** Experiência em primeira pessoa com uma câmera só (WebGL), texto em DOM por cima. Semente: nenhuma (direção fixada pelo briefing).

**FIM.** Não revisado e não documentado é não terminado: este trabalho acaba com a revisão final, o veredito, o DESIGN.md e o LEIA-ME.md.

## 2. As nove etapas

| # | Etapa | `?cena=` | O que acontece | O que entrega para a próxima |
|---|---|---|---|---|
| 1 | Mundo branco | `inicio` | Branco, pétalas, duas frases palavra por palavra que somem | as pétalas e a câmera |
| 2 | Caminhada | | A câmera anda com balanço de passo; pétalas passam; uma carta nasce da névoa branca e para na frente dela | a carta |
| 3 | Primeira carta | | Envelope 3D, cordão vermelho, lacre de cera com coração. Flutua, segue o ponteiro/arrasto. No toque: lacre trinca, pétalas saltam, cordão solta, aba levanta, papel sai e cresce até ser a folha | o papel vira a folha DOM |
| 4 | Música | | Na folha: as nossas músicas, cada uma com a capa. Tocar começa a ~30% em loop. Mini seletor fica fixo no canto | a folha |
| 5 | Capítulo 1 | `poppy` | A folha desenrola de cima para baixo como pergaminho; dentro, a fábrica em VHS. Fim: "Fechar este capítulo" | o pergaminho |
| 6 | Segunda carta | `carta2` | O pergaminho enrola, volta ao mundo branco, caminha até a carta com estrela no lacre | o papel |
| 7 | Capítulo 2 | `yourname` | Capa, céu do dia à noite com a rolagem, cometa que se divide, cordão trançado, encontro de ponta a ponta, o par ligado pelo fio | o fio |
| 8 | A mão | `mao` | Capítulo fecha, carta vai embora, "Olha a sua mão.", a mão com o akai ito, botão "Seguir o fio", o fio vira o caminho | o fio é o caminho |
| 9 | Última carta | `final` | Amarrada só com o fio. Folha em branco desdobra. Uma frase escrita à mão, letra por letra. Fica ali com as pétalas. Sem botão, sem "fim" | — |

## 3. Gramática de movimento

- **Mundo branco:** lento, leve, curvas longas. Entradas `expo.out`/`power3.out` de 1,2 a 2,4 s; nada quica. Câmera com inércia. Texto: palavra por palavra, cada palavra sobe ~0,4em com desfoque que some.
- **Poppy:** molas e quiques (`elastic.out`, `bounce.out`, `back.out`), blocos que caem com peso, cortes de vídeo em `steps()`, falhas de tracking curtas (80–160 ms). Nada desliza suave.
- **Your Name:** luz e tempo. `sine.inOut` longos, brilhos que florescem (`expo.out`) e somem devagar, camadas de céu com paralaxe, tudo ligado à rolagem.
- **Interface (botões, mini seletor):** resposta em 120–200 ms, `:active` com `scale(0.97)`, nunca `ease-in`, hover só em `(hover: hover) and (pointer: fine)`.
- **Movimento reduzido:** sem balanço de passo, sem grandes deslocamentos de câmera (viram dissolvências), pétalas poucas e lentas, texto entra só com opacidade. Nunca tela vazia.

## 4. Arquitetura (contrato)

Sem build. Módulos ES. `index.html` carrega `js/content.js` (script clássico, define `window.CONTEUDO`), os UMD da GSAP de `lib/` (`defer`) e `js/main.js` (`type="module"`). Three.js é importado por caminho relativo (`lib/three.module.min.js`) com `import()` dinâmico para não atrasar a primeira tela.

```
index.html
js/content.js            ← ÚNICO arquivo que o autor edita
js/main.js               ← boot, monta o contexto, roda o diretor
js/nucleo/ambiente.js    ← capacidades: webgl, nivel, reduzido, toque, ios, dprMax, rapido
js/nucleo/util.js        ← espera(), clamp, lerp, amortecer, el(), carregarImagem() (falha → null)
js/nucleo/movimento.js   ← curvas nomeadas, revelarPalavras(), ocultarPalavras(), revelarLetras()
js/nucleo/diretor.js     ← ordem das cenas, ?cena=, etapa atual, gancho de teste
js/nucleo/recursos.js    ← pré-carga em segundo plano; recurso que falta vira null, sem erro no console
js/som.js                ← motor de áudio (Web Audio): música + efeitos
js/musica.js             ← seletor de músicas na folha + mini seletor fixo
js/mundo/mundo.js        ← renderer, cena, câmera, rig, laço, qualidade adaptativa, caminhada
js/mundo/petalas.js      ← pétalas (WebGL)
js/mundo/leve.js         ← mundo sem WebGL (pétalas em CSS, mesma API)
js/mundo/envelope.js     ← envelope 3D (três variantes) + variante leve em SVG
js/mundo/fio.js          ← o fio como fita 3D que se desenha
js/mundo/folha.js        ← a última folha em 3D (desdobra + escrita à mão)
js/pergaminho.js         ← a folha DOM: recebe o papel, desenrola, enrola, rolagem, fio de progresso
js/capitulos/poppy.js    ← capítulo 1 (+ js/capitulos/poppy/*)
js/capitulos/yourname.js ← capítulo 2 (+ js/capitulos/yourname/*)
js/cenas/abertura.js     ← frases + caminhada
js/cenas/carta.js        ← carta chega, espera o toque, abre, entrega o papel (usada 3×)
js/cenas/mao.js          ← "Olha a sua mão." + seguir o fio
js/cenas/final.js        ← última carta + folha + frase
css/base.css  css/mundo.css  css/musica.css  css/pergaminho.css  css/poppy.css  css/yourname.css  css/mao.css  css/final.css
lib/                     ← three, gsap (+ScrollTrigger, SplitText, DrawSVGPlugin, CustomEase), lenis
assets/fonts  assets/images  assets/music
_dev/                    ← este documento e as ferramentas de teste (não publicado)
```

### 4.1 Contexto e diretor

`main.js` monta `ctx = { conteudo, amb, mundo, som, musica, pergaminho, diretor, gsap, ScrollTrigger }` e chama `diretor.rodar(ctx, cenaInicial)`.

Cenas, na ordem: `inicio`, `poppy`, `carta2`, `yourname`, `mao`, `final`. Cada uma é `async function(ctx, { frio })` que resolve quando a próxima deve começar. `frio: true` quando se entrou direto por `?cena=`: a cena monta sozinha as pré-condições (mundo branco parado, pergaminho aberto etc.). `final` nunca resolve.

O diretor publica o estado em `document.documentElement.dataset.cena` e `dataset.etapa` (via `diretor.etapa('nome')`). Etapas padrão:

- `inicio`: `frases` → `caminhada` → `carta-chegando` → `carta-espera` → `carta-abrindo` → `papel` → `musica`
- `poppy`: `desenrolando` → `lendo`
- `carta2`: `enrolando` → `caminhada` → `carta-chegando` → `carta-espera` → `carta-abrindo` → `papel`
- `yourname`: `desenrolando` → `lendo`
- `mao`: `enrolando` → `olha` → `mao-espera` → `seguindo`
- `final`: `carta-chegando` → `carta-espera` → `carta-abrindo` → `desdobrando` → `escrevendo` → `fim`

Gancho de teste, sempre presente e invisível: `window.__carta = { ctx, etapa, cena, pronto (Promise) }`.
Parâmetros de teste: `?rapido=N` (acelera GSAP, `espera()` e a caminhada N vezes), `?nivel=alto|medio|baixo`, `?webgl=0`, `?reduzido=1`, `?mudo=1`.

### 4.2 Ambiente (`amb`)

`{ webgl: bool, nivel: 'alto'|'medio'|'baixo', reduzido: bool, toque: bool, ios: bool, dprMax: number, rapido: number }`.
Nível inicial por heurística (`hardwareConcurrency`, `deviceMemory`, tamanho da tela) e depois **adaptativo**: se o tempo médio de quadro passar de ~22 ms por 2 s, o mundo baixa o DPR e depois o nível (`mundo.aoMudarNivel(fn)`), nunca sobe de volta no meio de uma cena.

### 4.3 Mundo (`ctx.mundo`)

Unidades em metros. Câmera a 1,5 m do chão olhando para −Z. FOV vertical ~58° em pé, ~42° deitado. Névoa branca (as coisas nascem do branco). Um único `<canvas id="mundo">` fixo atrás do DOM.

```
mundo.ok                      // false → modo leve (sem WebGL); a API abaixo continua existindo
mundo.THREE, .renderer, .cena, .camera, .rig
mundo.aoQuadro(fn(dt, t)) → cancelar
mundo.ligar() / mundo.desligar()          // desligar quando o pergaminho cobre a tela inteira
mundo.caminhar({ distancia, duracao, curva? }) → Promise   // anda em −Z com balanço de passo
mundo.ponteiro                // { x, y } em −1..1, suavizado (ponteiro no desktop, arrasto no toque; no Android também inclinação; no iOS NÃO pedir permissão de movimento)
mundo.telaParaMundo(xNdc, yNdc, distancia) → Vector3
mundo.mundoParaTela(v3) → { x, y } px
mundo.retanguloParaPose(rect, obj) // pose (posição/escala) para um plano cobrir exatamente um DOMRect na tela
mundo.petalas.rajada(posMundo, n)  // pétalas que saltam de um ponto
mundo.petalas.definirDensidade(k)  // 0..1
mundo.aoMudarNivel(fn)
```

### 4.4 Envelope (`criarEnvelope(mundo, { lacre: 'coracao'|'estrela'|null, amarracao: 'cordao'|'fio' })`)

```
env.grupo                     // Object3D; a cena posiciona
env.atualizar(dt, t)          // flutuar, girar devagar, seguir mundo.ponteiro com mola
env.acertou(xNdc, yNdc) → bool
env.ancoraFio → Vector3       // onde o fio do caminho chega (variante 'fio')
env.abrir() → Promise<{ papel }>          // lacre trinca, pétalas, cordão/fio solta, aba levanta, papel sai
env.entregarPapel(rect) → Promise         // papel voa e cobre exatamente o DOMRect, plano e sem luz
env.irEmbora() → Promise                  // o envelope se afasta e some no branco
env.dispose()
```

`cenaCarta(ctx, { lacre, amarracao, distancia })` em `js/cenas/carta.js` faz: caminhar → carta chega → dica discreta se ela não tocar em ~4 s → toque → `abrir()` → `entregarPapel(pergaminho.retanguloAlvo())` → `pergaminho.receberPapel()`.

### 4.5 Pergaminho (`ctx.pergaminho`)

A folha DOM. No celular cobre a tela; no desktop é uma coluna central (máx. ~720 px) com o mundo branco e as pétalas visíveis dos lados.

```
perg.retanguloAlvo() → DOMRect            // onde o papel 3D deve pousar
perg.receberPapel() → Promise             // a folha DOM aparece exatamente onde o papel 3D está (troca invisível)
perg.folha                                // elemento em branco onde o seletor de música é montado
perg.desenrolar(capitulo) → Promise       // desenrola de cima para baixo e libera a rolagem
perg.enrolar() → Promise                  // enrola de volta até virar a folha em branco
perg.soltar() → Promise                   // a folha vai embora e o mundo volta
perg.rolagem → { el, progresso, aoRolar(fn), irPara(y) }
```

Capítulo: `export const capitulo = { id, montar(raiz, api) → { destruir() } }` com `api = { conteudo, amb, som, rolagem, fundo (elemento fixo atrás do conteúdo), gsap, ScrollTrigger, fechar() }`. O capítulo chama `api.fechar()` no botão final. O fio de progresso na borda do pergaminho é do pergaminho, não do capítulo.

### 4.6 Som e música

`som.destravar()` (no primeiro toque), `som.tocar(indice)`, `som.pausar()`, `som.retomar()`, `som.volume(v)`, `som.estado`, `som.aoMudar(fn)`, `som.efeito(nome)` (sintetizado em Web Audio, sempre abaixo da música: `lacre`, `papel`, `desenrolar`, `toque`, `caneta`, `fita`, `mola`, `brilho`), `som.abafar(fator, ms)`.
Música passa por `MediaElementSource → GainNode` (no iPhone `audio.volume` não funciona). Começa em ~30%, loop.
`musica.escolher(perg.folha) → Promise` (resolve quando ela escolheu e tocou em continuar; sem faixas válidas, resolve na hora). `musica.mostrarMini()` / `esconderMini()`.

### 4.7 Fio e folha final

`criarFio(mundo, { curva, largura }) → { objeto, progresso(0..1), definirCurva(c), atualizar(dt,t), dispose() }`: fita voltada para a câmera, largura mínima em pixels, textura trançada no shader, sombra suave no chão.
`criarFolha(mundo) → { grupo, desdobrar() → Promise, escrever(texto) → Promise, atualizar(dt,t) }`: a última folha fica **dentro do mundo 3D** (pétalas passam na frente e atrás); o texto é desenhado num canvas-textura, letra por letra, com um espelho em DOM invisível para leitores de tela.

## 5. Regras para todos

1. **Posse de arquivos.** Cada frente edita só os arquivos da sua lista. `index.html`, `css/base.css`, `js/main.js` e `js/nucleo/*` são do esqueleto: não edite; se faltar algo, resolva nos seus arquivos e relate. Em `js/content.js` edite só a sua seção.
2. **Assinaturas congeladas.** Pode reescrever tudo por dentro; as funções e nomes da seção 4 não mudam.
3. **Conteúdo só em `content.js`.** Nenhum texto visível escrito direto no código.
4. **Recurso que falta some.** Sem buraco, sem ícone quebrado, sem erro no console. Toda cena fica completa sem as imagens geradas.
5. **O fio.** Toda cena tem o seu lugar para o fio vermelho. Não o anuncie: ele só "é".
6. **Sem emoji, sem cartões iguais, sem gradiente genérico, sem texto com gradiente, sem rótulo pequeno acima de título, sem glifo unicode fazendo papel de ícone.** Ícones são SVG desenhados.
7. **Nada de personagens, quadros ou logotipos do filme ou do jogo.** Referências são objetos genéricos (mãos de brinquedo, fita, esteira, cometa, cordão).
8. **iPhone primeiro.** Safari: áudio só após gesto, `100dvh`, áreas seguras (`env(safe-area-inset-*)`), sem pedido de permissão de movimento, `-webkit-` onde precisar, nada de `backdrop-filter` pesado em área grande.
9. **Desempenho.** Animar `transform`/`opacity`; no WebGL, instanciar; DPR máximo 2 (1,5 no nível médio, 1 no baixo); pausar o que não está visível.
10. **Contraste** de texto ≥ 4,5:1 sobre vidro e imagem. Alvos de toque ≥ 44 px. Foco visível.
11. **Verifique olhando.** Depois de construir: `_dev/` tem a ferramenta de captura. 390×844 e 1440×900, Chromium e WebKit, sem erro no console. Captura parada não prova fluidez: meça quadros ou grave vídeo nas animações principais.
