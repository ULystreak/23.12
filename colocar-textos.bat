@echo off
rem COLOCAR OS TEXTOS: le a pasta textos (fora do git), poe os paragrafos nos
rem capitulos do js/content.js e, se ele quiser, publica no site.
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  COLOCAR OS TEXTOS DOS CAPITULOS NO SITE
echo  =======================================
echo.
echo  Escreva na pasta "textos", ao lado deste arquivo:
echo    poppy.txt      =  capitulo do jogo
echo    your name.txt  =  capitulo do filme
echo  Um paragrafo por linha, ou paragrafos separados por uma linha em branco.
echo  Se quiser, a primeira linha pode ser "Titulo: ..." ou "Subtitulo: ...".
echo  Linhas que comecam com # sao anotacao sua e ficam de fora.
echo.

node "_dev\colocar-textos.mjs"
if errorlevel 1 goto fim

rem Compara com o que esta no site agora (busca antes, para nao comparar com uma copia velha).
git fetch --quiet origin main >nul 2>nul
git diff --quiet origin/main -- js/content.js 2>nul
if not errorlevel 1 goto fim

echo.
echo  O js/content.js tem mudancas que ainda nao estao no site.
set "RAMO="
for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "RAMO=%%B"
set "RESP="
set /p "RESP=Publicar no site agora? (s/n) "
if /i not "%RESP%"=="s" goto fim
rem "git push origin HEAD:main" mandaria qualquer ramo para o site: so publica do main.
if /i not "%RAMO%"=="main" goto foradomain

git add js/content.js
if errorlevel 1 goto naopublicou
git diff --cached --quiet
if errorlevel 1 git commit -m "Textos dos capítulos"
if errorlevel 1 goto naopublicou
git push origin HEAD:main
if errorlevel 1 goto naopublicou
echo.
echo  Publicado. O site atualiza em um ou dois minutos.
goto fim

:foradomain
echo.
echo  Esta pasta nao esta no ramo main do git, entao nada foi publicado.
echo  Os textos ja estao no js/content.js deste computador.
goto fim

:naopublicou
echo.
echo  Nao consegui publicar agora. Veja o aviso acima e de dois cliques de novo mais tarde.

:fim
echo.
pause
