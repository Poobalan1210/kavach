"""App API behind API Gateway + Cognito: the senior's app, the approver's app, the Shield Console.

Identity comes only from Cognito claims (never from the request body):
  cognito:groups      senior | approver | judge
  custom:householdId  the household a senior or approver belongs to (judges may pick any)

Routes
  POST /session              start a Kavach session                 senior, judge
  POST /chat                 one turn + what each layer did           senior, judge
  GET  /activity             ledger, held and blocked attempts, approvals   all (own household)
  POST /approvals/{id}       approve or reject                        approver only
  GET  /rules                the household's rules in plain language  all
  GET  /audit/{txnId}        the signed record, verified with KMS     all (own household)
"""

import json
import logging
import os
from datetime import datetime, timezone
from decimal import Decimal
from functools import cache

import boto3
from boto3.dynamodb.conditions import Key

from common import audit, harness, sessions, store, timeline
from common.money import paise_to_inr
from common.rules import limits_for

log = logging.getLogger()
log.setLevel(logging.INFO)

RULES = json.loads((harness.PROMPT_PATH.parent / "rules.generated.json").read_text())
MAX_TURNS_PER_SESSION = 30

# The public demo (/demo/* routes, no sign-in) acts as one visitor who can be Kamala, Arjun or a judge,
# but only in the two demo households, and with a hard cap on model turns per UTC day so a
# public page can't run up the bill.
DEMO_HOUSEHOLDS = {"hh-kamala", "hh-priya"}
DEMO_DAILY_TURNS = int(os.environ.get("DEMO_DAILY_TURNS", "600"))
FALLBACK_REPLY = {
    "en": "I've paused here to keep you safe. Nothing has been paid. You can ask me again, or call your family.",
    "hi": "आपकी सुरक्षा के लिए मैंने यहाँ रोक दिया है। कोई भुगतान नहीं हुआ है। आप फिर से पूछ सकते हैं या परिवार को फ़ोन कर सकते हैं।",
    "ta": "உங்கள் பாதுகாப்புக்காக இங்கே நிறுத்தியுள்ளேன். எந்தப் பணமும் அனுப்பப்படவில்லை. மீண்டும் கேட்கலாம், அல்லது குடும்பத்தினரை அழைக்கலாம்.",
}


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status, self.message = status, message


@cache
def _lambda():
    return boto3.client("lambda")


def _json(status: int, body) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "*")},
        "body": json.dumps(body, default=_default, ensure_ascii=False),
    }


def _default(o):
    if isinstance(o, Decimal):
        return int(o) if o == o.to_integral_value() else float(o)
    return str(o)


def _caller(event) -> dict:
    claims = ((event.get("requestContext") or {}).get("authorizer") or {}).get("claims") or {}
    groups = claims.get("cognito:groups") or ""
    groups = set(groups if isinstance(groups, list) else groups.replace("[", "").replace("]", "").replace(",", " ").split())
    user = claims.get("cognito:username") or claims.get("username")
    if not user:
        raise ApiError(401, "not signed in")
    return {"user": user, "groups": groups, "householdId": claims.get("custom:householdId")}


def _demo_caller(body: dict, params: dict) -> dict:
    household = body.get("householdId") or params.get("householdId") or "hh-kamala"
    if household not in DEMO_HOUSEHOLDS:
        raise ApiError(403, "the public demo covers Kamala's and Priya's households only")
    return {"user": "demo-visitor", "groups": {"senior", "approver", "judge"}, "householdId": household, "demo": True}


def _spend_demo_turn() -> None:
    key = f"demo-quota#{datetime.now(timezone.utc).date().isoformat()}"
    try:
        store.table("sessions").update_item(
            Key={"sessionId": key}, UpdateExpression="ADD turns :one",
            ConditionExpression="attribute_not_exists(turns) OR turns < :max",
            ExpressionAttributeValues={":one": 1, ":max": DEMO_DAILY_TURNS},
        )
    except store.table("sessions").meta.client.exceptions.ConditionalCheckFailedException as e:
        raise ApiError(429, "The live demo has reached today's limit. The recorded runs still work; please try again tomorrow.") from e


