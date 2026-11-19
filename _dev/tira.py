# Junta as fotos do bolso (node _dev/ver-bolso.mjs) numa tira, com o instante de cada uma:
#   python _dev/tira.py <vp> [tema] [ms...]      (sem ms: todas as fotos desse vp e tema, em ordem)
# Sai em output/ver/bolso-<vp>-<tema>-tira.png (6 por linha no celular, 4 no computador).
import re, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
vp = sys.argv[1]
tema = sys.argv[2] if len(sys.argv) > 2 else 'poppy'
pasta, nome = Path('output/ver'), f'bolso-{vp}-{tema}'
ms = sys.argv[3:] or sorted((m[1] for f in pasta.glob(f'{nome}-*.png') if (m := re.fullmatch(rf'{re.escape(nome)}-(\d+)\.png', f.name))), key=int)
ims = [Image.open(pasta / f'{nome}-{m}.png').convert('RGB') for m in ms]
w, h = ims[0].size
s, colunas = (0.5, 6) if w < 800 else (0.3, 4)
W, H = int(w * s), int(h * s)
linhas = -(-len(ims) // colunas)
out = Image.new('RGB', (W * min(colunas, len(ims)), H * linhas), 'white')
fonte = ImageFont.load_default(size=16)
for i, (im, m) in enumerate(zip(ims, ms)):
    x, y = (i % colunas) * W, (i // colunas) * H
    out.paste(im.resize((W, H), Image.LANCZOS), (x, y))
    d = ImageDraw.Draw(out)
    d.rectangle((x, y, x + 64, y + 22), fill='white')
    d.text((x + 5, y + 2), f'{m} ms', fill='black', font=fonte)
out.save(pasta / f'{nome}-tira.png')
print(pasta / f'{nome}-tira.png')
