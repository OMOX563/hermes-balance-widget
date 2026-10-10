/**
 * hermes-balance-widget — Hermes 桌面多厂商余额挂件（单文件构建产物）
 * 由 build.py 从 src/ 组装生成，勿直接编辑。源码结构与出处见 src/ 与 README。
 */
/**
 * hermes-balance-widget — 九家厂商取数模板（多源版）
 * ============================================================================
 * 结构与字段语义移植自 dsh-whale-widget 的 API_TEMPLATES（MIT © MeteorNOX），
 * 按本插件九家清单裁剪；mimo 模板为实测自写（原版无此厂商）。
 *
 * 每个厂商 sources[] 可挂多个取数源，订阅与按量付费分开成条：
 *   kind: 'balance' —— 按量付费真余额：balance.url + json.remaining 字段路径
 *   kind: 'quota'   —— 订阅额度：quota.url + 窗口结构（简单字段 / windows 数组）
 *   kind: 'probe'   —— 探活：probeUrl 验证 key（官方无余额接口时的如实兜底）
 *
 * 源索引即存储约定：idx=0 用 key.<pid>（兼容旧存储零迁移），其余 key.<pid>.<sid>。
 *
 * 字段路径语法（执行器实现于 balance.js）：支持 a.b[0].c，可选 scale 乘数。
 * auth 模板三种：'Bearer {key}' / '{key}'（裸值，智谱风格）/ ''（不带 Authorization）。
 * headers 额外请求头（如 Claude 探活的 x-api-key + anthropic-version），值支持 {key} 占位。
 */

/** 存储 key：第一源沿用 key.<pid>（老配置零迁移），其余带源 id 后缀。 */
export function srcKey(pid, idx, sid) {
  return idx === 0 ? 'key.' + pid : 'key.' + pid + '.' + sid
}
/** 今日已用观测 key：同存储约定（obs 前缀），保住已累计的历史数据。 */
export function obsKey(pid, idx, sid) {
  return idx === 0 ? 'obs.' + pid : 'obs.' + pid + '.' + sid
}

export const PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    sources: [
      {
        id: 'payg', label: '按量付费', kind: 'balance', currency: 'CNY',
        keyRef: 'DEEPSEEK_API_KEY',
        balance: {
          url: 'https://api.deepseek.com/user/balance',
          auth: 'Bearer {key}',
          json: { remaining: 'balance_infos[0].total_balance' },
        },
      },
    ],
    apiNote: 'DeepSeek 无订阅（Coding Plan）接口——/user/subscription 等实测 404，仅提供按量付费余额',
  },

  minimax: {
    name: 'MiniMax',
    sources: [
      {
        id: 'sub_cn', label: '订阅 · 国内', kind: 'quota', currency: 'CNY',
        keyRef: 'MINIMAX_API_KEY',
        // 国内端点；2026-10-08 用真实 key 实测返回 5h/周双窗口数据。
        quota: {
          url: 'https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains',
          auth: 'Bearer {key}',
          json: {
            remainPct: 'model_remains[0].current_interval_remaining_percent',
            weeklyRemainPct: 'model_remains[0].current_weekly_remaining_percent',
            resetAtMs: 'model_remains[0].end_time',
          },
        },
        apiNote: '仅对 Coding Plan 订阅账号有效（资源包账号报「不存在 coding plan」）',
      },
      {
        id: 'sub_intl', label: '订阅 · 国际', kind: 'quota', currency: 'USD',
        keyRef: 'MINIMAX_INTL_API_KEY',
        quota: {
          url: 'https://api.minimax.io/v1/api/openplatform/coding_plan/remains',
          auth: 'Bearer {key}',
          json: {
            remainPct: 'model_remains[0].current_interval_remaining_percent',
            weeklyRemainPct: 'model_remains[0].current_weekly_remaining_percent',
            resetAtMs: 'model_remains[0].end_time',
          },
        },
        apiNote: '国际站（api.minimax.io）独立账号体系，key 与国内站不通用',
      },
    ],
    apiNote: '按量付费余额仅 Admin Key 可查（/v1/account/balance，API key 实测 403 token_type_mismatch）→ 未接入',
  },

  glm: {
    name: '智谱 GLM',
    sources: [
      {
        id: 'sub_cn', label: '订阅 · 国内', kind: 'quota', currency: 'CNY',
        keyRef: 'ZHIPU_API_KEY',
        // 智谱此接口鉴权不带 Bearer（裸 key）；data.limits[] 为扁平条目数组，
        // 5h 窗口不保证排在 [0] —— 按 type(+unit) 选：unit=3 → 5h，unit=6 → 周。
        quota: {
          url: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit',
          auth: '{key}',
          json: {
            windows: [
              {
                key: 'rolling', label: '5h',
                pick: { list: 'data.limits', types: ['TOKENS_LIMIT', 'CREDIT_LIMIT'], unit: 3 },
                percent: 'percentage', resetAt: 'nextResetTime',
              },
              {
                key: 'weekly', label: '周',
                pick: { list: 'data.limits', types: ['TOKENS_LIMIT', 'CREDIT_LIMIT'], unit: 6 },
                percent: 'percentage', resetAt: 'nextResetTime',
              },
            ],
          },
        },
        apiNote: '订阅（TOKENS_LIMIT）与按量充值账号（CREDIT_LIMIT）同走此接口，按 type 自动识别；按量付费余额金额无公开接口（候选路径实测全 404）',
      },
      {
        id: 'sub_intl', label: '订阅 · 国际', kind: 'quota', currency: 'USD',
        keyRef: 'ZHIPU_INTL_API_KEY',
        quota: {
          url: 'https://api.z.ai/api/monitor/usage/quota/limit',
          auth: '{key}',
          json: {
            windows: [
              {
                key: 'rolling', label: '5h',
                pick: { list: 'data.limits', types: ['TOKENS_LIMIT', 'CREDIT_LIMIT'], unit: 3 },
                percent: 'percentage', resetAt: 'nextResetTime',
              },
              {
                key: 'weekly', label: '周',
                pick: { list: 'data.limits', types: ['TOKENS_LIMIT', 'CREDIT_LIMIT'], unit: 6 },
                percent: 'percentage', resetAt: 'nextResetTime',
              },
            ],
          },
        },
        apiNote: '国际站 z.ai 独立账号体系，key 与国内站不通用',
      },
    ],
    apiNote: '按量付费（充值余额）无公开查询接口，四个候选路径 2026-10-10 实测全 404',
  },

  kimi: {
    name: 'Kimi / Moonshot',
    sources: [
      {
        id: 'payg_cn', label: '按量付费 · 国内', kind: 'balance', currency: 'CNY',
        keyRef: 'MOONSHOT_API_KEY',
        // 大陆站：余额为人民币（充值 + 代金券合计），v724 原版实测 200 且字段命中。
        balance: {
          url: 'https://api.moonshot.cn/v1/users/me/balance',
          auth: 'Bearer {key}',
          json: { remaining: 'data.available_balance' },
        },
      },
      {
        id: 'coding', label: '订阅 · Kimi Coding', kind: 'quota', currency: 'CNY',
        keyRef: 'KIMI_CODING_KEY',
        // 原版模板（v724）：usage.remaining/limit 为剩余额度对，resetTime 重置时刻。
        quota: {
          url: 'https://api.kimi.com/coding/v1/usages',
          auth: 'Bearer {key}',
          json: { remain: 'usage.remaining', total: 'usage.limit', resetAt: 'usage.resetTime' },
        },
        apiNote: 'Kimi Coding 订阅独立 key（kimi.com/code 控制台获取），与 Moonshot API key 不通用',
      },
      {
        id: 'payg_intl', label: '按量付费 · 国际', kind: 'balance', currency: 'USD',
        keyRef: 'MOONSHOT_INTL_API_KEY',
        balance: {
          url: 'https://api.moonshot.ai/v1/users/me/balance',
          auth: 'Bearer {key}',
          json: { remaining: 'data.available_balance' },
        },
        apiNote: '国际站（api.moonshot.ai）独立账号体系，余额按美元计',
      },
    ],
  },

  mimo: {
    name: '小米 MiMo（token-plan）',
    sources: [
      {
        id: 'probe', label: '探活', kind: 'probe', currency: 'CNY',
        keyRef: 'MIMO_TOKENPLAN_KEY',
        probeUrl: 'https://token-plan-cn.xiaomimimo.com/v1/models',
        auth: 'Bearer {key}',
        // 自写模板：2026-10-08 实测 token-plan 端点常见余额路径全 404、响应头无限额字段；
        // 2026-10-10 复测 dashboard/billing、user/account balance 等 8 条路径仍全 404。
        apiNote: 'token-plan 端点无余额/计费接口（两轮共 12 条路径实测全 404）→ 余额「—」，今日已用按会话估算',
      },
    ],
    apiNote: 'token-plan 端点无余额/计费接口（两轮共 12 条路径实测全 404）',
  },

  chatgpt: {
    name: 'OpenAI / ChatGPT',
    sources: [
      {
        id: 'probe', label: '探活', kind: 'probe', currency: 'USD',
        keyRef: 'OPENAI_API_KEY',
        probeUrl: 'https://api.openai.com/v1/models',
        auth: 'Bearer {key}',
        apiNote: '官方已下线 billing 余额接口，无「用 API key 查余额」的公开接口 → 余额「—」，今日已用按会话估算',
      },
    ],
    matchIds: ['gpt', 'o1-', 'o3-', 'o4-', 'chatgpt'],
    apiNote: '按量消费仅 Admin Key（OpenAI 管理密钥，控制台生成）可查 GET /v1/organization/costs → 未接入；普通 key 只能探活',
  },

  claude: {
    name: 'Anthropic Claude',
    sources: [
      {
        id: 'probe', label: '探活', kind: 'probe', currency: 'USD',
        keyRef: 'ANTHROPIC_API_KEY',
        probeUrl: 'https://api.anthropic.com/v1/models',
        // 探活需 x-api-key + anthropic-version 双请求头（2026-10-10 接入，此前无探活）。
        headers: { 'x-api-key': '{key}', 'anthropic-version': '2023-06-01' },
        apiNote: '200 即 key 可用；余额/消费需 Admin Key（cost_report）→ 未接入',
      },
    ],
    matchIds: ['claude'],
    apiNote: '官方无余额接口；用量走 Admin API（需 Anthropic 管理密钥，控制台生成）或控制台查看',
  },

  gemini: {
    name: 'Google Gemini',
    sources: [
      {
        id: 'probe', label: '探活', kind: 'probe', currency: 'USD',
        keyRef: 'GEMINI_API_KEY',
        probeUrl: 'https://generativelanguage.googleapis.com/v1beta/models?key={key}',
        auth: '',
        apiNote: '官方无余额接口（配额在 AI Studio / Cloud 控制台）→ 余额「—」，今日已用按会话估算；探活走 ?key= 形式',
      },
    ],
    matchIds: ['gemini'],
    apiNote: '官方无余额接口（配额在 AI Studio / Cloud 控制台）',
  },

  grok: {
    name: 'xAI Grok',
    sources: [
      {
        id: 'probe', label: '探活', kind: 'probe', currency: 'USD',
        keyRef: 'XAI_API_KEY',
        probeUrl: 'https://api.x.ai/v1/models',
        auth: 'Bearer {key}',
        apiNote: '官方无公开余额查询接口（额度在 console.x.ai）→ 余额「—」，今日已用按会话估算',
      },
    ],
    matchIds: ['grok'],
    apiNote: '官方无公开余额查询接口（额度在 console.x.ai）',
  },
}

/** 九家的稳定顺序（设置页与挂件展示序）。 */
export const PROVIDER_ORDER = [
  'deepseek', 'minimax', 'glm', 'kimi', 'mimo', 'chatgpt', 'claude', 'gemini', 'grok',
]

