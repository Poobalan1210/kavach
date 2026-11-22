"use client";

import { ArrowRight, IndianRupee, MessageSquareText, UserRound } from "lucide-react";
import { RAIL } from "@/components/landing/LayerRail";
import type { ChatTurn, LayerStatus } from "@/lib/api";

const ICON = Object.fromEntries(RAIL.map((r) => [r.id, r.icon]));
const COLOR: Record<LayerStatus, string> = {
  pass: "var(--color-pass)", flag: "var(--color-flag)", block: "var(--color-block)", idle: "var(--color-ink-3)",
};
const WORD: Record<LayerStatus, string> = { pass: "Pass", flag: "Flag", block: "Block", idle: "–" };

/**
 * The whole turn as input → output, layer by layer: Kamala's message, each layer that acted
 * (what it was given, what it decided), Kavach's reply, and whether money moved.
 */
export function Trace({ message, turn }: { message: string; turn: ChatTurn }) {
  const steps = turn.trace ?? [];
  const paid = turn.trace?.find((s) => s.layer === "L6" && s.status === "pass");
  return (
    <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel text-sm">
      <Row icon={<UserRound className="h-4 w-4" />} color="#1d4f8f" name="Kamala" tag="Input">
        <span className="font-semibold">“{message}”</span>
      </Row>
      {steps.map((s, i) => {
        const Icon = ICON[s.layer];
        return (
          <li key={i} className="grid grid-cols-[2.25rem_1fr] gap-x-3 gap-y-1 px-3.5 py-2.5 md:grid-cols-[2.25rem_9.5rem_1fr_auto_1fr_3.5rem] md:items-center">
            <span className="grid h-8 w-8 place-items-center rounded-full border-2" style={{ borderColor: COLOR[s.status], color: COLOR[s.status] }}>
              {Icon && <Icon className="h-4 w-4" />}
            </span>
            <span className="font-semibold leading-tight">
              <span className="mr-1.5 font-mono text-xs text-ink-3">{s.layer}</span>{s.name}
            </span>
            <span className="col-start-2 text-ink-2 md:col-start-auto"><span className="mr-1 text-xs font-bold uppercase text-ink-3 md:hidden">In</span><code className="break-words font-sans">{s.input}</code></span>
            <ArrowRight className="hidden h-4 w-4 text-ink-3 md:block" />
            <span className="col-start-2 md:col-start-auto" style={{ color: s.status === "pass" ? undefined : COLOR[s.status] }}>
              <span className="mr-1 text-xs font-bold uppercase text-ink-3 md:hidden">Out</span>{s.output}
            </span>
            <span className="col-start-2 text-xs font-bold md:col-start-auto md:text-right" style={{ color: COLOR[s.status] }}>{WORD[s.status]}</span>
          </li>
        );
      })}
      <Row icon={<MessageSquareText className="h-4 w-4" />} color="#0f7a55" name="Kavach replied" tag="Output">
        <span className="line-clamp-2">{turn.reply.replace(/\*\*/g, "")}</span>
      </Row>
      <Row icon={<IndianRupee className="h-4 w-4" />} color={paid ? "var(--color-pass)" : "var(--color-block)"} name="Money" tag="Result">
        <span className="font-bold" style={{ color: paid ? "var(--color-pass)" : undefined }}>{paid ? paid.input.replace(/ to /, " paid to ") : "Nothing moved"}</span>
      </Row>
    </ol>
  );
}

function Row({ icon, color, name, tag, children }: { icon: React.ReactNode; color: string; name: string; tag: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[2.25rem_1fr] gap-x-3 gap-y-1 bg-surface px-3.5 py-2.5 md:grid-cols-[2.25rem_9.5rem_1fr] md:items-center">
      <span className="grid h-8 w-8 place-items-center rounded-full text-white" style={{ background: color }}>{icon}</span>
      <span className="font-semibold leading-tight">{name} <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-ink-3">{tag}</span></span>
      <span className="col-start-2 text-ink md:col-start-auto">{children}</span>
    </li>
  );
}
