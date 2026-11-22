import importlib
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lambdas"))
sys.path.insert(0, str(ROOT / "scripts"))

os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")

KEYS = {
    "households": [("householdId", "HASH")],
    "payees": [("householdId", "HASH"), ("payeeId", "RANGE")],
    "ledger": [("householdId", "HASH"), ("txnId", "RANGE")],
    "daily_totals": [("householdId", "HASH"), ("date", "RANGE")],
    "approvals": [("approvalId", "HASH")],
    "sessions": [("sessionId", "HASH")],
}
KAMALA_SESSION = "kv-hh-kamala-00000000-0000-4000-8000-000000000001"
PRIYA_SESSION = "kv-hh-priya-00000000-0000-4000-8000-000000000002"


@pytest.fixture
def db(monkeypatch):
    import boto3
    from moto import mock_aws

    import build_rules
    from seed_data import households, ledger, payees

    build_rules.main()
    with mock_aws():
        ddb = boto3.resource("dynamodb")
        for name, keys in KEYS.items():
            monkeypatch.setenv(f"TABLE_{name.upper()}", f"kavach-{name}")
            ddb.create_table(
                TableName=f"kavach-{name}",
                KeySchema=[{"AttributeName": k, "KeyType": t} for k, t in keys],
                AttributeDefinitions=[{"AttributeName": k, "AttributeType": "S"} for k, _ in keys],
                BillingMode="PAY_PER_REQUEST",
            )
        for name, rows in (("households", households()), ("payees", payees()), ("ledger", ledger())):
            for row in rows:
                ddb.Table(f"kavach-{name}").put_item(Item=row)
        for sid, hh in ((KAMALA_SESSION, "hh-kamala"), (PRIYA_SESSION, "hh-priya")):
            ddb.Table("kavach-sessions").put_item(Item={"sessionId": sid, "householdId": hh, "tainted": False})

        sfn = boto3.client("stepfunctions")
        role = "arn:aws:iam::123456789012:role/sfn"
        definition = json.dumps({"StartAt": "W", "States": {"W": {"Type": "Pass", "End": True}}})
        arn = sfn.create_state_machine(name="approvals", definition=definition, roleArn=role)["stateMachineArn"]
        monkeypatch.setenv("APPROVAL_STATE_MACHINE_ARN", arn)
        monkeypatch.delenv("AUDIT_BUCKET", raising=False)

        from common import store

        store.table.cache_clear()
        yield ddb


@pytest.fixture
def tools(db):
    handler = importlib.reload(importlib.import_module("tools.handler"))

    def call(tool, **args):
        ctx = SimpleNamespace(client_context=SimpleNamespace(custom={"bedrockAgentCoreToolName": f"kv___{tool}"}))
        return handler.lambda_handler({"sessionId": KAMALA_SESSION, **args}, ctx)

    call.ddb = db
    call.handler = handler
    return call


@pytest.fixture
def hook(db):
    return importlib.reload(importlib.import_module("hook_tool.handler"))


@pytest.fixture
def approvals(db):
    return importlib.reload(importlib.import_module("approvals.handler"))


@pytest.fixture
def invocation(db):
    return importlib.reload(importlib.import_module("hook_invocation.handler"))