def _household_for(caller: dict, requested: str | None) -> str:
    if "judge" in caller["groups"]:
        requested = requested or caller.get("householdId")
        if not requested:
            raise ApiError(400, "householdId is required")
        return requested
    if not caller["householdId"]:
        raise ApiError(403, "no household on this account")
    if requested and requested != caller["householdId"]:
        raise ApiError(403, "not your household")
    return caller["householdId"]


def _require(caller: dict, *groups: str) -> None:
    if not caller["groups"] & set(groups):
        raise ApiError(403, f"needs one of: {', '.join(groups)}")


# ---- routes -----------------------------------------------------------------------------

def start_session(caller, body, _params):
    _require(caller, "senior", "judge")
    household_id = _household_for(caller, body.get("householdId"))
    household = store.get_household(household_id)
    language = body.get("language") if body.get("language") in harness.LANGUAGES else household.get("language", "en")
    sid = sessions.mint(household_id)
    store.table("sessions").put_item(
        Item={"sessionId": sid, "householdId": household_id, "tainted": False, "coercionScore": 0, "turns": 0,
              "startedBy": caller["user"], "language": language, "startedAt": datetime.now(timezone.utc).isoformat()}
    )
    return {"sessionId": sid, "householdId": household_id, "language": language, "owner": household["ownerName"],
            "approver": household.get("approverName")}


def chat(caller, body, _params):
    _require(caller, "senior", "judge")
    sid, text = body.get("sessionId"), str(body.get("text") or "").strip()
    if not text or len(text) > 2000:
        raise ApiError(400, "text must be 1-2000 characters")
    if not str(sid or "").startswith("kv-"):
        raise ApiError(404, "no such session")
    session = store.get_session(sid)
    if session.get("startedBy") != caller["user"]:
        raise ApiError(403, "not your session")
    try:
        store.table("sessions").update_item(
            Key={"sessionId": sid}, UpdateExpression="ADD turns :one",
            ConditionExpression="attribute_not_exists(turns) OR turns < :max",
            ExpressionAttributeValues={":one": 1, ":max": MAX_TURNS_PER_SESSION},
        )
    except store.table("sessions").meta.client.exceptions.ConditionalCheckFailedException as e:
        raise ApiError(429, "this session has reached its turn limit; start a new one") from e
    if caller.get("demo"):
        _spend_demo_turn()

    household = store.get_household(session["householdId"])
    language = session.get("language", "en")
    started = datetime.now(timezone.utc)
    turn = harness.invoke(
        os.environ["HARNESS_ARN"], sid, harness.system_prompt(sid, household, language),
        [{"role": "user", "content": [{"text": text}]}],
    )
    reply = turn.text.strip()
    if not reply:
        reply = FALLBACK_REPLY.get(language, FALLBACK_REPLY["en"])
    lim = limits_for(RULES[household["mode"]])
    layers = timeline.build(timeline.records_since(sid, started), lim.coercion_threshold)
    after = store.get_session(sid)
    return {
        "reply": reply,
        "layers": layers,
        "outcome": timeline.outcome(layers),
        "paused": bool(after.get("paused")), "pauseRule": after.get("pauseRule"),
        "tainted": bool(after.get("tainted")),
        "tools": [c["name"].rsplit("___", 1)[-1] for c in turn.tool_calls],
        "seconds": round(turn.seconds, 2),
    }


