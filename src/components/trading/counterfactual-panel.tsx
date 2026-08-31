"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Loader2, RefreshCw, History, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { fmtUsd, fmtPct, fmtTime, dirBadge } from "./format";

interface Counterfactual {
  id: string;
  symbol: string;
  direction: string;
  thesis: string;
  confidence: number;
  expectedReturn: number;
  rejectionRule: string;
  rejectionReason: string;
  priceAtRejection: number;
  rejectedAt: string;
  priceAfterMove?: number | null;
  counterfactualOutcome?: number | null;
  counterfactualProfitable?: boolean | null;
  counterfactualExplanation?: string | null;
  evaluatedAt?: string | null;
}

export function CounterfactualPanel() {
  const [items, setItems] = useState<Counterfactual[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/counterfactual");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setItems(data.counterfactuals || []);
    } catch (e: any) {
      toast.error(`Fetch failed: ${e?.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const evaluate = async (id: string) => {
    setEvaluating(id);
    try {
      const res = await fetch("/api/evaluate-counterfactual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Counterfactual evaluated");
      await refresh();
    } catch (e: any) {
      toast.error(`Evaluate failed: ${e?.message}`);
    } finally {
      setEvaluating(null);
    }
  };

  const evaluateAll = async () => {
    const unjustified = items.filter((i) => !i.counterfactualExplanation);
    if (unjustified.length === 0) {
      toast.info("All counterfactuals already evaluated");
      return;
    }
    toast.info(`Evaluating ${unjustified.length} counterfactuals…`);
    for (const cf of unjustified) {
      await evaluate(cf.id);
    }
  };

  const unjustifiedCount = items.filter((i) => !i.counterfactualExplanation).length;
  const profitableCount = items.filter((i) => i.counterfactualProfitable === true).length;
  const correctRejectCount = items.filter((i) => i.counterfactualProfitable === false).length;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Rejections" value={items.length} icon={<XCircle className="h-4 w-4 text-rose-400" />} />
        <StatCard label="Awaiting Evaluation" value={unjustifiedCount} icon={<AlertCircle className="h-4 w-4 text-amber-400" />} />
        <StatCard label="Would Have Profited" value={profitableCount} icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />} />
        <StatCard label="Correctly Rejected" value={correctRejectCount} icon={<CheckCircle2 className="h-4 w-4 text-sky-400" />} />
      </div>

      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Counterfactual Memory
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={evaluateAll} disabled={unjustifiedCount === 0}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Evaluate All
              </Button>
              <Button size="sm" variant="ghost" onClick={refresh}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            "Why didn't you trade?" — every rejected opportunity is stored. After the market moves, we evaluate whether the rejection was the right call.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-10">
              <Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-12">
              No rejections yet. Run analyses to populate counterfactual memory.
            </div>
          ) : (
            <ScrollArea className="max-h-[calc(100vh-340px)]">
              <div className="space-y-3">
                {items.map((cf) => (
                  <div
                    key={cf.id}
                    className="rounded-md border border-border/40 bg-background/40 p-3 hover:bg-background/60 transition-colors"
                  >
                    {/* Header row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{cf.symbol}</span>
                      <Badge variant="outline" className={`text-[10px] ${dirBadge(cf.direction)}`}>
                        {cf.direction}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-400 border-rose-500/20">
                        REJECTED: {cf.rejectionRule}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {fmtTime(cf.rejectedAt)}
                      </span>
                    </div>

                    {/* Thesis */}
                    <p className="text-[12px] mt-2 line-clamp-2">{cf.thesis}</p>

                    {/* Rejection reason */}
                    <div className="text-[11px] text-muted-foreground mt-1">
                      <span className="opacity-70">Reason:</span> {cf.rejectionReason}
                    </div>

                    {/* Numbers */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[11px]">
                      <div>
                        <span className="opacity-60">Confidence:</span>{" "}
                        <span className="font-mono">{fmtPct(cf.confidence, 0)}</span>
                      </div>
                      <div>
                        <span className="opacity-60">Expected Return:</span>{" "}
                        <span className="font-mono">{fmtPct(cf.expectedReturn)}</span>
                      </div>
                      <div>
                        <span className="opacity-60">Price @ Reject:</span>{" "}
                        <span className="font-mono">{fmtUsd(cf.priceAtRejection)}</span>
                      </div>
                      <div>
                        <span className="opacity-60">Price Now:</span>{" "}
                        <span className="font-mono">
                          {cf.priceAfterMove ? fmtUsd(cf.priceAfterMove) : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Counterfactual outcome */}
                    {cf.counterfactualOutcome !== null && cf.counterfactualOutcome !== undefined && (
                      <>
                        <Separator className="my-2" />
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              cf.counterfactualProfitable
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-sky-500/10 text-sky-400 border-sky-500/20"
                            }`}
                          >
                            {cf.counterfactualProfitable ? "WOULD HAVE PROFITED" : "CORRECTLY REJECTED"}
                          </Badge>
                          <span className="text-[11px]">
                            Counterfactual outcome:{" "}
                            <span
                              className={`font-mono font-medium ${
                                cf.counterfactualOutcome >= 0 ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {cf.counterfactualOutcome >= 0 ? "+" : ""}
                              {fmtPct(cf.counterfactualOutcome)}
                            </span>
                          </span>
                        </div>
                        {cf.counterfactualExplanation && (
                          <div className="mt-2 rounded bg-primary/5 border border-primary/20 p-2 text-[11px]">
                            <div className="text-primary font-medium text-[10px] uppercase tracking-wide mb-0.5">
                              Risk Governor's Explanation
                            </div>
                            {cf.counterfactualExplanation}
                          </div>
                        )}
                      </>
                    )}

                    {/* Action */}
                    {!cf.counterfactualExplanation && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 h-7 text-[11px]"
                        onClick={() => evaluate(cf.id)}
                        disabled={evaluating === cf.id}
                      >
                        {evaluating === cf.id ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Evaluating…
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-3 w-3 mr-1" /> Evaluate Outcome
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="bg-card/50">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {icon}
        </div>
        <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
