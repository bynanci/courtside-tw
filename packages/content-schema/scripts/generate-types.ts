import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import prettier from "prettier"

type JsonPrimitive = boolean | null | number | string

type JsonSchema = {
  readonly $ref?: string
  readonly $defs?: Record<string, JsonSchema>
  readonly allOf?: readonly JsonSchema[]
  readonly const?: JsonPrimitive
  readonly enum?: readonly JsonPrimitive[]
  readonly if?: JsonSchema
  readonly items?: JsonSchema
  readonly minItems?: number
  readonly oneOf?: readonly JsonSchema[]
  readonly properties?: Record<string, JsonSchema>
  readonly required?: readonly string[]
  readonly then?: JsonSchema
  readonly type?: string
}

type ContractSchema = JsonSchema & {
  readonly $defs: Record<string, JsonSchema>
}

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(packageDirectory, "../../..")
const schemaPath = path.join(repositoryRoot, "contracts/content-document.schema.json")
const outputPath = path.join(
  repositoryRoot,
  "packages/content-schema/src/generated/content-document.ts"
)

const schema = JSON.parse(await readFile(schemaPath, "utf8")) as ContractSchema
const definitionNames = new Map(
  Object.keys(schema.$defs).map((definitionName) => [definitionName, toPascalCase(definitionName)])
)
const blockDefinition = schema.$defs.block
if (blockDefinition === undefined) {
  throw new Error("Canonical ContentDocument schema is missing the block definition")
}

const unformattedGenerated = [
  "/* Generated from contracts/content-document.schema.json. Do not edit by hand. */",
  "",
  ...Object.entries(schema.$defs)
    .filter(([definitionName]) => definitionName !== "block")
    .map(([definitionName, definition]) =>
      renderDefinition(definitionNames.get(definitionName)!, definition)
    ),
  renderBlockDefinition(blockDefinition, definitionNames),
  renderRootDefinition(schema, definitionNames),
  ""
].join("\n\n")
const prettierOptions = (await prettier.resolveConfig(outputPath)) ?? {}
const generated = await prettier.format(unformattedGenerated, {
  ...prettierOptions,
  filepath: outputPath
})

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, generated, "utf8")

function renderDefinition(name: string, definition: JsonSchema): string {
  if (definition.type === "object") {
    return `export interface ${name} ${renderObject(definition, definitionNames)}`
  }

  return `export type ${name} = ${renderType(definition, definitionNames)}`
}

function renderBlockDefinition(definition: JsonSchema, names: ReadonlyMap<string, string>): string {
  const blockTypes = definition.properties?.type?.enum ?? []
  const payloadTypes = new Map<string, string>()

  for (const condition of definition.allOf ?? []) {
    const blockType = condition.if?.properties?.type?.const
    const payloadRef = condition.then?.properties?.payload?.$ref
    if (typeof blockType === "string" && payloadRef !== undefined) {
      payloadTypes.set(blockType, refType(payloadRef, names))
    }
  }

  const variants = blockTypes.map((blockType) => {
    if (typeof blockType !== "string") {
      throw new Error("ContentDocument block types must be strings")
    }

    const payloadType = payloadTypes.get(blockType)
    if (payloadType === undefined) {
      throw new Error(`Missing payload mapping for ContentDocument block type: ${blockType}`)
    }

    const name = `${toPascalCase(blockType)}Block`
    const code = `export interface ${name} {\n${indent(
      [
        `id: ${refType("#/$defs/uuid", names)}`,
        `type: ${literal(blockType)}`,
        "version: 1",
        `payload: ${payloadType}`
      ].join("\n")
    )}\n}`

    return { code, name }
  })

  return `${variants.map(({ code }) => code).join("\n\n")}\n\nexport type Block = ${variants
    .map(({ name }) => name)
    .join(" | ")}`
}

function renderRootDefinition(
  schemaDefinition: ContractSchema,
  names: ReadonlyMap<string, string>
): string {
  return `export interface ContentDocument ${renderObject(schemaDefinition, names)}`
}

function renderType(definition: JsonSchema, names: ReadonlyMap<string, string>): string {
  if (definition.$ref !== undefined) {
    return refType(definition.$ref, names)
  }

  if (definition.const !== undefined) {
    return literal(definition.const)
  }

  if (definition.enum !== undefined) {
    return definition.enum.map(literal).join(" | ")
  }

  if (definition.oneOf !== undefined) {
    return definition.oneOf.map((variant) => renderType(variant, names)).join(" | ")
  }

  if (definition.type === "array") {
    if (definition.items === undefined) {
      throw new Error("Array schema is missing items")
    }

    const itemType = renderType(definition.items, names)
    const minimum = definition.minItems ?? 0
    if (minimum === 0) {
      return `Array<${itemType}>`
    }
    return `[${Array.from({ length: minimum }, () => itemType).join(", ")}, ...Array<${itemType}>]`
  }

  if (definition.type === "object") {
    return renderObject(definition, names)
  }

  if (definition.type === "string") {
    return "string"
  }

  if (definition.type === "boolean") {
    return "boolean"
  }

  if (definition.type === "integer" || definition.type === "number") {
    return "number"
  }

  throw new Error(`Unsupported JSON Schema type: ${definition.type ?? "missing"}`)
}

function renderObject(definition: JsonSchema, names: ReadonlyMap<string, string>): string {
  const properties = definition.properties ?? {}
  const required = new Set(definition.required ?? [])
  const lines = Object.entries(properties).map(([propertyName, property]) => {
    const optional = required.has(propertyName) ? "" : "?"
    return `${propertyKey(propertyName)}${optional}: ${renderType(property, names)}`
  })

  return `{\n${indent(lines.join("\n"))}\n}`
}

function refType(reference: string, names: ReadonlyMap<string, string>): string {
  const definitionName = reference.split("/").at(-1)
  if (definitionName === undefined) {
    throw new Error(`Invalid JSON Schema reference: ${reference}`)
  }

  const typeName = names.get(definitionName)
  if (typeName === undefined) {
    throw new Error(`Unknown JSON Schema definition reference: ${reference}`)
  }
  return typeName
}

function propertyKey(propertyName: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(propertyName)
    ? propertyName
    : JSON.stringify(propertyName)
}

function literal(value: JsonPrimitive): string {
  return JSON.stringify(value)
}

function toPascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("")
}

function indent(value: string): string {
  return value
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")
}
