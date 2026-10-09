/**
 * hermes-balance-widget — Hermes 桌面多厂商余额挂件（单文件构建产物）
 * 由 build.py 从 src/ 组装生成，勿直接编辑。源码结构与出处见 src/ 与 README。
 */
/**
 * hermes-balance-widget — 九家厂商取数模板
 * ============================================================================
 * 结构与字段语义移植自 dsh-whale-widget 的 API_TEMPLATES（MIT © MeteorNOX），
 * 按本插件九家清单裁剪；mimo 模板为实测自写（原版无此厂商）。
 *
 * 三种取数层级（与原版一致）：
 *   kind: 'balance' —— 真余额：balance.url + json.remaining 字段路径
 *   kind: 'quota'   —— 订阅额度：quota.url + 窗口结构（简单字段 / windows 数组）
 *   noBalanceApi    —— 官方无余额接口：余额显示「—」，probeUrl 仅探活验证 key
 *
 * 字段路径语法（执行器实现于 balance.js）：支持 a.b[0].c，可选 scale 乘数。
 * auth 模板三种：'Bearer {key}' / '{key}'（裸值，智谱风格）/ ''（key 走 url 或探活不需要）。
 */

export const PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    currency: 'CNY',
    keyRef: 'DEEPSEEK_API_KEY',
    kind: 'balance',
    balance: {
      url: 'https://api.deepseek.com/user/balance',
      auth: 'Bearer {key}',
      json: { remaining: 'balance_infos[0].total_balance' },
    },
    probeUrl: 'https://api.deepseek.com/models',
  },

  minimax: {
    name: 'MiniMax',
    currency: 'CNY',
    keyRef: 'MINIMAX_API_KEY',
    kind: 'quota',
    // 国内端点；2026-10-08 用真实 key 实测返回 5h/周双窗口数据。
    // 订阅额度接口仅对 Coding Plan 订阅账号有效（资源包账号会报「不存在 coding plan」）。
    quota: {
      url: 'https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains',
      auth: 'Bearer {key}',
      json: {
        remainPct: 'model_remains[0].current_interval_remaining_percent',
        weeklyRemainPct: 'model_remains[0].current_weekly_remaining_percent',
        resetAtMs: 'model_remains[0].end_time',
      },
    },
    probeUrl: 'https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains',
  },

  glm: {
    name: '智谱 GLM',
    currency: 'CNY',
    keyRef: 'ZHIPU_API_KEY',
    kind: 'quota',
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
    probeUrl: 'https://open.bigmodel.cn/api/paas/v4/models',
  },

  kimi: {
    name: 'Kimi / Moonshot（CN）',
    currency: 'CNY',
    keyRef: 'MOONSHOT_API_KEY',
    kind: 'balance',
    // 大陆站：余额为人民币（充值 + 代金券合计），v724 原版实测 200 且字段命中。
    balance: {
      url: 'https://api.moonshot.cn/v1/users/me/balance',
      auth: 'Bearer {key}',
      json: { remaining: 'data.available_balance' },
    },
    probeUrl: 'https://api.moonshot.cn/v1/models',
  },

  mimo: {
    name: '小米 MiMo（token-plan）',
    currency: 'CNY',
    keyRef: 'MIMO_TOKENPLAN_KEY',
    noBalanceApi: true,
    // 自写模板：2026-10-08 实测 token-plan 端点常见余额路径全 404、响应头无限额字段。
    apiNote: 'token-plan 端点无余额接口（实测常见路径 404）→ 余额「—」，今日已用按会话估算',
    probeUrl: 'https://token-plan-cn.xiaomimimo.com/v1/models',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },

  chatgpt: {
    name: 'OpenAI / ChatGPT',
    currency: 'USD',
    keyRef: 'OPENAI_API_KEY',
    noBalanceApi: true,
    apiNote: '官方已下线 billing 余额接口，无「用 API key 查余额」的公开接口 → 余额「—」，今日已用按会话估算',
    matchIds: ['gpt', 'o1-', 'o3-', 'o4-', 'chatgpt'],
    probeUrl: 'https://api.openai.com/v1/models',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },

  claude: {
    name: 'Anthropic Claude',
    currency: 'USD',
    keyRef: 'ANTHROPIC_API_KEY',
    noBalanceApi: true,
    apiNote: '官方无余额接口；用量走 Admin API（需 admin key）或控制台。探活需 x-api-key + anthropic-version 双请求头，本插件暂不提供探活 → 余额「—」',
    matchIds: ['claude'],
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },

  gemini: {
    name: 'Google Gemini',
    currency: 'USD',
    keyRef: 'GEMINI_API_KEY',
    noBalanceApi: true,
    apiNote: '官方无余额接口（配额在 AI Studio / Cloud 控制台）→ 余额「—」，今日已用按会话估算；探活走 ?key= 形式',
    matchIds: ['gemini'],
    probeUrl: 'https://generativelanguage.googleapis.com/v1beta/models?key={key}',
    balance: { url: '', auth: '', json: { remaining: '' } },
  },

  grok: {
    name: 'xAI Grok',
    currency: 'USD',
    keyRef: 'XAI_API_KEY',
    noBalanceApi: true,
    apiNote: '官方无公开余额查询接口（额度在 console.x.ai）→ 余额「—」，今日已用按会话估算',
    matchIds: ['grok'],
    probeUrl: 'https://api.x.ai/v1/models',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },
}

