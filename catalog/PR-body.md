# Catalog submission — `plugin-catalog/hermes-balance-widget.yaml`

Adds one entry to the Hermes plugin catalog:

```yaml
name: hermes-balance-widget
repo: https://github.com/OMOX563/hermes-balance-widget
sha: "3767dfa08bca76225a5aa534ace79edf47fbfe90"
tier: community
```

## What the plugin does

Nine AI provider balances in one desktop widget — live balance/usage and quota
reads across 13 fetch sources, token-based spend estimates with off-peak price
windows (Beijing time), drop alerts, and an anime mascot per provider with
rotating flavour lines: DeepSeek, MiniMax, GLM, Kimi, MiMo, ChatGPT, Claude,
Gemini, Grok.

- **Desktop-only.** `desktop/plugin.js` inside the plugin SDK surface; the
  agent-side `__init__.py` is a no-op stub. Registers no tools, hooks,
  middleware or env vars (`requires_env` absent — keys are typed by the user in
  the settings page, not read from the environment).
- **Read-only against provider APIs.** The widget only calls the official
  balance/quota/health endpoints of the providers whose keys the user entered.
- **Keys never leave the machine.** Stored in plugin-scoped storage
  (`ctx.storage`); no `.env` / `auth.json` / credential-store reads, no shell,
  no background processes, no telemetry.
- **No self-updating code.** Static `desktop/plugin.js`; updates reach users
  only through a SHA-bump PR here.
- **Ported from** [DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)
  (MIT © MeteorNOX) — fetch-template structure and field semantics, rewritten
  for the nine-provider Hermes plugin form; credited in the README and LICENSE.

## Disclosure (rule 13)

- Network calls: provider official APIs only (balance / quota / health checks),
  authenticated with the user's own keys.
- Reads outside the plugin's own data: none.
- Shell commands / long-running background processes: none.
- Stored credentials: provider API keys, entered in the settings page, held in
  plugin-scoped storage on the local machine.
- Telemetry / usage reporting: none.

## Submission checklist

- [x] Owner-submitted (`OMOX563` owns the repo)
- [x] Public repository
- [x] Released (`v1.1.4` + GitHub release; `version` matches the pinned code)
- [x] Capabilities declared: none — the plugin registers no tools, hooks, or
      middleware; `requires_env` absent (keys are user-entered, not env)
- [x] `hermes plugins validate` passes (clean clone at the pinned SHA):
      manifest ✓ loadable ✓ capability probe ✓ security scan *safe* ✓
      no core override ✓ desktop surface ✓
- [x] No self-updating code; no core overrides; SDK-surface only
      (`eval`/dynamic `import()`/prototype patching/MutationObserver: zero)
- [x] README carries the rule-13 disclosure lines and upstream credit

## Verify locally

```bash
hermes plugins install OMOX563/hermes-balance-widget --enable
hermes plugins validate ~/.hermes/plugins/hermes-balance-widget
```

Repo layout: `plugin.yaml` + agent-side `__init__.py` stub +
`desktop/plugin.js` (byte-identical to the released root `plugin.js`, emitted
by `build.py`).
