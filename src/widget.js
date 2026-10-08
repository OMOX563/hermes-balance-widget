/**
 * hermes-balance-widget — 右下角常驻挂件（Phase 2.5：弹窗化 + 液态玻璃）
 * ============================================================================
 * 交互：点角色（Q 弹按压）→ 弹出液态玻璃信息卡（日间白 / 夜间深，跟随
 * --theme-background-seed 亮度）；按住拖拽贴边吸附；卡内刷新。
 *
 * 功能（自原版语义移植）：
 *   - 余额预警：低于阈值 toast + 提示音（触发后回升复位，避免刷屏）
 *   - 今日已用：本地观测余额下降累计（充值不冲掉，跨天重置）
 *   - 每轮消耗：订阅 host.state.busy / focusedUsage，按 cost_usd 增量结算
 *   - 任务结束音：busy true→false 播 chime
 *   - 随机语句：弹窗底部轮换
 *   - 音效与提示：WebAudio 合成（按压 pop / chime / warn，音量可调）
 *   - 大小调节：root zoom（配置 scale 0.6–1.6）
 */

const STYLE_ID = 'hermes-balance-widget-style'
const ROOT_ID = 'hermes-balance-widget-root'
const POP_ID = 'hermes-balance-widget-pop'
const POLL_MS = 60_000

/** 九家形象 data URI（build.py 注入）。 */
/*@MASCOTS@*/

const PHRASES = [
  '上下文正在以光速膨胀…',
  '今天也要理性消费呀',
  '余额只是一种哲学概念',
  'token 在燃烧，梦想在起飞',
  '模型很贵，问题很便宜',
  '每一次调用都是一次投资',
  '余额充足，勇气加倍',
  '深度思考，浅度花钱',
  '别看了，再看也是这个数',
  '推理引擎就位，钱包引擎待命',
  '会话已建立，请系好安全带',
  '账单不会说谎，曲线不会哄人',
]

