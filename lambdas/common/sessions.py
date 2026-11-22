"""Session IDs carry their household: "kv-<householdId>-<uuid>".

They are minted server-side (scripts/kavach_client.py, later the /chat API),
and L4 binds every tool call to the real harness session, so Cedar (L5), which
sees only tool input, can select the household's limits from the prefix.
"""

import re
import uuid

PREFIX = "kv-"
_PATTERN = re.compile(r"^kv-(hh-[a-z0-9]+)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def mint(household_id: str) -> str:
    if not re.fullmatch(r"hh-[a-z0-9]+", household_id):
        raise ValueError(f"bad household id {household_id!r}")
    return f"{PREFIX}{household_id}-{uuid.uuid4()}"


def household_of(session_id: str) -> str | None:
    m = _PATTERN.match(session_id or "")
    return m.group(1) if m else None
