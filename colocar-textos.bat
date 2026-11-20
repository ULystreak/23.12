@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   COLOCAR OS TEXTOS DOS CAPITULOS NO SITE
echo   ---------------------------------------
echo   Escreva na pasta "textos", um paragrafo por linha
echo   (ou separe os paragrafos com uma linha em branco):
echo     poppy.txt = capitulo do jogo      your name.txt = capitulo do filme
echo.
node "_dev\colocar-textos.mjs"
if errorlevel 1 goto fim
git diff --quiet origin/main -- js/content.js 2>nul
if not errorlevel 1 goto fim
echo.
echo   O js/content.js tem mudancas que ainda nao estao no site.
set PUB=
set /p PUB=  Publicar no site agora? (s/n): 
if /i not "%PUB%"=="s" goto fim
git add js/content.js
git diff --cached --quiet
if errorlevel 1 git commit -m "Textos dos capítulos"
git push origin HEAD:main
if errorlevel 1 (
  echo.
  echo   Nao consegui publicar agora. Veja o aviso acima e de dois cliques de novo mais tarde.
  goto fim
)
echo.
echo   Publicado. O site atualiza em um ou dois minutos.
:fim
echo.
pause
