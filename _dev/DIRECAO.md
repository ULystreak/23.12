# Direção da carta (v2)

Documento de direção e números do mundo. Só de desenvolvimento: `_dev/` não é publicado. O contrato das etapas está em `_dev/ROTEIRO2.md`; o sistema visual, em `DESIGN.md`; o produto, em `PRODUCT.md`. Onde este texto e o código divergem, vale o código.

## 1. A tese
Uma carta que é um lugar. Ela não navega por um site: caminha por uma alameda de cerejeiras, abre cartas, guarda cada uma na bolsa e segue um fio até ele. Vermelho é "nós": no mundo branco é a única cor, e o fio é a única coisa que atravessa todas as cenas. Recusa: página de rolagem com seções, hero com botão, cartões iguais.

**A primeira tela.** Pelo link limpo, a tela preta da senha (uma linha, um cadeado, a contagem até o dia). Depois do acerto e da música, o preto se abre como pálpebras sobre a alameda, um segundo de silêncio, as pétalas e "Feliz aniversário." palavra por palavra no terço de cima. Nada mais na tela.

## 2. Gramática de movimento
- Mundo branco: entradas de 1,2 a 2,4 s (`curvas.branco.entrar`, expo.out); câmera com inércia; nada quica.
- Capítulo do jogo: molas (elastic.out), quiques (bounce.out), passa e assenta (back.out), cortes em steps.
- Capítulo do filme: sine.inOut longo; luz e tempo passando.
- Interface: 120 a 200 ms, nunca ease-in; `:active` em scale(0.97); hover só com ponteiro fino.
- Captura parada não prova fluidez: meça quadros ou grave vídeo (`_dev/ver.mjs --quadros`, `--video`).

## 3. O mundo
- Câmera a 1,5 m do chão; campo de visão vertical de cerca de 58° em pé e 42° deitado.
- Passo de base de 0,42 m/s (0,09 no movimento reduzido); caminhada de 7 m até cada carta, cerca de 10 s contando a entrada.
- Névoa branca de 2,5 a 9,5 m. Sem luzes na cena: cada material calcula a própria luz a partir da hora do dia.
- Hora do dia em cinco paradas (manhã, dia, entardecer, crepúsculo, noite), conduzida pelo diretor (ver ROTEIRO2, seção 7).
- DPR máximo 2 (1,5 no nível médio, 1 no baixo); a escrita da frase final sobe a DPR 3 e não cai no meio.
- Sem WebGL: `#mundo-leve` com a foto da alameda (`assets/images/alameda.webp`), pétalas em DOM, o fio em SVG, a figura dele pintada e parada.

## 4. Rede de segurança
- Qualidade adaptativa: janelas de 2 s; régua `max(22 ms, 1,4 × ritmo do aparelho)`, com o ritmo calibrado nos primeiros 36 quadros. Degraus: DPR −0,5 até 1, depois o nível, depois 0,75; nunca sobe. Uma tela que passa a 30 Hz no meio da carta (modo de economia do iPhone) não é lenta: a régua sobe para ela.
- Perda do contexto WebGL: se não voltar em 4 s (com a aba visível, o mundo ligado e a folha fechada), recarrega no modo leve, na mesma cena e com a mesma música.
- O mundo que não monta: recarga no modo leve, uma vez.
- Uma cena que falha não trava a carta: a seguinte entra fria.
- Recurso que falta some sem buraco e sem aviso; imagem que trava não prende o capítulo (prazo de 7 s).
- Toques repetidos, giro do aparelho, aba escondida e volta de outro app: cobertos por `_dev/robustez.mjs`.

## 5. Regras para todos
1. Todo texto sai de `js/content.js`. Nenhuma fala fica no código.
2. Cada cena tem a sua versão de movimento reduzido e a sua versão sem WebGL, no próprio arquivo.
3. Som só depois do primeiro gesto dela; efeitos sintetizados, sempre abaixo da música.
4. Alvos de 44 px; contraste de 4,5:1; teclado e leitor de tela em todas as telas.
5. O fio não se anuncia; um vermelho por tela.
6. A última carta pede o movimento do aparelho (chacoalhar) dentro do toque, e só com `final.dicaChacoalhar` preenchido; sem permissão, o toque abre.

## 6. O encontro
Planos de 3,8, 3,1, 3,2 e 3,2 s com 1 s de dissolvência e um plano final de 3,3 s (cerca de 24 s no total). A regra de não usar quadros ou personagens do filme foi aberta para o encontro por pedido do autor, que forneceu as imagens; continua valendo para tudo o que o site desenha.
