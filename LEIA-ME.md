# A carta: como editar (versão 2)

Este manual é para você, que fez a carta. Ele não aparece no site.

Tudo o que ela lê, ouve e vê sai de um arquivo só: **`js/content.js`**. Você não precisa tocar em mais nada. O arquivo tem comentários em português explicando cada parte.

## 0. As regras de ouro do content.js
- Troque só o que está entre aspas simples: `'assim'`.
- Texto entre `[colchetes]` é exemplo: apague os colchetes e escreva o seu.
- Apóstrofo dentro do texto vira `\'` (exemplo: `'copo d\'água'`). Quebra de linha vira `\n`.
- Cada linha de lista termina com vírgula. Não apague vírgulas, chaves `{ }` nem colchetes `[ ]` que ficam fora das aspas.
- Campo vazio (`''`) ou lista vazia (`[]`) = aquela coisa não aparece. A carta se arruma sozinha, sem buraco e sem aviso.
- Se depois de salvar a página ficar toda branca e parada, quase sempre é uma vírgula ou uma aspa faltando.

## 1. Os textos dos capítulos (o jogo e o filme)
Dá para editar direto em `poppy.blocos` e `yourname.blocos` no content.js. Ou, mais fácil:

1. Crie a pasta `textos` na pasta do site (ela fica só no seu computador; não vai para o site).
2. Escreva `textos/poppy.txt` e `textos/your name.txt` (também vale `yourname.txt` ou `your-name.txt`), com uma linha em branco entre os parágrafos.
3. Se quiser, a primeira linha pode ser `Título: ...` ou `Subtítulo: ...` (trocam o título e o subtítulo do capítulo).
4. Dê dois cliques em **colocar-textos.bat**. Os parágrafos vão para os blocos de texto do capítulo, na ordem, sem mexer nas imagens nem nas cenas. No fim ele pergunta se publica.

Escreva o capítulo inteiro antes de rodar: os parágrafos entram pela ordem dos blocos de texto que já existem.

## 2. A senha
- `senha.codigo`: a senha que abre a carta (pode ter números, letras, o que você quiser). Hoje: 8035, os dias de vida dela ao fazer 22 anos.
- `senha.liberaEm`: a partir de que dia a senha funciona. Antes disso, aparece o aviso `senha.cedo` e uma contagem até o dia (`senha.contagem`, `senha.contagemFrase`).
- `senha.mestra`: abre em qualquer dia, para você testar.
- `senha.erro`, `senha.dicas` (a 1ª dica depois do 1º erro, a 2ª depois do 2º...), `senha.palpites` (chutes que você espera dela: no lugar do aviso de erro aparece a sua resposta, sem tremer e sem contar como erro; maiúsculas, acentos e espaços não fazem diferença).
- O campo não mostra quantos caracteres a senha tem. É um ritual, não segurança: quem abrir o content.js lê a senha.

## 3. As músicas
- Cada música é um bloco em `musica.faixas`: `titulo`, `artista`, `arquivo` (o .mp3 em `assets/music/`, nome sem espaço e sem acento) e `capa` (quadrada, .webp ou .jpg, até uns 600 × 600 px; `''` = disco vermelho no lugar).
- Ela passa as capas com o dedo (no computador, com as setas ou o teclado), toca na capa do meio e aperta "Continuar". A música começa no volume de `musica.volumeInicial` (0,3 = 30%; 0 = mudo) e fica em repetição; quando acaba, entra a próxima da lista.
- Um mini seletor fica no canto o tempo todo, para pausar, trocar de música e mudar o volume.

### A letra no alto da tela (karaokê)
- O campo `letra` de cada faixa: um verso por linha, com o tempo `[mm:ss.cc]` no começo e, se quiser, o tempo `<mm:ss.cc>` antes de cada palavra (a palavra cantada fica vermelha e sublinhada). Sem tempo por palavra, o verso é repartido sozinho.
- Para marcar os tempos: abra `_dev/marcar-letra.html` no computador (dois cliques), cole a letra, toque "Agora!" a cada verso enquanto a música toca e copie o resultado.
- Ou ponha a letra em `letra-1.txt` (primeira música) ou `letra-2.txt` (segunda), na pasta do site, e rode **colocar-letra.bat**. Esses arquivos ficam só no seu computador.
- `musica.legenda: false` desliga a letra.

## 4. As imagens
Formato: .webp, até uns 350 KB, no máximo 1600 px no lado maior (nos capítulos, pelo menos 1300 px de largura, porque o iPhone mostra em 3×). Salve em `assets/images/` e escreva o caminho no campo.

