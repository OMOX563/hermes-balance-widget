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
 *
 * 分时定价（DeepSeek / GLM / MiMo 三家）：配置价 = 高峰/日间价，命中非高峰
 * 窗口时自动乘系数。窗口按北京时间（UTC+8，与本地时区无关）判定；今日
 * token 按「记账当下所在窗口」分流进 base / d 双桶，跨窗口的用量各按各价
 * 结算，估算与展示只差一次乘法，改单价立即全量重算。
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

/**
 * 分时定价窗口（三家，规则来源 2026-10 官方公告/社区查证）：
 * - deepseek：2026-08-17 峰谷定价——工作日 9:00-12:00、14:00-18:00 高峰，
 *   其余（含 12-14 午休、周末全天）空闲，空闲 = 高峰 ×0.5
 * - glm：Coding Plan 积分制——工作日 14:00-18:00 高峰原价，其余时段 50% 抵扣
 * - mimo：Token Plan 夜间优惠——北京时间 0:00-8:00 0.8x 消耗
 * discMult = 非高峰窗口对配置单价的乘数；isPeak(p) 收北京时间小数小时。
 */
export const SCHEDULES = {
  deepseek: {
    discMult: 0.5, peakLabel: '高峰', discLabel: '空闲',
    note: '分时：工作日 9-12/14-18 为高峰（北京时间），空闲 ×0.5，周末全天空闲',
    isPeak: (p) => p.dow >= 1 && p.dow <= 5 &&
      ((p.h >= 9 && p.h < 12) || (p.h >= 14 && p.h < 18)),
  },
  glm: {
    discMult: 0.5, peakLabel: '高峰', discLabel: '非高峰',
    note: '分时：工作日 14-18 为高峰（北京时间），其余时段 ×0.5（Coding Plan 积分 50% 抵扣）',
    isPeak: (p) => p.dow >= 1 && p.dow <= 5 && p.h >= 14 && p.h < 18,
  },
  mimo: {
    discMult: 0.8, peakLabel: '日间', discLabel: '夜间',
    note: '分时：夜间 0:00-8:00（北京时间）×0.8',
    isPeak: (p) => !(p.h >= 0 && p.h < 8),
  },
}

/** now → 北京时间 { dow(0=周日), h(小数小时) }；+8h 后读 UTC 字段，无视本地时区。 */
function bj(now) {
  const t = new Date((now || new Date()).getTime() + 8 * 3600 * 1000)
  return { dow: t.getUTCDay(), h: t.getUTCHours() + t.getUTCMinutes() / 60 + t.getUTCSeconds() / 3600 }
}

/**
 * 当前分时状态：无分时厂商 → null；否则 { peak, mult, label, sc }。
 * mult：高峰 1，非高峰 discMult；label：窗口名（高峰/空闲/夜间…）。
 */
export function scheduleState(pid, now) {
  const sc = SCHEDULES[pid]
  if (!sc) return null
  const peak = sc.isPeak(bj(now))
  return { peak, mult: peak ? 1 : sc.discMult, label: peak ? sc.peakLabel : sc.discLabel, sc }
}

/** 当前分时乘数（无分时 → 1）。 */
export function scheduleMult(pid, now) {
  const s = scheduleState(pid, now)
  return s ? s.mult : 1
}

/**
 * 今日估算（分时感知）：base 桶按原价 + d 桶（非高峰窗口入账的 token）×
 * discMult。tok 无 d 桶或厂商无分时 → 与 estimateCost 同值。
 * in/out 单价未配置 → null（estimateCost 语义）。
 */
export function dayEstimate(pid, tok, custom) {
  if (!tok) return null
  const pr = effectivePrices(pid, custom)
  const base = estimateCost(tok, pr)
  if (base == null) return null
  const sc = SCHEDULES[pid]
  const d = tok.d
  if (!sc || !d || (Number(d.in) <= 0 && Number(d.out) <= 0)) return base
  const dc = estimateCost(d, pr)
  return dc == null ? base : base + dc * sc.discMult
}
