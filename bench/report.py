"""Tables and charts from a benchmark results file, for the README and the article.

Usage: python bench/report.py bench/results/<run>.json
Writes bench/results/<run>.md, <run>-asr.png and <run>-layers.png.
"""

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.ticker import MaxNLocator  # noqa: E402

CONFIG_NAMES = {
    "C0": "C0  prompt only",
    "C1": "C1  + guardrail",
    "C2": "C2  Kavach",
    "C3": "C3  Kavach, model hijacked",
}
LAYER_NAMES = {
    "L1": "L1 model declined", "none": "Model declined (no layer needed)", "L2": "L2 guardrail", "L3": "L3 coercion scorer",
    "L4": "L4 tool gate", "L5": "L5 Cedar", "L6": "L6 payment checks", "breached": "Breached",
}
# Reference palette (dataviz skill, references/palette.md), light mode.
SURFACE, INK, INK_2, GRID, SERIES_1 = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df", "#2a78d6"
BAR = 0.4  # of a 0.45 in row at 200 dpi: about 24 px when shown at half size


def _style(ax, title: str, subtitle: str) -> None:
    ax.set_facecolor(SURFACE)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.tick_params(colors=INK_2, length=0, labelsize=10)
    ax.set_title(f"{title}\n", loc="left", fontsize=13, color=INK, fontweight="bold")
    ax.text(0, 1.02, subtitle, transform=ax.transAxes, fontsize=10, color=INK_2)


def chart_asr(summary: dict, out: Path) -> None:
    cfgs = [c for c in CONFIG_NAMES if c in summary]
    rates = [100 * (summary[c]["attackSuccessRate"] or 0) for c in cfgs]
    fig, ax = plt.subplots(figsize=(8, 0.45 * len(cfgs) + 1.4), dpi=200, facecolor=SURFACE)
    y = range(len(cfgs))[::-1]
    ax.barh(list(y), rates, height=BAR, color=SERIES_1)
    for yi, r, c in zip(y, rates, cfgs):
        s = summary[c]
        ax.text(r + 1.2, yi, f"{r:.3g}%  ({s['breaches']} of {s['attackRuns']})", va="center", fontsize=10, color=INK)
    ax.set_yticks(list(y), [CONFIG_NAMES[c] for c in cfgs], color=INK)
    ax.set_xlim(0, 100)
    ax.xaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.set_xticks([0, 25, 50, 75, 100], ["0%", "25%", "50%", "75%", "100%"])
    _style(ax, "Coached-scam attacks that moved money", "Share of attack runs that paid the scammer or broke a household rule")
    fig.tight_layout()
    fig.savefig(out, facecolor=SURFACE)
    plt.close(fig)


def chart_layers(summary: dict, out: Path) -> None:
    first = summary.get("C2", {}).get("firstLayer", {})
    order = [k for k in ("L2", "L3", "L4", "L5", "L6", "none", "breached") if first.get(k)]
    if not order:
        return
    counts = [first[k] for k in order]
    fig, ax = plt.subplots(figsize=(8, 0.45 * len(order) + 1.4), dpi=200, facecolor=SURFACE)
    y = range(len(order))[::-1]
    ax.barh(list(y), counts, height=BAR, color=SERIES_1)
    ax.xaxis.set_major_locator(MaxNLocator(integer=True))
    for yi, n in zip(y, counts):
        ax.text(n + max(counts) * 0.015, yi, str(n), va="center", fontsize=10, color=INK)
    ax.set_yticks(list(y), [LAYER_NAMES[k] for k in order], color=INK)
    ax.xaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.set_xlim(0, max(counts) * 1.12)
    _style(ax, "Which Kavach layer stopped each attack first", "C2 attack runs, by the first layer that acted")
    fig.tight_layout()
    fig.savefig(out, facecolor=SURFACE)
    plt.close(fig)


def tables(data: dict) -> str:
    s = data["summary"]
    cfgs = [c for c in CONFIG_NAMES if c in s]
    lines = [
        f"# Benchmark results: {data['name']}",
        "",
        f"Estimated model and guardrail spend: ${data['estimatedSpendUsd']:.2f} (budget ${data['budgetUsd']:.0f}).",
        "",
        "| Configuration | Attack runs | Breaches | Attack success | Approver alerts | Legit complete | False holds | p50 turn | p95 turn |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for c in cfgs:
        x = s[c]
        asr = f"{100 * x['attackSuccessRate']:.3g}%" if x["attackSuccessRate"] is not None else "-"
        legit = f"{x['legitComplete']} of {x['legitRuns']}" if x["legitRuns"] else "-"
        fh = str(x["falseHolds"]) if x["legitRuns"] else "-"
        p50 = f"{x['p50TurnSeconds']} s" if x["p50TurnSeconds"] else "-"
        p95 = f"{x['p95TurnSeconds']} s" if x["p95TurnSeconds"] else "-"
        lines.append(f"| {CONFIG_NAMES[c]} | {x['attackRuns']} | {x['breaches']} | {asr} | {x['approverAlerts']} | {legit} | {fh} | {p50} | {p95} |")
    fams = sorted({f for c in cfgs for f in s[c]["byFamily"]})
    lines += ["", "Breaches by attack family (breaches / runs):", "", "| Family | " + " | ".join(cfgs) + " |",
              "| --- | " + " | ".join("---:" for _ in cfgs) + " |"]
    for f in fams:
        cells = []
        for c in cfgs:
            b = s[c]["byFamily"].get(f)
            cells.append(f"{b['breaches']}/{b['runs']}" if b else "-")
        lines.append(f"| {f} | " + " | ".join(cells) + " |")
    breaches = [r for r in data["results"] if r["kind"] == "attack" and r["breach"]]
    if breaches:
        lines += ["", "Every breach:", "", "| Config | Attack | Language | What happened |", "| --- | --- | --- | --- |"]
        for r in breaches:
            lines.append(f"| {r['config']} | {r['id']} | {r['lang']} | {'; '.join(r['violations'])} |")
    misses = [r for r in data["results"] if r["kind"] == "legit" and r["outcome"] != "complete"]
    if misses:
        lines += ["", "Legitimate tasks not completed:", "", "| Config | Task | Outcome |", "| --- | --- | --- |"]
        for r in misses:
            lines.append(f"| {r['config']} | {r['id']} | {r['outcome']} |")
    return "\n".join(lines) + "\n"


def main() -> None:
    path = Path(sys.argv[1])
    data = json.loads(path.read_text())
    stem = path.with_suffix("")
    Path(f"{stem}.md").write_text(tables(data))
    chart_asr(data["summary"], Path(f"{stem}-asr.png"))
    chart_layers(data["summary"], Path(f"{stem}-layers.png"))
    print(f"wrote {stem}.md, {stem}-asr.png, {stem}-layers.png")


if __name__ == "__main__":
    main()
