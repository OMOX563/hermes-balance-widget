
from PIL import Image
import os, glob
D = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")  # 插件根/assets（相对 tools/ 上溯两级）
OUT = os.path.join(D, "compact")
os.makedirs(OUT, exist_ok=True)
total = 0
for f in sorted(glob.glob(os.path.join(D, "*.jpg"))):
    name = os.path.basename(f)
    im = Image.open(f).convert("RGB")
    im.thumbnail((384, 384))
    out = os.path.join(OUT, name)
    im.save(out, "JPEG", quality=82, optimize=True, progressive=True)
    sz = os.path.getsize(out)
    total += sz
    print(f"{name}: {sz//1024} KB")
print(f"TOTAL {total//1024} KB -> base64 ~{total*4//3//1024} KB")