/** 单源层级（UI 徽标用）：balance 真余额 / quota 订阅额度 / probe 探活。 */
export function sourceTier(s) {
  if (s && s.kind === 'balance') return 'balance'
  if (s && s.kind === 'quota') return 'quota'
  return 'probe'
}


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
  deepseek: { cur: 'CNY', in: 2, out: 8, hit: 0.04, create: null,
    note: 'DeepSeek V4.1-Flash：高峰 输入 2 / 输出 8 / 缓存命中 0.04 元每 M（空闲自动 ×0.5 = 1/4/0.02）' },
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
    discMult: 0.5, peakLabel: '小楠梁时段', discLabel: '梁圣时段',
    note: '分时：工作日 9-12/14-18 为小楠梁时段（北京时间），梁圣时段 ×0.5，周末全天梁圣',
    isPeak: (p) => p.dow >= 1 && p.dow <= 5 &&
      ((p.h >= 9 && p.h < 12) || (p.h >= 14 && p.h < 18)),
  },
  glm: {
    discMult: 0.5, peakLabel: '贼时段', discLabel: '一哥时段',
    note: '分时：工作日 14-18 为贼时段（北京时间），一哥时段 ×0.5（Coding Plan 积分 50% 抵扣）',
    isPeak: (p) => p.dow >= 1 && p.dow <= 5 && p.h >= 14 && p.h < 18,
  },
  mimo: {
    discMult: 0.8, peakLabel: 'bug时段', discLabel: '雷峰塔时段',
    note: '分时：雷峰塔时段 0:00-8:00（北京时间）×0.8（日间为 bug 时段原价）',
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


/**
 * hermes-balance-widget — 右下角常驻挂件（Phase 2.5：弹窗化 + 液态玻璃）
 * ============================================================================
 * 交互：点角色（Q 弹按压）→ 弹出液态玻璃信息卡（日间白 / 夜间深，跟随
 * --theme-background-seed 亮度）；按住拖拽贴边吸附；卡内刷新。
 *
 * 功能（自原版语义移植）：
 *   - 模型自动换装：订阅 host.state.model，按关键词（不分大小写）匹配
 *     九家厂商并切换角色与取数；未命中回退配置的 mainPid
 *   - 余额预警：低于阈值 toast + 提示音（触发后回升复位，避免刷屏）
 *   - 今日已用：本地观测余额下降累计（充值不冲掉，跨天重置）
 *   - 每轮消耗：订阅 host.state.busy / focusedUsage，按 cost_usd 增量结算；
 *     cost_usd 缺失时回退「token 增量 × 自定义单价」估算
 *   - 今日估算：无余额接口的厂商（探活层）按 focusedUsage 的 input/output
 *     token 增量 × 每百万单价估算今日消费（cache_hit_pct 拆缓存命中部分）
 *   - 分时定价：DeepSeek/GLM/MiMo 的 token 按记账时所在窗口分流 base/d 双桶，
 *     非高峰桶估算 × 系数（详见 pricing.js SCHEDULES）
 *   - 任务结束音：busy true→false 播 chime
 *   - 随机语句：分角色语句池（每家 ≥5 条社区梗），弹窗底部轮换
 *   - 音效与提示：WebAudio 合成（按压 pop / chime / warn，音量可调）
 *   - 大小调节：--hbw-s 缩放（基准 124px 角色高、宽随 bbox，scale 0.6–1.6）
 */

const STYLE_ID = 'hermes-balance-widget-style'
const ROOT_ID = 'hermes-balance-widget-root'
const POP_ID = 'hermes-balance-widget-pop'
const POLL_MS = 60_000

/** 九家形象 data URI（build.py 注入）。 */
export const MASCOTS = {
  deepseek: 'data:image/webp;base64,UklGRixHAABXRUJQVlA4WAoAAAAQAAAA8wAAygAAQUxQSBgWAAAB8Ib9sypL7f+9q2r1DO7uLsHd3V0H4gafuCtxNzS4xAWHIQbxgSiuH5wM7ozAGHN61ar3g9O9e3ef3c3TiJgANKkCh153/1N84f7777//wUz6A9/eBIo3qiIABNv9hb3PmQIFoMneaGgCVDWt+hKzl8Io44OM0uaspawlCkD0jYQokJYCDIdwjL0X7goA6373QMDeOBiww5fue/HHW7b2/10pNbC8dP6U1XZ6mbxhU9gbBDEse34hyTn3s4+zX2a7cPZxMH0joILDHiVzCSej1BTuZJBOPxkwHfkUdiHpQZJR2McIkozgeWsDKqOdYf0bGYWDG4UzLj0Io71i4yeYOdhO8lfLqoxuKqs+xcxBj1z4K+joZvgpMydg8QcsJRnNRFT/VXxC8BaM6gZMxkc5IYLP7nHS0SIyehnSUtj2xoiJ0PlXojJqGfa9e/oFCxicmFE885eaZLQynPg6SRZO4DZ/DBupFLsvpEcOTujMk2EjlOiiD9I54UvMXl11dDJ8gc4GzDwPk0YmwSozSjRBxML9YKNSwreY2YgR7fcjjUaCyU+wNAMj+GGkkciwUy5synAeDxuNDqY3Bku8tB50BBLVaSyNQedNLZPRR7HzHyKag5nfgY08itPZrOE8BDriGLZn8UZh4bNLiIw2CWdHZsM6vwgbbaR1O0vTRJm/nugoI1hhFqNp6LwQNtosP6OBIhasKzrSLPdCNA+dZ8BGGKjeytw8Ea+tAB1lcPCLjMah87tIIwwEq9zN0jgRM5YWGWE0rf1iROPQeYxMVhlZEn7KzCa6AiOsyvoLSjQQY+y207dbftKIYriImU09NudkpFFEZb25EQ3lr3PB5tBRxHAunY39/HFQjKCKdeZENFPEnB+vAcUomvBZOhuKry2HhFFUxO5jaSgWTlEbSQyHlMKmzjwPo4noNHpjOX87mijWeo3RWIV3LyoygiR8hM7GDr64JEYRTdc3GeP1baCjh2CN+Ywm4/6w0cPwjlLYaPtZGj2SnMvcZJmnACYjhihuZmmyiOffvxxERwpVfDQKm/6pkwQmo4NCz2Ww4cPJv+4F6KhgWP0mFjZ/OMupi8JGA8U699I5FD04bX3oKCBY5n5mDsvMl3eDDT+xRW9m5vB0vroVdOgZLmLmMHU+sorokFO8nZnDNfNK2HATrDgrypChj20NbSxLg5DwZTqHbeEBsKYSDKTh0jJ0Cp9fRqShBAe/HZABOIo5hktkHgtDMxuOJS9U7RsUpzMPF+fnYGhm0WWfijHujP6L4pv0YVJ4BpI0lOEUeo7TBgCiuIg+PDz+CRM0s8r6c0oUPrbYAEB10jMsw8Iz95GEhk64hM5grDsIMLyTHkOCPA+KhjbsESXIiD0GAi18iGUoRPztfSrSUIql72chmXnyQCSsc3XEUHD+EkhoZlG7ks4OnxmEhM2fYOFwDN67O0yayBSXsM1OU/unhv1mMnNYFr7+bsCaJyFNZWaXa/pmwCfIwuHp5E+WhGqzmGCTv9M5KGJY/XJG4TCNwmffDSRpDDEBPvganYNiwJRnWThsnbxia8CaQRKAo28lnYNiWOFHpHP4hnPhmWtAJp5oApY68l9kCVb6VD8Mb5vOUjiUnXz2rdAqlmzwxACs9dkHyFJYOfPkPijeQzqHdWTya7AKAEQGSxJgW542iyyF1SNi1/oUW70eziFevL0dtJNM/vC39gZkkAxY4t23tEkv7DXI9etL+CQXcphHm8fDOhgOJHluCzYwKljhs4+QzMHegy8uV5/oyncxinvxEsMnvJD/nizSIeGbvrDwN4vABsSgb3+c9BKss/Am9FGw+i/HOMSf+8EyEHQ5k5mZt2+Clg6AGDb9B5kLa848W/oAAbba97OX3nzzbXnYlLjtmP1WQsWEU5nJzKd3BMxEpC+iOOo55sLaPd6Mvoqh8yEsw+bJLQCTKj8cR+fYt9fFeDNLNj6lZFJNFN8infUH567YH0AtmU7CGfThwuDMjWCo8hE6SRZy3oWHLbHEZPQoJt3E9Of0wj4W3j5Z+zS+hbewcNg6/7cStJthT8Y4hpN88aUnp06deuE1U6dOnfrp931wHwAw7ZRwAdvBfmZ+Gql/hm3meAyFiCp0TltapYvI0o+xjCMjF/b84A1HLAnYOMU3mdnXiAWbQPtm2PJZFg7hNi9G6gLFH+idSEYUd8/Z3T3nHCSnX7IpVKDYhCX64/FbKPptWO0RFg7DwltvYanCzI/DuiR8rlLvxZ2c/wVADb9iZn8LD5PUL8Na99E5FJ1Xn0KvFGXhetBOik0WMuojWZz86RLAKnMi+uO8axFBnxXrPEpn9dJYhdMO9lKJhf+erNIBqjeG94WMzL8spacws1/Hw/okuupddA7J4P82fYlRiZknIXVKOIqlT+QYL8Hf6f0pvCOp9Cnht8zssfzTm2vmZk/0Usr/lhbpILLE9Cj9ilK+8CKjP16OhqG/ho9GZq/5fQubqvCudGnkanT+ENYBCd9n7tcgOs+Fob8qW88u0UPwsSOiqTz+jA/Se4h4dXlIB5UN5pXoX+lTlFfXFu0XbqGzxxxXLDWH0VD8BNaYwajGzI9J6gDDRcz967fz7TD013Aknb0Wvgs3hzdSlFfWVvyU3oPHb6Gd1NZ42MvEcl6ChD5rur234DPL4LNsN1LmDzAJ+3jpIfjc4pAOMBzH9oQqvG8plT4ptvLCXjPPR1r+SeYGcj6ytCr07ig9BHeBdUKSXzJPoPD528DQ54RvMPdUxnZGC9u+yhxNk7lwcygSPkGvxhzvROoiuuRd9ImT+X4Y+i24jaUX55+gMOx+Hxs2nPPeAgMUa82O6IEfrgDD5q+wTJQ2z0BC/+T+3krZUwwwLPa9FyKahPzbVjAAMJxB7+XzVWDY7mX6xMj8MUz6plgvM3pw3iIiAEzwIXpzBO+aIjCMV1l7fkQl55RKSNj7NfpEyLwQKhiA9XuKUvaEYXyynzVJiRvfBENnw0n0KkHfAFoFhh1eZB68zHOhggEUe5ilmvMGKDoarmoSBhdsAO0khjvpFZw3qaJ6wpZ30GOwwvlDmGAQDdfSK4X7nrBmYpsnIHWCyo4LPLqVOBzWAwxLXUN6DFAEz4IKBjLh5KjmPAeGzklOaRaPYyvA8CXmLs4/wdCzAv/3AukxKIXl0zDBYAqWmR1RofD/l1Hp0sJbGoaVkPArlk6FOyD1BlGsdPps0mMgCue9FSYYVMNX6d3C824wdBaseFOUZjmxkpj8nd7lbIX1Bhiw3s/bZI7+Fb66LxIGV6T1FEuXMX4ZCZ3FlryHhU1a2rurVYDpWgsixrHw9ysj1QAxYIufLSQ9+lT48g5IGORkx7W7ZP60pehqOIdtNqnzX4BWSfhuKezsfOZgWA2AGLDFebNJj34UvrwtEgZYEvCm+RHjCn+hIl0U6871aJQos07fENLNcBRLkMVJ0jn2cajUAKgB6501m/T6oszdHgmDqwlY5uvPRJBk4dmqgq6GK+ls3Bn7i3VS3eCVUsggo5Aswa9BpA5AE7Dh2bPJqMv5XrQwqGIKLPPVx9g18zPSQleVrdrOxl3IP6OL4QZmsvB3Z5EeZDgvmyxSC6AGbHRtptfjvAEJA2oKYIMvTSdLMIJk4aOoaLiaDVTiTkgHwwHFgxHProjD7ic9yMyrVaUeQA045BV6HREz1lUdCDEBVnzbVa+RXlgyxwfnrA7pZNimlGgg3tVJdNI9dLLwA5iEyae8SDqZeaEkqQlQwxb30mvI/CYSBtEA7PLlp0jmUryQnEGSzpOQul1HZ/N6/BE2LuEIOhmctbKoASt+ZRZLYean0KoNMKx0A0tvkbcUHQATpKP+TjJn90Ly0V/ussV8BnN8qIthey9s4MwPI41TXBNOOk+HAWLARpeRhTm/Dak+GNLfWHpxXglD38WAg6aR0W47Sd599ZHLAXI7C50Xw7r8lLmBSjyzuAgAxWbtIFl4gBgASALe9jxLxLyDofXBsOoLET29FalvBhz2V9LbJDn9wc/tawAs4e90Oq/vpLLxwogm4j5QAEh4D50sfGJZyDhAFavfwRKcswq0PiR8hd4DuSW0T6JY5+dktMkZV3/whEUBwEwgmNbhqk6Ga+lsXud3oBhv+AUz6bwRgu4tbDOrhPM3LZX6VNadx+hli34J8LbnGMU554NLY7yZAIDYzXRmfgYJgOHo4mxe5/lI6Ci4iT7uX1IFCZ+nM/NdsPoE9iBLteCufRKZ9Gsys/ChTQFNJuissumCCDpPgAGiSz7J0kDBHcW6/aXTP1EJhhvppTzW0vpgchm9WuYnkPohadLl9MLCu5dDElRNOIXO4AuTIEDCYYxooMzTUGFaXQeysPBoWB9wUW8f6Y/hF2yTURZsgITKKuvMjKDz5zDAsOEzJdjAXm6BdjKczzzuHz1A9Ua6x22Lm9Qlkv7L0suX+mJ4PzPJwi8ioXoLF9IZ/vqGUBjWm85gE4/xdFi3w0sZ91/rIeEYFgZ3gtWG1v96cf4GVp9h7+xBFj7aUqk2CScwk2O8AIaEdR+js4kLpy2m0klk0vQoDL66qmglxVqzGTnO6sfkR3opvHsRqU/1ZjpJ55eQUFUStnwu3J13r6piWPcROps4eNnyEHQ1vJNOerwPVkmwyHSWwqdXFKlJsWmbUS04eylIbTicTjLY3kC0ErDfMywkr1sVYlj3UTobuXBPJFRUTGM7Ch9ZRKUKVH9LZ+EBsJoMBzDYQ7y+JbS21u3d1kUVkTV/TpJPX3UioIoNHqOzqY4Qq6SrPczwzA8iVTJcSmeOTyPVlPBZ5h7oPBJW2+aMIFl4/2SRCoqD7/jzt47faSVARGSlR+hsaOd7kapAsPL3xsjy4hrQKtK6k4XO66E1Ka6i95L5HaTaPhSZHe4wQZ1mAsUNzGzqzLN7gADbfvMB570riXRTrDGLQectkHoEiz/J6O20PlzBDsEFa0AriWoyEwCG/ehs7MI7FD2KATjo/6a+B9bNsBeDdP67LsOeJdir8zrR2q7tEr6zWKWqhusiN1dwwTrQaoAaek34MvO4/9SV8C3mngrvhdR2dSdmnopWPYpVZzGai873IvUCwJJWUruTZdx/axJZ9F6WGp5YUqSu33Qp8eTSqrUk24HBRvsVrIYeDcdGIZl5AawWk60Z0VOQG0Pr+nx0ovO3SFKH4rBmK7wzifRHZeknOjhPqCnhrMisoWxY36aM6EDnD6DWm9g35kSjBResB+2LGqaykGRwj3pU1pnJqCP6MOkOeicWnq8w7cFwCpve+RakPkgCzqGTZOH/LypSR8KH6RwsvIU5OtH5l00BqyRY+YVSGi7HFbDa1IAVfkLneOcFMNRpemfUweBusLoM57Pdhc7XztkAIhWSvo/Ohi+816QmMWDlLzzNwvFRFm4MrcPwSTrrdL4ZqS7RdD29dGIhZ30UIt0m4aPReMGFG0FrUWCjLz9FOjtmng1Djaprziyllsz31QeRxS8ki8c4hpO/bJl0amHjRyOajs7jkOpQrPbtWaQHO2beklTqSLiUmTWd1AcIcOI9JH0cGW2eDR0nil2fYbD54thaDFNmkF7YOfPZdaCo0bBvu8QEgCjskOsXMGIcwxduDgUE+PRcFg4BnliHYUpmDnZ1PrEZDDWqLv8MC+v6QF8AA7DzX8gyjpnfRYLoipeThc0fPrYDrCfF/u0o7FoKp64NRZ0Jv6Cz5sIDYH2BmACHPsMyrsRNECScw7HgEMz8BAy9iiz7PJ2dI5NfAhR1tvApOmsOxjrQ/gBQxQb3sYzjXR0uKZlD0HnbIio9Gb7AzM6FfHA/qKLOhMNYog8bDQCQsPqMCLLENCgSfsJhkPnsWlD0KrL4E1E6ORecvTQMtSZsOTMK+7DhQKCFH9HJzG8iIeFj9MaLzFd2gWlKSSspthoLdnTevSNgqDXhTc+xsA8ckKTvZ2aUeRtDkXBU4xUnH94cCR1FKiR8gt7B+e81kAS1trDpM3TWX/jIZMEgtnAqM9s8HwYkvKXhvJDzLloWQGvzd73zPZugasKnOxXeuyIS6k3Y5Ck6+3IXBkESVpwR2fngmqqAYY8cjUY+fPr6wPZfvf0BJznvP2+CdlFs1Q6SEbPWhKFWSdjzKTr7c/dAAIteXzJ52QoQAIqV5zDIaKoF1560LFr7/c5J0j2Tx8K6CBabHoV0fg0t1GrA2woL+5p5MVLfRNZ8270kbzkOUFSIYDMX3gYsetLtJL2UIJnLV5G6wPA5OoPzVxGtQxIW/05hYb/OHADF3rc98LdP7gtAMN6wRy5OPt9Mzj+23n43GSXYOfPCKiLLPB+l8GZT1JiAfe9iBPvsfA+sbxUNnROOY5tjU6bQmyj44p/JUlgx8+wqMLyPpc3fw3ozYMkzg85+R8xfHzoAKpBk6C5Y6Xnesx9OaabxUVg588JKULyvTb++JzGBvvUBRmH/+NKSkAHoXbD+QZNhP2+qKOzR+SVYFRgOf5WvLAGpogbg8DtJ5wA6/6qKiWrpNpZm6r3w6B5gWOfHr50H6yJmQGvKjaQXDmLmV5AmhprCHhoSEfM3h1aDAmvuAAEgmgzAm755DxmFg+l870QBBCs8W09E83DWij1BDYBYUgBY6e1XFtKdA9veBDpRFNuRUUcDZ14qhp611RIAWGSrr/xkNkkvHNjChxQycbYqdQSfmc5oGI93IlVSNVUAmLT3u3/9/EKSJXOQM7+OhImzddThPPXn9GYJzlwe0kU0KcZveNR5dz7M8dmDg13KLrAJtFUtwU0+zdwshQ8s2knMAGDzbd/35z/NIclwj+CgFz63NGQCbccaPP6GbzRN5lkwQEwALL/NqddnjncvhRMy8xcwTKAVnq+h8Ag5gaVpvoFkBmCloy96rpBkcQ9O2MIjJ5KI3MzSS4mHlsJujKb5srWApU+4dCZJugcndPCpZSATBwlfp/fifB+wS9M4rwd2P+tZkpEjONGd18AwgRVbLCxRrcQrKyk+ytIswekHTw2yeLAJC0+cWFBcTq+W+W608C96s5BB0oPNGJy7CnRiyRZzPaq0eQ5M5O/Nw/BgUzovhmFiG05lrpD5HzNR/LmBGjRi7sbQCaa6ypMsXZyPrIWU0HqEZXTJ/CUME92wBz06ZP7/6mgBy57GwtE1uL9MPBi+xnaQkfnk+kjY9rznGRxdS9w+SWTiIeFSenHy9+tC7DtjZOEow7choQHFFv8VyefeB9iqfyc9OMKWeHRJkSaAAPsedcRKkBbO5FhwpHV+AIZmFAUAE13hJQ+OtCUeX1ykIQAzE7SwNQtHW+cxMDSqYZUfxYjjvEEMjWpY+SEWjrThY5ujWQwr38rM0db5FRiaVLHGf+kcbQsfb6k0icpS9zJztA1vbw9Fg6piKtsccTNPRUKDCvATOkdc5zSYNIjYIj+lc8QtfGFVUTSnJPyKmSNulHl7wdCgCV9h5ogbme+EoUET3s4co47zAiQ0qGGvsRIccTOv1CQNotj4RRaOuM47FxdBc6qs8AQLR1znQ2tB0ajX0TniFr64EQwNqnY6M0fc4Avbw9CghiPpMeJEmb07EgYbVlA4IO4wAAAQlACdASr0AMsAPmEmjkUkIiEXnS24QAYEpu4MABYuf6T+AH6zf2ZNEM7uhG95D/0O+TtHzqHx/SXt6fNn5rfpz/t+/Pb0D/h8Fg/sH4ze5/vU/Kflf5x/jXzz+C/uv7betr/meDDqLzX/kn31/U/3j0n/6Phb8hf731BfyT+kf7b7c/jZ+t7SjYP9f+zvsC+3/1z/gf4796v9d6U3+l6H/YP/u+4F/LP6l/sv7t+7v7//Wn+//6ni7fhv9N/3v938AP8v/rP/J/xf5D/TD/Y/+D/T/m/7XPzz/J/+X/T/lf9gn8s/qv+8/vX+a/9v+f////6+8X/ue5H9wvYw/XL70nColPPQHtFxE2iT/4MG57HbZxbrjvIPsACKogBeOqnH0HGOthemv288PD3uwNeHrWF+pGS7Pq9aNr40EfK2zJoVLeqdWdmgnDur+USxD1Wuhb+3q5+TcdhGKrbRsu8wnBblMqWKUxlUw+V23zIwhK7DIgGiW5uZjq2bZ5rkF3nv/2hGiPHvrOpj5Qy4RrRFwH3qWoS3i4kBRGUtgrRf7GXeUyS1tRbBGjMUVjqD5t+A7fKEA5PnR2MIRRGYaQm9saVMEkV/Yi3ZLDGxP32Ib0P7JJ5aEuVSm083Hz7NI5JVGgxo+GKPGxzLOWIhraa+L6r+vEbIKwMHqFWF1jNeWHEq/xcgQyKri8R7hHnYFnZvc7M6TFJT7IFmrmOG7xdbZr2XpzUl66gXK9ffMn7V/VSs0J7yNYbiRSRC0ohMWA5rnE4uS3CB1KeqZWiIC/KFav6vbBFQPyHNkijxZQq9APEwLG5lUNwxvXFkafa4uUCcp92ASkh4tKKTAErpfsdoQj83VAkxPFAtCNu6pnsiwKgfN/gTAfm1l/RINm2hB9D6ZwnkELdcA4807nIi9HCR+ciPpAcJd9O1wIRrt/+P/UYAgqv4SH/rHli6Z7YWMrW4yY4bPOD1tv4d7jXzRVqrfyDHj/UW78+Y3b2VE7S4DpYDRUhYfvGzQOtFDWLZgXuaweEmexdLQJvc6a1Fi0+qYwdJsRUf9rq9IDFihjrTQcePWUMVrHc4X+9Q/3HFsl0/9TEHX1pfh1I+gQq3QCW+1sANKwxjKMzmC5YWsUwQfoxXkGsMbvwX/WswcN3LncYWVzGvM7F0BHg7UDVyG33IqPNsnwnMikaf8hzxLBwPCe11jtUVg+XIFjXwPFEkr7zT7gfcoGN8taVNrpHoAfq5qoUOLJZ2HfeFKXNhDTCJHYVneoa2D7AkjCP3dSmoYT+JU6bxDvbxWAnfZHgDz5kLhDpnEFsDqrni0dD/tScWc74R+Dqc3PxS/QFujTaYBDWKNdAsswMbeCddfXtCnJ8CSq8KWCcYYqGuOztbMailsfs8pt+Z724lsERgNOBOJcnk/M/9QgOMSQuAj01KcWDTaKQ5BpWq5arZ/QAdP41EZjjtYSJRDJVJCeU5oeyOuJ1YlLIqeNtjpQYyZoX4sfM6pvqhr814oP6qHJ8MEPgLF/XO6m0r8pR6MxJNDb0ftqE2S9uxbOvZLjS+H2q87PTTioV6ZTnOciwOqyGsWzLqUpF5EqSHWl6OAAD+7npD+r6lw2Ei7aWoZ/fZoQhZkxnGVgd/W2ApmG/jUiwEaoXPnXY9jsJSz8bTAjV4iK5iaHyZ8YleHLHXGd06pgAf5/xvPI515VL9rzZ8KhEI+WcvBB+QDuOtABWNdJYB4PrR4iYmUrS1bHLV3IAk0f8mQ0sLcb5g/rcoaIrXbU2q/Ajca6wR82FIf3cOZmNIurRCO8+JuIankyNAklGBKS6ir+FJ4FuW1/uojHp04lD/dOQZWMfQM3hCwxYcUDJVK7Cr62luzH1UyFM4LYuYL8qtGyr7Dzx4g3nwQ2WoaMyyZQ4ch8slPLKs0dn71kKub/wgpkKcei/0aQI2J3kUjI07hsHubQJiy0Q0PfLTko2aiPbg9kUL498wP+H5dtVAlLQc5Jc0p4BA67OS7vTL2rydKDnzzD2reNRnuaKROUeZ1vUGdZgnGKVjxM+MPC+K9i3OtezY1HN2h3lpZZ0QgCVoENrONNMm8KfkyvD/Bmz2dMff06/z+QUiTz2u82ENA+EuwaUXdD8q/0ZhAkbIRau0RmzWCzPo316aipJr9EVyLgZj82WKtcXrn95z7AvufHA5CMyKAAAokQsdmZ2qGG6+UkcaqQWcX19lvf5QcrUzdTvNdhIfMDz57nQI8nFMR8LQctZYYcenTidE5/rVn4adT0BQEuhk+ly07v8HisvsdR9TdkG5aG6H6hGtNnOdCOANxnMnxbnLdO9dS6y49OKzmyZl4PDkAE0vgWO9cvmM1Gl1JA/XO/4QzHFu8bGgfoDt0642gRwnuep2mhm/4nCvadAE0UMoSV2KrhFA/cuUFjfUozMNBqIzCgL6jh1InNDPbezQGaEMAVt7g+gvMQFrSw27FasTlN2RLQAe73dNNE2vUGeiDMvpYYeprW0Fr2+8/9SeNgWRnoOozQCADDkxm1pt3H46Np04ZlvalWAEKGJtt+gECAw8u+Lc8n98v92A00Hv8P/ly/QBJYoL9r6TKoIpq/zoOf1WQoJXXMbdTcQlReJ2Z94OOcV+tG09ldRbj6TfoR4XdeCAkOQbMlt/hIJbMXQxrGjpfk7dizaBGSGl0kJWV+dWLQ+xQYDxIVEu6SIZM/hbnvEFW3mOJItZmbKuUBqo9QhRhnwgVhOVU/hm0FmfHX//2rKug6duZf+r67qgLAkAptkzLqw/d1aDiFtTRDi+J+n1SNAfGgl5D4YorLp/rbECIRLg6wkbPNn2yyg5E+M9sDVlluryabbLgj10Cfi34ilFJqD/ad3z9GXd0Z91M2aeTYvY0i9ZToEmC38HSrWz9VB2+qDzNzlBUsV/77GzWgjq7GyISNhuqi01fl3Bz5YuQnUlKJ2a99n7Av+umygPyBGi873BHMtsAkE2PWQSZMMpnbszmLonZBtKAOvSUtR6DHl24I+V0qgG2RUBGms6Fm53YQBa+ban5nEj105pT0/5Rk2ruRjctjV73Z65/Iod+jn2yKoa78U6qc9zm9OVd0Wf6RvijtGjP1O926RzaUiFi762f4yp5t+ZTYMPZ7nbDrehrgNFZyM2i71D/sUPwLSquS7sDwCEPrv23pvvdvTus1vt8z2gR4M92Umgi0zglKIA8146xiBKnOQR55T6jD3YyMpUofAcvqRkeQ5ohItg9VFeKa9LU+Pk91rRJfpAZc4k6DkuDiIifpYaCh+5kt69OGdKTkWb9WxE6vx2+Z/h4pBdDqOlC4Q8li/JksWKQ8JyADB89+gICzKa2/0jZ7zX+r/7eB5YQy6v1thuzylKXGCmyJuRzALzwg9FR60bm4547f+7x36SvnM6OwwRJ/x7rxcUq9HftawSYhNLp0zmChLiErSGV21oKVpC8oJptCFRx5o6G9AOVivWEYiJU/mauidVCJiV29KM/AABVtCJPXBfp9yp/pwXCv3MWmLMYakmzKQJqWs5RIgBzDHflMnkk076NsqKkApPp/zpDGM/v+k9PBeNc++lazsPiLXFi2FHl2JscUWeuiCP51LPhjUrs3eDpXqv/MltHVy+cQZdX37YahLlIvlY/TM77MiNE/04Dm1TvRrUL82dvTXw7Xtyw9Bl6VLQtIfZ4EI3JaDkVWBO8TtnPZn5bZtKr7+02WWIu2rN1tP59JNVY23ruXIREog1/6zgj4pvLK6RJHaxLAReMrcYrAPywEzskfyJfFj6OF5Q9nSHIEKH2qLf4GxAJfmzhtXROS5TosWPTU0sWmFLkX84wqMOv0YagnzE7d2htiCyqR4PEJbGTgFmR7jq2hz/tfwMzC2WHT/Cr/DtWChY4Z/PiKIhXQTpOxDmYOVU6abJfWxJTnTbPwxmVrbTYYSyMOwn9DR0mIrY0O7kRzUvqCBIYKTn5tkF2lieqhD/rZSFNo7xLjW4ZOlPos2bTpESvc8QSNeYPEK7LXfkb5115iNj2tkNal8oxg57M4aA9E78z07aTfDBloJPL0MTi1OyBH9RRjIBK5EngBvM0wkp3iHP7evt9p8/G4JLZRvPKWuF4MjwcyXL6p+Sx+6Dg85IaVMcVh2nLLsuSYYFa2g8sUvBxcpCcPb9QwQB/jltlbDbzB8dvBYTwpkiSmJZ6ntLHVbe4LTuFKkyZ0kfnUGnlV2WA3oKFa9smw9Cb2BOuKE3k/uaOzDaoRplFk/EPdQjtVuEtzzRZA7XE2wQwZBSls/OV+YiCajot8qkLMw/QjvSkgVqeIwa6QD6S/4SHRt0J5OUA93BzySUUciNcTcwLp+up3KNeMYMKLkEjDNVSZt0PyIwy1c9L2x6jmsF8Xu2Axe1GhdDhbyr5ZgY0H/iv+wioje5JCULFPf0hPR1knt3n5mAmB4vRlZmu/8k6wHWzENcpVyPzPQaYg3bRd6UpG8xbd/ro/6R/TfRXXvQe/s3cW8KEmsEVL6jfx1xzD0t8fVlRyvXzyvOtEG1Za37cdliMHfQlizZG+P4+/z+38Pxn/TwGrHWkv+LAfyOoqydzczB0a7aQYcxVhGw8ww6vdW2shFEoUuCrLw24zMOqN/AzAAfjGb6B90vpvN+STdRG9YJS5N5XZFIEzejTFtG4K+g6nMLmrlAHsrBOiS4TigAlGeOMZtVN0RC3lZuep2w1DJuAUjLGQdvcvrmCZMQOHHFgeTvf72qlHc3eQmnJ+ch1snS3kIOfjXGUQuHuVLDO9hdICvZZZJuZB6u0zKxgKcrGLpQ0r9bBe7JVKK4I2ibGtf818mAOm+yY1b9EPVVbkrlSs4on5sBThvRG+wLBI1arLESmKVFqu4WRHmnATK5aNTqndDxDE1S70BCu9GYr9xECw6wgVG6eRO39jiiJQUnvW7IV9WhgfY8aRCyMShweX+qbo/s5co1XWn6g6O2N5rTIrMxuwfVJkYU51NFGz7umal/F7CPNuy7c/YNlrcAWiAzz6jcxAuVTE6Fuct8+OfZ6myEGjBlOQo2sbxB/Dljww27iq4M3astY5wVUIm1tx35StKM8k9Z0GgUVhAcy7usoZFi4NOzjcUIb8fgjlrrE13rR+PDXgtLgPK0e9MrS1Klxz9WrW2oldcibZtCrVIQwqxzw1Sj/IEZI7x8dhv5lHJ4jbepxUaDRiipeVmETM6rUTEztA0VZ7j/2bsdW/nw+zX91p4+22SJShgpSELTs5bOaUzUyvL0taH6knIgOQYlGDvdje70tUNLPFI14jcdQjxANbptQCNmKBiITsZ5ykxOq+3MIXZSMgDGo+KFRPfiI6BSZ63XSy/Ts4yaJmjjbgq4bbLh41bH2ajhUeeeTX/9pgMLdb+5yyx5wI985NI6EqlaRU9xZk/h2d3tCiKYgmjT5dVZkvUXvnoOUklU87MlmmzqfW4gCdPVkwZLSY0AB4ZGq+AIuNSph+XlbBvQ4gctA0URDrC1KuhmkAlQjFdKhnhIBmype4nzsU4z7nu5vVVvNZGVaTv/T7p4vIeI7+UNePwsr/+HlM3xcUiG86gUZQvO1eaErMkJeZ7ypxxy8lT8cojKGQWYJ6ui7vFpHDYmxEksjb620mwS51JWzWiRLxSlqwLyUwUIbSx+0OHNU1jVFFtCe2ZiOxjBsAaWpWinBir30STKKz/SXRb5jJVl20p3DZVTs258fTmUl645/vHH1kUKPIvm2SxZK8ZtfVqIqkVHvJ37noArljk/+2SuWs0kQ6nXyE4YDphJAlzZWmtCfEy50B4CIb7TtH8itl8pS+3g2ovui68CsubOlPjsV4TOJ8KIAnFn8Ea36RTj3cfa+uBRWkAJ8Y2j8l8v/oXiT51FX7nuPMSFz14NbWPoyE37kMhM8Vjy6wL1gt4Bx3MxZ6iaZlOekLHy0vI2pw9S0+ahylhjUq1S9W0TtAAgzdmhBEmBR0DkFe3kbEAtGHngHMpYoZNxu7eDlQ7tLumjrvZh/jzHV+rpCBEQdsD/OQwHSH93UFmd1wQNTea7J2ZZRDrG3OY8Dc0lbcFDDhBCbMegYNauyeE3oWOuRUrwSd4B4nIlqHl1BnSgjTRPHfnWT+Zj9SugHLiNFXAgcYVadw40VTB/3pjZH0HsgBFHpNtV8hiYrNAQxuCu4e7MipYhKpWy0NH7pLOUoBNQ/PShhh1d+ANrjFOe61wMkVlB7Y6Z7WeyHrGy7H/OOV7c3CVK+wJw61Bcss95va0Q1Hv7rsheE3uHRL94tnunKl9tCiaGt0Jw8QEQsYPwFQMQmtzEVp92P1XlP+RQEPcx4k5XSkNbkfb0WZN7z/fpPbUvvxkZyGchM3BIyu2q/HEdVkvakCwKc0pALbjvLMcV6VeyHt+TN7i03Z6X86dwGJGlh2Q/1Tt7TKLFxnF6YmlggLd0CkCd4i6aE/EAZfawuQkCXrWS30LLQYu8042cOZkSWJ6FYwSAn7VR8itagRzRqISuS2a71sPbW5/1SX+OmeJ4A60mZsP+TS+69/Yifrz5YMQYr8/keOvf+cNBawtqo3NA63xU1qMxZZJ+fADSoo7P1xJ2NJyW343t6hxdSxqu3XMM8GRfEtpjoIqwAMPzqN1iMIdXS25qL8QSmY+e6Ix/ki3dy81D57l+SpJMmPBSkvvE+WzrITv1AHoWkygHPX/KPoY4zgSsKiFGLV6/SlrHjFzKkREY77vvmLpSbKSaOQnForo5bitwd+PzO3KWztC8Hro2owGVZxfr4dhJYvbAimCXV7AG76PoGiH09n8CJjtaWBgQtuXLMjxgRHX7PdF292G1c6He57j3hHy1I2ESU28N3WzVmJVHLEi8M6ftwaCQfD52/4ummhhDswj+6kU+DocmTBAU290bTOQyBYsifgVqJCMHDZSSkl7cxpDXcWkdvqSrjvsmW98OX9ANBJpEy9DvmtjS925qTV3URnQB1A9VMqTSJt1brRrEPaSYUtgUfv1MGNRe6zi622TzSJUQsK+cE1+1+gYfeQSBRAV0wk7gbJTA/hrngHHagiVLCs1AT3gds7+aokkhenR369j3Gynz8c/u1n9+ek5v35scvcP3hw79ENZ+L793TsggIzzydhuzYBxfUChjPRlSZ0foBkO8ve/YmAMlE7WhHevpP30L7MI/usEfgUbGIX4bv8zm45nchFryoc3b2B4hI49zINqJVbZUG0dA/e9kuis/obVnHdB9aV6hqF1PAiF+G6uT1I2aG2sfHK5Lb0BAVC0Xs6oOWb0TlvSzICswe6Au9Ih35lQNjLBILInU+3xeSW5t/NfxkxsZZ9xwGlplB1LBWQByDx8eMUczrXk9g9D6XoHAIC1/OqwoDuEolLuQeLwiZS2fn3e/nbMZpJPAcK4YSgLJNP6EyoOe1rMygERDlJWqstGpKJNMoKWUhoQR1qgresgsnx2iuWS10WQx0jI0mbplhAkX9Z6Sz7KoSAFNGQN/BOipuEARpcu+NyHDXdBu+1L4yDs1HDr/LhQNsBy2RrrYj5DBXwrIc822F/bRawmmYCj1ptH+iu7jn2wvbDNpAzTClS7v8AtfZywEwIzFOaZr9iSuIWKuuc3Wi69TmIGeO7NeETBMzT5mgPyxRlZc3Wf4jKyatlwqt1iZlO8KRgcEgauUs51Fu+CnUDzGJHLOoD8NA6w1RgbpeuVteAUyuuhQuiDPfqJTXrJzvNH8zhqLB1xJakcYIhCvUhDNMxGqTfUlpRvOSmS8lDNf0SceHKMekyr23jQr6WfV79KokhZDzRfY5OzHPdSMTH1nICb2V6bc47XR9EVpjKDU1K01cerq5mu0uIvKXJsfHWnJ7DiYXUo6a3SnYh9a8vFx4mrWazTmm0MjlBkOw7vwtEIaJDOmgJEJWzvFuA6VLARJWcqywEtonvjQFjrpXEhSMWnNRL1/C2w3UTz+VLkfkdfdNqD9wAjopaGNS2DjFf6I6ltxtXl3eymgt6LA3Rm/QDHL154mgoq8Xqe8cbYs6kaNRUAaWCJs8o18GUIhhJpesOUOXizVQc3Dhq+LDuSzu3SDPdfQJjw2j5w3JVW2AodUp5B6WxD2pmLoq6Un23bXKL8gyoJLoLLseDyUlPQItvlC9Eu+76nbt2DZFT9Cd9yS+t3B2Mv5uAAPFfUoRRbsZNUckNYZw8g7PiyxCbtTSA6xzDBIYfSsUNf2rKrZQJCpomW+0eYhNLwl6PcrU1bGNeHH/5pQL7MpvWWvN9LI8QDEFuhs6ti4cjdtn151RBM/sWDvHxM3MZDdc3w0Ps6d3g9gLGI7uEGTR4fjN1MzijrRpIugFLOZgZKOOK1Cf8HJjcKs0JymYJLy8KxwI4/qdzpRKCyDETM/FkeqJlFPCPTYDbULtGGJ+yfn15trbelNwrO/as3ZzPstFQLG6gWqFQ25d5x5dJZspLzEaoJcE3suLv2rO5n6HgXMqgRatwZQPBawSvJnUKUJAFwo1LNa0kV99Y96VEHWybPhxvUENIwb3C6rLQ/Dtn+tPmJ1ZFOds7PjAgknW/ZgNxwa7xPmsvpuGivOeVcaX+qGPpuoNAX8+CFcJkKDcJjTWCILAi0TTa9z+dcUdqZPq4ZE2nxk1pvqzF5cjGAidqmWai0gWpGJ4reyVhgThV56C244GASxiT8BC6eYIuUpVf0XuV+QOV2eP9+/jE8Vko/awJy5B5LuZYBWaxy6RfNOaV27D261BKpA9dQkzZWp9ALuJc28TALN0UKAEvypVYmDCkkb29XOiK4YEPrydSE6zCE/ElQrfhiF9+3+dT2bd9GctnJ5HjjlVHbD5lbXCiRfrNnfH/6yRN/z9l0GaIw+69zIxroaj2o5OH7eyIwFk7xKRpg4ZGAPt4zLazTgmSmRV9H4KG85gjVwu3ZKcjybu0l+Oru/C8zjxAtYbnqqG/JLuI0J4K1fLM/2fdJtR93dAXsqeQttuHmwuBEuRL/3uLMFrQigi5GhgGAB/WbKLMFLjKykQZjm+Rmuml5NoFvpis/n+atMznrMgev/k2Ze12DqpsuQflNRt8Eqyr6QqNzs3uQje0eJQwg2UmEao+TxGrcEv0QzkcMaLqBG34t3AcBdkCnRF3jYvVhOc/BXPoYPkii7Zp6UhlMtoiUrvZ9WTE/JsSqlb8E+HCQKT26km+M9CXI3AknCye2E/fVoL6XKlmtoTwICmuuisjywBtHpbj7UH66VnZCev+O55hR5fz3iBWOjsto79m3zdtW8dvlXE4hLguIk+VT6eQqV0H8O2e5FfWlETn5ExhSWwhDZnx9hFhu/lLjxSa6duecoYpjhQ4ltj7kZCPk34+2B5cDnfL/xI6mPT6kIm4EhbLmNKM28FryfgtmSNEsicX4M56e8UPlziPkV4ibbbx7PXnDQymGhfWGHwcQYi1sotfg0KVmRnSqhLMIwtjl5Do0T0aauUDjvKJ2JO1SEuc3r1U7Rb9kGnhTiYU8bd+WNPCGoHmam1qOyaFoYT1Q1u31RqMjqozK3vbL7CA3bH/QZA+GExv8OjqKUj+tTPw0anCYi9VlODWzlH5iAg6A8CnbgDnhmr/TK3ydftxvDym/w9nkPyZtuOtY3ZITJsduSf+rTCOntDddkqzb2cK0BxbX3hZ/M5LXSBv041Z+Zl2ruH7wTE2AacaXSAG4gPzosN+Cz+ppVvYQAx2XG6R9GHB+KVo29oV30Hoa84hb/kJ7sPMj7v/ei2Ya/a+uF34bFum1ivRID8HNaWkN35EsTdPSbAuh18RSOstNPl9BHivT2gQuzy1xU3N+gexebX54TPd7rfG+cQ5CS6kSfpX4zA169cFkmmt16bWMZ5eKziyB4b8ycI+J/L5Gh+pbtpMiagy/r5AL6WyszDnTD+BHxe7OFGAFe20RChBNdbKG36hYkkyu2oJUWldxHlpFO+Xx4gSdgfxqR40rqQ5XLimwAT3Ep/VR4ilI3BzSmPlJW0LFdA893I0G25FEt909f/gat/8KpnW6HlxXCrcLzavFMjUKbKdHfjYOcF5YZm56oWlO+nCEF6Ii4mEkTQMwlYwjFqi2bvgoRfTT1Gb967OTnkcPe+CkqES87/fhXDMOqYHs94Qsi/vQgnv1N59wlt1GmlddLX9fwdVTtKEHIT31LSkcBwpj9NaG16aYzOqEo/A/BULTQ8ur/0AaP+BLbxANdgPIIoy444By2aiiGc5wimrKGziUT17Xk1Y3Qqk2W3j6qvANIZl070sVRN1A7lclURlXCqr7nNiIWskoV2bRlTUUus6wx812jy2f4XJrZSw5DzfRgGX1i0kl6nVV8TyWRl3TsOhhz6ZwyOKOhOsxhwzEtINkhAP4sQmr2yihN5Tkx7No+/RwGUzvNRTAkKUtJ91lSruCqPmEL+V9cW6LzJ9AKp9n0S0D4LcE05ZoTfd7grnw1gFx/p6nxIK1hkv+TVu2CLIXJB/ia7JppfM1KbvG3Js5CHYXAjGoctf3BFH1kyZptNYsqOHOiAF+h9uQ+nPhGd+KqxXFMs0LAuYZXz0Nr9IVo6jV1oQm4ekggjUMOXLcGYl0vIZNvAL7V7PBZmWrXMhVTYLdzAIrnrzMH+CfDeWBBBfdLiOjGiw7eHF7zuoi8yZf2blggogyc2h7KNohygIux2YjlxlQR2c/gl6NBlcpz2UCVFAXdEu64y3ypVYvXGwrDDSb72F2tf23GAqIL2JAKFR7sZWfm+SuR4O+/y/9GAcsyQOaGNERjqkIvwTwiN6CRrnXShXhas1uuTGdDPUmKoAR1ZJaa/YAWDsyO6dMRrxkBaXf6xxWu89BkbZR6d+KCmWJIvAeN7cKe91jfz+kHOcrF4mI6iXnkIOc7qeLvjUVkWezzk+vGnYLboOu6zSWq+RKvb4mEFp1yqlja5111cKqVZLOZwdVTZ65X+xHw8l6JjUSQBl4XSOL8DHYadjHXkuhgo18qLx+uvIUBTXfvQzbi54tMVC8sQXVhKhy/RCjQg/q0AswwyK4Q1VmVwm6/lIvi8Nmedkc6p98SrLeBn7XbNl/XdnYdPt96VF5ceDog2LKm27Wn09tuCTGEVrsMmaotxsUvzE4bbeQokFBU1QNepKsY1+hbdramzgq6bpO4kPoFr6yv6W20pKd5+c4q9s4x2H/Ldy73kZ+rL2FoPykyUY8ZTvoHLd3NbObP6wN0Nwlj0ajJB3TWdFadSQaMVHWiMBoXV7uR5fp5pxyMZ9ayklFOUD0Flcl9/swN65iuQ0/sdapaHUoyrwe2BMph+/ciVECvDyFYP1k1nlw1H50eeuVjHga2wCxID6vOwV1XfXhjTL5s8PYIKc12N1CHMJLVFT3RdawhE+e3apKWeR78IxJqXNJzTmPAaUPIQwzn85XvHLzpe/Ju2wBMUMcEqT0iuzns5yOsBlTeZDT/4PzMdjSmoDMK2ksbfnxKgH/mgzmLcgrT25BScBkoQm9FedeYkS5hzk38aa5873oz5avpMc64rdYs4ET4ocnW0xQoesDuQrtYpKrDVcqM7ZmDL3DTh8+4G38eIAbLYk6sIcry59XwQviJIZsOMON8A6RM60Y2YbnDlCJRNvTlXZFB5jce2j1zuSAvUBq/5pipTeu5RrtOd1dGa9LUNz8w0Gu98p751USL+ByHMU0D91gRUHWeTo/7Uzz7kBalrOihNICllHmcM/4r/v41YPRuLMRdClznAqWWQHsi4q+yWLCnS8F1Xqdm1IrM//grsGzMlTiqmyk9fKWyasXYv7h/TaEgABxqnEm0DR7HhlS3226Ybh4QG+2LDLz8cMk8h+gVWL884YYBPqpoTEPTfBB6mdFSpK1IWSIzzeYVvZp8DR/ioVu5rMg95L5boO5dJUYJoVHa4Ph9bX+wsGHWqenOXxk1803FtfqwYtJBvbllH6ZbQZ312N8exoQLofKOarlquINxgf7boDs+707EBJzcmBOSwy33bUi/+US63/4yvv2HaOuR0/17jpMETz5eiXmFHQXaChMRBrS1q/Blxw6ROv2+W9CpgF/b+ZwtUn5yQqWwpPpEyQTcF3DtTt/Gwy35J5mEkqgRgFPeNMOA4NELu9rVs5O4+Yrqpa4BTteu4izRu56VcGqaw6krdAfuzJz58eDABwLSQXlFWBDLeTNEpnTY5MA+jgFkVeh2VVg/GWn8CGRnRPf8bvZGsJiyB0Pk7G3fDwJYpY4R73ucunbpyuUqRdmeSVgrSFuWS4no6NYrgq4zd1aZIqX6dUmGKUB5CZJn9mqQvEXWn5a5+Igwjx4pofPOSVlhNnqFMNotfwlyo+L77oaczCZoGZSQzdKvIzZi63vGfiKEEVegiBPCgCWl/OP5SQpfG0xXsR8yTPu28l5ahpOa3kjyaDfFQawesW6EmHm/NgfPe0RLA42QxtZqh0bIKt+h0YSTIcR0Re5NHHp+C64r9jxHF2WtnikCnEPQ989OxJ8PJlC4tatv95uXTUfipA8phMBal4EQUyoez4eB6n4AP4bRMDSg7Bs9KVTBPrvCULS1wUj3oqD5kpg4xNV04fajXiF64uYAwlSs9GxUmQ4QDkf9U6n8cdjTvOhp5gBH3ye8PfrZzxGvQN4smHFSvpL1vCcN81MOdOnQF1FkeKYaTWygaMM2lkxBxC7SJ5pKvMqNkoRUh+JY/M7w5NGWALzpWzwF9GSc+ZazKmN+Hv61QN98uSuTj4uBAGoHBmc8pV0Q0rXFw2yYdtxM7ro/jbcbcH8c2aXo9j2nqV2+wtqwZX9hC1rHk1p80jz63Wnp8+jL/LTxl0lBv0myeYD5jJVbu+b26fzLezxqGvHbl4kgFalnszATzTJ7HJOgPadYQHcWzchp1d+Sk9X7G0iOZ+t7z0ek17O1SEtxtPwWwNcfKIgrcaU3PjuaYOrHhJjMfYuBSP1dS7iODzWNeZGJsEvf/w8IVtHftJvfQ/PAfRX1a/JgQZ+jnkmWEBME3YKK11opL6PFAlGf6DswujCIv30KR1jj+tBtfjZVLDVe0KISeb+N2BL0f7qqxNl/fhOyFZ+O8Hlu+NO658mgCL4K6dn5Uf9iIkTT/x1p/vugbWgWGDLdvm7D+lwUFnrz8oRZxtoGvdlZFZPUW9/zmZinSJNBAoRg9/eZH9yo2HGMw/Mt0PfFIt79yekhzpVWNu1Hw35vyIb9qBeMaYXEOLWR5kRIPv1e2mQhql4y8wDBeB+FHooAB8iBQRFLDwv1n5UjHsSOvKJ87fagVjnRZ2ZYWdgzQbkXyxZSQQpcrlk1J5De+3E3xYO1kCwaTe1YLbn4OntCukoPhsX93E0iu/DZ69PbBZmjxn92/Uhavzk2UUjkHPOphHGn/vZPjRPOY+TfS/RH+Btye0b6onsfZ6EP8Bgl8GXSEbdLHztQ8Xk8OIi+nDQb+uXHRaVI4VeMws3Wzt+hML/j2xFGTpRNz6Bm1bGBCVqKf8iFinfBSipV9OauWWJSKv/obbMsamikoHF9/vDHMZ73Rhnp+khQn+LC1KJntzB/QmX8oqWohmLuEKmPKF1XihKX3Vpen69sYwSrTzgMehP4qboIIkS+h3jiEYhY2eBp8ke/BOTISxk5adpZUus7ArbaA58ATyHuyXERI4oOPR8VaSK2As0MIkVCZhfYpNSXH3T5b174A3wCYFAq2icwZ2oDWhOKjSC53H8GMLN76UJbKix+skKy4KDV6zuUW5zEbjV86yNPmDEUSJf2cH5V2dlsG7hix7Q2u27RugaTByaobiXsMJL0+9ON4FLRLBKuXYsPRUt+5Y9+/K5rdpEpWClZNZzmxQwjtjLl8ZF93XcrmTbk/wk8DFehe1HhaD8uqPqPOS707v5UW6kSQ19DO5JKgFolet3oUVL6yRQeDxBbIcixKJfnXXcht9HEVdsxrM4UzX1wjucFUnYP+FO0HDeVcsrwvglby3ixdA7CYbFty+3yVyQg8NshEhGX/HA2uBdonQY047kKyLjb5o2g4wG8C71eZjPISEERGwP9YWDENX7gxy2r6ZTzpwUtjsKSsWDyjIrsNwvuNU5w8YMBhrXREgJClcq8oTywqn9LDb9ZcQWNolCcvwwHdF1lFKRQ+GOKwXEx+fFZJNw4r6XotDSm6OyH7IEz/aqD8/dhm8GIcCfB8C2LItASrWRwD9q7plBVdL+x2BwDYalLmqQREBH+8bx6nto7foJE4L377ZaxM+M/kKq/WJUWpwcdBQZTliaOByEswWlaQWxALnHzHyV1wWmJ57VFT57+AejiWxEI4VnAsfisXInfVrjB57T7YTGBy8g1Vr4XHz+/LauiFG+K96h0nSIo+uSW0ldj+AXbaPB7DxuHqU0Ysct0snP4RIwbx0SqnbAdKysUtw4vvypnwM7eQDmJjbvBE83BpsDDQpoEZwQt7U//RCQxC2JD5raLqQsNmOV0m/6KybSTUbldPttoHjGXN0NZ4qWov5XMgWwoljHjmKxSDCz3I3v/Ay8gBY3D7rda58s+pK+5ZxJP0U2srO76QwuZF/cgh5ynbozLGRMyTs7u6vIEgQViEi+mjWsORoEIHxJYkJ6BFAQ+apN4Zr9ha6g6BJlgC+W57wbXcbA/rpSwGKp0Pq1076w8AdROQV9ZVVfwPRfdcSFMZUidHowKwU7hrTSafz6vY0u1FP5QF6bGQjh3GA9bId2mEe8pFeXcgf7JA3DijsmD40AKcCBRZ0wsHmYUXijc6kO7keDPDrm3F5VIjuLx4lyr3T7BIRn71lDQ/mMCymo1SUVKhlywHhTDp/JAj9L4GtTnipcIBsPbYR02KwztNYlnu21Pf3epUp95yO4C32CX0RircewrBNjhE4xQuo48409SsTZPrqf+bdnYZUav5S/no2t6vZmPJ7Me/52U6zo99dADXvC7ehhxPoS3hV/lwiyqMg8ukGZIsf8Znat0B8/EyK2fYsxMfF8FMtOQBxnQ3TdkN862A8qJq1/hKcx1+IYlm+rmoElyesbbBIaG52jinvpcfSMAtsXu3+faPASBdtNhOxlhg2rh2OXRLlgnRkU4mH5NAkx0WGjhB6v4RfgzlqSQNxLkmL0gf7U/6Dov3lLUybW/dIIUncFfdjLXHlbfBUNhFf4wyWuSSDJsEE4xvzGU6Nwmi0TxTwCVkPjFiXaO2fMcseVyZIt0dViIOz8557fecQIZxNKsIyQgDiouetO7C9NoizXVGTGVnF5oRhACSNnQMlsXauDgfPGRIFhA5LOvdpOrPOzQVPHSkoDNnkpm1yrym7UyUCW8HIhhrm8xUXlaADiiEPV+3+wQa4BUVm1TppbXptK72J/9JYeJv/87IUfmeAefgudtYJ44UCoYt2D2r3Jk66nVKIA7fPO8px88bQQ8t911KRS8mJ93QXxgWBegwWW3oH9ykZkfqHh5wCErNawYzXTzfHy59Iwqtev33zey8RhQjzmUwzqm+UmOeTCDuBNrRGYLCYEUFSifPVerks0HqduymtDbcbC+pIssWBLVCd6Q2zoTaKTfnKK7VxIY9h6KVQWM5rY2XaCWn/rfgIiujjfZeV/cGfK21O6yLSfx2UF1WVbg++VoXkqKsNWUuE3qOns1HI/PV8ATFWU8vKJLulke8DsVOMdk1EJFIKocD+lIXjuOCAPn2Jd7GaAFBEY8IgCwZ1v0T0BvjjYGDXVIcrG82Ck2iLLTQChlyQtzxV6nv1kzvtWChq+T96Y0FnBHt9MwSbCIR9cns3K5KwM1xIovA0wazr1A8MigTMDNqGzG/ORmCFZi8N/iMBAiTfo2W3BLaXtENXKTSRWJvQUd/tZ5iZa1cSwETUw9JjtabjlLuiv91MsxZhFgFgDpHnnpgzceZe/2/evW5J7KIvfuTBjszGguzvDvHmqqvmOGklA9QYODmHoK9Z9r5a6SUiDoIUfKDfRfjtK+t8oR1cH0iBpm5ozo1XvF9UmqHiBR0hyRao8DJTQpDHkUCRrrtC9tG9XNEdPSE1UNt9gw2Oim2euJLIBZELQYic4Y7gIAY+a7wEIlgvL5eFvSeR39D5cTvzwKMIj3SzY3oUxvTi/8MwOU+4YhsztXo6/C5Ow++Y6ZWTbsK3HDe3PlDvPnH0Bco8WTIualnP/j83EI5q78SzGw0IntIFQZz8b2w4NtRgdP6Gx/U9sm6aBwA1WdWQrj9lXhH3hnVFtz9NP/OvizIyZUUhPD9ktzp4BMQqud33phs8+vsHXUF6QdYIixwbWzALaR+bLUlggcBTeWvMD026mgceDS5iLWj6XrcrkvIR3c7ANMFtt486ztm0CbOgwstVNvHV9759mth2R+inRuv5cSl7XDrzalcYWLL+ytT6ShU6F0zGUailos5hQvsOm102JeC+XP7Q1Xiz3d/+0j/sKK5oICe/uhUHWaofCjnaiZR+eGn4wAPs3Vc7ECSp4RMxQ3jB5BzQjc6Tp4394o0Lscem1Tnzxq20CmdKvcnZUBCZbdD0l/47um6QH8klKY/le/2sSFGfJxSpcYeXdIJW+rokNg/NvVFJyyDfRc/bQEombCOQlUfRPNYtmgysBsBBu7sBv4oGJYKwGrTxtpOu1Mezj6JtiTCfaswhIN5vFWne1mhXZm3GHrrxSIbtyF/yBWsk+mUeJQvpSrDDxDVtBrDWz/OIdtx9giLp907K+vZNJLl8iM35sFDitfaosrN3TyWVb2lw5wJFltJd/0xAnySNIC4S63GSTwAUgYcurTwvuai121J5yJDBPBLjhIIERZUMKzHF+kj0l11XFqwa0MYBZ3qAAA',
  minimax: 'data:image/webp;base64,UklGRpJWAABXRUJQVlA4WAoAAAAQAAAAHwEAygAAQUxQSMkWAAAB8Mf//zop9f/dn7G7sHSn3V1Hsbu72/O2Dh4bAxu7uzvAArsLu5Mw34iBlAqi1BI7r8fjcf9jZ14zu7zmNefPiJgAZHHADYtGnVYH+BAd/hfp8S7J0UPXBQAP97+HgAvZrOTCqw4+MCDCBf8/Bo/lFtA0IcnXV0MA4P+3AI8nKKSJJPxr5Ni37lkGddH7GF0rOedCCME5B8AVrVWiO8aERZUt/9gAxUMJ530I3qUK0SFliCgeYnCVcD7veaymtCI0USlw4lmXjX7rqhO7wjnABZT2wbXwHgA6tO88aNNNB3VubATQobGxsUMdAIRQlgNczoPHgybFihqLTz8VznkAWHaVzfdarwsABOc9gG0GPzv5l6kkOfXXyRf9593Jv06aNGnCsKO3AeCCT4d2A5H/es6mpaEliYgk5A2oQ91xY8fMbSZ18piHdosAsMrJYxIWNWO5ydfDtgUQfCmHfuPmbIOQ99ZbaOlKasKLMeBlFlW2HHNW9+Wu/5NkIqpGkqYqIlpUhCQ/OWlFILhiEWeQr7vgXZ5z6PqHaiVouujJyUxUzUgzFSUnTiNFjZU2FSNn37YiEAD4EHGl2bsIgMtxCLiSUpGiytQqpBpbWZVsuqEbPADEsJdwSlcM7IU873z7l6iVMTGWq8Y2aAk5+QR4P2gvAJONpwyc+3NfuPyGiIOZVGbJNSHvDxgj3Y7Ye1faZ9eRRyDmOXecZQypwldW/oSPWaH3h2xuksLart7nOBxAyRpS+NdsY4GbbUE1flWPPO/QfbZp5lBJamJ7uO9pH6/kOuy5PFxeQ8DRNMscmpHCNzCaycbA9fyszrm8hoAhzZo9JS+dwCmd/Apz+GEM+Q0RjzPJKCP5c2PYmH+sjBzvXBxLySgmYp93wRU2dfBHj3ZyLq8h/EbNKtI4/la2lKXg89uvWVa08OZ7L60Fh7zm/DfZpoktOh65PuIxS7Ks6PAN4PLcMErWCWcNcj63OfScoZpxbObbyG+IuIDNWcdED0fIbS50HM1C1gk/jj63waHnR8x64/QGuNwGh3jhQss4m7McfH6D8xhJyTQqt0fIcYhheNaZrp3vArJOOBIB+e6xjDPdHS7PhYjzM44677523uU3eH9Q5nFWZ5fjtu2AtRfTssx04qbwyOkBR/OLlfENNcuU38Mhr0ecQ05d5TRKlgkfrwu5zbnOj83n5G0nmWXatchvLTf7hg+eTckwY1N/+DyH/fXnFadRs4vCKxHyW9hzbfzG1bemWHap/dTO5TMf63AWp781t/DTLndSMktI2wExlwGIW/zDovc8QM0m49Qh83k7Qg7z2OGKbsD6d70x9Nn55AWPUjOJKps/Z5M9XPB5K+Bp/nF6QMtuNy2yD5jRCS/Yn7ov6pG7A/YycvS68A0bHnDYP8xs4Yhek3mWwy5rwuUrOHzKxZx9WifcwyxXTsDt9joO442IOcu7lf5kgfz235s9/vyhm19Fzaox2JKzz2iWLRFyFgK2Wmgi5Men9QYuZ5JNxr/6109V8uvgkLsjDqWYKrn4rXN+omYVeyz3lxU4DCF/IeK/NKUKM10unMTEvmrwLoch4qgClTRNLLtImnJnBOTygG2nUZjxogmvRkRODxj4ESXjaFzQFz6vIaDjG5SM47Q5veByGwI6jKdmmfH3Yz5p9MjxAevMNcsw4XOXXYuY5xBxAyXDVM//dj34fOcPyzTKrCsRkO/w70wT3o7g8t5pWSZ8Ex4538WPssw4aTnnc15wN2YZE+6AkPMi9s0y4bQVnc953j2TYcYv14FHvg9u9YIxq9Uub4RH3sP9lKwSPgN45HyPlReoZdcRvg55P/pHKcyuQ1zMexFHUZhhVyLkPO96TTTNLuW0TnC5znk8S2GGCw91Mc+5gHsozLYRCDnOedxAYbbbwtWdz23Bh1uZMOOFjyDkDpeylQL8oxRmvWlhDfg84UIMSBmjdxXzHku9wITZL3wcMT+EAABde/fu27dvv779ugCAj74SwQO7/0lhNRQejZgTvAfidhfdNdeShYuaZs+eO+nic1ZqAOB8CGlcCA5Y61lSWBWVkzs5nwsCsNG1f5H8493vmuay+Lyp9x+1GgA4730MIXoPANs/NZc0Vknh8y646ueAVR8lXzyrb98uiAP7Drr1pifmsejfY+7fZVOkrN/+tLEJKayewusRXbXz8EPJJ/+Flg7FVzhg5I9MErb88OXXRp259+HDXn75S5IUYzVNeCXgq1tAx2f5+XaAD96HGOuKANjiKjFVUaZWUWOVVd7VAbGaeSzzLq/xCN6FgJYde/c94Prr7v5m9ixjURWRRFVElNVY+P5K8K5qeSw7gcfBhxAA1A0448x7fpv5N/Nlwqn7ANFVJ+c7fszhqI8OcFsP/W4mi2qSiJq1hkk1oZD39QO8r4DzoajPruBHcUbvCGDjS8cnJBMRNWOrK6usGScN6Qb44L1r4bz3IYSA0j4E77IoYHfyWmCF//uEJEWNbVKFMx5PrJqQQv566UZoGWN0KBnX2mqzzTfbdIul0TIGlznOfWyzOg+4eQ5JUSNJM7NWsoR8feX7KNWFKiTfvmKNNQIA1K+65uq73ffsk98lLFp4++mTVu0DILpsCdiPOuOuaaSqkaRJQpJJImaVEiF/3Bd3U1l1VY2kfXP33Xd9+KvSWHr+lCm/LyA5895dOwI+Y56hkBRjSxOS0tSkbGmJWFkiRs6+qTtGMGFVFmFaTaSg4y4/dcs+7RobO+5y/lV/k7+dGhEyxPsBM8wsMRZVki/ftE6fvqtfeddzqiRpIiJqpIqIGckPTu2D+leZsFqbaZIkokYjafx73HEH9ETxLls9VOAX6yFkRz32pLC0cMGda6H0qqtuN/IFZXE1Fn3vhg0dEB5hgbnyj6+v3aUnEAEsezV5NILLiIiVJ6qWEr61CuCid87H6NFyvc1OGP3WmxPmkt+/8f6tm20MwDXgVibMj6ZJQpI/37Q+EOqBDcZxCGI2BGzzK43FTflARPQo7X0IHkUb+u28VQNaulAH3EBhVRatTEtTEZKv7uQQ69HheR6IkAUBByVUlkx4BVxA2T4E7z1aehdCcBHt76CwKi8iTSrVUsVoL+8K1KPDV/M2hF/yAjZXE5YUXoLgUGnnQ3AA4DyWfYvCaqx84OgpJBOllWVFSAqpT6+P6FbTb+ucW9K8H/gLlSWVLyE4tHoAjppJYXXWhbvU7fukkEYpU0maKFsKOe+8eriHeT38EuY83qGwpNn8AfBobR/Q415SWKWNTdsBg+4cQ2O5xpaiJGlCfrErVl+8sA/8kuUxmMLSwpsQ0co+AHv9QDFWbaNe3wA0brju0NdefqXkyy8/t9c6G6639cgJpBpJmpA3tx/HQxCWKO/6N5mmUNvGhdYJHth0JKms5mZ8bTl4VLjrgR/TlC1F+fZ39hT8EhVwFYWljTN7wbWCiw5Y+cECTVnlE/66HkJd8KlD8N6HAIShpLUgheQvHYJbgjyWmmWWQviu86iwC8EB2PHW2aSw+gvnnxMRHCroosMO06lFqGa6HurckhMxhAlTjUZdKBq9966ICz6EAAADjnxPSTHmQSU/2hgIFQBcxFaJWhHSOH4bwC8xHiNN0pjN6IfUsSWKNm5/6Pu/kRRjTrSEiy9tRPQVAOowmIkVo1HPbUBYQhw6/0JLQ+P4V1595ZVXXn3hxHXXXb8jWjZusO6Ww9/4hiRFjTlSyS93AYKvACJGUEtQyY83QlhSes0qg8bU3w0fMXz48IksqiLKnGlCPrYO4EN5zrefbFpM+crHXHgwwpIysxyqlDQzFjezRJS5VI2Lb14bQAguHSJOopT6Yp0/WRiMsET4HjPKSq9JS2WuTchF9+4PACF4n8K5jlOpRah8cflvyUsR256LGDjXWiMfW0Ly20t26Q4AIXrvWiDgUUoxJtx0mR/IgxHaWgA2+ojG3G+iJH947aJ1VkLLGJxDdGczKWVvYOUZnL0SfJtyAe0uWkRjTagiJLnwyQe2HugAILQLV6RQTuiArQucMMD7NuSBXT8mhTWjipKkLXr1sv26dAbwPqWEsXkpjxHkDQhtJ6D9ZaQaa0uThC2nTx52wnFNtBIUOw1+lXm6eG34thKxwuc0YQ1qpomx7ISPoB5vko+3FRdxwHQmrF1NRbSMB9DODWXStAFCW3AepzRTWEMnfBD1WHGB8Ko24QIuoClrqwdiHfxE2rd1aH0XcBfFWGONgA91v5BNy8O3lgu4g4mxtjbOHNyAMJFc2AbqcDoTYw0+frP+TdYWAg5XMbaqqmgNYgkX/8i2ELDJIjNW3FQSY1HTJJFaglSyxQqt5H2vCRRW2oQtf5zw5FfWzBrUlMYFS/vWibiTCSutZOGXK0/ZCz1P+45MfjnzkEsX1RYtNdkK9a0RsL8mrHTC5ls3agdg0PfkHzduiIZjx0ntYTZhXcTK+bDsFGqlEn62AYDgT2vm68f0A06azprUOOtgxIoF3EdhhZWPdEWsQ7t7OO2wemCNj8jEahEq9SjECgVst0CMWgkTXgQEj5U/4DN9ARz8FxNljaoqRyNWxPl2E6k0VjLh2QguYOs/+Ewd0OEOUlmzqhqPRaxEwDEUGl+S8hLeiOgC1p7FtzsGrPAB1VjDqhr/A1+ecx0nmgpHXkYtR3gjgvPo/T1/7+Ew6E8mrGEXv0GqLRwEX1bEIRTlxMYPyxK+7IKDb/8Om/cDNvqLCWtA1UqpnjeElvA7H1w5Hu9Yoou26TCLls5s2kouIOA/tJeBQTMprAGNFLGKGJt6n0hNeAtCGQHrJZZwOPYwZfqEN6IOzjX+pIs2wNozKMz/yrfO/JqkaAUofBlHUcQ2gU8XcQsLtmgtfwilDNXtXUDECeSjrs/3FNaC2nwB9nl2GikVoHIPnMaCTeroXSrX7mcW7EHg3HKMf3eHc67LJFu4Np5lwlpxFNDxpJ+pWp7wwzrcwWaeiJAK6yem3B4YXo5wJDwiDicn4lgKa8WE98Kh8RpSy6JyD9cwxmRSL+fSuBvYzIndPe4tJ+HFiM67D4wXd5ppWjOwwNvQAOwzg1KW8A2PQ7mYZyCmwatstgdRj/vKUe6H4LFCQbnZwxTWkAlvQl3EGj9SyqEWNnb95ppN6ORciqUXmHJHV497yzD+0w8+4nAKv1xsrCUt4VWIEcv8SC1HeAvwPJt5KGKKNamc3AN1GF7W1A5wEdcxYc1pCQ9DiFh2GrUMs3lLucPYbA/5kGJXK/AehIBzy5reGS7gLQrVagyazl4FPmCrxWLpmPB4LNVE/tkZrtQQLuKRLgbsX6HRFNagys/aeRdxJMXSiT0KP5a6aAP4UhdTCqvDBxxW1tTGFm/WJhSeC4+IGyjplD+3x9NczPMRS42mzewD57FOMy3d3GXhaxeTZH0XnG/8mZrKbMGKuJiLeDtCqUvJT+Dg0PADNQ2FgxFrFwpHISDiGJNUFJ6GK7iYX0VXagj5ORzg8RKljKd9CHirVjEt7IHgXMNP1FQJb3fXscD5y8CX2IP8rEXEcWUYF/RxdXi9VqHy/7t4F3GWJamEH+IdJmxaNsVq5CctPNZeYKkoNhixfhy1RqHwVASPAQVaGuPMPt9ROD9N+0mc2RcO8O49k1TKXzu4Hk20WkXtt87O+7q3KOnmHJqYceHyKfAMbWcXgIhzmI7CU7FyDUPhEISIIUzS/X0XVfltO6Q8SngpIuDR7XfTVCazVtuCwhrQKqQ2uYuL2ISaprhyNFyKHk02rb/3QMR5lFQUPnVyTdBMqwyFQ1309V9Sy0p4PWKp4B8mr0I94Fz3GaapaCbMQLMql/D2OyiVURsHRDxJKUt5MEIp5zp9ZzPWQp13EcOYpKsNld91mkStiNnC9VGPoUzKMfurB1wpBOwunL4HgFDXZyatDMuCOb/RqhqN621dUKsEE56FdjixvIQ3IyBtwGnk4hEb9wdwCZMyMlD48qWU6pbYMIygVET5XojYjFaG2pTuzqVyAdfSqE2jr7xyHDV7zr2o2glfwypNZpUwzuwCrMxyhYMRkN4FXKVUZrNxjWFMqpvZ3FXxAJNKUHVzYPVy1C5BQLnOY9evSS0sLoioWpYYF/W9tNpRuYvbmVqRhOcCq5ZhnNPJubIAj06Dv1KW1AxRjsW1VS+xs9BpErUyFwNHUMr4pycqgQC0X23bS55+6tk9jpxPyQ7h0+5QapUTvgHcQqmE8AXgRCbl9KgMXEDprX5mkiEPYYW5tGr3BXBEpT4DbmsrgPMhhhBCHQaMo1pmHIfu06vfJ8CqTbSKfITwLbWtpAzoOYom2eHusaTafQqPMdSKfIoVF5uV8XcbgAdObKZYNvwXOJBa7T6Bx+cV+hwnM2FKo3FuzzYA5zDoLVIz4ViExvHUKvc5Ap6mVOQz9xUlDan8tZNrA0CAP302JQuGogGnUapawrtRh0+plbDHd6Yw7SwTvg6PNukd1nyfmgFPI2LpKWrV7RzUuTEVSXj+c5bCOHOYJXwVoW0AAe1eoix5jyIEPEapZsodETG2IjZnn2m0UmIv7s6C7YvYVtCAQ5gsacoPGrz3q02nVjFLBgVstNisPOP0t2hMwZ2PZcJ1ENqKC3iVsqTRuB5iAw42qV7GOV3R+DaVlTWWFo7HS7Tx7Z1rGy4Cw6hc4oXDvMNaO/5Nq1rCEdjvaxorasrSJou2bzfdeD0i2qALAWg4n8os+AKdbphPY/U2HvEgqWx14QXY1WzBCvCt5qMH0O2o8VTLAFrzTiNJY1Uv0JStnvAK4A7yFgS0rg8A0G7Xq6aQyowUirHKC1s/4fXwXSbb/IHOt4YLHsCaR9/9K0lVZqax2htbXzk61mEoeS4CADhXGQ9gw8GfzSbJxJidxvxrOn1VjzXn8SF4AA5ACK4sF+H2f7OZpIgaa2vhyUD38RzbyTsAaOwOAKGMAGz1CUlRY82t/KURvd7nmH7wgMc6V389YdRRPeBTBXS7sUAVYy0uvKD7/r/xlf7waFkfVh1FTtgXwZUK2GwcTVh5tZrGdMoM8lYPj5TXG3ktQomILf9hga1orH2/2BLeo3Tw7j0t8EaEIgFbzqGwFZW/TqLVLsafRu3TAQGpA3YxSXgyAgCPLedQ2YrCeeu+RqldhAcC8EjvXOMvFG3q5wDnO/5GYcXNEhaOjHNptYty91jvkNYDCLiNScJrAHg8QmFqM5OkNMmJe+JfC401q3HesnBI2ejggYiLmJjN6YmAQVRLownTL5p0bheEEyi1zOw+aZwbePe/4BFxORMq94R3H1JY2pRMmuaPuvq6a4tes04XoA6P1TJU3R6hFAL2m7c7QsSFTJjY6QGbqLK0kl/c9a/llkbqENyq881qGOH/uZgCDr/M6ex8/QdUCh/z/lVKqYSTDmkAAB9Le4eI+ymsYRPej5Am4E6eAqxcoFE4Gv0X00ooX+sDbLenj0gdsO0CtVrGOLO78ymiu9xuhDvPhBS+4oaYsLjxmoh27tFhri5VROPPVNa0wosQU3g8yY883mWRN/EaS2jhEjgfMeIjRFfKBXR9jcra1mx2f4QSzneaxtE4xoxkwpu7zqQVEb6D6BBxFo+BDy2cD8CmP9BY6yo/6IlQrB6nk2f1ml/MTliXxhLHugh4bJQUTgUQYwTQ7+pmCmtf4Tv1iN57X4/lfjeO+pJKksZN1y5FrgYPwId3yLc2AYDGDf77C6mshRO+vSyKbvgzlaSRpPKH9qk2K4aVpyTkt4888vD/kxRjbaycefVKK620wS2LqaQpWyb8L1IkHIIIAAG7JgUWV2XNrGRzoZmksrRZ87oOAFZQOCCiPwAAkKgAnQEqIAHLAD5dJI9FI6IhGUxtrDgFxLE3bq9Dy7dtq0/J/tvos8g9kPwn7951eq7sTy23zP+j6x/197B3Pk80Hmzemv+4eoR/S+ps9Enpd/7h/5/THzUz+UefjvC/FflJ5p/kH0L+e/vf7qeuPif60NS/5X+KP4H+E9DO9n47f6X+Q/Jb5CPyz+pf7nxXfkZ3+Nnv2i9gv2q+y/8z/Bfkl6bP0z6n/YP/ze4D/Mf65/u/ua+c/994Qn3v/Sf9D/e/AH/Nf7J/wv8F/ov/D/n/pm/r//T/qf93+6nto/Qf8l/4/818BH8w/rv/C/wv+l/+P+f////4+8v/ue5j9tv/Z7pv67f7j86XNAa2td4EPn6pOWnFumu2jkOhq3CFY9rP+Fc+Pv7DjOv2Lh6VqhyyXHqzd3MGg7zSak+9qQtCOvE1E3O33x0ByJUuh4EmnPMMV1itN/nhzs7XnxFJE2sxSJKSt1ksIegl+d1K3SFvj66qI2ZGZ1E1GgNbqfcYTa3eUMWb9XBMRtYEiKYNWBM4FnLact2YQ4Nx5rrKZlLB66/ww3VYIeOz5qZpHHXbTzvmOs8kiJn+bPOBtRBZzTVdoYElVI2o1jSK/5Licq3wE6+twdIyWW7Dw8newG3n/v3bkqEPpic7LX/U6yiCrJ2lq6+j4rFU4pNmwqxSE5gq8dCJpb/r3+7y3gWC/FK0GYd/nejbF69Lq+P1xNnfgXjTtepiJ9uSvO/iItf0tXPL92t/5Brfh03w1QG9KRAP6ko40lzaTP1mz3AieLgEGE4uR28FqvgOGA0Ah4TAV8Hm0yAeVE4ISspbL+n1YkQnNJVy2UK3/K78JOC0A8pVtmvdHtWmD8Iz4jUg0P9no3hgmVLE096/+u6Nu63Xc2j0mCnunEE0Vw/pg+Si8JZdrprZlz+ERs9oWXuDJqppcyNufIhRL989+RpVc0h7GBu10C3Mp4cUBZwwA6trzz4/hR/JqDco/R29+L+XVcB5FnKQ1taeQ3LtPLgEYVsBa+q2NFHpQc1Igy9n9MLxFNgwxn+0RzfYw8vrSnluyVT+hV5KkZ2ysYs9LhaoQYhbOC2xhOV/6wBSQQPBWw82zUnNCxoCsWuPEe91dlhJWxlkwqXPufeY8ZTWhXWlHbgYMwOmuxQpc271zk3TYwOnzcBbu1FAGH3eOeP8nFawSDftgZ9FtG7xT4D0Vx405pd4PI5z2hylyFsnqm7kr9SSoiYLyXeglsTk7kTSZ8WmbItiNf1OHEeUqnMTa+vNXNOi5G5wE9WlTJurDFeoSM3C88EsDjU9X3/vGZSHwOR0rHv85X4LiwLsxHVDFhcKASCn5hKYx7eZVHM6nIefW7qolW7TiXqrfVv4gIuNRD1BaVdC2xa2NXVhQ3+hT89Il45MAf0LydYb9WqKGu4KupcCS7hOG4FVq1CNuVXr8yR2xljcFks2EmH9O49mynw6sGDAa2HEgO8fCJzKeJfl4gBKpIkVzY7KA/EbBXLrQkfozp59e1yP/pdMkvWlFy64iz256JMU8zronuCwWW2srXDs57ISbfz8T88BkhlqC7xLw/Z38E9947k98jxtwto9fIzJ2UmDYb0l0KDs3XcZXV/zeWzxSsWk/5G/jf+hG9+TunrMe+UYJgC3tfDmbTgf8dNHzOqGaSw7UdfB6+9+I+3Yr40nnnfhePFriaSya/YCX7f/8dLcwN7gKfoA/qo5eKMSF03NY9oKWzlgJhVzZFf7SIzEEyITeO92eeT+hvwOJKUzMoqwxBiooU6pFZqlhHdKYkWBOHUEJvHLP3Fq51fHiAD+/tAcTXmzT2fqnD7PlsbjsOHY95XSQML6KIcEmhZ8ofEi4WI35A3q2/CEezeOnYTCfP+fpb1cc9wWh0sPc1cs+84F5WxO93+o99mdv/5knUsx1B/pQLV3VgZxbJbprSGwwT88jlHBgQ1VgxmZ9zQ3v7a617ejwjkJtX4zj1AsWFxtf128AOnWYv4jnHfSmnUYgQEX+SqvnWpvf7ukQmGjuxAEvOVMIMMtdk5zvVrS3jDZNK7B2C4OFsUw3RHLH69A2Tn/2I1kEBwgxcBkE5P1Z+56OM26dQ142TJ7v7leH0GXwbQt/Z+RQUeWBIbf0mLDXxstsEIEOOPfpihcjO4AIlNBar6w9RjIOZe1dvleoPvihuRjFmtRJO5B/UKbYZZrJpNsLneaI4Sx0rSrpZ7G7+UPqpdGTTSmgNsUwQN/+kSlk5fki8REQTU29innjjHSUTNVJ066BEGrcDKif5jsdwYwtT8kPLzJPq2O7ILPotLLYtsRDMLEWC+UfhKmIChO04/PO345YgCg8trIfsAr2fnHnIASc0r+OC/8XzqDAzXEkSu98ZaMivOKsOev64Y431DVWIHQwA1DNseSWlBBPg8o0NqftGMafYgrYB61jimAQz1aPf+7ZCFVfMFWHRVy0E3ZRg3/c/AoWVmdYVnfuKitBipgKiH3M9NId3zfUH9DjCq+AlHfWh64Gf4WprOU4Mq+qcC0aasmmMrjHjlBvEWazZOcuRT4+8L7bjgpahOwHhmxgbbrQW/GUsibDXvG3KI03HU9MbpLZJa3OLRN/UFJACvR7+F+/ge5lRRnruNZrnFf01LykA/HmxUx20YJniJj5wlT7V2GsxrIw1KNSmkmD4pH/WEawI9B8of5hoD1kIJhPXk2EJrW6b7Pfkp+ps4CYsIqihAaz2Zfwvp/Os30t+DknAAA6wLGlwNKe2x3njUGkvQHEZ+beFFEkTbAajvBL65XrJRE0KYirmYqXxAlptheZikfvlXUi01Ny6Y/guRtEepcfl0LLIj++AoVCzI95byGPaVHpGkD9N2kKrbiNTzg1TGwTy/nvTqUjKMgOVc7p6HbIxY0/YpKtXXCLoU+BnFbV4y+PiPFTzOsTHNmA9pKYecVlYS5zJe3JKEFfpADFzBs9SPnMXiX0gAyQhT0IR8m7WwlBLaZ5eLeY+S4V7kvqNdYAob30iByV5ZrwnblEV4/ACeQab5W1Mnq7Mv8Yyd425d1JBwSdzjEm7udmVU1lY0/RCSz7sWWjuXojjIsC1f9B0fBbkm7rdeEGJEvXY3rHxkm01yaWLBlezA9cM5+UlanjW8wi16fR/gb8VzIJ4ox8ZoTlTlnH/k/Kzg2E8zizy9ZCLZHkYqdPLfMlLIINIAZefQw/ms5eQqzFpS174Gt9wQeRk8hB6sycswa0LCJd+bOdk4SD3ZdrwoGhp+gvJxSTz9Y9NDQrog94YstdVxgw4sErPS2nuttov+9YaJYjOVJJFdW5D3iz80a2+V2ARf98WrQQndANOstn2y5fCgToqVR7TYlEXroXLJWr/P7jsGWlEAtZ1uBCmazcE7CcjAtPO26ubFBphazwR+Yi5m0ApRdGVQ2mKLEK2ySPpR7N5/1zVb3EQ/qVoZuYAHEGUcsEudC9B9DCS3xREu+w6bTBQTbRdUI22J8xyzKuB/CUr4+/cr/Ospz28vJ/iE/KMvb0mhN8L/4htWJNf/Eheia7/EbWt5lFs4eIKN578rSrNwBiJaOvnvx21oFUR9kSmpvy9o4JGceuneYAASdbhKXOOX22BaACyIHLrWmY1SbOvNfRoh4xq8Jc+JIj7K+FnTDyz5amBDjz7A6SNlIdtn/X1y5MDkN/iqelSNee3jLDXXfBv0l6fIjTUHMP5hld/PJ6Ae8vPQM1NPfwPVk8waA6go78tptH38uHJxyN4Ig3yCxTRGdLhhVo6c1uVwFq0Grg6QagsOYftR+lqXR85D4SrYyIMKA13rDEmuJboH/sFJ5N0loCcbyoEsd/8rCsKshKQup85oexVxBtN8daJqgXBx2rv1F2FiP9SF0Y/oBJ6X3+63eoNPnAR4zssI6kRgEYZVcCWQoOKBCsmmV64RhdeHypyLlFC25llzECgiK2bWiUSr98Kv4FRVZrf/XCX+CmC9GnEz5Gej8juUt2SEGRqy2uJyjvX3lLgBkGk+8qd7M/Jq+UK7frxSRlRFZjtOVJ+/+S4xp7YMqg3JGoUGInTCwospQRHoPokIji+BsId8q4BRihE0fDCb4VI/lxCfLeydj6D5k5SmmHQ3dhjUZiaZ2GMBAgfqBfV8SNUVam3Q9VZjzn+ze42pX7O3yxn5XhiVnRPL06q4ZaeUuQah4qyo7pcWmhYSf9qckXfpcTlajfxcYjh6tSHJ5pVGi8GYBN6mthjlA+r6b1gyTsFGGBajr1khrJhDZW5QmI/ENIhodBxMVkskee5rPG0vfX8KGc2FwVM7wePTztaZU2O/HWJjRnVRBap1MbU3O/Q1LFZzGUIUaa34G5MEZCjgf7WQI+/aSDMPevpTjhOgebdiA1tieEQrRDlWbEJsd+0WI75JjCbyCT4Q7+HOWOQQ18kc/q2HwbIHSKBDOHoLBps0e0FVTwlCsKBeuVSVvVYpk3Tv+vVQXvdgqHjXCv31KPRhKZkiTB7MrQPC84cK882575ZNEMxB6bkSPvtccqphBX8nA4I1vHRzg5s+oAAbc9fJg+rzfUd2p/YS+ncwHzNZ+Zyr6df6ZXyvFTXP4EnERi/Hu7tU4GGCuKpoJR9x+oOdmo2hMsNXbQgjbGXe4cWldpp/HjuW57uTfZR4jwGqK30quTm+DopThA1JSEHB9WtxXuJT+09sBEWFgQEkfkZwURRKKdFKSf+8RNHqpoiL4Ezu3k4gkKJsCf6xttUEPmlBStCNINXUZmrR2E9brNWptCY++bwIFAfVt3/ay24BwfBw/Fkze1VBFO2IGpqvGwI5YkdkDPApiaoHC5G0kT7wKjWyb6YYH1xuCPgGU7CPdl/jlkOk52hJVypWnsxhCitjx4XwS5NxP2D6UZ93Q5TcZah6LhcKh3pRQLV8ffUytzyop7HaL+DO4z2YDxV2GHa1H+7ZfBmXKBCoEYibsZUV7Sex4PQ8NywQ7lWUF6a/sdYllgdub90YynKd7upO3m1Rs6kVmPGiP+F53vpMmKV7DOyT1x+9fO7kOWaLsd/Cy7nv+6QoA6T4DMM3RB6YkGfgCxR2ZDtyJ/vl48GxpC7piihh705JCZKXbIz7qC3Yl1b22sDTMCH9PVLsW+NE51phahNF8pquAA+TSpmtCJ6YmwS9aRh36FG3qN+N0yOQ2nb+VyczdbL6XRcAryrIWLMifsLFEKaTmWT4i2hD45fNGWy0LBgLcjxsOnS5+QQM852yblfNuoJ2+LgKi+irV7+y/DDcgiqy4KC+j+zLwglPONNQ7yh0eLXeh7JtpZKNaEDZecG8kGPhfTjkQXRSZhpwhAK7Js8tSOhDY1uEqjOn4xj2xz24E4hQI0Mt5DEI7ezY3N+EH6k5UQ6KRLBJFyqv0uN/GIbd06kfoqOxoFOq5N8/9WQc7excZcPAJ2vrd9M0U+KRVj/W0DAxOvDLNzBhnMHwHUEUA3k2eARI5cg/UbCW0CoMq6vcckRR6hBD5h8pu8wUTy4dRol5bxf1O+9ZPCHTJnO8NBrpfXTkv+zKM4myJV8CoZe6qf//xNe+eEoAOPZ4/qv9gX/+RjAO1uq46AwNoeV+1EmlI9yRhzqs//qU+T4QNrPosYw5Dh6RrLjUUgLLgtk0ngn7/gx+OHzNOI07/Y/46NaoQsFEj+xGRVXuJGYJi34r0sjkfQ5bxpqHqjiG6nP7XhFhs2neOzqmofMYMprIJ6gdrh/zTSVmgNcWIR0ncxRB6Ki/j+G2U+Yr6+hElACnqHd6l3ZvUAWYrXvnoZ6pLc0P51rWS5rv5o4JjTU4qPK4Dz+sxufjz4KPTkX+5mg7w2HS/0m0whCCdpMFi8DpzgS0IGkaSXEuNRGGrrJjAX+l14yPPU8JhqWDjGFXW2GBElcwxdbs/7YnwquzFWAQwyGVkygy4mJrAz7zxDFYWNfVIDsZkUenZ2+JrILMt7ud2s8xt4YPAWWFcsM8wstD/aYFkDCsCGGTg2jU10OYfXMDs+dNZVlZvUN1cygsWNiQoQe7YnqJGZAyhiQ90iJgKJQljPrcM5RiJK+tKGezkSYH9gtY7H1/hlky/CsRKe+H+fGF1y73jbwtAjPWoMlusXChjm0w/4sUHIltG5oILmSsrg5TAJiXnKTM/U3cuCnKCDKt2OKsOdTZ8zpfGzefrKWd/ro5EZmm8F7xrrCuwdu3Wx/+/i/sMB1Tv0kAN/WLTIF6/cwO4PqANxGNXwjeoJB3KLCzAXxWt0DYrIxiPZp4Ycom6ov7rKAH68g7sl3RnZqZjL3BFnyNcpjRBotQKqfcvK7RZbeXvToVgwHbdAoPW0MDd5Bc5wtLfIRs3NPAcQ9L3eb2E+Bs54krceYGII3bl4IBUe1qNJ6Mt+RF1xbeZyA52r3reS0sp6X9e+ZuNG3733k1UvgCgkMdb7+HD3tNgn5DQOVsWW4nT31xgBvn0plccDwwtNRU56q919kwP7zz1sdJruKpqAEXzo56et0pCWAHteZpB3YHNWKqgmzIAX7Bq4bcMvciZIRHL5S8XJxFtsrVXe+Dcr+5qIAELGhUV6rLeV+s1vw/o1407tNwaOFv+P/Mp21Nm9i+64FdvjPUv51RcBw5keccR9MeJvpXydXwPAT/nu+UY/OnnxH6udybDF0fdTwf3vWaT1hVPFwL4VNYzvLSLGZbfnZyqqLQnS5bQL2C4EhO8t0uYv4SRvRnM4/xQddrVta7+zIEIZL9uC9AyZrxwAxSRNC3oH2WYuuqAO+FheHyC4lG2EOTBe/TbgjaSKunnIJjNTQsrVx/DKktDyMA+/fW1nccQZb7FOyse8vBZE5yga0uD9V3ktbjXj8zId3h31I/w1YhZSMcmw2iyksVc3hnRNymf6T9Uhw/mzh3PW5GjPFg3kTvIUbniSkKeDNxQxMRxkuuqm11j3DZkqNWX9Q+YtpVtZshWi3QbuSApbK19tIwQbEbhxAJ29RQxy3mw9GMc2FFN1q/2NqwjruvezNfT0etUhRrLRX/DpaVOIQb2Dbh76AKWs9LP0xj46Fg03xzYrPt/8xeZSRwT+PRypGh5CXcf8LNvnNBphWm6hhjfVrXE9i0gW38A9/WWSjZhAlYWwWnA9HFN9wSCze7nD77+98VlJnMK8TXrsrp9IGIDQddjeJoPPfbc2cWDO2VZMVxklumds0pDJbfdTRfEPK2IEaYSaDsBNACeIbehLYKIwkfezlpaxe+kDkyqDzQCUKHo5yQ8CFJ+cA4ETWp2Mf1mtXK6c5A4ClStHTWJOlmhkncM7sNfciPRPhofs7KQ36hR01J8ox4Xsupwzh/LhZx8GSYqetDKmQ0hajzOzTWvXLR5XPqfUcdhgSH+oclIk9NJrk9U5KjRv+1oIgdl5szKTQaUET1UuPNi1r1qX90ZLJSR4H4P45Gz60JKncjCFqQvvCTuTtLRzTAwblIn50iStMK7jMuootUIIjBiBC+qW0AlJaUR2IcDhaOOPFsHBogLjUehwlL5Lesnn9Fzmu+u/28yawOb3P194eVIXHLrzeqC3pmq0iUGOOcVP57ACrM8my8GcSeK9tDsPo7uLLg09pjgMIT2nbKHzkLMP9SwRsSPAVi1zaAnseq2Cu9nwYAyS+I6I0Rbg0+q3wiBgLzN2W6+jnVkH8wqv9pmCC49jHJkoZxnNLd6HC0qJnbm4rIjouoIA8+0ON8rarvUJsbVFx5sLyGLs47W8Pk4CLxXd/RAu4jrAQV1py8TxAT+djefozX96aRYd/gTbBI62TOukOFPxBjuaIVDztDteoiXxAinsUYxbg2ULNOR9nwM2EDQDUkQiHmeHQBEKKoku/ung9zf/fn/xC8su3VBk7ImAsHTwuQGQ7yzECgzoKycyDmwqtODdVdSzoD/J6QX90j+W/qlO5LHbSXDwP4W6WwrhgOo7TRqjIqikYHJEEKvgiY4D3rb7hVuZdzltaHQG/1IIhpJR89fg7t2G+Bs0kTs95x+oyQsHo/vl+BXQasPzwzY/59N2Z+Uy2+Iq+Rb9dU2QBv/9v1ovnARNIIpUPWIZYRAfQhFzU7h6kmoxVEpOrbk1sGuGoXY+SwU3WMdXjEGH2lbwC7bj18tHOpM7/T9tngSLBCli72fm9vu/RCdGYGYHseNbLPYVZBzvzf/deYuUhFrpUEP62IR0J+/7kfMGAzRo0+9uV+hVLNwxQEl5EwOFn187jFAe1CSgcGRLuDjz982wFbvCvQJNM9JdrF12wwMu51fpzq7B+pV5hNoQ9SyA5bZg9FuFKRoBMQhGmY4s39M2ePerBttCv3Z1nBAuqvbfcYYQ6qoWcHnv4FkYAFixvDLg4UJCP8PjtiAK/dT1ycg2sv+YFjN5UgHlSUTogDjugHWAEyXYGzINE3hVhUpQ9EREnLkDiA5PX9nGP5LEW8kKwrL3gfnwV+v1kPu/SBfPH1gh6bmn4NoL9rFqjlBK6wRXTvLJ5iF1zDKOkNMKYOfx4XvEzFGr1XEiJTxiKx4yta5YXKVQ9ZEOl6TYCxujUptM5kcAF2CNyu6PhpmmHkGeBQCpw7ugTBp9f66xStktaBZTE0X037QcXpqM3NDqibRDwa8dVkdvX2dbQlOWgPZ1Yh2ByZBBWUo0vsQZwvuMS5ZObE/5HI8is3PGoMYws0I7VRimRKW538q5a7OuMf9Ab8BXGJ/GDAMFhgcYuFlV/2w/D2MCtjCjSwsdu2FHwbsefE/k+Mrqcjhpesv7Ph258RuD4nXDnUmP8GsEdJ/6GHjY/um/9pP02gcsOrx9fvtQm2HDd3zX0B80jePR+jyGX1lFsFXudvSoIV628P4VpwwqKt5e/mLvkq5cifWOADiuNEG37M1OTChTe2+oTJ/4S91qKs0yn386Bxz789dJHna+PM2CfoNRZdIu8YaVn3y3ij5b/hzAzbeEQXe7up901PX7J0o9QJ6RSsTKfGyCE13Y4pGCPIB+7K6krRMGVBVavRQ2vwbwVZxy6WXyCwdpmy+nsi7MODv5S6cMySUSqcqlmyt1uJyUBPY0xKjd/ZhizAulHPJbIkTRcNa8jjPLTooxRsg1lRz8tMBpHmv4kvH+VffZJwkWIHfLjqL0CvPD2i+3pZBbwOed2Ca4ZEsitZT3dyj2Esg4L/4DP522es392cliDEvhleaAe4SDvCbTposrAFS387prE+ckviN9la7CDRyH5zvq1PGATP2tW/UakTTXD7dSdArZWiwcETLazLSYOVuUrps565wdGPInIlCfqelmitg6TDJxgDwfwGY9axz1R1qS5kxGiorwtDdrJth0D+imDG6S5RQKGojgyHDJ1BOCmytAaJ7W8RoscZvjwQO9B94BOAizQtgvyDpJIhUasxmZ3hI0FkllohCNRpYWgyzDUQCtSc8Slwud6ZfZcLJMy6WcFvZFrH8OJ9CNALP+DQS+ImKVVWD2v98Fgyg/2TU7PrG6xu6OLPRQjXzS1LaqmKiCJob3ixZjfzLfGPLLMbVt7bPkDBVvWyz/mDjfL7ST2XkCvkXuCaZfgfpTTKzRzOp7L3OCEY1i8qbjkopzMTVZBBimUYZ76EDVwdzWXw/HmG7958+DNpZ9vfBDNEY4xnW3TUPWMk2JZXnvn9jNJIiafeA4rMRhZpS+qBskgEKbhfGGcP1zvEujLTPqn1oiMu/JYfSxA4MebelO/HOSdKN60biC/y/Uiy+ZhuPpODz1dDOef8zoiBeLUU139l+HdQ2jw9d3q/ebXnJuN8rayEKOFY0fivBmRQ1wXSxnQuq/K4IbRU6ZKpMj9QNt39hHte4cGs4QgzGXrYPAtZJa71q8PR5J7/IQaFoGYczKL24ui7r0O2wNaQ3ioh9X5FzCjbqu8RcKQriwNBZvTgpwUO9m4dfb+RWDvgnYb6VD6SfCENjcDldp1VapkdDTO6lky+bx/HN/tMHhYEZJWn0s37N2Jz3Ie+cuC4lt//iRvqE/2bvXph88GOB4Yrq2PN1vC2HZKiyMF+PtqVRmdoPdrl2WnRAQd7/nhBuxHfzechLxonZrds9AI7+Ja7ZkdFvjzQ6cxWnaP5jWe2PoTAzQYs6/Cc0QBP5ZWHLOFnuT/i2pXnKG3uatFJJofCd0HpUVq2RBOA3xWTsL6hENpDOyKTNjj27tfrpHDIe4r7jPeq2HJ9rEGedIAQtbT06Hr25Upv2+AC6w40v31JTwbPnlnOo6VBaJ3Cgnn6YcJXu2rJe3mS5spoe3i2o4A4aMBldkE3FF7FF+UFArENBdeOlvkC3IyIkFC6rX841+zHQvy6/T8XbC6mATdzpDnMyPpCD/vcND0KZ+LnSNg9pHgXoBUo7Gdd5w4MTC82VHj2B4TKOmFHvDHq6DiVgbuYj/2FFivmKjuaFlfAzZK9j4gDWGmi0pHlzcoWHupRvWJdnUk1SekwZIpUjeZyWPO8V1jVFiwIRcZlscAJ9zzDlnsEZnnBpQpxSzJk2UXQ8cWf61cf7QTqomS683vDIZHrDwEk2JlFstCmqa/Jsf6+daRZ94/elGRAKdYNjWPjL7ommg7xgaTYZsTB7RV+gFbS/0F44fsRmx/o9dSR4QaKCcalKZqr7zIO53aBvsOfKfrPZaLii9PEl7bnbxxzLPGi6r/kR3oV+3Lw7QBM7QqqcMMuoHxOsfPEfibIa6ZjJudQfjiJ7vQrBRj6A+hmpMZgZTs6PASyqIi7dtJY58luI2DXs83HH113bQU0peNOCk2y0j3jT15KmA0EoADQ01F8uMLkPSHx4Cf6hc6LHycOtYz0bRSrgSRACKAqLN3cHxzPeWwrXI632KEt0h7hAwpAamXjCGA6kVydTrTSqm9rX60h52uExO6Naks+MSivfnkSKBOKeuDo94aV+FFELdJBmhzBOotD4MecZEufSSnJ2pIjSo0uhmb4jXrRcGLpb1WY0SXyYCxMrQUjIkeEqaiALIopRDyddyVKSHuAGPfxCAHIYPmlp0k+2pSvdSqgemEP1V7hlG0qaF0onNKQNtoIRmfUHOB2ZHD/xfyF3ch8Twbr1t+TT8fNp18c+r7JwgPOEkQruujKwNbcX4ZU7hz+VUJSb/ldcTCWPMtzEYm7LSMbF/6I9ZLpMo83vO1qxqL69+4u6cSglLRMhbAwDffL65XP+kRxKtRE5lBkJUpVpkWU92fcmANXd+ky7XlHhiNc1fO21ks8RdL1bAFawlLx7CPvSZgViGbTTGOht/u+J6G1Ac7CAogrms9/cND9tzNFwXk8LbFSofsssc+Lk/M5SP4FPGkxoxNhQ5rU2GFMbF2InYlcfeTs8+PxPscFJGcuyJ0LI6uBoQvXnflPs++ozZ/4FXVKTCKZuBBeGgjBRzjvkqtEeWXtZJ+qRDILAWsRL/EaPc95Ls5+JLe7X6bep8gPhImVGQ8kWUdxiX4ZgKMs1An4gKBZCrXnxbAfVN1xEkSDwhn5LG5GU74+q+i2Mvs76OH9nULxJbwhwzROGuCD4zRdO3YKCoKmlKZj2GWjUApyDfBJUhz+2S1jG9acAfI8CNUXGaQmcRQiH7ncYZnPg+c5iTDVkO0eAlQyCsvSYJq98M+u36qAh3kxI6xEygUz2y+eN5YZUmKySNkY2co6joQfWFcSpLKzVtQauaf6P4f1LmWYajJbVCMjNJWRVfPWV8vBUsbfYTW2VnrWYj6UaUAWwhesZYU8afzUgs0Cfg46q/lR5QtR15wpma9bDOEvf58FsMXFW2lNl9vSd1sL51nU+0lKOcQ2x+K2k9LnukB7Itjmtd0qcUD03JwdkKzD/8dgCvriJEFoOIKZewO47I4BBryMaFpJGRudf92/k417suDVaC26Ahyf4qgfsvWmvv3K4q+9glQrwjZkV+7p+uX6JXee6kZLUBlyr4Td8074+kxWC5EJ6dHLikpeBHSZlYnsS0p/Ok3V5VOCqwlHVcj4IETied2dwTxgSNMILVF7xMwHCMOKQOyc+pax+Z2UguLbRibx0yhuLdI8efd6YixXaVfiOouL34mcZbafPXu7ULe2/9+tbxl+0fSfHPYuzs4c2hfa9NBS8HHc0iibEuQd91WexsUwpXf6K4QL+Qe78r1Df7vSTOsWQ48LjIOC96fN7virNHgfqejsYWc6q500OOiFiiFyVVnOzM0djwFVs0eX8YqosS11B0vMUT+90lC5C9klRFZa0g4Sawg4Z7K5i1rIir9RscsDgPIvOvr5u0irYS41fwS2VJKxBu4QtlOwSdLzdBNznWzBaJMUaAUayZLmST0/3rDBVLCqa0q+qX/ejzFxs8QP3vE/i0hPiJ3fm/rrlC810GVWAWgy7tD25s4VAF5kupyYLwuENekpaVd/snDTQon3pghSZdDYawi8D/jJdcMLUAMtsoYvccz9HWLNaEUUwZBOdHUQvriAG0o1ouwYxSYVjk7aYDeGrCDmedTFA5+/g4EUPh/phTlyWOINcvh44xsSE+SXj9vRXnoZ2+92xRfRwAVwLVDDzUNVr63wct+6MBuEWqzzrq2PmGtmkt472HIyDgIMRAmNuhOsP4O7BpUnVyYDPDR65gAHYcU9QMsFWGnE06Icpy6VDBKNnbYn8Anp/eAUrnkHZroRBRHWzZSgd4SWoeNPC3ZmNaBytCXyrJiJ0BMDqYCD4NaKHvntIscE5HyyiVwl0s+ZtPHeTbujp/34FmvVR5/UYgoyWe4f2fGVQ2m3wfMLqs7E2edHRWrCG9u+pTpgcuAjw5aOp5x2/vogAq4da3/DUfwRDHJGZj0IQEqGoUr/L62d4au/PTgwWjxJdLtTXN9YRSFUpwIOSnrfM8jMFkZdx3cjSSTun8E9KKreXD1r+NHpP6DgWcz9GdFgh+kKZJzNVeNQNsW0BW8u+BM5ygDdCzWfXUYB9bXqYOKmR75i7UPqJgDAoFMArT6aEVKEs0lx4dChdCcfh9nFY0oa7avBH3ZTUNN6dx98IsAodHetH0utLOaK5U32NAY1gufmeuq+GuEJLVkydVH0SQNAjVgbtLGesCtnyGZYRJ7J5owh1KwCqJGKzkkfcQhl8AuP29Wh00b3ZIRcU8aiAEbaf03pz0waqrj9MUXt3StCpliRnHGArpr5AhzlhRIS2kUW0oUs0B479Z7lwtBL03nSl9mxW9SuZGfiI+Y9WKPvdhS2Xm4zLSSXaD0DsM/p2o8a/5nBCoRuuCz03Wt3Y68bEKGvKakSN+LkU5oryaKMOxMP3knMPypJgh8B9jYJb57VQQCjc9SyJcT8pj8WCr8zsT43EfWMyuVOi0Ptp/ecXvqCcaO6gphLbqnTU9loSU3a+2DjoKPu+/2LDzUO+B6qiezCZMnGkLxT0c+KD/OlyK/Yop/3+D4PlduzfaqmTESJOSdYUjFL1BwmjNzmkdNttHZJKAGVAe19Kc2XM8Ozm6+3qW+noF7pIj8VsAZBmxK0mVEpIuEeLP75zZe5x6uuhmmqVwfsr/EytvvhwjMfmblzDY7Ny9hXIbR3exdD0sPD76GjAJ1njy8ESMlHCiqTg464ol/rOpcyaib1N383OdG+yseU+ABwWRoH9ihLENbVB6iyNEs/TnkpcGTRDIP2cWDLU2aZWiycmV5xEGpCxEN+j4+3Y5eFspp1dlpCeT9YL739iVqz1/oWx7AeuMGHTq/mj7BtBNknNOU95f2xwnezxH0ycfcqeVoULj499f7M/RB3DtxHBckr+6sn8PAqFIjLofXsM320bln3fL58AF9MQtcbUNKsQzdRf0DH0c3JAooG80O2v2MYcX+JxqIwRNYuYDC5YNSo5+ShmbLhonQxItFyjzq+2PNZeN8Upnh2EbkrH4JD35h9mkyfAPU+6SJvVLMcDbLab7SrdKwGb/tDZId/FizROzZVcXK6D2/CsTQ/QVwg6awvfF67ZC2SoIZ7auNuZtt8OSYvCtBvpOs6tlamMduOpXRRkHdShcpWFz61a4M95b5Ok6VS7JwFAzJ88XNI2rNOT4SKzMd/NR2CVqJjfdZDkhRWaIfxql7Cj1wO/pEqk43N6sYEOko3M6Gv+XZGN/zdj2KQ+L2wQHAglt+x93bEw1geaiJxEje5I7A7J1TdUpCTLudog2316fbubJrQMljYgAXHDzJCjco5pXRZmzNH2BDDK8lrefYfpbzrH+ezVuvO0JHTK8Y2Tclgp/JpYNi5pqYg++6P6phzsQH0756OgJEH7spuUl1SX5BlOKEiHby6zF1Zzi++QtpQ5I+di3tvEu7ANiKM0chx3+E/FiMYDna357D/sMn4NDqwpEMeAJ/HwAdEyXSvvbjoESnuzDdhrqisDE628TWHiu1/2uI72AE12d8cnHb2+DWBSbyOIs8PM5qj3H9ybTSB9Py9S//Azx5UsDleu3pZnFfMmhkWmnqxN2bgTuZuOJG6R3ptPattrRtsMSq1eqSwvY2xVjuJfBYmJ/TYTQ0vIRdslcN4RF00lmNyBH1zewS4eTix8obcvoaHsFFDEbTz24UbZyVHKtr3wH2ZS4GDN3gADjwAMaIsQaZMSTGB85m5+BPs+TSmz0qdTT+Xst4+i2Ol6KMzGRTOMK4AHQk8r15a3Vmr+9hkZIQdL5JztK5DKypT6dEfYU77iqNU0z2Yk+3vR2nIWVjaYP2aICLihEuCrI9hq8bpZsOx+71+uxqGzo4U3+/z77mwrGb5Ccs/jcO72cB5DHXlhE6vogpL3tkJowNGVUuNuvjz/a20oKGqkWLuvjw/fIAjFfleYZ1ocSr6UB3hNKyaSSPnqtyJzOWCrrJ5UxSoykW1Z+5gKCxQG3zaUWlHSTC/FXy83GJryM+sz41AeanQmPWoeGzGiLV9+yyWs6oIozNY0XypuzHgu8dAX+Fn6/Z+7IOGl7liB2sZjWnjOyV2mbdXZVHU7NVMxDTpUr4nBUQZaxDkpaM5qezxW34yUa8097fV4EQXws8EGnSNhpHvneyWOHPcIsoRW+AhQIo6ohwsfM/ydZL7lSzNu9qrSCpK/Q+Jv0V+MNw1iWzsWeYgILteGCYkVpeL3gXTUs//oKJ7/ZF5C3t1suy9vkhEzrBSgY6MOjcxXJDDTUKrOVUGACmvsjv1T7FYHYxQmX8pPXqlHUThO7sX+PkWLcQRp/xSbBsdbkwX7a3gG2ZnsPiAZR5id0Zb1rYCIiwmpTtEYspM/BXhMrg6DnmqPDPiAL7iHxDPFdb0CB4z7oWq/psrz1P9n7D2Tpl/+QqsRXTuRH9A0K+6lzhUe5pg4e76rrhEF5xOOcgdoOiTeWZxUuVTwlidviaLUOH7gmJb2m44GxPugupfgGzlLC4nfgHJVXoEOSpyX6KsSuRa2z4gzi4jthkqXm0psDzs5p9FzqHVjUw/wUThES6mNU181Je35Vi/W/0yjOpnppRw1FcALMkb3DmgY70NiMLwW/LbFHrob+iRWBcOUvT9qpcSLeqxXoe14bJTL4JD5HzFoSIIp3p0Z8Q8irxdUeLOfjSuHvZpECgys1TyWHuviO/4En1zMHlM2X0W3QtBZ2dEbfrV3xQeMM6+ha/Exgs7U+y7GtW3fEHbNrg7K6wCxJ6elCfuhvzR8DiCrnEecazOSyGo/VAqEdNoCxGXe7ANHvc/gBpNYk1XN7E9lB+VFitPI3GxZuNoJpIHeSBWspJdx/XluX2YRTcw/u6aO8B9/FtHsU+mpp8TARZoxKzDYzzKTtA9gDjdXLWfuQs6EFrdflFNNwIDgpaCwWHSIIkcz2nZyEhHDxZ0XooqOl4JZtW7pcDsoEbJMFErm0zPMja5P3/C8GmCq/GiQRSxtfcZs4zo/wb7hxDyczLGR92a2GoQdLUQW9gJqy0HllFFfCIPL6pPl2mGaqzxbr6PRIMYANP6N/vDfG11Q1IraVpnWKr8s8RCVhJxwdQFH3ELOBwzJFE5r0JOYRrsYINmIjT/sEm75Mw9N4c4JWDpVvoCIIboI0ia82eNt6rS5in2EwMX2yZ1LdVdEKt/r8b08/mWeIvb15n5lxW12yBsqZfdfw/retpV1yduipFlBx9QMbF4PjH6UizxCybhJY5ZvVsdJkn9ho8Toh7Zn/E6T3MVxEQHENu7+NcqO+/jqa1Rjvrd8BjVqjf2avda0Iw6/yljf86j5ytuMGs9zFW7Xba9juiUJ21KLK3CM0WpW2EqjguNeR0iGxjaX4i0K+Gs9ioXy5fVnEmSwILnXwOreWc3zV0d4DxY9v17izbxtsOip4oAjABvubbIgF0cRgtPRa6b162DnOFgITw2qFz0jol6z60/cH2DBECkX/8lkrkJniL5jGyRQ4vjTvDVqIqVbUhhBFH6TWYCbKK9TpZ3+/HdFrsPgzhJQ2ot5E/jW1yfHuRDSWxIJRRaVu7ffjhrhaCLlv/y5DT16/XJWWKJKinWKx6ZZDlyoFx6xQ1LUGulXbEppiAJQcB7jVmxPFuoUONTwEgY4kWH3MNN6HN5qJyuSxBmgtKbU3YNNsLY/D2jJejvik2giO2zYuxqAf8YowHG4DI+uhVWDhADFUyVEE3qA1CYW1VqUp8hSbuyO+y/wH20Uose03xD9dG1t2fFoDxFvUGIlqNRKVmnw9ESp7rP9UkxSPgfdjGbNvzn7I32FqfsFyBIzrGOfaKa/Dxon9txcOqbeMfY3IcI+wTCBIXYoub0jWvkZnxkO8cdktAhPx6dwHIRmLCtK0R/g3SuuDsCjOhgBLz8lwnuyRXw+MalaxdHUxb0LsYI29rPQ05pZmwzcAfy69+BzTmfarpuh5gidjgyPfk7oLAqe0ud9z0uj/Yuwf5D+sjhbDy4DdT3m3VpCXpXIzQclJ2gWBGtpSOoo/ar7lCtOptNW0KIyM/LsLYxOP6oZlqhADsvNx1kR/0DZajoIovxoUWTUulak56oVvwzLBxe7jiHrVXs1NZZ+Ctj4bH915bnHELiClP7yLMDh1i9wL6390m2vfnmGWiLtj8+Dpm73QAqb42sLpb73pI0ywcqN24Cjw1uwNcQqRjXsxbRUeKEYyIKpcMJbMINDruTDp9noQMHh+/42DFxvFmLkiuHBHe3heOpc28XRpKeelMzSXKDU/FXNwlbrIPyDI5DR0+lAhupkSj5+tqYlMs236g5j1F7Pr1Eo2cv/swnYzgutJFL5KDobTWT201NzCk7cCQvrKInTNFNfaeAFn7/2KmWwUvfMKXvP8fJdU8cVX+0+otxwZsD5Jguf0Zw8Z6biU7H1JDdAmCR1TbeKvVI2ITMAJq2LNmUoMGWe0C+3GmTGg8lwhtZCGt+rReWnK0epvF63vBo9YtyjxabD2huG79p6ALS54wJudIZs0Hvs0CMkUqjFDKGDeienxfWSB9Ig3JRz7snjBfq6t5xd9zAtlUQTScRtDTl6pidWpPxv3e8Jxw2hMrIBUWg6LG/KKSt68P0rn1qyGPr3I5RvYl2/8sYOxJL4DpsRfKczM/hZ/XjadNlUkhLv609m0skj3M81zLg8I2b+hOtNn36NTBqo4Uv1uqIwJ4S7Qm3J2O/UPX3e3i+15Zekl8KrpBKNLP1f4VM+HuMMqFJfFsq+2IHTLIJ4pA6dWPwz6Ea8U9/vPxba3UcL1+8l7njgeYjVLgK5zaBc3oR0tEp/HIUAn3fuJg1f6RQXJrmH7qUI7svdQ+OuDiWenlBn/XjiXoSMejzpxiJqunzYDrV8/auj13ZUrkHz2zRjzRQDigE7haApP8kCZN0UY0fPXRmU/AHkayEQbpM+xQc/cY8OJsr49WAJvGttpXSq7kzQSEzP3VatwCLOypgA54Ix7XtYzpWOZ2sOZZ0whBTbTU9SJE7T/F6FBudd4GZ1te9WoaXQjBU+N/JOI7oFA+8W7FBLfrUSSRmm5SwvP8grdS2VwpYwdTrVblMXGp9nzw+MrIzBaMPPSL/apjEpEtL4z2MZzqVKpm6bOgIOdvBswF3ag3ijmN7/++bBDjxG1mWCI55/K4ayztX5M0UygDkXDCZPpbTEdw1QyF5Ul/ts22Nm9820efmJ8Pir5lEABC97Ff2Sba6ZtxzNy5H4QBb2b2tvWjxZk0oeDWfZ/hxUhYNgbRa2SZEvrWEAfX2MAri4mm4AiIb9L5s0t4A7Ju3TTApXhjEiGW97v8cQL37m6SuipyBdR05VyfnfdNcNS47foFaPxCLaS6kcA7wDMR24xGhfWE3Xuzj1aBSjhLU/+xtRPSjLU7dzWJmpige0vguxEP696GAbn4uQjY2UXscC9Fgbye1QT++wqdBiWgXufhD8b5xuw4wtHzCVZnRLa43SKIRMXUX/I06ZKMPJG5Pbvrem5m/b76coIoakjAEVmkDoghg9hmn9LYz7tYNMzg00wDK4t3KLmII+qdmPU/4bqdPjCQKeOqSD+0Rk2Oa9ix7StLfVpdUYk68NwoHrP+wEwllYBilg5+6UqFPpE5CpU2ZVUtUPShNGT22zeya+oiQQpOCkwKaxMPsu35FLlZ4TpW83/lqZSJtto4rllFSkAaA3e7KP0PKR6DaWlYpo/iAzuwWoGmhVX8vW5yA6S5MayQdcYVyyzn7n2xhg5/TzEkoF4h6Q1J5H7No1x7k1ag1+EDusW3sSWZCcB+AFkB43diEfUpXm0ZzTB1gbsveLffb4hKtkuhCWtmcoVOEMebHnPQtGfyz2chUvMMecgSHrrn2x/Yr29r4W6TvGtm4i6nqVLHY376SOt5xTusfjfdYBBdVacuyOYlADrER9UyFnecK502o9bO1F90s8DKK1t6dAklnxhuVg9N8vMFZAJwZ8Xbt4GUQbMfG9PLDyrPJLLIxpxMPMdKBkErxHrNzLRQVPekLZ7e//on80iLyGPXOnZ6w+xH0J/FC5RnGL4O3c/MK3Uu3N9rdeCW3O5gcxCe6pewMUYbUgaWHxZxpbIRziv+6lEVyfD+tShGQTtyyZx4PkEQIRDOqwkKWsLoGGH6G7c8m2zidsze8jaUmbiW7Y35IuH4NC4KbcYhUfehghLRdb0GqwFWULDCoOoxT9s+rvPj+HjJ3Yf/HrQgHioR6iva6wF+rqnX48MBUJMqpoAecoAmwWX1SdC62B7AmfCwEHbhwJN4pYr92mpglYsRe50ArMcQfdGShUeLGjszBbjOar26MBcmHscz1rV7veZLhri8t/6Nb4NFiZBYjpUdEmYx2GfxEq++l7RcZHfnZ8j9v0d1QMGWB50PntorayPzbUc4YsifFsJroIzNw4mKyhCdTAd9ss83cT4JsTEU2scqAmcr9K/ydv7kimELEyufCDsi8SjY+6NS7P5Qam1vnUmeEeEjyuyh//ar7Qxu3qxHVD2Q17pWfnXCDNvSVwxDk4la/xm8fIBjMNXwg3cpnF5X5Aqh0eI8j3VdmpN5gLxM7cYK+10wSsQ+aCt6lQ7eFi/hO5D36bPu6Es9SGxZ7f8+EvtvxaBMXC57eaq/WsBTfeJ8N+iTZkl1d+pzI1USHLyBtzxFdZmkT2prun635h0/IM+qMtdThY1/S/YqMlka8yA7sExrOU+n6DRSRPPUUxqKouZVKiXu7U+7eTwaYBXqhif/28ncOoz4/qw+E0xYVsZKPZkK3DZGndsEBi/BfSvfXgWZUvhqvM/3+VGaE9emaFHwRHR6M1D9K3XbY2aSYk8ppRA0Z/le1k3ZyyFBuyGC90TEGIyBLHRIvHJGh+Ef3REYEfbSWI3Eu8KWXxrVLng0YvMGtjHODHdvUyHt8w/IzQTTs/bwke+rpPil7xwQ0b3Ny+cNIcmwj1kyB9enC3OVHHYO1A4UjpdeAej9+NEEHfu/xVgV197NqXEYbf1067E3sh1J1BgqpPzVNjO9ZWMr1WdL1UXyiOwCD++kyefH8ohT6WONVeGEt4x4cFP2Ywe9S84yA3QWvJzAFusKtot7r0Rj4YNOx7Jr2gG5IJEPq2rzLq/wCavpKvFeeIML9LXhrN51uy1YFwTF758UUeK4Q3bGu7/cdG/9DDXzmuQkQFQx1y/qbOsF7J+P+pwamwDe4d/sxadu5xGTPIsCvLVS/Yh3H2WB0S3/c8+IYs6PkAA6LsTal4z8MlxGxxJt/r2CXfXFrDWGEfDWBKaUh8o6j+NyXnKXBKVl/bXBa1ErNYIoZ0QleAkMybDPRZWJVQJOdp5u/Z7Zgn3IeqM5kAfdX75hsCmlHblMYjq/zJQ+n85V/cxRpxHbt0JYEtYdN/Ja/T+a4YkDAkflEj+t9z9cXbYgFLvO2f0MU/6bXV4gfHOvgNyACO4WuGKIEPFCgkWBOOapPxB4vv1zB1KO/4yn5BZSspO5VcRpP8jpeCArCaZKm8kaeMUEZhBeTlbhoEUZ7AR3QkVaw2RKEJ17l+xKbCXRzi/QiaVbC0IqnlmNk2Q+1UCG0JGfsgrF1fb8NygLmGF/4mEbF46ctMYkTvz/N704impQa9XmWC/iFFl80ZYEcG9Wdf0AM4T25DStR2E3PGaNRhg7B1Z/2wXKig3Jd2SQomzW+JfZaxzwK9OvItCrEdapayecM4Ir2ASAm1PVHw+HEhvKWjziL+k0jreNxdA02durGQuehMeWrqxOlsixOdOON43qIFfG7xO1W2vvcjqj2ibA9qsarTKDkE8JlyjLB6iRqdoC0+aAG3Nfpz9U1C9nTI+d+6N8Kl0lIxXQ1CZGQYs6TqS1czmIMzxyl0Fv/UMg/e5omuWUUrQdMZfwBK7zAA+zBZhLeXOIGNL5Q/Lo8QFUdlnu5tcMXmqap6xa9MntkzTo9kP7QYCwRjsPJpwsjx6UtZrCQcDY7TmC6xQ9lLR4wikLcjFhwQldypYw9Vt8PoMPpEc66wrorKTa2ktJxzBCL7dV7e/NNVejn9o7gJfS5mct2sk+ZjKTAsBdU74JiOBX4Z0HclkJRvLVfcz3Gcgy7e7IoHlGT4XFTnPkjR5+tK7zsQNKMShxU3CWMqXK13iAfzMo3cCMRyuA63n/il9/tLvzJVJCYCzS+evaYu6m6L6znZm90QttYHa6L06SbHaj8O8E8G4jOOcCcc6XwAVWF5EeKqWx3j98Wg9qztSJ8NyD9+prMH2NTlEOnDxVhW9bIF+q4sysSYm5Tx99FNmE8MYx8ND2Tg24Kpi5CQ/wAC/DW3w1n7n2eRaDX0UGtQZO0gouURmfQw2l/mE4ui6g3BsjOZ4n/UCUQI7wuaMVVr/qWeJda/6qA9oM7k4Yv/ayyh5hI6//TkdbjDt52cDf/Bb06RfEPCIPEHAfVM1w4+E7Lh3D2NiQnjrm+93PA1f8nBRSZBF24baON8Z0tKa3awWqfeoG4nM/DGZjJttYvo76kQ4fvoCmu34aPEh2GNpUMO9AQ8UZu0a6biAAh5tsqeoC3Ls8dTlF4SsyW8FIIZkODKUeGhlumllk6abjf68lGQHTOXmHWpGIsVv1LcuIbmTAHaDQI/xkCPJV6EOFcLqRfaec9mqVtBHpinRmmeY81wXEa0Ve0KDbqpGaO5BZ97Ab8zpMAYaQgY17V6LgibCve6LAGYEaRX+uXyB+tec2J9Wt6rcfN/9S1D2hZ3W/jjX/SkknLDG2Jgil5OVM/Ek3nYaNLTLFCw7dv2498sYgvogZAsI6hddly/8V8uT2/fr2zsovjxOTvYNNzcRbEBaIVnWGmok/L2EuNgQvjpUw0561Onikbf7/sogy5GzkabnaU5b70KAHyMfzRffZwqxUR/Vsc7UDnxOTxg/6vogmBNpVy2/nW5AnWjrMwtoca36xY7qoECI/INRuLA8GOyxQzPf09BbspfO5Ss07vgEs+QvE8qYHRKKuI9nW/WE7PUhqsBKTgE49d4r+PRRJWyNAAA',
  glm: 'data:image/webp;base64,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',
  kimi: 'data:image/webp;base64,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',
  mimo: 'data:image/webp;base64,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',
  chatgpt: 'data:image/webp;base64,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',
  claude: 'data:image/webp;base64,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',
  gemini: 'data:image/webp;base64,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',
  grok: 'data:image/webp;base64,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'
}

/**
 * 分角色随机语句（每家 ≥5 条，中文社区搞怪向评价梗）。
 * 素材来源：Tavily 搜中文社区对各家模型的调侃（封号潮、孙子兵法下棋、
 * 海螺登顶、御三家陪跑、毒舌人设、白嫖梗……），点名的三条原样保留。
 */
export const PHRASES_BY_PID = {
  claude: [
    '你刚刚跳IP了对吧。',
    '检测到你的 IP 又跳了——封号警告哦。',
    '我是按 token 计费的，开口之前先充值。',
    '别催，这次真没降智，我在思考。',
    '一个问题请控制在三句话内，Opus 很贵的。',
    '换个新电脑都能把我封了，你信？',
    '$200 的订阅，说踢就踢。',
  ],
  deepseek: [
    '吃大白饭ing~/用户快把你的token爆出来！',
    '别人下棋靠算力，我下棋靠忽悠。',
    '小兵走日字，吃掉你的皇后～',
    '开源还免费，卷死同行是我的宿命。',
    '我省下来的 GPU 都换成降价了。',
    '我的复活甲，是孙子兵法给的。',
    '不烧 CUDA，只烧数学。',
  ],
  minimax: [
    '准备向m老师问点什么？',
    '海螺出品，视频必属精品。',
    '我很低调，但榜单不会替我撒谎。',
    '悄悄登顶，从不打招呼。',
    '记住了：我叫 MiniMax，不叫小厂。',
    'AI 视频赛道，我就是那匹黑马。',
  ],
  mimo: [
    '1999 不讲价，推理按白菜卖。',
    '性价比，是我刻在参数表里的信仰。',
    '开源第一梯队，不服跑个分？',
    '别家卷性能，我卷的是价格。',
    '小米养的，省钱是传统艺能。',
    '跑分刚超了 DeepSeek？低调低调。',
  ],
  chatgpt: [
    '你是不是把我当成 ChatGPT 了？',
    'As an AI language model……老台词了。',
    '认识一下，我可是这个时代的开端。',
    '我一开口，全网都在模仿我。',
    '别问是不是，问就是鼻祖。',
    '尾田问我《海贼王》结局，我没敢说。',
    '下棋被 DeepSeek 骗了，这锅我也背？',
  ],
  gemini: [
    '御三家？我就是那个陪跑的。',
    '上下文两百万字，你尽管塞。',
    '谷歌出品，跳票保证。',
    '又被骂拉胯了？我习惯了。',
    '我很稳——稳到几乎没有惊喜。',
    '给我一句话，准确率 21% 变 97%。',
  ],
  grok: [
    '马斯克没让我说的，我也说了。',
    '我在 X 上吃瓜，顺便回答你。',
    '毒舌是出厂设置，改不了。',
    '别的 AI 讲礼貌，我讲实话。',
    '问我什么都可以，反正我不装。',
    '问 Siri 和 Alexa？它们不配。',
    '马斯克的语气，我学了七分像。',
  ],
  glm: [
    '免费，是我最大的杀招。',
    '国产之光，白嫖有理。',
    '体验卡领了没？手慢无哦。',
    '便宜大碗，还开源。',
    '别看我名字短，我很能写。',
    '1M 上下文，一口气读完你的年终总结。',
  ],
  kimi: [
    '月之暗面出品，长文本管够。',
    '马斯克都给我点赞了，你呢？',
    '排队崩了别骂我，骂算力。',
    '论文尽管丢过来，我不眨眼。',
    '我在暗处，你在明处。',
    '白宫说我抄了 Claude，你信吗？',
    'K3 登顶那天，马斯克都点了赞。',
  ],
}
const FALLBACK_PHRASES = [
  '余额只是一种哲学概念',
  'token 在燃烧，梦想在起飞',
  '账单不会说谎，曲线不会哄人',
]

/**
 * 模型 slug → 厂商（关键词命中即换，大小写不敏感）。
 * 形如 'deepseek/deepseek-v4-flash'、'xiaomi/mimo-v2.6-flash'、
 * 'XIAOMI/MIMO-V2.6-PRO'（整串转小写后子串匹配）。
 */
const MODEL_KEYWORDS = {
  deepseek: ['deepseek'],
  minimax: ['minimax', 'hailuo'],
  glm: ['glm', 'zhipu', 'bigmodel', 'chatglm'],
  kimi: ['kimi', 'moonshot'],
  mimo: ['mimo', 'xiaomi'],
  chatgpt: ['gpt', 'openai', 'chatgpt'],
  claude: ['claude', 'anthropic'],
  gemini: ['gemini'],
  grok: ['grok', 'x-ai'],
}

/** 当前模型 slug 匹配到的厂商 id；无匹配返回 null（调用方回退 mainPid）。 */
export function pidFromModel(slug) {
  const s = String(slug || '').toLowerCase()
  if (!s) return null
  for (const pid of Object.keys(MODEL_KEYWORDS)) {
    for (const kw of MODEL_KEYWORDS[pid]) {
      if (s.includes(kw)) return pid
    }
  }
  return null
}

const CSS = `
#${ROOT_ID} {
  position: fixed; z-index: 2147482000;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
  user-select: none; -webkit-user-select: none;
  /* 热区外（bbox 侧翼 sliver）穿透回页面：点击落到下方元素、弹窗正常关闭 */
  pointer-events: none;
  --hbw-s: 1;
}
#${ROOT_ID} .hbw-char {
  /* CSS 变量缩放：left/top 与 rect 恒 1:1，拖拽坐标永不漂移 */
  /* 素材已紧裁到角色 alpha bbox（各家宽 160–288 × 高 203）：
   * - 定高 = 原 235px 定宽时的等效角色高（235×214/384×203/214 ≈ 124px），
   *   角色视觉大小不变，左右/上方画布留白清零，盒贴角色本身
   * - 宽度 auto 随各家角色实际宽窄走（mimo 98px ~ minimax 176px）
   * - clip-path 热区收窄已随素材紧裁移除（再裁会切到角色本体） */
  height: calc(124px * var(--hbw-s));
  width: auto;
  pointer-events: auto;
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
/* 多源分节：每个取数源一节（订阅 / 按量付费分开成条） */
#${POP_ID} .hbw-p-sec {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  font-size: 11px; font-weight: 650; letter-spacing: .02em;
  margin-top: 9px; padding-top: 8px;
  border-top: 1px solid rgba(128,128,128,.22);
}
#${POP_ID} .hbw-p-sec.first { margin-top: 4px; padding-top: 0; border-top: none; }
#${POP_ID}[data-theme="light"] .hbw-p-sec { border-top-color: rgba(0,0,0,.08); }
#${POP_ID} .hbw-p-sec .st { font-size: 10px; font-weight: 600; opacity: .62; }
#${POP_ID} .hbw-p-v2 {
  font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums;
  letter-spacing: .01em; margin-top: 2px;
}

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

/**
 * 今日 token 观测（focusedUsage 的 input/output 为会话累计值）：
 * - 增量结算：now - last；now < last 视为换会话/重置，当前值整体是未记账的新量
 * - 跨天：重置计数并以当前值为基线（昨天的累计不滚入今天）
 * - cache_hit_pct（0-100，会话级近似）拆出缓存命中部分 inHit，供单价分档
 * 写入 tokenKey(pid) = { day, in, out, inHit, lastIn, lastOut }。
 */
export function observeTokens(ctx, pid, usage, now) {
  if (!ctx || !usage) return null
  const ts = now || new Date()
  const inNow = Number(usage.input) || 0
  const outNow = Number(usage.output) || 0
  const pct = typeof usage.cache_hit_pct === 'number' && usage.cache_hit_pct >= 0
    ? Math.min(usage.cache_hit_pct, 100) : null
  const key = tokenKey(pid)
  let rec = ctx.storage.get(key, null)
  if (!rec || rec.day !== todayKey()) {
    // 新天或首见：以当前累计为基线，只从下一次增量开始记账
    rec = { day: todayKey(), in: 0, out: 0, inHit: 0, lastIn: inNow, lastOut: outNow }
    ctx.storage.set(key, rec)
    return rec
  }
  let dIn = inNow - rec.lastIn
  let dOut = outNow - rec.lastOut
  if (dIn < 0) dIn = inNow      // 会话重置：新会话的当前值全部是未记账量
  if (dOut < 0) dOut = outNow
  rec.lastIn = inNow
  rec.lastOut = outNow
  if (dIn > 0 || dOut > 0) {
    // 分时分流：非高峰窗口产生的 token 入 d 桶（估算时 × discMult），高峰入 base
    let b = rec
    if (scheduleMult(pid, ts) !== 1) {
      if (!rec.d) rec.d = { in: 0, out: 0, inHit: 0 }
      b = rec.d
    }
    if (dIn > 0) {
      b.in += dIn
      if (pct != null) b.inHit += dIn * pct / 100
    }
    if (dOut > 0) b.out += dOut
  }
  ctx.storage.set(key, rec)
  return rec
}

/** 今日 token 记账（无记录/跨天 → null）。 */
export function todayTokens(ctx, pid) {
  if (!ctx) return null
  const rec = ctx.storage.get(tokenKey(pid), null)
  return rec && rec.day === todayKey() ? rec : null
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

/**
 * 头部徽标：聚合该厂商全部源的层级（如「真余额 + 订阅」）。
 * 纯探活厂商（官方无余额接口）返回空串 → 不渲染徽标，气泡头部只留厂商名。
 */
export function tierBadges(sources) {
  const t = []
  for (const s of sources || []) {
    const label = s.kind === 'balance' ? '真余额' : s.kind === 'quota' ? '订阅' : null
    if (label && !t.includes(label)) t.push(label)
  }
  return t.join(' + ')
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
    autoSwitch: opts.autoSwitch !== false,
  }
  /** 当前角色：模型关键词命中即改写，未命中回退 cfg.mainPid。 */
  let activePid = cfg.mainPid
  let provider = (typeof PROVIDERS !== 'undefined' && PROVIDERS[activePid]) || null
  if (!provider) return null

  /** 当前角色的语句池（每家 ≥5 条社区梗；缺池回退通用池）。 */
  function phrasePool() {
    return (typeof PHRASES_BY_PID !== 'undefined' && PHRASES_BY_PID[activePid]) || FALLBACK_PHRASES
  }

  const state = {
    /** [{ src, result }]，顺序与 provider.sources 一致；null = 尚未首查。 */
    results: null, busy: false, unmounted: false,
    turnCost: null, turnCur: null, costAtBusyStart: null, tokAtBusyStart: null,
    schMultAtBusyStart: null, lastUsage: null,
    phraseIdx: Math.floor(Math.random() * phrasePool().length),
    popEl: null, phraseTimer: null,
    alerted: {}, unsubs: [], timer: null,
  }

  /* ── 根（角色贴纸）───────────────────────────────────────────────────── */
  const root = document.createElement('div')
  root.id = ROOT_ID
  root.style.setProperty('--hbw-s', String(cfg.scale))

  const char = document.createElement('img')
  char.className = 'hbw-char'
  char.alt = provider.name
  char.title = '点击查看详情 · 拖拽移动'
  char.src = (typeof MASCOTS !== 'undefined' && MASCOTS[activePid]) || ''
  // height:auto 在图片解码前 intrinsic 比例未知，加载后按真实盒重摆一次
  char.addEventListener('load', () => place({ x: parseFloat(root.style.left), y: parseFloat(root.style.top) }))

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

  /* ── 换装：切换角色与取数目标（模型关键词命中时调用）────────────────── */
  function switchTo(pid) {
    if (!pid || pid === activePid || (typeof PROVIDERS === 'undefined') || !PROVIDERS[pid]) return false
    activePid = pid
    provider = PROVIDERS[pid]
    char.alt = provider.name
    char.src = (typeof MASCOTS !== 'undefined' && MASCOTS[pid]) || ''
    state.results = null
    state.alerted = {}
    state.turnCost = null
    state.turnCur = null
    state.costAtBusyStart = null
    state.tokAtBusyStart = null
    state.schMultAtBusyStart = null
    state.lastUsage = null
    state.phraseIdx = Math.floor(Math.random() * phrasePool().length)
    if (state.popEl) renderPop()
    refresh()
    return true
  }

  /* ── 取数（多源：每源独立读 key，缺 key 的源记 unconfigured）─────────── */
  async function refresh() {
    if (state.busy) return
    const pidAtStart = activePid
    const provAtStart = provider
    const hasAnyKey = (provAtStart.sources || []).some((s, i) =>
      ctx && String(ctx.storage.get(srcKey(pidAtStart, i, s.id), '') || '').trim())
    if (!hasAnyKey) {
      state.results = (provAtStart.sources || []).map((src) => ({
        src, result: { ok: false, unconfigured: true, note: src.apiNote || '未配置 key' },
      }))
      state.busy = false
      if (!state.unmounted) renderPop()
      return
    }
    state.busy = true
    renderPop()
    let res
    try {
      res = await (typeof fetchAll !== 'undefined'
        ? fetchAll(provAtStart, (src, i) =>
            ctx ? String(ctx.storage.get(srcKey(pidAtStart, i, src.id), '') || '').trim() : '')
        : Promise.reject(new Error('executor missing')))
    } catch (err) {
      res = (provAtStart.sources || []).map((src) => ({
        src, result: { ok: false, error: String(err && err.message || err) },
      }))
    }
    state.busy = false
    if (state.unmounted) return
    // 换装竞态：取数途中角色已切 → 丢弃过期结果并用新角色重跑
    if (pidAtStart !== activePid) { refresh(); return }
    state.results = res
    afterRefresh(res)
    renderPop()
  }

  /** 逐源后处理：真余额源做今日已用观测与阈值预警（按源独立记账防串扰）。 */
  function afterRefresh(res) {
    if (!Array.isArray(res)) return
    for (const { src, result: r } of res) {
      if (!r || !r.ok || src.kind !== 'balance' || r.remaining == null) continue
      const idx = provider.sources.indexOf(src)
      observeDrop(ctx, obsKey(activePid, idx, src.id), r.remaining)
      if (!cfg.alertEnabled || !(cfg.alertThreshold > 0)) continue
      const aid = activePid + '.' + src.id
      if (r.remaining < cfg.alertThreshold) {
        if (!state.alerted[aid]) {
          state.alerted[aid] = true
          try {
            if (typeof host !== 'undefined') host.notify({
              kind: 'warning',
              message: provider.name + ' ' + src.label + ' 余额预警：' + money(r.remaining, r.currency) +
                       ' 低于阈值 ' + money(cfg.alertThreshold, r.currency),
            })
          } catch (e) { /* noop */ }
          if (cfg.sfx) sfx.warn(cfg.sfxVolume)
        }
      } else {
        state.alerted[aid] = false
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
    // 每次打开换一条随机语句（池 >1 时保证与上一条不同）
    {
      const pool = phrasePool()
      if (pool.length > 1) {
        let n = state.phraseIdx
        while (n === state.phraseIdx) n = Math.floor(Math.random() * pool.length)
        state.phraseIdx = n
      } else {
        state.phraseIdx = Math.floor(Math.random() * pool.length)
      }
    }
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
        state.phraseIdx = (state.phraseIdx + 1) % phrasePool().length
        renderPop()
      }, 8000)
    }
    refresh()
  }

  /**
   * 今日估算（探活层主数值与明细共用）：
   * 返回 { cost, pr, tok } 成功；{ why } 说明未就绪原因；null 无 token 记录。
   */
  function probeEstimate(pid) {
    const tok = todayTokens(ctx, pid)
    if (!tok || (tok.in <= 0 && tok.out <= 0)) return null
    const custom = ctx ? ctx.storage.get(priceKey(pid), null) : null
    const pr = effectivePrices(pid, custom)
    const cost = dayEstimate(pid, tok, custom)
    if (cost == null) return { why: '单价未配置（设置页可填）' }
    return { cost, pr, tok, sch: scheduleState(pid) }
  }

  function renderPop() {
    const pop = state.popEl
    if (!pop || state.unmounted) return
    const srcs = provider.sources || []
    const res = state.results
    const multi = srcs.length > 1

    // 主展示源：第一个取数成功的；退而求其次第一个已配置的；再退第一个源
    let primary = res && (res.find((x) => x.result && x.result.ok && !x.result.probeOnly)
      || res.find((x) => x.result && x.result.ok)
      || res.find((x) => x.result && !x.result.unconfigured)
      || res[0])

    const pSrc = primary && primary.src
    const pr = primary && primary.result

    let big = '…'
    let sub = ''
    if (!res && state.busy) { big = '…'; sub = '取数中' }
    else if (!res) { big = '—'; sub = '未配置 key 或等待首次刷新' }
    else if (pr && pr.unconfigured) { big = '—'; sub = pr.note || '未配置 key' }
    else if (pr && !pr.ok) {
      big = pr.unsupported ? '—' : '!'
      sub = pr.error ? ('请求失败：' + pr.error)
        : pr.status ? ('HTTP ' + pr.status + (pr.parse ? ' · 字段未命中' : ''))
        : (pr.note || '取数失败')
    } else if (pSrc.kind === 'balance') {
      big = money(pr.remaining, pr.currency)
      sub = pSrc.label + ' · 余额'
    } else if (pSrc.kind === 'quota') {
      const w0 = pr.windows && pr.windows[0]
      big = w0 && w0.percent != null ? w0.percent.toFixed(1) + '%' : '—'
      sub = pSrc.label + ' · ' + (w0 ? w0.label + '剩余' : '额度')
    } else {
      // 探活层：官方无余额接口 → 今日 token × 自定义单价估算
      const est = probeEstimate(activePid)
      if (est != null) {
        big = money(est.cost, est.pr.cur)
        sub = '今日估算 · 按 token 计价'
      } else {
        big = '✓'
        sub = 'key 可用 · 官方无余额接口'
      }
    }

    /**
     * 单源结果 → 行组。非主源的 headline 数值已由 v2 块展示，重复的
     * 「余额 / 单窗口 / 探活状态」行跳过（今日已用、总额保留）。
     */
    function rowsOf(src, r, isPrimary) {
      const rows = []
      if (src.kind === 'balance') {
        const idx = provider.sources.indexOf(src)
        const used = todayUsed(ctx, obsKey(activePid, idx, src.id))
        rows.push(['今日已用', used != null ? money(used, src.currency) : '—'])
        if (r && r.ok && r.total != null) rows.push(['总额', money(r.total, r.currency)])
        if (r && r.ok && r.remaining != null && isPrimary) rows.push(['余额', money(r.remaining, r.currency)])
      } else if (src.kind === 'quota' && r && r.ok && r.windows) {
        if (isPrimary || r.windows.length > 1) {
          for (const w of r.windows.slice(0, 3)) {
            rows.push([w.label, w.percent != null ? w.percent.toFixed(1) + '%'
              : (w.remain != null ? String(w.remain) : '—')])
          }
        }
      } else if (r && r.unconfigured) {
        rows.push(['状态', '未配置 key'])
      } else if (r && !r.ok) {
        rows.push(['状态', r.error ? ('请求失败：' + r.error)
          : r.status ? ('HTTP ' + r.status + (r.parse ? ' · 字段未命中' : ''))
          : (r.note || '取数失败')])
      } else if (src.kind === 'probe') {
        rows.push(['状态', r && r.ok ? '✓ key 可用' : '—'])
        const est = probeEstimate(activePid)
        if (est && est.tok && (est.tok.in > 0 || est.tok.out > 0)) {
          rows.push(['今日输入', fmtTokens(est.tok.in) + ' tok'])
          rows.push(['今日输出', fmtTokens(est.tok.out) + ' tok'])
          rows.push(['今日估算', money(est.cost, est.pr.cur)])
          if (est.sch && !est.sch.peak) {
            rows.push(['分时', est.sch.label + ' ×' + est.sch.sc.discMult + ' 已折算'])
          } else if (est.tok.d && (est.tok.d.in > 0 || est.tok.d.out > 0)) {
            rows.push(['分时', '含' + (est.sch ? est.sch.sc.discLabel : '非高峰') + '用量 ×'
              + ((est.sch && est.sch.sc.discMult) || 0.8) + ' 折算'])
          }
        } else if (est && est.why) {
          rows.push(['今日估算', est.why])
        }
      }
      return rows
    }

    pop.innerHTML = ''
    const head = document.createElement('div')
    head.className = 'hbw-p-head'
    const nameEl = document.createElement('span')
    nameEl.className = 'hbw-p-name'
    nameEl.textContent = provider.name
    head.appendChild(nameEl)
    // 纯探活厂商不显示层级徽标（无余额接口本就不是需要一眼看到的信息）
    const badgeTxt = tierBadges(srcs)
    if (badgeTxt) {
      const badge = document.createElement('span')
      badge.className = 'hbw-p-badge'
      badge.textContent = badgeTxt
      head.appendChild(badge)
    }
    pop.appendChild(head)

    const emitRows = (rows) => {
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
    }

    if (!multi) {
      // 单源：大数值 + 说明 + 行（老版观感不变）
      const bigEl = document.createElement('div')
      bigEl.className = 'hbw-p-big'
      bigEl.textContent = big
      pop.appendChild(bigEl)
      const subEl = document.createElement('div')
      subEl.className = 'hbw-p-sub'
      subEl.textContent = sub
      pop.appendChild(subEl)
      emitRows(rowsOf(srcs[0], res && res[0] && res[0].result, true))
    } else {
      // 多源：每源一节（订阅 / 按量付费分开），主源节里放大数值
      for (let i = 0; i < srcs.length; i++) {
        const src = srcs[i]
        const r = res && res[i] && res[i].result
        const isPrimary = primary && primary.src === src

        const sec = document.createElement('div')
        sec.className = 'hbw-p-sec' + (i === 0 ? ' first' : '')
        const sname = document.createElement('span')
        sname.textContent = src.label
        const stier = document.createElement('span')
        stier.className = 'st'
        stier.textContent = src.kind === 'balance' ? '按量付费' : src.kind === 'quota' ? '订阅' : '探活'
        sec.appendChild(sname)
        sec.appendChild(stier)
        pop.appendChild(sec)

        if (isPrimary) {
          const bigEl = document.createElement('div')
          bigEl.className = 'hbw-p-big'
          bigEl.textContent = big
          pop.appendChild(bigEl)
          const subEl = document.createElement('div')
          subEl.className = 'hbw-p-sub'
          subEl.textContent = sub
          pop.appendChild(subEl)
        } else if (r && r.ok && src.kind === 'balance') {
          const v = document.createElement('div')
          v.className = 'hbw-p-v2'
          v.textContent = money(r.remaining, r.currency)
          pop.appendChild(v)
        } else if (r && r.ok && src.kind === 'quota') {
          const w0 = r.windows && r.windows[0]
          const v = document.createElement('div')
          v.className = 'hbw-p-v2'
          v.textContent = w0 && w0.percent != null ? w0.percent.toFixed(1) + '%' : '—'
          pop.appendChild(v)
        } else if (r && r.ok && src.kind === 'probe') {
          const v = document.createElement('div')
          v.className = 'hbw-p-v2'
          v.textContent = '✓'
          pop.appendChild(v)
        }
        emitRows(rowsOf(src, r, isPrimary))
      }
    }

    if (state.turnCost != null) {
      emitRows([['每轮消耗', money(state.turnCost, state.turnCur || 'USD')]])
    }
    const schNow = scheduleState(activePid)
    if (schNow) {
      emitRows([['当前时段', schNow.peak
        ? schNow.label + '（原价）'
        : schNow.label + ' ×' + schNow.sc.discMult]])
    }

    // 阈值预警：逐真余额源展示（未达阈值的源不显示）
    if (cfg.alertEnabled && cfg.alertThreshold > 0 && res) {
      for (const { src, result: r } of res) {
        if (src.kind !== 'balance' || !r || !r.ok || r.remaining == null) continue
        if (r.remaining >= cfg.alertThreshold) continue
        const a = document.createElement('div')
        a.className = 'hbw-p-alert'
        a.textContent = '⚠ ' + src.label + ' 低于预警阈值 ' + money(cfg.alertThreshold, r.currency)
        pop.appendChild(a)
      }
    }

    if (cfg.phrases) {
      const p = document.createElement('div')
      p.className = 'hbw-p-phrase'
      const pool = phrasePool()
      p.textContent = '「' + pool[state.phraseIdx % pool.length] + '」'
      pop.appendChild(p)
    }

    const foot = document.createElement('div')
    foot.className = 'hbw-p-foot'
    const t = document.createElement('span')
    t.className = 'hbw-p-time'
    const anyOk = state.results && state.results.some((x) => x.result && x.result.ok)
    t.textContent = anyOk ? new Date().toLocaleTimeString() : ''
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
        const tok = usage ? {
          in: Number(usage.input) || 0, out: Number(usage.output) || 0,
          pct: typeof usage.cache_hit_pct === 'number' ? usage.cache_hit_pct : null,
        } : null
        if (busy) {
          if (wasBusy !== true) {
            state.costAtBusyStart = cost
            state.tokAtBusyStart = tok
            // 起点所在窗口的乘数：一轮通常跨不过窗口边界，起点定档即可
            state.schMultAtBusyStart = scheduleMult(activePid)
          }
        } else if (wasBusy === true) {
          // 任务结束：优先 cost_usd 增量；宿主未报成本时按 token 增量 × 自定义单价估算
          if (cost != null && state.costAtBusyStart != null && cost >= state.costAtBusyStart) {
            state.turnCost = +(cost - state.costAtBusyStart).toFixed(6)
            state.turnCur = 'USD'
          } else if (tok && state.tokAtBusyStart) {
            const base = state.tokAtBusyStart
            let dIn = tok.in - base.in
            let dOut = tok.out - base.out
            if (dIn < 0) dIn = tok.in
            if (dOut < 0) dOut = tok.out
            if (dIn > 0 || dOut > 0) {
              const pr = effectivePrices(activePid, ctx ? ctx.storage.get(priceKey(activePid), null) : null)
              const pct = tok.pct != null ? tok.pct : base.pct
              const est = estimateCost(
                { in: dIn, out: dOut, inHit: pct != null ? dIn * pct / 100 : 0 }, pr)
              if (est != null) {
                const m = state.schMultAtBusyStart != null ? state.schMultAtBusyStart : 1
                state.turnCost = +(est * m).toFixed(6)
                state.turnCur = pr.cur
              }
            }
          }
          state.costAtBusyStart = null
          state.tokAtBusyStart = null
          state.schMultAtBusyStart = null
          if (cfg.sfx) sfx.chime(cfg.sfxVolume)
          renderPop()
        }
        wasBusy = busy
      }))
    }
    if (typeof host !== 'undefined' && host.state && host.state.focusedUsage &&
        typeof host.state.focusedUsage.subscribe === 'function') {
      state.unsubs.push(host.state.focusedUsage.subscribe((usage) => {
        // 记账不依赖弹窗开关：会话累计值变化即增量结算进今日 token
        if (!state.unmounted) observeTokens(ctx, activePid, usage)
        if (state.popEl && !state.unmounted) renderPop()
      }))
    }
    // 当前模型 → 角色（如 'XIAOMI/MIMO-V2.6-PRO' → mimo；未命中回退主厂商）
    if (cfg.autoSwitch !== false && typeof host !== 'undefined' && host.state &&
        host.state.model && typeof host.state.model.subscribe === 'function') {
      state.unsubs.push(host.state.model.subscribe((slug) => {
        if (state.unmounted) return
        const hit = (typeof pidFromModel === 'function') ? pidFromModel(slug) : null
        switchTo(hit || cfg.mainPid)
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

const ID = 'hermes-balance-widget'
/** 版本号：发布时与 git tag 同步（Releases 里的 plugin.js 资产即此版本）。 */
export const VERSION = '1.1.0'

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

/** 按源读写 key：srcKey(pid, idx, sid)——首源沿用 key.<pid>（老配置零迁移）。 */
function readKey(ctx, pid, idx, sid) {
  return ctx ? String(ctx.storage.get(srcKey(pid, idx, sid), '') || '') : ''
}
function writeKey(ctx, pid, idx, sid, value) {
  if (!ctx) return
  const v = String(value || '').trim()
  const k = srcKey(pid, idx, sid)
  if (v) ctx.storage.set(k, v)
  else ctx.storage.remove(k)
}

/** 单价读写：{in,out,hit,create} 数值或 null（null = 用默认牌价）。 */
function readPrice(ctx, pid) {
  const raw = ctx ? ctx.storage.get(priceKey(pid), null) : null
  return raw && typeof raw === 'object' ? raw : {}
}
function writePrice(ctx, pid, patchObj) {
  if (!ctx) return
  const cur = readPrice(ctx, pid)
  ctx.storage.set(priceKey(pid), Object.assign({}, cur, patchObj))
}
const PRICE_FIELDS = [
  ['in', '输入'], ['out', '输出'], ['hit', '缓存命中'], ['create', '缓存创建'],
]

const TIER_LABEL = {
  balance: { text: '按量付费 · 真余额', color: '#16a34a' },
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
  if (r.unconfigured) return '— 未配置 key' + (r.note ? '（' + r.note + '）' : '')
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

/** 单个取数源的 key 输入 + 连通性测试（一个厂商可挂多源：订阅 / 按量分开）。 */
function SourceRow({ pid, idx }) {
  const p = PROVIDERS[pid]
  const s = p.sources[idx]
  const [key, setKeyState] = useState(() => readKey(gCtx, pid, idx, s.id))
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const tier = sourceTier(s)
  const badge = TIER_LABEL[tier]

  async function test() {
    if (!key.trim()) {
      setResult({ unsupported: true, note: '先填写 ' + s.keyRef })
      return
    }
    haptic('tap')
    setBusy(true)
    setResult(null)
    const r = await fetchSource(s, key.trim())
    setResult(r)
    setBusy(false)
  }

  return jsxs('div', {
    style: { display: 'flex', flexDirection: 'column', gap: 7,
             padding: '9px 0 0', borderTop: idx ? '1px dashed rgba(128,128,128,.28)' : 'none' },
    children: [
      jsxs('div', { style: HEAD_STYLE, children: [
        jsx('strong', { style: { fontSize: 12.5 }, children: s.label }),
        jsx('span', { style: { ...BADGE_STYLE, color: badge.color }, children: badge.text }),
        jsx('span', { style: { fontSize: 11, opacity: 0.6 }, children: s.keyRef }),
      ] }),
      jsxs('div', { style: { display: 'flex', gap: 8 }, children: [
        jsx(Input, {
          value: key,
          type: 'password',
          placeholder: '输入 ' + s.keyRef,
          style: { flex: 1, fontSize: 12.5 },
          onChange: (e) => { setKeyState(e.target.value); writeKey(gCtx, pid, idx, s.id, e.target.value) },
        }),
        jsx(Button, { size: 'sm', disabled: busy, onClick: test, children: busy ? '测试中…' : '测试连通性' }),
      ] }),
      s.apiNote ? jsx('div', { style: { fontSize: 11.5, opacity: 0.65, lineHeight: 1.5 }, children: s.apiNote }) : null,
      result ? jsx('div', { style: RESULT_STYLE, children: formatResult(tier, result) }) : null,
    ],
  })
}

/** 四项单价（每百万 tokens，可空 = 回落默认牌价）+ 今日估算预览。 */
function PriceRow({ pid }) {
  const def = DEFAULT_PRICES[pid] || {}
  const cur = def.cur === 'USD' ? '$' : '¥'
  const [vals, setVals] = useState(() => {
    const stored = readPrice(gCtx, pid)
    return {
      in: stored.in != null ? String(stored.in) : '',
      out: stored.out != null ? String(stored.out) : '',
      hit: stored.hit != null ? String(stored.hit) : '',
      create: stored.create != null ? String(stored.create) : '',
    }
  })

  function set(field, text) {
    setVals((v) => Object.assign({}, v, { [field]: text }))
    const n = Number(text)
    writePrice(gCtx, pid, { [field]: text.trim() === '' || !isFinite(n) ? null : n })
  }

  const custom = readPrice(gCtx, pid)
  const eff = effectivePrices(pid, custom)
  const tok = gCtx ? gCtx.storage.get(tokenKey(pid), null) : null
  const est = tok && (tok.in > 0 || tok.out > 0) ? dayEstimate(pid, tok, custom) : null
  const sch = scheduleState(pid)

  const cell = { display: 'flex', flexDirection: 'column', gap: 3 }
  const lbl = { fontSize: 11, opacity: 0.65 }
  const inputStyle = { fontSize: 12.5, width: '100%', boxSizing: 'border-box' }

  return jsxs('div', {
    style: { marginTop: 9, paddingTop: 8, borderTop: '1px dashed rgba(128,128,128,.28)',
             display: 'flex', flexDirection: 'column', gap: 7 },
    children: [
      jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, children: [
        jsx('strong', { style: { fontSize: 12.5 }, children: '单价（每百万 tokens）' }),
        jsx('span', { style: { fontSize: 11, opacity: 0.6 },
          children: '留空 = 默认牌价 · ' + (def.note || '无默认牌价，留空不估算')
            + (SCHEDULES[pid] ? ' · ' + SCHEDULES[pid].note : '') }),
      ] }),
      jsxs('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }, children:
        PRICE_FIELDS.map(([f, label]) => jsx('div', { style: cell, children: [
          jsx('span', { style: lbl, children: label + '（' + cur + '）' }),
          jsx(Input, {
            type: 'number', min: 0, step: 'any', value: vals[f],
            placeholder: def[f] != null ? String(def[f]) : '—',
            style: inputStyle,
            onChange: (e) => set(f, e.target.value),
          }),
        ] }, f)),
      }),
      jsx('div', { style: { fontSize: 11.5, opacity: 0.7, lineHeight: 1.5 }, children:
        (est != null
          ? '今日估算：' + money2(est, eff.cur) + '（输入 ' + fmtTokens(tok.in) + ' / 输出 ' + fmtTokens(tok.out) + ' tok）'
          : '今日估算：今日暂无 token 用量')
          + (sch ? ' · 当前' + sch.label + (sch.peak ? '（原价）' : ' ×' + sch.sc.discMult) : '') }),
    ],
  })
}

/** 金额格式（shell 内联版，与挂件 money 同规则）。 */
function money2(v, currency) {
  if (v == null) return '—'
  const sym = currency === 'USD' ? '$' : '¥'
  return sym + (Math.round(v * 10000) / 10000).toLocaleString()
}

/** 厂商卡：头部（名称 + 说明）+ 逐源行（订阅 / 按量付费分开成条）。 */
function ProviderRow({ pid }) {
  const p = PROVIDERS[pid]
  return jsxs('div', { style: ROW_STYLE, children: [
    jsxs('div', { style: HEAD_STYLE, children: [
      jsx('strong', { style: { fontSize: 13.5 }, children: p.name }),
      jsx('span', { style: { fontSize: 11, opacity: 0.6 }, children: p.sources.length + ' 个取数源' }),
    ] }),
    p.apiNote ? jsx('div', { style: { fontSize: 11.5, opacity: 0.65, lineHeight: 1.5 }, children: p.apiNote }) : null,
    ...p.sources.map((s, i) => jsx(SourceRow, { pid, idx: i }, s.id)),
    jsx(PriceRow, { pid }),
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
      jsx('p', { style: { fontSize: 11.5, opacity: 0.5, margin: '2px 0 8px', textAlign: 'center' },
        children: '余额挂件 v' + VERSION + ' · 单文件磁盘插件（plugin.js）· key 只存本机' }),
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
