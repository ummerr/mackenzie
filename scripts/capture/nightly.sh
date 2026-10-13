#!/usr/bin/env bash
# The nightly loop (DECISIONS.md 2026-10-12): capture what is new, fold it
# in, gate it, commit it. Run by .github/workflows/nightly-capture.yml; runs
# locally too (set CAPTURE_NO_COMMIT=1 to stop before the commit).
#
#   GARMIN_AUTH_FILE   headers file from garmin-token.py --refresh
#   GRINT_USERNAME / GRINT_PASSWORD
#
# Every gate is an existing command. A non-zero exit anywhere stops the run
# before the commit, so main only ever receives a record that validated.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "── capture ─────────────────────────────────────────────"
node scripts/capture/garmin.mjs
node scripts/capture/grint.mjs

if [ -z "$(git status --porcelain -- data/raw)" ]; then
  echo "nothing new — the record is current"
  exit 0
fi
new_raw=$(git status --porcelain -- data/raw | awk '{print $2}')
garmin_n=$(echo "$new_raw" | grep -c 'garmin-export' || true)
grint_n=$(echo "$new_raw" | grep -c 'grint-export' || true)

echo "── refresh ─────────────────────────────────────────────"
pnpm refresh

echo "── gates ───────────────────────────────────────────────"
pnpm typecheck
pnpm test
pnpm build

if [ "${CAPTURE_NO_COMMIT:-}" = "1" ]; then
  echo "CAPTURE_NO_COMMIT=1 — stopping before the commit; review with git status"
  exit 0
fi

echo "── commit ──────────────────────────────────────────────"
git add -A data PROFILE.md public
parts=()
[ "$garmin_n" -gt 0 ] && parts+=("$garmin_n Garmin bundle$([ "$garmin_n" -ne 1 ] && echo s)")
[ "$grint_n" -gt 0 ] && parts+=("$grint_n Grint bundle$([ "$grint_n" -ne 1 ] && echo s)")
summary=$(IFS=,; echo "${parts[*]}" | sed 's/,/, /g')
index=$(node -e "try{const r=require('./data/rounds.json');process.stdout.write(String(r.handicapIndex??'?'))}catch{process.stdout.write('?')}")
git commit -q -m "Nightly capture $(date -u +%Y-%m-%d): ${summary}; index ${index}" \
  -m "$(echo "$new_raw" | sed 's#^#raw: #')"
git push origin HEAD
echo "pushed — Vercel builds it"