const CSS = `
#${ROOT_ID} {
  position: fixed; z-index: 2147482000;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
  user-select: none; -webkit-user-select: none;
  --hbw-s: 1;
}
#${ROOT_ID} .hbw-char {
  /* CSS 变量缩放：left/top 与 rect 恒 1:1，拖拽坐标永不漂移 */
  width: calc(84px * var(--hbw-s));
  height: calc(84px * var(--hbw-s));
  object-fit: contain; object-position: center bottom;
  background: transparent; cursor: pointer;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, .45));
  transform-origin: center bottom;
}

/* ── 液态玻璃弹窗 ─────────────────────────────────────────────────────── */
#${POP_ID} {
  position: fixed; z-index: 2147482100;
  width: 252px; border-radius: 18px; padding: 14px 16px 12px;
  font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
  font-size: 13px; line-height: 1.5;
  backdrop-filter: blur(4px) saturate(1.5);
  -webkit-backdrop-filter: blur(4px) saturate(1.5);
  box-shadow: 0 12px 36px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.35);
  border: 1px solid rgba(255,255,255,.35);
  animation: hbw-pop-in .34s cubic-bezier(.34, 1.56, .64, 1) both;
  transform-origin: var(--hbw-origin, center bottom);
}
#${POP_ID}[data-theme="light"] {
  background: linear-gradient(160deg, rgba(255,255,255,.82), rgba(248,250,255,.66));
  color: #1a1a1e;
  border-color: rgba(255,255,255,.75);
}
#${POP_ID}[data-theme="dark"] {
  background: linear-gradient(160deg, rgba(38,38,44,.78), rgba(22,22,26,.68));
  color: #f0f0f2;
  border-color: rgba(255,255,255,.14);
}
@keyframes hbw-pop-in {
  0% { opacity: 0; transform: scale(.82) translateY(8px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
#${POP_ID} .hbw-p-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
#${POP_ID} .hbw-p-name { font-weight: 700; font-size: 14px; }
#${POP_ID} .hbw-p-badge {
  font-size: 10.5px; padding: 1.5px 7px; border-radius: 999px;
  border: 1px solid currentColor; opacity: .9;
}
#${POP_ID}[data-theme="light"] .hbw-p-badge { color: #5b6472; }
#${POP_ID}[data-theme="dark"] .hbw-p-badge { color: #aab2c0; }
#${POP_ID} .hbw-p-big { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: .01em; }
#${POP_ID} .hbw-p-sub { font-size: 11.5px; opacity: .68; margin-top: 1px; }
#${POP_ID} .hbw-p-row {
  display: flex; justify-content: space-between; gap: 10px;
  font-size: 12px; padding: 5px 0;
  border-top: 1px solid rgba(128,128,128,.22);
}
#${POP_ID}[data-theme="light"] .hbw-p-row { border-top-color: rgba(0,0,0,.08); }
#${POP_ID} .hbw-p-row .k { opacity: .66; }
#${POP_ID} .hbw-p-row .v { font-variant-numeric: tabular-nums; font-weight: 600; }
#${POP_ID} .hbw-p-alert {
  margin-top: 8px; font-size: 12px; font-weight: 650; padding: 6px 9px; border-radius: 9px;
}
#${POP_ID}[data-theme="light"] .hbw-p-alert { background: rgba(220,38,38,.12); color: #b91c1c; }
#${POP_ID}[data-theme="dark"] .hbw-p-alert { background: rgba(248,113,113,.16); color: #fca5a5; }
#${POP_ID} .hbw-p-phrase {
  margin-top: 9px; font-size: 11.5px; font-style: italic; opacity: .62;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#${POP_ID} .hbw-p-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
#${POP_ID} .hbw-p-btn {
  font: inherit; font-size: 12px; padding: 5px 12px; cursor: pointer;
  border-radius: 9px;
}
#${POP_ID}[data-theme="light"] .hbw-p-btn {
  background: rgba(255,255,255,.9); border: 1px solid rgba(0,0,0,.14); color: #1a1a1e;
}
#${POP_ID}[data-theme="dark"] .hbw-p-btn {
  background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); color: #f0f0f2;
}
#${POP_ID} .hbw-p-btn:hover { filter: brightness(1.06); }
#${POP_ID} .hbw-p-time { font-size: 10.5px; opacity: .5; font-variant-numeric: tabular-nums; }

/* 漫画对话气泡尖角：指向角色头部（--hbw-tail-x 由 JS 按角色中心计算） */
#${POP_ID}::after, #${POP_ID}::before {
  content: ''; position: absolute;
  left: var(--hbw-tail-x, 50%);
  border-style: solid; border-width: 10px;
  border-color: transparent; transform: translateX(-50%);
}
#${POP_ID}[data-side="top"]::after {
  /* 气泡在角色上方：尖角朝下 */
  bottom: -9px;
  border-top-color: #f3f5f9; border-bottom: 0;
}
#${POP_ID}[data-side="bottom"]::before {
  /* 气泡翻到下方：尖角朝上 */
  top: -9px;
  border-bottom-color: #23242a; border-top: 0;
}
#${POP_ID}[data-theme="dark"][data-side="top"]::after { border-top-color: #26272d; }
#${POP_ID}[data-theme="light"][data-side="bottom"]::before { border-bottom-color: #fafbfd; }
`

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

/* ── 主题判定：--theme-background-seed 亮度（日间白 / 夜间深）───────────── */
function isLightTheme() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--theme-background-seed').trim()
    if (v) {
      const hex = v.replace('#', '')
      const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
      const r = parseInt(full.slice(0, 2), 16) / 255
      const g = parseInt(full.slice(2, 4), 16) / 255
      const b = parseInt(full.slice(4, 6), 16) / 255
      const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
      const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
      return L > 0.4
    }
  } catch (e) { /* noop */ }
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
}

/* ── WebAudio 音效（合成音，不搬原版素材——其 assets 不在 MIT 范围）─────── */
let _ac = null
function audioCtx() {
  if (!_ac) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    _ac = new AC()
  }
  if (_ac.state === 'suspended') _ac.resume().catch(() => {})
  return _ac
}
function tone(freq, dur, vol, opts = {}) {
  const ac = audioCtx()
  if (!ac) return
  const sweep = opts.sweep || 0
  const delay = opts.delay || 0
  const type = opts.type || 'sine'
  const t0 = ac.currentTime + delay
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.03)
}
const sfx = {
  press(vol) { tone(620, 0.09, 0.5 * vol, { sweep: -340, type: 'triangle' }) },
  chime(vol) {
    tone(1318.5, 0.34, 0.34 * vol)
    tone(1975.5, 0.42, 0.26 * vol, { delay: 0.11 })
  },
  warn(vol) {
    tone(988, 0.07, 0.4 * vol, { type: 'square' })
    tone(988, 0.07, 0.4 * vol, { delay: 0.14, type: 'square' })
  },
}

