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
