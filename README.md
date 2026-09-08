# Receipt Agent

An onchain copilot for **Binance Agentic Wallet**, built for the Binance Agent OS Mini
Hackathon (Track A — Onchain Workflows).

Most DeFi agents just execute. This one reads your wallet's own configured rules and a real,
live token-security score before proposing anything, explains the decision in plain language,
and writes every outcome — approved or refused — to an append-only ledger. Nothing here can act
outside limits you set; nothing here acts without leaving a record of why.

*(A screenshot of `demo/ledger.html` after a real run belongs here — add one once you've done
the live pass below.)*

## How it works

Every proposed swap goes through one function, `checkAndExecute()` in
`skill/scripts/check-and-log.js`, in this order:

1. **Audit the destination token** — a real call to Binance's `query-token-audit` API.
   riskLevel 4–5 is hard-blocked, no override. riskLevel 2–3 requires an explicit
   `elevatedRiskAcknowledged: true`.
2. **Read the wallet's live rules** — daily limit, tradable token scope, and abnormal-transaction
   handling, fetched fresh every time, never cached, since you can change them in the Binance App
   at any moment.
3. **Check this project's own ceiling** — `MAX_ACTION_USD` in `guardrails.config.json`, separate
   from and in addition to whatever the Binance App itself allows.
4. **Narrate the decision** in plain language before anything happens.
5. **Only then submit**, and poll to a real terminal state (`FINISHED`/`FAILED`) — an order ID
   alone is never reported as success.
6. **Log the outcome** — approved, refused, or failed — to `skill/scripts/decisions.log.jsonl`,
   one line per decision, no exceptions.

## Setup

This requires a manual, human, browser-based Binance sign-in — it can't be scripted or done on
your behalf.

1. **Prerequisites:** Node.js 18+, a Binance account, an MCP-compatible agent client (Claude
   Code, Claude Desktop, etc.).
2. **Create a Binance MPC Wallet** in the Binance App if you don't already have one — required
   before an Agentic Wallet can exist.
3. **Install three skills:**
   ```
   npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet
   npx skills add binance/binance-skills-hub --skill query-token-audit
   npx skills add binance/binance-skills-hub --skill query-token-info
   ```
   `query-token-audit` is called directly from code — that's how the security check is enforced
   rather than trusted from the agent. `query-token-info` is what your agent should use to
   resolve a symbol like "BNB" into the real contract address and chain ID this project needs;
   nothing here does that resolution itself.
4. **Sign in.** Tell your agent: `Sign in to Binance Agentic Wallet`. Follow the link or scan the
   QR code it returns. First-time sign-in walks you through creating the Agentic Wallet itself.
5. **Set tight rules** in the Binance App → Agentic Wallet → Settings: a small daily limit
   (match or exceed the `MAX_ACTION_USD` ceiling in `skill/guardrails.config.json`, default $10),
   the narrowest tradable-token scope, and "require confirmation" for abnormal transactions.
6. **Fund the wallet minimally.** There's no separate testnet/sandbox mode for Agentic Wallet —
   a small, tightly-limited live wallet is this project's practical stand-in for one.

## Using it

Point your agent at `skill/SKILL.md` as its instructions, then ask for a swap in plain language
— e.g. "swap $5 USDT to BNB." Watch it narrate the audit, the wallet's rules, and the ceiling
check before acting, or explain exactly why it refused.

To see the record:
```
node demo/render.js
```
This reads `skill/scripts/decisions.log.jsonl` and writes `demo/ledger.html` — open it in a
browser and reload after every action. See `demo/SCRIPT.md` for a suggested video shot list.

## Known limitations

- USD estimation only works when the source token is a stablecoin (USDT/USDC) — swaps from any
  other token are refused rather than guessed at, since no price oracle is wired in.
- Wallets set to `NeedConfirmation` for abnormal transactions are refused outright — this
  project has never observed what the CLI does while that confirmation is pending, and refuses
  rather than guess.
- Only swaps are implemented. Transfers and DeFi deposits follow the same guardrail pattern but
  aren't wired up.
- The token-security audit checks the destination token only, not the source.

## Repo layout

```
skill/
  SKILL.md                — agent instructions: audit, read rules, check limit, narrate, log, execute
  guardrails.config.json  — this project's own declared hard limit (separate from the Binance App)
  scripts/
    check-and-log.js      — the single enforced choke point for every swap
    decisions.log.jsonl   — the decision log itself, append-only
demo/
  render.js               — reads the decision log, writes ledger.html (run after every action)
  ledger.html             — generated; open in a browser to see the ledger
  SCRIPT.md               — suggested shot list for the demo video
README.md                 — this file
SUBMISSION.md             — project name, description, and replication guide for the hackathon entry
SESSION_REPORT.md         — full build history, including everything tested against mocks before
                             this went live, and every gap found and fixed along the way
package.json              — Node >=18, zero npm dependencies
```

## Build process

This was built across a series of scoped sessions rather than one long pass — each one logged
in `SESSION_REPORT.md` with exactly what changed, what was verified and how, and what was
carried forward as an open risk. Worth a look if you want to see the actual engineering
discipline behind the guardrails, not just the guardrails themselves.
