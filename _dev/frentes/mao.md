# Frente: a mão e o fio que vira caminho

**Seus arquivos:** `js/cenas/mao.js`, `js/mundo/fio.js`, `css/mao.css`, seção `mao` de `js/content.js`.

É aqui que ela percebe o fio. Física do mundo branco: lenta, leve, curvas longas.

## Sequência

1. O capítulo 2 fecha (`pergaminho.enrolar()`, `pergaminho.soltar()`), a segunda carta vai embora (`irEmbora()`; veja no esqueleto onde a referência do envelope fica guardada no contexto). Mundo branco, pétalas.
2. **"Olha a sua mão."** (`conteudo.mao.frase`), palavra por palavra, no terço superior. A câmera inclina um pouco para baixo.
3. **A mão sobe** da base da tela, em primeira pessoa.
   - Com `mao.imagem` (quando existir): a imagem sobe com um leve atraso de mola e respira.
   - Sem imagem (o caso de hoje): **a mão é um desenho a nanquim que se desenha sozinho**, traço por traço (SVG + desenho de traço): antebraço entrando por baixo, palma para cima, dedos relaxados, as linhas da palma. Tinta `#2a1b22`, traço fino com variação de espessura, uma aguada de pele muito leve por baixo. Tem que parecer mão desenhada por alguém que sabe desenhar: palma quase quadrada, dedo médio do comprimento da palma, polegar a ~40°, juntas marcadas por vincos curtos. Itere olhando as capturas até não parecer luva.
   - No pulso, o **akai ito**: cordão trançado vermelho com um nó e uma ponta solta. É a única cor. Balança de leve.
4. Botão **"Seguir o fio"** (`mao.botao`), na base, dentro da área segura, texto com sublinhado de fio. Aparece depois que a mão assentou.
5. **O fio se estende:** da âncora do pulso (`mao.ancoraFio`, 0..1 dentro da caixa da mão) nasce o fio 3D (`criarFio`): o começo fica preso à câmera na posição de tela do pulso (`mundo.telaParaMundo`), cai em curva até o chão e segue serpenteando para frente por ~14 m. `progresso` vai de 0 a 1 em ~2,6 s: o fio "corre" para longe, rápido no início e assentando devagar.
6. **A mão desce** e sai do quadro (o começo do fio desce junto), a câmera volta a olhar para frente e um pouco para o chão, e **ela caminha seguindo o fio**: a câmera acompanha o X da curva com antecipação, com o balanço de passo. Pétalas caem; algumas ficam sobre o fio.
7. **Chegada:** o fio sobe do chão até a última carta, que flutua, e termina exatamente em `env.ancoraFio` (variante `amarracao: 'fio'`). Crie esse envelope aqui e deixe-o, junto com o fio, no contexto para a cena final usar (veja no esqueleto o campo combinado; a cena final cria os seus se entrar fria).

## O fio (`js/mundo/fio.js`)

- Fita voltada para a câmera ao longo de uma curva, com largura no mundo (~4 mm) e **largura mínima em pixels** (~1,5 px) para não serrilhar ao longe.
- Trançado no shader (listras torcidas que acompanham o comprimento), sombreamento de seção redonda, cor `--fio`.
- Sombra suave no chão (segunda fita achatada, escura, bem transparente, borda macia).
- `progresso(p)` revela pelo comprimento, com a ponta afinando. Trechos no ar balançam de leve com o vento; no chão, parado.
- `definirCurva(c)` para atualizar o começo a cada quadro sem recriar tudo.

## Leve e reduzido

- Sem WebGL: o fio é um caminho SVG que atravessa a tela e a "caminhada" é um avanço das camadas de pétalas enquanto o fio corre.
- `amb.reduzido`: a mão aparece por opacidade (o desenho se completa em pouco tempo), sem inclinação de câmera, caminhada sem balanço.

## Skills

`impeccable` (contexto + `reference/craft-floor.md`), `emil-design-eng`, `animate`, `threejs-shaders`, `gsap-plugins` (DrawSVG), `gsap-timeline`, `playwright`.

## Verificação

- Capturas em 390×844 e 1440×900 (Chromium e WebKit): frase, mão desenhada completa (olhe com rigor: é uma mão?), fio se estendendo, meio da caminhada, chegada.
- Sequências de quadros: desenho da mão, extensão do fio, a curva da caminhada.
- `medirQuadros` na caminhada. Relate.
- `?cena=mao` com `?webgl=0` e `?reduzido=1`. Zero erro no console.

## Pronto quando

No momento em que o fio sai do pulso e corre pelo chão, dá para sentir que tudo antes levava até ali.
