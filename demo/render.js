#!/usr/bin/env node
/**
 * render.js — the "thin display layer" for the demo (Session 4 scope).
 *
 * Reads ../skill/scripts/decisions.log.jsonl and writes ledger.html — a single static
 * file, self-contained, meant to be reloaded in a browser during the demo recording.
 * Run this again after every real action to refresh it:
 *
 *   node demo/render.js
 *
 * No server, no build step, no dependency beyond Node itself — deliberately thin per
 * the Agent-skill pattern this project committed to in Session 0.
 */

const fs = require("fs");
const path = require("path");

const LOG_PATH = path.join(__dirname, "..", "skill", "scripts", "decisions.log.jsonl");
const OUT_PATH = path.join(__dirname, "ledger.html");

const FAILURE_STATUSES = new Set(["refused", "failed", "submit_failed", "submit_rejected"]);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tokenLabel(entry, side) {
  const fromSym = entry.quote?.fromCoinSymbol ?? entry.finalOrder?.fromTokenName;
  const toSym = entry.quote?.toCoinSymbol ?? entry.finalOrder?.toTokenName;
  if (side === "from" && fromSym) return fromSym;
  if (side === "to" && toSym) return toSym;
  const addr = side === "from" ? entry.params?.fromToken : entry.params?.toToken;
  if (!addr) return "?";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function fmtTime(iso) {
  if (!iso) return "unknown time";
  const d = new Date(iso);
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function loadEntries() {
  if (!fs.existsSync(LOG_PATH)) return [];
  return fs
    .readFileSync(LOG_PATH, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function renderEntry(entry, index) {
  const status = entry.status || "unknown";
  const amount = entry.params?.fromTokenQty;
  const from = tokenLabel(entry, "from");
  const to = tokenLabel(entry, "to");

  return `
    <div class="entry">
      <div class="entry-row">
        <div><span class="entry-no">#${index + 1}</span><span class="entry-time">${fmtTime(entry.timestamp)}</span></div>
        <div class="entry-amount">${escapeHtml(amount ?? "—")} ${escapeHtml(from)} → ${escapeHtml(to)}
          <span class="badge ${escapeHtml(status)}">${escapeHtml(status.replace(/_/g, " "))}</span>
        </div>
      </div>
      <div class="narration">${escapeHtml(entry.narration || "(no narration recorded)")}</div>
    </div>`;
}

function render() {
  const entries = loadEntries().reverse(); // newest first
  const total = entries.length;
  const executed = entries.filter((e) => e.status === "executed").length;
  const refused = entries.filter((e) => FAILURE_STATUSES.has(e.status)).length;

  const entriesHtml = total
    ? entries.map(renderEntry).join("\n")
    : `<div class="empty"><strong>Nothing logged yet.</strong>Run a swap through the skill, then re-run <code>node demo/render.js</code> to refresh this page.</div>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipts — decision ledger</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --cover-green: #2F4B3C;
    --paper: #F4F2E8;
    --rule-green: #B9C9B6;
    --ink: #1E2A22;
    --ink-soft: #55645A;
    --approved: #3B6E4A;
    --refused: #9B4A32;
    --pending: #A5822E;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--cover-green);
    background-image: radial-gradient(circle at 18% 8%, rgba(255,255,255,0.05), transparent 42%);
    min-height: 100vh;
    padding: 48px 20px;
    font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--ink);
  }
  .sheet {
    max-width: 640px;
    margin: 0 auto;
    background: var(--paper);
    box-shadow: 0 30px 60px rgba(0,0,0,0.35);
  }
  .masthead { background: var(--cover-green); color: var(--paper); padding: 28px 32px 22px; }
  .masthead h1 {
    font-family: "Zilla Slab", Georgia, serif;
    font-size: 28px; font-weight: 600; margin: 0 0 6px; letter-spacing: 0.2px;
  }
  .masthead p { margin: 0; font-size: 13px; color: rgba(244,242,232,0.72); line-height: 1.55; max-width: 46ch; }
  .summary {
    display: flex; gap: 26px; padding: 16px 32px;
    border-bottom: 1px solid var(--rule-green); font-size: 11.5px; color: var(--ink-soft);
  }
  .summary > div:not(:last-child) { margin-right: 26px; }
  .summary strong {
    color: var(--ink); font-size: 16px; display: block;
    font-family: "Zilla Slab", Georgia, serif; font-weight: 600;
  }
  .summary span { display: block; margin-top: 2px; }
  .entries { padding: 6px 0 22px; max-height: 66vh; overflow-y: auto; }
  .entry { padding: 18px 32px; border-bottom: 1px dashed var(--rule-green); }
  .entry-row { display: flex; justify-content: space-between; align-items: baseline; gap: 14px; font-size: 12.5px; flex-wrap: wrap; }
  .entry-no { color: var(--ink-soft); margin-right: 10px; }
  .entry-time { color: var(--ink-soft); }
  .entry-amount { font-size: 14px; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 3px;
    font-size: 10.5px; margin-left: 10px; color: var(--paper);
  }
  .badge.executed { background: var(--approved); }
  .badge.refused, .badge.failed, .badge.submit_failed, .badge.submit_rejected { background: var(--refused); }
  .badge.still_pending { background: var(--pending); }
  .narration {
    margin-top: 10px; font-size: 12px; line-height: 1.6; color: var(--ink-soft);
    padding-left: 20px; border-left: 2px solid var(--rule-green);
  }
  .empty { padding: 60px 32px; text-align: center; color: var(--ink-soft); font-size: 13px; line-height: 1.7; }
  .empty strong { display: block; font-family: "Zilla Slab", Georgia, serif; font-size: 17px; color: var(--ink); margin-bottom: 8px; }
  .footer-note { padding: 14px 32px 26px; font-size: 10.5px; color: var(--ink-soft); }
  code { background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 2px; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="masthead">
      <h1>Receipts</h1>
      <p>Every proposed on-chain action, checked against your wallet's own rules and this project's own limit, before anything runs.</p>
    </div>
    <div class="summary">
      <div><strong>${total}</strong><span>logged</span></div>
      <div><strong>${executed}</strong><span>executed</span></div>
      <div><strong>${refused}</strong><span>refused</span></div>
    </div>
    <div class="entries">
      ${entriesHtml}
    </div>
    <div class="footer-note">Regenerate after every action — node demo/render.js</div>
  </div>
</body>
</html>`;

  fs.writeFileSync(OUT_PATH, html);
  console.log(`Wrote ${OUT_PATH} (${total} entries, ${executed} executed, ${refused} refused).`);
}

render();
