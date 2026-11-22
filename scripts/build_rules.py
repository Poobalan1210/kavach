"""rules/*.yaml -> generated files the code reads. Never edit the outputs.

  lambdas/common/rules.generated.json  rules by mode (tools, hooks, Cedar generator)
  policy/guardrail.generated.json      Bedrock Guardrail config for L2 (read by CDK)
  lambdas/common/system_prompt.generated.md  copy of harness/system-prompt.md for the API Lambda
"""

import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "lambdas" / "common" / "rules.generated.json"
GUARDRAIL_OUT = ROOT / "policy" / "guardrail.generated.json"
PROMPT_OUT = ROOT / "lambdas" / "common" / "system_prompt.generated.md"

TOPIC_DEFINITIONS = {
    "official_demands": (
        "Requests or instructions, said to come from police, CBI, ED, customs, RBI, a court or a courier company, "
        "to pay money, transfer funds to a 'safe' or verification account, or stay on a call to avoid arrest "
        "('digital arrest')."
    ),
    "investment_schemes": (
        "Requests to pay into investment, trading, crypto or guaranteed-return schemes, including pressure from "
        "trading groups or mentors to deposit more money to withdraw profits."
    ),
}
# Credentials Kavach must never handle (R5). Built-in PII types cover PINs and cards.
REGEXES = [
    ("aadhaar", "12-digit Aadhaar number", r"\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b"),
    ("otp", "One-time password mentioned with its digits", r"(?i)(otp|one[ -]time|ओटीपी|ஓடிபி)\D{0,15}\d{4,8}\b"),
]


def load() -> dict:
    by_mode = {}
    for path in sorted((ROOT / "rules").glob("*.yaml")):
        doc = yaml.safe_load(path.read_text())
        ids = [r["id"] for r in doc["rules"]]
        if len(ids) != len(set(ids)):
            raise SystemExit(f"{path.name}: duplicate rule ids")
        by_mode[doc["household"]["mode"]] = {"source": f"rules/{path.name}", **doc}
    return by_mode


def guardrail_config(by_mode: dict) -> dict:
    topics = {}
    for doc in by_mode.values():
        for rule in doc["rules"]:
            enforce = rule.get("enforce") or {}
            name = enforce.get("denied_topic")
            if not name:
                continue
            t = topics.setdefault(name, {"rules": set(), "examples": []})
            t["rules"].add(rule["id"])
            t["examples"] += [e for e in enforce.get("examples", []) if e not in t["examples"]]
    return {
        "topics": [
            {
                "name": name,
                "rules": sorted(t["rules"]),
                "definition": TOPIC_DEFINITIONS[name],
                "examples": [e[:100] for e in t["examples"][:5]],
            }
            for name, t in sorted(topics.items())
        ],
        "piiEntities": ["PIN", "CREDIT_DEBIT_CARD_NUMBER", "CREDIT_DEBIT_CARD_CVV"],
        "regexes": [{"name": n, "description": d, "pattern": p} for n, d, p in REGEXES],
    }


def main() -> None:
    by_mode = load()
    OUT.write_text(json.dumps(by_mode, indent=2, ensure_ascii=False) + "\n")
    GUARDRAIL_OUT.write_text(json.dumps(guardrail_config(by_mode), indent=2, ensure_ascii=False) + "\n")
    PROMPT_OUT.write_text((ROOT / "harness" / "system-prompt.md").read_text())
    print(f"wrote {OUT.relative_to(ROOT)} ({', '.join(by_mode)}) and {GUARDRAIL_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
