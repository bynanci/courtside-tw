#!/usr/bin/env bash
set -euo pipefail

artifact_dir="artifacts/android-chrome"
server_log="$artifact_dir/e2e-server.log"
smoke_log="$artifact_dir/offline-smoke.json"
mkdir -p "$artifact_dir"

server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" >/dev/null 2>&1 || true
  fi
  adb forward --remove tcp:9222 >/dev/null 2>&1 || true
  adb reverse --remove tcp:4173 >/dev/null 2>&1 || true
  adb reverse --remove tcp:4010 >/dev/null 2>&1 || true
}
trap cleanup EXIT

(
  cd apps/web
  node tests/e2e/start-server.mjs
) >"$server_log" 2>&1 &
server_pid=$!

for _ in $(seq 1 90); do
  if curl --fail --silent --show-error http://127.0.0.1:4173/issues/issue-2026-01 >/dev/null; then
    break
  fi
  if ! kill -0 "$server_pid" >/dev/null 2>&1; then
    tail -200 "$server_log"
    exit 1
  fi
  sleep 2
done
curl --fail --silent --show-error http://127.0.0.1:4173/issues/issue-2026-01 >/dev/null

adb reverse tcp:4173 tcp:4173
adb reverse tcp:4010 tcp:4010
adb shell am force-stop com.android.chrome
adb shell 'echo "chrome --disable-fre --no-first-run --no-default-browser-check --disable-default-apps" > /data/local/tmp/chrome-command-line'
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard || true
adb shell am start -W -a android.intent.action.VIEW \
  -d http://127.0.0.1:4173/issues/issue-2026-01 com.android.chrome
adb forward tcp:9222 localabstract:chrome_devtools_remote

for _ in $(seq 1 60); do
  if curl --fail --silent --show-error http://127.0.0.1:9222/json/version >/dev/null; then
    break
  fi
  sleep 2
done
curl --fail --silent --show-error http://127.0.0.1:9222/json/version \
  >"$artifact_dir/cdp-version.json"
adb shell dumpsys package com.android.chrome | sed -n '/versionName=/p' \
  >"$artifact_dir/chrome-version.txt"

pnpm --filter @courtside/web exec node scripts/android-chrome-offline-smoke.mjs \
  | tee "$smoke_log"
