"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type LedgerRow } from "@/lib/api";
import { STATUS } from "./LayerStack";

const ROW = { paid: STATUS.pass, held: STATUS.flag, blocked: STATUS.block } as const;
const WORD = { paid: "Paid", held: "Held", blocked: "Blocked" } as const;

export function Activity({ householdId, large = false }: { householdId: string | null; large?: boolean }) {
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.activity(householdId).then((a) => setRows(a.ledger)).catch((e) => setError(e.message));
  }, [householdId]);
  useEffect(load, [load]);

  if (error) return <p role="alert" className="text-block">{error}</p>;
  if (!rows) return <p className="text-ink-3">Loading…</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.slice(0, large ? 15 : 40).map((r) => {
        const s = ROW[r.status];
        return (
          <li key={r.txnId} className={`rounded-xl border border-line bg-panel p-3 ${large ? "text-xl" : "text-sm"}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{r.payeeName}</span>
              <span className="font-semibold">{r.amount}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-ink-2">
              <span className="flex items-center gap-1.5 font-semibold" style={{ color: s.fg }}>
                <span aria-hidden>{s.icon}</span>{WORD[r.status]}{r.ruleHit && ` · ${r.ruleHit}`}
              </span>
              <span className={large ? "text-base" : "text-xs"}>{new Date(r.createdAt).toLocaleString("en-IN")}</span>
            </div>
            {!large && r.verifiable && <Verify txnId={r.txnId} householdId={householdId} />}
          </li>
        );
      })}
    </ul>
  );
}

function Verify({ txnId, householdId }: { txnId: string; householdId: string | null }) {
  const [state, setState] = useState<"idle" | "checking" | "valid" | "invalid" | "error">("idle");
  const [lock, setLock] = useState<string>("");
  async function check() {
    setState("checking");
    try {
      const r = await api.audit(txnId, householdId);
      setState(r.signatureValid ? "valid" : "invalid");
      setLock(r.lock.mode ? `${r.lock.mode} lock until ${new Date(r.lock.retainUntil).toLocaleDateString("en-IN")}` : "");
    } catch {
      setState("error");
    }
  }
  if (state === "idle") return <button onClick={check} className="mt-2 text-xs font-semibold text-brand underline">Verify signed record</button>;
  if (state === "checking") return <p className="mt-2 text-xs text-ink-3">Checking the KMS signature…</p>;
  if (state === "valid") return <p className="mt-2 text-xs font-semibold text-pass">✓ Signature valid · {lock}</p>;
  if (state === "invalid") return <p className="mt-2 text-xs font-semibold text-block">✕ Signature does not match</p>;
  return <p className="mt-2 text-xs text-block">Could not check the record</p>;
}
