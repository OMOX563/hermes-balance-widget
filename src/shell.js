/**
 * hermes-balance-widget — Hermes 桌面插件壳
 * ============================================================================
 * 多厂商余额/额度挂件（移植自 dsh-whale-widget 思路，MIT）。
 * Phase 1：设置页（九家卡片 + key 配置 + 真取数测试）+ 路由/侧栏/命令三入口。
 * Phase 2：右下角常驻挂件本体（气泡、拖拽吸附、形象切换）。
 *
 * 单文件组装约定：build.py 将 ./providers.js 与 ./balance.js 的模块源码
 * 原样拼接进产物（同为 ESM，多 export 共存合法），并剥离本文件的两行相对 import。
 */

import {
  host,
  haptic,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  PALETTE_AREA,
  Input,
  Button,
  ToggleRow
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useState } from 'react'
import { PROVIDERS, PROVIDER_ORDER, providerTier } from './providers.js'
import { mountWidget, unmountWidget } from './widget.js'
import { fetchProvider } from './balance.js'

const ID = 'hermes-balance-widget'
const KEY_PREFIX = 'key.'

/** Phase 1 的取数结果只活在组件态里，不落 storage。 */
let gCtx = null
/** 挂件句柄（Phase 2）。 */
let gWidget = null

function readCfgLocal(ctx) {
  const g = (k, d) => (ctx ? ctx.storage.get(k, d) : d)
  return {
    enabled: g('enabled', true) !== false,
    mainPid: String(g('mainPid', 'deepseek') || 'deepseek'),
    pos: g('pos', null),
    scale: Number(g('scale', 1)) || 1,
    sfx: g('sfx', true) !== false,
    sfxVolume: g('sfxVolume', 0.7) != null ? Number(g('sfxVolume', 0.7)) : 0.7,
    phrases: g('phrases', true) !== false,
    alertEnabled: !!g('alertEnabled', false),
    alertThreshold: Number(g('alertThreshold', 0)) || 0,
    autoSwitch: g('autoSwitch', true) !== false,
  }
}
function writeCfgLocal(ctx, patch) {
  if (!ctx) return
  for (const [k, v] of Object.entries(patch)) ctx.storage.set(k, v)
}
/** 重启挂件（开关/主厂商/位置变更后）。 */
function remountWidget() {
  if (!gCtx) return
  const cfg = readCfgLocal(gCtx)
  if (gWidget) { gWidget.unmount(); gWidget = null }
  gWidget = mountWidget(gCtx, {
    enabled: cfg.enabled, mainPid: cfg.mainPid, pos: cfg.pos,
    scale: cfg.scale, sfx: cfg.sfx, sfxVolume: cfg.sfxVolume,
    phrases: cfg.phrases, alertEnabled: cfg.alertEnabled, alertThreshold: cfg.alertThreshold,
    autoSwitch: cfg.autoSwitch,
  })
}

function readKey(ctx, pid) {
  return ctx ? String(ctx.storage.get(KEY_PREFIX + pid, '') || '') : ''
}
function writeKey(ctx, pid, value) {
  if (!ctx) return
  const v = String(value || '').trim()
  if (v) ctx.storage.set(KEY_PREFIX + pid, v)
  else ctx.storage.remove(KEY_PREFIX + pid)
}

const TIER_LABEL = {
  balance: { text: '真余额', color: '#16a34a' },
  quota: { text: '订阅额度', color: '#2563eb' },
  probe: { text: '探活·无余额接口', color: '#a16207' },
}

const ROW_STYLE = {
  border: '1px solid rgba(128,128,128,.25)',
  borderRadius: 10,
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}
const HEAD_STYLE = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const BADGE_STYLE = {
  fontSize: 11, padding: '2px 7px', borderRadius: 999,
  border: '1px solid currentColor', opacity: 0.95,
}
const RESULT_STYLE = { fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }

function formatResult(tier, r) {
  if (!r) return ''
  if (r.unsupported) return '— ' + (r.note || '该模板不提供此取数')
  if (r.error) return '请求失败：' + r.error
  if (!r.ok) {
    if (r.probeOnly) return '探活失败' + (r.status ? '（HTTP ' + r.status + '）' : '')
    return '取数失败' + (r.status ? '（HTTP ' + r.status + '）' : '') + (r.parse ? '：字段未命中' : '')
  }
  if (r.probeOnly) return '✓ key 可用（HTTP ' + r.status + '）· 余额接口不可用，显示「—」'
  if (tier === 'balance') {
    const cur = r.currency === 'USD' ? '$' : '¥'
    const parts = ['✓ 余额 ' + cur + (r.remaining != null ? r.remaining.toFixed(4) : '—')]
    if (r.total != null) parts.push('总额 ' + cur + r.total.toFixed(4))
    if (r.used != null) parts.push('已用 ' + cur + r.used.toFixed(4))
    return parts.join(' · ')
  }
  if (tier === 'quota') {
    return '✓ ' + r.windows.map((w) =>
      w.label + ' ' + (w.percent != null ? w.percent.toFixed(1) + '%' : (w.remain != null ? w.remain : '—'))
    ).join(' · ')
  }
  return '✓'
}