function money(v, currency) {
  if (v == null) return '—'
  const sym = currency === 'USD' ? '$' : '¥'
  return sym + (Math.round(v * 10000) / 10000).toLocaleString()
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

/* ── 今日已用观测：余额下降累计、充值不冲掉、跨天重置 ───────────────────── */
function observeDrop(ctx, pid, current) {
  if (!ctx || current == null) return null
  const key = 'obs.' + pid
  let obs = ctx.storage.get(key, null)
  if (!obs || obs.day !== todayKey()) obs = { day: todayKey(), last: current, used: 0 }
  if (current < obs.last) obs.used = +(obs.used + (obs.last - current)).toFixed(6)
  obs.last = current
  ctx.storage.set(key, obs)
  return obs.used
}
function todayUsed(ctx, pid) {
  if (!ctx) return null
  const obs = ctx.storage.get('obs.' + pid, null)
  if (!obs || obs.day !== todayKey()) return 0
  return obs.used
}

function fieldTier(provider) {
  if (provider.kind === 'balance') return '真余额'
  if (provider.kind === 'quota') return '订阅额度'
  return '探活 · 无余额接口'
}

export function mountWidget(ctx, opts = {}) {
  unmountWidget()
  injectStyle()

  const cfg = {
    enabled: opts.enabled !== false,
    mainPid: opts.mainPid || 'deepseek',
    scale: opts.scale || 1,
    sfx: opts.sfx !== false,
    sfxVolume: opts.sfxVolume != null ? opts.sfxVolume : 0.7,
    phrases: opts.phrases !== false,
    alertEnabled: !!opts.alertEnabled,
    alertThreshold: Number(opts.alertThreshold) || 0,
  }
  const provider = (typeof PROVIDERS !== 'undefined' && PROVIDERS[cfg.mainPid]) || null
  if (!provider) return null

  const state = {
    result: null, busy: false, unmounted: false,
    turnCost: null, costAtBusyStart: null,
    phraseIdx: Math.floor(Math.random() * PHRASES.length),
    popEl: null, phraseTimer: null,
    alerted: false, unsubs: [], timer: null,
  }

  /* ── 根（角色贴纸）───────────────────────────────────────────────────── */
  const root = document.createElement('div')
  root.id = ROOT_ID
  root.style.setProperty('--hbw-s', String(cfg.scale))

  const char = document.createElement('img')
  char.className = 'hbw-char'
  char.alt = provider.name
  char.title = '点击查看详情 · 拖拽移动'
  char.src = (typeof MASCOTS !== 'undefined' && MASCOTS[cfg.mainPid]) || ''

  root.appendChild(char)
  document.body.appendChild(root)

  /* ── 位置：持久化 + 贴边吸附 ─────────────────────────────────────────── */
  function place(pos) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = root.offsetWidth || 120
    const h = root.offsetHeight || 120
    let x = pos && pos.x != null ? pos.x : vw - w - 18
    let y = pos && pos.y != null ? pos.y : vh - h - 18
    x = Math.max(4, Math.min(vw - w - 4, x))
    y = Math.max(4, Math.min(vh - h - 4, y))
    root.style.left = x + 'px'
    root.style.top = y + 'px'
  }
  function snap() {
    const x = parseFloat(root.style.left) || 0
    const y = parseFloat(root.style.top) || 0
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = root.offsetWidth
    const h = root.offsetHeight
    const TH = 36
    let nx = x, ny = y
    if (Math.abs(x - 4) < TH) nx = 4
    else if (Math.abs(x - (vw - w - 4)) < TH) nx = vw - w - 4
    if (Math.abs(y - (vh - h - 4)) < TH) ny = vh - h - 4
    place({ x: nx, y: ny })
    if (ctx) ctx.storage.set('pos', { x: nx, y: ny })
  }
  place(opts.pos)

  /* ── 拖拽 + Q 弹按压（区分点击/拖动）────────────────────────────────── */
  let drag = null
  char.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    char.setPointerCapture(e.pointerId)
    const rect = root.getBoundingClientRect()
    drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false, x0: e.clientX, y0: e.clientY }
    char.animate([{ transform: 'scale(1)' }, { transform: 'scale(.88)' }],
      { duration: 90, easing: 'ease-out', fill: 'forwards' })
    if (cfg.sfx) sfx.press(cfg.sfxVolume)
    e.preventDefault()
  })
  char.addEventListener('pointermove', (e) => {
    if (!drag) return
    if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) > 4) drag.moved = true
    if (drag.moved) {
      char.getAnimations().forEach((a) => a.cancel())
      char.style.transform = ''
      place({ x: e.clientX - drag.dx, y: e.clientY - drag.dy })
    }
  })
  char.addEventListener('pointerup', () => {
    if (!drag) return
    const wasDrag = drag.moved
    drag = null
    char.getAnimations().forEach((a) => a.cancel())
    char.style.transform = ''
    // Q 弹回弹：点击 = overshoot 弹跳；拖拽 = 平缓回位
    char.animate(
      wasDrag
        ? [{ transform: 'scale(.96)' }, { transform: 'scale(1)' }]
        : [{ transform: 'scale(.88)' }, { transform: 'scale(1.1)', offset: 0.45 }, { transform: 'scale(1)' }],
      { duration: wasDrag ? 160 : 420, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'forwards' })
    if (wasDrag) snap()
    else togglePop()
  })
  char.addEventListener('pointercancel', () => {
    char.getAnimations().forEach((a) => a.cancel())
    char.style.transform = ''
    if (drag && drag.moved) snap()
    drag = null
  })

  /* ── 取数 ────────────────────────────────────────────────────────────── */
  async function refresh() {
    if (state.busy) return
    const key = ctx ? String(ctx.storage.get('key.' + cfg.mainPid, '') || '') : ''
    if (!key) {
      state.result = null
      state.busy = false
      renderPop()
      return
    }
    state.busy = true
    renderPop()
    try {
      state.result = await (typeof fetchProvider !== 'undefined'
        ? fetchProvider(provider, key)
        : Promise.reject(new Error('executor missing')))
    } catch (err) {
      state.result = { ok: false, error: String(err && err.message || err) }
    }
    state.busy = false
    afterRefresh(state.result)
    if (!state.unmounted) renderPop()
  }

  function afterRefresh(r) {
    if (!r || !r.ok) return
    if (provider.kind === 'balance' && r.remaining != null) {
      observeDrop(ctx, cfg.mainPid, r.remaining)
      if (cfg.alertEnabled && cfg.alertThreshold > 0) {
        if (r.remaining < cfg.alertThreshold) {
          if (!state.alerted) {
            state.alerted = true
            try {
              if (typeof host !== 'undefined') host.notify({
                kind: 'warning',
                message: provider.name + ' 余额预警：' + money(r.remaining, r.currency) +
                         ' 低于阈值 ' + money(cfg.alertThreshold, r.currency),
              })
            } catch (e) { /* noop */ }
            if (cfg.sfx) sfx.warn(cfg.sfxVolume)
          }
        } else {
          state.alerted = false
        }
      }
    }
  }

  /* ── 弹窗（液态玻璃）────────────────────────────────────────────────── */
  function closePop() {
    if (state.popEl && state.popEl.parentNode) state.popEl.parentNode.removeChild(state.popEl)
    state.popEl = null
    if (state.phraseTimer) clearInterval(state.phraseTimer)
    state.phraseTimer = null
    document.removeEventListener('pointerdown', onDocDown, true)
  }
  function onDocDown(e) {
    if (!state.popEl) return
    if (state.popEl.contains(e.target) || root.contains(e.target)) return
    closePop()
  }

  /** 定位：必须在 renderPop() 填完内容后测高（空壳只有 padding 高度，先测会把弹窗顶出视口）。 */
  function positionPop(pop) {
    const r = root.getBoundingClientRect()
    const ph = pop.offsetHeight
    const pw = pop.offsetWidth
    const side = (r.top - ph - 6 >= 8) ? 'top' : 'bottom'
    const top = side === 'top' ? r.top - ph - 6 : r.bottom + 6
    let left = r.left + r.width / 2 - pw / 2
    left = Math.max(8, Math.min(window.innerWidth - pw - 8, left))
    pop.style.top = top + 'px'
    pop.style.left = left + 'px'
    pop.setAttribute('data-side', side)
    // 尖角水平位置：对准角色中心（相对弹窗），并收进弹窗内部防出界
    const tailRaw = (r.left + r.width / 2) - left
    const tail = Math.max(20, Math.min(pw - 20, tailRaw))
    pop.style.setProperty('--hbw-tail-x', tail + 'px')
    pop.style.setProperty('--hbw-origin', side === 'top' ? 'center bottom' : 'center top')
  }

  function togglePop() {
    if (state.popEl) { closePop(); return }
    const pop = document.createElement('div')
    pop.id = POP_ID
    pop.setAttribute('data-theme', isLightTheme() ? 'light' : 'dark')
    pop.style.visibility = 'hidden'
    document.body.appendChild(pop)
    state.popEl = pop
    renderPop()   // 先填内容，高度才准
    positionPop(pop)
    pop.style.visibility = ''

    pop.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest && e.target.closest('[data-act]')
      if (!btn) return
      if (btn.getAttribute('data-act') === 'refresh') refresh()
    })
    document.addEventListener('pointerdown', onDocDown, true)

    if (cfg.phrases) {
      state.phraseTimer = setInterval(() => {
        state.phraseIdx = (state.phraseIdx + 1) % PHRASES.length
        renderPop()
      }, 8000)
    }
    refresh()
  }

  function renderPop() {
    const pop = state.popEl
    if (!pop || state.unmounted) return
    const r = state.result

    let big = '…'
    let sub = ''
    if (!r && state.busy) { big = '…'; sub = '取数中' }
    else if (!r) { big = '—'; sub = '未配置 key 或等待首次刷新' }
    else if (!r.ok) {
      big = r.unsupported ? '—' : '!'
      sub = r.error ? ('请求失败：' + r.error)
        : r.status ? ('HTTP ' + r.status + (r.parse ? ' · 字段未命中' : ''))
        : (r.note || '取数失败')
    } else if (provider.kind === 'balance') {
      big = money(r.remaining, r.currency)
      sub = provider.name + ' · 余额'
    } else if (provider.kind === 'quota') {
      const w0 = r.windows && r.windows[0]
      big = w0 && w0.percent != null ? w0.percent.toFixed(1) + '%' : '—'
      sub = provider.name + ' · ' + (w0 ? w0.label + '剩余' : '额度')
    } else {
      big = '✓'
      sub = 'key 可用 · 官方无余额接口'
    }

    const rows = []
    if (provider.kind === 'balance') {
      const used = todayUsed(ctx, cfg.mainPid)
      rows.push(['今日已用', used != null ? money(used, provider.currency) : '—'])
      if (r && r.ok && r.total != null) rows.push(['总额', money(r.total, r.currency)])
      if (r && r.ok && r.remaining != null) rows.push(['余额', money(r.remaining, r.currency)])
    } else if (provider.kind === 'quota' && r && r.ok && r.windows) {
      for (const w of r.windows.slice(0, 3)) {
        rows.push([w.label, w.percent != null ? w.percent.toFixed(1) + '%'
          : (w.remain != null ? String(w.remain) : '—')])
      }
    }
    if (state.turnCost != null) rows.push(['每轮消耗', '$' + state.turnCost.toFixed(4)])

    const alertOn = cfg.alertEnabled && cfg.alertThreshold > 0 &&
      provider.kind === 'balance' && r && r.ok && r.remaining != null &&
      r.remaining < cfg.alertThreshold

    pop.innerHTML = ''
    const head = document.createElement('div')
    head.className = 'hbw-p-head'
    const nameEl = document.createElement('span')
    nameEl.className = 'hbw-p-name'
    nameEl.textContent = provider.name
    const badge = document.createElement('span')
    badge.className = 'hbw-p-badge'
    badge.textContent = fieldTier(provider)
    head.appendChild(nameEl)
    head.appendChild(badge)
    pop.appendChild(head)

    const bigEl = document.createElement('div')
    bigEl.className = 'hbw-p-big'
    bigEl.textContent = big
    pop.appendChild(bigEl)
    const subEl = document.createElement('div')
    subEl.className = 'hbw-p-sub'
    subEl.textContent = sub
    pop.appendChild(subEl)

    for (const kv of rows) {
      const row = document.createElement('div')
      row.className = 'hbw-p-row'
      const k = document.createElement('span')
      k.className = 'k'
      k.textContent = kv[0]
      const v = document.createElement('span')
      v.className = 'v'
      v.textContent = kv[1]
      row.appendChild(k)
      row.appendChild(v)
      pop.appendChild(row)
    }

    if (alertOn) {
      const a = document.createElement('div')
      a.className = 'hbw-p-alert'
      a.textContent = '⚠ 余额低于预警阈值 ' + money(cfg.alertThreshold, provider.currency)
      pop.appendChild(a)
    }

    if (cfg.phrases) {
      const p = document.createElement('div')
      p.className = 'hbw-p-phrase'
      p.textContent = '「' + PHRASES[state.phraseIdx % PHRASES.length] + '」'
      pop.appendChild(p)
    }

    const foot = document.createElement('div')
    foot.className = 'hbw-p-foot'
    const t = document.createElement('span')
    t.className = 'hbw-p-time'
    t.textContent = r && r.ok ? new Date().toLocaleTimeString() : ''
    const btn = document.createElement('button')
    btn.className = 'hbw-p-btn'
    btn.setAttribute('data-act', 'refresh')
    btn.textContent = state.busy ? '刷新中…' : '刷新'
    foot.appendChild(t)
    foot.appendChild(btn)
    pop.appendChild(foot)

    // 内容行数变化会改变高度：底边必须始终贴角色头顶（就地重定位）
    positionPop(pop)
  }

  /* ── host.state：任务结束音 + 每轮消耗（nanostore atom 可编程订阅）───── */
  try {
    if (typeof host !== 'undefined' && host.state && host.state.busy &&
        typeof host.state.busy.subscribe === 'function') {
      let wasBusy = null
      state.unsubs.push(host.state.busy.subscribe((busy) => {
        if (state.unmounted) return
        const usage = host.state.focusedUsage && host.state.focusedUsage.get
          ? host.state.focusedUsage.get() : null
        const cost = usage && typeof usage.cost_usd === 'number' ? usage.cost_usd : null
        if (busy) {
          if (wasBusy !== true) state.costAtBusyStart = cost
        } else if (wasBusy === true) {
          // 任务结束：结算本轮 cost 增量 + chime
          if (cost != null && state.costAtBusyStart != null && cost >= state.costAtBusyStart) {
            state.turnCost = +(cost - state.costAtBusyStart).toFixed(6)
          }
          state.costAtBusyStart = null
          if (cfg.sfx) sfx.chime(cfg.sfxVolume)
          renderPop()
        }
        wasBusy = busy
      }))
    }
    if (typeof host !== 'undefined' && host.state && host.state.focusedUsage &&
        typeof host.state.focusedUsage.subscribe === 'function') {
      state.unsubs.push(host.state.focusedUsage.subscribe(() => {
        if (state.popEl && !state.unmounted) renderPop()
      }))
    }
  } catch (e) { console.warn('[hermes-balance-widget] state 订阅失败：', e) }

  /* ── 轮询与尺寸 ──────────────────────────────────────────────────────── */
  state.timer = setInterval(refresh, POLL_MS)
  function onResize() { place({ x: parseFloat(root.style.left), y: parseFloat(root.style.top) }) }
  window.addEventListener('resize', onResize)

  refresh()
  if (!cfg.enabled) root.style.display = 'none'

  return {
    unmount() {
      state.unmounted = true
      closePop()
      if (state.timer) clearInterval(state.timer)
      for (const u of state.unsubs) { try { u() } catch (e) { /* noop */ } }
      window.removeEventListener('resize', onResize)
      if (root.parentNode) root.parentNode.removeChild(root)
    },
    setVisible(v) { root.style.display = v ? '' : 'none' },
    /** 缩放并保持视觉中心不动（就地缩放，不漂移）。 */
    setScale(s) {
      const before = root.getBoundingClientRect()
      const cx = before.left + before.width / 2
      const cy = before.top + before.height / 2
      root.style.setProperty('--hbw-s', String(s))
      const after = root.getBoundingClientRect()
      // 视觉中心补偿：把 left/top 平移回去（坐标 1:1，无需 zoom 换算）
      const dx = cx - (after.left + after.width / 2)
      const dy = cy - (after.top + after.height / 2)
      const x = (parseFloat(root.style.left) || 0) + dx
      const y = (parseFloat(root.style.top) || 0) + dy
      place({ x, y })
      if (ctx) ctx.storage.set('pos', { x: parseFloat(root.style.left), y: parseFloat(root.style.top) })
    },
    refresh,
    root,
  }
}

export function unmountWidget() {
  const el = document.getElementById(ROOT_ID)
  if (el && el.parentNode) el.parentNode.removeChild(el)
  const pop = document.getElementById(POP_ID)
  if (pop && pop.parentNode) pop.parentNode.removeChild(pop)
}
