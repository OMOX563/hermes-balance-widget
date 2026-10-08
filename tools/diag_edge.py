# -*- coding: utf-8 -*-
"""抠图验收：边界暗像素占比（残晕指标）+ 半透明羽化占比。新旧对比用。"""
import os
import sys
from PIL import Image


def stats(path):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    px = im.load()
    edge, dark, semi_total, opaque = [], 0, 0, 0
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            a = px[x, y][3]
            if a == 0:
                continue
            if 0 < a < 255:
                semi_total += 1
            if a >= 255:
                opaque += 1
            n = (px[x + 1, y][3], px[x - 1, y][3], px[x, y + 1][3], px[x, y - 1][3])
            if min(n) == 0:
                edge.append(px[x, y])
    for (r, g, b, a) in edge:
        if 0.2126 * r + 0.7152 * g + 0.0722 * b < 45:
            dark += 1
    e = max(1, len(edge))
    return 100.0 * dark / e, 100.0 * semi_total / max(1, opaque + semi_total)


if __name__ == '__main__':
    d = sys.argv[1] if len(sys.argv) > 1 else \
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "transparent")
    print(f"{'id':10s} {'edge-dark%':>10s} {'semi%':>7s}  verdict")
    ids = ['deepseek', 'minimax', 'glm', 'kimi', 'mimo', 'chatgpt', 'claude', 'gemini', 'grok']
    for pid in ids:
        p = os.path.join(d, pid + '.webp')
        if not os.path.exists(p):
            print(f'{pid:10s} MISSING')
            continue
        dk, sm = stats(p)
        print(f'{pid:10s} {dk:10.1f} {sm:7.1f}  {"HALO" if dk > 12 else "ok"}')
