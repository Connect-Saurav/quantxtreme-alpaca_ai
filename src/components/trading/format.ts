"use client";

export const fmtPct = (n: number | null | undefined, digits = 2) =>
  n == null ? "—" : `${(n * 100).toFixed(digits)}%`;

export const fmtUsd = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export const fmtNum = (n: number | null | undefined, digits = 2) =>
  n == null ? "—" : n.toFixed(digits);

export const fmtTime = (iso: string | Date | null) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

export const dirColor = (dir: string) =>
  dir === "LONG"
    ? "text-emerald-400"
    : dir === "SHORT"
    ? "text-rose-400"
    : "text-amber-400";

export const dirBadge = (dir: string) =>
  dir === "LONG"
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : dir === "SHORT"
    ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
    : "bg-amber-500/15 text-amber-400 border-amber-500/30";

export const decisionBadge = (decision: string) =>
  decision === "APPROVE"
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : "bg-rose-500/15 text-rose-400 border-rose-500/30";
