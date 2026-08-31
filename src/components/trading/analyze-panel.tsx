"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Brain, Loader2, ShieldCheck, ShieldX, Sparkles, Play, X } from "lucide-react";
import { toast } from "sonner";
import type { PortfolioData } from "@/app/page";
import { fmtPct, fmtNum, dirBadge, decisionBadge } from "./format";

interface AnalysisResult {
  analysisId: string;
  analysis: {
    symbol: string;
    price: number;
    technical: any;
    fundamental: any;
    sentiment: any;
    macro: any;
  };
  proposal: {
    symbol: string;
    direction: string;
    thesis: string;
    bullCase: string;
    bearCase: string;
    confidence: number;
    expectedReturn: number;
    stopLoss: number;
    timeHorizon: string;
    price: number;
  };
  riskDecision: {
    decision: "APPROVE" | "REJECT";
    rules: any[];
    positionSize?: number;
    positionValueUsd?: number;
    positionSizePct?: number;
    reason: string;
  };
  counterfactualId: string | null;
}

export function AnalyzePanel({ portfolio }: { portfolio: PortfolioData | null }) {
  const [symbol, setSymbol] = useState("NVDA");
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const analyze = async () => {
    if (!symbol.trim()) {
      toast.error("Enter a symbol");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: symbol.toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data);
      toast.success(`Analysis complete: ${data.riskDecision.decision}`);
    } catch (e: any) {
      toast.error(`Analyze failed: ${e?.message}`);
    } finally {
      setLoading(false);
    }
  };

  const execute = async () => {
    if (!result) return;
    setExecuting(true);
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: result.analysisId,
          proposal: result.proposal,
          positionSize: result.riskDecision.positionSize,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Trade executed: ${data.order.qty} shares @ $${data.order.filledPrice.toFixed(2)} (${data.order.source})`);
    } catch (e: any) {
      toast.error(`Execute failed: ${e?.message}`);
    } finally {
      setExecuting(false);
    }
  };

  const agents = result
    ? [
        { name: "Technical", data: result.analysis.technical, color: "text-sky-400", bg: "bg-sky-500/10" },
        { name: "Fundamental", data: result.analysis.fundamental, color: "text-violet-400", bg: "bg-violet-500/10" },
        { name: "Sentiment", data: result.analysis.sentiment, color: "text-amber-400", bg: "bg-amber-500/10" },
        { name: "Macro", data: result.analysis.macro, color: "text-emerald-400", bg: "bg-emerald-500/10" },
      ]
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Input panel */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" /> Analyze a Symbol
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Ticker Symbol</Label>
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. NVDA"
              className="uppercase"
              onKeyDown={(e) => e.key === "Enter" && analyze()}
            />
          </div>
          <Button onClick={analyze} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" /> Run Analysis
              </>
            )}
          </Button>

          <div className="text-[11px] text-muted-foreground pt-2">
            Runs all 4 research agents → debate → risk governor. Takes ~5-15 seconds.
          </div>

          <Separator className="my-3" />

          <div className="text-[11px] text-muted-foreground">Quick Pick</div>
          <div className="flex flex-wrap gap-1.5">
            {(portfolio?.universe ?? []).slice(0, 10).map((u) => (
              <button
                key={u.ticker}
                onClick={() => setSymbol(u.ticker)}
                className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                  symbol === u.ticker
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border/40 bg-background/40 hover:bg-background/60"
                }`}
              >
                {u.ticker}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Result panel */}
      <Card className="bg-card/50 lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Analysis Result</span>
            {result && (
              <Button variant="ghost" size="sm" onClick={() => setResult(null)} className="h-6 text-[10px]">
                <X className="h-3 w-3" /> Clear
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!result && !loading && (
            <div className="text-center text-xs text-muted-foreground py-20">
              Pick a symbol and click <span className="text-primary">Run Analysis</span> to begin.
            </div>
          )}

          {loading && (
            <div className="space-y-3 py-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 rounded-md bg-background/40 animate-pulse" />
              ))}
              <div className="text-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 inline animate-spin mr-1" />
                Research agents are debating…
              </div>
            </div>
          )}

          {result && !loading && (
            <ScrollArea className="max-h-[calc(100vh-260px)]">
              <div className="space-y-4">
                {/* Header: symbol + direction + decision */}
                <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-border/40">
                  <h3 className="text-xl font-bold">{result.proposal.symbol}</h3>
                  <Badge variant="outline" className={`text-xs ${dirBadge(result.proposal.direction)}`}>
                    {result.proposal.direction}
                  </Badge>
                  <Badge variant="outline" className={`text-xs ${decisionBadge(result.riskDecision.decision)}`}>
                    {result.riskDecision.decision === "APPROVE" ? (
                      <ShieldCheck className="h-3 w-3 mr-1" />
                    ) : (
                      <ShieldX className="h-3 w-3 mr-1" />
                    )}
                    {result.riskDecision.decision}
                  </Badge>
                  <div className="text-xs text-muted-foreground ml-auto">
                    Price: <span className="tabular-nums font-medium">${result.proposal.price.toFixed(2)}</span>
                  </div>
                </div>

                {/* Thesis */}
                <div className="rounded-md border border-border/40 bg-background/40 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    Thesis (Debate Agent)
                  </div>
                  <p className="text-sm">{result.proposal.thesis}</p>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
                    <div className="rounded bg-emerald-500/5 border border-emerald-500/20 p-2">
                      <div className="text-emerald-400 font-medium mb-0.5">Bull Case</div>
                      <div className="text-muted-foreground">{result.proposal.bullCase}</div>
                    </div>
                    <div className="rounded bg-rose-500/5 border border-rose-500/20 p-2">
                      <div className="text-rose-400 font-medium mb-0.5">Bear Case</div>
                      <div className="text-muted-foreground">{result.proposal.bearCase}</div>
                    </div>
                  </div>
                </div>

                {/* Proposal params */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat label="Confidence" value={fmtPct(result.proposal.confidence, 0)} />
                  <Stat label="Expected Return" value={fmtPct(result.proposal.expectedReturn)} />
                  <Stat label="Stop Loss" value={fmtPct(result.proposal.stopLoss)} />
                  <Stat label="Horizon" value={result.proposal.timeHorizon} />
                </div>

                {/* Agent signals */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {agents.map((a) => (
                    <div key={a.name} className="rounded-md border border-border/40 bg-background/40 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-medium ${a.color}`}>{a.name} Agent</span>
                        <Badge variant="outline" className={`text-[10px] ${dirBadge(a.data.direction)}`}>
                          {a.data.direction}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground mb-1">
                        Confidence: {fmtPct(a.data.confidence, 0)}
                      </div>
                      <p className="text-[11px] mb-2">{a.data.reasoning}</p>
                      <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                        {Object.entries(a.data.keyMetrics || {}).map(([k, v]: [string, any]) => (
                          <span key={k}>
                            <span className="opacity-60">{k}:</span>{" "}
                            <span className="font-mono">{typeof v === "number" ? fmtNum(v, 2) : v}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Risk Governor */}
                <div className="rounded-md border border-border/40 bg-background/40 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Risk Governor</span>
                    <Badge variant="outline" className={`text-[10px] ml-auto ${decisionBadge(result.riskDecision.decision)}`}>
                      {result.riskDecision.decision}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-3">{result.riskDecision.reason}</p>

                  {result.riskDecision.decision === "APPROVE" && (
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <Stat label="Position Size" value={`${result.riskDecision.positionSize} shares`} />
                      <Stat label="Position Value" value={`$${result.riskDecision.positionValueUsd?.toFixed(2)}`} />
                      <Stat label="% of Equity" value={`${result.riskDecision.positionSizePct?.toFixed(2)}%`} />
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Rule Checks
                    </div>
                    {result.riskDecision.rules.map((r: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-[11px]">
                        <span
                          className={`mt-0.5 ${r.passed ? "text-emerald-400" : "text-rose-400"}`}
                        >
                          {r.passed ? "✓" : "✗"}
                        </span>
                        <div className="flex-1">
                          <div className="font-mono text-[10px]">{r.rule}</div>
                          <div className="text-muted-foreground">{r.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action button */}
                {result.riskDecision.decision === "APPROVE" && (
                  <Button
                    onClick={execute}
                    disabled={executing}
                    className="w-full"
                    size="lg"
                  >
                    {executing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Executing…
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" /> Execute Trade ({result.riskDecision.positionSize} shares @ ${result.proposal.price.toFixed(2)})
                      </>
                    )}
                  </Button>
                )}
                {result.riskDecision.decision === "REJECT" && (
                  <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-center text-xs text-rose-400">
                    Trade rejected. Logged to counterfactual memory for later review.
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
