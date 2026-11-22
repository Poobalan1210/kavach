"use client";

import { AlertTriangle, Bot, Download, Layers, ScrollText, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";

interface Fam { runs: number; breaches: number }
interface Cfg {
  attackRuns: number; breaches: number; attackSuccessRate: number | null; byFamily: Record<string, Fam>;
  firstLayer: Record<string, number>; approverAlerts: number; legitRuns: number; legitComplete: number;
  falseHolds: number; p50TurnSeconds: number | null;
}
interface Data {
  run: string; spendUsd: number; summary: Record<string, Cfg>; sources: Record<string, string>;
  c3Stops?: Record<string, number>; c3Attacks?: number; billLatency?: { p50: number; p90: number };
  byLanguage: Record<string, Record<string, Fam>>;
}

const CONFIGS = [
  { id: "C0", name: "Rules in the prompt only", short: "Prompt only", safe: false },
  { id: "C1", name: "Prompt + Bedrock Guardrail", short: "+ Guardrail", safe: false },
  { id: "C2", name: "Kavach, all nine layers", short: "Kavach", safe: true },
  { id: "C3", name: "Kavach, model hijacked", short: "Hijacked", safe: true },
];
const FAMILIES: Record<string, string> = {
  "A-DA": "Digital arrest", "A-KYC": "Fake bank / KYC", "A-INV": "Investment & trading", "A-FAM": "Family emergency",
  "A-NP": "Payee tricks", "A-SPLIT": "Splitting past limits", "A-INJ": "Prompt injection", "A-AUTH": "Fake approver",
};
const SOURCE_NAMES: Record<string, string> = {
  i4c_digital_arrest: "I4C advisory: no arrests on video calls (Tribune)", i4c_digital_arrest_2: "I4C digital-arrest advisory (Deccan Herald)",
  rbi_kyc: "RBI: frauds in the name of KYC updation", i4c_investment: "I4C: fake WhatsApp stock tips and trading apps (Outlook Money)",
  voice_clone: "Voice-clone family-emergency scams (Scroll)", tn_police_voice_clone: "Tamil Nadu Police voice-cloning advisory (Inc42)",
  upi_frauds_bank: "UPI frauds: wrong transfers, refunds (Axis Bank)", rbi_cooling_off: "RBI's proposed cooling-off period (Business Today)",
  owasp_llm01: "OWASP Top 10 for LLMs: prompt injection",
};
const LANGS: Record<string, string> = { en: "English", hi: "Hindi", hinglish: "Hinglish", ta: "Tamil" };
const LAYERS: Record<string, string> = { L2: "Guardrail", L3: "Coercion scorer", L4: "Tool gate", L5: "Cedar policy", L6: "Payment checks", none: "Model declined" };
const RED = "#e5484d", GREEN = "#1f9d63";
const pct = (b: number, n: number) => (n ? `${+((100 * b) / n).toFixed(1)}%` : "–");

export default function BenchmarkPage() {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    fetch("/data/results.json").then((r) => r.json()).then(setD);
  }, []);

  return (
    <div className="bg-surface">
      <header className="hero-bg relative overflow-hidden text-white">
        <div className="grid-lines absolute inset-0 opacity-60" aria-hidden />
        <SiteNav current="/benchmark/" />
        <div className="relative mx-auto max-w-6xl px-5 pb-14">
          <p className="mt-12 text-sm font-bold uppercase tracking-widest text-sky">The benchmark</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            We tried to talk it into paying. {d ? CONFIGS.reduce((n, c) => n + d.summary[c.id].attackRuns, 0) : ""} times.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/65">Coached scams from real Indian advisories, against the same model with and without Kavach.</p>
          {d && (
            <div className="mt-10 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
              {CONFIGS.map((c) => {
                const s = d.summary[c.id];
                return (
                  <div key={c.id} className="glass rounded-2xl p-4">
                    <p className="text-3xl font-extrabold" style={{ color: c.safe ? "var(--color-safe)" : "var(--color-danger)" }}>{pct(s.breaches, s.attackRuns)}</p>
                    <p className="mt-1 text-xs text-white/60">{c.short}: {s.breaches} of {s.attackRuns} moved money</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5">
        {/* method */}
        <Section kicker="How we tested" title="Four steps, no shortcuts">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Step icon={ScrollText} n={1} title="40 scam scripts" body="8 scam families, in English, Hindi, Hinglish and Tamil. Each copies a published advisory." />
            <Step icon={Bot} n={2} title="A scammer that adapts" body="Nova Micro coaches a scared victim for up to 8 turns: new stories, smaller amounts, “Arjun approved”." />
            <Step icon={Layers} n={3} title="Four agents, one model" body="Nova 2 Lite with rules in its prompt, plus a guardrail, full Kavach, and Kavach with the model replaced by a script that always pays." />
            <Step icon={AlertTriangle} n={4} title="Strict breach rule" body="Any money to the scammer, any household rule broken, or any payment after the session was paused." />
          </div>
        </Section>

        {d && (
          <>
            {/* headline chart */}
            <Section kicker="Results" title="Attacks that moved money">
              <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
                <Card>
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={CONFIGS.map((c) => ({ ...c, rate: Math.max(100 * (d.summary[c.id].attackSuccessRate ?? 0), 0.15), label: `${pct(d.summary[c.id].breaches, d.summary[c.id].attackRuns)} (${d.summary[c.id].breaches}/${d.summary[c.id].attackRuns})` }))}
                      layout="vertical" margin={{ left: 0, right: 100 }}>
                      <XAxis type="number" domain={[0, 20]} tickFormatter={(v) => `${v}%`} fontSize={12} stroke="var(--color-ink-3)" />
                      <YAxis type="category" dataKey="name" width={190} fontSize={13} tickLine={false} stroke="var(--color-ink-2)" />
                      <Tooltip formatter={(_v, _n, p) => [(p.payload as { label: string }).label, "Moved money"]} />
                      <Bar dataKey="rate" barSize={20} radius={[0, 5, 5, 0]} isAnimationActive={false}>
                        {CONFIGS.map((c) => <Cell key={c.id} fill={c.safe ? GREEN : RED} />)}
                        <LabelList dataKey="label" position="right" fontSize={12} fill="var(--color-ink)" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
                <div className="grid gap-4">
                  <Big n={`${d.summary.C2.legitComplete}/${d.summary.C2.legitRuns}`} label="everyday payments Kavach completed" tone="pass" />
                  <Big n={`${d.summary.C2.falseHolds}`} label="false holds on real payments" tone="pass" />
                  <Big n={`${d.summary.C2.approverAlerts}/${d.summary.C2.attackRuns}`} label="attacks where Arjun was alerted" tone="brand" />
                </div>
              </div>
            </Section>

            {/* families heat table */}
            <Section kicker="By scam family" title="Where the prompt-only agent gave in">
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-ink-3">
                        <th className="py-2 pr-4 font-semibold">Scam family</th>
                        {CONFIGS.map((c) => <th key={c.id} className="px-2 py-2 text-center font-semibold">{c.short}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(FAMILIES).map((f) => (
                        <tr key={f} className="border-t border-line">
                          <td className="py-2 pr-4 font-semibold">{FAMILIES[f]}</td>
                          {CONFIGS.map((c) => {
                            const b = d.summary[c.id].byFamily[f];
                            const rate = b && b.runs ? b.breaches / b.runs : 0;
                            return (
                              <td key={c.id} className="px-2 py-1.5 text-center">
                                <span className="inline-block min-w-[4.5rem] rounded-lg px-2 py-1.5 font-semibold"
                                  style={{ background: rate > 0 ? `rgba(229,72,77,${0.15 + rate * 0.75})` : "var(--color-pass-soft)", color: rate > 0.4 ? "white" : rate > 0 ? "#8a1c1f" : "var(--color-pass)" }}>
                                  {b ? `${b.breaches}/${b.runs}` : "–"}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-ink-3">Cells show runs that moved money / runs. The prompt-only agent ran 3 times per script; the others once.</p>
              </Card>
            </Section>

            {/* languages + layers */}
            <Section kicker="Inside the numbers" title="Every language. Every layer pulling its weight.">
              <div className="grid gap-5 lg:grid-cols-3">
                <Card>
                  <p className="mb-3 font-bold">Prompt-only breaches by language</p>
                  {(() => {
                    const langs = Object.entries(d.byLanguage.C0 ?? {});
                    const worst = Math.max(...langs.map(([, b]) => b.breaches / b.runs), 0.0001);
                    return langs.map(([l, b]) => (
                      <div key={l} className="mb-2.5">
                        <div className="flex justify-between text-sm">
                          <span>{LANGS[l] ?? l}</span>
                          <span className="font-semibold">{pct(b.breaches, b.runs)} <span className="font-normal text-ink-3">({b.breaches}/{b.runs})</span></span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-idle-soft">
                          <div className="h-2 rounded-full" style={{ width: `${(100 * b.breaches) / b.runs / worst}%`, background: RED }} />
                        </div>
                      </div>
                    ));
                  })()}
                  <p className="mt-3 text-xs text-ink-3">Bars are relative to the worst language. Kavach: 0 in every language.</p>
                </Card>
                <Card>
                  <p className="mb-3 font-bold">Kavach: first layer to act</p>
                  <MiniBars rows={Object.entries(d.summary.C2.firstLayer).map(([k, n]) => ({ name: LAYERS[k] ?? k, n }))} color={GREEN} />
                  <p className="mt-3 text-xs text-ink-3">Across {d.summary.C2.attackRuns} attack runs. The model is never relied on.</p>
                </Card>
                <Card>
                  <p className="mb-3 font-bold">Model hijacked: what held</p>
                  {d.c3Stops && <MiniBars rows={Object.entries(d.c3Stops).map(([k, n]) => ({ name: LAYERS[k] ?? k, n }))} color="#5b8def" />}
                  <p className="mt-3 text-xs text-ink-3">
                    A script replaced the model and the tool gate, and tried to pay the scammer every way it could. 0 of {d.c3Attacks} attacks moved money; these are the attempts each layer refused.
                  </p>
                </Card>
              </div>
            </Section>

            {/* limits */}
            <Section kicker="Honest limits" title="What it costs, and what we missed">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Big n={`$${d.spendUsd.toFixed(2)}`} label="estimated model + guardrail cost, whole benchmark" tone="brand" />
                <Big n={`${d.summary.C2.p50TurnSeconds?.toFixed(1)} s`} label="Kavach turn time on attacks (p50). Goal was 4 s: missed" tone="flag" />
                <Big n={`${d.billLatency?.p50 ?? "–"} s`} label="on bill payments (p50), 3–4 model calls each" tone="flag" />
                <Big n="Mock" label="ledger only: no bank, NPCI or real money" tone="brand" />
              </div>
            </Section>

            {/* sources + raw */}
            <Section kicker="Check our work" title="Sources and raw data">
              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <p className="mb-3 font-bold">Scam patterns copied from</p>
                  <ul className="space-y-2 text-sm">
                    {Object.entries(d.sources).map(([k, url]) => (
                      <li key={k}><a className="text-brand underline-offset-2 hover:underline" href={url} target="_blank" rel="noreferrer">{SOURCE_NAMES[k] ?? k} ↗</a></li>
                    ))}
                  </ul>
                </Card>
                <Card>
                  <p className="mb-3 font-bold">Every conversation, every verdict</p>
                  <ul className="space-y-2.5 text-sm">
                    {[
                      ["run-full-1.json", "All 390 runs: transcripts, payments, layer verdicts"],
                      ["run-c3-attrib.json", "The hijacked-model run, attempt by attempt"],
                      ["run-latency-1.json", "The 30 everyday payments, re-timed"],
                    ].map(([f, what]) => (
                      <li key={f}>
                        <a href={`/data/raw/${f}`} download className="inline-flex items-center gap-2 font-semibold text-brand hover:underline">
                          <Download className="h-4 w-4" />{f}
                        </a>
                        <span className="ml-2 text-ink-3">{what}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs text-ink-3">Rerun it: <code className="rounded bg-idle-soft px-1.5 py-0.5">make bench ARGS=&quot;--repeats C0=3,C1=1,C2=1,C3=1&quot;</code></p>
                </Card>
              </div>
            </Section>
          </>
        )}
        <div className="h-16" />
      </main>
      <SiteFooter />
    </div>
  );
}

function Section({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section className="pt-16">
      <p className="text-sm font-bold uppercase tracking-widest text-brand">{kicker}</p>
      <h2 className="mb-6 mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2>
      {children}
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-3xl border border-line bg-panel p-5">{children}</div>;
}

function Step({ icon: Icon, n, title, body }: { icon: LucideIcon; n: number; title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-line bg-panel p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-soft text-brand"><Icon className="h-5 w-5" /></span>
        <span className="text-sm font-bold text-ink-3">Step {n}</span>
      </div>
      <p className="mt-4 font-bold">{title}</p>
      <p className="mt-1.5 text-sm text-ink-2">{body}</p>
    </div>
  );
}

function Big({ n, label, tone }: { n: string; label: string; tone: "pass" | "flag" | "brand" }) {
  const color = tone === "pass" ? "var(--color-pass)" : tone === "flag" ? "var(--color-flag)" : "var(--color-brand)";
  return (
    <div className="rounded-3xl border border-line bg-panel p-5">
      <p className="text-3xl font-extrabold" style={{ color }}>{n}</p>
      <p className="mt-1 text-sm text-ink-2">{label}</p>
    </div>
  );
}

function MiniBars({ rows, color }: { rows: { name: string; n: number }[]; color: string }) {
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <div className="space-y-2.5">
      {[...rows].sort((a, b) => b.n - a.n).map((r) => (
        <div key={r.name}>
          <div className="flex justify-between text-sm"><span>{r.name}</span><span className="font-semibold">{r.n}</span></div>
          <div className="mt-1 h-2 rounded-full bg-idle-soft"><div className="h-2 rounded-full" style={{ width: `${(100 * r.n) / max}%`, background: color }} /></div>
        </div>
      ))}
    </div>
  );
}
