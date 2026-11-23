@echo off
rem COLOCAR A LETRA: le letra-1.txt e letra-2.txt desta pasta (fora do git),
rem poe cada uma no js/content.js e, se ele quiser, publica no site.
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  COLOCAR A LETRA NO SITE
echo  =======================
echo.
echo  Um .txt por musica, nesta mesma pasta, com um verso por linha:
echo    letra-1.txt  =  undressed
echo    letra-2.txt  =  we never dated
echo  Versos com tempo, [00:12.50] verso, entram como estao
echo  (os tempos se marcam no _dev\marcar-letra.html).
echo.

set "ACHOU="
set "FALHOU="
for %%N in (1 2) do (
  if exist "letra-%%N.txt" (
    set "ACHOU=1"
    echo  letra-%%N.txt:
    node "_dev\colocar-letra.mjs" %%N "letra-%%N.txt"
    if errorlevel 1 set "FALHOU=1"
    echo.
  )
)
if not defined ACHOU (
  echo  Nao achei letra-1.txt nem letra-2.txt nesta pasta.
  goto fim
)
if defined FALHOU (
  echo  Algo deu errado acima, entao nada foi publicado. Arrume e de dois cliques de novo.
  goto fim
)

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
if errorlevel 1 git commit -m "Letra das musicas"
if errorlevel 1 goto naopublicou
git push origin HEAD:main
if errorlevel 1 goto naopublicou
echo.
echo  Publicado. O site atualiza em um ou dois minutos.
goto fim

:foradomain
echo.
echo  Esta pasta nao esta no ramo main do git, entao nada foi publicado.
echo  A letra ja esta no js/content.js deste computador.
goto fim

:naopublicou
echo.
echo  Nao consegui publicar agora. Veja o aviso acima e de dois cliques de novo mais tarde.

:fim
echo.
pause
