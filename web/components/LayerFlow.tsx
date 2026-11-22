"use client";

import { useState } from "react";
import { KIND, LAYERS, type LayerKind } from "@/lib/story";

const KIND_COLOR: Record<LayerKind, string> = {
  explain: "var(--color-ink-3)",
  classifier: "var(--color-flag)",
  code: "var(--color-brand)",
  human: "var(--color-pass)",
  evidence: "var(--color-ink-2)",
};

/**
 * The nine layers as a top-to-bottom flow: a message enters at the top and a
 * payment can only happen at the bottom of the code layers. Click a layer to read
 * what it does and which rules it holds.
 */
export function LayerFlow({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(compact ? null : "L4");
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {(Object.keys(KIND) as LayerKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} />
            {KIND[k].label}
          </span>
        ))}
      </div>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-2">
        <span aria-hidden>↓</span> A message from Kamala's phone
      </p>
      <ol className="flex flex-col gap-1.5">
        {LAYERS.map((l) => {
          const isOpen = open === l.id;
          return (
            <li key={l.id}>
              <button
                onClick={() => setOpen(isOpen ? null : l.id)}
                aria-expanded={isOpen}
                className="grid w-full grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2 text-left hover:border-brand"
                style={{ borderLeft: `4px solid ${KIND_COLOR[l.kind]}` }}
              >
                <span className="font-mono text-sm text-ink-2">{l.id}</span>
                <span className="min-w-0">
                  <span className="block font-semibold">{l.name}</span>
                  {!compact && <span className="block text-sm text-ink-2">{l.short}</span>}
                </span>
                <span className="text-xs text-ink-3">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && (
                <div className="mx-1 rounded-b-lg border border-t-0 border-line bg-surface px-4 py-3 text-sm">
                  <p className="text-ink">{l.long}</p>
                  <p className="mt-2 text-ink-3">
                    {KIND[l.kind].label}: {KIND[l.kind].note.toLowerCase()} · Runs on {l.where}
                    {l.rules.length > 0 && <> · Holds {l.rules.join(", ")}</>}
                  </p>
                </div>
              )}
              {l.id === "L6" && (
                <p className="my-1.5 flex items-center gap-2 pl-1 text-sm font-semibold text-pass">
                  <span aria-hidden>↓</span> Only now can money move (a mock ledger). L7 to L9 wrap every step:
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
