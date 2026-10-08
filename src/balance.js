/**
 * hermes-balance-widget — 取数执行器
 * ============================================================================
 * 模板驱动的三态取数：真余额 / 订阅额度 / 探活。纯函数 + 注入式 fetch，
 * 便于 smoke 测试与浏览器/任何运行时复用。
 *
 * fetchBalance(provider, key)  → { ok, remaining, total?, currency, raw? }
 * fetchQuota(provider, key)    → { ok, windows: [{key,label,percent,resetAt?}], ... }
 * probe(provider, key)         → { ok, status, note? }
 */

/* ── 字段路径：支持 a.b[0].c，找不到返回 undefined ──────────────────────── */
export function jsonPath(obj, path) {
  if (!path) return undefined
  let cur = obj
  const parts = String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined
    cur = cur[part]
  }
  return cur
}

/** 数字读取：路径取值 → Number；非有限数返回 null。可选 scale 乘数。 */
function num(obj, path, scale) {
  const v = jsonPath(obj, path)
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return scale ? n * scale : n
}

/** auth 模板 → 请求头对象。'' 返回 {}。 */
export function buildHeaders(authTpl, key) {
  const tpl = String(authTpl || '')
  if (!tpl) return {}
  const value = tpl.replace('{key}', key || '')
  // 裸值模板（智谱风格：auth === '{key}'）直接作为 Authorization；其余按模板原样
  const isBearer = /^Bearer\s/i.test(value)
  return { Authorization: value }
}

/** url 模板：{key} {base} 占位替换。 */
function buildUrl(tpl, key) {
  return String(tpl || '').replace('{key}', encodeURIComponent(key || ''))
}

function mergeHeaders(...parts) {
  return Object.assign({}, ...parts.filter(Boolean))
}

/* ── 真余额 ─────────────────────────────────────────────────────────────── */
export async function fetchBalance(provider, key, fetchImpl = fetch) {
  const b = provider && provider.balance
  if (!b || !b.url || provider.noBalanceApi) {
    return { ok: false, unsupported: true, note: provider && provider.apiNote }
  }
  try {
    const res = await fetchImpl(buildUrl(b.url, key), {
      headers: mergeHeaders(buildHeaders(b.auth, key), { Accept: 'application/json' }),
    })
    if (!res.ok) return { ok: false, status: res.status }
    const body = await res.json()
    const remaining = num(body, b.json && b.json.remaining, b.json && b.json.remainingScale)
    const total = num(body, b.json && b.json.total, b.json && b.json.totalScale)
    const used = num(body, b.json && b.json.used, b.json && b.json.usedScale)
    if (remaining === null && total === null) return { ok: false, status: res.status, parse: true }
    return { ok: true, remaining, total: total, used: used, currency: provider.currency }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) }
  }
}

/* ── 订阅额度 ───────────────────────────────────────────────────────────── */
export async function fetchQuota(provider, key, fetchImpl = fetch) {
  const q = provider && provider.quota
  if (!q || !q.url) return { ok: false, unsupported: true }
  try {
    const res = await fetchImpl(buildUrl(q.url, key), {
      headers: mergeHeaders(buildHeaders(q.auth, key), { Accept: 'application/json' }),
    })
    if (!res.ok) return { ok: false, status: res.status }
    const body = await res.json()

    // 形态 ①：多窗口 windows[]（智谱 data.limits pick / OpenCode 三窗口）
    if (q.json && Array.isArray(q.json.windows)) {
      const windows = []
      for (const w of q.json.windows) {
        let source = body
        if (w.pick && w.pick.list) {
          const list = jsonPath(body, w.pick.list)
          if (!Array.isArray(list)) continue
          source = list.find((it) => {
            const typeOk = !w.pick.types || w.pick.types.includes(it && it.type)
            const unitOk = w.pick.unit === undefined || (it && it.unit) === w.pick.unit
            return typeOk && unitOk
          })
          if (!source) continue
        }
        const percent = num(source, w.percent, w.scale)
        if (percent === null) continue
        windows.push({ key: w.key, label: w.label, percent, resetAt: jsonPath(source, w.resetAt) })
      }
      return windows.length ? { ok: true, windows } : { ok: false, parse: true }
    }

    // 形态 ②：简单字段（remainPct / weeklyRemainPct / remain+total）
    const windows = []
    const pct = num(body, q.json && q.json.remainPct)
    const weeklyPct = num(body, q.json && q.json.weeklyRemainPct)
    const resetAtMs = jsonPath(body, q.json && q.json.resetAtMs)
    const resetAt = jsonPath(body, q.json && q.json.resetAt)
    if (pct !== null) windows.push({ key: 'rolling', label: '5h', percent: pct, resetAt: resetAtMs || resetAt })
    if (weeklyPct !== null) windows.push({ key: 'weekly', label: '周', percent: weeklyPct, resetAt: null })
    if (!windows.length) {
      const remain = num(body, q.json && q.json.remain)
      const total = num(body, q.json && q.json.total)
      if (remain !== null) {
        windows.push({
          key: 'quota', label: '额度',
          percent: total ? (remain / total) * 100 : null,
          remain, total, resetAt,
        })
      }
    }
    return windows.length ? { ok: true, windows, currency: provider.currency } : { ok: false, parse: true }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) }
  }
}

/* ── 探活（无余额接口的厂商：只验证 key）────────────────────────────────── */
export async function probe(provider, key, fetchImpl = fetch) {
  const url = provider && provider.probeUrl
  if (!url) return { ok: false, unsupported: true, note: provider && provider.apiNote }
  try {
    const res = await fetchImpl(buildUrl(url, key), {
      headers: mergeHeaders(buildHeaders(provider.balance && provider.balance.auth, key)),
    })
    // gemini ?key= 形式 200 即活；401/403 即 key 无效；404 也常代表 key 权限不足
    return { ok: res.ok, status: res.status }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) }
  }
}

/** 统一入口：按模板层级自动选择取数方式。 */
export async function fetchProvider(provider, key, fetchImpl = fetch) {
  if (provider.kind === 'balance') return fetchBalance(provider, key, fetchImpl)
  if (provider.kind === 'quota') return fetchQuota(provider, key, fetchImpl)
  return { ...(await probe(provider, key, fetchImpl)), probeOnly: true }
}
