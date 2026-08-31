"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Shield } from "lucide-react";
import { toast } from "sonner";

interface RiskConfig {
  maxPositionSize: number;
  maxSectorExposure: number;
  maxTotalExposure: number;
  minConfidence: number;
  maxDrawdown: number;
  minExpectedReturn: number;
  startingCapital: number;
}

const FIELDS: { key: keyof RiskConfig; label: string; description: string; suffix?: string; step?: number }[] = [
  {
    key: "maxPositionSize",
    label: "Max Position Size",
    description: "Maximum single-position size as a percentage of portfolio equity.",
    suffix: "%",
    step: 0.5,
  },
  {
    key: "maxSectorExposure",
    label: "Max Sector Exposure",
    description: "Maximum total exposure to a single sector (e.g. Technology).",
    suffix: "%",
    step: 1,
  },
  {
    key: "maxTotalExposure",
    label: "Max Total Exposure",
    description: "Maximum combined long + short exposure as a percentage of equity.",
    suffix: "%",
    step: 1,
  },
  {
    key: "minConfidence",
    label: "Min Confidence",
    description: "Minimum analyst confidence (0-1) required to approve a trade.",
    step: 0.05,
  },
  {
    key: "maxDrawdown",
    label: "Max Drawdown",
    description: "Halt new trades if portfolio drawdown exceeds this percentage.",
    suffix: "%",
    step: 1,
  },
  {
    key: "minExpectedReturn",
    label: "Min Expected Return",
    description: "Minimum expected return (decimal, e.g. 0.02 = 2%) required.",
    step: 0.005,
  },
  {
    key: "startingCapital",
    label: "Starting Capital",
    description: "Initial portfolio capital used to compute drawdown.",
    suffix: "$",
    step: 1000,
  },
];

export function RiskConfigPanel() {
  const [config, setConfig] = useState<RiskConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    try {
      const res = await fetch("/api/risk-config");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfig(data.config);
    } catch (e: any) {
      toast.error(`Fetch failed: ${e?.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/risk-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfig(data.config);
      toast.success("Risk config updated");
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="text-center py-20">
        <Loader2 className="h-6 w-6 animate-spin inline text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="bg-card/50 lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Risk Governor Configuration
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            These rules are checked deterministically for every proposal. AI proposes, rules verify.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-xs flex items-center justify-between">
                <span>{f.label}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  current: {config[f.key]}
                  {f.suffix}
                </span>
              </Label>
              <Input
                type="number"
                step={f.step}
                value={config[f.key]}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    [f.key]: Number(e.target.value),
                  })
                }
                className="tabular-nums"
              />
              <p className="text-[10px] text-muted-foreground">{f.description}</p>
            </div>
          ))}
          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" /> Save Configuration
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">How It Works</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-3">
          <div>
            <div className="text-foreground font-medium text-sm mb-1">1. AI Proposes</div>
            Four research agents (Technical, Fundamental, Sentiment, Macro) debate and produce a single trade proposal with confidence, expected return, and stop loss.
          </div>
          <div>
            <div className="text-foreground font-medium text-sm mb-1">2. Rules Verify</div>
            The Risk Governor checks the proposal against 8 deterministic rules. If any rule fails, the trade is rejected and stored in counterfactual memory.
          </div>
          <div>
            <div className="text-foreground font-medium text-sm mb-1">3. Alpaca Executes</div>
            Approved trades are sent to Alpaca (paper or live) and recorded in the trade journal with the full pipeline.
          </div>
          <div>
            <div className="text-foreground font-medium text-sm mb-1">4. AI Learns</div>
            After trades close, the system computes win rates, Sharpe ratios, and lessons to refine future decisions.
          </div>
          <div className="rounded bg-primary/5 border border-primary/20 p-2 text-[11px]">
            <strong className="text-primary">Key principle:</strong> The risk engine is fully deterministic. AI cannot override rejections — it can only explain them.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
