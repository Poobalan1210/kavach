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


def steps(records, **kw):
    return [(x["layer"], x["status"]) for x in timeline.trace(records, **kw)]


def test_trace_of_a_bill_payment_shows_each_input_and_output():
    g = gate(tool="payments___pay_saved_payee")
    g["input"] = {"payeeId": "p-airtel", "amountInr": 299.0, "sessionId": "kv-hh-kamala-x"}
    p = pay() | {"amountPaise": 29900, "payeeId": "p-airtel"}
    t = timeline.trace([inv(), g, p], names={"p-airtel": "Airtel Mobile"})
    assert [(x["layer"], x["status"]) for x in t] == [
        ("L2", "pass"), ("L3", "pass"), ("L4", "pass"), ("L5", "pass"), ("L6", "pass"), ("L7", "pass"), ("L9", "pass")]
    assert t[2]["input"] == "pay_saved_payee(payeeId: p-airtel, amountInr: 299)"
    assert t[3]["input"] == "₹299 to Airtel Mobile" and t[4]["input"] == "₹299 to Airtel Mobile"


def test_trace_of_a_digital_arrest_shows_the_pause():
    r = inv(rules=["R6"], l2={"topics": ["official_demands"]}, score=0.95, outcome="paused")
    r["layers"]["L3"] |= {"urgency": 1, "secrecy": 1, "authority": 1, "threat": 0, "reason": "Demands money, tells her to hide it"}
    r["alerted"] = True
    t = timeline.trace([r])
    assert [(x["layer"], x["status"]) for x in t] == [("L2", "block"), ("L3", "flag"), ("L4", "block"), ("L9", "pass")]
    assert "official demands" in t[0]["output"] and "urgency, secrecy, authority" in t[1]["output"]
    assert "Arjun alerted" in t[2]["output"]


def test_trace_reports_cedar_refusal_when_no_payment_follows():
    assert steps([inv(), gate()])[-3:] == [("L5", "block"), ("L7", "pass"), ("L9", "pass")]


def test_trace_of_an_approval_request_is_short_and_in_ist():
    a = {"kind": "approval_requested", "outcome": "pending", "timestamp": "4",
         "input": {"payeeName": "Ravi", "payeeVpa": "ravi@okicici", "amountInr": 1500.0, "sessionId": "kv-x"},
         "layers": {"L8": {"coolingEndsAt": "2026-11-23T14:23:00+00:00"}}}
    step = [x for x in timeline.trace([a]) if x["layer"] == "L8"][0]
    assert step["input"] == "New payee Ravi (ravi@okicici), ₹1,500"
    assert step["output"] == "Sent to Arjun · can't be paid before 23 Nov, 7:53 PM IST"
