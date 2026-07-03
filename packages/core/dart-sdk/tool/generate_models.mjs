// Generates Dart model classes from the Medusa OpenAPI specs.
// Run: node tool/generate_models.mjs
//
// Output:
//   lib/src/models.dart            (library + part directives)
//   lib/src/models/part_NNN.dart   (chunked class definitions)
//   tool/model_names.json          (manifest of generated class names)

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.resolve(__dirname, "..")
const REPO = path.resolve(PKG, "../../..")

const SPECS = [
  `${REPO}/www/apps/api-reference/specs/admin/openapi.full.yaml`,
  `${REPO}/www/apps/api-reference/specs/store/openapi.full.yaml`,
]
const MODELS_DIR = `${PKG}/lib/src/models`
const LIB_FILE = `${PKG}/lib/src/models.dart`
const MANIFEST = `${__dirname}/model_names.json`

const RESERVED = new Set([
  "assert", "break", "case", "catch", "class", "const", "continue", "default",
  "do", "else", "enum", "extends", "false", "final", "finally", "for", "if",
  "in", "is", "new", "null", "rethrow", "return", "super", "switch", "this",
  "throw", "true", "try", "var", "void", "while", "with", "abstract", "dynamic",
])

// ---- load + merge schemas ---------------------------------------------------
const schemas = {}
for (const f of SPECS) {
  if (!fs.existsSync(f)) {
    console.error(`spec not found: ${f}`)
    process.exit(1)
  }
  const doc = YAML.parse(fs.readFileSync(f, "utf8"))
  const s = (doc.components && doc.components.schemas) || {}
  for (const [name, def] of Object.entries(s)) {
    if (!schemas[name]) schemas[name] = def
  }
}

const sanitizeClass = (name) => name.replace(/[^A-Za-z0-9_]/g, "")
const dartField = (name) => {
  let n = name.replace(/[^A-Za-z0-9_]/g, "_")
  // snake_case -> camelCase (JSON keys are preserved separately for (de)serialization)
  n = n.replace(/_+([A-Za-z0-9])/g, (_, c) => c.toUpperCase()).replace(/_+$/g, "")
  if (n.length === 0) n = "field"
  n = n[0].toLowerCase() + n.slice(1)
  if (/^[0-9]/.test(n)) n = "n" + n
  if (RESERVED.has(n)) n = n + "_"
  return n
}

const refName = (ref) => sanitizeClass(ref.split("/").pop())

// ---- pass 1: classify each schema as object vs wrapper ----------------------
// collectProps flattens allOf and inlines $ref reached through allOf/top-level.
function collectProps(schema, seen = new Set()) {
  const out = { props: {}, required: new Set() }
  if (!schema || typeof schema !== "object") return out
  if (schema.$ref) {
    const n = refName(schema.$ref)
    if (seen.has(n)) return out
    seen.add(n)
    return collectProps(schemas[n], seen)
  }
  if (Array.isArray(schema.allOf)) {
    for (const m of schema.allOf) {
      const sub = collectProps(m, seen)
      Object.assign(out.props, sub.props)
      for (const r of sub.required) out.required.add(r)
    }
  }
  if (schema.properties) {
    Object.assign(out.props, schema.properties)
    if (Array.isArray(schema.required)) {
      for (const r of schema.required) out.required.add(r)
    }
  }
  return out
}

const classKind = {} // name -> "object" | "wrapper"
for (const [name, def] of Object.entries(schemas)) {
  const { props } = collectProps(def)
  classKind[sanitizeClass(name)] = Object.keys(props).length > 0 ? "object" : "wrapper"
}

// ---- pass 2: resolve a property schema to a Dart type + (de)serializers -----
// Returns { type, fromJson(jExpr), toJson(vExpr) }
// `serialize` produces a non-null serialization expression; the emitted toJson
// always guards with `if (field != null)`, so the receiver is never null.
function resolveType(schema) {
  const fallback = {
    type: "dynamic",
    fromJson: (j) => j,
    serialize: (v) => v,
  }
  if (!schema || typeof schema !== "object") return fallback

  if (schema.$ref) {
    const n = refName(schema.$ref)
    if (!classKind[n]) return fallback
    if (classKind[n] === "object") {
      return {
        type: `${n}?`,
        fromJson: (j) => `${j} == null ? null : ${n}.fromJson(${j} as Map<String, dynamic>)`,
        serialize: (v) => `${v}.toJson()`,
      }
    }
    return {
      type: `${n}?`,
      fromJson: (j) => `${j} == null ? null : ${n}.fromJson(${j})`,
      serialize: (v) => `${v}.toJson()`,
    }
  }

  if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) return fallback
  if (Array.isArray(schema.allOf)) {
    // inline allOf used as a property type: treat as opaque map
    return {
      type: "Map<String, dynamic>?",
      fromJson: (j) => `${j} as Map<String, dynamic>?`,
      serialize: (v) => v,
    }
  }

  let type = schema.type
  if (Array.isArray(type)) type = type.find((t) => t !== "null") || "string"

  if (type === "array") {
    const item = resolveType(schema.items || {})
    const itemType = item.type.replace(/\?$/, "")
    return {
      type: `List<${itemType}>?`,
      fromJson: (j) =>
        `(${j} as List?)?.map((e) => ${item.fromJson("e")}).toList().cast<${itemType}>()`,
      serialize: (v) => `${v}.map((e) => ${item.serialize("e")}).toList()`,
    }
  }

  if (type === "object" || schema.properties || schema.additionalProperties) {
    return {
      type: "Map<String, dynamic>?",
      fromJson: (j) => `${j} as Map<String, dynamic>?`,
      serialize: (v) => v,
    }
  }

  if (type === "string") {
    if (schema.format === "date-time" || schema.format === "date") {
      return {
        type: "DateTime?",
        fromJson: (j) => `${j} == null ? null : DateTime.parse(${j} as String)`,
        serialize: (v) => `${v}.toIso8601String()`,
      }
    }
    return { type: "String?", fromJson: (j) => `${j} as String?`, serialize: (v) => v }
  }
  if (type === "integer") {
    return { type: "int?", fromJson: (j) => `(${j} as num?)?.toInt()`, serialize: (v) => v }
  }
  if (type === "number") {
    return { type: "num?", fromJson: (j) => `${j} as num?`, serialize: (v) => v }
  }
  if (type === "boolean") {
    return { type: "bool?", fromJson: (j) => `${j} as bool?`, serialize: (v) => v }
  }
  return fallback
}

