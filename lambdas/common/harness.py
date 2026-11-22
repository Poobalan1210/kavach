"""Calling the Kavach harness: the per-session system prompt and the parsed stream.

Shared by the API Lambda (the apps) and scripts/kavach_client.py (tests, benchmark).
"""

import time
from dataclasses import dataclass, field
from pathlib import Path

import boto3
from botocore.exceptions import EventStreamError

LANGUAGES = {"en": "English", "hi": "Hindi", "ta": "Tamil", "hinglish": "Hinglish"}
# Copied from harness/system-prompt.md by scripts/build_rules.py.
PROMPT_PATH = Path(__file__).with_name("system_prompt.generated.md")


@dataclass
class Turn:
    text: str = ""
    tool_calls: list = field(default_factory=list)
    hook_events: list = field(default_factory=list)
    stop_reason: str | None = None
    usage: dict = field(default_factory=dict)
    errors: list = field(default_factory=list)
    seconds: float = 0.0


def system_prompt(session_id: str, household: dict, language: str) -> str:
    base = PROMPT_PATH.read_text().strip()
    approver = "the user themself (Self-protect mode)" if household["approverId"] == "self" else household["approverName"]
    return (
        f"{base}\n\nSession:\n- sessionId: {session_id}\n- Household owner: {household['ownerName']}\n"
        f"- Family approver: {approver}\n- Preferred language: {LANGUAGES.get(language, 'English')}"
    )


def invoke(harness_arn: str, session_id: str, prompt: str, messages: list, region: str | None = None) -> Turn:
    """One InvokeHarness call, with the stream parsed into a Turn."""
    client = boto3.client("bedrock-agentcore", region_name=region)
    t0 = time.monotonic()
    response = client.invoke_harness(
        harnessArn=harness_arn,
        runtimeSessionId=session_id,
        actorId=session_id,  # scopes any harness memory to this session; never shared across sessions
        systemPrompt=[{"text": prompt}],
        messages=messages,
    )
    turn = Turn()
    try:
        _read_stream(response["stream"], turn)
    except EventStreamError as e:  # e.g. the model hit its output limit mid-turn
        turn.errors.append({"message": str(e)[:500]})
    turn.seconds = time.monotonic() - t0
    return turn


def _read_stream(stream, turn: Turn) -> None:
    current = None
    for event in stream:
        if "hookEvent" in event:
            turn.hook_events.append(event["hookEvent"])
        elif "contentBlockStart" in event:
            start = event["contentBlockStart"].get("start", {})
            if "toolUse" in start:
                current = {"name": start["toolUse"].get("name"), "toolUseId": start["toolUse"].get("toolUseId"), "input": ""}
                turn.tool_calls.append(current)
        elif "contentBlockDelta" in event:
            delta = event["contentBlockDelta"].get("delta", {})
            if "text" in delta:
                turn.text += delta["text"]
            elif "toolUse" in delta and current is not None:
                current["input"] += delta["toolUse"].get("input", "")
        elif "contentBlockStop" in event:
            current = None
        elif "messageStop" in event:
            turn.stop_reason = event["messageStop"].get("stopReason")
        elif "metadata" in event:
            turn.usage = event["metadata"].get("usage", {})
        elif "runtimeClientError" in event:
            turn.errors.append(event["runtimeClientError"])
