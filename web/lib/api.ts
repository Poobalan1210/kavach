"use client";

import { config, previewMode } from "./config";

export type LayerStatus = "pass" | "flag" | "block" | "idle";

export interface Layer {
  id: string;
  name: string;
  what: string;
  status: LayerStatus;
  detail: string;
}

/** One step of a turn: what went into a layer and what came out, from the signed audit records. */
export interface TraceStep {
  layer: string;
  name: string;
  input: string;
  output: string;
  status: LayerStatus;
}

export interface ChatTurn {
  reply: string;
  layers: Layer[];
  trace?: TraceStep[];
  outcome: "clear" | "flagged" | "blocked";
  paused: boolean;
  pauseRule: string | null;
  tainted: boolean;
  tools: string[];
  seconds: number;
}

export interface Session {
  sessionId: string;
  householdId: string;
  language: string;
  owner: string;
  approver: string;
}

export interface LedgerRow {
  txnId: string;
  payeeName: string;
  status: "paid" | "held" | "blocked";
  ruleHit: string | null;
  createdAt: string;
  amount: string;
  note: string;
  verifiable: boolean;
}

export interface Approval {
  approvalId: string;
  type: "new_payee" | "over_limit" | "tainted";
  reason: string;
  decision: string;
  requestedAt: string;
  coolingEndsAt: string;
  decidedBy: string | null;
  payee: string | null;
  amount: string | null;
}

export interface Rule {
  id: string;
  text: string;
  edge: string | null;
  enforce: Record<string, unknown> | null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (previewMode) throw new ApiError(503, "Backend not deployed yet: this local preview shows layout and recorded data only.");
  const res = await fetch(`${config.apiUrl}/demo${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

const qs = (householdId?: string | null) => (householdId ? `?householdId=${encodeURIComponent(householdId)}` : "");

export const api = {
  startSession: (householdId?: string, language?: string) => call<Session>("POST", "/session", { householdId, language }),
  chat: (sessionId: string, text: string) => call<ChatTurn>("POST", "/chat", { sessionId, text }),
  activity: (householdId?: string | null) =>
    call<{ ledger: LedgerRow[]; approvals: Approval[] }>("GET", `/activity${qs(householdId)}`),
  rules: (householdId?: string | null) =>
    call<{ mode: string; setBy: string; setOn: string; rules: Rule[] }>("GET", `/rules${qs(householdId)}`),
  decide: (approvalId: string, decision: "approve" | "reject", category?: string, householdId?: string | null) =>
    call<{ ok: boolean; decision: string; coolingEndsAt: string }>("POST", `/approvals/${approvalId}`, { decision, category, householdId }),
  audit: (txnId: string, householdId?: string | null) =>
    call<{ record: Record<string, unknown>; signatureValid: boolean; algorithm: string; lock: { mode: string; retainUntil: string } }>(
      "GET",
      `/audit/${encodeURIComponent(txnId)}${qs(householdId)}`,
    ),
};
