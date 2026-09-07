#!/usr/bin/env node
/**
 * check-and-log.js
 *
 * Session 5: replaced the self-reported `tokenAuditAcknowledged` flag with a real call to
 * Binance's public query-token-audit API — the security pre-check is now enforced in code,
 * not trusted from the caller. Added an execFileSync timeout and an idempotency guard.
 * Still verified against documentation and a mock CLI only — see SESSION_REPORT.md.
 *
 * KNOWN LIMITATION (see SKILL.md): amountUsd is only meaningful when fromToken is a USD
 * stablecoin (USDT/USDC), since `market-order quote` returns token amounts, not a USD
 * value, and no price-oracle lookup is wired in this project. Swaps starting from a
 * non-stable token are out of scope for this MVP.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const CONFIG_PATH = path.join(__dirname, "..", "guardrails.config.json");
const LOG_PATH = path.join(__dirname, "decisions.log.jsonl");
const BAW_TIMEOUT_MS = 20000;

const STABLECOINS = new Set(["USDT", "USDC"]);
const TOKEN_AUDIT_URL = "https://web3.binance.com/bapi/defi/v1/public/wallet-direct/security/token/audit";

/** Shells out to the `baw` CLI. Always appends --json, per SKILL.md's "Build the Command" rule. */
function runBaw(args) {
  let raw;
  try {
    raw = execFileSync("baw", [...args, "--json"], { encoding: "utf8", timeout: BAW_TIMEOUT_MS });
  } catch (err) {
    // Per the skill's own Error Handling rule: report the CLI's error as-is, don't guess why.
    const detail = err.signal === "SIGTERM"
      ? `timed out after ${BAW_TIMEOUT_MS}ms`
      : (err.stderr ? err.stderr.toString() : err.message);
    throw new Error(`baw ${args.join(" ")} failed: ${detail}`);
  }
  return JSON.parse(raw);
}

/** Throws with a clear message if a response is missing fields this project depends on,
 *  instead of silently continuing with `undefined` values in a financial narration. */
function assertShape(obj, fields, label) {
  const missing = fields.filter((f) => obj?.[f] === undefined);
  if (missing.length) {
    throw new Error(`${label} response is missing expected field(s): ${missing.join(", ")} — ` +
      `real API shape may have changed since this was written against documentation. Raw: ${JSON.stringify(obj)}`);
  }
}

/**
 * Reads the wallet's current, live security configuration and daily quota.
 * Real shape per Binance's wallet-setting.md reference — never cache this across
 * calls, since the user can change these in the Binance App at any time.
 */
function fetchWalletRules() {
  const res = runBaw(["wallet", "settings"]);
  if (!res.success) throw new Error(`wallet settings returned success:false — ${JSON.stringify(res)}`);
  const d = res.data;
  assertShape(d, ["dailyLimit", "quotaUsed", "quotaLeft", "abnormalTxnHandling", "tradeAllTokens"], "wallet settings");
  return {
    dailyLimitUsd: d.dailyLimit,
    dailyQuotaUsedUsd: d.quotaUsed,
    dailyQuotaLeftUsd: d.quotaLeft,
    defiDailyLimitUsd: d.defiDailyLimit,
    defiQuotaLeftUsd: d.defiQuotaLeft,
    x402DailyLimitUsd: d.x402DailyLimit,
    x402QuotaLeftUsd: d.x402QuotaLeft,
    tradeAllTokens: d.tradeAllTokens,
    abnormalTxnHandling: d.abnormalTxnHandling, // "AutoReject" | "NeedConfirmation"
    quotaDate: d.quotaDate,
  };
}

/**
 * Real call to Binance's public query-token-audit API (documented separately from the
 * baw CLI — see developers.binance.com/docs/products/wallet-skills). This is a code-level
 * enforcement of the security pre-check, not a self-reported flag from the calling agent.
 * Requires Node 18+ for global fetch.
 */
async function auditToken(contractAddress, binanceChainId) {
  const requestId = crypto.randomUUID();
  let res;
  try {
    res = await fetch(TOKEN_AUDIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ binanceChainId: String(binanceChainId), contractAddress, requestId }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new Error(`token audit request failed: ${err.message}`);
  }
  if (!res.ok) throw new Error(`token audit HTTP ${res.status}`);
  const data = await res.json();
  const dataAvailable = data.hasResult === true && data.isSupported === true;
  return {
    dataAvailable,
    riskLevel: dataAvailable ? data.riskLevel : null,
    riskItems: data.riskItems ?? [],
    auditTime: data.auditTime ?? null,
    raw: data,
  };
}