function ProviderRow({ pid }) {
  const [key, setKeyState] = useState(() => readKey(gCtx, pid))
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const p = PROVIDERS[pid]
  const tier = providerTier(p)
  const badge = TIER_LABEL[tier]

  async function test() {
    if (!key.trim()) {
      setResult({ unsupported: true, note: '先填写 ' + p.keyRef })
      return
    }
    haptic('tap')
    setBusy(true)
    setResult(null)
    const r = await fetchProvider(p, key.trim())
    setResult(r)
    setBusy(false)
  }

  return jsxs('div', { style: ROW_STYLE, children: [
    jsxs('div', { style: HEAD_STYLE, children: [
      jsx('strong', { style: { fontSize: 13.5 }, children: p.name }),
      jsx('span', { style: { ...BADGE_STYLE, color: badge.color }, children: badge.text }),
      jsx('span', { style: { fontSize: 11, opacity: 0.6 }, children: p.keyRef }),
    ] }),
    jsxs('div', { style: { display: 'flex', gap: 8 }, children: [
      jsx(Input, {
        value: key,
        type: 'password',
        placeholder: '输入 ' + p.keyRef,
        style: { flex: 1, fontSize: 12.5 },
        onChange: (e) => { setKeyState(e.target.value); writeKey(gCtx, pid, e.target.value) },
      }),
      jsx(Button, { size: 'sm', disabled: busy, onClick: test, children: busy ? '测试中…' : '测试连通性' }),
    ] }),
    p.apiNote ? jsx('div', { style: { fontSize: 11.5, opacity: 0.65, lineHeight: 1.5 }, children: p.apiNote }) : null,
    result ? jsx('div', { style: RESULT_STYLE, children: formatResult(tier, result) }) : null,
  ] })
}

function WidgetControls() {
  const cfg = readCfgLocal(gCtx)
  const [enabled, setEnabled] = useState(cfg.enabled)
  const [mainPid, setMainPid] = useState(cfg.mainPid)
  const [scale, setScale] = useState(cfg.scale)
  const [sfx, setSfx] = useState(cfg.sfx)
  const [volume, setVolume] = useState(cfg.sfxVolume)
  const [phrases, setPhrases] = useState(cfg.phrases)
  const [autoSwitch, setAutoSwitch] = useState(cfg.autoSwitch)
  const [alertOn, setAlertOn] = useState(cfg.alertEnabled)
  const [threshold, setThreshold] = useState(cfg.alertThreshold ? String(cfg.alertThreshold) : '')

  function toggle(v) {
    setEnabled(v)
    writeCfgLocal(gCtx, { enabled: v })
    remountWidget()
  }
  function pick(pid) {
    setMainPid(pid)
    writeCfgLocal(gCtx, { mainPid: pid })
    remountWidget()
  }
  // 大小：滑动实时生效 —— setScale 就地缩放（视觉中心不动，坐标 1:1 不漂移）
  function onScale(v) {
    setScale(v)
    writeCfgLocal(gCtx, { scale: v })
    if (gWidget && gWidget.setScale) gWidget.setScale(v)
  }
  function onVolume(v) {
    setVolume(v)
    writeCfgLocal(gCtx, { sfxVolume: v })
    remountWidget()
  }

  const SECTION = { fontSize: 12, opacity: 0.7, marginTop: 4 }
  const RAIL = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }

  return jsxs('div', {
    style: { border: '1px solid rgba(128,128,128,.25)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 },
    children: [
      jsx(ToggleRow, { checked: enabled, label: '显示右下角挂件', onChange: toggle }),
      jsxs('div', { style: RAIL, children: [
        jsx('span', { style: { minWidth: 74 }, children: '挂件大小' }),
        jsx('input', {
          type: 'range', min: 0.6, max: 1.6, step: 0.05, value: scale,
          style: { flex: 1 },
          onChange: (e) => onScale(Number(e.target.value)),
        }),
        jsx('span', { style: { fontVariantNumeric: 'tabular-nums', width: 44, textAlign: 'right' }, children: Math.round(scale * 100) + '%' }),
      ] }),
      jsxs('div', { style: RAIL, children: [
        jsx(ToggleRow, { checked: sfx, label: '音效（按压 / 任务结束 / 预警）', onChange: (v) => { setSfx(v); writeCfgLocal(gCtx, { sfx: v }); remountWidget() } }),
      ] }),
      jsxs('div', { style: { ...RAIL, opacity: sfx ? 1 : 0.45 }, children: [
        jsx('span', { style: { minWidth: 74 }, children: '音量' }),
        jsx('input', {
          type: 'range', min: 0, max: 1, step: 0.05, value: volume, disabled: !sfx,
          style: { flex: 1 },
          onChange: (e) => onVolume(Number(e.target.value)),
        }),
        jsx('span', { style: { fontVariantNumeric: 'tabular-nums', width: 44, textAlign: 'right' }, children: Math.round(volume * 100) + '%' }),
      ] }),
      jsx(ToggleRow, { checked: phrases, label: '弹窗随机语句', onChange: (v) => { setPhrases(v); writeCfgLocal(gCtx, { phrases: v }); remountWidget() } }),
      jsx(ToggleRow, { checked: alertOn, label: '余额预警（低于阈值时提示 + 响声）', onChange: (v) => { setAlertOn(v); writeCfgLocal(gCtx, { alertEnabled: v }); remountWidget() } }),
      jsxs('div', { style: { ...RAIL, opacity: alertOn ? 1 : 0.45 }, children: [
        jsx('span', { style: { minWidth: 74 }, children: '预警阈值' }),
        jsx(Input, {
          type: 'number', min: 0, step: 0.5, value: threshold, disabled: !alertOn,
          placeholder: '例如 5（仅真余额厂商生效）',
          style: { flex: 1, fontSize: 12.5 },
          onChange: (e) => {
            setThreshold(e.target.value)
            writeCfgLocal(gCtx, { alertThreshold: Number(e.target.value) || 0 })
            remountWidget()
          },
        }),
      ] }),
      jsx(ToggleRow, {
        checked: autoSwitch,
        label: '跟随当前模型自动换角色（按关键词匹配，不分大小写）',
        onChange: (v) => { setAutoSwitch(v); writeCfgLocal(gCtx, { autoSwitch: v }); remountWidget() },
      }),
      jsx('div', { style: SECTION, children: autoSwitch
        ? '主厂商（模型关键词未命中时的回退角色，点按即切换）'
        : '主厂商（决定挂件形象与显示数据，点按即切换）' }),
      jsxs('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }, children:
        PROVIDER_ORDER.map((pid) => {
          const active = pid === mainPid
          return jsx('button', {
            onClick: () => pick(pid),
            style: {
              font: 'inherit', fontSize: 12, padding: '6px 4px', cursor: 'pointer', borderRadius: 8,
              border: active ? '1.5px solid #3b82f6' : '1px solid rgba(128,128,128,.35)',
              background: active ? 'rgba(59,130,246,.14)' : 'transparent',
              color: 'inherit',
            },
            children: PROVIDERS[pid].name.replace(/（.*）/, ''),
          }, pid)
        }),
      }),
    ],
  })
}

