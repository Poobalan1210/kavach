import type { Message } from "@/lib/useChat";
import { STATUS } from "./LayerStack";

const OUTCOME = {
  clear: { status: "pass", label: "Clear" },
  flagged: { status: "flag", label: "Flagged" },
  blocked: { status: "block", label: "Blocked" },
} as const;

export function Transcript({ messages, busy, large = false }: { messages: Message[]; busy: boolean; large?: boolean }) {
  return (
    <ol className="flex flex-col gap-3" aria-live="polite">
      {messages.map((m, i) => (
        <li key={i} className={m.from === "user" ? "flex justify-end" : "flex justify-start"}>
          <div
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 ${large ? "text-xl" : ""} ${
              m.from === "user" ? "bg-brand text-white" : "border border-line bg-panel text-ink"
            }`}
          >
            {m.text}
            {m.turn && !large && <OutcomeBadge outcome={m.turn.outcome} seconds={m.turn.seconds} />}
          </div>
        </li>
      ))}
      {busy && (
        <li className="flex justify-start">
          <div className="rounded-2xl border border-line bg-panel px-4 py-2.5 text-ink-3">Kavach is checking…</div>
        </li>
      )}
    </ol>
  );
}

function OutcomeBadge({ outcome, seconds }: { outcome: keyof typeof OUTCOME; seconds: number }) {
  const o = OUTCOME[outcome];
  const s = STATUS[o.status];
  return (
    <span className="mt-2 flex items-center gap-2 text-xs font-semibold" style={{ color: s.fg }}>
      <span aria-hidden>{s.icon}</span>
      {o.label}
      <span className="font-normal text-ink-3">· {seconds.toFixed(1)} s</span>
    </span>
  );
}
