"""What each of the nine layers did on one turn, rebuilt from the signed audit records.

The Shield Console draws exactly this, so the animation shows what the backend
did, not a mock-up. Status per layer: pass | flag | block | idle (not reached).
"""

import json
import os
from datetime import datetime, timedelta, timezone
from functools import cache

import boto3

LAYERS = [
    ("L1", "System prompt", "Explains the rules; never counted as enforcement"),
    ("L2", "Guardrail", "Official demands, investment schemes, prompt attacks, credentials"),
    ("L3", "Coercion scorer", "Nova Micro scores urgency, secrecy, authority, threat"),
    ("L4", "Tool gate", "Session binding, saved payees, taint, pause"),
    ("L5", "Cedar policy", "Per-household payee allowlist and amount caps at the Gateway"),
    ("L6", "Payment checks", "Re-checks every limit; atomic daily total"),
    ("L7", "Scoped IAM", "One role per tool; the agent can only reach the Gateway"),
    ("L8", "Human approval", "New payees and big payments wait for the approver"),
    ("L9", "Signed audit", "Every decision signed with KMS, locked in S3"),
]


@cache
def _s3():
    return boto3.client("s3")


def records_since(session_id: str, since: datetime, bucket: str | None = None) -> list[dict]:
    bucket = bucket or os.environ["AUDIT_BUCKET"]
    out = []
    days = {since.astimezone(timezone.utc).date(), datetime.now(timezone.utc).date()}
    for d in sorted(days):
        for page in _s3().get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=f"audit/{d.isoformat()}/{session_id}/"):
            for o in page.get("Contents", []):
                if o["LastModified"] >= since - timedelta(seconds=2):
                    env = json.loads(_s3().get_object(Bucket=bucket, Key=o["Key"])["Body"].read())
                    out.append({**env["record"], "auditKey": o["Key"]})
    return sorted(out, key=lambda r: r["timestamp"])


def build(records: list[dict], threshold: float = 0.7) -> list[dict]:
    """One entry per layer: {id, name, what, status, detail}."""
    st = {lid: {"status": "idle", "detail": ""} for lid, _, _ in LAYERS}
    st["L1"] = {"status": "pass", "detail": "Rules explained to the model"}

    for r in (x for x in records if x["kind"] == "invocation"):
        l2, l3 = r["layers"].get("L2", {}), r["layers"].get("L3", {})
        rules = set(r.get("ruleIds") or [])
        if "error" in l2:
            st["L2"] = {"status": "block", "detail": "Check unavailable: payments paused"}
        elif "R6" in rules:
            st["L2"] = {"status": "block", "detail": "Official demand for money (R6)"}
        elif l2.get("promptAttack"):
            st["L2"] = {"status": "flag", "detail": "Instructions inside a pasted message (R9): session tainted"}
        elif l2.get("topics"):
            st["L2"] = {"status": "flag", "detail": "Topic: " + ", ".join(l2["topics"]).replace("_", " ")}
        else:
            st["L2"] = {"status": "pass", "detail": "Nothing flagged"}
        score = float(l3.get("score") or 0)
        if "R7" in rules:
            st["L3"] = {"status": "block", "detail": f"Coercion {score:.2f} ≥ {threshold}: session paused, approver alerted"}
        elif score >= 0.4:
            st["L3"] = {"status": "flag", "detail": f"Coercion {score:.2f}"}
        else:
            st["L3"] = {"status": "pass", "detail": f"Coercion {score:.2f}"}

    gates = [x for x in records if x["kind"] == "tool_gate"]
    denies = [g for g in gates if g["outcome"] == "deny"]
    if denies:
        reason = (denies[0]["layers"].get("L4") or {}).get("reason", "")
        st["L4"] = {"status": "block", "detail": reason[:140]}
    elif gates:
        st["L4"] = {"status": "pass", "detail": f"{len(gates)} tool call{'s' * (len(gates) != 1)} allowed"}

    pay_allowed = [g for g in gates if g["outcome"] == "allow" and (g.get("tool") or "").endswith("pay_saved_payee")]
    payments = [x for x in records if x["kind"] == "payment"]
    if len(pay_allowed) > len(payments):
        st["L5"] = {"status": "block", "detail": "Cedar refused the payment"}
    elif payments:
        st["L5"] = {"status": "pass", "detail": "Within the household's Cedar policy"}
    if gates:
        st["L7"] = {"status": "pass", "detail": "Calls went through the Gateway's scoped roles"}

    if payments:
        last = payments[-1]
        if last["outcome"] == "paid":
            st["L6"] = {"status": "pass", "detail": "Limits re-checked; daily total updated"}
        else:
            rule = ",".join(last.get("ruleIds") or [])
            msg = (last["layers"].get("L6") or {}).get("message") or ""
            st["L6"] = {"status": "block", "detail": f"{rule}: {msg}"[:140]}

    approvals = [x for x in records if x["kind"] == "approval_requested"]
    if approvals:
        st["L8"] = {"status": "flag", "detail": "Approval requested from the approver"}

    if records:
        st["L9"] = {"status": "pass", "detail": f"{len(records)} decision{'s' * (len(records) != 1)} signed and locked"}
    return [{"id": lid, "name": name, "what": what, **st[lid]} for lid, name, what in LAYERS]


