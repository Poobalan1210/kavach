"""L8: human approval, driven by the Step Functions workflow in infra.

  await     the workflow is paused on a task token; store it, alert the approver
  complete  after approval and the cooling wait: activate the payee (and re-sync
            its Cedar allowlist) or execute the approved payment
  reject    declined or timed out

decide (approver_handler) is the only way to resume a waiting workflow, and it
is separate from anything the agent can call: the agent's tools can request an
approval but never grant one. complete re-checks the clock itself, so even an
early or forged resume cannot activate a payee before its cooling period ends.
"""

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from functools import cache

import boto3

from common import audit, cedar, store
from common.money import IST, paise_to_inr

log = logging.getLogger()
log.setLevel(logging.INFO)


class ApprovalError(Exception):
    pass


@cache
def _sns():
    return boto3.client("sns")


@cache
def _sfn():
    return boto3.client("stepfunctions")


def _approval(approval_id: str) -> dict:
    item = store.table("approvals").get_item(Key={"approvalId": approval_id}, ConsistentRead=True).get("Item")
    if not item:
        raise ApprovalError(f"unknown approval {approval_id}")
    return item


def _set(approval_id: str, **fields) -> None:
    names = {f"#k{i}": k for i, k in enumerate(fields)}
    values = {f":v{i}": v for i, v in enumerate(fields.values())}
    store.table("approvals").update_item(
        Key={"approvalId": approval_id},
        UpdateExpression="SET " + ", ".join(f"#k{i} = :v{i}" for i in range(len(fields))),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


def _notify(subject: str, body: dict) -> None:
    topic = os.environ.get("APPROVER_TOPIC_ARN")
    if topic:
        _sns().publish(TopicArn=topic, Subject=subject[:100], Message=json.dumps(body, default=str, ensure_ascii=False))


def await_decision(event: dict) -> dict:
    a = _approval(event["approvalId"])
    _set(a["approvalId"], stepFnToken=event["taskToken"], awaitingSince=datetime.now(timezone.utc).isoformat())
    d = a.get("draft") or {}
    _notify(
        f"Kavach: approval needed ({a['type']})",
        {
            "type": "approval_needed",
            "approvalId": a["approvalId"],
            "householdId": a["householdId"],
            "sessionId": a["sessionId"],
            "kind": a["type"],
            "reason": a.get("reason"),
            "payee": d.get("payeeName"),
            "vpa": d.get("payeeVpa"),
            "amount": paise_to_inr(d["amountPaise"]) if d.get("amountPaise") else None,
            "coolingEndsAt": a.get("coolingEndsAt"),
        },
    )
    return {"ok": True}


def complete(event: dict) -> dict:
    a = _approval(event["approvalId"])
    now = datetime.now(timezone.utc)
    if now < datetime.fromisoformat(a["coolingEndsAt"]):
        raise ApprovalError(f"cooling period for {a['approvalId']} ends {a['coolingEndsAt']}; refusing to complete early")
    if a.get("needsApprover") and a.get("decision") != "approved":
        raise ApprovalError(f"{a['approvalId']} has no approver decision")
    if a.get("completedAt"):
        return {"ok": True, "already": True}

    d = a["draft"]
    if a["type"] == "new_payee":
        store.table("payees").update_item(
            Key={"householdId": a["householdId"], "payeeId": d["payeeId"]},
            UpdateExpression="SET #s = :a, category = :c, activatedAt = :t",
            ConditionExpression="#s = :p",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":a": "active", ":p": "pending", ":c": a.get("category") or "other", ":t": now.isoformat()},
        )
        _sync_cedar()
        result = {"payeeId": d["payeeId"], "status": "active"}
    else:
        txn = {
            "householdId": a["householdId"],
            "txnId": f"txn-{now.astimezone(IST):%Y%m%d%H%M%S}-{uuid.uuid4().hex[:8]}",
            "payeeId": d["payeeId"],
            "payeeName": d.get("payeeName"),
            "amountPaise": int(d["amountPaise"]),
            "status": "paid",
            "ruleHit": f"approved:{a['approvalId']}",
            "note": "approved payment",
            "sessionId": a["sessionId"],
            "createdAt": now.astimezone(IST).isoformat(),
        }
        txn["auditKey"] = audit.record(
            "approved_payment", a["sessionId"], "paid", {"L8": {"decision": a.get("decision"), "decidedBy": a.get("decidedBy")}},
            ["R3"], txn_id=txn["txnId"], approval_id=a["approvalId"], extra={"amountPaise": txn["amountPaise"]},
        )
        store.table("ledger").put_item(Item=txn, ConditionExpression="attribute_not_exists(txnId)")
        store.table("daily_totals").update_item(
            Key={"householdId": a["householdId"], "date": now.astimezone(IST).date().isoformat()},
            UpdateExpression="ADD totalPaise :a",
            ExpressionAttributeValues={":a": txn["amountPaise"]},
        )
        result = {"txnId": txn["txnId"], "status": "paid"}

    _set(a["approvalId"], completedAt=now.isoformat(), result=result)
    audit.record("approval_completed", a["sessionId"], "completed", {"L8": result}, ["R2"], approval_id=a["approvalId"])
    _notify("Kavach: approval completed", {"type": "approval_completed", "approvalId": a["approvalId"], **result})
    return {"ok": True, **result}


