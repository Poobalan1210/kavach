"""Load the demo data into the deployed tables (idempotent: same keys every run).

Usage: python scripts/seed.py [--reset-today]
  --reset-today  also clears today's ledger rows and daily totals (for reruns)
"""

import sys
from pathlib import Path

import boto3
from boto3.dynamodb.conditions import Key

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lambdas"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from common.money import ist_date  # noqa: E402
from kavach_client import REGION, outputs  # noqa: E402
from seed_data import households, ledger, payees  # noqa: E402


def main() -> None:
    names = {t: outputs()[f"Table{t.replace('_', '')}"] for t in ("households", "payees", "ledger", "daily_totals")}
    ddb = boto3.resource("dynamodb", region_name=REGION)
    for table, rows in (("households", households()), ("payees", payees()), ("ledger", ledger())):
        with ddb.Table(names[table]).batch_writer() as w:
            for row in rows:
                w.put_item(Item=row)
        print(f"{table}: {len(rows)} rows")

    if "--reset-today" in sys.argv:
        today = ist_date()
        stamp = today.replace("-", "")
        for hh in {h["householdId"] for h in households()}:
            ddb.Table(names["daily_totals"]).delete_item(Key={"householdId": hh, "date": today})
            items = ddb.Table(names["ledger"]).query(
                KeyConditionExpression=Key("householdId").eq(hh) & Key("txnId").begins_with(f"txn-{stamp}")
            )["Items"]
            for item in items:
                ddb.Table(names["ledger"]).delete_item(Key={"householdId": hh, "txnId": item["txnId"]})
            print(f"{hh}: cleared {len(items)} ledger rows and the daily total for {today}")


if __name__ == "__main__":
    main()
