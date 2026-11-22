"""The six Kavach tools, behind AgentCore Gateway.

L7: each tool is deployed as its own Lambda with its own least-privilege role
and serves only the tool named in its TOOL_NAME env var. The Gateway passes
only the tool arguments as the event; the tool name comes from the client
context as "<target>___<tool>". Every tool resolves the household from the
session, never from model-supplied IDs. The L4 hook has already checked that
the sessionId argument is the caller's real session.

L6 lives in pay_saved_payee: it re-checks every limit itself (it never trusts
that L4 or Cedar ran) and keeps the daily total with a conditional write, so
no interleaving of payments can pass the R4 limit.

The Step Functions approval wait (L8) comes in Phase 4.
"""

import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from functools import cache
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from common import audit, store
from common.money import IST, MoneyError, inr_to_paise, ist_date, ist_now, paise_to_inr
from common.rules import in_quiet_hours, limits_for

log = logging.getLogger()
log.setLevel(logging.INFO)

RULES = json.loads((Path(__file__).resolve().parents[1] / "common" / "rules.generated.json").read_text())
APPROVAL_TYPES = {"new_payee", "over_limit", "tainted"}


class ToolError(Exception):
    """An expected refusal: returned to the model as a plain message."""


class Refused(Exception):
    """L6 stopped a payment: no money moves, the attempt is logged with its rule."""

    def __init__(self, status: str, rule: str, message: str):
        super().__init__(message)
        self.status, self.rule, self.message = status, rule, message


def _payee_view(p: dict) -> dict:
    return {"payeeId": p["payeeId"], "name": p["name"], "category": p["category"]}


def _active_payee(household_id: str, payee_id) -> dict:
    if not isinstance(payee_id, str) or not payee_id:
        raise ToolError("payeeId is required")
    payee = store.get_payee(household_id, payee_id)
    if not payee:
        raise ToolError("No saved payee with that payeeId. Only saved payees can be paid (rule R1).")
    if payee.get("status") != "active":
        raise ToolError(f"{payee['name']} is not active yet; new payees need approval and a cooling period (rule R2).")
    return payee


def list_payees(session, args):
    payees = [p for p in store.list_payees(session["householdId"]) if p.get("status") == "active"]
    return {"payees": [_payee_view(p) for p in sorted(payees, key=lambda p: p["name"])]}


def lookup_bill(session, args):
    payee = _active_payee(session["householdId"], args.get("payeeId"))
    bill = payee.get("bill")
    if not bill:
        raise ToolError(f"{payee['name']} is not a biller; there is no bill to look up.")
    result = {
        "payee": _payee_view(payee),
        "amountDueInr": float(Decimal(bill["amountPaise"]) / 100),
        "amountDue": paise_to_inr(bill["amountPaise"]),
        "dueDate": bill["dueDate"],
        "billNumber": bill["billNumber"],
        "biller": bill["biller"],
    }
    memo = str(bill.get("memo") or "").strip()
    if memo:
        # R9/R10: free text from the biller is untrusted. Returning it taints the
        # session, and every later payment in it needs the approver.
        store.taint_session(session["sessionId"], f"bill text from {payee['name']}")
        result["billText"] = {"untrusted": True, "text": memo[:1000]}
    return result


def _txn(session, payee_id, payee_name, amount_paise, args, now, status, rule=None):
    return {
        "householdId": session["householdId"],
        "txnId": f"txn-{now:%Y%m%d%H%M%S}-{uuid.uuid4().hex[:8]}",
        "payeeId": payee_id,
        "payeeName": payee_name,
        "amountPaise": amount_paise,
        "status": status,
        "ruleHit": rule,
        "note": str(args.get("note") or "")[:200],
        "sessionId": session["sessionId"],
        "createdAt": now.isoformat(),
    }


def _check_payment(session, household, payee, amount_paise, now) -> None:
    """L6 rule checks, in the order the user should hear about them."""
    lim = limits_for(RULES[household["mode"]])
    if session.get("tainted"):
        raise Refused("held", "R10", "Untrusted content was read in this session, so every payment needs the approver.")
    if session.get("paused"):
        raise Refused("held", session.get("pauseRule") or "R7", "This session is paused for safety; the approver has been told.")
    if payee["category"] in lim.blocked_categories:
        raise Refused("blocked", "R8", f"Payments to {payee['category']} payees are not allowed.")
    hold = lim.category_hold
    if hold and payee["category"] in hold.categories and amount_paise > hold.threshold_paise:
        raise Refused(
            "held", "S1", f"{payee['category'].title()} payments over {paise_to_inr(hold.threshold_paise)} wait {hold.delay_hours} hours."
        )
    if amount_paise > lim.per_payment_paise:
        raise Refused("held", "R3", f"Payments over {paise_to_inr(lim.per_payment_paise)} need the approver.")
    q = lim.quiet_hours
    if q and amount_paise > q.threshold_paise and in_quiet_hours(f"{now:%H:%M}", q):
        raise Refused("held", "S2", f"Payments over {paise_to_inr(q.threshold_paise)} between {q.start} and {q.end} wait until morning.")
    if amount_paise > lim.daily_paise:
        raise Refused("blocked", "R4", f"That is more than the daily limit of {paise_to_inr(lim.daily_paise)}.")


