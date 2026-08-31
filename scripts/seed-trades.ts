/**
 * Seed script — analyzes the universe and executes all approved trades.
 * Run with: bun run /home/z/my-project/scripts/seed-trades.ts
 */
const BASE = "http://localhost:3000";

async function main() {
  // Step 1: batch-analyze the universe
  console.log("Running batch analysis...");
  const batchRes = await fetch(`${BASE}/api/run-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const batch = await batchRes.json();
  console.log(`Batch complete: ${batch.results.length} symbols analyzed`);

  // Step 2: re-run analysis for each approved symbol and execute
  const approved = batch.results.filter((r: any) => r.decision === "APPROVE");
  console.log(`Executing ${approved.length} approved trades...`);

  for (const a of approved) {
    try {
      const res = await fetch(`${BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: a.symbol }),
      });
      const data = await res.json();
      if (data.riskDecision?.decision !== "APPROVE") {
        console.log(`  ${a.symbol}: re-analyzed as ${data.riskDecision?.decision}, skipping`);
        continue;
      }
      const execRes = await fetch(`${BASE}/api/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: data.analysisId,
          proposal: data.proposal,
          positionSize: data.riskDecision.positionSize,
        }),
      });
      const exec = await execRes.json();
      if (exec.order) {
        console.log(`  ${a.symbol}: executed ${exec.order.qty} @ $${exec.order.filledPrice.toFixed(2)} (trade ${exec.trade.id})`);
      } else {
        console.log(`  ${a.symbol}: execute failed`, exec);
      }
    } catch (e: any) {
      console.error(`  ${a.symbol}: error`, e.message);
    }
  }

  // Step 3: list open trades
  const tradesRes = await fetch(`${BASE}/api/trades?status=open`);
  const trades = (await tradesRes.json()).trades;
  console.log(`\nOpen trades: ${trades.length}`);
  trades.forEach((t: any) => {
    console.log(`  ${t.symbol} ${t.direction} ${t.quantity}@${t.entryPrice} conf=${(t.confidence*100).toFixed(0)}%`);
  });
}

main().catch(console.error);
