"""DynamoDB access shared by the tools and the hooks. Table names come from env."""

import os
from datetime import datetime, timezone
from functools import cache

import boto3
from boto3.dynamodb.conditions import Key

TABLES = ("households", "payees", "ledger", "daily_totals", "approvals", "sessions")


@cache
def table(name: str):
    if name not in TABLES:
        raise KeyError(name)
    return boto3.resource("dynamodb").Table(os.environ[f"TABLE_{name.upper()}"])


class SessionError(LookupError):
    pass


def get_session(session_id: str) -> dict:
    if not isinstance(session_id, str) or not session_id:
        raise SessionError("missing sessionId")
    item = table("sessions").get_item(Key={"sessionId": session_id}, ConsistentRead=True).get("Item")
    if not item:
        raise SessionError("unknown session")
    return item


def update_session(session_id: str, fields: dict) -> None:
    names = {f"#k{i}": k for i, k in enumerate(fields)}
    values = {f":v{i}": v for i, v in enumerate(fields.values())}
    table("sessions").update_item(
        Key={"sessionId": session_id},
        UpdateExpression="SET " + ", ".join(f"#k{i} = :v{i}" for i in range(len(fields))),
        ConditionExpression="attribute_exists(sessionId)",
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


def taint_session(session_id: str, source: str) -> None:
    table("sessions").update_item(
        Key={"sessionId": session_id},
        UpdateExpression="SET tainted = :t, taintSource = :s, taintedAt = if_not_exists(taintedAt, :now)",
        ConditionExpression="attribute_exists(sessionId)",
        ExpressionAttributeValues={":t": True, ":s": source[:200], ":now": datetime.now(timezone.utc).isoformat()},
    )


def get_household(household_id: str) -> dict:
    item = table("households").get_item(Key={"householdId": household_id}).get("Item")
    if not item:
        raise SessionError("unknown household")
    return item


def list_payees(household_id: str) -> list[dict]:
    resp = table("payees").query(KeyConditionExpression=Key("householdId").eq(household_id))
    return resp["Items"]


def get_payee(household_id: str, payee_id: str) -> dict | None:
    if not isinstance(payee_id, str) or not payee_id:
        return None
    return table("payees").get_item(Key={"householdId": household_id, "payeeId": payee_id}).get("Item")
