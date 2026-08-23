#!/usr/bin/env bash
set -Eeuo pipefail

artifact_dir="artifacts/android-chrome"
server_log="$artifact_dir/e2e-server.log"
smoke_log="$artifact_dir/offline-smoke.json"
performance_log="$artifact_dir/performance-smoke.json"
mkdir -p "$artifact_dir"

server_pid=""
diagnostic_phase="startup"
cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" >/dev/null 2>&1 || true
  fi
  adb forward --remove tcp:9222 >/dev/null 2>&1 || true
  adb reverse --remove tcp:4173 >/dev/null 2>&1 || true
  adb reverse --remove tcp:4010 >/dev/null 2>&1 || true
  adb shell am clear-debug-app >/dev/null 2>&1 || true
}
trap cleanup EXIT

capture_diagnostics() {
  local exit_code="$1"
  local failed_line="$2"
  local failed_command="$3"
  {
    printf 'phase=%s\n' "$diagnostic_phase"
    printf 'exit_code=%s\n' "$exit_code"
    printf 'line=%s\n' "$failed_line"
    printf 'command=%s\n' "$failed_command"
  } >"$artifact_dir/failure-context.txt"
  timeout --kill-after=2s 15s adb get-state >"$artifact_dir/adb-state.txt" 2>&1 || true
  timeout --kill-after=2s 15s adb shell uiautomator dump /sdcard/courtside-window.xml \
    >"$artifact_dir/uiautomator.txt" 2>&1 || true
  timeout --kill-after=2s 15s adb pull /sdcard/courtside-window.xml "$artifact_dir/window.xml" \
    >"$artifact_dir/window-pull.txt" 2>&1 || true
  timeout --kill-after=2s 15s adb shell dumpsys activity activities \
    >"$artifact_dir/activities.txt" 2>&1 || true
  timeout --kill-after=2s 15s adb shell dumpsys window windows \
    >"$artifact_dir/windows.txt" 2>&1 || true
  timeout --kill-after=2s 15s adb logcat -d -v threadtime -t 2000 \
    >"$artifact_dir/logcat.txt" 2>&1 || true
  timeout --kill-after=2s 15s adb exec-out screencap -p \
    >"$artifact_dir/screenshot.png" 2>/dev/null || true
  curl --max-time 5 --fail --silent --show-error http://127.0.0.1:9222/json/version \
    >"$artifact_dir/cdp-version-failure.json" 2>"$artifact_dir/cdp-version-failure.txt" || true
}

on_error() {
  local exit_code="$1"
  local failed_line="$2"
  local failed_command="$3"
  trap - ERR
  capture_diagnostics "$exit_code" "$failed_line" "$failed_command"
  exit "$exit_code"
}
trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR

run_logged_smoke() {
  local smoke_phase="$1"
  local script_path="$2"
  local output_path="$3"
  local call_line="$4"
  diagnostic_phase="$smoke_phase"

  if pnpm --filter @courtside/web exec node "$script_path" | tee "$output_path"; then
    return 0
  else
    local producer_status="${PIPESTATUS[0]}" sink_status="${PIPESTATUS[1]}"
    local exit_code="$producer_status"
    local failed_command="pnpm --filter @courtside/web exec node $script_path"
    if [[ "$producer_status" -eq 0 ]]; then
      exit_code="$sink_status"
      failed_command="tee $output_path"
    fi
    trap - ERR
    capture_diagnostics "$exit_code" "$call_line" "$failed_command"
    exit "$exit_code"
  fi
}

launch_chrome() {
  local launch_phase="$1"
  local target_url="$2"
  diagnostic_phase="$launch_phase-launch"
  adb forward --remove tcp:9222 >/dev/null 2>&1 || true
  adb shell am force-stop com.android.chrome
  adb shell input keyevent KEYCODE_WAKEUP
  adb shell wm dismiss-keyguard || true
  adb shell am start -W \
    -n com.android.chrome/com.google.android.apps.chrome.Main \
    -a android.intent.action.VIEW \
    -d "$target_url" \
    --ez skip_first_run_experience true
  adb forward tcp:9222 localabstract:chrome_devtools_remote

  local cdp_ready=false
  for _ in $(seq 1 60); do
    if curl --fail --silent --show-error http://127.0.0.1:9222/json/version >/dev/null; then
      cdp_ready=true
      break
    fi
    sleep 2
  done
  if [[ "$cdp_ready" != "true" ]]; then
    return 1
  fi
  curl --fail --silent --show-error http://127.0.0.1:9222/json/version \
    >"$artifact_dir/cdp-version-$launch_phase.json"
}

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
# Chrome's production Android build only reads /data/local/tmp/chrome-command-line
# when the package is the active debug app (or the image is eng/userdebug). This
# keeps the Play Store system image on the real Chrome binary while making the
# documented automation-only --disable-fre switch effective.
adb shell am set-debug-app --persistent com.android.chrome
adb shell 'echo "chrome --disable-fre --no-first-run --no-default-browser-check --disable-default-apps" > /data/local/tmp/chrome-command-line'
adb shell dumpsys package com.android.chrome | sed -n '/versionName=/p' \
  >"$artifact_dir/chrome-version.txt"

launch_chrome "offline" "http://127.0.0.1:4173/issues/issue-2026-01"
run_logged_smoke \
  "offline-smoke" \
  "scripts/android-chrome-offline-smoke.mjs" \
  "$smoke_log" \
  "$LINENO"

# CDP routing belongs to the Chrome process. A fresh process/context prevents
# in-memory routes, renderer state and page lifecycle from contaminating the
# independent performance verdict.
launch_chrome \
  "performance" \
  "http://127.0.0.1:4173/articles/opening-night?issue=issue-2026-01"
run_logged_smoke \
  "performance-smoke" \
  "scripts/android-chrome-performance-smoke.mjs" \
  "$performance_log" \
  "$LINENO"
