"use client";

import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";

interface Entry { date: string; test: string; happened: string; cause: string; fix: string }

/** `code` spans from the markdown log, rendered as code. */
function Md({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith("`") ? <code key={i} className="rounded bg-surface px-1 py-0.5 text-[0.85em]">{part.slice(1, -1)}</code> : part,
      )}
    </>
  );
}

const serious = (e: Entry) => /memory/i.test(e.cause) && /leak/i.test(e.cause);

export default function WhatBroke() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  useEffect(() => {
    fetch("/data/what-broke.json").then((r) => r.json()).then(setEntries).catch(() => setEntries([]));
  }, []);

  return (
    <div className="bg-surface">
      <header className="hero-bg relative overflow-hidden text-white">
        <div className="grid-lines absolute inset-0 opacity-60" aria-hidden />
        <SiteNav current="/what-broke/" />
        <div className="relative mx-auto max-w-6xl px-5 pb-14 pt-6">
          <p className="text-sm font-bold uppercase tracking-widest text-amber">What broke</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">Every failure, from day one.</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/70">
            What happened, why, and the fix. A hard limit is never loosened to pass a test; the layer that let something through gets fixed.
          </p>
          {entries && <p className="mt-6 text-sm text-white/50">{entries.length} entries · published as-is from the build log</p>}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-14">
        <ol className="relative space-y-5 border-l-2 border-line pl-6">
          {(entries ?? []).map((e, i) => (
            <li key={i} className="relative">
              <span className={`absolute -left-[33px] top-6 h-4 w-4 rounded-full border-4 border-surface ${serious(e) ? "bg-danger" : "bg-amber"}`} aria-hidden />
              <article className={`rounded-3xl border bg-panel p-6 ${serious(e) ? "border-danger/50 shadow-lg" : "border-line"}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-surface px-2.5 py-1 text-ink-3">{e.date}</span>
                  {serious(e) && <span className="rounded-full bg-danger px-2.5 py-1 text-white">Most serious</span>}
                </div>
                <h2 className="mt-3 text-lg font-bold"><Md text={e.test} /></h2>
                <dl className="mt-4 grid gap-4 text-sm md:grid-cols-3">
                  {([["What happened", e.happened, "text-danger"], ["Why", e.cause, "text-amber"], ["The fix", e.fix, "text-pass"]] as const).map(([k, v, c]) => (
                    <div key={k}>
                      <dt className={`text-xs font-bold uppercase tracking-wider ${c}`}>{k}</dt>
                      <dd className="mt-1 leading-relaxed text-ink-2"><Md text={v} /></dd>
                    </div>
                  ))}
                </dl>
              </article>
            </li>
          ))}
        </ol>
      </main>
      <SiteFooter />
    </div>
  );
}
