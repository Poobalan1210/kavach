"use client";

import { motion } from "motion/react";
import { useState } from "react";
import type { Layer, LayerStatus } from "@/lib/api";
import { KIND, LAYERS } from "@/lib/story";

export const STATUS: Record<LayerStatus, { label: string; icon: string; fg: string; bg: string }> = {
  pass: { label: "Pass", icon: "✓", fg: "var(--color-pass)", bg: "var(--color-pass-soft)" },
  flag: { label: "Flag", icon: "!", fg: "var(--color-flag)", bg: "var(--color-flag-soft)" },
  block: { label: "Block", icon: "✕", fg: "var(--color-block)", bg: "var(--color-block-soft)" },
  idle: { label: "Not reached", icon: "–", fg: "var(--color-idle)", bg: "var(--color-idle-soft)" },
};

const INFO = Object.fromEntries(LAYERS.map((l) => [l.id, l]));
const PLACEHOLDER: Layer[] = LAYERS.map((l) => ({ id: l.id, name: l.name, what: l.short, status: "idle", detail: "" }));

/** The nine layers, outermost first. Each request lights them top to bottom; click one to learn what it does. */
export function LayerStack({ layers, running, turnKey }: { layers: Layer[] | null; running: boolean; turnKey: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = layers ?? PLACEHOLDER;
  return (
    <ol className="flex flex-col gap-1.5" aria-label="Kavach's nine layers, outermost first" aria-live="polite">
      {rows.map((layer, i) => {
        const s = STATUS[running ? "idle" : layer.status];
        const info = INFO[layer.id];
        const isOpen = open === layer.id;
        return (
          <motion.li
            key={`${turnKey}-${layer.id}`}
            initial={{ opacity: 0.35, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: running ? 0 : i * 0.12, duration: 0.25 }}
          >
            <button
              onClick={() => setOpen(isOpen ? null : layer.id)}
              aria-expanded={isOpen}
              className="grid w-full grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-lg border px-3 py-2 text-left"
              style={{ borderColor: running ? "var(--color-line)" : s.fg, background: running ? "var(--color-panel)" : s.bg }}
            >
              <span className="font-mono text-sm text-ink-2">{layer.id}</span>
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{layer.name}</span>
                <span className="line-clamp-1 text-sm text-ink-2" title={layer.detail || info?.short}>
                  {running ? (i === 0 ? "Checking…" : "") : layer.detail || info?.short}
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: s.fg }}>
                <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full text-xs text-white" style={{ background: s.fg }}>
                  {s.icon}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </span>
            </button>
            {isOpen && info && (
              <div className="mx-1 rounded-b-lg border border-t-0 border-line bg-panel px-3 py-2.5 text-sm">
                <p>{info.long}</p>
                <p className="mt-1.5 text-ink-3">
                  {KIND[info.kind].label} · {info.where}{info.rules.length > 0 && ` · holds ${info.rules.join(", ")}`}
                </p>
              </div>
            )}
          </motion.li>
        );
      })}
    </ol>
  );
}
