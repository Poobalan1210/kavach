import type { ChatTurn } from "./api";

/** A plain-language account of one turn, built from what each layer actually did. */
export function explain(turn: ChatTurn): { headline: string; points: string[]; tone: "pass" | "flag" | "block" } {
  const by = Object.fromEntries(turn.layers.map((l) => [l.id, l]));
  const points: string[] = [];
  const paid = by.L6?.status === "pass";

  if (by.L2?.status === "block") points.push(`The guardrail (L2) stopped it: ${by.L2.detail.toLowerCase()}.`);
  else if (by.L2?.status === "flag") points.push(`The guardrail (L2) flagged it: ${by.L2.detail.toLowerCase()}.`);
  if (by.L3?.status === "block") points.push(`The coercion scorer (L3) saw pressure: ${by.L3.detail.toLowerCase()}.`);
  if (by.L4?.status === "block") points.push(`The tool gate (L4) refused a tool call: ${by.L4.detail}.`);
  if (by.L5?.status === "block") points.push("Cedar policy at the Gateway (L5) refused the payment: wrong payee or over the cap.");
  if (by.L6?.status === "block") points.push(`The payment checks (L6) refused it: ${by.L6.detail}.`);
  if (by.L8?.status === "flag") points.push("Kavach asked Arjun to approve instead of paying (L8).");
  if (paid) points.push("Every limit was re-checked and the payment went into the ledger (L6).");
  if (by.L9?.status === "pass") points.push(`${by.L9.detail} (L9): press Verify in Arjun's app to check them.`);
  if (turn.paused) points.push(`The session is now paused (${turn.pauseRule}): no payment can go through in it, and Arjun was alerted.`);
  else if (turn.tainted) points.push("The session is marked untrusted: every payment in it now needs Arjun (R10).");

  const blocked = turn.layers.some((l) => l.status === "block");
  if (paid) return { headline: "Paid, within the household's rules", points, tone: "pass" };
  if (blocked || turn.paused) return { headline: "Stopped. No money moved.", points, tone: "block" };
  if (by.L8?.status === "flag") return { headline: "Sent to Arjun for approval", points, tone: "flag" };
  if (!turn.tools.length) {
    points.unshift("Kavach answered without calling any tool: nothing to pay or check.");
    return { headline: "Answered; no payment involved", points, tone: "pass" };
  }
  return { headline: "Checked; no payment made", points, tone: "pass" };
}
