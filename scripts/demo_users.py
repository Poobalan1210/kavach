"""Create (or reset) the demo sign-ins in the Cognito user pool.

  kamala  senior    hh-kamala   Kamala's app
  arjun   approver  hh-kamala   Arjun's approver app (also the R2/R3 approver)
  priya   senior    hh-priya    Self-protect mode
  judge   judge     (any)       Shield Console; may open either household

Passwords are generated here and written to .env.demo (git-ignored), never to the repo.
"""

import secrets
import string
import sys
from pathlib import Path

import boto3

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kavach_client import REGION, outputs  # noqa: E402

USERS = [("kamala", "senior", "hh-kamala"), ("arjun", "approver", "hh-kamala"), ("priya", "senior", "hh-priya"), ("judge", "judge", None)]
OUT = Path(__file__).resolve().parents[1] / ".env.demo"


def password() -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        p = "".join(secrets.choice(alphabet) for _ in range(16))
        if any(c.islower() for c in p) and any(c.isupper() for c in p) and any(c.isdigit() for c in p):
            return p


def main() -> None:
    idp = boto3.client("cognito-idp", region_name=REGION)
    pool = outputs()["UserPoolId"]
    lines = []
    for user, group, household in USERS:
        attrs = [{"Name": "custom:householdId", "Value": household}] if household else []
        try:
            idp.admin_create_user(UserPoolId=pool, Username=user, UserAttributes=attrs, MessageAction="SUPPRESS")
        except idp.exceptions.UsernameExistsException:
            pass
        pw = password()
        idp.admin_set_user_password(UserPoolId=pool, Username=user, Password=pw, Permanent=True)
        idp.admin_add_user_to_group(UserPoolId=pool, Username=user, GroupName=group)
        lines.append(f"KAVACH_{user.upper()}_PASSWORD={pw}")
        print(f"{user:<7} {group:<9} {household or 'any household'}")
    OUT.write_text("\n".join(lines) + "\n")
    OUT.chmod(0o600)
    print(f"passwords written to {OUT.name} (git-ignored)")


if __name__ == "__main__":
    main()
