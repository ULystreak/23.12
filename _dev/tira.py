# Junta as fotos do bolso numa tira só: python _dev/tira.py <vp> <ms...>
import sys
from PIL import Image
vp, ms = sys.argv[1], sys.argv[2:]
ims = [Image.open(f'output/ver/bolso-{vp}-{m}.png') for m in ms]
w, h = ims[0].size; s = 0.5 if w < 800 else 0.3
W, H = int(w * s), int(h * s)
out = Image.new('RGB', (W * len(ims), H), 'white')
for i, im in enumerate(ims): out.paste(im.convert('RGB').resize((W, H)), (i * W, 0))
out.save(f'output/ver/bolso-{vp}-tira.png')
