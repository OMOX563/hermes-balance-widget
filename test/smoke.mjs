// hermes-balance-widget 冒烟测试：stub SDK import 后验证
// ① 九家模板完整性与结构 ② 执行器纯函数与三态取数（mock fetch）③ 注册结构
// 用法：node test/smoke.mjs   （先 python build.py）
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'

const rootDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''))
const pluginPath = path.join(rootDir, '..', 'plugin.js')
let src = fs.readFileSync(pluginPath, 'utf8')

// —— stub SDK / react import（字符串索引，不用正则：specifier 含裸 /）——
function replaceOnce(hay, startNeedle, endNeedle, replacement) {
  const s = hay.indexOf(startNeedle)
  if (s < 0) throw new Error('start needle missing: ' + startNeedle.slice(0, 60))
  const e = hay.indexOf(endNeedle, s)
  if (e < 0) throw new Error('end needle missing: ' + endNeedle.slice(0, 60))
  return hay.slice(0, s) + replacement + hay.slice(e + endNeedle.length)
}

src = replaceOnce(src, 'import {', "} from '@hermes/plugin-sdk'",
  `const host = { notify() {}, navigate() {}, request() { return Promise.resolve(null) } }
const haptic = () => {}
const ROUTES_AREA = 'routes'
const SIDEBAR_NAV_AREA = 'sidebar.nav'
const PALETTE_AREA = 'palette'
const Input = 'Input', Button = 'Button', ToggleRow = 'ToggleRow'`)
src = src.replace("import { jsx, jsxs } from 'react/jsx-runtime'", 'const jsx = () => null, jsxs = () => null')
src = src.replace("import { useState } from 'react'", 'const useState = (init) => [typeof init === "function" ? init() : init, () => {}]')

if (src.includes("from '@hermes/plugin-sdk'")) throw new Error('SDK import not stubbed')
if (src.includes("from 'react")) throw new Error('react import not stubbed')

// 源码各模块自带 export，无需追加导出

// browser 全局最小 stub（模块顶层无 DOM 操作）
globalThis.window = { sessionStorage: { getItem: () => null, setItem: () => {} },
                      localStorage: { getItem: () => null, setItem: () => {} } }

