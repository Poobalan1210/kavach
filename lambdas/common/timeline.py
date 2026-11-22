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