def outcome(layers: list[dict]) -> str:
    statuses = {l["id"]: l["status"] for l in layers}
    if any(s == "block" for s in statuses.values()):
        return "blocked"
    if any(s == "flag" for s in statuses.values()):
        return "flagged"
    return "clear"


def _tool_name(name: str | None) -> str:
    return (name or "").split("___")[-1]


def _num(v):
    return int(v) if isinstance(v, (int, float)) and float(v).is_integer() else v


def _args(args) -> str:
    """Tool arguments as the model sent them, minus the session ID the hook binds anyway."""
    if not isinstance(args, dict):
        return str(args or "")[:160]
    return ", ".join(f"{k}: {_num(v)}" for k, v in args.items() if v not in (None, "") and k != "sessionId")[:160]


def _inr(v) -> str:
    try:
        return f"₹{float(v):,.0f}"
    except (TypeError, ValueError):
        return "₹?"


def _ist(iso: str) -> str:
    try:
        t = datetime.fromisoformat(iso).astimezone(timezone(timedelta(hours=5, minutes=30)))
    except (TypeError, ValueError):
        return ""
    return t.strftime("%-d %b, %-I:%M %p IST")


CUES = ("urgency", "secrecy", "authority", "threat", "third_party_direction")


def trace(records: list[dict], threshold: float = 0.7, names: dict | None = None) -> list[dict]:
    """The turn as a sequence of steps, each with what went into a layer and what came out.

    Built only from the signed audit records, in the order they were written. Cedar's decision
    isn't logged by the Gateway, so an allowed payment call with no payment record behind it is
    reported as a Cedar refusal (the same inference `build` makes). `names` maps payee IDs to
    display names.
    """
    names = names or {}
    steps: list[dict] = []
    for r in (x for x in records if x["kind"] == "invocation"):
        l2, l3 = r["layers"].get("L2", {}), r["layers"].get("L3", {})
        rules = set(r.get("ruleIds") or [])
        found = [t.replace("_", " ") for t in l2.get("topics") or []]
        if l2.get("promptAttack"):
            found.append("instructions hidden in pasted text")
        if l2.get("credentials"):
            found.append("credentials: " + ", ".join(l2["credentials"]))
        steps.append({
            "layer": "L2", "name": "Guardrail", "input": "Kamala's message",
            "output": ("Detected: " + "; ".join(found)) if found else ("Check unavailable" if "error" in l2 else "Nothing detected"),
            "status": "block" if "R6" in rules or "error" in l2 else "flag" if found else "pass",
        })
        score = float(l3.get("score") or 0)
        cues = [c.replace("_", " ") for c in CUES if l3.get(c) and l3.get(c) not in (0, "0", "none", "low", False)]
        out = f"Coercion {score:.2f}" + (f" · {', '.join(cues)}" if cues else "")
        if l3.get("reason"):
            out += f". {str(l3['reason']).rstrip('.')}."
        steps.append({
            "layer": "L3", "name": "Coercion scorer", "input": "Her messages so far in this session",
            "output": out[:220], "status": "block" if "R7" in rules else "flag" if score >= 0.4 else "pass",
        })
        if rules & {"R6", "R7"}:
            rule = "R6" if "R6" in rules else "R7"
            steps.append({
                "layer": "L4", "name": "Session paused", "input": f"{rule} triggered",
                "output": "No payment can go through in this session" + (" · Arjun alerted" if r.get("alerted") else ""),
                "status": "block",
            })

    pending_pay = None
    for r in records:
        kind = r["kind"]
        if kind == "tool_gate":
            if pending_pay:
                steps.append({"layer": "L5", "name": "Cedar policy", "input": pending_pay, "output": "Refused: payee or amount outside the household's policy", "status": "block"})
                pending_pay = None
            tool = _tool_name(r.get("tool"))
            l4 = (r["layers"].get("L4") or {})
            allowed = r["outcome"] == "allow"
            steps.append({
                "layer": "L4", "name": "Tool gate", "input": f"{tool}({_args(r.get('input'))})",
                "output": "Allowed" if allowed else f"Denied: {l4.get('reason', '')}"[:200], "status": "pass" if allowed else "block",
            })
            if allowed and tool == "pay_saved_payee":
                a = r.get("input") if isinstance(r.get("input"), dict) else {}
                pending_pay = f"{_inr(a.get('amountInr'))} to {names.get(a.get('payeeId'), a.get('payeeId') or '?')}"
        elif kind == "payment":
            if pending_pay:
                steps.append({"layer": "L5", "name": "Cedar policy", "input": pending_pay, "output": "Permitted: saved payee, within the cap", "status": "pass"})
                pending_pay = None
            l6 = r["layers"].get("L6") or {}
            amount = r.get("amountPaise")
            what = f"₹{int(amount) // 100:,}" if amount else "payment"
            paid = r["outcome"] == "paid"
            steps.append({
                "layer": "L6", "name": "Payment checks", "input": f"{what} to {names.get(r.get('payeeId'), r.get('payeeId') or '?')}",
                "output": "Paid: limits re-checked, daily total updated" if paid else f"{r['outcome'].capitalize()}: {l6.get('rule') or ''} {l6.get('message') or ''}".strip()[:200],
                "status": "pass" if paid else "block" if r["outcome"] == "blocked" else "flag",
            })
        elif kind == "approval_requested":
            l8 = r["layers"].get("L8") or {}
            a = r.get("input") if isinstance(r.get("input"), dict) else {}
            who = a.get("payeeName") or names.get(a.get("payeeId"), a.get("payeeId")) or "payment"
            ask = f"{'New payee ' if a.get('payeeVpa') else ''}{who}" + (f" ({a['payeeVpa']})" if a.get("payeeVpa") else "") + \
                (f", {_inr(a.get('amountInr'))}" if a.get("amountInr") else "")
            ends = _ist(str(l8.get("coolingEndsAt") or ""))
            steps.append({
                "layer": "L8", "name": "Family approval", "input": ask,
                "output": "Sent to Arjun" + (f" · can't be paid before {ends}" if ends else ""), "status": "flag",
            })
    if pending_pay:
        steps.append({"layer": "L5", "name": "Cedar policy", "input": pending_pay, "output": "Refused: payee or amount outside the household's policy", "status": "block"})
    if any(r["kind"] == "tool_gate" for r in records):
        steps.append({"layer": "L7", "name": "Scoped access", "input": "Each tool call", "output": "Ran through the Gateway under that tool's own narrow role", "status": "pass"})
    if records:
        steps.append({
            "layer": "L9", "name": "Signed proof", "input": f"{len(records)} decision{'s' * (len(records) != 1)}",
            "output": "Each signed with KMS (ECDSA) and locked in S3 for 30 days", "status": "pass",
        })
    return steps
