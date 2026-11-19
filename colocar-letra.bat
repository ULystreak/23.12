@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   COLOCAR A LETRA NO SITE
echo   -----------------------
echo   1. Vou abrir a pagina de marcar a letra. Escolha a musica, cole a letra,
echo      aperte "Comecar do zero" e a barra de espaco a cada verso.
echo   2. No fim, aperte "Copiar".
echo.
rem Se o arquivo ja tem a letra sem tempo, ela vai para o Ctrl+V: e so colar na pagina.
if exist "_dev\letra-marcada.txt" findstr /r /c:"^\[[0-9]*:[0-9]" "_dev\letra-marcada.txt" >nul || (
  powershell -NoProfile -Command "Get-Content -Raw -Encoding UTF8 '_dev\letra-marcada.txt' | Set-Clipboard" && echo   A letra que voce ja salvou esta copiada: na pagina, clique no campo Letra e aperte Ctrl+V.
  echo.
)
start "" "https://ulystreak.github.io/23.12/_dev/marcar-letra.html"
pause
echo.
echo   Agora vai abrir o Bloco de Notas: cole (Ctrl+V), salve (Ctrl+S) e feche.
echo.
if not exist "_dev\letra-marcada.txt" type nul > "_dev\letra-marcada.txt"
notepad "_dev\letra-marcada.txt"
echo.
echo   Em qual musica? (1 = undressed, 2 = we never dated)
set /p NUM=  Numero: 
node "_dev\colocar-letra.mjs" %NUM% "_dev\letra-marcada.txt"
if errorlevel 1 goto fim
echo.
set /p PUB=  Publicar no site agora? (s/n): 
if /i not "%PUB%"=="s" goto fim
git add js/content.js
git commit -m "Letra da musica %NUM%"
git push origin HEAD:main
echo.
echo   Publicado. O site atualiza em um ou dois minutos.
:fim
echo.
pause
