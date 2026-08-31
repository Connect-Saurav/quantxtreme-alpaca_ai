"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, BookOpen, X, ArrowDownToLine } from "lucide-react";
import { toast } from "sonner";
import { fmtUsd, fmtPct, fmtTime, dirBadge } from "./format";

interface Trade {
  id: string;
  symbol: string;
  direction: string;
  thesis: string;
  confidence: number;
  expectedReturn: number;
  stopLoss: number;
  timeHorizon: string;
  signalsUsed: string[];
  entryPrice: number;
  quantity: number;
  status: string;
  exitPrice?: number | null;
  entryAt: string;
  exitAt?: string | null;
  outcome?: number | null;
  thesisCorrect?: boolean | null;
  lesson?: string | null;
  closedReason?: string | null;
}

export function JournalPanel() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [selected, setSelected] = useState<Trade | null>(null);
  const [closing, setClosing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/trades?status=${filter}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTrades(data.trades || []);
    } catch (e: any) {
      toast.error(`Fetch failed: ${e?.message}`);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const closeTrade = async (id: string, reason: "take_profit" | "stop_loss" | "time_exit" | "manual") => {
    setClosing(id);
    try {
      const res = await fetch("/api/close-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Trade closed. Outcome: ${fmtPct(data.trade.outcome, 2)}`);
      await refresh();
      if (selected?.id === id) setSelected(data.trade);
    } catch (e: any) {
      toast.error(`Close failed: ${e?.message}`);
    } finally {
      setClosing(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" /> Trade Journal
            </CardTitle>
            <div className="flex gap-1">
              {(["all", "open", "closed"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "outline"}
                  className="h-7 text-[11px] capitalize"
                  onClick={() => setFilter(f)}
                >
                  {f}
                </Button>
              ))}
              <Button size="sm" variant="ghost" className="h-7" onClick={refresh}>
                <Loader2 className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Every trade records the full pipeline: THESIS → SIGNALS → DECISION → EXECUTION → POSITION → OUTCOME → THESIS CORRECT? → LESSON.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-10">
              <Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" />
            </div>
          ) : trades.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-12">
              No trades yet. Execute a trade from the Analyze tab.
            </div>
          ) : (
            <ScrollArea className="max-h-[calc(100vh-340px)]">
              <div className="space-y-2">
                {trades.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-md border border-border/40 bg-background/40 p-3 hover:bg-background/60 transition-colors cursor-pointer"
                    onClick={() => setSelected(t)}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{t.symbol}</span>
                      <Badge variant="outline" className={`text-[10px] ${dirBadge(t.direction)}`}>
                        {t.direction}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          t.status === "OPEN"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {t.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {fmtTime(t.entryAt)}
                      </span>
                    </div>
                    <p className="text-[11px] mt-1 line-clamp-1 text-muted-foreground">{t.thesis}</p>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2 text-[10px]">
                      <div>
                        <span className="opacity-60">Conf:</span>{" "}
                        <span className="font-mono">{fmtPct(t.confidence, 0)}</span>
                      </div>
                      <div>
                        <span className="opacity-60">Entry:</span>{" "}
                        <span className="font-mono">${t.entryPrice.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="opacity-60">Qty:</span>{" "}
                        <span className="font-mono">{t.quantity}</span>
                      </div>
                      <div>
                        <span className="opacity-60">Exp:</span>{" "}
                        <span className="font-mono">{fmtPct(t.expectedReturn)}</span>
                      </div>
                      {t.outcome !== null && t.outcome !== undefined && (
                        <div>
                          <span className="opacity-60">Outcome:</span>{" "}
                          <span
                            className={`font-mono font-medium ${
                              t.outcome >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {t.outcome >= 0 ? "+" : ""}
                            {fmtPct(t.outcome)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-card border border-border rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{selected.symbol}</span>
                <Badge variant="outline" className={`text-[10px] ${dirBadge(selected.direction)}`}>
                  {selected.direction}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {selected.status}
                </Badge>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="max-h-[calc(90vh-100px)]">
              <div className="p-4 space-y-4">
                {/* Pipeline */}
                <Pipeline label="Thesis" content={selected.thesis} />
                <Pipeline
                  label="Signals Used"
                  content={selected.signalsUsed.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(", ")}
                />
                <Pipeline
                  label="Decision"
                  content={`Direction: ${selected.direction} | Confidence: ${fmtPct(selected.confidence, 0)} | Expected Return: ${fmtPct(selected.expectedReturn)} | Stop Loss: ${fmtPct(selected.stopLoss)}`}
                />
                <Pipeline
                  label="Execution"
                  content={`Entry: $${selected.entryPrice.toFixed(2)} × ${selected.quantity} shares = $${(selected.entryPrice * selected.quantity).toFixed(2)} | Horizon: ${selected.timeHorizon}`}
                />
                <Pipeline
                  label="Position"
                  content={selected.status === "OPEN" ? `OPEN since ${fmtTime(selected.entryAt)}` : `Closed at $${selected.exitPrice?.toFixed(2)} on ${fmtTime(selected.exitAt)} (${selected.closedReason})`}
                />
                {selected.outcome !== null && selected.outcome !== undefined && (
                  <Pipeline
                    label="Outcome"
                    content={`${selected.outcome >= 0 ? "+" : ""}${fmtPct(selected.outcome, 2)} (${selected.outcome >= 0 ? "profit" : "loss"})`}
                    highlight={selected.outcome >= 0 ? "good" : "bad"}
                  />
                )}
                {selected.thesisCorrect !== null && selected.thesisCorrect !== undefined && (
                  <Pipeline
                    label="Thesis Correct?"
                    content={selected.thesisCorrect ? "YES — thesis was right" : "NO — thesis was wrong"}
                    highlight={selected.thesisCorrect ? "good" : "bad"}
                  />
                )}
                {selected.lesson && (
                  <Pipeline label="Lesson" content={selected.lesson} highlight="info" />
                )}

                {/* Close actions */}
                {selected.status === "OPEN" && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => closeTrade(selected.id, "take_profit")}
                      disabled={closing === selected.id}
                      className="text-emerald-400 border-emerald-500/30"
                    >
                      <ArrowDownToLine className="h-3.5 w-3.5 mr-1" /> Close (Take Profit)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => closeTrade(selected.id, "stop_loss")}
                      disabled={closing === selected.id}
                      className="text-rose-400 border-rose-500/30"
                    >
                      <ArrowDownToLine className="h-3.5 w-3.5 mr-1" /> Close (Stop Loss)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => closeTrade(selected.id, "time_exit")}
                      disabled={closing === selected.id}
                    >
                      <ArrowDownToLine className="h-3.5 w-3.5 mr-1" /> Close (Time Exit)
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => closeTrade(selected.id, "manual")}
                      disabled={closing === selected.id}
                    >
                      <ArrowDownToLine className="h-3.5 w-3.5 mr-1" /> Close (Manual)
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}

function Pipeline({
  label,
  content,
  highlight,
}: {
  label: string;
  content: string;
  highlight?: "good" | "bad" | "info";
}) {
  const colors = {
    good: "bg-emerald-500/5 border-emerald-500/20",
    bad: "bg-rose-500/5 border-rose-500/20",
    info: "bg-primary/5 border-primary/20",
  };
  return (
    <div className={`rounded-md border p-3 ${colors[highlight as keyof typeof colors] || "border-border/40 bg-background/40"}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-[12px]">{content}</div>
    </div>
  );
}