| Imagem | Formato | Campo | Situação |
|---|---|---|---|
| alameda.webp | quadrada 2000 × 2000 | `pagina.fundo` | já está (só é vista sem WebGL) |
| poppy-logo.webp | 480 × 270, fundo transparente | `poppy.logo` | já está |
| poppy-fundo.webp | 9:16 | `poppy.fundo` | falta (o site desenha a fábrica) |
| poppy-1.webp, poppy-2.webp | 16:9 | blocos `imagem` do jogo | faltam (o bloco some) |
| yourname-capa.webp | larga | `yourname.capa` | já está |
| yourname-fundo.webp | 9:16 | `yourname.fundo` | falta (o site desenha o céu) |
| yourname-ceu.mp4 | em pé, mudo, até 2,5 MB | `yourname.video` | falta |
| yourname-encontro.webp | larga | bloco `imagem-cheia` | já está |
| yourname-escadaria.webp | 16:9 | bloco `imagem` | falta |
| yourname-cordao.webp | faixa larga, fundo transparente | bloco `imagem` ou `cordao` (`arquivo`) | falta (o site desenha o cordão) |
| yourname-visao-dele.webp, yourname-visao-dela.webp | em pé | bloco `par` | já estão |
| mao-akai-ito.webp | vertical, fundo transparente | `mao.imagem` | falta (o site desenha a mão) |
| encontro-*.webp | largas | `encontro.quadros` | já estão |
| og-capa.jpg | 1200 × 630 | prévia do link (index.html) | já está |
| icone-180.png | 180 × 180 | ícone da Tela de Início | já está |

Atenção: a capa, o encontro e o par de agora são quadros do filme. A regra da carta é não copiar quadros, personagens nem logotipos do filme. Troque por fotos de vocês ou por céus parecidos (a capa pode ficar `''`). Os textos para gerar as imagens que faltam estão em `_dev/prompts-imagens.md`.

### O encontro (`encontro.quadros`)
As imagens passam sozinhas, uma de cada vez, como cenas de um filme. Cada uma tem `imagem`, `alt` e, se quiser, `foco` e `ate` (para onde a câmera olha e desliza), `fio` (só na primeira), `dedo` (só nas duas das mãos), `aparar` e `fim`. Lista vazia = essa parte não existe e a carta vai direto do fio para a última carta. `encontro.dicaFio` é a dica se ela demorar para levar o fio até ele.

## 5. O bolso, a bolsa e a corrida
- "Guardar no bolso" no fim de cada capítulo: o olhar dela desce, a bolsinha aparece, a carta entra nela e a bolsa vai para o canto de baixo, à direita. Tocar num item da bolsa abre de novo.
- `inventario.titulo`, `inventario.cartaPoppy`, `inventario.cartaYourname`: os nomes na bolsa.
- `mao.frase` ("Olha a sua mão."), `mao.escrito` (o que aparece escrito na palma), `mao.botao` ("Seguir o fio"), `mao.ele` (você no fim do fio, de costas, esperando).
- `corrida.segundos`: quanto tempo ela corre até você (de 5 a 10; hoje 7).

## 6. As cartas do chão (vídeos dos amigos)
- `cartasChao.itens`: uma carta por amigo, na ordem. `nome` aparece escrito à mão na carta só DEPOIS que ela abre; `video` é o .mp4 em `assets/videos/` (`''` = cartão de exemplo "[vídeo de Nome vem aqui]").
- Formato do vídeo: MP4 (H.264 e AAC), em pé ou deitado, até uns 25 MB (ela vai abrir no 4G). Um minuto em 720p fica com uns 10 a 15 MB.
- Para comprimir: um app de compressão no celular (MP4, 720p), o HandBrake ("Fast 720p30") ou o ffmpeg:

```
ffmpeg -i original.mov -vf "scale=w=1280:h=1280:force_original_aspect_ratio=decrease:force_divisible_by=2" -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart assets/videos/sariel.mp4
```

- Vídeo que não carrega: a carta mostra só o nome e conta como vista. Nada trava.
- A última carta, "Nossos momentos" (no arquivo continua se chamando `surpresinha`; não troque esse nome), já cai com o nome escrito, fica amarrada com um laço do fio e só abre depois das outras. Fotos e vídeos em `surpresinha.midias` passam antes dos seus áudios.