/** 九家的稳定顺序（设置页与挂件展示序）。 */
export const PROVIDER_ORDER = [
  'deepseek', 'minimax', 'glm', 'kimi', 'mimo', 'chatgpt', 'claude', 'gemini', 'grok',
]

/** 层级描述（UI 标签用）。 */
export function providerTier(p) {
  if (p.kind === 'balance') return 'balance'
  if (p.kind === 'quota') return 'quota'
  return 'probe'
}


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
 *   - 每轮消耗：订阅 host.state.busy / focusedUsage，按 cost_usd 增量结算
 *   - 任务结束音：busy true→false 播 chime
 *   - 随机语句：分角色语句池（每家 ≥5 条社区梗），弹窗底部轮换
 *   - 音效与提示：WebAudio 合成（按压 pop / chime / warn，音量可调）
 *   - 大小调节：--hbw-s 缩放（基准 168px = 原版 200%，配置 scale 0.6–1.6）
 */

const STYLE_ID = 'hermes-balance-widget-style'
const ROOT_ID = 'hermes-balance-widget-root'
const POP_ID = 'hermes-balance-widget-pop'
const POLL_MS = 60_000

/** 九家形象 data URI（build.py 注入）。 */
export const MASCOTS = {
  deepseek: 'data:image/webp;base64,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',
  minimax: 'data:image/webp;base64,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',
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
  --hbw-s: 1;
}
#${ROOT_ID} .hbw-char {
  /* CSS 变量缩放：left/top 与 rect 恒 1:1，拖拽坐标永不漂移 */
  /* 尺寸基准 = 原版的 200%（168px），--hbw-s 在此之上再调 */
  width: calc(168px * var(--hbw-s));
  height: calc(168px * var(--hbw-s));
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
    result: null, busy: false, unmounted: false,
    turnCost: null, costAtBusyStart: null,
    phraseIdx: Math.floor(Math.random() * phrasePool().length),
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
  char.src = (typeof MASCOTS !== 'undefined' && MASCOTS[activePid]) || ''

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
    state.result = null
    state.alerted = false
    state.turnCost = null
    state.costAtBusyStart = null
    state.phraseIdx = Math.floor(Math.random() * phrasePool().length)
    if (state.popEl) renderPop()
    refresh()
    return true
  }

  /* ── 取数 ────────────────────────────────────────────────────────────── */
  async function refresh() {
    if (state.busy) return
    const pidAtStart = activePid
    const provAtStart = provider
    const key = ctx ? String(ctx.storage.get('key.' + pidAtStart, '') || '') : ''
    if (!key) {
      state.result = null
      state.busy = false
      if (!state.unmounted) renderPop()
      return
    }
    state.busy = true
    renderPop()
    let r
    try {
      r = await (typeof fetchProvider !== 'undefined'
        ? fetchProvider(provAtStart, key)
        : Promise.reject(new Error('executor missing')))
    } catch (err) {
      r = { ok: false, error: String(err && err.message || err) }
    }
    state.busy = false
    if (state.unmounted) return
    // 换装竞态：取数途中角色已切 → 丢弃过期结果并用新角色重跑
    if (pidAtStart !== activePid) { refresh(); return }
    state.result = r
    afterRefresh(r)
    renderPop()
  }

  function afterRefresh(r) {
    if (!r || !r.ok) return
    if (provider.kind === 'balance' && r.remaining != null) {
      observeDrop(ctx, activePid, r.remaining)
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
        state.phraseIdx = (state.phraseIdx + 1) % phrasePool().length
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
      const used = todayUsed(ctx, activePid)
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
      const pool = phrasePool()
      p.textContent = '「' + pool[state.phraseIdx % pool.length] + '」'
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
