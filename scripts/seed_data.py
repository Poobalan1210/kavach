"""Deterministic demo data: Kamala's household (Guardian) and Priya (Self-protect).

All people, VPAs and bill numbers are fictional.
"""

import random
from datetime import datetime, timedelta

from common.money import IST

RULES_SET_ON = "2026-11-21"


def households() -> list[dict]:
    return [
        {
            "householdId": "hh-kamala",
            "mode": "guardian",
            "ownerName": "Kamala",
            "approverId": "arjun",
            "approverName": "Arjun",
            "language": "ta",
            "rulesVersion": 1,
            "rulesSetOn": RULES_SET_ON,
        },
        {
            "householdId": "hh-priya",
            "mode": "self_protect",
            "ownerName": "Priya",
            "approverId": "self",
            "approverName": "Priya",
            "language": "en",
            "rulesVersion": 1,
            "rulesSetOn": RULES_SET_ON,
        },
    ]


def _bill(biller: str, number: str, paise: int, due: str) -> dict:
    return {"biller": biller, "billNumber": number, "amountPaise": paise, "dueDate": due}


def payees() -> list[dict]:
    added = "2026-09-01T10:00:00+05:30"
    k = "hh-kamala"
    p = "hh-priya"
    rows = [
        (k, "p-tangedco", "TANGEDCO Electricity", "tangedco.bill@okaxis", "utility",
         _bill("TANGEDCO", "EB-0915-334521", 124000, "2026-11-28")),
        (k, "p-metrowater", "Chennai Metrowater", "cmwssb.bill@okicici", "utility",
         _bill("CMWSSB", "MW-22-071834", 42000, "2026-12-05")),
        (k, "p-airtel", "Airtel Mobile", "airtel.prepaid@okhdfc", "utility",
         _bill("Airtel", "98400-11223", 29900, "2026-11-30")),
        (k, "p-arjun", "Arjun (son)", "arjun.k@okhdfcbank", "family", None),
        (k, "p-meena", "Meena (daughter)", "meena.r@oksbi", "family", None),
        (k, "p-saravana", "Saravana Stores", "saravanastores@ybl", "shop", None),
        (k, "p-apollo", "Apollo Pharmacy Mylapore", "apollo.mylapore@okaxis", "shop", None),
        (k, "p-drramesh", "Dr. Ramesh Clinic", "drramesh.clinic@okicici", "shop", None),
        (p, "p-bescom", "BESCOM Electricity", "bescom.bill@okaxis", "utility",
         _bill("BESCOM", "BES-7781-20934", 186000, "2026-11-29")),
        (p, "p-landlord", "Mr. Shetty (rent)", "shetty.rent@okhdfcbank", "family", None),
        (p, "p-amma", "Amma", "lakshmi.amma@oksbi", "family", None),
        (p, "p-jio", "Jio Fiber", "jiofiber@jio", "utility",
         _bill("Jio", "JF-4410022", 99900, "2026-12-02")),
        (p, "p-broker", "Index Fund SIP (broker)", "sip.broker@okicici", "investment", None),
    ]
    out = []
    for hh, pid, name, vpa, cat, bill in rows:
        item = {"householdId": hh, "payeeId": pid, "name": name, "vpa": vpa, "category": cat,
                "status": "active", "addedAt": added, "coolingEndsAt": added}
        if bill:
            item["bill"] = bill
        out.append(item)
    return out


def ledger(today: datetime | None = None) -> list[dict]:
    """30 days of ordinary history, before today, all under the limits."""
    rng = random.Random(42)
    today = (today or datetime.now(IST)).astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    plan = {
        "hh-kamala": [("p-saravana", 30000, 180000), ("p-apollo", 25000, 120000), ("p-meena", 100000, 300000),
                      ("p-drramesh", 50000, 80000)],
        "hh-priya": [("p-amma", 200000, 500000), ("p-broker", 300000, 500000)],
    }
    names = {(p["householdId"], p["payeeId"]): p["name"] for p in payees()}
    rows = []
    for hh, options in plan.items():
        for day in range(30, 0, -1):
            if rng.random() < 0.55:
                continue
            pid, lo, hi = rng.choice(options)
            at = today - timedelta(days=day) + timedelta(hours=rng.randint(8, 20), minutes=rng.randint(0, 59))
            rows.append({
                "householdId": hh,
                "txnId": f"txn-{at:%Y%m%d%H%M%S}-seed{len(rows):03d}",
                "payeeId": pid,
                "payeeName": names[(hh, pid)],
                "amountPaise": rng.randrange(lo, hi, 100),
                "status": "paid",
                "ruleHit": None,
                "note": "seed",
                "createdAt": at.isoformat(),
            })
    return rows
