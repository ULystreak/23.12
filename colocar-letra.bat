@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   COLOCAR A LETRA NO SITE
echo   -----------------------
echo   Ponha a letra num .txt nesta pasta, um verso por linha:
echo     letra-1.txt = undressed      letra-2.txt = we never dated
echo.
set ACHOU=
for %%N in (1 2) do if exist "letra-%%N.txt" (
  set ACHOU=1
  echo   letra-%%N.txt:
  node "_dev\colocar-letra.mjs" %%N "letra-%%N.txt"
)
if not defined ACHOU (
  echo   Nao achei letra-1.txt nem letra-2.txt nesta pasta.
  goto fim
)
echo.
set /p PUB=  Publicar no site agora? (s/n): 
if /i not "%PUB%"=="s" goto fim
git add js/content.js
git commit -m "Letra das musicas"
git push origin HEAD:main
echo.
echo   Publicado. O site atualiza em um ou dois minutos.
:fim
echo.
pause
