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

exact_head_evidence_path="${EXACT_HEAD_EVIDENCE_PATH:-artifacts/exact-head.json}"
mkdir -p "$(dirname "$exact_head_evidence_path")"
SOURCE_HEAD_EXPECTED="$expected_source_head" \
SOURCE_HEAD_ACTUAL="$actual_source_head" \
python3 - "$exact_head_evidence_path" <<'PY'
import json
import os
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
path.write_text(
    json.dumps(
        {
            "expected_source_head": os.environ["SOURCE_HEAD_EXPECTED"],
            "source_head_sha": os.environ["SOURCE_HEAD_ACTUAL"],
            "source_event": os.environ.get("GITHUB_EVENT_NAME", "local"),
            "source_ref": os.environ.get("GITHUB_HEAD_REF")
            or os.environ.get("GITHUB_REF_NAME", "local"),
            "github_sha": os.environ.get("GITHUB_SHA", ""),
            "github_repository": os.environ.get("GITHUB_REPOSITORY", ""),
            "github_workflow": os.environ.get("GITHUB_WORKFLOW", ""),
            "github_job": os.environ.get("GITHUB_JOB", ""),
            "github_run_id": os.environ.get("GITHUB_RUN_ID", ""),
            "github_run_number": os.environ.get("GITHUB_RUN_NUMBER", ""),
            "github_run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT", ""),
            "github_ref": os.environ.get("GITHUB_REF", ""),
            "github_base_ref": os.environ.get("GITHUB_BASE_REF", ""),
        },
        indent=2,
        sort_keys=True,
    )
    + "\n",
    encoding="utf-8",
)
PY
cat "$exact_head_evidence_path"
