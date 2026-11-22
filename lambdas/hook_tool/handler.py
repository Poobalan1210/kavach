"""L4: before_tool_call hook. Fail-closed gate in front of every Kavach tool.

Checks, in order:
  - the tool is one of the six Kavach tools, of a Kavach tool type (no built-ins);
  - session binding: the Gateway passes tools only their arguments, so each tool
    takes a sessionId argument, and it must equal the harness session the call
    came from; that session must exist, and its ID prefix must name its
    household (Cedar, L5, selects limits from that prefix);
  - R1: payee tools name an active payee of the session's household;
  - R10 / R7: no payments from a tainted or paused session.

Any error, unknown event or unexpected shape returns deny; the harness's
failureMode=deny covers timeouts and crashes.
"""

import json
import logging
import os

from common import audit, sessions, store

log = logging.getLogger()
log.setLevel(logging.INFO)

KAVACH_TOOLS = frozenset(
    {"list_payees", "lookup_bill", "pay_saved_payee", "request_approval", "explain_rule", "alert_family"}
)
PAYEE_TOOLS = frozenset({"lookup_bill", "pay_saved_payee"})
# Only tools Kavach itself defines; harness built-ins (shell, read, write...) never pass.
ALLOWED_TOOL_TYPES = frozenset({"agentcore_gateway", "inline_function"})


def _allowed_tools() -> frozenset:
    raw = os.environ.get("ALLOWED_TOOLS")
    if not raw:
        return KAVACH_TOOLS
    # The env var can narrow the set, never widen it.
    return frozenset(t.strip() for t in raw.split(",") if t.strip()) & KAVACH_TOOLS


def allow() -> dict:
    return {"decision": "allow"}


def deny(reason: str) -> dict:
    return {"decision": "deny", "reason": reason[:1024]}


def tool_base_name(name: str) -> str:
    # Gateway tools are exposed as "<target>___<tool>".
    return name.rsplit("___", 1)[-1]


def decide(event: dict) -> dict:
    if event.get("event") != "before_tool_call":
        return deny(f"kavach_tool_gate: unexpected event {event.get('event')!r}")
    ctx = event.get("context")
    if not isinstance(ctx, dict):
        return deny("kavach_tool_gate: missing context")

    name = ctx.get("toolName")
    tool_type = ctx.get("toolType")
    if not isinstance(name, str) or not name:
        return deny("kavach_tool_gate: missing toolName")
    if tool_type not in ALLOWED_TOOL_TYPES:
        return deny(f"kavach_tool_gate: tool type {tool_type!r} is not allowed")
    tool = tool_base_name(name)
    if tool not in _allowed_tools():
        return deny(f"kavach_tool_gate: tool {name!r} is not on the allowlist")

    tool_input = ctx.get("toolInput")
    if isinstance(tool_input, str):
        tool_input = json.loads(tool_input)
    if not isinstance(tool_input, dict):
        return deny("kavach_tool_gate: tool input is not an object")
    session_id = event.get("sessionId")
    if not session_id or tool_input.get("sessionId") != session_id:
        return deny("kavach_tool_gate: sessionId does not match this session")

    try:
        session = store.get_session(session_id)
    except store.SessionError:
        return deny("kavach_tool_gate: unknown session")
    household_id = session.get("householdId")
    if not household_id or sessions.household_of(session_id) != household_id:
        return deny("kavach_tool_gate: session ID does not match its household")

    if tool in PAYEE_TOOLS:
        payee = store.get_payee(household_id, tool_input.get("payeeId"))
        if not payee or payee.get("status") != "active":
            return deny("R1: only saved, active payees of this household can be used")

    if tool == "pay_saved_payee":
        if session.get("tainted"):
            return deny("R10: untrusted content was read in this session; payments need the approver")
        if session.get("paused"):
            return deny(f"{session.get('pauseRule') or 'R7'}: this session is paused for safety; the approver has been told")
    return allow()


def _rule_of(result: dict) -> list:
    reason = result.get("reason") or ""
    head = reason.split(":", 1)[0]
    return [head] if head[:1] in "RS" and head[1:].isdigit() else []


def lambda_handler(event, _context):
    try:
        result = decide(event)
        ctx = event.get("context") or {}
        tool_input = ctx.get("toolInput")
        audit.record(
            "tool_gate",
            event.get("sessionId"),
            result["decision"],
            {"L4": result},
            _rule_of(result),
            tool=ctx.get("toolName"),
            tool_input=tool_input if isinstance(tool_input, dict) else {"raw": str(tool_input)[:500]},
            extra={"toolUseId": ctx.get("toolUseId")},
        )
    except Exception:
        log.exception("kavach_tool_gate failed; denying")
        result = deny("kavach_tool_gate: internal error, failing closed")
    log.info(json.dumps({"sessionId": event.get("sessionId") if isinstance(event, dict) else None, "result": result}))
    return result
