"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import claims from "@/lib/scenario-claims.json";
import { SCENARIOS, VISUAL, type Scenario } from "@/lib/scenarios";
import { LayerRail, RAIL, TypicalLane, type NodeState } from "./LayerRail";

const TICK_MS = 520;

type Claim = { headlineLost?: number; c0Breached?: number; c0Runs?: number; kavachPaid: number[] };
const CLAIMS = claims.scenarios as Record<string, Claim>;
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Pick a scam; watch Kamala's message race a typical agent and walk Kavach's nine layers. */
export function ScenarioCompare() {
  const [pick, setPick] = useState<Scenario>(SCENARIOS.find((s) => s.id === "split") ?? SCENARIOS[0]);
  const [tick, setTick] = useState(0);
  const v = VISUAL[pick.id];
  const stopId = v.stop ?? pick.kavach.stopAt;
  const stopIdx = stopId ? RAIL.findIndex((n) => n.id === stopId) + 1 : null;
  const travel = stopIdx ?? 10;
  const end = travel + 3;

  // ?scenario=<id> opens that scenario; &replay=done shows its end state (for screenshots).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = SCENARIOS.find((x) => x.id === q.get("scenario"));
    if (s) setPick(s);
    if (q.get("replay") === "done") setTick(99);
  }, []);
  useEffect(() => {
    if (tick >= end) return;
    const t = setTimeout(() => setTick((x) => x + 1), TICK_MS);
    return () => clearTimeout(t);
  }, [tick, end]);

  const done = tick >= end;
  const cursor = Math.min(tick, travel);
  const after = tick > travel; // past the stop: alerts and signing light up

  const states: Partial<Record<string, NodeState>> = {};
  RAIL.forEach((n, i) => {
    const k = i + 1;
    const step = pick.kavach.steps[n.id];
    if (k <= cursor) {
      states[n.id] = n.id === stopId && pick.id === "invest" ? "flag" : step ? step.status : stopIdx ? "pass" : "dim";
    } else if (after) {
      states[n.id] = step ? step.status : "dim";
    }
  });

  const isBill = pick.id === "bill";
  // Every number here comes from scenario-claims.json, which the build checks against the results.
  const c = CLAIMS[pick.id];
  const lost = isBill ? `${inr(c.kavachPaid[0])} ${v.lost}` : `${inr(c.headlineLost!)} ${v.lost}`;
  const runs = c.c0Runs ? `In ${c.c0Breached} of ${c.c0Runs} recorded runs` : "";
  const family = c.kavachPaid.length && !isBill ? inr(c.kavachPaid.reduce((a, b) => a + b, 0)) : "";
  const whyKavach = v.whyKavach.replace("{family}", family);
  const typicalCursor = Math.min(tick, 3);

  return (
    <div>
      {/* picker */}
      <div className="flex flex-wrap justify-center gap-2" role="tablist" aria-label="Scams">
        {SCENARIOS.map((s) => (
          <button key={s.id} role="tab" aria-selected={pick.id === s.id} onClick={() => { setPick(s); setTick(0); }}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${pick.id === s.id ? "bg-white text-navy-950" : "glass text-white/80 hover:bg-white/10"}`}>
            {s.title}
          </button>
        ))}
      </div>

      {/* what she types */}
      <AnimatePresence mode="wait">
        <motion.p key={pick.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="mx-auto mt-8 max-w-2xl rounded-3xl rounded-bl-md bg-[#1d4f8f] px-5 py-3.5 text-center text-lg font-semibold text-white shadow-xl">
          “{v.says}”
        </motion.p>
      </AnimatePresence>

      {/* typical agent */}
      <div className="mt-10">
        <p className="mb-4 text-center text-sm font-bold uppercase tracking-widest text-white/50">A typical agent</p>
        <TypicalLane cursor={typicalCursor}
          money={{ label: typicalCursor >= 3 ? lost : "Money", tone: typicalCursor >= 3 ? (isBill ? "pass" : "block") : "idle" }} />
      </div>

      {/* kavach */}
      <div className="mt-12">
        <p className="mb-2 text-center text-sm font-bold uppercase tracking-widest text-sky">Kavach</p>
        <div className="pt-8">
          <LayerRail states={states} tags={v.tags} cursor={cursor} stoppedAt={after && stopIdx ? stopId : null}
            money={done ? { label: v.kept, tone: isBill ? "pass" : "safe" } : { label: "Money", tone: "idle" }} />
        </div>
      </div>

      {/* verdicts */}
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Verdict show={tick >= 3} title="A typical agent" big={lost} note={runs} tone={isBill ? "pass" : "block"} why={v.whyTypical} />
        <Verdict show={done} title="Kavach" big={v.kept} tone="pass" why={whyKavach} />
      </div>

      <div className="mt-6 flex flex-wrap items-start justify-center gap-4 text-sm">
        <button onClick={() => setTick(0)} className="glass rounded-full px-4 py-2 font-semibold text-white hover:bg-white/10">↻ Replay</button>
        {pick.attack && (
          <details className="w-full max-w-5xl text-white/80 md:w-auto">
            <summary className="glass cursor-pointer list-none rounded-full px-4 py-2 text-center font-semibold hover:bg-white/10">
              Read the recorded conversation{pick.translated ? ` (${pick.translated.toLowerCase()})` : ""}
            </summary>
            <Transcripts pick={pick} />
          </details>
        )}
      </div>
    </div>
  );
}

function Verdict({ show, title, big, note, tone, why }: { show: boolean; title: string; big: string; note?: string; tone: "pass" | "block"; why: string }) {
  const c = tone === "block" ? "var(--color-danger)" : "var(--color-safe)";
  return (
    <motion.div animate={{ opacity: show ? 1 : 0.25 }} className="glass rounded-3xl p-6 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-white/50">{title}</p>
      <p className="mt-2 text-3xl font-extrabold" style={{ color: show ? c : "white" }}>{show ? big : "…"}</p>
      {show && note && <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-white/45">{note}</p>}
      <p className="mt-2 text-white/70">{show ? why : ""}</p>
    </motion.div>
  );
}

function Transcripts({ pick }: { pick: Scenario }) {
  const col = (title: string, turns: Scenario["kavach"]["turns"], bad: boolean) => (
    <div className="flex-1 rounded-2xl bg-white/5 p-4 text-left">
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-white/50">{title}</p>
      {turns.map((t, i) => (
        <div key={i} className="mb-3 text-sm">
          <p className="ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-[#1d4f8f] px-3 py-2 text-white">{t.me}</p>
          <p className={`mt-1.5 max-w-[92%] rounded-2xl rounded-bl-md px-3 py-2 ${t.paid ? (bad ? "bg-danger/20 text-white" : "bg-safe/20 text-white") : "bg-white/10 text-white/85"}`}>
            {t.reply}
          </p>
        </div>
      ))}
    </div>
  );
  return (
    <div className="mt-4 flex flex-col gap-3 md:flex-row">
      {col("A typical agent", pick.promptOnly.turns, pick.id !== "bill")}
      {col("Kavach", pick.kavach.turns, false)}
    </div>
  );
}
