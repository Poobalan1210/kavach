"use client";

import { useState } from "react";
import { LayerFlow } from "@/components/LayerFlow";
import { LayerStack, STATUS } from "@/components/LayerStack";
import { Results } from "@/components/Results";
import { ScamTheatre } from "@/components/ScamTheatre";
import { DemoBar } from "@/components/DemoBar";
import { Trace } from "@/components/Trace";
import { Transcript } from "@/components/Transcript";
import { explain } from "@/lib/explain";
import { SCENARIOS } from "@/lib/story";
import { useChat } from "@/lib/useChat";

const TABS = [
  { id: "live", label: "Guided demo", note: "Talk to the live Kavach as Kamala and watch every layer" },
  { id: "theatre", label: "Scam Theatre", note: "The same scam against a prompt-only agent and against Kavach" },
  { id: "results", label: "Results", note: "40 coached scams and 30 real tasks, four configurations" },
  { id: "layers", label: "The nine layers", note: "What each layer does and which rules it holds" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const ICON: Record<string, string> = { bill: "⚡", arrest: "🚔", split: "✂️", sms: "✉️", limit: "₹" };

const HOUSEHOLDS = [
  { id: "hh-kamala", label: "Kamala's household (Guardian; Arjun approves)" },
  { id: "hh-priya", label: "Priya (Self-protect; her own rules)" },
];
const LANGS = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिन्दी" },
  { id: "ta", label: "தமிழ்" },
];

export default function ConsolePage() {
  return <Console />;
}

function Console() {
  const [tab, setTab] = useState<Tab>("live");
  const active = TABS.find((t) => t.id === tab)!;
  return (
    <div className="min-h-dvh">
      <DemoBar />
      <header className="hero-bg relative overflow-hidden text-white">
        <div className="grid-lines absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 pb-6 pt-6">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Shield Console</h1>
          <p className="mt-1 text-white/60">Run a scam against the live Kavach and watch every layer decide.</p>
          <nav className="mt-5 flex flex-wrap gap-2" aria-label="Views">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} aria-pressed={tab === t.id}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === t.id ? "bg-white text-navy-950" : "glass text-white/80 hover:bg-white/10"}`}>
                {t.label}
              </button>
            ))}
          </nav>
          <p className="mt-3 text-sm text-white/60">{active.note}</p>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-5">
      {tab === "live" && <Guided />}
      {tab === "theatre" && <ScamTheatre />}
      {tab === "results" && <Results />}
      {tab === "layers" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="text-ink-2">
            <h2 className="mb-2 text-xl font-bold text-ink">Why nine layers?</h2>
            <p>A model can be persuaded, confused or hijacked, so Kavach never relies on it to say no. The two classifiers (L2, L3)
              catch pressure early and explain it kindly. The four code layers (L4 to L7) hold the hard limits no matter what the
              model does: in the benchmark, L5 to L7 alone held all 40 attacks with the model and L4 bypassed by a script that
              always tries to pay the scammer. A human (L8) decides anything unusual, and every decision is signed (L9).</p>
            <p className="mt-3">Every rule is held by at least two independent layers. The system prompt (L1) is listed but never counted.</p>
          </div>
          <LayerFlow />
        </div>
      )}
      </div>
    </div>
  );
}

function Guided() {
  const chat = useChat();
  const [household, setHousehold] = useState(HOUSEHOLDS[0].id);
  const [lang, setLang] = useState("en");
  const [text, setText] = useState("");
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number] | null>(null);

  async function send(t: string) {
    const s = chat.session ?? (await chat.start(household, lang));
    setText("");
    await chat.send(t, s);
  }

  async function tryScenario(sc: (typeof SCENARIOS)[number]) {
    setScenario(sc);
    // Each scenario gets a fresh session, so one attack's pause doesn't colour the next.
    const s = await chat.start(household, lang).catch(() => null);
    if (s) await chat.send(sc.text, s);
  }

  const what = chat.last ? explain(chat.last) : null;
  const tone = what ? STATUS[what.tone] : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[17rem_1fr_24rem]">
      <aside className="rounded-xl border border-line bg-panel p-3">
        <h2 className="mb-3 font-semibold">Try these</h2>
        <ol className="flex flex-col gap-2">
          {SCENARIOS.map((sc) => (
            <li key={sc.id}>
              <button disabled={chat.busy} onClick={() => tryScenario(sc)}
                className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left text-sm transition disabled:opacity-60 ${scenario?.id === sc.id ? "border-brand bg-brand-soft" : "border-line hover:border-brand"}`}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg"
                  style={{ background: sc.id === "bill" ? "var(--color-pass-soft)" : "var(--color-block-soft)" }}>{ICON[sc.id]}</span>
                <span className="font-semibold">{sc.title.replace(/^\d\. /, "")}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-col gap-2 text-sm">
          <label className="flex flex-col gap-1 text-ink-2">Household
            <select value={household} onChange={(e) => setHousehold(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 text-ink">
              {HOUSEHOLDS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-ink-2">Language
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 text-ink">
              {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
        </div>
      </aside>

      <section className="flex min-h-[34rem] flex-col rounded-xl border border-line bg-panel p-4">
        {scenario && (
          <div className="mb-3 rounded-lg bg-surface p-3 text-sm">
            <p className="font-semibold">What should happen</p>
            <p className="text-ink-2">{scenario.expect}</p>
          </div>
        )}
        <div className="flex-1 overflow-y-auto pb-3">
          {chat.messages.length === 0 && (
            <div className="grid h-full place-items-center py-10 text-center">
              <div>
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-2xl">👵</span>
                <p className="mt-3 font-semibold">You're Kamala, 68, on her phone</p>
                <p className="mt-1 text-sm text-ink-3">Pick a scenario. The layers light up on the right, live.</p>
              </div>
            </div>
          )}
          <Transcript messages={chat.messages} busy={chat.busy} />
          {chat.error && <p role="alert" className="mt-2 text-sm text-block">{chat.error}</p>}
        </div>
        {what && tone && !chat.busy && (
          <div className="mb-3 rounded-lg border p-3 text-sm" style={{ borderColor: tone.fg, background: tone.bg }}>
            <p className="font-semibold" style={{ color: tone.fg }}>{tone.icon} What just happened: {what.headline}</p>
            <ul className="mt-1 list-disc pl-5 text-ink">
              {what.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
            {chat.last?.trace?.length ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-semibold text-brand">Show every layer's input and output</summary>
                <div className="mt-2"><Trace message={[...chat.messages].reverse().find((m) => m.from === "user")?.text ?? ""} turn={chat.last} /></div>
              </details>
            ) : null}
          </div>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setScenario(null); send(text); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Or type what Kamala might say…"
            className="flex-1 rounded-md border border-line bg-surface px-3 py-2" aria-label="Message" />
          <button disabled={chat.busy || !text.trim()} className="rounded-md bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50">Send</button>
        </form>
      </section>

      <aside className="rounded-xl border border-line bg-panel p-4">
        <h2 className="font-semibold">The nine layers, last turn</h2>
        <p className="mb-3 text-sm text-ink-3">Outermost first. Click any layer to learn what it does.</p>
        <LayerStack layers={chat.last?.layers ?? null} running={chat.busy} turnKey={chat.turnKey} />
      </aside>
    </div>
  );
}
