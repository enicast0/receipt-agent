#!/usr/bin/env node
/**
 * check-and-log.js
 *
 * STUB — Session 1. Not yet functional. Defines the shape this project commits to;
 * do not build downstream logic that assumes these functions already work.
 *
 * This will become the single choke point for every write-capable Agentic Wallet
 * call (swap, transfer, limit order). Per SKILL.md, the agent must never call those
 * skill functions directly — only through here — so the limit check and the decision
 * log entry can't be skipped by a reasoning misstep.
 *
 * Session 2 scope: implement fetchWalletRules() (read-only) and the plain-language
 *                   narration this produces.
 * Session 3 scope: implement checkAndExecute() for real — actually call the
 *                   read+write Agentic Wallet skill function, gated by the checks
 *                   below, and make the log append durable.
 */

const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "guardrails.config.json");
const LOG_PATH = path.join(__dirname, "decisions.log.jsonl");

/**
 * TODO (Session 2): replace with a real call to the Agentic Wallet read-only skill.
 * Must return the wallet's *current* configured daily limit, tradable token scope,
 * and high-risk transaction handling setting — never hardcoded, never cached across
 * a session, since the user can change these in the Binance App at any time.
 */
function fetchWalletRules() {
  throw new Error(
    "fetchWalletRules() is not implemented yet (Session 1 stub). " +
      "Do not call this until Session 2 wires it to the real Agentic Wallet read-only skill."
  );
}

/**
 * TODO (Session 3): this is the only place a write-capable Agentic Wallet skill
 * function may be invoked from. Must, in order:
 *   1. Load MAX_ACTION_USD from guardrails.config.json (this project's own ceiling)
 *   2. Call fetchWalletRules() and check the proposed action against it
 *   3. Refuse and log if either check fails — never partially execute
 *   4. If both checks pass, call the real Agentic Wallet write skill function
 *   5. Append one line to decisions.log.jsonl regardless of outcome (see logDecision)
 */
function checkAndExecute(proposedAction) {
  throw new Error(
    "checkAndExecute() is not implemented yet (Session 1 stub). " +
      "Do not wire this to a real write call until Session 3."
  );
}

/**
 * Functional already — safe to call from Session 1 onward for any manual testing,
 * even though the two functions above aren't wired up yet. Kept dependency-free
 * (no npm packages) so this file needs nothing installed to run.
 */
function logDecision(entry) {
  const record = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(LOG_PATH, JSON.stringify(record) + "\n");
  return record;
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

module.exports = { fetchWalletRules, checkAndExecute, logDecision, loadConfig };
