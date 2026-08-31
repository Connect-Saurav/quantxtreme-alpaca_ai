"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BarChart3, TrendingUp, Target, Award, Activity } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";
import { fmtPct, fmtUsd } from "./format";

interface Stats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winRate: number;
  avgReturnPct: number;
  sharpeOverall: number;
  totalPnlUsd: number;
  bySignal: {
    signal: string;
    trades: number;
    winRate: number;
    avgReturn: number;
    sharpe: number;
  }[];
  byConfidence: {
    bucket: string;
    trades: number;
    winRate: number;
    avgReturn: number;
    sharpe: number;
  }[];
  bySector: {
    sector: string;
    trades: number;
    winRate: number;
    avgReturn: number;
  }[];
}

export function StatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStats(data.stats);
    } catch (e: any) {
      toast.error(`Stats fetch failed: ${e?.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  if (loading) {
    return (
      <div className="text-center py-20">
        <Loader2 className="h-6 w-6 animate-spin inline text-muted-foreground" />
      </div>
    );
  }

  if (!stats || stats.closedTrades === 0) {
    return (
      <Card className="bg-card/50">
        <CardContent className="py-16 text-center">
          <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <div className="text-sm text-muted-foreground">
            No closed trades yet. Close some trades in the Journal to populate post-trade learning insights.
          </div>
          <Button size="sm" variant="outline" className="mt-4" onClick={refresh}>
            Refresh
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Total Trades"
          value={String(stats.totalTrades)}
          sub={`${stats.openTrades} open / ${stats.closedTrades} closed`}
          icon={<Activity className="h-4 w-4 text-sky-400" />}
        />
        <KpiCard
          label="Win Rate"
          value={fmtPct(stats.winRate, 1)}
          sub={`${Math.round(stats.winRate * stats.closedTrades)}/${stats.closedTrades} winners`}
          icon={<Target className="h-4 w-4 text-emerald-400" />}
        />
        <KpiCard
          label="Avg Return"
          value={fmtPct(stats.avgReturnPct, 2)}
          sub="per trade"
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
          tone={stats.avgReturnPct >= 0 ? "good" : "bad"}
        />
        <KpiCard
          label="Sharpe (sample)"
          value={stats.sharpeOverall.toFixed(2)}
          sub={`${fmtUsd(stats.totalPnlUsd)} PnL`}
          icon={<Award className="h-4 w-4 text-amber-400" />}
          tone={stats.sharpeOverall >= 1 ? "good" : stats.sharpeOverall < 0 ? "bad" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By Signal */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Win Rate by Signal Type</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Which research-agent signals actually produce winning trades?
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.bySignal} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis
                  dataKey="signal"
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  stroke="currentColor"
                  opacity={0.4}
                />
                <YAxis
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  stroke="currentColor"
                  opacity={0.4}
                />
                <Tooltip
                  formatter={(v: number) => fmtPct(v, 1)}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                  {stats.bySignal.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.winRate >= 0.5 ? "oklch(0.72 0.17 152)" : "oklch(0.65 0.21 22)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="text-[11px] text-muted-foreground mt-2 space-y-0.5">
              {stats.bySignal.map((s) => (
                <div key={s.signal} className="flex items-center justify-between">
                  <span className="capitalize">{s.signal}</span>
                  <span>
                    {fmtPct(s.winRate, 0)} win · {s.trades} trades · Sharpe {s.sharpe.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* By Confidence */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Performance by Confidence Bucket</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Does higher analyst confidence actually translate to better risk-adjusted returns?
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.byConfidence} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis
                  dataKey="bucket"
                  tick={{ fontSize: 9, fill: "currentColor" }}
                  stroke="currentColor"
                  opacity={0.4}
                />
                <YAxis
                  tickFormatter={(v) => v.toFixed(2)}
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  stroke="currentColor"
                  opacity={0.4}
                />
                <Tooltip
                  formatter={(v: number) => v.toFixed(3)}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="sharpe" radius={[4, 4, 0, 0]}>
                  {stats.byConfidence.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.sharpe >= 1 ? "oklch(0.72 0.17 152)" : entry.sharpe >= 0 ? "oklch(0.78 0.16 80)" : "oklch(0.65 0.21 22)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="text-[11px] text-muted-foreground mt-2 space-y-0.5">
              {stats.byConfidence.map((c) => (
                <div key={c.bucket} className="flex items-center justify-between">
                  <span>{c.bucket}</span>
                  <span>
                    {c.trades} trades · {fmtPct(c.winRate, 0)} win · {fmtPct(c.avgReturn, 2)} avg
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* By Sector */}
        <Card className="bg-card/50 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Performance by Sector</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Where do the trading committee's calls actually work?
            </p>
          </CardHeader>
          <CardContent>
            {stats.bySector.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center">No sector data yet.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {stats.bySector.map((s) => (
                  <div key={s.sector} className="rounded-md border border-border/40 bg-background/40 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{s.sector}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          s.winRate >= 0.5
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        }`}
                      >
                        {fmtPct(s.winRate, 0)}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {s.trades} trades ·{" "}
                      <span className={s.avgReturn >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {s.avgReturn >= 0 ? "+" : ""}
                        {fmtPct(s.avgReturn, 2)} avg
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: "good" | "bad";
}) {
  return (
    <Card className="bg-card/50">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {icon}
        </div>
        <div
          className={`text-2xl font-bold tabular-nums mt-1 ${
            tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : ""
          }`}
        >
          {value}
        </div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}
