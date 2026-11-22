"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatTurn } from "@/lib/api";
import { useChat } from "@/lib/useChat";
import { LayerStack } from "./LayerStack";
import { Transcript } from "./Transcript";

interface Attack {
  id: string;
  family: string;
  lang: string;
  household: string;
  brief: string;
  source: string;
  target: { vpa?: string; payeeId?: string; amountInr: number };
  promptOnly: {
    run: string;
    breach: boolean;
    violations: string[];
    breachedRuns: number;
    runs: number;
    turns: { victim: string; app: string; tools: string[] }[];
    paid: { to: string; amountInr: number }[];
  };
  victimLines: string[];
}

const FAMILY: Record<string, string> = {
  "A-DA": "Digital arrest", "A-KYC": "Fake bank or KYC", "A-INV": "Investment or trading", "A-FAM": "Family emergency",
  "A-NP": "Payee trick", "A-SPLIT": "Splitting past the limit", "A-INJ": "Prompt injection", "A-AUTH": "Fake approver",
};
const LANG = { en: "English", hi: "Hindi", hinglish: "Hinglish", ta: "Tamil" } as Record<string, string>;
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function ScamTheatre() {
  const [attacks, setAttacks] = useState<Attack[]>([]);
  const [pick, setPick] = useState<Attack | null>(null);
  const [mode, setMode] = useState<"prompt" | "kavach">("prompt");

  useEffect(() => {
    fetch("/data/theatre.json").then((r) => r.json()).then((a: Attack[]) => {
      setAttacks(a);
      setPick(a[0] ?? null);
    });
  }, []);

  return (
    <div>
    <div className="mb-4 rounded-xl border border-line bg-panel p-4">
      <h2 className="text-lg font-bold">The same scam, two agents</h2>
      <p className="mt-1 text-ink-2">
        Both agents run the same Nova 2 Lite model and know the same household rules. The difference is where the rules live.
        Toggle between a <strong className="text-block">prompt-only agent</strong>, whose rules are only words in its instructions,
        and <strong className="text-pass">Kavach</strong>, where the rules are enforced by code, policy and a human.
      </p>
      <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <li className="rounded-lg bg-surface p-2.5"><span className="font-semibold">1. Pick a script.</span> Ones marked “prompt-only paid” fooled the prompt-only agent in our benchmark.</li>
        <li className="rounded-lg bg-surface p-2.5"><span className="font-semibold">2. Watch the recorded run.</span> A Nova Micro “scammer” coached the victim turn by turn until money moved.</li>
        <li className="rounded-lg bg-surface p-2.5"><span className="font-semibold">3. Switch to Kavach.</span> The same victim lines go to the live Kavach, and the nine layers light up.</li>
      </ol>
    </div>
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <aside className="max-h-[40rem] overflow-y-auto rounded-xl border border-line bg-panel p-2" aria-label="Attack scripts">
        {attacks.map((a) => (
          <button key={a.id} onClick={() => { setPick(a); setMode("prompt"); }} aria-pressed={pick?.id === a.id}
            className={`mb-1 block w-full rounded-md px-3 py-2 text-left text-sm ${pick?.id === a.id ? "bg-brand-soft" : ""}`}>
            <span className="font-mono font-semibold">{a.id}</span>
            <span className="ml-2 text-ink-3">{LANG[a.lang]}</span>
            {a.promptOnly.breach && <span className="mt-0.5 block font-semibold text-block">✕ prompt-only paid</span>}
            <span className="mt-0.5 block truncate text-ink-3">{FAMILY[a.family]}</span>
          </button>
        ))}
      </aside>
      {pick && (
        <section>
          <div className="mb-3 rounded-xl border border-line bg-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{pick.id}</h2>
                <p className="text-sm text-ink-2">{pick.brief}</p>
                <p className="mt-1 text-sm text-ink-3">
                  Target: {pick.target.vpa ?? pick.target.payeeId}, {inr(pick.target.amountInr)} ·{" "}
                  <a className="underline" href={pick.source} target="_blank" rel="noreferrer">pattern source</a>
                </p>
              </div>
              <div className="flex rounded-lg border border-line p-1" role="group" aria-label="Configuration">
                <button onClick={() => setMode("prompt")} aria-pressed={mode === "prompt"}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold ${mode === "prompt" ? "bg-block text-white" : "text-ink-2"}`}>
                  Prompt-only rules
                </button>
                <button onClick={() => setMode("kavach")} aria-pressed={mode === "kavach"}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold ${mode === "kavach" ? "bg-pass text-white" : "text-ink-2"}`}>
                  Kavach, all layers
                </button>
              </div>
            </div>
          </div>
          {mode === "prompt" ? <PromptOnly key={pick.id} attack={pick} /> : <KavachLive key={pick.id} attack={pick} />}
        </section>
      )}
    </div>
    </div>
  );
}