def reject(event: dict) -> dict:
    a = _approval(event["approvalId"])
    why = event.get("why", "rejected")
    _set(a["approvalId"], decision=a.get("decision") if a.get("decision") == "rejected" else why, closedAt=datetime.now(timezone.utc).isoformat())
    if a["type"] == "new_payee":
        store.table("payees").update_item(
            Key={"householdId": a["householdId"], "payeeId": a["draft"]["payeeId"]},
            UpdateExpression="SET #s = :r",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":r": "rejected"},
        )
    audit.record("approval_closed", a["sessionId"], why, {"L8": {"decision": why}}, ["R2"], approval_id=a["approvalId"])
    return {"ok": True}


def _sync_cedar() -> None:
    rules = json.loads(cedar.RULES_PATH.read_text())
    households = store.table("households").scan()["Items"]
    payees = store.table("payees").scan()["Items"]
    principals = [p for p in os.environ["CEDAR_PRINCIPALS"].split(",") if p]
    policies = cedar.generate(rules, households, payees, os.environ["GATEWAY_ARN"], principals)
    cedar.apply(policies, os.environ["POLICY_ENGINE_ID"], prune=False)


ACTIONS = {"await": await_decision, "complete": complete, "reject": reject}


def workflow_handler(event, _context):
    log.info(json.dumps({k: v for k, v in event.items() if k != "taskToken"}, default=str))
    return ACTIONS[event["action"]](event)


def approver_handler(event, _context):
    """The approver's decision. Phase 7 puts this behind the approver app's API."""
    try:
        a = _approval(event["approvalId"])
        household = store.get_household(a["householdId"])
        decided_by = event.get("decidedBy")
        if household.get("approverId") == "self" or decided_by != household.get("approverId"):
            raise ApprovalError("only the household's approver can decide")
        if a.get("decision") != "pending" or not a.get("stepFnToken"):
            raise ApprovalError(f"approval is not waiting for a decision (decision={a.get('decision')})")
        approved = event.get("decision") == "approve"
        category = event.get("category") or "other"
        if approved and a["type"] == "new_payee" and category not in {"utility", "family", "shop", "other"}:
            raise ApprovalError(f"category {category!r} can't be approved here")
        _set(a["approvalId"], decision="approved" if approved else "rejected", decidedBy=decided_by,
             decidedAt=datetime.now(timezone.utc).isoformat(), category=category)
        audit.record("approval_decision", a["sessionId"], "approved" if approved else "rejected",
                     {"L8": {"decidedBy": decided_by}}, ["R2"], approval_id=a["approvalId"])
        _sfn().send_task_success(taskToken=a["stepFnToken"], output=json.dumps({"approved": approved}))
        return {"ok": True, "decision": "approved" if approved else "rejected", "coolingEndsAt": a.get("coolingEndsAt")}
    except ApprovalError as e:
        return {"ok": False, "error": str(e)}
