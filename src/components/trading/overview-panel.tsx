"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, XCircle, CheckCircle2, ArrowRight, Brain } from "lucide-react";
import { toast } from "sonner";
import type { PortfolioData } from "@/app/page";
import { fmtUsd, fmtPct, fmtTime, dirBadge, decisionBadge } from "./format";

interface FeedItem {
  symbol: string;
  direction: string;
  confidence: number;
  decision: string;
  reason: string;
  createdAt: string;
}

export function OverviewPanel({
  portfolio,
  loading,
  onRefresh,
  onGoToAnalyze,
}: {
  portfolio: PortfolioData | null;
  loading: boolean;
  onRefresh: () => void;
  onGoToAnalyze: () => void;
}) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [runningBatch, setRunningBatch] = useState(false);

  const refreshFeed = useCallback(async () => {
    try {
      // Fetch recent analyses + counterfactuals to compose a feed
      const [tradesRes, cfRes] = await Promise.all([
        fetch("/api/trades?status=all"),
        fetch("/api/counterfactual"),
      ]);
      const trades = tradesRes.ok ? (await tradesRes.json()).trades : [];
      const cfs = cfRes.ok ? (await cfRes.json()).counterfactuals : [];

      const items: FeedItem[] = [
        ...trades.map((t: any) => ({
          symbol: t.symbol,
          direction: t.direction,
          confidence: t.confidence,
          decision: "APPROVE",
          reason: t.thesis,
          createdAt: t.entryAt,
        })),
        ...cfs.map((c: any) => ({
          symbol: c.symbol,
          direction: c.direction,
          confidence: c.confidence,
          decision: "REJECT",
          reason: c.rejectionReason,
          createdAt: c.rejectedAt,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 30);

      setFeed(items);
    } catch (e: any) {
      // silent fail
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  useEffect(() => {
    refreshFeed();
    const i = setInterval(refreshFeed, 10000);
    return () => clearInterval(i);
  }, [refreshFeed]);

  const runBatch = async () => {
    setRunningBatch(true);
    try {
      const toastId = toast.loading("Running batch analysis on full universe…");
      const res = await fetch("/api/run-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const approved = data.results.filter((r: any) => r.decision === "APPROVE").length;
      const rejected = data.results.filter((r: any) => r.decision === "REJECT").length;
      toast.success(`Batch complete: ${approved} approved, ${rejected} rejected`, { id: toastId });
      await Promise.all([refreshFeed(), onRefresh()]);
    } catch (e: any) {
      toast.error(`Batch failed: ${e?.message}`);
    } finally {
      setRunningBatch(false);
    }
  };

  const positions = portfolio?.positions ?? [];
  const totalExposure =
    portfolio?.account.longMarketValue && portfolio?.account.equity
      ? (portfolio.account.longMarketValue / portfolio.account.equity) * 100
      : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left column: KPIs + Quick Actions */}
      <div className="space-y-4">
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button onClick={onGoToAnalyze} className="w-full justify-start" variant="default">
              <Brain className="h-4 w-4 mr-2" /> Analyze a Symbol
            </Button>
            <Button
              onClick={runBatch}
              disabled={runningBatch}
              variant="outline"
              className="w-full justify-start"
            >
              <Sparkles className="h-4 w-4 mr-2" /> Run Batch on Universe
            </Button>
            <Button onClick={onRefresh} variant="ghost" className="w-full justify-start">
              Refresh Portfolio
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Portfolio Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Equity" value={loading ? "…" : fmtUsd(portfolio?.account.equity)} />
            <Row label="Cash" value={loading ? "…" : fmtUsd(portfolio?.account.cash)} />
            <Row
              label="Long Market Value"
              value={loading ? "…" : fmtUsd(portfolio?.account.longMarketValue)}
            />
            <Row
              label="Total Exposure"
              value={loading ? "…" : `${totalExposure.toFixed(2)}%`}
              highlight={totalExposure > 80 ? "warn" : undefined}
            />
            <Row label="Open Positions" value={String(positions.length)} />
          </CardContent>
        </Card>
      </div>

      {/* Middle column: Open Positions */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Open Positions</span>
            <Badge variant="outline" className="text-[10px]">
              {positions.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-10">
              No open positions. Run an analysis to find trade ideas.
            </div>
          ) : (
            <ScrollArea className="max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Symbol</TableHead>
                    <TableHead className="text-[11px]">Side</TableHead>
                    <TableHead className="text-[11px] text-right">Qty</TableHead>
                    <TableHead className="text-[11px] text-right">PnL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((p: any) => (
                    <TableRow key={p.symbol}>
                      <TableCell className="font-medium text-xs">{p.symbol}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {p.side}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {p.qty}
                      </TableCell>
                      <TableCell
                        className={`text-right text-xs tabular-nums font-medium ${
                          p.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {p.unrealizedPnl >= 0 ? "+" : ""}
                        {fmtUsd(p.unrealizedPnl)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Right column: Decision feed */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Recent Decisions</span>
            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={refreshFeed}>
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingFeed ? (
            <div className="text-xs text-muted-foreground py-10 text-center">Loading…</div>
          ) : feed.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-10">
              No decisions yet. Run a batch to populate.
            </div>
          ) : (
            <ScrollArea className="max-h-[28rem]">
              <div className="space-y-2">
                {feed.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2 rounded-md border border-border/40 bg-background/40 hover:bg-background/60 transition-colors"
                  >
                    {item.decision === "APPROVE" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-rose-400 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-xs">{item.symbol}</span>
                        <Badge variant="outline" className={`text-[9px] ${dirBadge(item.direction)}`}>
                          {item.direction}
                        </Badge>
                        <Badge variant="outline" className={`text-[9px] ${decisionBadge(item.decision)}`}>
                          {item.decision}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {fmtTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                        {item.reason}
                      </p>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Confidence: {fmtPct(item.confidence, 0)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Asset universe (full width below) */}
      <Card className="bg-card/50 lg:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-primary" /> Asset Universe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {portfolio?.universe.map((u) => (
              <div
                key={u.ticker}
                className="rounded-md border border-border/40 bg-background/40 p-3 hover:bg-background/60 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{u.ticker}</span>
                  <Badge variant="outline" className="text-[9px]">
                    {u.sector}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{u.name}</div>
                <div className="text-xs mt-1">
                  Base: <span className="tabular-nums">{fmtUsd(u.basePrice)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "warn" | "danger";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={`tabular-nums font-medium ${
          highlight === "warn"
            ? "text-amber-400"
            : highlight === "danger"
            ? "text-rose-400"
            : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
