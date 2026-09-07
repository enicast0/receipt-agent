# Submission answers

## Project name

Receipts

*(working title used throughout the build — swap it here and in README.md if you land on
something else before submitting)*

## Project description

Receipts is an onchain copilot for Binance Agentic Wallet that treats explainability as a
first-class feature, not an afterthought. Most DeFi agents simply execute a requested swap;
Receipts pauses first. Before proposing any on-chain action, it reads the wallet's own live,
user-configured rules — daily spend limit, tradable token scope, and abnormal-transaction
handling — directly from Binance, runs the destination token through Binance's real-time
token-security audit, and checks the proposed amount against this project's own declared
ceiling. It then narrates its reasoning in plain language: what it's proposing, why, and exactly
which rule it checked against. Every outcome — approved or refused — is written to an
append-only decision ledger, rendered live as a simple page during the demo. High-risk tokens
are hard-blocked in code, not just flagged in a prompt. Nothing here can act outside limits the
user set, and nothing acts without leaving a record of why.

## Step-by-step replication guide

1. **Prerequisites:** Node.js 18+, a Binance account, and an MCP-compatible agent client
   (Claude Code, Claude Desktop, etc.).
2. **Clone the repo** and `cd` into it.
3. **Create a Binance MPC Wallet** in the Binance App if you don't already have one — required
   before an Agentic Wallet can exist.
4. **Install the three required skills** in your agent client:
   ```
   npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet
   npx skills add binance/binance-skills-hub --skill query-token-audit
   npx skills add binance/binance-skills-hub --skill query-token-info
   ```
5. **Sign in.** Tell your agent "Sign in to Binance Agentic Wallet" and follow the link or scan
   the QR code it returns.
6. **Set tight guardrails** in the Binance App → Agentic Wallet → Settings: a small daily limit,
   the narrowest tradable-token scope, and "require confirmation" for abnormal transactions.
   Match or tighten `MAX_ACTION_USD` in `skill/guardrails.config.json` (default: $10) to the
   same ceiling.
7. **Fund the wallet minimally** — this project has no separate testnet mode; a small, tightly
   limited live wallet stands in for one.
8. **Point your agent at `skill/SKILL.md`** as its instructions for this task.
9. **Ask it to propose a swap** in plain language — e.g. "swap $5 USDT to BNB" — and watch it
   narrate the wallet-rule check and the token-security audit before it acts, or explain exactly
   why it refused.
10. **See the record:** run `node demo/render.js`, then open `demo/ledger.html` — it updates
    after every action, approved or refused.
