# Frente: o envelope e a cena da carta

**Seus arquivos:** `js/mundo/envelope.js`, `js/cenas/carta.js`. Se precisar de CSS, use as classes de dica/botão que já existem em `css/base.css` ou estilos aplicados pelo próprio módulo.

A mesma peça aparece três vezes: carta 1 (`lacre: 'coracao'`, `amarracao: 'cordao'`), carta 2 (`lacre: 'estrela'`), última carta (`lacre: null`, `amarracao: 'fio'`).

## O objeto

- Envelope de papel de carta, ~23 × 16 cm, visto pelo lado da aba (o verso), deitado. Modelado de verdade em Three.js: corpo com espessura, as três abas fixas marcadas por vincos, a aba de cima **articulada** (malha segmentada que curva de leve ao abrir, não uma placa rígida).
- Papel: branco morno (`#f7f2ea`), fosco, com fibra sutil (textura procedural gerada em canvas uma vez). Precisa se ler contra o fundo branco puro por **sombreamento**, não por contorno: luz principal suave de cima-esquerda, sombra própria nos vincos, oclusão onde a aba encosta no corpo, escurecimento leve em ângulo rasante. Nada de halo, nada de traço preto.
- **Forro vermelho por dentro** (`#b3123a`, com um padrão miúdo de pétalas quase tom sobre tom): só aparece quando a aba levanta. É a surpresa de cor.
- **Lacre de cera:** disco irregular (~2,6 cm, borda derramada com ruído), vermelho profundo, brilho de cera (especular largo e macio, não plástico). Em relevo: coração ou estrela (geometria rebaixada ou mapa de relevo gerado em canvas). Já nasce pré-fraturado em 3 pedaços encaixados, invisível até trincar.
- **Cordão** (`'cordao'`): cordão torcido de dois fios, vermelho `#d7192d`, dando a volta em cruz no envelope, passando sob o lacre, com um laço pequeno. Textura torcida no shader ou na geometria.
- **Fio** (`'fio'`, última carta): mais fino, duas voltas e um laço simples, sem lacre. `env.ancoraFio` é a ponta solta do laço, onde o fio do caminho chega: precisa bater exatamente.

## Comportamento

- **Chegada:** nasce da névoa ao longe e vem até parar a ~0,6 m, um pouco abaixo da linha dos olhos, ocupando ~72% da largura no celular em pé e ~28% no desktop (calcule a distância pelo FOV para as duas proporções). Chega desacelerando muito (`expo.out`), com uma inclinação que se endireita.
- **Espera:** flutua (~1 cm), gira devagar (±6°), e segue `mundo.ponteiro` com **mola** (até ±12°), com atraso e leve ultrapassagem. A cada ~5 s um brilho percorre o lacre (ou o laço, na última): é o convite ao toque. Se ela não tocar em ~4 s, aparece a dica de `conteudo.abertura.dicaCarta`, discreta, em Klee One, abaixo da carta.
- **Toque:** vale tocar na carta ou perto dela (margem generosa). Teclado: um botão invisível com `aria-label` aceita Enter/Espaço. Toques repetidos não reiniciam nada.
- **Abertura (~3,2 s, uma coreografia só):** a carta afunda 4 mm (resposta ao toque, 120 ms) → o lacre trinca, os pedaços saltam girando e caem com gravidade, com farelo de cera → `mundo.petalas.rajada()` atrás do lacre → o cordão afrouxa, escorrega e cai (na variante `fio`: o laço é puxado, as voltas se desfazem) → a aba levanta mostrando o forro vermelho → o papel sobe de dentro, vira de frente para ela. `som.efeito('lacre')`, depois `som.efeito('papel')`.
- **`entregarPapel(rect)`:** o papel voa em direção à câmera e cresce até cobrir exatamente o `DOMRect` (use `mundo.retanguloParaPose`), enquanto o envelope cai para trás e se dissolve no branco. No fim do voo o material do papel vira cor chapada idêntica à variável CSS `--papel` (sem luz, sem tonemapping), para a troca pela folha DOM ser invisível. Curva longa e leve (`power3.inOut` → `expo.out`).
- **`irEmbora()`:** o envelope se afasta e some na névoa.
- Tudo respeita `amb.rapido` e `amb.reduzido` (reduzido: sem voo longo; dissolvência curta).

## Variante leve (sem WebGL)

Mesma API, em SVG + CSS: envelope desenhado com o mesmo cuidado (vincos, lacre, cordão), aba que abre em `rotateX`, lacre que se parte em dois, papel que cresce até o retângulo. Simples, mas elegante.

## Skills

`impeccable` (contexto + `reference/craft-floor.md`), `emil-design-eng`, `animate`, `threejs-materials`, `threejs-lighting`, `threejs-shaders`, `gsap-timeline`, `playwright`.

## Verificação

- Capturas das três variantes em espera, em 390×844 e 1440×900. Olhe de verdade: parece um envelope de papel fotografado com luz macia, ou um retângulo cinza?
- Sequência de 16 a 24 quadros (um a cada ~150 ms) da abertura completa até o papel cobrir o retângulo. Confira o último quadro contra uma `div` da cor `--papel`: a diferença de cor tem que ser imperceptível.
- `medirQuadros` durante a abertura. Relate.
- `?cena=inicio`, `?cena=carta2`, `?cena=final`, e `?webgl=0`. Zero erro no console.

## Pronto quando

A captura da carta em espera poderia ser a prévia do link (envelope branco lacrado, cordão vermelho, pétalas, sobre branco), e a abertura dá vontade de ver de novo.
