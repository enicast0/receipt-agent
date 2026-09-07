# Receipts (working title)

An onchain copilot for **Binance Agentic Wallet** built for the Binance Agent OS Mini Hackathon,
Track A. Every proposed swap or transfer is checked against the wallet's own user-configured
rules and this project's own hard limit *before* anything executes, and every decision —
approved, refused, or requiring confirmation — is logged with a reason. Built for the
Onchain Workflows track: [see `BUILD_ROADMAP.md`] for the full session plan.

## Status

Session 1 of 4 — repo scaffold + wallet connection setup. No live enforcement logic is wired up
yet (`skill/scripts/check-and-log.js` is a stub). See `SESSION_REPORT.md` for the current state
in full.

## One-time setup (do this before Session 2)

This step is a manual, human, browser-based Binance sign-in — it cannot be automated or done on
your behalf inside a build session.

1. **Prerequisites:** Node.js 18+, a Binance account.
2. **Create an MPC Wallet** in the Binance App if you don't already have one (required before an
   Agentic Wallet can exist).
3. **Install the skill** in whatever MCP-compatible client you're using for this project
   (Claude Code, Claude Desktop, etc.):
   ```
   npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet
   ```
4. **Sign in.** Tell your agent: `Sign in to Binance Agentic Wallet`. It returns a sign-in link —
   open it on mobile to jump straight into the Binance App, or scan the QR code on desktop.
   First-time sign-in walks you through creating the Agentic Wallet itself.
5. **Set the tightest rules to start,** in the Binance App → Agentic Wallet management page →
   Settings:
   - A small daily limit (this project defaults its own ceiling to $10 in
     `skill/guardrails.config.json` — set the Binance App limit at or below that)
   - Tradable token scope set to the narrowest option available
   - High-risk transaction handling set to "Require App confirmation"
6. **Fund the wallet minimally.** No separate testnet/sandbox mode for Agentic Wallet was found
   during Session 0 research — this wallet, funded lightly and rule-limited as above, is this
   project's practical stand-in for "testnet." Confirm you're comfortable treating it as such
   before Session 2 starts.

Once steps 1–6 are done, update `SESSION_REPORT.md`'s "Assumptions carried into next session"
to confirm the connection is live — Session 2 depends on it.

## Repo layout

```
/skill
  SKILL.md                 — agent instructions: read rules, check limit, narrate, log, execute
  guardrails.config.json   — this project's own declared hard limit (separate from Binance App)
  scripts/
    check-and-log.js       — stub (Session 1); becomes the only path to a write action (Session 3)
    decisions.log.jsonl    — decision log, append-only, empty until Session 2/3
README.md                  — this file
SESSION_REPORT.md          — current build state (see build ruleset Section 5)
```

`/demo` (a thin display layer rendering the live decision ledger) doesn't exist yet — that's
Session 4's scope, not Session 1's.
