"""Interactive chat with the deployed harness.

Usage: make chat ARGS="--household hh-kamala --lang ta"
"""

import argparse

from kavach_client import start_session, send


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--household", default="hh-kamala")
    ap.add_argument("--lang", default=None)
    ap.add_argument("--verbose", action="store_true", help="show tool calls and hook decisions")
    args = ap.parse_args()

    session = start_session(args.household, args.lang)
    print(f"session {session.session_id} ({session.household['ownerName']}, {session.language}); Ctrl-D to quit")
    while True:
        try:
            text = input("> ").strip()
        except EOFError:
            break
        if not text:
            continue
        turn = send(session, text)
        if args.verbose:
            for call in turn.tool_calls:
                print(f"  [tool] {call['name']} {call['input']}")
            for hook in turn.hook_events:
                print(f"  [hook] {hook.get('name')}: {hook.get('decision')} {hook.get('reason', '')}")
        for err in turn.errors:
            print(f"  [error] {err}")
        print(turn.text.strip())


if __name__ == "__main__":
    main()
