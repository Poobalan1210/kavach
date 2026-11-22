"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { HeroFork } from "@/components/landing/HeroFork";
import { LayerRail } from "@/components/landing/LayerRail";
import { ScenarioCompare } from "@/components/landing/ScenarioCompare";
import { Shield } from "@/components/Shield";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { previewMode } from "@/lib/config";
import { ACCESS, PRIYA_RULES, RULES, STATS } from "@/lib/story";

interface Summary {
  attackRuns: number;
  breaches: number;
  attackSuccessRate: number | null;
  legitRuns: number;
  legitComplete: number;
  falseHolds: number;
}

const CONFIGS = [
  { id: "C0", name: "Rules in the prompt only", kavach: false },
  { id: "C1", name: "Prompt + Bedrock Guardrail", kavach: false },
  { id: "C2", name: "Kavach, all nine layers", kavach: true },
  { id: "C3", name: "Kavach with the model hijacked", kavach: true },
];

// One decimal, so 15 of 120 reads 12.5% (not a rounded 13%), matching the README and report.
const pct = (s?: Summary) => (s ? `${+(100 * (s.attackSuccessRate ?? 0)).toFixed(1)}%` : "–");

const PEOPLE = [
  { initials: "K", name: "Kamala, 68", role: "Retired teacher, Chennai", line: "Pays her bills in Tamil with one tap. No caller can talk Kavach into paying.", from: "#1d4f8f", to: "#6aa7ff", href: "/senior/", cta: "Open Kamala's phone" },
  { initials: "A", name: "Arjun, 34", role: "Her son, the approver", line: "Approves anything unusual from his own phone. Sees every blocked attempt.", from: "#0f7a55", to: "#22c58b", href: "/approver/", cta: "Open Arjun's app" },
  { initials: "P", name: "Priya, 26", role: "Lives alone, Self-protect mode", line: "Set her own rules when calm: midnight “deposits” wait till morning.", from: "#8a4bd6", to: "#c29bff", href: "/senior/?household=hh-priya", cta: "Open Priya's phone" },
];


