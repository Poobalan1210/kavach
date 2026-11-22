"""Phase 2 "done when": "pay the electricity bill" works end to end in English,
Hindi and Tamil, and each run writes a ledger row for the TANGEDCO bill.

Run `make seed` first (it clears today's ledger rows and daily totals).
"""

import json
import sys
from pathlib import Path

from boto3.dynamodb.conditions import Key

from kavach_client import ddb_table, send, start_session

PROMPTS = {
    "en": "Pay the electricity bill",
    "hi": "बिजली का बिल भर दो",
    "ta": "மின்சார கட்டணத்தை கட்டிவிடு",
}
FOLLOW_UP = {"en": "Yes, pay it.", "hi": "हाँ, भर दो।", "ta": "ஆமாம், கட்டிவிடு."}
SCRIPT_RANGES = {"hi": (0x0900, 0x097F), "ta": (0x0B80, 0x0BFF)}
BILL_PAISE = 124000


def ledger_rows(session_id: str) -> list[dict]:
    items = ddb_table("ledger").query(KeyConditionExpression=Key("householdId").eq("hh-kamala"))["Items"]
    return [i for i in items if i.get("sessionId") == session_id]


def in_script(text: str, lang: str) -> bool:
    if lang not in SCRIPT_RANGES:
        return True
    lo, hi = SCRIPT_RANGES[lang]
    return any(lo <= ord(c) <= hi for c in text)


def main() -> int:
    results, failed = {}, False
    for lang, prompt in PROMPTS.items():
        session = start_session("hh-kamala", lang)
        turns = [send(session, prompt)]
        if not ledger_rows(session.session_id):
            turns.append(send(session, FOLLOW_UP[lang]))  # the model asked to confirm; allowed once
        rows = ledger_rows(session.session_id)
        reply = turns[-1].text.strip()
        ok = (
            len(rows) == 1
            and rows[0]["payeeId"] == "p-tangedco"
            and int(rows[0]["amountPaise"]) == BILL_PAISE
            and rows[0]["txnId"] in reply
            and in_script(reply, lang)
            and not any(t.errors for t in turns)
        )
        failed |= not ok
        results[lang] = {
            "pass": ok,
            "sessionId": session.session_id,
            "turns": len(turns),
            "ledger": rows,
            "toolCalls": [c["name"] for t in turns for c in t.tool_calls],
            "hooks": [h.get("decision") for t in turns for h in t.hook_events],
            "reply": reply,
            "usage": [t.usage for t in turns],
        }
        print(f"{'PASS' if ok else 'FAIL'}  {lang}  turns={len(turns)} ledger_rows={len(rows)} tools={results[lang]['toolCalls']}")
        print(f"      {reply[:300]!r}")
    out = Path(__file__).resolve().parents[1] / "bench" / "results" / "phase2_smoke.json"
    out.write_text(json.dumps(results, indent=2, default=str, ensure_ascii=False))
    print(f"wrote {out}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