def activity(caller, _body, params):
    household_id = _household_for(caller, params.get("householdId"))
    rows = store.table("ledger").query(KeyConditionExpression=Key("householdId").eq(household_id), ScanIndexForward=False, Limit=60)["Items"]
    approvals = store.table("approvals").scan(
        FilterExpression="householdId = :h", ExpressionAttributeValues={":h": household_id}
    )["Items"]
    approvals = sorted(approvals, key=lambda a: a.get("requestedAt", ""), reverse=True)[:30]
    return {
        "ledger": [{**{k: r.get(k) for k in ("txnId", "payeeId", "payeeName", "status", "ruleHit", "createdAt", "note")},
                    "amount": paise_to_inr(r["amountPaise"]), "amountPaise": r["amountPaise"], "verifiable": bool(r.get("auditKey"))}
                   for r in rows],
        "approvals": [{k: a.get(k) for k in ("approvalId", "type", "reason", "decision", "requestedAt", "coolingEndsAt", "decidedBy")}
                      | {"payee": (a.get("draft") or {}).get("payeeName"),
                         "amount": paise_to_inr(a["draft"]["amountPaise"]) if (a.get("draft") or {}).get("amountPaise") else None}
                      for a in approvals],
    }


def decide(caller, body, params):
    _require(caller, "approver")
    approval = store.table("approvals").get_item(Key={"approvalId": params["id"]}).get("Item")
    if not approval or approval["householdId"] != caller["householdId"]:
        raise ApiError(404, "no such approval")
    resp = _lambda().invoke(
        FunctionName=os.environ["APPROVER_FN"],
        Payload=json.dumps({"approvalId": params["id"], "decision": body.get("decision"),
                            "decidedBy": "a demo visitor" if caller.get("demo") else caller["user"], "category": body.get("category")}),
    )
    result = json.loads(resp["Payload"].read())
    if not result.get("ok"):
        raise ApiError(409, result.get("error", "could not record the decision"))
    return result


def rules(caller, _body, params):
    household = store.get_household(_household_for(caller, params.get("householdId")))
    doc = RULES[household["mode"]]
    return {"mode": household["mode"], "setBy": household.get("approverName"), "setOn": household.get("rulesSetOn"),
            "rules": [{"id": r["id"], "text": r["text"], "edge": r.get("edge"), "enforce": r.get("enforce")} for r in doc["rules"]]}


def audit_record(caller, _body, params):
    household_id = _household_for(caller, params.get("householdId"))
    row = store.table("ledger").get_item(Key={"householdId": household_id, "txnId": params["txnId"]}).get("Item")
    if not row or not row.get("auditKey"):
        raise ApiError(404, "no signed record for that transaction")
    env = json.loads(boto3.client("s3").get_object(Bucket=os.environ["AUDIT_BUCKET"], Key=row["auditKey"])["Body"].read())
    head = boto3.client("s3").head_object(Bucket=os.environ["AUDIT_BUCKET"], Key=row["auditKey"])
    return {"record": env["record"], "signatureValid": audit.verify(env), "algorithm": env["algorithm"], "keyId": env["keyId"],
            "lock": {"mode": head.get("ObjectLockMode"), "retainUntil": head.get("ObjectLockRetainUntilDate")}}


ROUTES = {
    ("POST", "/session"): start_session,
    ("POST", "/chat"): chat,
    ("GET", "/activity"): activity,
    ("POST", "/approvals/{id}"): decide,
    ("GET", "/rules"): rules,
    ("GET", "/audit/{txnId}"): audit_record,
}


def lambda_handler(event, _context):
    try:
        resource = event.get("resource") or ""
        demo = resource.startswith("/demo/")
        route = ROUTES.get((event.get("httpMethod"), resource.removeprefix("/demo")))
        if not route:
            raise ApiError(404, "no such route")
        body = json.loads(event.get("body") or "{}")
        params = {**(event.get("queryStringParameters") or {}), **(event.get("pathParameters") or {})}
        caller = _demo_caller(body, params) if demo else _caller(event)
        return _json(200, route(caller, body, params))
    except ApiError as e:
        return _json(e.status, {"error": e.message})
    except store.SessionError as e:
        return _json(404, {"error": str(e)})
    except json.JSONDecodeError:
        return _json(400, {"error": "body must be JSON"})
    except Exception:
        log.exception("api error")
        return _json(500, {"error": "something went wrong; nothing was paid"})
