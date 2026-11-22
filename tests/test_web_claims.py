import json

import check_web_claims


def test_site_scenarios_match_benchmark():
    assert check_web_claims.check() == []


def test_a_changed_fact_is_caught():
    claims = json.loads(check_web_claims.CLAIMS.read_text())
    claims["scenarios"]["split"]["c0Breached"] = 2
    claims["scenarios"]["approver"]["kavachPaid"] = []
    problems = check_web_claims.check(claims)
    assert any("split.c0Breached" in p for p in problems)
    assert any("approver.kavachPaid" in p for p in problems)