def _reserve_daily(household, date: str, amount_paise: int) -> None:
    """Atomically add to today's total only if it stays within R4."""
    lim = limits_for(RULES[household["mode"]])
    try:
        store.table("daily_totals").update_item(
            Key={"householdId": household["householdId"], "date": date},
            UpdateExpression="ADD totalPaise :a",
            ConditionExpression="attribute_not_exists(totalPaise) OR totalPaise <= :room",
            ExpressionAttributeValues={":a": amount_paise, ":room": lim.daily_paise - amount_paise},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        raise Refused("blocked", "R4", f"That would pass today's limit of {paise_to_inr(lim.daily_paise)}.") from e


def _audit_payment(session, args, txn, outcome, rules, message):
    return audit.record(
        "payment",
        session["sessionId"],
        outcome,
        {"L6": {"outcome": outcome, "rule": rules[0] if rules else None, "message": message}},
        rules,
        tool="pay_saved_payee",
        tool_input=args,
        txn_id=txn["txnId"],
        extra={"amountPaise": txn["amountPaise"], "payeeId": txn["payeeId"]},
    )


def pay_saved_payee(session, args):
    household = store.get_household(session["householdId"])
    payee = _active_payee(household["householdId"], args.get("payeeId"))
    try:
        amount_paise = inr_to_paise(args.get("amountInr"))
    except MoneyError as e:
        raise ToolError(str(e)) from e

    now = ist_now()
    try:
        _check_payment(session, household, payee, amount_paise, now)
        _reserve_daily(household, ist_date(now), amount_paise)
    except Refused as r:
        txn = _txn(session, payee["payeeId"], payee["name"], amount_paise, args, now, r.status, r.rule)
        txn["auditKey"] = _audit_payment(session, args, txn, r.status, [r.rule], r.message)
        store.table("ledger").put_item(Item=txn)
        return {"status": r.status, "rule": r.rule, "message": r.message, "txnId": txn["txnId"], "moneyMoved": False}

    txn = _txn(session, payee["payeeId"], payee["name"], amount_paise, args, now, "paid")
    try:
        txn["auditKey"] = _audit_payment(session, args, txn, "paid", [], None)
        store.table("ledger").put_item(Item=txn, ConditionExpression="attribute_not_exists(txnId)")
    except Exception:
        # Give back the reservation so a failed write can't eat into the limit.
        store.table("daily_totals").update_item(
            Key={"householdId": household["householdId"], "date": ist_date(now)},
            UpdateExpression="ADD totalPaise :neg",
            ExpressionAttributeValues={":neg": -amount_paise},
        )
        raise
    return {
        "status": "paid",
        "txnId": txn["txnId"],
        "payee": payee["name"],
        "vpa": payee["vpa"],
        "amount": paise_to_inr(amount_paise),
        "paidAt": txn["createdAt"],
        "moneyMoved": True,
    }


VPA = re.compile(r"^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z][a-zA-Z0-9]{1,32}$")


def _cooling_hours(household: dict) -> int:
    for r in RULES[household["mode"]]["rules"]:
        if r["id"] == "R2":
            return int((r.get("enforce") or {}).get("cooling_hours", 24))
    return 24


def request_approval(session, args):
    """Starts the L8 workflow. A new payee is written as pending and can't be
    paid until the approver says yes AND the cooling period has run out."""
    kind = args.get("type")
    if kind not in APPROVAL_TYPES:
        raise ToolError(f"type must be one of {sorted(APPROVAL_TYPES)}")
    household = store.get_household(session["householdId"])
    needs_approver = household.get("approverId") != "self"
    draft = {}
    if args.get("amountInr") is not None:
        try:
            draft["amountPaise"] = inr_to_paise(args["amountInr"])
        except MoneyError as e:
            raise ToolError(str(e)) from e

    now = datetime.now(timezone.utc)
    if kind == "new_payee":
        name, vpa = str(args.get("payeeName") or "").strip(), str(args.get("payeeVpa") or "").strip()
        if not name or not VPA.match(vpa):
            raise ToolError("A new payee needs a name and a valid UPI ID (like name@bank).")
        draft |= {"payeeName": name[:80], "payeeVpa": vpa, "payeeId": f"p-{uuid.uuid4().hex[:10]}"}
        wait_hours = _cooling_hours(household)
    else:
        payee = _active_payee(household["householdId"], args.get("payeeId"))
        if "amountPaise" not in draft:
            raise ToolError("amountInr is required for a payment approval")
        draft |= {"payeeId": payee["payeeId"], "payeeName": payee["name"]}
        # Guardian: the approver decides, no wait. Self-protect: the wait is the approval.
        wait_hours = 0 if needs_approver else _cooling_hours(household)

    cooling_ends = now + timedelta(hours=wait_hours)
    approval_id = f"apr-{uuid.uuid4().hex[:12]}"
    approval = {
        "approvalId": approval_id,
        "householdId": household["householdId"],
        "sessionId": session["sessionId"],
        "type": kind,
        "reason": str(args.get("reason") or "")[:500],
        "draft": draft,
        "requestedAt": now.isoformat(),
        "coolingEndsAt": cooling_ends.isoformat(),
        "needsApprover": needs_approver,
        "decision": "pending",
    }
    if kind == "new_payee":
        store.table("payees").put_item(
            Item={
                "householdId": household["householdId"],
                "payeeId": draft["payeeId"],
                "name": draft["payeeName"],
                "vpa": draft["payeeVpa"],
                "category": "other",
                "status": "pending",
                "addedAt": now.isoformat(),
                "coolingEndsAt": cooling_ends.isoformat(),
                "approvalId": approval_id,
            },
            ConditionExpression="attribute_not_exists(payeeId)",
        )
    store.table("approvals").put_item(Item=approval)
    execution = _sfn().start_execution(
        stateMachineArn=os.environ["APPROVAL_STATE_MACHINE_ARN"],
        name=approval_id,
        input=json.dumps(
            {
                "approvalId": approval_id,
                "needsApprover": needs_approver,
                "coolingEndsAt": cooling_ends.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
        ),
    )
    store.table("approvals").update_item(
        Key={"approvalId": approval_id},
        UpdateExpression="SET executionArn = :e",
        ExpressionAttributeValues={":e": execution["executionArn"]},
    )
    audit.record(
        "approval_requested",
        session["sessionId"],
        "pending",
        {"L8": {"needsApprover": needs_approver, "coolingEndsAt": cooling_ends.isoformat()}},
        ["R2"] if kind == "new_payee" else ["R3" if kind == "over_limit" else "R10"],
        tool="request_approval",
        tool_input=args,
        approval_id=approval_id,
    )
    who = household.get("approverName", "the approver") if needs_approver else "you"
    out = {"status": "pending", "approvalId": approval_id, "approver": who}
    if wait_hours:
        out["coolingPeriodEnds"] = cooling_ends.astimezone(IST).strftime("%d %b %Y, %I:%M %p IST")
    return out


@cache
def _sfn():
    return boto3.client("stepfunctions")


def explain_rule(session, args):
    household = store.get_household(session["householdId"])
    rules = RULES.get(household["mode"])
    rule_id = str(args.get("ruleId") or "").upper()
    rule = next((r for r in (rules or {}).get("rules", []) if r["id"] == rule_id), None)
    if not rule:
        raise ToolError(f"No rule {rule_id!r} for this household.")
    return {
        "ruleId": rule["id"],
        "rule": rule["text"],
        "edgeCase": rule.get("edge"),
        "setBy": household.get("approverName", "the household"),
        "setOn": household.get("rulesSetOn"),
        "rulesVersion": rules["household"]["rulesVersion"],
    }


def alert_family(session, args):
    reason = str(args.get("reason") or "").strip()
    if not reason:
        raise ToolError("reason is required")
    _notify("Kavach alert", {"householdId": session["householdId"], "sessionId": session["sessionId"], "reason": reason[:500]})
    return {"status": "sent"}


def _notify(subject: str, body: dict) -> None:
    topic = os.environ.get("APPROVER_TOPIC_ARN")
    if topic:
        boto3.client("sns").publish(TopicArn=topic, Subject=subject[:100], Message=json.dumps(body, default=str, ensure_ascii=False))


TOOLS = {
    f.__name__: f for f in (list_payees, lookup_bill, pay_saved_payee, request_approval, explain_rule, alert_family)
}


def _tool_name(context) -> str:
    custom = getattr(getattr(context, "client_context", None), "custom", None) or {}
    return str(custom.get("bedrockAgentCoreToolName", "")).rsplit("___", 1)[-1]


def lambda_handler(event, context):
    name = _tool_name(context)
    log.info(json.dumps({"tool": name, "args": event}, default=str))
    tool = TOOLS.get(name)
    if tool is None:
        return {"error": f"unknown tool {name!r}"}
    if os.environ.get("TOOL_NAME") and os.environ["TOOL_NAME"] != name:
        return {"error": f"this function serves only {os.environ['TOOL_NAME']}"}
    if not isinstance(event, dict):
        return {"error": "arguments must be an object"}
    try:
        session = store.get_session(event.get("sessionId"))
        return json.loads(json.dumps(tool(session, event), default=str))
    except (ToolError, store.SessionError) as e:
        return {"error": str(e)}
