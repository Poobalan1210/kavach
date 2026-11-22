"""Phase 1 spike hook. Decides by the `mode` the model passes to spike_echo:
allow -> allow, deny -> deny, throw -> raises (the harness's failureMode=deny
must turn that into a deny). Logs the raw event so later phases can rely on
the real payload shape.
"""

import json
import logging

log = logging.getLogger()
log.setLevel(logging.INFO)


def lambda_handler(event, _context):
    log.info("HOOK_EVENT %s", json.dumps(event))
    if event.get("event") != "before_tool_call":
        return {"decision": "allow"}

    tool_input = event["context"].get("toolInput") or {}
    if isinstance(tool_input, str):
        tool_input = json.loads(tool_input)
    mode = tool_input.get("mode")

    if mode == "throw":
        raise RuntimeError("spike: deliberate hook failure")
    if mode == "allow":
        return {"decision": "allow", "reason": "spike: allowed"}
    return {"decision": "deny", "reason": f"spike: denied mode={mode!r}"}
