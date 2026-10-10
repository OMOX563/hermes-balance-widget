/**
 * hermes-balance-widget — token 计价（默认牌价 + 自定义单价 + 今日估算）
 * ============================================================================
 * 无余额接口的厂商（探活层）按「token × 每百万单价」估算消费；每家厂商可
 * 自定义四项单价（输入 / 输出 / 缓存命中 / 缓存创建，单位：每百万 tokens），
 * 任一字段可为空 → 空则回落默认牌价。
 *
 * 数据源：host.state.focusedUsage 的 input/output（会话累计 token）与
 * cache_hit_pct（会话缓存命中率 0-100）。宿主无「缓存创建」明细，故该单价
 * 保留配置位但估算中 token 恒为 0（见 estimateCost 注释）。
 *
 * 默认牌价来自 2026-10 中文社区/官方文档搜索，各注 source；牌价随厂商调价
 * 过期，自定义单价随时可覆盖。
 */

/** 价格存储键 / 今日 token 观测键（与 key.<pid>、obs.<pid> 同构）。 */
export function priceKey(pid) { return 'price.' + pid }
export function tokenKey(pid) { return 'tk.' + pid }

/** 每家的默认牌价（每百万 tokens，cur 为该厂商展示币种）。 */
export const DEFAULT_PRICES = {
  deepseek: { cur: 'CNY', in: 3, out: 6, hit: 0.025, create: null,
    note: 'DeepSeek V4：缓存命中 0.025 / 未命中 3 / 输出 6 元每 M（2026-05 社区报道）' },
  minimax: { cur: 'CNY', in: 7.2, out: 36, hit: null, create: null,
    note: 'MiniMax M2.7 官方 $1/$5（按 ¥7.2 折 ¥7.2/¥36 每 M；M3 为 $0.30/$1.20）' },
  glm: { cur: 'CNY', in: 0.8, out: 2.8, hit: 0.23, create: null,
    note: 'GLM-5.3-Flash：0.0008 / 0.0028 / 缓存命中 0.00023 元每千 tokens' },
  kimi: { cur: 'CNY', in: 20, out: 100, hit: 2, create: 20,
    note: 'Kimi K3 官方：输入 20 / 输出 100 / 缓存写入 20 / 命中 2 元每 M' },
  mimo: { cur: 'CNY', in: 1, out: 2, hit: 0.02, create: null,
    note: 'MiMo-V2.5 牌价：命中 0.02 / 输入 1 / 输出 2 元每 M（V2.6 以官网为准）' },
  chatgpt: { cur: 'USD', in: 4, out: 20, hit: 0.4, create: null,
    note: 'GPT-5.6 Sol：$4 / $20，缓存输入 $0.40 每 M（促销价，官方列示至 2026-11）' },
  claude: { cur: 'USD', in: 2, out: 10, hit: 0.2, create: 2.5,
    note: 'Claude Sonnet 5：$2 / $10，缓存读 $0.20、5 分钟缓存写 $2.5 每 M' },
  gemini: { cur: 'USD', in: 1.5, out: 9, hit: 0.15, create: null,
    note: 'Gemini 3.5 Flash：$1.5 / $9，缓存输入 $0.15 每 M' },
  grok: { cur: 'USD', in: 2, out: 6, hit: 0.5, create: null,
    note: 'Grok 4.6：$2 / $6，缓存输入 $0.50 每 M' },
}

const nOrNull = (v) => (typeof v === 'number' && isFinite(v) ? v : null)

/**
 * 生效单价：自定义逐字段覆盖默认；空（null/undefined/缺）→ 回落默认；
 * 两侧都没有 → null（该字段不计价）。0 是合法值（= 该项免费）。
 * 返回 { cur, in, out, hit, create }，数值或 null。
 */
export function effectivePrices(pid, custom) {
  const d = DEFAULT_PRICES[pid] || {}
  const c = custom || {}
  const pick = (k) => (c[k] != null ? nOrNull(c[k]) : nOrNull(d[k]))
  return { cur: d.cur || 'CNY', in: pick('in'), out: pick('out'), hit: pick('hit'), create: pick('create') }
}

/**
 * 今日估算消费（厂商币种，每百万单价）：
 *   未命中输入 × in + 命中输入 × hit（缺 hit 单价按 in 计，不低估） + 输出 × out
 * 输入按 cache_hit_pct 在累计时拆分（见挂件 trackUsage）；缓存创建无宿主
 * 数据源，tokens 恒缺省 → 该项贡献 0（配置位保留，等宿主提供明细后启用）。
 * in/out 任一未配置 → 返回 null（无法估算）。
 */
export function estimateCost(tok, pr) {
  if (!tok || !pr) return null
  if (typeof pr.in !== 'number' || typeof pr.out !== 'number') return null
  const inTotal = Number(tok.in) || 0
  const inHit = Math.min(Number(tok.inHit) || 0, inTotal)
  const inPlain = inTotal - inHit
  const hitP = typeof pr.hit === 'number' ? pr.hit : pr.in
  const cost = (inPlain * pr.in + inHit * hitP + (Number(tok.out) || 0) * pr.out) / 1e6
  return cost
}

/** token 计数格式化：1234 → 1.2k、1500000 → 1.5M。 */
export function fmtTokens(n) {
  const v = Number(n) || 0
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k'
  return String(Math.round(v))
}
