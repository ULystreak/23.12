# Frente: som e música

**Seus arquivos:** `js/som.js`, `js/musica.js`, `css/musica.css`, seção `musica` de `js/content.js`.

## Seletor na folha (etapa 4)

A folha em branco vira o encarte de uma fita gravada para ela.

- Título (`conteudo.musica.titulo`) em Shippori Mincho, palavra por palavra.
- As faixas são uma **lista escrita à mão**, não cartões: cada linha tem a capa (quadrada, pequena, colada com uma fita de papel desenhada em CSS, levemente torta, cada uma com um ângulo e um deslocamento próprios e determinísticos), o título em Klee One grande e o artista menor. Entre as linhas, um traço de tinta irregular (SVG), não uma borda.
- Entrada das linhas escalonada (30–60 ms), sem bloquear o toque.
- **Tocar numa faixa:** a capa descola um pouco e inclina; um laço vermelho desenhado à mão (caminho SVG com `stroke-dashoffset`, cor `--fio`) dá a volta na linha, como o fio circulando a escolhida; a música entra em fade até `volumeInicial` (~0,3) e fica em loop. Trocar de faixa: o laço se desfaz e se refaz na nova.
- Depois da primeira escolha aparece o continuar (`conteudo.musica.continuar`): texto manuscrito sublinhado pelo fio, com uma seta desenhada em SVG. Alvo ≥ 44 px. Ela pode trocar antes de continuar.
- **Uma faixa só** (o caso de hoje): não pode parecer lista vazia. A capa cresce e vira o destaque, como a capa de um compacto, com título e artista embaixo. De 2 a 6 faixas: lista. Mais que isso: a lista rola dentro da folha.
- Capa que falta: a linha fica só com o texto, sem buraco. Faixa cujo arquivo não carrega: some da lista, em silêncio. Nenhuma faixa válida: `escolher()` resolve na hora.

## Mini seletor fixo

- Canto superior direito, respeitando área segura. Fechado: um disco de 44 px com a capa, girando devagar enquanto toca (para com inércia ao pausar), com um anel fino vermelho que marca o progresso da faixa.
- Toque: abre a partir do disco (`transform-origin` no disco, ~200 ms, `scale(0.96)` + opacidade) num painel pequeno: tocar/pausar (ícones SVG desenhados), a lista compacta para trocar, e o volume como **uma conta num fio** (trilho fino vermelho, polegar redondo). Fecha no toque fora e no Esc. Foco visível, tudo operável por teclado, `aria-label` vindos do `content.js`.
- Muda de pele conforme a cena, lendo `document.documentElement.dataset.cena`: papel e tinta no mundo branco; escuro com detalhe de brinquedo no Poppy; vidro índigo no Your Name. Contraste ≥ 4,5:1 nas três.
- Nunca cobre texto de capítulo nem o botão de fechar.

## Motor de áudio

- `AudioContext` criado/retomado no primeiro gesto (`destravar()`); `<audio loop>` → `MediaElementSource` → `GainNode` (música) → mestre. No iPhone `audio.volume` não funciona: todo volume é pelo ganho.
- Fades com `setTargetAtTime`/`linearRampToValueAtTime` (sem cliques). `abafar(fator, ms)` baixa a música e devolve.
- Robusto: `?mudo=1`, falha de decodificação, contexto suspenso ao voltar de segundo plano (retomar no próximo gesto), `visibilitychange`.
- **Efeitos sintetizados** (sem arquivos), sempre abaixo da música (≈ −18 dB em relação a ela) e curtos: `lacre` (estalo seco + batida grave), `papel` (ruído filtrado que varre, ~200 ms), `desenrolar` (papel mais longo, com ritmo), `toque` (tique macio), `caneta` (risco de caneta contínuo, com duração e intensidade por parâmetro, para acompanhar a escrita), `fita` (clunk + zumbido de VHS), `mola` (boing de brinquedo, discreto), `brilho` (cintilar agudo com ataque lento). Ouça cada um renderizando com `OfflineAudioContext` e conferindo pico e duração; nada estridente.

## Skills

`impeccable` (contexto + `reference/craft-floor.md`), `emil-design-eng`, `animate`, `gsap-core`, `gsap-plugins` (DrawSVG), `playwright`.

## Verificação

- Capturas do seletor com 1 faixa (real), e com 3 e 8 faixas injetadas por teste (não deixe faixas falsas no `content.js`), em 390×844 e 1440×900. Estado escolhido e não escolhido.
- Mini seletor fechado e aberto nas três peles.
- No teste, prove que o áudio só começa após o toque e que o ganho chega a ~0,3 (leia o valor do `GainNode`). Chromium e WebKit.
- Zero erro no console, inclusive com arquivo de música inexistente.

## Pronto quando

Com uma faixa só a folha parece feita para ela, e com seis também.
