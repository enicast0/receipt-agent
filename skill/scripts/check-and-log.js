#!/usr/bin/env node
/**
 * check-and-log.js
 *
 * Session 2: fetchWalletRules(), getSwapQuote(), and narrateDecision() are implemented
 * for real, against Binance's documented `baw` CLI behavior (see references cited in
 * SESSION_REPORT.md — this has been verified against public docs, NOT against a live
 * connected wallet, since this build environment has no network access or Binance
 * account. Confirm against a real wallet before trusting this in the demo.
 *
 * checkAndExecute() is still a stub — Session 3 wires it to a real `market-order swap`
 * call, including the mandatory poll-to-terminal-state step documented below. Per
 * SKILL.md, no write-capable Agentic Wallet call happens anywhere outside this function.
 *
 * KNOWN LIMITATION (see SKILL.md): amountUsd is only meaningful when fromToken is a USD
 * stablecoin (USDT/USDC), since `market-order quote` returns token amounts, not a USD
 * value, and no price-oracle lookup is wired in this project. Swaps starting from a
 * non-stable token are out of scope for this MVP.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const CONFIG_PATH = path.join(__dirname, "..", "guardrails.config.json");
const LOG_PATH = path.join(__dirname, "decisions.log.jsonl");

const STABLECOINS = new Set(["USDT", "USDC"]);

/** Shells out to the `baw` CLI. Always appends --json, per SKILL.md's "Build the Command" rule. */
function runBaw(args) {
  let raw;
  try {
    raw = execFileSync("baw", [...args, "--json"], { encoding: "utf8" });
  } catch (err) {
    // Per the skill's own Error Handling rule: report the CLI's error as-is, don't guess why.
    const detail = err.stderr ? err.stderr.toString() : err.message;
    throw new Error(`baw ${args.join(" ")} failed: ${detail}`);
  }
  return JSON.parse(raw);
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
 *   1. Quote + wallet rules + narration (all pure/read-only, implemented above)
 *   2. Refuse and log if the token-audit pre-check (security.md §1) wasn't acknowledged,
 *      or if narrateDecision().proceed is false — never partially execute
 *   3. Only then submit the real swap
 *   4. Poll to a TERMINAL state — an orderId means submitted, not completed (market-order.md)
 *   5. Log the final, real outcome — never the submit response alone
 *
 * proposedSwap: { fromTokenQty, fromToken, toToken, binanceChainId, chainName,
 *                 slippage?, mev?, gasLevel?, tokenAuditAcknowledged }
 */
async function checkAndExecute(proposedSwap) {
  const {
    fromTokenQty, fromToken, toToken, binanceChainId, chainName,
    slippage, mev, gasLevel, tokenAuditAcknowledged,
  } = proposedSwap;
  const baseParams = { fromTokenQty, fromToken, toToken, binanceChainId };

  // Code-level checkpoint for Binance's own security.md §1 pre-check — not just a prose
  // instruction, since the whole point of this project is that guardrails live in code.
  if (!tokenAuditAcknowledged) {
    return logDecision({
      action: "swap", status: "refused", reason: "token_audit_not_acknowledged",
      params: baseParams,
      narration: "Refused: the swap security pre-check (query-token-audit, per security.md §1) " +
        "must be completed and acknowledged before this wrapper will submit a swap.",
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

  if (!decision.proceed) {
    return logDecision({
      action: "swap", status: "refused", params: baseParams, quote, narration: decision.narration,
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
      action: "swap", status: "submit_failed", params: baseParams,
      narration: decision.narration, error: err.message,
    });
  }
  if (!submitRes.success) {
    return logDecision({
      action: "swap", status: "submit_rejected", params: baseParams,
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
    action: "swap", orderId, params: baseParams, narration: decision.narration,
    status, txHash: order?.txHash ?? null, finalOrder: order,
  });
}

function logDecision(entry) {
  const record = { timestamp: new Date().toISOString(), ...entry };
  fs.appendFileSync(LOG_PATH, JSON.stringify(record) + "\n");
  return record;
}

module.exports = {
  fetchWalletRules,
  getSwapQuote,
  narrateDecision,
  checkAndExecute,
  logDecision,
  loadConfig,
};
