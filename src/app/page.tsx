"use client";

import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Brain, History, BarChart3, Shield, Zap } from "lucide-react";
import { toast } from "sonner";
import { OverviewPanel } from "@/components/trading/overview-panel";
import { AnalyzePanel } from "@/components/trading/analyze-panel";
import { CounterfactualPanel } from "@/components/trading/counterfactual-panel";
import { JournalPanel } from "@/components/trading/journal-panel";
import { StatsPanel } from "@/components/trading/stats-panel";
import { RiskConfigPanel } from "@/components/trading/risk-config-panel";
import { fmtUsd } from "@/components/trading/format";

export interface PortfolioData {
  mode: "MOCK" | "LIVE";
  account: {
    equity: number;
    cash: number;
    buyingPower: number;
    longMarketValue: number;
    shortMarketValue: number;
  };
  positions: any[];
  universe: { ticker: string; name: string; sector: string; basePrice: number; volatility: number }[];
}

export default function Home() {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [tab, setTab] = useState("overview");

  const refreshPortfolio = useCallback(async () => {
    try {
      const res = await fetch("/api/portfolio");
      if (!res.ok) throw new Error("Failed to fetch portfolio");
      const data = await res.json();
      setPortfolio(data);
    } catch (e: any) {
      toast.error(`Portfolio fetch failed: ${e?.message}`);
    } finally {
      setLoadingPortfolio(false);
    }
  }, []);

  useEffect(() => {
    refreshPortfolio();
    const interval = setInterval(refreshPortfolio, 15000);
    return () => clearInterval(interval);
  }, [refreshPortfolio]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">
                Alpaca Trading Committee
              </h1>
              <p className="text-[11px] text-muted-foreground">
                Multi-agent research → Risk Governor → Paper execution
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5">
              {portfolio?.mode === "LIVE" ? "LIVE (Alpaca Paper)" : "MOCK MODE"}
            </Badge>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Equity
              </div>
              <div className="text-sm font-semibold tabular-nums">
                {loadingPortfolio ? "…" : fmtUsd(portfolio?.account.equity)}
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Cash
              </div>
              <div className="text-sm font-semibold tabular-nums">
                {loadingPortfolio ? "…" : fmtUsd(portfolio?.account.cash)}
              </div>
            </div>
            <div className="text-right hidden md:block">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Positions
              </div>
              <div className="text-sm font-semibold tabular-nums">
                {portfolio?.positions.length ?? 0}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={refreshPortfolio} disabled={loadingPortfolio}>
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 lg:px-8 py-6">
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="bg-card/50 border border-border/40 grid grid-cols-6 w-full max-w-3xl h-auto">
            <TabsTrigger value="overview" className="flex items-center gap-1.5 text-xs py-2">
              <Activity className="h-3.5 w-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="analyze" className="flex items-center gap-1.5 text-xs py-2">
              <Brain className="h-3.5 w-3.5" /> Analyze
            </TabsTrigger>
            <TabsTrigger value="counterfactual" className="flex items-center gap-1.5 text-xs py-2">
              <History className="h-3.5 w-3.5" /> Counterfactual
            </TabsTrigger>
            <TabsTrigger value="journal" className="flex items-center gap-1.5 text-xs py-2">
              <BarChart3 className="h-3.5 w-3.5" /> Journal
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-1.5 text-xs py-2">
              <BarChart3 className="h-3.5 w-3.5" /> Stats
            </TabsTrigger>
            <TabsTrigger value="risk" className="flex items-center gap-1.5 text-xs py-2">
              <Shield className="h-3.5 w-3.5" /> Risk Config
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0">
            <OverviewPanel portfolio={portfolio} loading={loadingPortfolio} onRefresh={refreshPortfolio} onGoToAnalyze={() => setTab("analyze")} />
          </TabsContent>
          <TabsContent value="analyze" className="mt-0">
            <AnalyzePanel portfolio={portfolio} />
          </TabsContent>
          <TabsContent value="counterfactual" className="mt-0">
            <CounterfactualPanel />
          </TabsContent>
          <TabsContent value="journal" className="mt-0">
            <JournalPanel />
          </TabsContent>
          <TabsContent value="stats" className="mt-0">
            <StatsPanel />
          </TabsContent>
          <TabsContent value="risk" className="mt-0">
            <RiskConfigPanel />
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-card/30 mt-auto">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <div>
            AI proposes. Rules verify. Alpaca executes. Built on Next.js 16 + z-ai-web-dev-sdk.
          </div>
          <div className="flex items-center gap-3">
            <span>Mode: <span className="text-primary font-medium">{portfolio?.mode ?? "…"}</span></span>
            <span>•</span>
            <span>Paper trading only</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
