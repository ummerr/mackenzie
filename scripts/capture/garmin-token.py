#!/usr/bin/env python3
"""
The Garmin token broker for the nightly capture (DECISIONS.md 2026-10-12).

Garmin's golf API answers at connectapi.garmin.com to a bearer token that the
python-garminconnect library (0.3.x, no garth) obtains once with a password
and an MFA code and then refreshes on its own. This script does nothing but
hold that handshake; the capture itself is scripts/capture/garmin.mjs.

  --bootstrap   once, on a laptop: log in (MFA prompt if the account has it)
                and write the token file to --token-dir
  --refresh     unattended: load the token file, refresh it if it is near
                expiry, write it back, and emit the request headers the
                capture must send to a file named by --out (mode 600)

The headers file is the only thing the capture reads. It is never committed,
never printed, and lives outside the repo (or under .capture-state/, which is
ignored). A refresh that fails exits 3 and names the re-bootstrap command.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
from pathlib import Path

try:
    from garminconnect import Garmin
except ImportError:  # pragma: no cover
    sys.stderr.write("garminconnect is not installed: pip install garminconnect==0.3.17\n")
    sys.exit(2)

REBOOTSTRAP = (
    "python3 scripts/capture/garmin-token.py --bootstrap, then re-set the "
    "GARMIN_TOKENS secret (see NEXT.md, 'Nightly capture')"
)


def write_private(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.chmod(path, 0o600)


def bootstrap(token_dir: str) -> int:
    email = os.environ.get("GARMIN_EMAIL") or input("Garmin email: ").strip()
    password = os.environ.get("GARMIN_PASSWORD") or getpass.getpass("Garmin password: ")
    client = Garmin(email, password, prompt_mfa=lambda: input("Garmin MFA code: ").strip())
    client.login(tokenstore=token_dir)
    # login() dumps on a fresh credential login; dump again so a refresh-only
    # path (tokens already present) also leaves the newest tokens on disk.
    client.client.dump(token_dir)
    where = Path(token_dir).expanduser() / "garmin_tokens.json"
    print(f"tokens written to {where}")
    print("next:  gh secret set GARMIN_TOKENS < <(base64 < " + str(where) + ")")
    return 0


def refresh(token_dir: str, out: str) -> int:
    email = os.environ.get("GARMIN_EMAIL") or None
    password = os.environ.get("GARMIN_PASSWORD") or None
    token_file = Path(token_dir).expanduser() / "garmin_tokens.json"
    if not token_file.exists() and not (email and password):
        sys.stderr.write(f"no token file at {token_file} and no GARMIN_EMAIL/GARMIN_PASSWORD — {REBOOTSTRAP}\n")
        return 3
    try:
        client = Garmin(email, password)
        client.login(tokenstore=token_dir)
        client.client.dump(token_dir)
        headers = client.client.get_api_headers()
    except Exception as e:  # noqa: BLE001 — every failure here means "a person must re-bootstrap"
        sys.stderr.write(f"garmin token refresh failed: {type(e).__name__}: {e}\n")
        sys.stderr.write(f"fix: {REBOOTSTRAP}\n")
        return 3
    # The capture matches the SPA's own Accept; the library's other headers
    # are what the native app sends and are kept as-is.
    headers["Accept"] = "*/*"
    write_private(Path(out), json.dumps({"headers": headers}))
    print(f"garmin: token ok, headers written to {out}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--bootstrap", action="store_true")
    mode.add_argument("--refresh", action="store_true")
    ap.add_argument("--token-dir", default=os.environ.get("GARMIN_TOKEN_DIR", "~/.garminconnect"))
    ap.add_argument("--out", default=os.environ.get("GARMIN_AUTH_OUT"))
    args = ap.parse_args()
    if args.bootstrap:
        return bootstrap(args.token_dir)
    if not args.out:
        sys.stderr.write("--refresh needs --out (or GARMIN_AUTH_OUT)\n")
        return 2
    return refresh(args.token_dir, args.out)


if __name__ == "__main__":
    sys.exit(main())