/** Read-only swap quote — no execution. Real syntax per market-order.md. */
function getSwapQuote({ fromTokenQty, fromToken, toToken, binanceChainId, slippage }) {
  const args = [
    "market-order", "quote",
    "--fromTokenQty", String(fromTokenQty),
    "--fromToken", fromToken,
    "--toToken", toToken,
    "--binanceChainId", String(binanceChainId),
  ];
  if (slippage) args.push("--slippage", String(slippage));
  const res = runBaw(args);
  if (!res.success) throw new Error(`market-order quote returned success:false — ${JSON.stringify(res)}`);
  assertShape(res.data, ["fromCoinSymbol", "toCoinSymbol"], "market-order quote");
  return res.data; // { fromCoinSymbol, fromCoinAmount, toCoinSymbol, toCoinAmount, slippage }
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

/**
 * Pure function: compares a proposed swap against (a) this project's own MAX_ACTION_USD
 * ceiling and (b) the wallet's live daily quota, and produces the plain-language
 * explanation that is this project's actual product surface.
 */
function narrateDecision({ fromTokenQty, fromCoinSymbol, toCoinSymbol, chainName }, rules, maxActionUsd) {
  const isStable = STABLECOINS.has(String(fromCoinSymbol).toUpperCase());
  const amountUsd = isStable ? Number(fromTokenQty) : null;

  if (amountUsd === null) {
    return {
      narration: `Proposing to swap ${fromTokenQty} ${fromCoinSymbol} → ${toCoinSymbol}${chainName ? ` on ${chainName}` : ""}. ` +
        `This project can only estimate a USD value when swapping from a stablecoin (USDT/USDC) — ${fromCoinSymbol} isn't one, so this is out of scope for the guardrail check and will not proceed.`,
      withinProjectLimit: false,
      withinDailyQuota: null,
      proceed: false,
    };
  }

  const withinProjectLimit = amountUsd <= maxActionUsd;
  const quotaAfter = rules.dailyQuotaLeftUsd - amountUsd;
  const withinDailyQuota = quotaAfter >= 0;

  const narration = [
    `Proposing to swap ${fromTokenQty} ${fromCoinSymbol} (~$${amountUsd.toFixed(2)}) → ${toCoinSymbol}${chainName ? ` on ${chainName}` : ""}.`,
    `This project's own ceiling is $${maxActionUsd.toFixed(2)} per action — this swap is ${withinProjectLimit ? "within" : "OVER"} that.`,
    withinDailyQuota
      ? `Your Binance-side daily limit has $${rules.dailyQuotaLeftUsd.toFixed(2)} of $${rules.dailyLimitUsd.toFixed(2)} left today; about $${quotaAfter.toFixed(2)} would remain after this swap.`
      : `Your Binance-side daily limit only has $${rules.dailyQuotaLeftUsd.toFixed(2)} left today — this swap alone would exceed it, so Binance will reject it independent of this project's own check.`,
    rules.abnormalTxnHandling === "AutoReject"
      ? "Your wallet auto-rejects abnormal/high-risk transactions on Binance's side."
      : "Your wallet requires a manual Binance App confirmation for abnormal/high-risk transactions.",
    rules.tradeAllTokens
      ? "Your wallet allows trading any token."
      : "Your wallet restricts trading to an allow-listed set of tokens — an unlisted target will be rejected by Binance regardless of this check.",
  ].join(" ");

  return { narration, withinProjectLimit, withinDailyQuota, proceed: withinProjectLimit && withinDailyQuota };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The ONLY place `market-order swap` is ever called from, per SKILL.md. In order:
 *   1. Idempotency check — refuse to resubmit a swap already logged under the same key
 *   2. Real security audit on the token being acquired (toToken) — code-enforced, not
 *      self-reported. riskLevel 4-5 is a hard block; 2-3 requires elevatedRiskAcknowledged
 *   3. Quote + wallet rules + narration (pure/read-only)
 *   4. Refuse and log if narrateDecision().proceed is false, or if the wallet's abnormal-
 *      transaction handling is NeedConfirmation (unverified path — see comment below)
 *   5. Only then submit the real swap
 *   6. Poll to a TERMINAL state — an orderId means submitted, not completed (market-order.md)
 *   7. Log the final, real outcome — never the submit response alone
 *
 * proposedSwap: { idempotencyKey, fromTokenQty, fromToken, toToken, binanceChainId, chainName,
 *                 slippage?, mev?, gasLevel?, elevatedRiskAcknowledged? }
 */
async function checkAndExecute(proposedSwap) {
  const {
    idempotencyKey, fromTokenQty, fromToken, toToken, binanceChainId, chainName,
    slippage, mev, gasLevel, elevatedRiskAcknowledged,
  } = proposedSwap;
  const baseParams = { fromTokenQty, fromToken, toToken, binanceChainId };

  if (!idempotencyKey) {
    return logDecision({
      action: "swap", status: "refused", reason: "missing_idempotency_key", params: baseParams,
      narration: "Refused: every proposed swap needs a unique idempotencyKey so a repeated " +
        "or retried request can't submit twice.",
    });
  }
  const already = loadEntries().find((e) => e.idempotencyKey === idempotencyKey);
  if (already) {
    return { ...already, deduped: true };
  }

  // Real, code-enforced security check — not a flag the caller can set without having done it.
  let audit;
  try {
    audit = await auditToken(toToken, binanceChainId);
  } catch (err) {
    return logDecision({
      action: "swap", status: "audit_failed", idempotencyKey, params: baseParams,
      narration: `Refused: could not complete the token security audit (${err.message}) — ` +
        "failing closed rather than trading an unaudited token.",
    });
  }
  if (audit.dataAvailable && audit.riskLevel >= 4) {
    return logDecision({
      action: "swap", status: "refused", reason: "token_audit_high_risk", idempotencyKey,
      params: baseParams, audit,
      narration: `Refused: query-token-audit scored the destination token riskLevel ${audit.riskLevel} ` +
        `(${audit.riskLevel === 5 ? "severe confirmed risk" : "critical risk"}) — this project hard-blocks ` +
        "that regardless of any other setting.",
    });
  }
  if (audit.dataAvailable && audit.riskLevel >= 2 && !elevatedRiskAcknowledged) {
    return logDecision({
      action: "swap", status: "refused", reason: "elevated_risk_not_acknowledged", idempotencyKey,
      params: baseParams, audit,
      narration: `Refused: query-token-audit scored the destination token riskLevel ${audit.riskLevel} ` +
        "(moderate risk — review carefully). Proceeding requires elevatedRiskAcknowledged:true from " +
        "an explicit human decision, not an automatic default.",
    });
  }

  const quote = getSwapQuote({ fromTokenQty, fromToken, toToken, binanceChainId, slippage });
  const rules = fetchWalletRules();
  const config = loadConfig();
  const decision = narrateDecision(
    { fromTokenQty, fromCoinSymbol: quote.fromCoinSymbol, toCoinSymbol: quote.toCoinSymbol, chainName },
    rules,
    config.MAX_ACTION_USD
  );

  // UNVERIFIED PATH: we don't know what the CLI actually returns while a NeedConfirmation
  // transaction is awaiting in-app approval — refuse here rather than guess at handling it.
  if (rules.abnormalTxnHandling === "NeedConfirmation") {
    return logDecision({
      action: "swap", status: "refused", reason: "needs_confirmation_path_unverified", idempotencyKey,
      params: baseParams, quote, narration: decision.narration +
        " Additionally: this wallet is set to NeedConfirmation for abnormal transactions, and this " +
        "project has never verified what the CLI does while that confirmation is pending — refusing " +
        "rather than risk a silent double-submit or a hang. Switch to AutoReject to use this flow, " +
        "or treat this as the next thing to test live.",
    });
  }

  if (!decision.proceed) {
    return logDecision({
      action: "swap", status: "refused", idempotencyKey, params: baseParams, quote, narration: decision.narration,
    });
  }

  const swapArgs = ["market-order", "swap", "--fromTokenQty", String(fromTokenQty),
    "--fromToken", fromToken, "--toToken", toToken, "--binanceChainId", String(binanceChainId)];
  if (slippage) swapArgs.push("--slippage", String(slippage));
  if (mev !== undefined) swapArgs.push("--mev", String(mev));
  if (gasLevel) swapArgs.push("--gasLevel", gasLevel);

  let submitRes;
  try {
    submitRes = runBaw(swapArgs);
  } catch (err) {
    return logDecision({
      action: "swap", status: "submit_failed", idempotencyKey, params: baseParams,
      narration: decision.narration, error: err.message,
    });
  }
  if (!submitRes.success) {
    return logDecision({
      action: "swap", status: "submit_rejected", idempotencyKey, params: baseParams,
      narration: decision.narration, response: submitRes,
    });
  }

  const orderId = submitRes.data.orderId;

  // MANDATORY per market-order.md: orderId != completed. Poll to FINISHED or FAILED.
  // ~3s x 15 = 45s, a bit above the doc's own "~30s is a reasonable wait" guidance.
  const POLL_INTERVAL_MS = 3000;
  const MAX_POLLS = 15;
  let order = null;
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const listRes = runBaw(["market-order", "list", "--orderId", orderId]);
    order = listRes?.data?.list?.[0] ?? null;
    if (order?.status === "FINISHED" || order?.status === "FAILED") break;
  }

  const status = order?.status === "FINISHED" ? "executed"
    : order?.status === "FAILED" ? "failed"
    : "still_pending"; // do NOT report success — tell the user it's still processing

  return logDecision({
    action: "swap", orderId, idempotencyKey, params: baseParams, narration: decision.narration,
    status, txHash: order?.txHash ?? null, finalOrder: order,
  });
}

function loadEntries() {
  if (!fs.existsSync(LOG_PATH)) return [];
  return fs.readFileSync(LOG_PATH, "utf8").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
}

function logDecision(entry) {
  const record = { timestamp: new Date().toISOString(), ...entry };
  fs.appendFileSync(LOG_PATH, JSON.stringify(record) + "\n");
  return record;
}

module.exports = {
  fetchWalletRules,
  getSwapQuote,
  auditToken,
  narrateDecision,
  checkAndExecute,
  logDecision,
  loadConfig,
  loadEntries,
};
