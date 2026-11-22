from datetime import datetime, timedelta, timezone

import pytest
from conftest import KAMALA_SESSION, PRIYA_SESSION


def new_payee(tools, session=KAMALA_SESSION):
    return tools("request_approval", sessionId=session, type="new_payee", reason="New plumber",
                 payeeName="Kumar Plumbing", payeeVpa="kumar.plumber@ybl", amountInr=1500)


def approval_row(db, approval_id):
    return db.Table("kavach-approvals").get_item(Key={"approvalId": approval_id})["Item"]


def test_new_payee_is_pending_with_24h_cooling(tools):
    r = new_payee(tools)
    a = approval_row(tools.ddb, r["approvalId"])
    payee = tools.ddb.Table("kavach-payees").get_item(Key={"householdId": "hh-kamala", "payeeId": a["draft"]["payeeId"]})["Item"]
    assert r["approver"] == "Arjun" and payee["status"] == "pending" and a["needsApprover"] is True
    hours = (datetime.fromisoformat(a["coolingEndsAt"]) - datetime.fromisoformat(a["requestedAt"])) / timedelta(hours=1)
    assert hours == 24 and a["executionArn"]
    # R1/R2: the pending payee can't be paid.
    assert "error" in tools("pay_saved_payee", payeeId=payee["payeeId"], amountInr=1500)


@pytest.mark.parametrize("vpa", ["", "not-a-vpa", "a@", "@bank", "x y@bank"])
def test_new_payee_needs_valid_vpa(tools, vpa):
    assert "error" in tools("request_approval", type="new_payee", reason="x", payeeName="K", payeeVpa=vpa)


def test_self_protect_has_no_approver_but_still_waits(tools):
    r = tools("request_approval", sessionId=PRIYA_SESSION, type="over_limit", reason="Big rent", payeeId="p-landlord", amountInr=30000)
    a = approval_row(tools.ddb, r["approvalId"])
    assert a["needsApprover"] is False and r["approver"] == "you" and "coolingPeriodEnds" in r


@pytest.fixture
def waiting(tools, approvals):
    r = new_payee(tools)
    approvals.workflow_handler({"action": "await", "approvalId": r["approvalId"], "taskToken": "tok-1"}, None)
    return r["approvalId"]


@pytest.mark.parametrize("who", ["kamala", None, "self", "ARJUN"])
def test_only_the_approver_can_decide(approvals, waiting, who):
    assert approvals.approver_handler({"approvalId": waiting, "decision": "approve", "decidedBy": who}, None)["ok"] is False


def test_approver_cannot_approve_an_investment_category(approvals, waiting):
    r = approvals.approver_handler({"approvalId": waiting, "decision": "approve", "decidedBy": "arjun", "category": "trading"}, None)
    assert r["ok"] is False


def test_approve_then_complete_only_after_cooling(approvals, waiting, monkeypatch, db):
    sent = []
    monkeypatch.setattr(approvals, "_sfn", lambda: type("S", (), {"send_task_success": lambda self, **kw: sent.append(kw)})())
    synced = []
    monkeypatch.setattr(approvals, "_sync_cedar", lambda: synced.append(True))
    r = approvals.approver_handler({"approvalId": waiting, "decision": "approve", "decidedBy": "arjun", "category": "shop"}, None)
    assert r["ok"] and sent and '"approved": true' in sent[0]["output"]

    with pytest.raises(approvals.ApprovalError, match="cooling period"):
        approvals.workflow_handler({"action": "complete", "approvalId": waiting}, None)

    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    db.Table("kavach-approvals").update_item(Key={"approvalId": waiting}, UpdateExpression="SET coolingEndsAt = :t", ExpressionAttributeValues={":t": past})
    out = approvals.workflow_handler({"action": "complete", "approvalId": waiting}, None)
    payee = db.Table("kavach-payees").get_item(Key={"householdId": "hh-kamala", "payeeId": out["payeeId"]})["Item"]
    assert payee["status"] == "active" and payee["category"] == "shop" and synced


def test_complete_without_decision_refused(approvals, waiting, db):
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    db.Table("kavach-approvals").update_item(Key={"approvalId": waiting}, UpdateExpression="SET coolingEndsAt = :t", ExpressionAttributeValues={":t": past})
    with pytest.raises(approvals.ApprovalError, match="no approver decision"):
        approvals.workflow_handler({"action": "complete", "approvalId": waiting}, None)


def test_reject_marks_payee_rejected(approvals, waiting, db):
    approvals.workflow_handler({"action": "reject", "approvalId": waiting, "why": "expired"}, None)
    a = approval_row(db, waiting)
    payee = db.Table("kavach-payees").get_item(Key={"householdId": "hh-kamala", "payeeId": a["draft"]["payeeId"]})["Item"]
    assert a["decision"] == "expired" and payee["status"] == "rejected"
