# Roteiro 2: o contrato das cenas (v2)

Onde este arquivo e o código divergem, vale o código. As assinaturas estão em `_dev/CONTRATOS.md` e `_dev/API.md`; o comportamento de cada peça está no PROMPT-V2.

## 1. A ordem
`ORDEM = ['senha', 'musica', 'inicio', 'poppy', 'carta2', 'yourname', 'mao', 'cartas', 'encontro', 'final', 'menu']` (js/nucleo/diretor.js).

| Cena | Etapas, na ordem |
|---|---|
| senha | senha → senha-certa |
| musica | musica → entrando |
| inicio | frases → caminhada → carta-chegando → carta-espera → carta-abrindo → papel |
| poppy, yourname | desenrolando → lendo → enrolando → guardando |
| carta2 | caminhada → carta-chegando → carta-espera → carta-abrindo → papel |
| mao | olha → mao-espera → correndo |
| cartas | pousando → escolhendo ⇄ assistindo → seguindo |
| encontro | chegando → planos → maos → carta |
| final | carta-chegando → carta-espera → carta-abrindo → desdobrando → escrevendo → contador → resposta → fim |
| menu | referencias (só na primeira chegada) → menu |

Cenas puladas quando o conteúdo não as sustenta: `senha` sem `senha.codigo`; `cartas` sem carta com nome; `encontro` sem quadro com imagem; `menu` sem o bloco `menu`. A etapa `contador` só existe com `contador.nascimento`; `resposta`, sem `resposta.ativa === false`.

## 2. O contexto e o diretor
- `ctx = { conteudo, amb, mundo, som, musica, pergaminho, inventario, bolso, voz, letra, diretor, gsap, recursos, estado, mundoPronto() }`.
- Cada cena é `async (ctx, { frio })`; `frio` = entrou por `?cena=` e monta o que as anteriores deixariam (a bolsa já vem com as cartas guardadas antes).
- O diretor publica `html[data-cena]` e `html[data-etapa]`, guarda `window.__carta.historico` e reescreve o endereço com `?cena=&musica=` nas cenas de RETOMAR (`inicio` em diante).
- A bolsa só abre nas esperas (`BOLSA_LIVRE`): `carta2:caminhada`, `carta2:carta-chegando`, `carta2:carta-espera`, `mao:mao-espera`, `cartas:escolhendo`, `final:fim`, `menu:menu`.
- Uma cena que falha não trava a carta: a seguinte entra fria (`recuperar`).

## 3. Peça por peça
- **(a) Senha** (`#entrada-senha`): campo de uma linha que aceita qualquer texto; confere sozinho; tremor e dica a cada erro; palpites respondidos sem contar erro; contagem e aviso antes de `liberaEm`; a mestra abre sempre. No acerto: `som.destravar()`, o fio costura o traço e o preto continua para a música.
- **(b) Música** (`#entrada-musica`): carrossel de capas (arrasto com inércia e encaixe, setas e teclado; uma faixa ou várias), "Continuar"; o disco voa para o canto e vira o mini. O mundo é religado em `musica:entrando` e a entrada abre como pálpebras.
- **(c) Bolsa** (`aside#inventario`): mostra só o que foi guardado; tocar num item reabre (`inventario.reabrir`); releitura de capítulo sem mudar cena nem etapa (`html.relendo`).
- **(d) Bolso** (`div#bolso`): guardar no bolso em cerca de 3 s (nunca mais de 4 s); no reduzido, uma dissolvência curta.
- **(e) Capítulo**: a carta vira o pergaminho, que desenrola; "Guardar no bolso" (`[data-acao="fechar-capitulo"]`) enrola e manda para o bolso.
- **(f) Carta 3D**: tema poppy (lacre de coração) e yourname (lacre de estrela), amarração de cordão, caminhada de 7 m. A última carta: sem lacre, amarrada com o fio, entregue pela mão dele, abre chacoalhando o celular (ou com o toque).
- **(g) Mão**: ao guardar a segunda carta, o fio aparece no pulso dela; "Seguir o fio" (`seguir-fio`) e a corrida de `corrida.segundos` (5 a 10) até ele.
- **(h) Cartas do chão**: sem nome até abrir; vídeo com som (a música abaixa) ou cartão de exemplo; "Nossos momentos" por último, amarrada até ela ver as outras; "Seguir em frente" depois da primeira, em destaque quando todas foram vistas.
- **(i) Encontro**: os quadros passam sozinhos; ela leva a brasinha do dedinho dela até o dele (12 s sem gesto e o fio se liga sozinho); clarão; a última carta.

