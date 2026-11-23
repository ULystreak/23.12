"""Junta as fotos de _dev/ver-bolso.mjs numa tira, com o instante de cada uma.

Uso (da raiz do repositório): python _dev/tira.py <vp> [tema] [ms...]
Sem ms, usa todas as fotos output/ver/bolso-<vp>-<tema>-<n>.png, em ordem
numérica; com ms, na ordem dada. A coluna sai pela largura da foto: 6 por
linha no celular (menos de 800 px, escala 0,5), 4 no computador (escala 0,3).
Precisa do Pillow 10.1 ou mais novo (ImageFont.load_default(size=16)).
"""
import math
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

if len(sys.argv) < 2:
    sys.exit('uso: python _dev/tira.py <vp> [tema] [ms...]')
vp = sys.argv[1]
tema = sys.argv[2] if len(sys.argv) > 2 else 'poppy'
pasta = os.path.join('output', 'ver')
base = f'bolso-{vp}-{tema}'

instantes = [int(m) for m in sys.argv[3:]]
if not instantes:
    padrao = re.compile(rf'^{re.escape(base)}-(\d+)\.png$')
    achados = [padrao.match(n) for n in (os.listdir(pasta) if os.path.isdir(pasta) else [])]
    instantes = sorted(int(m.group(1)) for m in achados if m)
if not instantes:
    sys.exit(f'nenhuma foto {base}-<ms>.png em {pasta} (rode antes: node _dev/ver-bolso.mjs {vp} {tema})')

ims = [Image.open(os.path.join(pasta, f'{base}-{ms}.png')).convert('RGB') for ms in instantes]
escala = 0.5 if ims[0].width < 800 else 0.3
colunas = 6 if ims[0].width < 800 else 4
W, H = round(ims[0].width * escala), round(ims[0].height * escala)
linhas = math.ceil(len(ims) / colunas)

tira = Image.new('RGB', (W * colunas, H * linhas), 'white')
desenho = ImageDraw.Draw(tira)
fonte = ImageFont.load_default(size=16)
for i, (ms, im) in enumerate(zip(instantes, ims)):
    x, y = (i % colunas) * W, (i // colunas) * H
    tira.paste(im.resize((W, H)), (x, y))
    desenho.rectangle([x, y, x + 64, y + 22], fill='white')
    desenho.text((x + 4, y + 2), f'{ms} ms', fill='black', font=fonte)

saida = os.path.join(pasta, f'{base}-tira.png')
tira.save(saida)
print(saida)
