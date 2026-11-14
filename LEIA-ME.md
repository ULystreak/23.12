# Página de aniversário (23/12)

Tudo o que você edita está em **`js/content.js`**: frases, músicas, textos dos capítulos e a frase final.
O que está entre `[colchetes]` é texto de exemplo.

## Ver no seu computador

Abra um terminal nesta pasta e rode:

```bash
python -m http.server 8123
```

Depois abra `http://localhost:8123` no navegador.
Se você mudar algo e a página não mudar, aperte **Ctrl+F5** (o navegador guarda a versão antiga).

Para ir direto a uma parte, sem passar por tudo:

| Endereço | Onde começa |
|---|---|
| `http://localhost:8123/?cena=poppy` | capítulo do jogo |
| `http://localhost:8123/?cena=carta2` | segunda carta |
| `http://localhost:8123/?cena=yourname` | capítulo do filme |
| `http://localhost:8123/?cena=mao` | a mão com o fio vermelho |
| `http://localhost:8123/?cena=final` | última carta |

## Imagens

Salve cada imagem em `assets/images/` **com exatamente este nome**. Ela aparece sozinha.
Enquanto o arquivo não existir, o fundo fica desenhado e a foto mostra um aviso com o nome que falta.
Esse aviso só aparece no seu computador: no site publicado, o espaço da foto que falta simplesmente some.

| Arquivo | Onde aparece | Situação |
|---|---|---|
| `yourname-capa.png` | capa que abre o capítulo do filme | já colocada |
| `yourname-encontro.webp` | o encontro, de ponta a ponta, no meio do capítulo do filme | já colocada |
| `yourname-visao-dele.webp`, `yourname-visao-dela.webp` | as duas imagens ligadas pelo fio, no fim do capítulo do filme | já colocadas |
| `poppy-fundo.jpg` | fundo do capítulo do jogo (fica escurecido atrás dos textos) | falta |
| `poppy-1.jpg`, `poppy-2.jpg` | fotos entre os textos do capítulo do jogo | faltam |

- Quer mais ou menos fotos? Copie ou apague uma linha `{ tipo: "imagem", ... }` em `js/content.js`.
- Os outros formatos de bloco (capa, imagem de ponta a ponta, par ligado pelo fio) estão explicados no topo de `js/content.js`.
- Se a sua imagem for `.png` ou `.webp`, troque o final do nome em `js/content.js`.
- Tamanho bom: até uns 1600 px de largura e menos de 500 KB cada, para abrir rápido no celular.
- As imagens do jogo e do filme pertencem aos estúdios, por isso não vêm incluídas: use as que você escolher (capturas suas do jogo, imagens de divulgação, fotos de vocês).

## Músicas

1. Coloque os arquivos em `assets/music/` (mp3 é o mais seguro).
2. Em `js/content.js`, na lista `musica.lista`, escreva o título, o artista e o caminho de cada uma.
3. Apague `exemplo-1.wav` e `exemplo-2.wav` quando não precisar mais.

Se o nome do arquivo estiver errado, a própria lista mostra "Arquivo não encontrado".

No iPhone o site não consegue controlar o volume: a música toca no volume do aparelho.
Se quiser que fique baixinha lá também, diminua o volume do próprio arquivo antes de colocar.

## Publicar (GitHub Pages)

1. Crie uma conta em github.com e um repositório novo, **público**.
2. Envie para ele tudo o que está nesta pasta (`index.html`, `css`, `js`, `assets`).
3. No repositório: **Settings → Pages → Branch: main, pasta / (root) → Save**.
4. Em um ou dois minutos o link aparece nessa mesma tela. É esse link que você manda no dia.

A página pede aos buscadores para não ser indexada, mas quem tiver o link consegue abrir.
Teste o link no seu celular antes do dia 23.
