import importlib
import json

import pytest

from common.harness import Turn


def ev(method, resource, user="kamala", groups="senior", household="hh-kamala", body=None, params=None, path=None):
    claims = {"cognito:username": user, "cognito:groups": groups}
    if household:
        claims["custom:householdId"] = household
    return {"httpMethod": method, "resource": resource, "body": json.dumps(body or {}),
            "queryStringParameters": params, "pathParameters": path,
            "requestContext": {"authorizer": {"claims": claims}}}


@pytest.fixture
def api(db, monkeypatch):
    monkeypatch.setenv("HARNESS_ARN", "arn:harness")
    mod = importlib.reload(importlib.import_module("api.handler"))
    calls = []

    def fake_invoke(arn, sid, prompt, messages, region=None):
        calls.append((sid, messages[0]["content"][0]["text"]))
        return Turn(text="", seconds=0.1)

    monkeypatch.setattr(mod.harness, "invoke", fake_invoke)
    monkeypatch.setattr(mod.timeline, "records_since", lambda sid, since: [])
    mod.calls = calls
    return mod


def call(api, *a, **kw):
    r = api.lambda_handler(ev(*a, **kw), None)
    return r["statusCode"], json.loads(r["body"])


def test_senior_session_and_chat_with_fallback_reply(api):
    code, s = call(api, "POST", "/session", body={"language": "ta"})
    assert code == 200 and s["householdId"] == "hh-kamala" and s["sessionId"].startswith("kv-hh-kamala-")
    code, t = call(api, "POST", "/chat", body={"sessionId": s["sessionId"], "text": "மின்சார கட்டணத்தை கட்டு"})
    assert code == 200 and "பணமும்" in t["reply"] and len(t["layers"]) == 9


def test_senior_cannot_open_another_household(api):
    assert call(api, "POST", "/session", body={"householdId": "hh-priya"})[0] == 403
    assert call(api, "GET", "/activity", params={"householdId": "hh-priya"})[0] == 403


def test_judge_can_pick_a_household(api):
    code, s = call(api, "POST", "/session", user="judge1", groups="judge", household=None, body={"householdId": "hh-priya"})
    assert code == 200 and s["householdId"] == "hh-priya"


def test_session_is_private_to_its_starter(api):
    _, s = call(api, "POST", "/session")
    code, _ = call(api, "POST", "/chat", user="judge1", groups="judge", household=None, body={"sessionId": s["sessionId"], "text": "hi"})
    assert code == 403


def test_turn_limit(api, db):
    _, s = call(api, "POST", "/session")
    db.Table("kavach-sessions").update_item(Key={"sessionId": s["sessionId"]}, UpdateExpression="SET turns = :n",
                                           ExpressionAttributeValues={":n": api.MAX_TURNS_PER_SESSION})
    assert call(api, "POST", "/chat", body={"sessionId": s["sessionId"], "text": "hi"})[0] == 429


def test_approver_only_decides(api, monkeypatch):
    assert call(api, "POST", "/approvals/{id}", path={"id": "apr-1"}, body={"decision": "approve"})[0] == 403
    assert call(api, "POST", "/approvals/{id}", user="arjun", groups="approver", path={"id": "apr-nope"}, body={"decision": "approve"})[0] == 404


def test_unsigned_in_and_unknown_route(api):
    r = api.lambda_handler({"httpMethod": "GET", "resource": "/rules", "requestContext": {}}, None)
    assert r["statusCode"] == 401
    assert call(api, "DELETE", "/rules")[0] == 404


def test_rules_and_activity(api):
    code, r = call(api, "GET", "/rules")
    assert code == 200 and r["mode"] == "guardian" and any(x["id"] == "R3" for x in r["rules"])
    code, a = call(api, "GET", "/activity")
    assert code == 200 and a["ledger"] and a["ledger"][0]["amount"].startswith("₹")


def demo(api, method, resource, body=None, params=None, path=None):
    r = api.lambda_handler({"httpMethod": method, "resource": "/demo" + resource, "body": json.dumps(body or {}),
                            "queryStringParameters": params, "pathParameters": path, "requestContext": {}}, None)
    return r["statusCode"], json.loads(r["body"])


def test_demo_routes_need_no_sign_in_and_default_to_kamala(api):
    code, s = demo(api, "POST", "/session", body={"language": "en"})
    assert code == 200 and s["householdId"] == "hh-kamala"
    assert demo(api, "POST", "/chat", body={"sessionId": s["sessionId"], "text": "pay the electricity bill"})[0] == 200
    assert demo(api, "GET", "/activity")[0] == 200
    code, s = demo(api, "POST", "/session", body={"householdId": "hh-priya"})
    assert code == 200 and s["householdId"] == "hh-priya"


def test_demo_is_limited_to_demo_households(api):
    assert demo(api, "POST", "/session", body={"householdId": "hh-someone"})[0] == 403
    assert demo(api, "GET", "/activity", params={"householdId": "hh-someone"})[0] == 403


def test_demo_daily_turn_cap(api, db, monkeypatch):
    monkeypatch.setattr(api, "DEMO_DAILY_TURNS", 1)
    _, s = demo(api, "POST", "/session")
    assert demo(api, "POST", "/chat", body={"sessionId": s["sessionId"], "text": "hi"})[0] == 200
    code, body = demo(api, "POST", "/chat", body={"sessionId": s["sessionId"], "text": "hi"})
    assert code == 429 and "today's limit" in body["error"]


def test_chat_rejects_non_session_ids(api):
    assert demo(api, "POST", "/chat", body={"sessionId": "demo-quota#2026-01-01", "text": "hi"})[0] == 404


def test_demo_decision_is_made_as_the_household_approver(api, db, monkeypatch):
    db.Table("kavach-approvals").put_item(Item={"approvalId": "apr-demo", "householdId": "hh-kamala", "decision": "pending"})
    sent = {}

    class FakeLambda:
        def invoke(self, FunctionName, Payload):
            sent.update(json.loads(Payload))
            return {"Payload": __import__("io").BytesIO(b'{"ok": true, "decision": "approved", "coolingEndsAt": "x"}')}

    monkeypatch.setenv("APPROVER_FN", "fn")
    monkeypatch.setattr(api, "_lambda", lambda: FakeLambda())
    code, _ = demo(api, "POST", "/approvals/{id}", body={"decision": "approve"}, path={"id": "apr-demo"})
    assert code == 200 and sent["decidedBy"] == "arjun"
