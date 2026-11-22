"""rules/*.yaml + saved payees -> Cedar policies for AgentCore Policy (L5).

Generated, never hand-edited. Writes policy/kavach.cedar for review and, with
--apply, syncs the policies into the deployed policy engine.

Cedar sees only the tool input, so:
  - the household is read from the sessionId prefix (L4 binds it to the real session);
  - the payee allowlist and category blocks are baked in from the payees table;
  - the daily total (R4) cannot be expressed here; L6 enforces it atomically.

Usage:
  python policy/gen_cedar.py                 # from seed data, print + write kavach.cedar
  python policy/gen_cedar.py --live --apply  # from the deployed tables, sync to the engine
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lambdas"))
sys.path.insert(0, str(ROOT / "scripts"))

from common.cedar import apply, generate, render  # noqa: E402


def _sources(live: bool):
    import build_rules

    build_rules.main()
    rules_by_mode = json.loads(build_rules.OUT.read_text())
    if not live:
        from seed_data import households, payees

        return rules_by_mode, households(), payees(), "arn:aws:bedrock-agentcore:us-east-1:111122223333:gateway/example", [
            "arn:aws:sts::111122223333:assumed-role/example-harness-role"
        ]
    from kavach_client import ddb_table, outputs

    o = outputs()
    hh = ddb_table("households").scan()["Items"]
    payees = ddb_table("payees").scan()["Items"]
    principals = [f"arn:aws:sts::{o['AccountId']}:assumed-role/{o[k]}" for k in ("HarnessRoleName", "BenchRoleName")]
    return rules_by_mode, hh, payees, o["GatewayArn"], principals


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="read payees and ARNs from the deployed stack")
    ap.add_argument("--apply", action="store_true", help="sync policies into the deployed policy engine")
    args = ap.parse_args()
    if args.apply and not args.live:
        raise SystemExit("--apply needs --live")
    policies = generate(*_sources(args.live))
    out = Path(__file__).with_name("kavach.cedar")
    out.write_text(render(policies))
    print(f"wrote {out.relative_to(ROOT)} ({len(policies)} policies)")
    if args.apply:
        import boto3

        from kavach_client import REGION, outputs

        apply(policies, outputs()["PolicyEngineId"], boto3.client("bedrock-agentcore-control", region_name=REGION))


if __name__ == "__main__":
    main()
