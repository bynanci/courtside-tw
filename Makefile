SHELL := /bin/sh

.DEFAULT_GOAL := verify

PNPM ?= pnpm
NODE_VERSION := 24.14.0
PNPM_VERSION := 11.7.0
PNPM_STORE_DIR ?= /tmp/courtside-tw-pnpm-store

.PHONY: setup dev demo format format-check lint typecheck test contract contract-schema contract-openapi contract-observability contract-analytics contract-traceability contract-beta-release verify check-toolchain check-root-contract _run-workspace

setup: check-toolchain
	@if test -f pnpm-lock.yaml; then \
		$(PNPM) install --frozen-lockfile --ignore-scripts --store-dir "$(PNPM_STORE_DIR)"; \
	elif test -n "$$(find apps packages -mindepth 2 -maxdepth 2 -name package.json -print 2>/dev/null)"; then \
		$(PNPM) install --lockfile=false --ignore-scripts --store-dir "$(PNPM_STORE_DIR)"; \
	else \
		echo "setup: no workspace dependencies yet; install skipped"; \
	fi

dev: check-toolchain
	@$(MAKE) --no-print-directory _run-workspace SCRIPT=dev

demo: check-toolchain
	@$(PNPM) run demo

format:
	@$(PNPM) run format

format-check: check-toolchain
	@$(PNPM) run format:check

lint: check-toolchain
	@$(MAKE) --no-print-directory _run-workspace SCRIPT=lint

typecheck: check-toolchain
	@$(MAKE) --no-print-directory _run-workspace SCRIPT=typecheck

test: check-toolchain
	@$(MAKE) --no-print-directory _run-workspace SCRIPT=test

contract: check-toolchain contract-schema contract-openapi contract-observability contract-analytics contract-traceability contract-beta-release
	@$(MAKE) --no-print-directory _run-workspace SCRIPT=contract

contract-schema: check-toolchain
	@$(PNPM) run contract:schema

contract-openapi: check-toolchain
	@$(PNPM) run contract:openapi

contract-observability: check-toolchain
	@$(PNPM) run contract:observability

contract-analytics: check-toolchain
	@$(PNPM) run contract:analytics

contract-traceability: check-toolchain
	@$(PNPM) run contract:traceability

contract-beta-release: check-toolchain
	@$(PNPM) run contract:beta-release

verify: check-toolchain check-root-contract format-check lint typecheck test contract
	@echo "verify: pass (root contract and available workspace checks)"

check-toolchain:
	@command -v node >/dev/null 2>&1 || { echo "error: Node.js $(NODE_VERSION) is required" >&2; exit 1; }
	@node -e 'if (process.versions.node !== "$(NODE_VERSION)") { console.error("error: expected Node.js $(NODE_VERSION), found " + process.versions.node); process.exit(1); }'
	@command -v $(PNPM) >/dev/null 2>&1 || { echo "error: pnpm $(PNPM_VERSION) is required" >&2; exit 1; }
	@pnpm_version=$$($(PNPM) --version); node -e 'if (process.argv[1] !== "$(PNPM_VERSION)") { console.error("error: expected pnpm $(PNPM_VERSION), found " + process.argv[1]); process.exit(1); }' "$$pnpm_version"

check-root-contract: check-toolchain
	@node -e 'const fs = require("node:fs"); const required = ["pnpm-workspace.yaml", "package.json", ".node-version", ".npmrc", "Makefile", "README.md"]; for (const file of required) { if (!fs.existsSync(file)) throw new Error("missing T003 file: " + file); } const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")); const scripts = ["setup", "dev", "lint", "typecheck", "test", "contract", "verify"]; for (const script of scripts) { if (!pkg.scripts || !pkg.scripts[script]) throw new Error("missing root script: " + script); } if (pkg.private !== true) throw new Error("root package must be private"); if (pkg.packageManager !== "pnpm@$(PNPM_VERSION)") throw new Error("packageManager must pin pnpm@$(PNPM_VERSION)"); if (pkg.engines.node !== "24.14.x" || pkg.engines.pnpm !== "11.7.x") throw new Error("runtime engines are not pinned"); const workspace = fs.readFileSync("pnpm-workspace.yaml", "utf8"); if (!workspace.includes("apps/*") || !workspace.includes("packages/*") || !workspace.includes("verifyDepsBeforeRun: false")) throw new Error("workspace globs or deterministic run setting are incomplete"); if (fs.readFileSync(".node-version", "utf8").trim() !== "$(NODE_VERSION)") throw new Error(".node-version is not pinned"); console.log("root contract: pass");'

_run-workspace: check-toolchain
	@$(PNPM) -r --if-present run $(SCRIPT)
