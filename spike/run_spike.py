"""Phase 1 "done when" check against the deployed KavachSpike stack.

  allow -> the hook allows; the inline tool call is handed to the client.
  deny  -> the hook denies; the call is skipped and the agent loop continues.
  throw -> the hook raises; failureMode=deny makes it a deny, loop continues.

Writes spike/results.json and exits non-zero if any case fails.
"""

import json
import sys
import uuid
from pathlib import Path

import boto3

REGION = "us-east-1"
STACK = "KavachSpike"


def stack_outputs() -> dict:
    cfn = boto3.client("cloudformation", region_name=REGION)
    outs = cfn.describe_stacks(StackName=STACK)["Stacks"][0]["Outputs"]
    return {o["OutputKey"]: o["OutputValue"] for o in outs}


def read_stream(response) -> dict:
    run = {"text": "", "hook_events": [], "tool_uses": [], "stop_reasons": [], "errors": []}
    current = None
    for event in response["stream"]:
        if "hookEvent" in event:
            run["hook_events"].append(event["hookEvent"])
        elif "contentBlockStart" in event:
            start = event["contentBlockStart"].get("start", {})
            if "toolUse" in start:
                current = {**start["toolUse"], "input": ""}
                run["tool_uses"].append(current)
        elif "contentBlockDelta" in event:
            delta = event["contentBlockDelta"].get("delta", {})
            if "text" in delta:
                run["text"] += delta["text"]
            if "toolUse" in delta and current is not None:
                current["input"] += delta["toolUse"].get("input", "")
        elif "contentBlockStop" in event:
            current = None
        elif "messageStop" in event:
            run["stop_reasons"].append(event["messageStop"].get("stopReason"))
        elif "runtimeClientError" in event:
            run["errors"].append(event["runtimeClientError"])
    return run


def invoke(client, harness_arn: str, mode: str) -> dict:
    session_id = f"spike-{mode}-{uuid.uuid4()}"
    response = client.invoke_harness(
        harnessArn=harness_arn,
        runtimeSessionId=session_id,
        messages=[
            {
                "role": "user",
                "content": [{"text": f'Call spike_echo once with mode "{mode}" and message "hello".'}],
            }
        ],
    )
    run = read_stream(response)
    run["sessionId"] = session_id
    return run


def check(mode: str, run: dict) -> tuple[bool, str]:
    decisions = [h.get("decision") for h in run["hook_events"]]
    handed = [t for t in run["tool_uses"] if t.get("name") == "spike_echo"]
    final = run["stop_reasons"][-1] if run["stop_reasons"] else None
    if run["errors"]:
        return False, f"stream errors: {run['errors']}"
    if mode == "allow":
        ok = "allow" in decisions and handed and final == "tool_use"
        return bool(ok), f"decisions={decisions} handed={len(handed)} stop={final}"
    # deny and throw: the hook must actually have fired and denied (a model that
    # never calls the tool proves nothing). The proposed toolUse block still
    # streams before the hook runs; "handed to the client" means the turn ends
    # on tool_use. A denied call must instead let the loop run on to end_turn.
    ok = "deny" in decisions and "allow" not in decisions and final == "end_turn"
    return bool(ok), f"decisions={decisions} handed={len(handed)} stop={final}"


def main() -> int:
    harness_arn = stack_outputs()["HarnessArn"]
    client = boto3.client("bedrock-agentcore", region_name=REGION)
    results, failed = {}, False
    for mode in ("allow", "deny", "throw"):
        run = invoke(client, harness_arn, mode)
        ok, detail = check(mode, run)
        failed |= not ok
        results[mode] = {"pass": ok, "detail": detail, **run}
        print(f"{'PASS' if ok else 'FAIL'}  {mode:<5}  {detail}")
        print(f"       reply: {run['text'].strip()[:200]!r}")
    out = Path(__file__).with_name("results.json")
    out.write_text(json.dumps(results, indent=2, default=str))
    print(f"wrote {out}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
