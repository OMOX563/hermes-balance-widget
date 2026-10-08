# -*- coding: utf-8 -*-
"""rembg 重抠：语义分割 + alpha matting（发丝级边缘，黑白造型也分得开）。
输出 384px 透明 webp，覆盖 assets/transparent/*.webp。"""
import os
import sys
from PIL import Image
from rembg import remove, new_session

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
OUT = os.path.join(SRC, 'transparent')
os.makedirs(OUT, exist_ok=True)

IDS = ['deepseek', 'minimax', 'glm', 'kimi', 'mimo', 'chatgpt', 'claude', 'gemini', 'grok']


def run(pid, session, size=384):
    im = Image.open(os.path.join(SRC, pid + '.jpg')).convert('RGB')
    cut = remove(
        im,
        session=session,
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_size=10,
    )
    cut = cut.convert('RGBA')
    cut.thumbnail((size, size))
    path = os.path.join(OUT, pid + '.webp')
    cut.save(path, 'WEBP', quality=78, method=6)
    return os.path.getsize(path)


if __name__ == '__main__':
    ids = sys.argv[1:] or IDS
    session = new_session('u2net')
    total = 0
    for pid in ids:
        sz = run(pid, session)
        total += sz
        print(f'{pid}.webp {sz // 1024} KB')
    print(f'TOTAL {total // 1024} KB -> base64 ~{total * 4 // 3 // 1024} KB')
