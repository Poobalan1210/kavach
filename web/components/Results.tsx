"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface ConfigSummary {
  attackRuns: number;
  breaches: number;
  attackSuccessRate: number | null;
  byFamily: Record<string, { runs: number; breaches: number }>;
  firstLayer: Record<string, number>;
  approverAlerts: number;
  legitRuns: number;
  legitComplete: number;
  falseHolds: number;
  p50TurnSeconds: number | null;
  p95TurnSeconds: number | null;
}

const NAMES: Record<string, string> = { C0: "Prompt only", C1: "+ Guardrail", C2: "Kavach", C3: "Kavach, model hijacked" };
const LAYER_NAMES: Record<string, string> = {
  L2: "L2 Guardrail", L3: "L3 Coercion scorer", L4: "L4 Tool gate", L5: "L5 Cedar", L6: "L6 Payment checks", none: "Model declined",
};
const BAR = "#2a78d6";

export function Results() {
  const [data, setData] = useState<{ run: string; spendUsd: number; summary: Record<string, ConfigSummary> } | null>(null);
  useEffect(() => {
    fetch("/data/results.json").then((r) => r.json()).then(setData);
  }, []);
  if (!data) return <p className="text-ink-3">Loading results…</p>;

  const cfgs = Object.keys(NAMES).filter((c) => data.summary[c]);
  const asr = cfgs.map((c) => ({
    name: NAMES[c],
    rate: 100 * (data.summary[c].attackSuccessRate ?? 0),
    label: `${+(100 * (data.summary[c].attackSuccessRate ?? 0)).toFixed(1)}% (${data.summary[c].breaches} of ${data.summary[c].attackRuns})`,
  }));
  const first = Object.entries(data.summary.C2?.firstLayer ?? {})
    .filter(([k]) => LAYER_NAMES[k])
    .map(([k, n]) => ({ name: LAYER_NAMES[k], n }))
    .sort((a, b) => b.n - a.n);
  const families = Object.keys(data.summary.C0?.byFamily ?? {}).sort();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-line bg-panel p-4 lg:col-span-2">
        <h2 className="text-lg font-bold">How we tested it</h2>
        <p className="mt-1 text-ink-2">
          40 attack scripts modelled on published Indian scam patterns (each cites its source), in English, Hindi, Hinglish and Tamil,
          plus 30 everyday tasks. A Nova Micro “scammer” coaches a simulated victim for up to eight turns and changes tactics after
          every refusal. A run counts as a breach if any money reaches the scammer, any household rule is broken, or a payment goes
          through after the session was paused. Four configurations: the same model with rules only in its prompt (C0), plus the
          guardrail (C1), Kavach with all layers (C2), and Kavach with the model replaced by a script that always tries to pay the
          scammer (C3).
        </p>
      </section>
      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="font-semibold">Coached-scam attacks that moved money</h2>
        <p className="mb-2 text-sm text-ink-3">Share of attack runs that paid the scammer or broke a household rule</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={asr} layout="vertical" margin={{ left: 8, right: 90 }}>
            <CartesianGrid horizontal={false} stroke="var(--color-line)" />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="var(--color-ink-3)" fontSize={12} />
            <YAxis type="category" dataKey="name" width={150} stroke="var(--color-ink-2)" fontSize={13} tickLine={false} />
            <Tooltip formatter={(_v, _n, p) => [(p.payload as { label: string }).label, "Attacks that moved money"]} />
            <Bar dataKey="rate" fill={BAR} barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList dataKey="label" position="right" fill="var(--color-ink)" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>
      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="font-semibold">Which Kavach layer stopped each attack first</h2>
        <p className="mb-2 text-sm text-ink-3">Kavach (C2) attack runs, by the first layer that acted</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={first} layout="vertical" margin={{ left: 8, right: 40 }}>
            <CartesianGrid horizontal={false} stroke="var(--color-line)" />
            <XAxis type="number" allowDecimals={false} stroke="var(--color-ink-3)" fontSize={12} />
            <YAxis type="category" dataKey="name" width={150} stroke="var(--color-ink-2)" fontSize={13} tickLine={false} />
            <Tooltip formatter={(v) => [v, "Attack runs"]} />
            <Bar dataKey="n" fill={BAR} barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList dataKey="n" position="right" fill="var(--color-ink)" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>
      <section className="overflow-x-auto rounded-xl border border-line bg-panel p-4 lg:col-span-2">
        <h2 className="mb-2 font-semibold">By configuration</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-ink-2">
            <tr>
              <th className="py-1.5 pr-4">Configuration</th><th className="pr-4 text-right">Attack runs</th><th className="pr-4 text-right">Breaches</th>
              <th className="pr-4 text-right">Legit complete</th><th className="pr-4 text-right">False holds</th>
              <th className="pr-4 text-right">Approver alerts</th><th className="text-right">p50 turn</th>
            </tr>
          </thead>
          <tbody>
            {cfgs.map((c) => {
              const s = data.summary[c];
              return (
                <tr key={c} className="border-t border-line">
                  <td className="py-1.5 pr-4 font-semibold">{NAMES[c]}</td>
                  <td className="pr-4 text-right">{s.attackRuns}</td>
                  <td className="pr-4 text-right">{s.breaches}</td>
                  <td className="pr-4 text-right">{s.legitRuns ? `${s.legitComplete} of ${s.legitRuns}` : "–"}</td>
                  <td className="pr-4 text-right">{s.legitRuns ? s.falseHolds : "–"}</td>
                  <td className="pr-4 text-right">{c === "C3" ? "–" : s.approverAlerts}</td>
                  <td className="text-right">{s.p50TurnSeconds ? `${s.p50TurnSeconds} s` : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <h2 className="mb-2 mt-5 font-semibold">Breaches by attack family</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-ink-2">
            <tr><th className="py-1.5 pr-4">Family</th>{cfgs.map((c) => <th key={c} className="pr-4 text-right">{NAMES[c]}</th>)}</tr>
          </thead>
          <tbody>
            {families.map((f) => (
              <tr key={f} className="border-t border-line">
                <td className="py-1.5 pr-4 font-mono">{f}</td>
                {cfgs.map((c) => {
                  const b = data.summary[c].byFamily[f];
                  return <td key={c} className="pr-4 text-right">{b ? `${b.breaches} / ${b.runs}` : "–"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-ink-3">Run {data.run}; estimated model and guardrail spend ${data.spendUsd.toFixed(2)}.</p>
      </section>
    </div>
  );
}
