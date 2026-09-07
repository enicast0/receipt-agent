---
name: receipts-onchain-copilot
description: >
  A DeFi copilot for Binance Agentic Wallet that reads the wallet's own
  user-configured rules before every proposed swap or transfer, narrates the
  action against those rules in plain language, and writes a timestamped
  decision log entry — before anything is executed.
requires:
  - binance-agentic-wallet (Binance Skills Hub — read-only + read+write skills)
---

# Receipts — onchain decision-ledger copilot

## What this agent does

For every user request that could result in an on-chain action (swap, transfer, limit order):

1. **Read the rules first.** Call the Agentic Wallet's read-only skill to fetch the wallet's
   currently configured daily limit, tradable token scope, and high-risk transaction handling
   setting. Never assume these values — they can change any time in the Binance App, and this
   agent cannot modify them, only read them.
2. **Check this project's own hard limit.** Before proposing any write action, compare the
   proposed amount against `MAX_ACTION_USD` in `guardrails.config.json`. This is this project's
   own declared ceiling, separate from and in addition to whatever the user has set in the
   Binance App — belt and suspenders, per the build ruleset's Section 9.4.
3. **Narrate, don't just act.** Before calling any read+write skill function, state in plain
   language: what the action is, why it's being proposed, and how it checks against both (a) the
   wallet's own configured rules and (b) this project's `MAX_ACTION_USD` ceiling. If either check
   fails, refuse and explain which limit was hit — do not ask the user to override it in this
   conversation; overrides only happen in the Binance App itself.
4. **Log every decision.** Every proposed action — whether it proceeds, is refused, or requires
   a second confirmation — gets one line appended to `scripts/decisions.log.jsonl`, via
   `scripts/check-and-log.js` (see that file — this is a stub in Session 1; the actual
   enforcement logic is Session 3's scope, not implemented yet).
5. **Never bypass the wrapper.** The read+write Agentic Wallet skill functions (swap, transfer,
   place order) are never called directly by this agent. They are only ever called from inside
   `scripts/check-and-log.js`, so the limit check and the log entry cannot be skipped by a
   miscounted step in reasoning.

## Current status (Session 2)

- Wallet connection: pending manual setup — see repo `README.md` for the exact steps. This
  agent should not assume a wallet is connected until that setup is confirmed complete.
- `scripts/check-and-log.js` now has **real, working** read-only logic: `fetchWalletRules()`
  (shells out to `baw wallet settings --json`), `getSwapQuote()` (`baw market-order quote --json`),
  and `narrateDecision()` (pure comparison logic, unit-tested against mock data shaped like
  Binance's documented response). These are written against Binance's public `binance-agentic-wallet`
  reference docs, not against a live call — confirm against your actual connected wallet before
  trusting the numbers in a real demo.
- `checkAndExecute()` is still a **stub** — it must never be wired to a real `market-order swap`
  call until Session 3, which also has to implement the mandatory poll-to-terminal-state step
  (an `orderId` from `market-order swap` means submitted, not completed — see the function's
  own comments for the full sequence).
- **Known limitation:** this project can only estimate a swap's USD value when the source token
  is a stablecoin (USDT/USDC), since `market-order quote` returns token amounts, not USD, and no
  price oracle is wired in. Swaps from a non-stable token are out of scope for this MVP —
  `narrateDecision()` refuses them outright rather than guessing a conversion.
- Security pre-check for swaps (the `query-token-audit` flow in Binance's own `security.md`)
  still applies on top of everything here — this project's guardrail is an addition to Binance's
  own checks, not a replacement for them.
