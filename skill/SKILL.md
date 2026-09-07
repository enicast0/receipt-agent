---
name: receipts-onchain-copilot
description: >
  A DeFi copilot for Binance Agentic Wallet that reads the wallet's own
  user-configured rules before every proposed swap or transfer, narrates the
  action against those rules in plain language, and writes a timestamped
  decision log entry — before anything is executed.
requires:
  - binance-agentic-wallet (Binance Skills Hub — wallet settings, quote, swap, order status)
  - query-token-audit (Binance Skills Hub — real-time token security score, called directly via HTTP)
  - query-token-info (Binance Skills Hub — resolves token symbols to contract addresses + chain ID)
---

# Receipts — onchain decision-ledger copilot

## What this agent does

For every user request that could result in an on-chain swap:

1. **Resolve tokens first.** Use the `query-token-info` skill to turn symbols (e.g. "BNB",
   "USDT") into real contract addresses and the correct `binanceChainId`. Nothing downstream
   accepts a bare symbol.
2. **Never bypass the wrapper.** Read+write Agentic Wallet actions are never called directly by
   this agent — only through `scripts/check-and-log.js`'s `checkAndExecute()`, and always with a
   fresh, unique `idempotencyKey` for each distinct user request.
3. Inside `checkAndExecute()`, in order, all enforced in code, not by agent discipline:
   - a real `query-token-audit` call on the destination token (hard-blocks riskLevel 4–5;
     riskLevel 2–3 needs `elevatedRiskAcknowledged: true` from an explicit decision);
   - a quote and the wallet's live rules (daily limit, token scope, abnormal-transaction
     handling — never cached, since the user can change these in the Binance App any time);
   - a comparison against this project's own `MAX_ACTION_USD` in `guardrails.config.json`,
     separate from and in addition to whatever's set in the Binance App;
   - refusal if the wallet is set to `NeedConfirmation` (unverified path — see SKILL status).
4. **Narrate, don't just act.** Before the agent tells the user a swap is happening, it should
   already know — from `checkAndExecute()`'s return value — whether it was refused, and why.
   State the real reason in plain language; never ask the user to override a refusal in this
   conversation, since overrides only happen in the Binance App itself.
5. **Log every decision.** Every call to `checkAndExecute()` appends exactly one line to
   `scripts/decisions.log.jsonl`, regardless of outcome.

## Current status (Session 5)

- Wallet connection: **still not confirmed live.** Nothing in this project has executed against
  a real wallet at any point across five sessions.
- Everything in "What this agent does" above is implemented and tested against a mock CLI and a
  mocked audit response — never against Binance's real endpoints. See SESSION_REPORT.md.
- **`NeedConfirmation` wallets are refused outright**, not handled. This project has never
  verified what the CLI actually does while an abnormal transaction is awaiting in-app
  confirmation, and would rather refuse than guess at that behavior. Set the wallet to
  `AutoReject` to use this flow as it currently stands.
