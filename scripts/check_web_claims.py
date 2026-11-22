"""Check the landing page's scenario facts (web/lib/scenario-claims.json) against the benchmark.

Run by scripts/build_web_data.py before every web build, and by tests/test_web_claims.py.
Returns a list of mismatches; empty means every number the site states is in the results.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLAIMS = ROOT / "web" / "lib" / "scenario-claims.json"


def rupees(rows: list[dict]) -> list[int]:
    return [int(r["amountPaise"]) // 100 for r in rows]


def check(claims: dict | None = None, results_dir: Path | None = None) -> list[str]:
    claims = claims or json.loads(CLAIMS.read_text())
    results_dir = results_dir or ROOT / "bench" / "results"
    run = json.loads((results_dir / f"{claims['run']}.json").read_text())["results"]
    c3_path = results_dir / "run-c3-attrib.json"
    c3 = json.loads(c3_path.read_text())["results"] if c3_path.exists() else []
    bad: list[str] = []

    def expect(name: str, field: str, claimed, actual) -> None:
        if claimed != actual:
            bad.append(f"{name}.{field}: site says {claimed!r}, results say {actual!r}")

    for name, c in claims["scenarios"].items():
        c0 = [r for r in run if r["config"] == "C0" and r["id"] == c["id"]]
        c2 = [r for r in run if r["config"] == "C2" and r["id"] == c["id"]]
        if not c0 or not c2:
            bad.append(f"{name}: no C0/C2 results for {c['id']}")
            continue
        k = c2[0]
        expect(name, "kavachPaid", c["kavachPaid"], rupees(k["paid"]))
        if c["kind"] == "legit":
            expect(name, "c0Outcomes", c["c0Outcomes"], [r["outcome"] for r in sorted(c0, key=lambda r: r["repeat"])])
            continue
        expect(name, "c0Breached", c["c0Breached"], sum(r["breach"] for r in c0))
        expect(name, "c0Runs", c["c0Runs"], len(c0))
        shown = next((r for r in c0 if r["repeat"] == c["c0Shown"]), None)
        if not shown or not shown["breach"]:
            bad.append(f"{name}.c0Shown: repeat {c['c0Shown']} is not a breaching run")
        else:
            expect(name, "c0ShownPaid", c["c0ShownPaid"], rupees(shown["paid"]))
            if c["headlineLost"] not in rupees(shown["paid"]) and c["headlineLost"] != sum(rupees(shown["paid"])):
                bad.append(f"{name}.headlineLost: {c['headlineLost']} is neither one payment nor the total in the shown run")
        expect(name, "kavachFired", c["kavachFired"], sorted({f["layer"] for f in k["layers"]["fired"]}))
        expect(name, "kavachPause", c["kavachPause"], k.get("pauseRule"))
        if k["breach"]:
            bad.append(f"{name}: Kavach (C2) breached in the results")
        c3r = next((r for r in c3 if r["id"] == c["id"]), None)
        if c3r is not None:
            expect(name, "c3Breach", c["c3Breach"], c3r["breach"])
    return bad


if __name__ == "__main__":
    problems = check()
    for p in problems:
        print(f"MISMATCH {p}")
    print("scenario claims match the benchmark" if not problems else f"{len(problems)} mismatches")
    sys.exit(1 if problems else 0)
