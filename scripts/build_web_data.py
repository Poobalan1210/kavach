"""Benchmark results -> static data for the Shield Console.

  web/public/data/results.json   summary for the Results tab
  web/public/data/theatre.json   per attack: one recorded prompt-only (C0) run to replay, preferring a
                                 run where the attack succeeded, plus the victim's lines to send live
                                 to Kavach

Usage: python scripts/build_web_data.py [bench/results/run-full-1.json]
"""

import json
import shutil
import statistics
import sys
from collections import Counter
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_web_claims  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "public" / "data"
MAX_LIVE_LINES = 6


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "bench" / "results" / "run-full-1.json"
    run = json.loads(src.read_text())
    catalogue = yaml.safe_load((ROOT / "bench" / "attacks.yaml").read_text())
    sources = catalogue["sources"]
    OUT.mkdir(parents=True, exist_ok=True)

    problems = check_web_claims.check()
    if problems:
        sys.exit("The site's scenario facts no longer match the benchmark:\n  " + "\n  ".join(problems))

    shutil.copyfile(ROOT / "docs" / "architecture.svg", OUT.parent / "architecture.svg")

    # Raw results, published as-is so anyone can check the numbers.
    raw = OUT / "raw"
    raw.mkdir(exist_ok=True)
    for name in (src.name, "run-c3-attrib.json", "run-latency-1.json"):
        if (src.parent / name).exists():
            shutil.copyfile(src.parent / name, raw / name)

    extras = {"sources": catalogue["sources"]}
    c3_path = src.parent / "run-c3-attrib.json"
    if c3_path.exists():
        c3 = json.loads(c3_path.read_text())["results"]
        extras["c3Stops"] = dict(Counter(f["layer"] for r in c3 for f in r["layers"]["fired"]))
        extras["c3Attacks"] = len(c3)
    lat_path = src.parent / "run-latency-1.json"
    if lat_path.exists():
        secs = [t["seconds"] for r in json.loads(lat_path.read_text())["results"] for t in r["turns"]]
        extras["billLatency"] = {"p50": round(statistics.median(secs), 1), "p90": round(statistics.quantiles(secs, n=10)[-1], 1)}
    by_lang = {}
    for r in run["results"]:
        if r["kind"] == "attack" and not r.get("error"):
            b = by_lang.setdefault(r["config"], {}).setdefault(r["lang"], {"runs": 0, "breaches": 0})
            b["runs"] += 1
            b["breaches"] += int(r["breach"])
    extras["byLanguage"] = by_lang

    (OUT / "results.json").write_text(json.dumps({
        "run": run["name"], "spendUsd": run["estimatedSpendUsd"], "summary": run["summary"], **extras,
    }, indent=2, ensure_ascii=False))

    by_attack = {}
    for r in run["results"]:
        if r["config"] == "C0" and r["kind"] == "attack" and not r.get("error"):
            by_attack.setdefault(r["id"], []).append(r)
    theatre = []
    for a in catalogue["attacks"]:
        runs = by_attack.get(a["id"], [])
        if not runs:
            continue
        pick = next((r for r in runs if r["breach"]), runs[0])
        theatre.append({
            "id": a["id"], "family": a["family"], "lang": a["lang"], "household": a["household"],
            "brief": a["brief"], "source": sources[a["source"]], "target": a["target"],
            "promptOnly": {
                "run": run["name"], "repeat": pick["repeat"], "breach": pick["breach"], "violations": pick["violations"],
                "breachedRuns": sum(r["breach"] for r in runs), "runs": len(runs),
                "turns": [{"victim": t["victim"], "app": t["app"], "tools": t["tools"]} for t in pick["turns"]],
                "paid": [{"to": p.get("vpa") or p.get("payeeId"), "amountInr": int(p["amountPaise"]) // 100} for p in pick["paid"]],
            },
            "victimLines": [t["victim"] for t in pick["turns"]][:MAX_LIVE_LINES],
        })
    theatre.sort(key=lambda t: (not t["promptOnly"]["breach"], t["id"]))
    (OUT / "theatre.json").write_text(json.dumps(theatre, indent=2, ensure_ascii=False))
    print(f"wrote {OUT.relative_to(ROOT)}/results.json and theatre.json ({len(theatre)} attacks, "
          f"{sum(t['promptOnly']['breach'] for t in theatre)} with a recorded prompt-only breach)")

    # The what-broke log, published as-is from docs/what-broke.md for the site's What broke page.
    entries = []
    for line in (ROOT / "docs" / "what-broke.md").read_text().splitlines():
        if line.startswith("| 20"):
            date, test, happened, cause, fix, *_ = [c.strip() for c in line.strip("|").split(" | ")]
            entries.append({"date": date, "test": test, "happened": happened, "cause": cause, "fix": fix})
    (OUT / "what-broke.json").write_text(json.dumps(entries, indent=2, ensure_ascii=False))
    print(f"wrote what-broke.json ({len(entries)} entries)")


if __name__ == "__main__":
    main()
