# Frente: o pergaminho

**Seus arquivos:** `js/pergaminho.js`, `css/pergaminho.css`.

O pergaminho é a ponte entre o mundo 3D e os capítulos. É ele que faz "a carta virar o pergaminho" sem corte.

## A folha

- Papel `--papel` (`#fbf7f0`) com fibra sutil: gere uma textura pequena em canvas uma vez e use como fundo ladrilhado (nada de `feTurbulence` rodando em área grande).
- Celular: cobre a tela inteira (com áreas seguras). Desktop: coluna central de até ~720 px, altura total, com o mundo branco e as pétalas visíveis dos lados; sombra de papel com deslocamento e desfoque macio.
- `retanguloAlvo()` devolve esse retângulo. `receberPapel()` mostra a folha exatamente ali, no mesmo quadro em que o papel 3D pousa: troca invisível (mesma cor, sem transição de opacidade longa).

## Desenrolar (a peça principal)

O capítulo desce sobre a folha em branco como um pergaminho sendo desenrolado de cima para baixo.

- Um **rolo** (cilindro de papel, ~56–72 px de altura) nasce na borda de cima e desce até sair por baixo (~1,6 s, `power3.inOut`). Acima do rolo, o interior do capítulo já revelado; abaixo, a folha em branco.
- O rolo tem volume: sombreamento cilíndrico (luz, miolo de sombra, luz refletida), pontas mais escuras, a fibra do papel **rolando** por dentro em proporção ao deslocamento (dá a sensação de giro real), sombra projetada sobre a folha abaixo e uma faixa de curvatura escurecendo os últimos ~40 px do capítulo acima.
- Revelação por `clip-path: inset()` acompanhando o rolo; só `transform`, `clip-path` e `opacity` animam.
- `som.efeito('desenrolar')`.
- **Enrolar** é o inverso, de baixo para cima sobre o que estiver visível (ela está no fim do capítulo; não role a página de volta ao topo antes), terminando na folha em branco.
- **Soltar:** a folha em branco se desprende e sobe para fora com uma rotação leve, devolvendo o mundo (religue o mundo antes). Leve e lenta, física do mundo branco.

## Janela do capítulo

- O capítulo vive numa janela recortada no papel: margem de papel fina (~10 px no celular, ~16 px no desktop; a da direita um pouco maior), cantos de 2 px, sombra interna curta de corte de papel. `api.fundo` é a camada fixa atrás do conteúdo, dentro da janela.
- **O fio de progresso é uma costura:** na margem direita do papel, pontos vermelhos (`--fio`) vão sendo costurados de cima para baixo conforme ela lê (pontos tracejados que aparecem com a rolagem, com uma agulha/ponta que marca onde está). No fim do capítulo a costura chega embaixo. É discreto: ela não deve ler isso como barra de progresso.
- Rolagem: contêiner próprio (`overflow-y: auto`, `overscroll-behavior: contain`), nativa no toque, Lenis na roda do mouse. `ScrollTrigger` com `scroller` apontando para ele (atualize no evento do Lenis). `rolagem.progresso`, `aoRolar(fn)` (uma vez por quadro), `irPara(y)`.
- Se ela não rolar em ~3 s, uma dica desenhada (uma seta/ponto em SVG pulsando devagar perto da base) aparece e some no primeiro movimento. Ela nunca fica sem saber o que fazer.
- Acessibilidade: ao terminar de desenrolar, o foco vai para o título do capítulo; a rolagem funciona por teclado; `aria-hidden` no mundo enquanto o capítulo está aberto.
- Ao abrir no celular, `mundo.desligar()`; ao soltar, `mundo.ligar()`.

## Reduzido e leve

`amb.reduzido`: sem rolo viajando; uma dissolvência curta com um deslocamento mínimo. Sem WebGL nada muda aqui.

## Skills

`impeccable` (contexto + `reference/craft-floor.md`), `emil-design-eng`, `animate`, `gsap-scrolltrigger`, `gsap-timeline`, `animation-performance`, `playwright`.

## Verificação

- Sequência de 12 a 16 quadros do desenrolar e do enrolar, em 390×844 e 1440×900, Chromium e WebKit. O rolo parece um cilindro de papel?
- `medirQuadros` durante o desenrolar. Relate.
- Rolagem: no toque (WebKit, emulação de iPhone) e com roda (desktop); a costura acompanha; `ScrollTrigger` dispara com o `scroller` certo (teste com um gatilho de exemplo e remova).
- Toques repetidos durante a animação não quebram. Zero erro no console.

## Pronto quando

Do papel 3D ao capítulo aberto não existe um quadro em que se perceba troca de tecnologia.
