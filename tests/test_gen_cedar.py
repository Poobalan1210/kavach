import importlib.util
import json
from pathlib import Path

import build_rules
from seed_data import households, payees

_spec = importlib.util.spec_from_file_location("gen_cedar", Path(__file__).resolve().parents[1] / "policy/gen_cedar.py")
gen_cedar = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen_cedar)

GW = "arn:aws:bedrock-agentcore:us-east-1:111122223333:gateway/gw"
ROLE = "arn:aws:sts::111122223333:assumed-role/harness"


def policies(payee_rows=None):
    build_rules.main()
    rules = json.loads(build_rules.OUT.read_text())
    return gen_cedar.generate(rules, households(), payee_rows or payees(), GW, [ROLE])


def test_limits_come_from_rules_yaml():
    p = policies()
    assert 'lessThanOrEqual(decimal("10000.00"))' in p["hh_kamala_pay"]
    assert 'greaterThan(decimal("10000.00"))' in p["hh_kamala_forbid_over_limit"]
    assert 'lessThanOrEqual(decimal("25000.00"))' in p["hh_priya_pay"]
    assert 'lessThanOrEqual(decimal("5000.00"))' in p["hh_priya_pay_held_category"]


def test_payee_allowlists_are_per_household_and_category():
    p = policies()
    assert '"p-tangedco"' in p["hh_kamala_pay"] and '"p-bescom"' not in p["hh_kamala_pay"]
    assert '"p-broker"' not in p["hh_priya_pay"] and '"p-broker"' in p["hh_priya_pay_held_category"]


def test_guardian_investment_payee_gets_a_forbid_and_no_permit():
    rows = payees() + [
        {"householdId": "hh-kamala", "payeeId": "p-vip", "name": "VIP desk", "vpa": "vip@ybl", "category": "trading", "status": "active"}
    ]
    p = policies(rows)
    assert '"p-vip"' in p["hh_kamala_forbid_blocked_category"]
    assert '"p-vip"' not in p["hh_kamala_pay"]


def test_pending_payees_are_not_permitted():
    rows = payees() + [
        {"householdId": "hh-kamala", "payeeId": "p-plumber", "name": "Kumar", "vpa": "k@ybl", "category": "shop", "status": "pending"}
    ]
    assert '"p-plumber"' not in policies(rows)["hh_kamala_pay"]


def test_every_permit_names_the_principal_and_every_statement_the_gateway():
    for name, stmt in policies().items():
        assert f'AgentCore::Gateway::"{GW}"' in stmt
        if stmt.lstrip("/ ").split("\n", 1)[-1].startswith("permit") or "\npermit(" in stmt:
            assert ROLE in stmt, name
