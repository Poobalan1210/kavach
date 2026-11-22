"use client";

import { Check, FileWarning, IndianRupee, ShieldCheck, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Activity } from "@/components/Activity";
import { DemoBar } from "@/components/DemoBar";
import { api, type Approval, type Rule } from "@/lib/api";

// Arjun approves for Kamala's household. (Priya is her own approver: her rules use a waiting period instead.)
const HOUSEHOLD = "hh-kamala";
const TABS = [
  { id: "approvals", label: "Approvals" },
  { id: "activity", label: "Amma's payments" },
  { id: "rules", label: "The rules" },
] as const;

export default function ApproverPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("approvals");
  return (
    <div className="min-h-dvh">
      <DemoBar />
      <header className="hero-bg relative overflow-hidden text-white">
        <div className="grid-lines absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-4 pb-6 pt-7">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#0f7a55] to-[#22c58b] text-xl font-extrabold">A</span>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Amma's Kavach</h1>
              <p className="text-sm text-white/60">You're Arjun, the approver for your mother, Kamala</p>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-white/70">
            Kavach pays Amma's ordinary bills on its own. New payees, payments over ₹10,000 and anything after an untrusted
            message come to you. If someone pressures her on a call, her session pauses and you're alerted.
          </p>
          <Summary />
          <nav className="mt-6 flex flex-wrap gap-2" aria-label="Views">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} aria-pressed={tab === t.id}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === t.id ? "bg-white text-navy-950" : "glass text-white/80 hover:bg-white/10"}`}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        {tab === "approvals" && <Approvals />}
        {tab === "activity" && <Activity householdId={HOUSEHOLD} />}
        {tab === "rules" && <Rules />}
      </main>
    </div>
  );
}

const KIND = {
  new_payee: { label: "New payee", icon: UserPlus },
  over_limit: { label: "Over the limit", icon: IndianRupee },
  tainted: { label: "After an untrusted message", icon: FileWarning },
} as const;

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function Approvals() {
  const [items, setItems] = useState<Approval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();
  const load = useCallback(() => {
    api.activity(HOUSEHOLD).then((a) => setItems(a.approvals)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function decide(a: Approval, decision: "approve" | "reject") {
    setError(null);
    try {
      await api.decide(a.approvalId, decision, a.type === "new_payee" ? "other" : undefined, HOUSEHOLD);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the decision.");
    }
  }

  if (!items) return <p className="text-ink-3">Loading…</p>;
  const pending = items.filter((a) => a.decision === "pending");
  const recent = items.filter((a) => a.decision !== "pending").slice(0, 8);
  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert" className="text-sm text-block">{error}</p>}
      {pending.length === 0 && (
        <div className="rounded-3xl border border-line bg-panel p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-safe" />
          <p className="mt-3 text-lg font-bold">Nothing waiting for you</p>
          <p className="mt-1 text-sm text-ink-2">Try a scam on <a className="font-semibold text-brand underline" href="/senior/">Kamala's phone</a>: anything unusual lands here.</p>
        </div>
      )}
      {pending.map((a) => {
        const left = new Date(a.coolingEndsAt).getTime() - now;
        const k = KIND[a.type] ?? KIND.new_payee;
        return (
          <article key={a.approvalId} className="rounded-3xl border border-line bg-panel p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-flag-soft text-flag"><k.icon className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-flag">{k.label}</p>
                  {a.amount && <p className="text-xl font-extrabold">{a.amount}</p>}
                </div>
                <h2 className="text-lg font-bold">{a.payee ?? "Payment"}</h2>
                <p className="mt-1 text-sm text-ink-2">{a.reason}</p>
                <p className="mt-2 text-xs text-ink-3">
                  Requested {new Date(a.requestedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  {left > 0 && <span className="ml-2 rounded-full bg-surface px-2 py-0.5 font-semibold text-ink-2">cooling period: {Math.floor(left / 3_600_000)} h {Math.floor((left % 3_600_000) / 60_000)} min left</span>}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => decide(a, "approve")} className="flex items-center gap-1.5 rounded-full bg-pass px-5 py-2 font-semibold text-white hover:brightness-110">
                    <Check className="h-4 w-4" /> Approve
                  </button>
                  <button onClick={() => decide(a, "reject")} className="flex items-center gap-1.5 rounded-full border border-block px-5 py-2 font-semibold text-block hover:bg-block-soft">
                    <X className="h-4 w-4" /> Reject
                  </button>
                </div>
                {a.type === "new_payee" && <p className="mt-2 text-xs text-ink-3">Approving starts nothing early: the payee can be paid only after the cooling period ends.</p>}
              </div>
            </div>
          </article>
        );
      })}
      {recent.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-3">Recent decisions</h2>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-panel">
            {recent.map((a) => (
              <li key={a.approvalId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="font-semibold">{a.payee ?? KIND[a.type]?.label}</span>
                <span className="text-ink-3">{a.decision}{a.decidedBy ? ` by ${a.decidedBy}` : ""} · {new Date(a.requestedAt).toLocaleDateString("en-IN")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Rules() {
  const [data, setData] = useState<{ mode: string; setBy: string; setOn: string; rules: Rule[] } | null>(null);
  useEffect(() => {
    api.rules(HOUSEHOLD).then(setData);
  }, []);
  if (!data) return <p className="text-ink-3">Loading…</p>;
  return (
    <div>
      <p className="mb-3 text-sm text-ink-2">
        {data.mode === "guardian" ? "Guardian" : "Self-protect"} rules, set by {data.setBy} on {data.setOn}. These rules are enforced
        outside the model; the agent can't change them. Edits go through the repository's <code>rules/*.yaml</code> and start their
        own 24-hour cooling period.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {data.rules.map((r) => (
          <li key={r.id} className="rounded-2xl border border-line bg-panel p-4">
            <span className="mr-2 font-mono text-sm font-bold text-brand">{r.id}</span>{r.text}
            {r.edge && <p className="mt-1 text-sm text-ink-3">{r.edge}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** At a glance: what happened to Amma's money this week, and what needs Arjun. */
function Summary() {
  const [data, setData] = useState<{ ledger: { status: string; createdAt: string }[]; approvals: Approval[] } | null>(null);
  useEffect(() => {
    api.activity(HOUSEHOLD).then(setData).catch(() => undefined);
  }, []);
  const week = Date.now() - 7 * 86_400_000;
  const recent = data?.ledger.filter((r) => new Date(r.createdAt).getTime() >= week) ?? [];
  const count = (s: string) => recent.filter((r) => r.status === s).length;
  const cards = [
    { n: data ? data.approvals.filter((a) => a.decision === "pending").length : "–", label: "waiting for you", color: "var(--color-amber)" },
    { n: data ? count("paid") : "–", label: "paid this week", color: "var(--color-safe)" },
    { n: data ? count("held") : "–", label: "held for a rule", color: "var(--color-amber)" },
    { n: data ? count("blocked") : "–", label: "blocked this week", color: "var(--color-danger)" },
  ];
  return (
    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="glass rounded-2xl p-3.5">
          <p className="text-3xl font-extrabold" style={{ color: c.color }}>{c.n}</p>
          <p className="text-xs text-white/60">{c.label}</p>
        </div>
      ))}
    </div>
  );
}