## 7. O fim: contador, resposta e a sua voz
- `final.frase`: a frase escrita à mão, letra por letra, na última folha. `final.dicaChacoalhar`: no celular, a carta abre quando ela chacoalha o aparelho (o iPhone pede licença); no computador, ou se ela não deixar, o toque abre.
- `contador.nascimento`: o número conta de 0 até os dias de vida dela hoje (8035 em 23/12/2026; 8036 no dia seguinte). `contador.conhecemos` pinta de vermelho os dias desde que vocês se conheceram. `contador.dias`: até 3 datas que acendem uma de cada vez (uns 2 segundos cada), com "no seu dia N:" e o seu texto.
- `resposta`: a folha em que ela escreve de volta. O texto fica guardado só no aparelho dela. "Enviar para ele" abre o WhatsApp com o texto pronto (o número de `resposta.whatsapp`; o site é público, quem abrir o arquivo lê o número: deixe `''` se não quiser). Nada é enviado sozinho.
- `voz`: os seus áudios. Ponha .mp3 ou .m4a em `assets/audio/` e escreva o caminho em `arquivo` (áudio do WhatsApp, .ogg/.opus, não toca no iPhone: converta). Enquanto `arquivo` estiver vazio, aparece "[áudio 1 vem aqui]". A fita "A minha voz" fica na bolsa; cada áudio tem tocar, pausar, o fio para ir e voltar e o botão de baixar (no iPhone vai para o app Arquivos, pasta Downloads).
- `abertura.vozArquivo`: a sua voz dizendo a primeira frase (2 a 4 segundos), tocando uma vez, baixinho, por cima da música.

## 8. O menu do fim
- Depois da última carta, "Continuar" leva ao menu: o fio desce com uma etiqueta por parte (`menu.partes`; texto vazio tira a etiqueta), o botão "Sempre que sentir saudade" na ponta (`menu.saudade`; abre o WhatsApp dela na conversa com você), e no chão a sua voz, as referências e a folha de escrever de volta.
- Na primeira vez as referências (`menu.referencias`, entre `menu.abertura` e `menu.fecho`) passam amarradas no fio, como os créditos de um filme; um toque pula. Depois ficam no caderninho do chão, junto com o cartão das músicas (`menu.musicas`) e o dos amigos (`menu.amigos`).
- Bilhetes "Abra quando..." (`menu.bilhetes`): com a lista vazia o montinho nem aparece. Com data em `abre` ('AAAA-MM-DD'), o bilhete fica fechado até o dia ("Abre em 23/12/2027"). A data só segura a surpresa dentro do site: quem abrir o arquivo lê o texto antes.
- "A carta do jogo" e "A carta do filme" reabrem por cima do menu, sem parar a música. As outras etiquetas recarregam a página, e o som volta com um toque dela ("Toque para começar").
- O aparelho dela lembra que ela chegou ao menu: dali em diante, o link limpo faz senha, música e menu.

## 9. Para testar uma parte só
Abra o site com um destes finais no endereço (os atalhos de `inicio` em diante pulam a senha):

| Atalho | O que mostra |
|---|---|
| `?cena=senha` | a tela preta com a senha (é como o site abre sem atalho) |
| `?cena=musica` | a escolha da música |
| `?cena=inicio` | as frases, a caminhada e a primeira carta |
| `?cena=poppy` | o capítulo do jogo |
| `?cena=carta2` | a segunda carta |
| `?cena=yourname` | o capítulo do filme |
| `?cena=mao` | "Olha a sua mão.", o fio e a corrida |
| `?cena=cartas` | as cartas no chão |
| `?cena=encontro` | as imagens do encontro |
| `?cena=final` | a última carta |
| `?cena=final&voz=abrir` | a última carta com o cartão da voz já aberto |
| `?cena=final&hoje=2026-12-23` | finge que hoje é 23/12 (contador) |
| `?cena=menu` | o menu do fim |
| `?cena=menu&menu=0` | esquece neste aparelho que ela já chegou ao menu |

Combine com `&rapido=4` (tudo 4 vezes mais rápido), `&webgl=0` (a versão leve) ou `&reduzido=1` (a versão calma).

Conforme ela avança, o endereço ganha sozinho um `?cena=...` a partir da primeira carta, para que uma página recarregada (no iPhone, às vezes ao voltar do WhatsApp) continue da parte em que estava, com a mesma música. O link que você manda para ela é o endereço **sem nada no final**.

## 10. Testar no computador
Abra um terminal na pasta do site e rode:

```
npx serve
```

Depois abra o endereço que ele mostrar (em geral http://localhost:3000). Abrir o index.html com dois cliques não funciona: os módulos do site precisam de um servidor.

## 11. Publicar
O GitHub Pages publica sozinho a cada envio para a branch main. A pasta `_dev/`, a pasta `output/` e os arquivos PRODUCT.md, DESIGN.md, LEIA-ME.md, colocar-letra.bat e colocar-textos.bat ficam de fora do site (`_config.yml`). As letras (`letra-1.txt`, `letra-2.txt`) e a pasta `textos/` nunca vão para o git (`.gitignore`).

A prévia do link mostra o título "Para você" e a imagem do envelope (`og-capa.jpg`). O WhatsApp guarda a prévia por um tempo: trocar a imagem pode demorar a aparecer.
