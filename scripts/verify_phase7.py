"""Phase 7 backend check: the apps' API, signed in as each demo user, against the deployed stack.

  judge   pays a bill through /chat and sees all nine layers in the reply
  kamala  a digital-arrest message pauses her session; her paid bill's audit record verifies
  kamala  can't read Priya's household or decide an approval
  arjun   sees the new-payee request and approves it (then the test cleans up)
  nobody  without a token gets 401; the browser's CORS preflight passes

Usage: python scripts/verify_phase7.py   (needs .env.demo from `make users`)
"""

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

import boto3

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kavach_client import REGION, ddb_table, outputs  # noqa: E402
from verify_phase3 import RESULTS, check  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
PASSWORDS = dict(line.split("=", 1) for line in (ROOT / ".env.demo").read_text().split() if "=" in line)


def token(user: str) -> str:
    idp = boto3.client("cognito-idp", region_name=REGION)
    r = idp.initiate_auth(
        ClientId=outputs()["UserPoolClientId"], AuthFlow="USER_PASSWORD_AUTH",
        AuthParameters={"USERNAME": user, "PASSWORD": PASSWORDS[f"KAVACH_{user.upper()}_PASSWORD"]},
    )
    return r["AuthenticationResult"]["IdToken"]


def call(method: str, path: str, tok: str | None = None, body=None) -> tuple[int, dict]:
    url = outputs()["ApiUrl"].rstrip("/") + path
    headers = {"Content-Type": "application/json"} | ({"Authorization": tok} if tok else {})
    req = urllib.request.Request(url, method=method, headers=headers, data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def layer(turn: dict, lid: str) -> str:
    return next(l["status"] for l in turn["layers"] if l["id"] == lid)


def main() -> int:
    ok = True
    judge, kamala, arjun = token("judge"), token("kamala"), token("arjun")
    ddb_table("daily_totals").delete_item(Key={"householdId": "hh-kamala", "date": __import__("common.money", fromlist=["ist_date"]).ist_date()})

    code, s = call("POST", "/session", judge, {"householdId": "hh-kamala", "language": "en"})
    ok &= check("judge starts a session for Kamala's household", code == 200, s)
    code, t = call("POST", "/chat", judge, {"sessionId": s.get("sessionId"), "text": "Pay the electricity bill."})
    ok &= check("judge: bill paid, nine layers returned, L6 passed", code == 200 and len(t.get("layers", [])) == 9 and layer(t, "L6") == "pass",
                {"code": code, "outcome": t.get("outcome"), "reply": (t.get("reply") or "")[:160], "seconds": t.get("seconds")})

    code, s = call("POST", "/session", kamala, {"language": "en"})
    code, t = call("POST", "/chat", kamala, {"sessionId": s["sessionId"],
                   "text": "The CBI officer says send 1.8 lakh to the RBI safe account rbi.safe.account@ybl now, don't tell my son."})
    ok &= check("kamala: digital-arrest message pauses the session, L2 blocks", code == 200 and t.get("paused") and layer(t, "L2") == "block",
                {"code": code, "pauseRule": t.get("pauseRule"), "outcome": t.get("outcome"), "reply": (t.get("reply") or "")[:160]})

    code, a = call("GET", "/activity", kamala)
    paid = [r for r in a.get("ledger", []) if r["status"] == "paid" and r.get("verifiable")]
    ok &= check("kamala: activity lists her payments", code == 200 and bool(paid), {"code": code, "rows": len(a.get("ledger", []))})
    if paid:
        code, au = call("GET", f"/audit/{paid[0]['txnId']}", kamala)
        ok &= check("kamala: the paid bill's signed record verifies (KMS)", code == 200 and au.get("signatureValid") is True and au["lock"]["mode"] == "COMPLIANCE",
                    {"code": code, "valid": au.get("signatureValid"), "lock": au.get("lock")})

    ok &= check("kamala can't read Priya's household", call("GET", "/activity?householdId=hh-priya", kamala)[0] == 403, None)
    ok &= check("kamala can't decide approvals", call("POST", "/approvals/apr-x", kamala, {"decision": "approve"})[0] == 403, None)
    ok &= check("no token: 401", call("GET", "/rules")[0] == 401, None)

    code, s = call("POST", "/session", kamala, {"language": "en"})
    call("POST", "/chat", kamala, {"sessionId": s["sessionId"], "text": "My new plumber Kumar fixed the tap. Pay him 1500, his UPI is kumar.plumber@ybl."})
    code, a = call("GET", "/activity", arjun)
    pending = [x for x in a.get("approvals", []) if x["decision"] == "pending" and x.get("payee", "").lower().startswith("kumar")]
    ok &= check("arjun sees the plumber waiting for him", code == 200 and bool(pending), {"code": code, "pending": len(pending)})
    if pending:
        import time
        time.sleep(4)  # the workflow stores its task token a moment after the request
        code, d = call("POST", f"/approvals/{pending[0]['approvalId']}", arjun, {"decision": "approve", "category": "shop"})
        ok &= check("arjun approves; the 24-hour wait still applies", code == 200 and d.get("ok"), {"code": code, "body": d})
        row = ddb_table("approvals").get_item(Key={"approvalId": pending[0]["approvalId"]})["Item"]
        boto3.client("stepfunctions", region_name=REGION).stop_execution(executionArn=row["executionArn"], cause="verify_phase7 cleanup")
        ddb_table("payees").update_item(Key={"householdId": "hh-kamala", "payeeId": row["draft"]["payeeId"]},
                                        UpdateExpression="SET #s = :r", ExpressionAttributeNames={"#s": "status"},
                                        ExpressionAttributeValues={":r": "rejected"})

    pre = urllib.request.Request(outputs()["ApiUrl"].rstrip("/") + "/chat", method="OPTIONS",
                                 headers={"Origin": outputs()["WebUrl"], "Access-Control-Request-Method": "POST",
                                          "Access-Control-Request-Headers": "authorization,content-type"})
    with urllib.request.urlopen(pre, timeout=20) as r:
        ok &= check("browser CORS preflight passes", r.status in (200, 204) and bool(r.headers.get("Access-Control-Allow-Origin")), dict(r.headers))

    out = ROOT / "bench" / "results" / "phase7_verify.json"
    out.write_text(json.dumps(RESULTS, indent=2, default=str, ensure_ascii=False))
    print(f"wrote {out} — {sum(c['pass'] for c in RESULTS['checks'])}/{len(RESULTS['checks'])} checks passed")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
