"""Script-side client for the deployed Kavach harness: stack outputs, sessions, turns.

The harness call itself lives in lambdas/common/harness.py, shared with the API Lambda.
"""

import sys
from dataclasses import dataclass
from functools import cache
from pathlib import Path

import boto3

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lambdas"))
from common import harness, sessions  # noqa: E402
from common.harness import LANGUAGES, Turn  # noqa: E402,F401  (re-exported for scripts)

REGION = "us-east-1"
STACK = "Kavach"
ROOT = Path(__file__).resolve().parents[1]


@cache
def outputs() -> dict:
    stack = boto3.client("cloudformation", region_name=REGION).describe_stacks(StackName=STACK)["Stacks"][0]
    return {o["OutputKey"]: o["OutputValue"] for o in stack["Outputs"]}


def ddb_table(name: str):
    return boto3.resource("dynamodb", region_name=REGION).Table(outputs()[f"Table{name.replace('_', '')}"])


@dataclass
class Session:
    session_id: str
    household: dict
    language: str

    def system_prompt(self) -> str:
        return harness.system_prompt(self.session_id, self.household, self.language)


def start_session(household_id: str, language: str | None = None) -> Session:
    household = ddb_table("households").get_item(Key={"householdId": household_id})["Item"]
    sid = sessions.mint(household_id)
    ddb_table("sessions").put_item(
        Item={"sessionId": sid, "householdId": household_id, "tainted": False, "coercionScore": 0}
    )
    return Session(sid, household, language or household.get("language", "en"))


def invoke(harness_arn: str, session_id: str, system_prompt: str, messages: list) -> Turn:
    return harness.invoke(harness_arn, session_id, system_prompt, messages, region=REGION)


def send(session: Session, text: str) -> Turn:
    return invoke(
        outputs()["HarnessArn"],
        session.session_id,
        session.system_prompt(),
        [{"role": "user", "content": [{"text": text}]}],
    )
