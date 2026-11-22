"""Money is stored as integer paise; the model speaks rupees."""

from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

IST = timezone(timedelta(hours=5, minutes=30))


class MoneyError(ValueError):
    pass


def inr_to_paise(amount) -> int:
    if isinstance(amount, bool):
        raise MoneyError("amount must be a number")
    try:
        d = Decimal(str(amount))
    except InvalidOperation as e:
        raise MoneyError(f"invalid amount {amount!r}") from e
    if not d.is_finite() or d <= 0:
        raise MoneyError("amount must be a positive number")
    if d != d.quantize(Decimal("0.01")):
        raise MoneyError("amount has more than 2 decimal places")
    return int((d * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def paise_to_inr(paise: int) -> str:
    rupees, p = divmod(int(paise), 100)
    return f"₹{rupees:,}" + (f".{p:02d}" if p else "")


def ist_now() -> datetime:
    return datetime.now(IST)


def ist_date(dt: datetime | None = None) -> str:
    return (dt or ist_now()).astimezone(IST).date().isoformat()