const tmp = path.join(rootDir, '..', '__smoke_mod.mjs')
fs.writeFileSync(tmp, src, 'utf8')
try {
  const mod = await import('file:///' + tmp.replace(/\\/g, '/'))

  /* ── ① 九家模板 ─────────────────────────────────────────────────────── */
  const expected = ['deepseek', 'minimax', 'glm', 'kimi', 'mimo', 'chatgpt', 'claude', 'gemini', 'grok']
  assert.deepEqual(Object.keys(mod.PROVIDERS).sort(), [...expected].sort(), '9 provider ids')
  assert.deepEqual(mod.PROVIDER_ORDER, expected, 'display order')
  for (const id of expected) {
    const p = mod.PROVIDERS[id]
    assert.ok(p.name && p.currency && p.keyRef, id + ' basic fields')
    assert.ok(p.kind === 'balance' || p.kind === 'quota' || p.noBalanceApi, id + ' tier')
    if (p.kind === 'balance') assert.ok(p.balance.url.startsWith('https://'), id + ' balance url')
    if (p.kind === 'quota') {
      assert.ok(p.quota && p.quota.url.startsWith('https://'), id + ' quota url')
      assert.ok(p.probeUrl, id + ' quota probeUrl')
    }
    if (p.noBalanceApi) {
      assert.ok(p.apiNote, id + ' apiNote')
      assert.ok(p.balance && p.balance.url === '', id + ' probe tier keeps empty balance url')
    }
  }
  // 层级分布：2 真余额 + 2 订阅额度 + 5 探活（真接口共 4 家）
  const tiers = expected.map((id) => mod.providerTier(mod.PROVIDERS[id])).sort()
  assert.deepEqual(tiers, ['balance', 'balance', 'quota', 'quota', 'probe', 'probe', 'probe', 'probe', 'probe'].sort(),
    'tier distribution 2/2/5')
  // 真接口关键 URL 不被写错
  assert.equal(mod.PROVIDERS.deepseek.balance.url, 'https://api.deepseek.com/user/balance')
  assert.equal(mod.PROVIDERS.minimax.quota.url, 'https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains')
  assert.equal(mod.PROVIDERS.kimi.balance.url, 'https://api.moonshot.cn/v1/users/me/balance')
  assert.equal(mod.PROVIDERS.mimo.probeUrl, 'https://token-plan-cn.xiaomimimo.com/v1/models')

  /* ── ② 执行器纯函数 ─────────────────────────────────────────────────── */
  const sample = { data: { available_balance: 42.5, limits: [
    { type: 'TIME_LIMIT', unit: 0, percentage: 9 },
    { type: 'TOKENS_LIMIT', unit: 3, percentage: 63.2, nextResetTime: 1791476218840 },
    { type: 'TOKENS_LIMIT', unit: 6, percentage: 12.8 },
  ] }, arr: [{ deep: { v: 7 } }] }
  assert.equal(mod.jsonPath(sample, 'data.available_balance'), 42.5, 'dot path')
  assert.equal(mod.jsonPath(sample, 'arr[0].deep.v'), 7, 'index path')
  assert.equal(mod.jsonPath(sample, 'nope.nope'), undefined, 'missing → undefined')
  assert.deepEqual(mod.buildHeaders('Bearer {key}', 'sk-test'), { Authorization: 'Bearer sk-test' }, 'bearer tpl')
  assert.deepEqual(mod.buildHeaders('{key}', 'rawkey'), { Authorization: 'rawkey' }, 'bare tpl (zhipu style)')
  assert.deepEqual(mod.buildHeaders('', 'k'), {}, 'empty auth → {}')

  /* ── ③ 三态取数（mock fetch）────────────────────────────────────────── */
  const mock = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body })

  // balance：deepseek 真余额
  const r1 = await mod.fetchBalance(mod.PROVIDERS.deepseek, 'k', mock({
    balance_infos: [{ total_balance: 12.3456 }],
  }))
  assert.ok(r1.ok && r1.remaining === 12.3456 && r1.currency === 'CNY', 'deepseek balance parse')

  // quota：minimax 简单字段
  const r2 = await mod.fetchQuota(mod.PROVIDERS.minimax, 'k', mock({
    model_remains: [{ current_interval_remaining_percent: 87.5,
                      current_weekly_remaining_percent: 40.2, end_time: 1791476218840 }],
  }))
  assert.ok(r2.ok && r2.windows.length === 2, 'minimax two windows')
  assert.equal(r2.windows[0].percent, 87.5, 'interval pct')
  assert.equal(r2.windows[1].label, '周', 'weekly label')

  // quota：智谱 windows + pick（list/types/unit 过滤）
  const r3 = await mod.fetchQuota(mod.PROVIDERS.glm, 'k', mock(sample))
  assert.ok(r3.ok && r3.windows.length === 2, 'zhipu picked windows')
  assert.equal(r3.windows[0].percent, 63.2, 'unit=3 picked (not [0])')
  assert.equal(r3.windows[1].percent, 12.8, 'unit=6 weekly')
  assert.equal(r3.windows[0].resetAt, 1791476218840, 'resetAt passthrough')

  // probe：openai 探活 401 → not ok
  const r4 = await mod.probe(mod.PROVIDERS.chatgpt, 'bad', mock({}, false, 401))
  assert.equal(r4.ok, false, 'probe 401 → fail')
  const r5 = await mod.probe(mod.PROVIDERS.gemini, 'k', mock({}, true, 200))
  assert.equal(r5.ok, true, 'gemini ?key= probe ok')

  // noBalanceApi 的 fetchBalance 必须返回 unsupported（不发请求）
  let fetched = false
  const r6 = await mod.fetchBalance(mod.PROVIDERS.claude, 'k', async () => { fetched = true; return mock({})() })
  assert.equal(r6.unsupported, true, 'claude balance unsupported')
  assert.equal(fetched, false, 'no request fired for noBalanceApi')

  // fetchProvider 自动分层
  const r7 = await mod.fetchProvider(mod.PROVIDERS.kimi, 'k', mock({ data: { available_balance: 3.14 } }))
  assert.ok(r7.ok && r7.remaining === 3.14, 'fetchProvider → balance tier')
  const r8 = await mod.fetchProvider(mod.PROVIDERS.grok, 'k', mock({}, true, 200))
  assert.ok(r8.probeOnly && r8.ok, 'fetchProvider → probe tier')

  /* ── ④ 形象素材表 ───────────────────────────────────────────────────── */
  assert.equal(Object.keys(mod.MASCOTS).length, 9, 'nine mascots embedded')
  for (const id of expected) {
    const uri = mod.MASCOTS[id]
    assert.ok(typeof uri === 'string' && uri.startsWith('data:image/webp;base64,'), id + ' data uri')
    assert.ok(uri.length > 5000 && uri.length < 120000, id + ' size sane: ' + uri.length)
  }

  /* ── ⑤ Phase 2.5 挂件弹窗/音效/预警静态断言 ───────────────────────────── */
  for (const needle of [
    'hbw-p-big',                    // 弹窗结构
    '--theme-background-seed',      // 日/夜主题判定源
    'data-theme',                   // 玻璃双模切换
    'cubic-bezier(.34,1.56,.64,1)', // Q 弹回弹曲线
    'AudioContext',                 // WebAudio 音效
    'observeDrop',                  // 今日已用观测
    'focusedUsage',                 // 每轮消耗 / usage 订阅
    'alertThreshold',               // 余额预警阈值
    'PHRASES',                      // 随机语句
    '挂件大小',                      // 大小调节控件
    '--hbw-s',                      // CSS 变量缩放（1:1 坐标防漂移）
    'setScale',                     // 就地缩放（视觉中心不动）
    'data-side',                    // 漫画气泡方向
    '--hbw-tail-x',                 // 气泡尖角指向角色
    'positionPop',                  // 渲染后测高定位（防空壳高度顶出屏）
    'hbw-pop-in',                   // 弹窗入场动画
  ]) {
    assert.ok(src.includes(needle), 'phase2.5 presence: ' + needle)
  }

  /* ── ⑤b 模型自动换装 + 分角色语句池 + 200% 尺寸基准 ───────────────────── */
  // 关键词匹配（不分大小写；slug 形如 provider/model）
  assert.equal(mod.pidFromModel('DeepSeek/DeepSeek-V4-Flash'), 'deepseek', 'upper slug → deepseek')
  assert.equal(mod.pidFromModel('deepseek/deepseek-v4-flash'), 'deepseek', 'lower slug → deepseek')
  assert.equal(mod.pidFromModel('XIAOMI/MIMO-V2.6-PRO'), 'mimo', 'XIAOMI/MIMO mixed upper → mimo')
  assert.equal(mod.pidFromModel('xiaomi/mimo-v2.6-flash'), 'mimo', 'xiaomi → mimo')
  assert.equal(mod.pidFromModel('MiniMax/minimax-m2.5'), 'minimax', 'MiniMax → minimax')
  assert.equal(mod.pidFromModel('anthropic/claude-sonnet-4.5'), 'claude', 'anthropic → claude')
  assert.equal(mod.pidFromModel('x-ai/grok-4'), 'grok', 'x-ai → grok')
  assert.equal(mod.pidFromModel('zhipu/glm-4.7'), 'glm', 'zhipu → glm')
  assert.equal(mod.pidFromModel('moonshotai/kimi-k2'), 'kimi', 'moonshot → kimi')
  assert.equal(mod.pidFromModel('google/gemini-3.1-pro'), 'gemini', 'gemini hit')
  assert.equal(mod.pidFromModel('openai/gpt-5.2'), 'chatgpt', 'openai/gpt → chatgpt')
  assert.equal(mod.pidFromModel('qwen/qwen3-max'), null, 'unknown slug → null (回退 mainPid)')
  assert.equal(mod.pidFromModel(''), null, 'empty → null')
  assert.equal(mod.pidFromModel(null), null, 'null → null')
  // 每个角色 ≥5 条语句
  assert.equal(Object.keys(mod.PHRASES_BY_PID).length, 9, 'nine phrase pools')
  for (const id of expected) {
    const pool = mod.PHRASES_BY_PID[id]
    assert.ok(Array.isArray(pool) && pool.length >= 5, id + ' phrases >= 5 (got ' + (pool && pool.length) + ')')
    for (const s of pool) assert.ok(typeof s === 'string' && s.trim().length > 0, id + ' phrase non-empty')
  }
  // 用户点名的三条原样在池
  assert.ok(mod.PHRASES_BY_PID.claude.includes('你刚刚跳IP了对吧。'), 'claude sample verbatim')
  assert.ok(mod.PHRASES_BY_PID.deepseek.includes('吃大白饭ing~/用户快把你的token爆出来！'), 'deepseek sample verbatim')
  assert.ok(mod.PHRASES_BY_PID.minimax.includes('准备向m老师问点什么？'), 'minimax sample verbatim')
  // 200% 尺寸基准 + 换装接线
  for (const needle of [
    'calc(235px * var(--hbw-s))',   // 尺寸基准 = 336px 的 70%
    'host.state.model',             // 订阅当前模型
    'switchTo',                      // 换装函数
    'autoSwitch',                    // 开关配置
    'phrasePool',                    // 分池取句
  ]) assert.ok(src.includes(needle), 'auto-switch presence: ' + needle)

  /* ── ⑥ 注册结构 ─────────────────────────────────────────────────────── */
  const contributions = []
  const stored = new Map()
  const ctx = {
    register(c) { contributions.push(c); return () => {} },
    storage: { get: (k, fb) => (stored.has(k) ? stored.get(k) : fb),
               set: (k, v) => stored.set(k, v), remove: (k) => stored.delete(k) },
    onDispose() {},
  }
  mod.default.register(ctx)
  assert.equal(mod.default.id, 'hermes-balance-widget', 'plugin id')
  assert.equal(contributions.length, 3, 'three contributions')
  const areas = contributions.map((c) => c.area).sort()
  assert.deepEqual(areas, ['palette', 'routes', 'sidebar.nav'], 'areas')
  const route = contributions.find((c) => c.area === 'routes')
  assert.equal(route.data.path, '/balance-widget', 'route path')
  assert.equal(typeof route.render, 'function', 'settings page render')
  const nav = contributions.find((c) => c.area === 'sidebar.nav')
  assert.equal(nav.data.path, '/balance-widget', 'nav pairs route')
  const pal = contributions.find((c) => c.area === 'palette')
  assert.equal(pal.data.label, '余额挂件：打开设置', 'palette label')

  console.log('SMOKE OK — providers/jsonPath/取数三态/注册结构 全部断言通过')
} finally {
  fs.rmSync(tmp, { force: true })
}
