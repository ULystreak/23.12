# Frente: a última carta, a folha e a frase

**Seus arquivos:** `js/cenas/final.js`, `js/mundo/folha.js`, `css/final.css`, seção `final` de `js/content.js`. Se trocar a fonte da frase, o arquivo vai em `assets/fonts/` e o `@font-face` em `css/final.css`.

A última imagem que ela vê. Fica na tela para sempre: sem botão, sem "fim".

## Sequência

1. A última carta (envelope `lacre: null`, `amarracao: 'fio'`) está flutuando, amarrada só com o fio que ela seguiu. Se a cena entrar fria (`?cena=final`), crie o envelope e um trecho de fio no chão chegando até ele; se vier da cena da mão, use os que estão no contexto (veja o campo combinado no esqueleto).
2. Espera o toque, com a mesma dica discreta das outras cartas. Toque → `env.abrir()` (o laço se desfaz, a aba levanta, o papel sai).
3. **A folha.** O papel que sai é trocado, na mesma pose, pela folha de `criarFolha(mundo)`: uma folha dobrada em três, que vem até a posição de leitura (centrada, ocupando ~80% da altura no celular em pé, com margem; no desktop proporcional) enquanto o envelope se afasta (`irEmbora()`).
4. **Desdobra:** o terço de baixo desce, o de cima sobe, com o papel cedendo de leve e assentando sem quicar (`power3.out`, um assentamento mínimo). Os vincos ficam como duas linhas tênues com sombreamento próprio. Papel `--papel`, fibra sutil, luz macia. `som.efeito('papel')`.
5. **A frase** (`conteudo.final.frase`) é escrita à mão, **letra por letra**.
6. **Fica.** A folha flutua (respira ±0,5°, ~4 mm), segue o ponteiro bem de leve; as pétalas continuam caindo **na frente e atrás** dela, com o foco na folha. Depois de alguns segundos, uma pétala pousa num canto, fica, e escorrega; de vez em quando acontece de novo. O fio, solto, repousa sobre um canto da folha. Nada mais aparece.

## A escrita

- A folha vive no mundo 3D; o texto é desenhado num canvas-textura (resolução suficiente para ficar nítido com DPR 3 no celular; atualize a textura só enquanto escreve).
- Quebra de linha automática dentro das margens, para qualquer frase que o autor escrever. Composição: bloco de texto no terço do meio, alinhado à esquerda como carta, com respiro.
- **Letra por letra de verdade:** cada glifo é revelado da esquerda para a direita por um recorte que acompanha uma "ponta de caneta". A ponta segue a tinta: rasterize o glifo fora da tela, ache o centro vertical da tinta em cada coluna e faça a ponta passar por ali enquanto o recorte avança. O ritmo é humano: letras largas demoram mais, pausa curta nos espaços, pausa maior na vírgula e antes do ponto final, pequenas variações.
- **Tinta molhada:** os últimos glifos escritos ficam mais escuros e um pouco mais cheios, e secam até a cor final.
- `som.efeito('caneta', …)` acompanhando o ritmo, abaixo da música.
- Leitores de tela: um elemento DOM invisível com a frase inteira (`aria-live="polite"`), anunciado uma vez.
- **Fonte:** o briefing fixa Klee One para o manuscrito. Para esta frase, avalie se uma cursiva de verdade (OFL, do Google Fonts, com todos os acentos do português: á à â ã é ê í ó ô õ ú ç) fica mais "escrita por alguém" do que a Klee One. Renderize três ou quatro candidatas com a frase real, olhe, escolha e justifique em uma linha no relatório. Nada infantil, nada caligrafia de convite de casamento. Se nenhuma ganhar com folga, fica Klee One.

## Leve e reduzido

- Sem WebGL: folha em DOM com desdobra em CSS 3D e a mesma escrita (canvas 2D dentro da folha), pétalas em CSS por cima e por baixo.
- `amb.reduzido`: desdobra curta; a frase ainda é escrita letra por letra (é o conteúdo), só mais rápida e sem ponta visível.
- `amb.rapido` acelera tudo, inclusive a escrita.

## Skills

`impeccable` (contexto + `reference/craft-floor.md`), `emil-design-eng`, `animate`, `threejs-textures`, `threejs-materials`, `gsap-timeline`, `playwright`.

## Verificação

- Capturas em 390×844 e 1440×900 (Chromium e WebKit): carta em espera, folha dobrada, desdobrada, frase na metade, frase completa, e uma captura um minuto depois (a pétala no canto).
- Sequência de 20 a 30 quadros da escrita: parece mão escrevendo, ou máquina revelando texto?
- Zoom na frase completa: nítida no celular (DPR 3)?
- Teste com uma frase longa de exemplo (3 linhas) e uma curta, por parâmetro de teste, sem deixar no `content.js`.
- `?cena=final` com `?webgl=0` e `?reduzido=1`. Zero erro no console. Deixe rodar 2 minutos e confira que continua fluido.

## Pronto quando

A última captura poderia ser impressa e emoldurada.
