/**
 * Seed journal script — closes open trades so the journal & stats populate.
 */
const BASE = "http://localhost:3000";

async function main() {
  const tradesRes = await fetch(`${BASE}/api/trades?status=open`);
  const trades = (await tradesRes.json()).trades;
  console.log(`Found ${trades.length} open trades to close`);

  for (const t of trades) {
    const reasons = ["take_profit", "stop_loss", "time_exit"] as const;
    const reason = reasons[Math.floor(Math.random() * reasons.length)];
    const res = await fetch(`${BASE}/api/close-trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, reason }),
    });
    const data = await res.json();
    if (data.trade) {
      const o = data.trade.outcome;
      console.log(`  ${t.symbol}: closed @ $${data.trade.exitPrice?.toFixed(2)} outcome=${(o*100).toFixed(2)}% reason=${reason} correct=${data.trade.thesisCorrect}`);
    } else {
      console.log(`  ${t.symbol}: close failed`, data);
    }
  }

  // Evaluate all counterfactuals
  const cfRes = await fetch(`${BASE}/api/counterfactual`);
  const cfs = (await cfRes.json()).counterfactuals;
  console.log(`\nEvaluating ${cfs.length} counterfactuals...`);
  for (const cf of cfs) {
    if (cf.counterfactualExplanation) continue;
    const res = await fetch(`${BASE}/api/evaluate-counterfactual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cf.id }),
    });
    const data = await res.json();
    if (data.counterfactual) {
      const c = data.counterfactual;
      console.log(`  ${c.symbol}: cf outcome=${(c.counterfactualOutcome*100).toFixed(2)}% profitable=${c.counterfactualProfitable}`);
    }
  }

  // Final stats
  const statsRes = await fetch(`${BASE}/api/stats`);
  const stats = (await statsRes.json()).stats;
  console.log(`\nFinal stats:`);
  console.log(`  Total trades: ${stats.totalTrades}`);
  console.log(`  Win rate: ${(stats.winRate*100).toFixed(1)}%`);
  console.log(`  Avg return: ${(stats.avgReturnPct*100).toFixed(2)}%`);
  console.log(`  Sharpe: ${stats.sharpeOverall}`);
}

main().catch(console.error);
