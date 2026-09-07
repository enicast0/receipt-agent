# Demo video — shot list

Track A requires a video demo alongside the GitHub repo. Aim for 2–3 minutes; judges are
reportedly watching a lot of these, so lead with the differentiator, not the setup.

**Do the real-wallet pass (see README) before recording anything.** Every shot below assumes
real, working numbers on screen — don't fake the ledger with sample data during the actual
recording.

1. **Hook (10–15s).** State the problem in one breath: agents that touch your money should be
   able to explain themselves before they act, not after. Most DeFi agents just execute; this
   one narrates against your wallet's own rules first.

2. **Show the empty ledger (5s).** Open `demo/ledger.html`. It says nothing logged yet — this
   establishes the ledger is real output, not a mockup.

3. **Trigger one real swap (30–40s).** In your connected agent client, ask for a small swap
   (something inside `MAX_ACTION_USD`, e.g. "swap $5 USDT to BNB"). Let the narration play out
   on screen — the agent stating your daily quota, the project's own ceiling, and the
   abnormal-transaction handling setting, before it submits anything.

4. **Refresh the ledger (10s).** Reload `demo/ledger.html` — the entry appears with its full
   narration and an "executed" badge and real `txHash`.

5. **Show a refusal (20–30s).** Trigger a swap over `MAX_ACTION_USD` (e.g. $15 when the ceiling
   is $10). The agent should refuse before submitting anything — refresh the ledger again to
   show the "refused" entry with its own narration. This is the proof the limit is real
   enforcement, not a comment nobody reads.

6. **Close (10–15s).** One sentence: every action this agent proposes is checked against rules
   you set, not the agent, and every decision — yes or no — is on the record.

## Notes

- Keep the terminal/chat window and the ledger page both visible where possible — the point is
  the connection between "what the agent said" and "what got logged."
- If a real swap takes a while to reach a terminal state, cut the wait in editing — say once,
  on camera, that it's polling to confirmation rather than trusting the initial response, and
  jump to the result.
