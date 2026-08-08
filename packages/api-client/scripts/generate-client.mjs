import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const openapiPath = path.resolve(packageRoot, "../../contracts/openapi.yaml")
const generatedPath = path.resolve(packageRoot, "src/generated/openapi.d.ts")
const binDirectory = path.resolve(packageRoot, "node_modules/.bin")

execFileSync(path.join(binDirectory, "openapi-typescript"), [openapiPath, "-o", generatedPath], {
  cwd: packageRoot,
  stdio: "inherit"
})
execFileSync(path.join(binDirectory, "prettier"), ["--write", generatedPath], {
  cwd: packageRoot,
  stdio: "inherit"
})
