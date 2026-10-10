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
