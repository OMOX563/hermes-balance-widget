
from PIL import Image
from rembg import remove, new_session
import os
SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
OUT = os.path.join(SRC, "transparent")
im = Image.open(os.path.join(SRC, "gemini.jpg")).convert("RGB")
for model in ("isnet-general-use", "u2net_human_seg", "birefnet-general"):
    try:
        session = new_session(model)
        cut = remove(im, session=session, alpha_matting=True,
                     alpha_matting_foreground_threshold=240,
                     alpha_matting_background_threshold=10,
                     alpha_matting_erode_size=10).convert("RGBA")
        w, h = cut.size
        px = cut.load()
        total = opaque = 0
        for y in range(h//2, h):
            for x in range(0, w, 2):
                total += 1
                if px[x, y][3] > 100:
                    opaque += 1
        lo = opaque/total*100
        print(f"{model}: lower kept {lo:.1f}%", flush=True)
        if lo > 70:
            cut.thumbnail((384, 384))
            cut.save(os.path.join(OUT, "gemini.webp"), "WEBP", quality=78, method=6)
            print(f"SAVED with {model}", flush=True)
            break
    except Exception as e:
        print(f"{model}: FAIL {e}", flush=True)
