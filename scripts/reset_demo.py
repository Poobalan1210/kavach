"""Reset the two demo households to their seeded state.

Removes what testing, the benchmark and demo visitors left behind: approval requests (stopping any
workflow still waiting on one), payees and ledger rows that aren't in the seed data, and daily
totals. Then re-seeds and re-syncs Cedar. Signed audit records in S3 are under Object Lock and stay.

Usage: python scripts/reset_demo.py            # dry run: print what would change
       python scripts/reset_demo.py --apply    # do it
"""

import subprocess
import sys
from pathlib import Path

import boto3
from boto3.dynamodb.conditions import Key

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lambdas"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from kavach_client import REGION, ddb_table  # noqa: E402
from seed_data import ledger, payees  # noqa: E402

DEMO = ("hh-kamala", "hh-priya")


def query_all(table, hh: str) -> list[dict]:
    items, kw = [], {"KeyConditionExpression": Key("householdId").eq(hh)}
    while True:
        page = table.query(**kw)
        items += page["Items"]
        if "LastEvaluatedKey" not in page:
            return items
        kw["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def scan_all(table, **kw) -> list[dict]:
    items = []
    while True:
        page = table.scan(**kw)
        items += page["Items"]
        if "LastEvaluatedKey" not in page:
            return items
        kw["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def main() -> None:
    apply = "--apply" in sys.argv
    sfn = boto3.client("stepfunctions", region_name=REGION)
    seed_payees = {(p["householdId"], p["payeeId"]) for p in payees()}
    seed_txns = {(r["householdId"], r["txnId"]) for r in ledger()}

    approvals = ddb_table("approvals")
    found = [a for a in scan_all(approvals) if a.get("householdId") in DEMO]
    waiting = [a for a in found if a.get("decision") == "pending" and a.get("executionArn")]
    print(f"approvals: {len(found)} to delete ({len(waiting)} with a waiting workflow to stop)")
    if apply:
        for a in waiting:
            try:
                sfn.stop_execution(executionArn=a["executionArn"], cause="demo reset")
            except sfn.exceptions.ExecutionDoesNotExist:
                pass
            except Exception as e:  # already finished, etc.
                print("  could not stop", a["approvalId"], type(e).__name__)
        with approvals.batch_writer() as w:
            for a in found:
                w.delete_item(Key={"approvalId": a["approvalId"]})

    for name, keep, key in (("payees", seed_payees, "payeeId"), ("ledger", seed_txns, "txnId"), ("daily_totals", set(), "date")):
        table = ddb_table(name)
        for hh in DEMO:
            extra = [r for r in query_all(table, hh) if (hh, r[key]) not in keep]
            print(f"{name} {hh}: {len(extra)} to delete")
            if apply:
                with table.batch_writer() as w:
                    for r in extra:
                        w.delete_item(Key={"householdId": hh, key: r[key]})

    if apply:
        root = Path(__file__).resolve().parents[1]
        subprocess.run([sys.executable, str(root / "scripts" / "seed.py")], check=True)
        subprocess.run(["make", "-C", str(root), "policy"], check=True)
        print("done: demo households reset, re-seeded, Cedar re-synced")
    else:
        print("dry run: nothing changed. Re-run with --apply.")


if __name__ == "__main__":
    main()
