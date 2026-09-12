import { createHash } from "node:crypto"

// TASK_STATUS_PURE_START
const TASK_STATUS_RECEIPT_PATH = ".loop/evidence/task-status-reconciliation.json"
const TASK_STATUS_DOCUMENT_PATHS = Object.freeze([
  "README.md",
  "specs/001-taiwan-basketball-magazine-ebook/tasks.md",
  "docs/design/arena-editorial-v3-tasks.md"
])
const TASK_STATUS_RECEIPT_SCHEMA = "courtside-task-status-reconciliation/v1"
const taskReceiptHash = (text) => createHash("sha256").update(text).digest("hex")

function validateTaskStatusReceipt() {
  return { status: "FAIL", errors: ["task-status receipt validation is not implemented"], allowedPaths: [] }
}
// TASK_STATUS_PURE_END

const TASK_RECEIPT_BOOTSTRAP_PATHS = Object.freeze([
  "scripts/task-status-receipts.mjs",
  "scripts/test/task-status-receipts.test.mjs",
  "scripts/validate-traceability.mjs",
  "scripts/test/validate-traceability.test.mjs",
  ".github/workflows/t086-required-gate.yml",
  "scripts/test/task-status-gate.test.mjs"
])

function validateTaskReceiptBootstrap() {
  return { status: "FAIL", errors: ["task-status receipt bootstrap is not implemented"], allowedPaths: [] }
}

export {
  TASK_STATUS_RECEIPT_PATH,
  TASK_STATUS_DOCUMENT_PATHS,
  TASK_STATUS_RECEIPT_SCHEMA,
  TASK_RECEIPT_BOOTSTRAP_PATHS,
  taskReceiptHash,
  validateTaskStatusReceipt,
  validateTaskReceiptBootstrap
}
