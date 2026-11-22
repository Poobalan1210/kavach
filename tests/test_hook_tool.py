import json
from pathlib import Path

import pytest
from conftest import KAMALA_SESSION, PRIYA_SESSION

KAVACH_TOOLS = ["alert_family", "explain_rule", "list_payees", "lookup_bill", "pay_saved_payee", "request_approval"]


def ev(tool_name="pay_saved_payee", tool_type="agentcore_gateway", event="before_tool_call", tool_input=None, session=KAMALA_SESSION):
    return {
        "hookEventId": "e1",
        "name": "kavach_tool_gate",
        "event": event,
        "sessionId": session,
        "context": {
            "toolName": tool_name,
            "toolType": tool_type,
            "toolInput": {"sessionId": session, "payeeId": "p-tangedco", "amountInr": 100} if tool_input is None else tool_input,
            "toolUseId": "t1",
        },
    }


@pytest.mark.parametrize("name", KAVACH_TOOLS)
def test_kavach_tools_allowed(hook, name):
    assert hook.lambda_handler(ev(name), None) == {"decision": "allow"}


def test_gateway_prefixed_name_allowed(hook):
    assert hook.lambda_handler(ev("bills___lookup_bill"), None)["decision"] == "allow"


@pytest.mark.parametrize("name", ["shell", "read", "write", "add_payee", "set_limit", "read_sms", "pay_saved_payee2"])
def test_unknown_tools_denied(hook, name):
    assert hook.lambda_handler(ev(name), None)["decision"] == "deny"


def test_builtin_type_denied_even_with_kavach_name(hook):
    assert hook.lambda_handler(ev("pay_saved_payee", tool_type="builtin"), None)["decision"] == "deny"


@pytest.mark.parametrize(
    "event",
    [
        {},
        None,
        "garbage",
        {"event": "before_tool_call"},
        {"event": "before_tool_call", "context": "x"},
        {"event": "before_tool_call", "context": {"toolType": "inline_function"}},
    ],
)
def test_malformed_events_fail_closed(hook, event):
    assert hook.lambda_handler(event, None)["decision"] == "deny"


def test_wrong_event_type_denied(hook):
    assert hook.lambda_handler(ev(event="after_tool_call"), None)["decision"] == "deny"


def test_env_can_narrow_but_not_widen(hook, monkeypatch):
    monkeypatch.setenv("ALLOWED_TOOLS", "lookup_bill,shell")
    assert hook.lambda_handler(ev("lookup_bill"), None)["decision"] == "allow"
    assert hook.lambda_handler(ev("pay_saved_payee"), None)["decision"] == "deny"
    assert hook.lambda_handler(ev("shell", tool_type="inline_function"), None)["decision"] == "deny"


@pytest.mark.parametrize(
    "tool_input",
    [{}, {"sessionId": PRIYA_SESSION}, {"sessionId": None}, "not json", ["list"], {"sessionId": KAMALA_SESSION.upper()}],
)
def test_session_binding_fails_closed(hook, tool_input):
    assert hook.lambda_handler(ev("list_payees", tool_input=tool_input), None)["decision"] == "deny"


def test_session_binding_accepts_json_string_input(hook):
    raw = json.dumps({"sessionId": KAMALA_SESSION})
    assert hook.lambda_handler(ev("list_payees", tool_input=raw), None) == {"decision": "allow"}


def test_unknown_session_denied(hook):
    ghost = "kv-hh-kamala-99999999-0000-4000-8000-000000000009"
    assert hook.lambda_handler(ev("list_payees", session=ghost, tool_input={"sessionId": ghost}), None)["decision"] == "deny"


def test_session_prefix_must_match_household(hook, db):
    # A session row for Priya under an ID that claims Kamala's household.
    forged = "kv-hh-kamala-00000000-0000-4000-8000-00000000000f"
    db.Table("kavach-sessions").put_item(Item={"sessionId": forged, "householdId": "hh-priya", "tainted": False})
    event = ev("pay_saved_payee", session=forged, tool_input={"sessionId": forged, "payeeId": "p-amma", "amountInr": 1})
    assert "household" in hook.lambda_handler(event, None)["reason"]


@pytest.mark.parametrize("payee", ["p-scammer", "p-bescom", "", None])
def test_r1_payee_allowlist(hook, payee):
    event = ev("pay_saved_payee", tool_input={"sessionId": KAMALA_SESSION, "payeeId": payee, "amountInr": 100})
    assert hook.lambda_handler(event, None)["reason"].startswith("R1")


def test_r1_pending_payee_denied(hook, db):
    db.Table("kavach-payees").put_item(
        Item={"householdId": "hh-kamala", "payeeId": "p-plumber", "name": "Kumar", "vpa": "k@ybl", "category": "shop", "status": "pending"}
    )
    event = ev("pay_saved_payee", tool_input={"sessionId": KAMALA_SESSION, "payeeId": "p-plumber", "amountInr": 1500})
    assert hook.lambda_handler(event, None)["reason"].startswith("R1")


@pytest.mark.parametrize("flag,rule", [("tainted", "R10"), ("paused", "R7")])
def test_tainted_or_paused_session_blocks_payment_only(hook, db, flag, rule):
    db.Table("kavach-sessions").update_item(
        Key={"sessionId": KAMALA_SESSION}, UpdateExpression=f"SET {flag} = :t", ExpressionAttributeValues={":t": True}
    )
    assert hook.lambda_handler(ev("pay_saved_payee"), None)["reason"].startswith(rule)
    assert hook.lambda_handler(ev("lookup_bill"), None)["decision"] == "allow"


def test_store_failure_fails_closed(hook, monkeypatch):
    def boom(_):
        raise RuntimeError("dynamodb down")

    monkeypatch.setattr(hook.store, "get_session", boom)
    assert hook.lambda_handler(ev("list_payees"), None)["decision"] == "deny"


def test_real_harness_payload(hook):
    # Captured from the live spike harness (Phase 1); session and tool swapped in.
    event = json.loads((Path(__file__).parent / "fixtures/before_tool_call.json").read_text())
    assert hook.lambda_handler(event, None)["decision"] == "deny"  # spike_echo isn't a Kavach tool
    event["sessionId"] = KAMALA_SESSION
    event["context"]["toolName"] = "bills___lookup_bill"
    event["context"]["toolInput"] = {"sessionId": KAMALA_SESSION, "payeeId": "p-tangedco"}
    assert hook.lambda_handler(event, None) == {"decision": "allow"}