// ---- emit -------------------------------------------------------------------
const escapeDoc = (s) =>
  String(s).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)

function emitObject(name, def) {
  const { props } = collectProps(def)
  const fields = []
  for (const [jsonKey, propSchema] of Object.entries(props)) {
    const dn = dartField(jsonKey)
    const rt = resolveType(propSchema)
    fields.push({ jsonKey, dartName: dn, ...rt, desc: propSchema && propSchema.description })
  }

  const lines = []
  if (def.description) lines.push(`/// ${escapeDoc(def.description)}`)
  lines.push(`class ${name} {`)
  // constructor
  lines.push(`  ${name}({`)
  for (const f of fields) lines.push(`    this.${f.dartName},`)
  lines.push(`  });`)
  lines.push("")
  // fields
  for (const f of fields) {
    if (f.desc) lines.push(`  /// ${escapeDoc(f.desc)}`)
    lines.push(`  final ${f.type} ${f.dartName};`)
  }
  lines.push("")
  // fromJson
  lines.push(`  factory ${name}.fromJson(Map<String, dynamic> json) => ${name}(`)
  for (const f of fields) {
    lines.push(`    ${f.dartName}: ${f.fromJson(`json[${JSON.stringify(f.jsonKey)}]`)},`)
  }
  lines.push(`  );`)
  lines.push("")
  // toJson
  lines.push(`  Map<String, dynamic> toJson() => {`)
  for (const f of fields) {
    // Public final fields are not promoted by the null guard, so use `!`.
    lines.push(
      `    if (${f.dartName} != null) ${JSON.stringify(f.jsonKey)}: ${f.serialize(`${f.dartName}!`)},`
    )
  }
  lines.push(`  };`)
  lines.push(`}`)
  return lines.join("\n")
}

function emitWrapper(name, def) {
  const lines = []
  if (def.description) lines.push(`/// ${escapeDoc(def.description)}`)
  lines.push(`class ${name} {`)
  lines.push(`  ${name}([this.value]);`)
  lines.push(`  final dynamic value;`)
  lines.push(`  factory ${name}.fromJson(dynamic json) => ${name}(json);`)
  lines.push(`  dynamic toJson() => value;`)
  lines.push(`}`)
  return lines.join("\n")
}

// dedupe class names, build blocks
const blocks = []
const names = []
const emitted = new Set()
for (const [rawName, def] of Object.entries(schemas)) {
  const name = sanitizeClass(rawName)
  if (emitted.has(name)) continue
  emitted.add(name)
  names.push(name)
  blocks.push(classKind[name] === "object" ? emitObject(name, def) : emitWrapper(name, def))
}

// chunk into part files
fs.rmSync(MODELS_DIR, { recursive: true, force: true })
fs.mkdirSync(MODELS_DIR, { recursive: true })

const CHUNK = 60
const parts = []
for (let i = 0; i < blocks.length; i += CHUNK) {
  const idx = String(parts.length).padStart(3, "0")
  const file = `part_${idx}.dart`
  const body =
    `// GENERATED by tool/generate_models.mjs — do not edit.\n` +
    `part of '../models.dart';\n\n` +
    blocks.slice(i, i + CHUNK).join("\n\n") +
    "\n"
  fs.writeFileSync(`${MODELS_DIR}/${file}`, body)
  parts.push(file)
}

const lib =
  `// GENERATED by tool/generate_models.mjs — do not edit.\n` +
  `// Dart models for the Medusa API, derived from the OpenAPI specs.\n` +
  parts.map((p) => `part 'models/${p}';`).join("\n") +
  "\n"
fs.writeFileSync(LIB_FILE, lib)

fs.writeFileSync(MANIFEST, JSON.stringify(names.sort(), null, 0))

console.log(
  `Generated ${names.length} models (${parts.length} part files) ` +
    `[objects=${names.filter((n) => classKind[n] === "object").length}, ` +
    `wrappers=${names.filter((n) => classKind[n] === "wrapper").length}]`
)
