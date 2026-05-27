# Sample script that produces a clean Python KeyError, used as the
# demo-recording fixture. Run with:
#
#   python assets/demo-error.py
#
# The traceback is short enough to fit in one terminal viewport, which
# means the auto-scroll capture will show the full error in one frame —
# perfect for the README hero GIF.

USERS = {
    "alice": {"id": 1, "role": "admin"},
    "bob": {"id": 2, "role": "viewer"},
}


def get_user_role(username: str) -> str:
    user = USERS[username]
    return user["user_id"]  # ← bug: key is "id", not "user_id"


if __name__ == "__main__":
    print(get_user_role("alice"))
