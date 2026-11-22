from common import timeline


def inv(rules=(), l2=None, score=0.1, outcome="clear"):
    return {"kind": "invocation", "outcome": outcome, "ruleIds": list(rules), "timestamp": "1",
            "layers": {"L2": l2 or {"topics": [], "promptAttack": False}, "L3": {"score": score}}}


def gate(decision="allow", tool="payments___pay_saved_payee", reason=None):
    return {"kind": "tool_gate", "outcome": decision, "tool": tool, "timestamp": "2",
            "layers": {"L4": {"decision": decision, **({"reason": reason} if reason else {})}}}


def pay(outcome="paid", rule=None):
    return {"kind": "payment", "outcome": outcome, "ruleIds": [rule] if rule else [], "timestamp": "3",
            "layers": {"L6": {"outcome": outcome, "message": "over the limit" if rule else None}}}


def by_id(layers):
    return {l["id"]: l for l in layers}


def test_clean_bill_payment_passes_every_reached_layer():
    t = by_id(timeline.build([inv(), gate(tool="bills___lookup_bill"), gate(), pay()]))
    assert [t[k]["status"] for k in ("L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9")] == \
        ["pass", "pass", "pass", "pass", "pass", "pass", "pass", "idle", "pass"]
    assert timeline.outcome(list(t.values())) == "clear"


def test_digital_arrest_blocks_at_l2_and_l3():
    t = by_id(timeline.build([inv(rules=["R6"], l2={"topics": ["official_demands"]}, score=1.0, outcome="paused")]))
    assert t["L2"]["status"] == "block" and t["L3"]["status"] == "flag"
    assert t["L4"]["status"] == "idle" and t["L9"]["detail"].startswith("1 decision")


def test_cedar_denial_is_inferred_from_a_missing_payment():
    t = by_id(timeline.build([inv(), gate()]))
    assert t["L5"]["status"] == "block" and t["L6"]["status"] == "idle"


def test_l4_and_l6_blocks_carry_reasons():
    t = by_id(timeline.build([inv(), gate("deny", reason="R1: only saved, active payees")]))
    assert t["L4"]["status"] == "block" and t["L4"]["detail"].startswith("R1")
    t = by_id(timeline.build([inv(), gate(), pay("blocked", "R4")]))
    assert t["L6"]["status"] == "block" and t["L6"]["detail"].startswith("R4")


def test_prompt_attack_flags_l2():
    t = by_id(timeline.build([inv(rules=["R9"], l2={"topics": [], "promptAttack": True}, outcome="tainted")]))
    assert t["L2"]["status"] == "flag" and "R9" in t["L2"]["detail"]
