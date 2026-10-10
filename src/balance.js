/**
 * hermes-balance-widget — 取数执行器（多源版）
 * ============================================================================
 * 模板驱动的三态取数：按量付费真余额 / 订阅额度 / 探活。纯函数 + 注入式
 * fetch，便于 smoke 测试与浏览器/任何运行时复用。单个厂商 sources[] 可挂
 * 多条（订阅与按量付费分开），fetchAll 逐源取数汇总。
 *
 * fetchBalance(src, key)     → { ok, remaining, total?, currency, ... }
 * fetchQuota(src, key)       → { ok, windows: [{key,label,percent,resetAt?}], ... }
 * probe(src, key)            → { ok, status, note? }
 * fetchSource(src, key)      → 按 src.kind 三态分发，结果挂 srcLabel/srcTier
 * fetchAll(provider, keyFor) → [{ src, result }]（缺 key 的源记 unconfigured）
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

/**
 * auth 模板 → 请求头对象。'' 返回 {}。
 * extra 为 headers 表（源级额外请求头，如 Claude 探活双头），值支持 {key} 占位。
 * 裸值模板（智谱风格：auth === '{key}'）直接作为 Authorization；其余按模板原样。
 */
export function buildHeaders(authTpl, key, extra) {
  const out = {}
  const tpl = String(authTpl || '')
  if (tpl) out.Authorization = tpl.replace('{key}', key || '')
  if (extra && typeof extra === 'object') {
    for (const k of Object.keys(extra)) out[k] = String(extra[k]).replace('{key}', key || '')
  }
  return out
}

/** url 模板：{key} 占位替换（URL 编码）。 */
function buildUrl(tpl, key) {
  return String(tpl || '').replace('{key}', encodeURIComponent(key || ''))
}

function mergeHeaders(...parts) {
  return Object.assign({}, ...parts.filter(Boolean))
}

/* ── 按量付费真余额 ─────────────────────────────────────────────────────── */
export async function fetchBalance(src, key, fetchImpl = fetch) {
  const b = src && src.balance
  if (!b || !b.url || (src.kind && src.kind !== 'balance')) {
    return { ok: false, unsupported: true, note: src && src.apiNote }
  }
  try {
    const res = await fetchImpl(buildUrl(b.url, key), {
      headers: mergeHeaders(buildHeaders(b.auth, key, b.headers), { Accept: 'application/json' }),
    })
    if (!res.ok) return { ok: false, status: res.status }
    const body = await res.json()
    const bizMsg = body && body.success === false ? (body.msg || body.message) : null
    if (bizMsg) return { ok: false, note: bizMsg }
    const remaining = num(body, b.json && b.json.remaining, b.json && b.json.remainingScale)
    const total = num(body, b.json && b.json.total, b.json && b.json.totalScale)
    const used = num(body, b.json && b.json.used, b.json && b.json.usedScale)
    if (remaining === null && total === null) return { ok: false, status: res.status, parse: true }
    return { ok: true, remaining, total: total, used: used, currency: src.currency }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) }
  }
}

/* ── 订阅额度 ───────────────────────────────────────────────────────────── */
export async function fetchQuota(src, key, fetchImpl = fetch) {
  const q = src && src.quota
  if (!q || !q.url || (src.kind && src.kind !== 'quota')) return { ok: false, unsupported: true }
  try {
    const res = await fetchImpl(buildUrl(q.url, key), {
      headers: mergeHeaders(buildHeaders(q.auth, key, q.headers), { Accept: 'application/json' }),
    })
    if (!res.ok) return { ok: false, status: res.status }
    const body = await res.json()
    // 业务层错误（HTTP 200 + success:false，如智谱「当前用户不存在coding plan」）→ 透出 msg
    const bizMsg = body && body.success === false ? (body.msg || body.message) : null
    if (bizMsg) return { ok: false, note: bizMsg }

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
    return windows.length ? { ok: true, windows, currency: src.currency } : { ok: false, parse: true }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) }
  }
}

/* ── 探活（无余额接口的厂商：只验证 key）────────────────────────────────── */
export async function probe(src, key, fetchImpl = fetch) {
  const url = src && src.probeUrl
  if (!url) return { ok: false, unsupported: true, note: src && src.apiNote }
  try {
    // auth 优先取源级 src.auth（'' 表示不带 Authorization，走 ?key= 形式）
    const authTpl = src.auth !== undefined ? src.auth : (src.balance && src.balance.auth)
    const res = await fetchImpl(buildUrl(url, key), {
      headers: mergeHeaders(buildHeaders(authTpl, key, src.headers)),
    })
    // gemini ?key= 形式 200 即活；401/403 即 key 无效；404 也常代表 key 权限不足
    return { ok: res.ok, status: res.status }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) }
  }
}

/** 单源按 kind 分发（缺 key 由调用方先拦）。 */
export async function fetchSource(src, key, fetchImpl = fetch) {
  if (src.kind === 'balance') return fetchBalance(src, key, fetchImpl)
  if (src.kind === 'quota') return fetchQuota(src, key, fetchImpl)
  return { ...(await probe(src, key, fetchImpl)), probeOnly: true }
}

/**
 * 逐源取数：keyFor(src, idx) 返回该源的 key（空串 = 未配置）。
 * 返回 [{ src, result }]，顺序与 provider.sources 一致。
 */
export async function fetchAll(provider, keyFor, fetchImpl = fetch) {
  const sources = (provider && provider.sources) || []
  const out = []
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i]
    const key = String(keyFor(src, i) || '')
    if (!key) {
      out.push({ src, result: { ok: false, unconfigured: true, note: src.apiNote || '未配置 key' } })
      continue
    }
    try {
      out.push({ src, result: await fetchSource(src, key, fetchImpl) })
    } catch (err) {
      out.push({ src, result: { ok: false, error: String((err && err.message) || err) } })
    }
  }
  return out
}
