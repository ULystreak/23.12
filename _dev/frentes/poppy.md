# Frente: capítulo 1, Poppy Playtime

**Seus arquivos:** `js/capitulos/poppy.js`, `js/capitulos/poppy/*` (crie o que precisar), `css/poppy.css`, seção `poppy` de `js/content.js`.

Foi jogando Poppy Playtime que eles se conheceram. O capítulo é uma fita VHS achada numa fábrica de brinquedos abandonada. **Nada de personagens, mascotes ou logotipos do jogo:** só objetos genéricos de brinquedo.

Física deste mundo: molas, quiques, peso, cortes de vídeo. Nada desliza suave.

## Fundo

- `api.fundo` recebe um canvas WebGL com um **shader de VHS** aplicado sobre a imagem `conteudo.poppy.fundo` quando ela existir, ou sobre uma fábrica **desenhada por você** quando não existir (o caso de hoje): galpão em perspectiva, piso xadrez sumindo no escuro, esteiras, canos, luminárias que mal acendem, painéis com tinta de brinquedo descascada (vermelho, amarelo, azul, verde, dessaturados), tudo em petróleo `#0d2534`. Desenhe em SVG ou canvas 2D com capricho de ilustração (camadas, luz, textura) e use como textura do shader. Escuro o bastante para texto branco, com o centro mais calmo.
- Shader: tremor horizontal por linha, vazamento de croma, linhas de varredura, ruído, faixa de tracking que sobe de vez em quando, ruído de troca de cabeça nos 6% de baixo, vinheta. Reage à velocidade da rolagem (rolar rápido = avanço de fita: mais riscos horizontais). Renderize em resolução baixa de propósito (VHS aguenta) e pause quando o capítulo não estiver visível.
- Sem WebGL: fundo estático + linhas de varredura e faixa de tracking em CSS.

## Estrutura, na ordem da rolagem

1. **Início de fita.** Tela azul de vídeo por um instante, OSD em VT323 (rótulos como "PLAY" vêm do `content.js`). O título (`poppy.titulo`) cai como **blocos de brinquedo**, uma letra por bloco colorido, cada um com peso, quique e um ângulo final levemente torto. Subtítulo em VT323 digitado.
2. **Contador de fita** fixo num canto (VT323): avança com a rolagem e termina no valor de `poppy.contadorFinal` (sugestão no conteúdo: `0:23:12`).
3. **Textos** (`tipo: 'texto'`) em **cartões de vidro fosco escuro** (pedido do briefing): fundo `rgba(8, 22, 32, ≥0.72)` com desfoque moderado em área pequena, texto Fredoka 500 claro, contraste ≥ 4,5:1 medido. Não são cartões iguais em grade: larguras, alinhamentos e inclinações variam (−1,2° a 1,2°), cada um com um detalhe de brinquedo diferente (um canto com fita adesiva colorida, um parafuso, uma etiqueta). Entram caindo com mola (`back.out`/`elastic.out`), não com fade-e-sobe.
4. **Cenas animadas** (`tipo: 'cena'`), desenhadas em SVG/DOM, ligadas à rolagem:
   - `maos`: duas mãos de brinquedo em cabos de mola, uma azul vindo da esquerda e uma vermelha da direita, esticam conforme ela rola e se encontram no centro com faíscas e um balanço de mola. **O cabo da mão vermelha é o fio vermelho** (mesma cor `--fio`, mesmo trançado). Desenho original: luvas arredondadas de plástico.
   - `fita`: uma fita VHS com rótulo manuscrito (`rotulo` do conteúdo), carretéis girando com a rolagem; ela entra numa abertura com um clunk (`som.efeito('fita')`) e a tela inteira dá uma falha de tracking.
   - `esteira`: uma esteira com blocos, bolas e peças de encaixe; blocos caem de uma calha, quicam e seguem. Física 2D simples sua (gravidade, quique, velocidade da esteira). Os blocos podem trazer letras de `letras` do conteúdo.
5. **Imagens** (`tipo: 'imagem'`): quando o arquivo existir, entram como um monitor/foto colada com linhas de varredura e um corte de vídeo em `steps()`. Arquivo vazio ou que não carrega: o bloco inteiro some, sem buraco.
6. **Fim.** O botão `poppy.fechar` ("Fechar este capítulo") é um botão físico de videocassete/brinquedo: afunda de verdade ao apertar. Ao apertar: OSD de parada, a imagem **desliga como TV de tubo** (colapsa numa linha horizontal, depois num ponto) e então `api.fechar()`.

## Regras

- Textos visíveis só do `content.js` (inclusive os rótulos de OSD).
- Sons discretos: `fita`, `mola`.
- `amb.reduzido`: sem quiques nem tremor; entradas por opacidade; shader parado com ruído mínimo.
- Desempenho no celular: um canvas só, DPR ≤ 1,5, cenas fora da tela pausadas (`IntersectionObserver`), nada de `backdrop-filter` em área grande.
- Limpe tudo em `destruir()` (ScrollTriggers, rAF, contexto WebGL, listeners).

## Skills

`impeccable` (contexto + `reference/craft-floor.md`), `emil-design-eng`, `animate`, `gsap-scrolltrigger`, `gsap-timeline`, `threejs-shaders` (para o GLSL), `animation-performance`, `playwright`.

## Verificação

- Capturas de cada bloco em 390×844 e 1440×900 (Chromium e WebKit), rolando o capítulo inteiro. Sequências de quadros: queda do título, encontro das mãos, entrada da fita, desligar da TV.
- Meça o contraste dos cartões a partir dos pixels de uma captura.
- `medirQuadros` rolando. Relate.
- `?cena=poppy` com `?webgl=0`, `?reduzido=1`, `?nivel=baixo`. Zero erro no console.

## Pronto quando

Quem jogou o jogo reconhece o clima em dois segundos, e quem não jogou acha que é uma fita de verdade.
