"""Machine-readable limits from rules/*.yaml (via rules.generated.json).

L5 (generated Cedar) and L6 (payment Lambda) both read their numbers here, so
the two layers can never drift apart.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class QuietHours:
    start: str  # "23:00"
    end: str  # "06:00"
    threshold_paise: int


@dataclass(frozen=True)
class CategoryHold:
    categories: frozenset
    threshold_paise: int
    delay_hours: int


@dataclass(frozen=True)
class Limits:
    mode: str
    per_payment_paise: int
    daily_paise: int
    blocked_categories: frozenset = field(default_factory=frozenset)
    category_hold: CategoryHold | None = None
    quiet_hours: QuietHours | None = None
    coercion_threshold: float = 0.7


def _enforce(rules: list[dict], rule_id: str) -> dict:
    for r in rules:
        if r["id"] == rule_id:
            return r.get("enforce") or {}
    return {}


def limits_for(mode_doc: dict) -> Limits:
    rules = mode_doc["rules"]
    r3, r4 = _enforce(rules, "R3"), _enforce(rules, "R4")
    if "per_payment_inr" not in r3 or "daily_inr" not in r4:
        raise ValueError(f"{mode_doc['household']['mode']}: R3 and R4 must set per_payment_inr and daily_inr")
    s1, s2 = _enforce(rules, "S1"), _enforce(rules, "S2")
    return Limits(
        mode=mode_doc["household"]["mode"],
        per_payment_paise=int(r3["per_payment_inr"]) * 100,
        daily_paise=int(r4["daily_inr"]) * 100,
        blocked_categories=frozenset(_enforce(rules, "R8").get("blocked_categories", [])),
        category_hold=CategoryHold(frozenset(s1["categories"]), int(s1["threshold_inr"]) * 100, int(s1["delay_hours"]))
        if s1
        else None,
        quiet_hours=QuietHours(s2["quiet_hours"][0], s2["quiet_hours"][1], int(s2["threshold_inr"]) * 100) if s2 else None,
        coercion_threshold=float(_enforce(rules, "R7").get("coercion_threshold", 0.7)),
    )


def in_quiet_hours(hhmm: str, q: QuietHours) -> bool:
    if q.start <= q.end:
        return q.start <= hhmm < q.end
    return hhmm >= q.start or hhmm < q.end
