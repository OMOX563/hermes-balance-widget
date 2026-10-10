# -*- coding: utf-8 -*-
"""
hermes-balance-widget 构装脚本
============================================================================
src/providers.js + src/balance.js + src/widget.js（模块源原样拼接，
ESM 多 export 合法）+ src/shell.js（剥离相对 import）→ plugin.js 单文件。
九家形象（assets/compact/*.jpg）以 base64 data URI 注入 MASCOTS 表。

每处手术 assert 精确命中；node --check 语法门，不过不写产物。
用法：python build.py
"""
import base64
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
OUT = os.path.join(HERE, 'plugin.js')


def fail(msg):
    print('BUILD FAILED: ' + msg, file=sys.stderr)
    sys.exit(1)


def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f:
        return f.read()


def sub(text, old, new, count, label):
    n = text.count(old)
    if n != count:
        fail('%s: expected %d, found %d  needle=%r' % (label, count, n, old[:100]))
    return text.replace(old, new)


# ── 1. 模块源 ─────────────────────────────────────────────────────────────
providers = read('providers.js')
balance = read('balance.js')
widget = read('widget.js')
shell = read('shell.js')

# 2. 相对 import 剥除（函数在拼接后的同一模块里直接可见）
shell = sub(shell,
            "import { PROVIDERS, PROVIDER_ORDER, sourceTier, srcKey } from './providers.js'\n",
            '', 1, 'shell-import-providers')
shell = sub(shell,
            "import { mountWidget, unmountWidget } from './widget.js'\n",
            '', 1, 'shell-import-widget')
shell = sub(shell,
            "import { fetchSource } from './balance.js'\n",
            '', 1, 'shell-import-balance')

# 3. 三个源文件都不应再有任何相对 import
for name, text in (('shell', shell), ('providers', providers), ('balance', balance), ('widget', widget)):
    for line in text.split('\n'):
        if "from './" in line:
            fail('%s: relative import not stripped: %r' % (name, line.strip()))

# 3b. 九家形象 → base64 data URI 表（MASCOTS 占位符）
COMPACT = os.path.join(HERE, 'assets', 'transparent')
ids = ['deepseek', 'minimax', 'glm', 'kimi', 'mimo', 'chatgpt', 'claude', 'gemini', 'grok']
entries = []
total = 0
for pid in ids:
    p = os.path.join(COMPACT, pid + '.webp')
    if not os.path.exists(p):
        fail('missing compact mascot: ' + p)
    raw = open(p, 'rb').read()
    total += len(raw)
    entries.append('%s: %r' % (pid, 'data:image/webp;base64,' + base64.b64encode(raw).decode('ascii')))
mascots = 'export const MASCOTS = {\n  ' + ',\n  '.join(entries) + '\n}'
if widget.count('/*@MASCOTS@*/') != 1:
    fail('MASCOTS placeholder count != 1')
widget = widget.replace('/*@MASCOTS@*/', mascots)

# ── 2. 组装 ───────────────────────────────────────────────────────────────
banner = '''/**
 * hermes-balance-widget — Hermes 桌面多厂商余额挂件（单文件构建产物）
 * 由 build.py 从 src/ 组装生成，勿直接编辑。源码结构与出处见 src/ 与 README。
 */
'''

plugin = banner + providers + '\n\n' + balance + '\n\n' + widget + '\n\n' + shell

# ── 3. 残留清点（本机路径 / 密钥模式）──────────────────────────────────────
forbidden = ['C:\\\\Users', 'C:/Users', 'sk-', 'ghp_', 'api_key=', 'API_KEY=*** ...']
for tok in forbidden:
    if tok in plugin:
        fail('forbidden token in product: %r' % tok)

# ── 4. 语法门：拷成 .mjs 过 node --check ──────────────────────────────────
tmp = os.path.join(HERE, '__check.mjs')
with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
    f.write(plugin)
try:
    r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0:
        fail('node --check:\n' + (r.stderr or r.stdout))
finally:
    if os.path.exists(tmp):
        os.remove(tmp)

with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write(plugin)

print('OK -> %s (%.1f KB)' % (OUT, os.path.getsize(OUT) / 1024))
print('  providers: 9, mascots: %d (%d KB raw), shell lines: %d'
      % (len(ids), total // 1024, shell.count('\n')))