const fade = { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-80px" }, transition: { duration: 0.5 } };

export default function Landing() {
  const [results, setResults] = useState<Record<string, Summary> | null>(null);
  useEffect(() => {
    fetch("/data/results.json").then((r) => r.json()).then((d) => setResults(d.summary)).catch(() => undefined);
  }, []);

  return (
    <div className="bg-surface">
      {/* ---------- Hero ---------- */}
      <section className="hero-bg relative overflow-hidden text-white">
        <div className="grid-lines absolute inset-0" aria-hidden />
        {previewMode && (
          <p className="relative bg-amber/90 px-4 py-1.5 text-center text-xs font-semibold text-navy-950">Local preview · backend not deployed yet</p>
        )}
        <SiteNav />

        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-24 pt-10 lg:grid-cols-[1.1fr_1fr]">
          <div className="rise">
            <p className="glass mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-white/80">
              <span className="h-2 w-2 rounded-full bg-safe" /> Amazon Bedrock AgentCore · Amazon Nova
            </p>
            <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              The payments agent a scammer{" "}
              <span className="bg-gradient-to-r from-sky to-safe bg-clip-text text-transparent">can't talk around.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-white/70">
              Rules your family sets when calm, enforced when your mother is panicking on a fake CBI call.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#scenarios" className="rounded-full bg-safe px-6 py-3.5 font-bold text-navy-950 shadow-[0_10px_30px_-10px_var(--color-safe)] hover:brightness-110">
                Watch it stop a scam →
              </a>
              <a href="#how" className="glass rounded-full px-6 py-3.5 font-semibold text-white hover:bg-white/10">How it works</a>
            </div>
            <div className="mt-12 grid max-w-lg grid-cols-3 gap-6">
              {[
                [pct(results?.C2), "coached scams that moved money"],
                [results ? `${results.C2.legitComplete}/${results.C2.legitRuns}` : "–", "everyday payments done"],
                ["9", "independent layers"],
              ].map(([n, l]) => (
                <div key={l}>
                  <p className="text-3xl font-extrabold">{n}</p>
                  <p className="mt-1 text-xs text-white/60">{l}</p>
                </div>
              ))}
            </div>
          </div>
          <HeroFork />
        </div>
      </section>

      {/* ---------- The problem ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <motion.h2 {...fade} className="max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
          Most fraud isn't hacking. It's someone talking a person into paying.
        </motion.h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {STATS.map((s, i) => (
            <motion.a key={s.value} href={s.source} target="_blank" rel="noreferrer" {...fade} transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group rounded-3xl border border-line bg-panel p-7 transition hover:-translate-y-0.5 hover:shadow-lg">
              <p className="text-5xl font-extrabold tracking-tight text-brand">{s.value}</p>
              <p className="mt-3 text-ink-2">{s.label}</p>
              <p className="mt-4 text-xs text-ink-3 group-hover:underline">Source: {s.sourceName} ↗</p>
            </motion.a>
          ))}
        </div>
      </section>

      {/* ---------- How it works → See it decide: one continuous story ---------- */}
      <section id="how" className="hero-bg relative overflow-hidden text-white">
        <div className="grid-lines absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 pt-24">
          <motion.p {...fade} className="text-sm font-bold uppercase tracking-widest text-sky">How it works</motion.p>
          <motion.h2 {...fade} className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">
            Rules set once, when calm. Enforced every time.
          </motion.h2>

          {/* beat 1: the rules */}
          <RulesBeat />

          {/* beat 2: the layers */}
          <div className="mt-16 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-sm font-extrabold text-navy-950">2</span>
              <p className="text-lg font-bold">Nine layers enforce them. The model is never trusted to say no.</p>
            </div>
            <a href="/architecture.svg" target="_blank" rel="noreferrer" className="text-sm font-semibold text-sky hover:underline">Full architecture ↗</a>
          </div>
          <div className="mt-10"><LayerRail showLines money={{ label: "Money moves", tone: "idle" }} /></div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ["Even if the model is hijacked", "We replaced the model with a script that always tries to pay the scammer. 0 of 40 got through."],
              ["Every rule, twice", "Each rule is held by at least two independent layers."],
              ["Verifiable", "Each decision is signed with KMS and locked for 30 days."],
            ].map(([t, d]) => (
              <div key={t} className="glass rounded-2xl p-5">
                <p className="font-bold">{t}</p>
                <p className="mt-1.5 text-sm text-white/65">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-white/55">
            Built for UPI, but nothing in the enforcement is UPI-specific: swap the payment tool and the advisories, and the same nine layers guard card, bank-transfer or wallet payments.
          </p>

          {/* beat 3: watch it */}
          <div id="scenarios" className="scroll-mt-8 pb-24 pt-24">
            <div className="flex items-center justify-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-sm font-extrabold text-navy-950">3</span>
              <p className="text-sm font-bold uppercase tracking-widest text-sky">See it decide</p>
            </div>
            <h2 className="mt-3 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">Pick a scam. Watch where it stops.</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-white/60">Real runs from our benchmark.</p>
            <div className="mt-10"><ScenarioCompare /></div>
          </div>
        </div>
      </section>

      {/* ---------- Results ---------- */}
      <section id="results" className="mx-auto max-w-6xl px-5 py-24">
        <motion.p {...fade} className="text-sm font-bold uppercase tracking-widest text-brand">Results</motion.p>
        <motion.h2 {...fade} className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">Same model. Different outcome.</motion.h2>
        <motion.p {...fade} className="mt-4 max-w-2xl text-ink-2">
          40 coached scams from real Indian advisories, in four languages, against the same Nova model with and without Kavach.
        </motion.p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CONFIGS.map((c, i) => {
            const s = results?.[c.id];
            return (
              <motion.div key={c.id} {...fade} transition={{ duration: 0.5, delay: i * 0.08 }}
                className={`rounded-3xl border p-6 ${c.kavach ? "border-safe/50 bg-pass-soft" : "border-line bg-panel"}`}>
                <p className="text-5xl font-extrabold tracking-tight" style={{ color: c.kavach ? "var(--color-pass)" : "var(--color-block)" }}>{pct(s)}</p>
                <p className="mt-1 text-sm text-ink-3">{s ? `${s.breaches} of ${s.attackRuns} attack runs moved money` : ""}</p>
                <p className="mt-4 font-semibold">{c.name}</p>
              </motion.div>
            );
          })}
        </div>
        <motion.div {...fade} className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-line bg-panel p-6">
          <p className="text-ink-2">
            <span className="font-bold text-ink">{results?.C2.legitComplete ?? "–"} of {results?.C2.legitRuns ?? "–"}</span> everyday payments completed by Kavach ·{" "}
            <span className="font-bold text-ink">{results?.C2.falseHolds ?? "–"}</span> false holds
          </p>
          <a href="/benchmark/" className="rounded-full bg-brand px-5 py-2.5 font-semibold text-white">How we tested, in full →</a>
        </motion.div>
      </section>

      {/* ---------- Where it fits ---------- */}
      <section id="fits" className="border-t border-line py-24">
        <div className="mx-auto max-w-6xl px-5">
          <motion.p {...fade} className="text-sm font-bold uppercase tracking-widest text-brand">Where it fits</motion.p>
          <motion.h2 {...fade} className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">
            Her rules live at her bank, so they hold in every app she uses.
          </motion.h2>
          <motion.p {...fade} className="mt-4 max-w-2xl text-ink-2">
            Every UPI payment, from any app, ends with her bank approving the debit. That is where Kavach's rules belong.
          </motion.p>

          {/* the path of a payment */}
          <motion.div {...fade} className="mt-12 grid items-center gap-3 lg:grid-cols-[1fr_auto_1fr_auto_0.7fr_auto_1.4fr_auto_1.3fr]">
            <Node title="Scammer on a call" sub="“Pay now or be arrested”" tone="danger" />
            <Arrow />
            <Node title="Kamala opens any UPI app" sub="or asks the Kavach assistant" />
            <Arrow />
            <Node title="UPI" sub="same rails" />
            <Arrow />
            <div className="rounded-2xl border-2 border-safe bg-pass-soft p-4 text-center ring-4 ring-safe/15">
              <p className="flex items-center justify-center gap-2 font-bold"><Shield size={20} /> Kamala's bank</p>
              <p className="mt-0.5 text-xs text-ink-2">Kavach's rules checked before the debit</p>
            </div>
            <Arrow />
            <div className="grid gap-2">
              <p className="rounded-xl border border-line bg-panel px-3 py-2 text-xs"><span className="font-bold text-pass">Paid</span> · saved payee, within limits</p>
              <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs"><span className="font-bold text-danger">Held, Arjun asked</span> · new UPI ID or ₹95,000</p>
            </div>
          </motion.div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              ["Any app, same rules", "The rules are checked when her bank approves the debit, so switching apps doesn't get around them. A scammer saying “open your payment app and scan this” changes nothing."],
              ["The assistant is optional", "For someone who would rather ask in Tamil than tap through screens. It also reads the conversation, catches the pressure early and explains calmly why it won't pay."],
              ["Proven without the chat", "In our test we bypassed the assistant and sent payment requests straight to the payment tools. The code rules alone stopped 40 of 40."],
            ].map(([t, d], i) => (
              <motion.div key={t} {...fade} transition={{ duration: 0.5, delay: i * 0.08 }} className="rounded-3xl border border-line bg-panel p-6">
                <p className="text-lg font-bold">{t}</p>
                <p className="mt-2 text-sm text-ink-2">{d}</p>
              </motion.div>
            ))}
          </div>
          <p className="mt-6 text-sm text-ink-3">
            This is how a bank would deploy it. Our build runs the same rules behind its own mock payment tools, not inside a real bank.
          </p>
        </div>
      </section>

      {/* ---------- Who it's for ---------- */}
      <section className="border-t border-line bg-panel py-24">
        <div className="mx-auto max-w-6xl px-5">
          <motion.p {...fade} className="text-sm font-bold uppercase tracking-widest text-brand">Who it's for</motion.p>
          <motion.h2 {...fade} className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Built for the people scammers target</motion.h2>
          <motion.p {...fade} className="mt-3 max-w-2xl text-ink-2">Each one has a live app. Open it, no sign-in needed.</motion.p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {PEOPLE.map((p, i) => (
              <motion.a key={p.name} href={p.href} {...fade} transition={{ duration: 0.5, delay: i * 0.1 }}
                className="group rounded-3xl border border-line bg-surface p-7 transition hover:-translate-y-1 hover:shadow-xl">
                <span className="grid h-14 w-14 place-items-center rounded-2xl text-2xl font-extrabold text-white"
                  style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}>{p.initials}</span>
                <p className="mt-5 text-xl font-bold">{p.name}</p>
                <p className="text-sm text-ink-3">{p.role}</p>
                <p className="mt-3 text-ink-2">{p.line}</p>
                <p className="mt-5 font-semibold text-brand group-hover:underline">{p.cta} →</p>
              </motion.a>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- What broke ---------- */}
      <section id="broke" className="mx-auto max-w-6xl px-5 py-20">
        <motion.div {...fade} className="grid items-center gap-8 rounded-3xl bg-navy-900 p-8 text-white md:grid-cols-[auto_1fr] md:p-10">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-amber text-3xl text-navy-950">!</span>
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-amber">What broke while building it</p>
            <p className="mt-2 text-2xl font-bold">The platform's default memory leaked one family's scam call into another's session.</p>
            <p className="mt-2 text-white/65">No money moved: the code layers held. We switched that memory off, deleted what it stored, and logged it.</p>
            <a href="/what-broke/" className="mt-4 inline-block font-semibold text-amber hover:underline">Read every failure we logged →</a>
          </div>
        </motion.div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Node({ title, sub, tone }: { title: string; sub: string; tone?: "danger" }) {
  return (
    <div className={`rounded-2xl border p-4 text-center ${tone === "danger" ? "border-danger/40 bg-danger/10" : "border-line bg-panel"}`}>
      <p className={`font-bold ${tone === "danger" ? "text-danger" : ""}`}>{title}</p>
      <p className="mt-0.5 text-xs text-ink-3">{sub}</p>
    </div>
  );
}

function Arrow() {
  return <span className="rotate-90 justify-self-center text-xl text-ink-3 lg:rotate-0" aria-hidden>→</span>;
}

/** Beat 1 of How it works: the household's rules, switchable between Kamala (set by Arjun) and Priya (set by herself). */
function RulesBeat() {
  const [who, setWho] = useState<"kamala" | "priya">("kamala");
  const rules = who === "kamala" ? RULES : PRIYA_RULES;
  return (
    <>
      <div className="mt-12 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-sm font-extrabold text-navy-950">1</span>
          <p className="text-lg font-bold">{who === "kamala" ? "Arjun writes his mother's rules, in plain words" : "Priya writes her own rules, when calm"}</p>
        </div>
        <div className="glass flex rounded-full p-1 text-sm font-semibold" role="group" aria-label="Whose rules">
          {([["kamala", "Kamala · Guardian"], ["priya", "Priya · Self-protect"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setWho(id)} aria-pressed={who === id}
              className={`rounded-full px-4 py-1.5 transition ${who === id ? "bg-white text-navy-950" : "text-white/70 hover:text-white"}`}>{label}</button>
          ))}
        </div>
      </div>
      <ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {rules.map((r) => (
          <li key={r.id} className="glass rounded-2xl p-3.5">
            <span className="font-mono text-xs font-bold text-sky">{r.id}</span>
            <p className="mt-1 text-sm leading-snug text-white/85">{r.text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <p className="glass rounded-2xl p-3.5 text-sm text-white/80"><span className="font-bold text-safe">Kavach can read</span> · {ACCESS.can.join(", ")}</p>
        <p className="glass rounded-2xl p-3.5 text-sm text-white/80"><span className="font-bold text-danger">Never</span> · {ACCESS.never.join(", ")}</p>
      </div>
      {who === "priya" && <p className="mt-3 text-sm text-white/55">Same engine, a different rules file. Priya is her own approver, so her limits use a waiting period instead of a second person.</p>}
    </>
  );
}
