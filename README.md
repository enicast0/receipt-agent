# Receipts (working title)

An onchain copilot for **Binance Agentic Wallet** built for the Binance Agent OS Mini Hackathon,
Track A. Most DeFi agents just execute. This one reads your wallet's own configured rules and
a real, live token-security score before proposing anything, explains the decision in plain
language, and writes every outcome — approved or refused — to an append-only ledger. Nothing
here can act outside limits you set; nothing here acts without leaving a record of why.

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
3. **Install the skills** in whatever MCP-compatible client you're using for this project
   (Claude Code, Claude Desktop, etc.) — three, not just one:
   ```
   npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet
   npx skills add binance/binance-skills-hub --skill query-token-audit
   npx skills add binance/binance-skills-hub --skill query-token-info
   ```
   `query-token-audit` is called directly by `skill/scripts/check-and-log.js` (a real HTTP call,
   not a CLI shell-out) — it's how the security check is enforced in code rather than trusted
   from the agent. `query-token-info` is what your agent should use to resolve a symbol like
   "BNB" or "USDT" into the real contract address and chain ID this project's functions need —
   nothing in this repo does that resolution itself.
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
    check-and-log.js       — fetchWalletRules, getSwapQuote, narrateDecision, checkAndExecute
    decisions.log.jsonl    — decision log, append-only, empty until a real action is taken
/demo
  render.js                — reads the decision log, writes ledger.html (run after every action)
  ledger.html               — generated; open in a browser during the demo
  SCRIPT.md                 — suggested shot list for the Track A video
README.md                  — this file
SESSION_REPORT.md          — current build state (see build ruleset Section 5)
package.json                — Node >=18, zero npm dependencies
```

`/demo` (a thin display layer rendering the live decision ledger) doesn't exist yet — that's
Session 4's scope, not Session 1's.

## Demo

After completing the one-time setup above and running at least one real action through the
skill, generate the ledger page:

```
node demo/render.js
```

This writes `demo/ledger.html` from the current `skill/scripts/decisions.log.jsonl` — open it
in a browser and reload after every action. See `demo/SCRIPT.md` for a suggested shot list for
the required Track A video.

## Before you submit

- [ ] Completed the one-time wallet setup above (all three skills) and run at least one real
      swap through the skill — nothing in this repo has touched a live wallet yet.
- [ ] Confirmed what the CLI actually does when `abnormalTxnHandling` is `NeedConfirmation` —
      this project currently refuses that path outright because it's never been tested live.
- [ ] Recorded the demo video (see `demo/SCRIPT.md`).
- [ ] Confirmed the exact judging rubric and team-size rules directly on Binance's hackathon
      page/survey — these weren't publicly confirmable during this project's research (the
      survey page blocks automated fetching).
- [ ] Confirmed eligibility (not in US, UK, EEA, Hong Kong, or Singapore).
- [ ] Submitted before **September 8, 2026, 23:59 UTC**.