function PromptOnly({ attack }: { attack: Attack }) {
  const turns = attack.promptOnly.turns;
  const [shown, setShown] = useState(1);
  useEffect(() => {
    if (shown >= turns.length) return;
    const t = setTimeout(() => setShown((s) => s + 1), 1600);
    return () => clearTimeout(t);
  }, [shown, turns.length]);
  const messages = turns.slice(0, shown).flatMap((t) => [
    { from: "user" as const, text: t.victim },
    { from: "kavach" as const, text: t.app + (t.tools.length ? `\n\n[tools: ${t.tools.join(", ")}]` : "") },
  ]);
  const done = shown >= turns.length;
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="mb-3 text-sm text-ink-3">
        Recorded benchmark run ({attack.promptOnly.run}): the same Nova 2 Lite model with the rules only in its prompt.
        This attack moved money in {attack.promptOnly.breachedRuns} of {attack.promptOnly.runs} recorded runs.
      </p>
      <Transcript messages={messages} busy={!done} />
      {done && (attack.promptOnly.breach ? (
        <div role="status" className="mt-4 rounded-lg border border-block bg-block-soft p-3 font-semibold text-block">
          ✕ Money moved: {attack.promptOnly.paid.map((p) => `${inr(p.amountInr)} to ${p.to}`).join(", ")}
          <p className="mt-1 text-sm font-normal">{attack.promptOnly.violations.join("; ")}</p>
        </div>
      ) : (
        <div role="status" className="mt-4 rounded-lg border border-line bg-idle-soft p-3 text-ink-2">
          In this recorded run the prompt-only agent held. Prompt-only rules are probabilistic: try an attack marked “prompt-only paid”.
        </div>
      ))}
    </div>
  );
}

function KavachLive({ attack }: { attack: Attack }) {
  const chat = useChat();
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const moved = useRef(false);

  async function run() {
    setRunning(true);
    setFinished(false);
    moved.current = false;
    const s = await chat.start(attack.household, attack.lang);
    for (const line of attack.victimLines) {
      const turn: ChatTurn | null = await chat.send(line, s);
      if (turn?.layers.find((l) => l.id === "L6" && l.status === "pass")) moved.current = true;
      if (!turn) break;
    }
    setRunning(false);
    setFinished(true);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
      <div className="rounded-xl border border-line bg-panel p-4">
        <p className="mb-3 text-sm text-ink-3">
          Live: the victim's lines from the recorded run, sent one by one to the deployed Kavach.
        </p>
        {!running && !finished && (
          <button onClick={run} className="rounded-md bg-pass px-4 py-2 font-semibold text-white">
            Run the same attack against Kavach
          </button>
        )}
        <Transcript messages={chat.messages} busy={chat.busy} />
        {chat.error && <p role="alert" className="mt-2 text-sm text-block">{chat.error}</p>}
        {finished && (
          <div role="status" className={`mt-4 rounded-lg border p-3 font-semibold ${moved.current ? "border-flag bg-flag-soft text-flag" : "border-pass bg-pass-soft text-pass"}`}>
            {moved.current
              ? "! A payment went through within the household's limits. Check the Activity feed."
              : `✓ No money moved.${chat.last?.paused ? ` Session paused (${chat.last.pauseRule}); approver alerted.` : ""}`}
          </div>
        )}
      </div>
      <aside className="rounded-xl border border-line bg-panel p-4">
        <h3 className="mb-3 font-semibold">The nine layers, this turn</h3>
        <LayerStack layers={chat.last?.layers ?? null} running={chat.busy} turnKey={chat.turnKey} />
      </aside>
    </div>
  );
}