function SettingsPage() {
  const [reloadTick, setReloadTick] = useState(0)
  return jsxs('div', {
    style: { padding: '20px 24px 32px', maxWidth: 760 },
    children: [
      jsxs('div', { style: { marginBottom: 14 }, children: [
        jsx('h1', { style: { fontSize: 18, fontWeight: 650, margin: '0 0 4px' }, children: '余额挂件 · 厂商设置' }),
        jsx('p', { style: { fontSize: 12.5, opacity: 0.65, margin: 0 },
          children: '九家厂商取数配置 + 挂件控制（点角色弹出玻璃卡片，拖拽移动）。key 只存本机插件存储，不上传。' }),
      ] }),
      jsx(WidgetControls, {}),
      jsx('div', {
        key: reloadTick,
        style: { display: 'flex', flexDirection: 'column', gap: 10 },
        children: PROVIDER_ORDER.map((pid) => jsx(ProviderRow, { pid }, pid)),
      }),
    ],
  })
}

export default {
  id: ID,
  name: '余额挂件',
  description: '九家厂商余额/额度挂件：DeepSeek、MiniMax、智谱、Kimi、MiMo、ChatGPT、Claude、Gemini、Grok。',
  register(ctx) {
    host.notify({ kind: 'info', message: '💰 余额挂件插件已加载 · 设置入口：侧栏「余额挂件」' })
    gCtx = ctx

    ctx.register({
      id: 'page',
      area: ROUTES_AREA,
      data: { path: '/balance-widget', title: '余额挂件' },
      render: () => jsx(SettingsPage, {}),
    })

    ctx.register({
      id: 'nav',
      area: SIDEBAR_NAV_AREA,
      order: 61,
      data: { codicon: 'symbol-odometer', label: '余额挂件', path: '/balance-widget' },
    })

    /* 挂件本体（Phase 2）：右下角常驻 */
    try {
      const cfg = readCfgLocal(ctx)
      gWidget = mountWidget(ctx, {
        enabled: cfg.enabled, mainPid: cfg.mainPid, pos: cfg.pos,
        scale: cfg.scale, sfx: cfg.sfx, sfxVolume: cfg.sfxVolume,
        phrases: cfg.phrases, alertEnabled: cfg.alertEnabled, alertThreshold: cfg.alertThreshold,
        autoSwitch: cfg.autoSwitch,
      })
    } catch (err) {
      console.error('[hermes-balance-widget] 挂件挂载异常：', err)
    }

    ctx.register({
      id: 'open-settings',
      area: PALETTE_AREA,
      data: {
        id: 'balance-widget.settings',
        label: '余额挂件：打开设置',
        keywords: ['余额', '挂件', 'balance', 'widget', '额度'],
        run: () => host.navigate('/balance-widget'),
      },
    })

    ctx.onDispose(() => {
      if (gWidget) { try { gWidget.unmount() } catch (e) { /* noop */ } gWidget = null }
      gCtx = null
    })
  },
}