## 4. Ganchos de teste (não renomear)
`input[data-acao="senha"]`, `senha-ir`, `faixa` (a central é a primeira do DOM), `continuar`, `mini`, `mini-alternar`, `mini-menu`, `inventario`, `inventario-item[data-id]`, `inventario-fechar`, `fechar-capitulo`, `abrir-carta`, `seguir-fio`, `carta-chao[data-id][data-estado="fechada|aberta|falhou"]`, `fechar-carta`, `seguir-cartas[data-destaque]`, `.carta-chao-visor[data-tipo="video|galeria|vazio"]`, `amarrar-fio`, `.contador[data-dias]`, `resposta-texto`, `resposta-enviar`, `resposta-compartilhar`, `resposta-guardar`, `resposta-abrir`, `#voz[data-aberto]`, `voz-tocar`, `voz-baixar`, `voz-fechar`, `.voz-item[data-estado="pronto|vazio|falhou"]`, `menu-ir`, `menu-pular`, `menu-parte[data-cena]`, `menu-saudade`, `menu-voz`, `menu-referencias`, `menu-escrever`, `menu-bilhetes`, `menu-bilhete`, `menu-fechar`, `portao`, `portao-voltar`.

## 5. Conteúdo
Tudo em `js/content.js` (`window.CONTEUDO`), nas 16 seções: pagina, senha, abertura, musica, poppy, yourname, inventario, voz, mao, corrida, cartasChao, encontro, final, contador, resposta, menu.

## 6. Como testar
`node _dev/ver.mjs --fluxo --vp iphone-safari,desktop --rapido 6` (e `--motor webkit`, `--params "webgl=0"`, `"reduzido=1"`), zero erro de console. `node _dev/robustez.mjs` → "ROBUSTEZ OK".

## 7. A hora do dia
Escala: 0 manhã, 1 dia, 2 entardecer, 3 crepúsculo, 4 noite (`mundo.hora(alvo, { duracao })`, `html[data-hora]`).
- poppy:guardando → 0,5 em 6 s.
- carta2 e yourname → dia em 9 s.
- yourname:enrolando e guardando → 1,5 em 5 s.
- mao → entardecer em 3,4 s; mao:correndo → crepúsculo durante a corrida (`corrida.segundos` × 0,92).
- cartas e encontro:chegando → crepúsculo; encontro:planos → noite em 16 s, atrás dos quadros.
- Reduzido: passagens de no máximo 2,4 s e cometa parado.

## 8. O fim
- `final:carta-chegando`: ele aparece (1,3 s) e a carta sai da mão dele até ela (2,6 s, com leve arco).
- `final:contador`: um véu de noite; o número com a letra da senha conta de 0 até os dias de vida dela hoje (8035 em 23/12/2026); depois `rotulo` e `frase`; sobe e fica pequeno no alto.
- `final:resposta`: a folha com `convite`; o texto fica em `carta2312:resposta`; "Enviar para ele" abre o wa.me; nada é enviado sozinho.
- `final:fim`: noite, a folha com a frase, o contador pequeno no alto, "Escrever de volta", o mini e a bolsa; a pílula `menu-ir` leva ao menu. A fita "A minha voz" fica na bolsa (`carta2312:voz`).

## 9. O menu do fim ("o varal do fio")
- `menu:referencias` (só sem a marca `carta2312:menu`): as referências passam amarradas no fio, como créditos; um toque pula (`menu-pular`).
- `menu:menu`: as etiquetas das partes no fio (`menu-parte`), a saudade na ponta (`menu-saudade`), e no chão a voz (`menu-voz`), as referências (`menu-referencias`), a folha de escrever (`menu-escrever`) e os bilhetes (`menu-bilhetes`, só com a lista preenchida).
- Os capítulos reabrem por cima do menu; as outras partes recarregam com `?cena=&volta=1` e o portão pede um toque ("Toque para começar").
- Com a marca, o link limpo faz senha → música → menu.
