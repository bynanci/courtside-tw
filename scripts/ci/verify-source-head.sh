#!/usr/bin/env bash

set -euo pipefail

expected_source_head="${EXPECTED_SOURCE_HEAD:-}"
if [[ ! "$expected_source_head" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "EXPECTED_SOURCE_HEAD must be a full commit SHA" >&2
  exit 1
fi

actual_source_head="$(git rev-parse HEAD)"
if [[ "${actual_source_head,,}" != "${expected_source_head,,}" ]]; then
  echo "Checked out source head $actual_source_head does not match $expected_source_head" >&2
  exit 1
fi

printf 'source_head_sha=%s\nsource_event=%s\nsource_ref=%s\n' \
  "$actual_source_head" \
  "${GITHUB_EVENT_NAME:-local}" \
  "${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-local}}"
