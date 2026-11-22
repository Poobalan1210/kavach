"use client";

import {
  Ban, Brain, Calculator, CreditCard, FileSignature, Gauge, IndianRupee, KeyRound, Scale, ScrollText, ShieldCheck,
  UserRound, Users, type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

export type NodeState = "idle" | "pass" | "flag" | "block" | "guard" | "dim";

export const RAIL: { id: string; name: string; icon: LucideIcon; group: Group; line: string }[] = [
  { id: "L1", name: "System prompt", icon: ScrollText, group: "explain", line: "Tells the model the rules" },
  { id: "L2", name: "Guardrail", icon: ShieldCheck, group: "classify", line: "Spots official demands, scams, injected text" },
  { id: "L3", name: "Coercion scorer", icon: Gauge, group: "classify", line: "Scores pressure and secrecy" },
  { id: "L4", name: "Tool gate", icon: Ban, group: "code", line: "Saved payees, own session only" },
  { id: "L5", name: "Cedar policy", icon: Scale, group: "code", line: "Payee list and amount caps" },
  { id: "L6", name: "Payment checks", icon: Calculator, group: "code", line: "Daily total, re-checked" },
  { id: "L7", name: "Scoped access", icon: KeyRound, group: "code", line: "No tool to add payees or raise limits" },
  { id: "L8", name: "Family approval", icon: Users, group: "human", line: "Arjun decides anything unusual" },
  { id: "L9", name: "Signed proof", icon: FileSignature, group: "evidence", line: "Every decision signed and locked" },
];

export type Group = "explain" | "classify" | "code" | "human" | "evidence";
export const GROUPS: Record<Group, { label: string; color: string }> = {
  explain: { label: "Explains", color: "#8b93a7" },
  classify: { label: "AI checks", color: "#f0a43a" },
  code: { label: "Hard rules in code", color: "#5b8def" },
  human: { label: "Family", color: "#22c58b" },
  evidence: { label: "Proof", color: "#a78bfa" },
};

const STATE: Record<NodeState, { ring: string; fill: string; icon: string; badge?: string }> = {
  idle: { ring: "rgba(255,255,255,0.18)", fill: "rgba(255,255,255,0.04)", icon: "rgba(255,255,255,0.85)" },
  pass: { ring: "var(--color-safe)", fill: "rgba(34,197,139,0.16)", icon: "var(--color-safe)", badge: "✓" },
  flag: { ring: "var(--color-amber)", fill: "rgba(255,181,71,0.16)", icon: "var(--color-amber)", badge: "!" },
  block: { ring: "var(--color-danger)", fill: "rgba(255,93,93,0.22)", icon: "var(--color-danger)", badge: "✕" },
  guard: { ring: "var(--color-sky)", fill: "rgba(106,167,255,0.12)", icon: "var(--color-sky)", badge: "◇" },
  dim: { ring: "rgba(255,255,255,0.08)", fill: "transparent", icon: "rgba(255,255,255,0.25)" },
};

/**
 * Kamala → nine layers → money, as one row of icons. `cursor` is where the message is
 * (0 = Kamala, 1–9 = layers, 10 = money); `states` colours each layer; `tags` pop a few words
 * above the layers that act.
 */
export function LayerRail({
  states = {}, tags = {}, cursor = -1, money, showLines = false, stoppedAt = null,
}: {
  states?: Partial<Record<string, NodeState>>;
  tags?: Partial<Record<string, string>>;
  cursor?: number;
  money?: { label: string; tone: "idle" | "pass" | "block" | "safe" };
  showLines?: boolean;
  stoppedAt?: string | null;
}) {
  const moneyColor = !money || money.tone === "idle" ? "rgba(255,255,255,0.18)" : money.tone === "block" ? "var(--color-danger)" : "var(--color-safe)";
  return (
    <div className="overflow-x-auto pb-2">
      <div className="relative mx-auto min-w-[920px]">
        {/* group bands */}
        <div className="mb-3 grid grid-cols-[repeat(11,minmax(0,1fr))] gap-1 text-center text-[11px] font-bold uppercase tracking-widest">
          <span />
          {RAIL.map((n, i) => {
            const first = i === 0 || RAIL[i - 1].group !== n.group;
            const span = RAIL.filter((x) => x.group === n.group).length;
            return first ? (
              <span key={n.id} style={{ gridColumn: `span ${span} / span ${span}`, color: GROUPS[n.group].color, borderColor: GROUPS[n.group].color }}
                className="rounded-full border px-2 py-1">
                {GROUPS[n.group].label}
              </span>
            ) : null;
          })}
          <span />
        </div>

        <div className="relative grid grid-cols-[repeat(11,minmax(0,1fr))] gap-1">
          {/* the wire */}
          <div className="absolute left-[4.5%] right-[4.5%] top-8 h-0.5 bg-white/10" />
          <motion.div className="absolute left-[4.5%] top-8 h-0.5"
            style={{ background: stoppedAt ? "var(--color-danger)" : "var(--color-safe)" }}
            animate={{ width: cursor < 0 ? "0%" : `${(Math.min(cursor, 10) / 10) * 91}%` }}
            transition={{ duration: 0.45, ease: "easeInOut" }} />

          <Node icon={UserRound} id="" name="Kamala" sub="types a message" state={cursor >= 0 ? "pass" : "idle"} active={cursor === 0} />
          {RAIL.map((n, i) => {
            const st = states[n.id] ?? "idle";
            const tag = tags[n.id];
            return (
              <div key={n.id} className="relative">
                <Node icon={n.icon} id={n.id} name={n.name} sub={showLines ? n.line : ""} state={st} active={cursor === i + 1}
                  group={GROUPS[n.group].color} stop={stoppedAt === n.id} />
                <AnimatePresence>
                  {tag && st !== "idle" && st !== "dim" && (
                    <motion.span initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="mx-auto mt-2 block w-fit max-w-[7.5rem] rounded-full px-2 py-0.5 text-center text-[11px] font-bold leading-tight text-navy-950"
                      style={{ background: STATE[st].ring }}>
                      {tag}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          <div className="flex flex-col items-center">
            <motion.span animate={{ borderColor: moneyColor, backgroundColor: money && (money.tone === "pass" || money.tone === "block") ? moneyColor : "rgba(255,255,255,0.04)" }}
              className="relative z-10 grid h-16 w-16 place-items-center rounded-2xl border-2">
              <IndianRupee className="h-7 w-7" style={{ color: money?.tone === "safe" ? "var(--color-safe)" : "white" }} />
            </motion.span>
            <span className="mt-2 text-center text-xs font-bold" style={{ color: money?.tone === "safe" ? "var(--color-safe)" : "white" }}>{money?.label ?? "Money"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Node({ icon: Icon, id, name, sub, state, active, group, stop = false }: {
  icon: LucideIcon; id: string; name: string; sub: string; state: NodeState; active: boolean; group?: string; stop?: boolean;
}) {
  const s = STATE[state];
  return (
    <div className="flex flex-col items-center text-center">
      <motion.span
        animate={{ scale: active ? 1.12 : 1, borderColor: s.ring, backgroundColor: s.fill }}
        transition={{ duration: 0.25 }}
        className="relative z-10 grid h-16 w-16 place-items-center rounded-full border-2 bg-navy-900"
        style={{ boxShadow: stop ? "0 0 0 8px rgba(255,93,93,0.18), 0 0 30px rgba(255,93,93,0.5)" : active ? "0 0 24px rgba(106,167,255,0.45)" : "none" }}
      >
        <Icon className="h-7 w-7" style={{ color: state === "idle" && group ? group : s.icon }} strokeWidth={1.8} />
        {s.badge && (
          <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-navy-950" style={{ background: s.ring }}>
            {s.badge}
          </span>
        )}
      </motion.span>
      {id && <span className="mt-2 font-mono text-[10px] text-white/45">{id}</span>}
      <span className={`text-xs font-semibold ${state === "dim" ? "text-white/30" : "text-white"} ${id ? "" : "mt-2"}`}>{name}</span>
      {sub && <span className="mt-1 max-w-[7.5rem] text-[11px] leading-snug text-white/50">{sub}</span>}
    </div>
  );
}

/** The typical agent: three steps straight to the money. */
export function TypicalLane({ cursor, money }: { cursor: number; money: { label: string; tone: "idle" | "pass" | "block" } }) {
  const steps = [
    { icon: UserRound, name: "Kamala" },
    { icon: Brain, name: "Nova 2 Lite", sub: "rules as words" },
    { icon: CreditCard, name: "Pay tool", sub: "pays anything" },
  ];
  const moneyColor = money.tone === "idle" ? "rgba(255,255,255,0.18)" : money.tone === "block" ? "var(--color-danger)" : "var(--color-safe)";
  return (
    <div className="relative mx-auto grid max-w-xl grid-cols-4 gap-2">
      <div className="absolute left-[12%] right-[12%] top-6 h-0.5 bg-white/10" />
      <motion.div className="absolute left-[12%] top-6 h-0.5" style={{ background: moneyColor }}
        animate={{ width: `${(Math.min(Math.max(cursor, 0), 3) / 3) * 76}%` }} transition={{ duration: 0.35 }} />
      {steps.map((s, i) => (
        <div key={s.name} className="flex flex-col items-center text-center">
          <motion.span animate={{ scale: cursor === i ? 1.12 : 1, borderColor: cursor >= i ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.18)" }}
            className="relative z-10 grid h-12 w-12 place-items-center rounded-full border-2 bg-navy-900">
            <s.icon className="h-5 w-5 text-white/85" strokeWidth={1.8} />
          </motion.span>
          <span className="mt-1.5 text-xs font-semibold text-white">{s.name}</span>
          {s.sub && <span className="text-[11px] text-white/50">{s.sub}</span>}
        </div>
      ))}
      <div className="flex flex-col items-center">
        <motion.span animate={{ borderColor: moneyColor, backgroundColor: money.tone !== "idle" ? moneyColor : "rgba(255,255,255,0.04)" }}
          className="relative z-10 grid h-12 w-12 place-items-center rounded-xl border-2">
          <IndianRupee className="h-5 w-5 text-white" />
        </motion.span>
        <span className="mt-1.5 text-xs font-bold" style={{ color: money.tone === "block" ? "var(--color-danger)" : "white" }}>{money.label}</span>
      </div>
    </div>
  );
}
