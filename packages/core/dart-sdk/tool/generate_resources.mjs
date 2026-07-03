// Generates Dart resource classes from the Medusa JS SDK source, mirroring its
// method names, grouping, paths and HTTP verbs. Response types are taken from
// the generated component models when available; otherwise a typed response
// model is synthesized from the matching OpenAPI path response schema.
//   node tool/generate_resources.mjs   (run after generate_models.mjs)

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import YAML from "yaml"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.resolve(__dirname, "..")
const REPO = path.resolve(PKG, "../../..")
const require = createRequire(`${REPO}/`)
const ts = require("typescript")

const JS_SRC = `${REPO}/packages/core/js-sdk/src`
const OUT_DIR = `${PKG}/lib/src/resources`
const SPECS = [
  `${REPO}/www/apps/api-reference/specs/admin/openapi.full.yaml`,
  `${REPO}/www/apps/api-reference/specs/store/openapi.full.yaml`,
]
const MODELS = new Set(JSON.parse(fs.readFileSync(`${__dirname}/model_names.json`, "utf8")))

const stats = { resources: 0, methods: 0, typed: 0, synthesized: 0, dynamic: 0, skipped: 0, warnings: [] }

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1)
const upperFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const RESERVED = new Set([
  "assert", "break", "case", "catch", "class", "const", "continue", "default",
  "do", "else", "enum", "extends", "false", "final", "finally", "for", "if",
  "in", "is", "new", "null", "rethrow", "return", "super", "switch", "this",
  "throw", "true", "try", "var", "void", "while", "with", "abstract", "dynamic",
])
const safeIdent = (name) => (RESERVED.has(name) ? name + "_" : name)
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
const escapeDoc = (s) =>
  String(s).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)

// ---- load OpenAPI specs: component schemas + path response index ------------
const schemas = {}
const pathIndex = {} // "GET /store/regions/{}" -> response schema
const canonSpec = (p) => p.replace(/\{[^}]+\}/g, "{}").replace(/\/+$/, "") || "/"
function responseSchema(op) {
  const r = op.responses || {}
  const key = r["200"] ? "200" : r["201"] ? "201" : Object.keys(r).find((k) => /^2/.test(k))
  const resp = key && r[key]
  const content = resp && resp.content && resp.content["application/json"]
  return content ? content.schema : null
}
for (const f of SPECS) {
  const doc = YAML.parse(fs.readFileSync(f, "utf8"))
  for (const [name, def] of Object.entries((doc.components && doc.components.schemas) || {})) {
    if (!schemas[name]) schemas[name] = def
  }
  for (const [p, item] of Object.entries(doc.paths || {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (item[method]) {
        const s = responseSchema(item[method])
        if (s) pathIndex[`${method.toUpperCase()} ${canonSpec(p)}`] = s
      }
    }
  }
}

const refName = (ref) => sanitizeClass(ref.split("/").pop())

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
  if (schema.properties) Object.assign(out.props, schema.properties)
  return out
}

const classKind = {}
for (const [name, def] of Object.entries(schemas)) {
  classKind[sanitizeClass(name)] = Object.keys(collectProps(def).props).length > 0 ? "object" : "wrapper"
}

// resolve a property schema to a Dart type + null-safe (de)serializers
function resolveType(schema) {
  const fallback = { type: "dynamic", fromJson: (j) => j, serialize: (v) => v }
  if (!schema || typeof schema !== "object") return fallback
  if (schema.$ref) {
    const n = refName(schema.$ref)
    if (!classKind[n] || !MODELS.has(n)) return fallback
    const cast = classKind[n] === "object" ? ` as Map<String, dynamic>` : ""
    return {
      type: `${n}?`,
      fromJson: (j) => `${j} == null ? null : ${n}.fromJson(${j}${cast})`,
      serialize: (v) => `${v}.toJson()`,
    }
  }
  if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) return fallback
  if (Array.isArray(schema.allOf)) {
    return { type: "Map<String, dynamic>?", fromJson: (j) => `${j} as Map<String, dynamic>?`, serialize: (v) => v }
  }
  let type = schema.type
  if (Array.isArray(type)) type = type.find((t) => t !== "null") || "string"
  if (type === "array") {
    const item = resolveType(schema.items || {})
    const itemType = item.type.replace(/\?$/, "")
    return {
      type: `List<${itemType}>?`,
      fromJson: (j) => `(${j} as List?)?.map((e) => ${item.fromJson("e")}).toList().cast<${itemType}>()`,
      serialize: (v) => `${v}.map((e) => ${item.serialize("e")}).toList()`,
    }
  }
  if (type === "object" || schema.properties || schema.additionalProperties) {
    return { type: "Map<String, dynamic>?", fromJson: (j) => `${j} as Map<String, dynamic>?`, serialize: (v) => v }
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
  if (type === "integer") return { type: "int?", fromJson: (j) => `(${j} as num?)?.toInt()`, serialize: (v) => v }
  if (type === "number") return { type: "num?", fromJson: (j) => `${j} as num?`, serialize: (v) => v }
  if (type === "boolean") return { type: "bool?", fromJson: (j) => `${j} as bool?`, serialize: (v) => v }
  return fallback
}

function emitObject(name, def) {
  const props = collectProps(def).props
  const fields = Object.entries(props).map(([jsonKey, ps]) => ({ jsonKey, dartName: dartField(jsonKey), ...resolveType(ps) }))
  const lines = []
  lines.push(`/// Synthesized from the OpenAPI response schema for \`${name}\`.`)
  lines.push(`class ${name} {`)
  lines.push(`  ${name}({`)
  for (const f of fields) lines.push(`    this.${f.dartName},`)
  lines.push(`  });`)
  lines.push("")
  for (const f of fields) lines.push(`  final ${f.type} ${f.dartName};`)
  lines.push("")
  lines.push(`  factory ${name}.fromJson(Map<String, dynamic> json) => ${name}(`)
  for (const f of fields) lines.push(`    ${f.dartName}: ${f.fromJson(`json[${JSON.stringify(f.jsonKey)}]`)},`)
  lines.push(`  );`)
  lines.push("")
  lines.push(`  Map<String, dynamic> toJson() => {`)
  for (const f of fields) lines.push(`    if (${f.dartName} != null) ${JSON.stringify(f.jsonKey)}: ${f.serialize(`${f.dartName}!`)},`)
  lines.push(`  };`)
  lines.push(`}`)
  return lines.join("\n")
}

const synthesized = new Map() // name -> code (per output file)

// Decide the Dart response type for a method: component model, synthesized, or dynamic.
function resolveResponseType(m) {
  const direct = modelName(m.responseType)
  if (direct) {
    stats.typed++
    return direct
  }
  if (!m.responseType || !m.canonical) {
    stats.dynamic++
    return null
  }
  const schema = pathIndex[`${m.httpMethod} ${m.canonical}`]
  if (!schema) {
    stats.dynamic++
    return null
  }
  // pure $ref to a known component
  if (schema.$ref) {
    const n = refName(schema.$ref)
    if (MODELS.has(n)) {
      stats.typed++
      return n
    }
  }
  if (Object.keys(collectProps(schema).props).length === 0) {
    stats.dynamic++
    return null
  }
  const tn = modelTypeName(m.responseType)
  if (!tn) {
    stats.dynamic++
    return null
  }
  const name = sanitizeClass(tn)
  if (!name || MODELS.has(name)) {
    stats.dynamic++
    return null
  }
  if (!synthesized.has(name)) synthesized.set(name, emitObject(name, schema))
  stats.synthesized++
  return name
}

function modelTypeName(typeText) {
  if (!typeText) return null
  const t = typeText.replace(/^HttpTypes\./, "").replace(/^AuthTypes\./, "").trim()
  const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)/)
  return m ? m[1] : null
}
function modelName(typeText) {
  const n = modelTypeName(typeText)
  return n && MODELS.has(n) ? n : null
}
function isArrayType(typeText) {
  return !!typeText && /\[\s*\]\s*$/.test(typeText.replace(/^HttpTypes\./, ""))
}

// ---- parse a function-like node into a method IR ----------------------------
function parseFunction(name, fnNode, sf, consts) {
  const params = fnNode.parameters.map((p) => ({
    name: p.name.getText(sf),
    optional: !!(p.questionToken || p.initializer),
    typeText: p.type ? p.type.getText(sf) : null,
  }))

  let call = null
  let isStream = false
  const visit = (node) => {
    if (call) return
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const prop = node.expression.name.getText(sf)
      const recv = node.expression.expression.getText(sf)
      if ((prop === "fetch" || prop === "fetchStream") && /client/.test(recv)) {
        call = node
        isStream = prop === "fetchStream"
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  if (fnNode.body) visit(fnNode.body)
  if (!call) return null

  const responseType = call.typeArguments && call.typeArguments[0]
    ? call.typeArguments[0].getText(sf)
    : null
  const pathInfo = convertPath(call.arguments[0], sf, consts)
  const optsNode = call.arguments[1]

  let httpMethod = "GET"
  let bodyExpr = null
  if (optsNode && ts.isObjectLiteralExpression(optsNode)) {
    for (const prop of optsNode.properties) {
      const key = prop.name ? prop.name.getText(sf) : null
      if (key === "method" && prop.initializer && ts.isStringLiteral(prop.initializer)) {
        httpMethod = prop.initializer.text.toUpperCase()
      } else if (key === "body") {
        bodyExpr = ts.isShorthandPropertyAssignment(prop) ? "body" : prop.initializer.getText(sf)
      }
    }
  }

  const bodyParam = bodyExpr && params.find((p) => p.name === bodyExpr)

  return {
    name,
    httpMethod,
    isStream,
    pathDart: pathInfo.dart,
    pathParams: pathInfo.params,
    canonical: canonicalFromDart(pathInfo.dart),
    responseType,
    bodyParam: bodyParam || null,
  }
}

function canonicalFromDart(dartStr) {
  let s = dartStr.replace(/^"|"$/g, "")
  s = s.replace(/\$\{[^}]*\}/g, "{}").replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, "{}")
  s = s.split("?")[0].replace(/\/+$/, "")
  return s || "/"
}

function convertPath(node, sf, consts) {
  if (ts.isIdentifier(node)) {
    const nm = node.getText(sf)
    return { dart: JSON.stringify(consts[nm] != null ? consts[nm] : nm), params: [] }
  }
  if (ts.isStringLiteralLike(node)) {
    return { dart: JSON.stringify(node.text), params: [] }
  }
  if (ts.isTemplateExpression(node)) {
    const params = []
    let out = node.head.text
    for (const span of node.templateSpans) {
      const expr = span.expression.getText(sf)
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(expr)) {
        if (consts[expr] != null) out += consts[expr]
        else {
          out += "$" + expr
          params.push({ name: expr, kind: "simple" })
        }
      } else if (/^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)+$/.test(expr)) {
        const segs = expr.split(".")
        const root = segs.shift()
        out += "${" + root + segs.map((s) => `['${s}']`).join("") + "}"
        params.push({ name: root, kind: "object" })
      } else {
        out += "${" + expr + "}"
      }
      out += span.literal.text
    }
    return { dart: '"' + out.replace(/"/g, '\\"') + '"', params }
  }
  return { dart: node.getText(sf), params: [] }
}

function collectConsts(node, sf, into) {
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isStringLiteralLike(n.initializer) && ts.isIdentifier(n.name)) {
      into[n.name.getText(sf)] = n.initializer.text
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
}

// ---- emit one method --------------------------------------------------------
function emitMethod(m) {
  const positional = []
  for (const pp of m.pathParams) {
    if (positional.find((x) => x.name === pp.name)) continue
    positional.push({ name: pp.name, dart: `${pp.kind === "object" ? "Map<String, dynamic>" : "String"} ${pp.name}` })
  }

  let bodyArg = null
  if (m.bodyParam) {
    const bn = safeIdent(m.bodyParam.name)
    const existing = positional.find((x) => x.name === bn)
    const mn = modelName(m.bodyParam.typeText)
    if (existing) bodyArg = bn
    else if (mn) {
      positional.push({ name: bn, dart: `${mn} ${bn}` })
      bodyArg = `${bn}.toJson()`
    } else if (isArrayType(m.bodyParam.typeText)) {
      positional.push({ name: bn, dart: `List<dynamic> ${bn}` })
      bodyArg = bn
    } else {
      positional.push({ name: bn, dart: `Map<String, dynamic> ${bn}` })
      bodyArg = bn
    }
  }

  const sig = [...positional.map((p) => p.dart), "{QueryParams? query, ClientHeaders? headers}"].join(", ")
  const fa = []
  if (m.httpMethod !== "GET") fa.push(`method: ${JSON.stringify(m.httpMethod)}`)
  if (bodyArg) fa.push(`body: ${bodyArg}`)
  fa.push("query: query")
  fa.push("headers: headers")
  const fetchArgs = `FetchArgs(${fa.join(", ")})`
  const mname = safeIdent(m.name)

  if (m.isStream) {
    return [
      `  Future<FetchStreamResponse> ${mname}(${sig}) {`,
      `    return _client.fetchStream(${m.pathDart}, init: ${fetchArgs});`,
      `  }`,
    ].join("\n")
  }

  stats.methods++
  const rt = resolveResponseType(m)
  if (rt) {
    return [
      `  Future<${rt}> ${mname}(${sig}) async {`,
      `    final res = await _client.fetch(${m.pathDart}, init: ${fetchArgs});`,
      `    return ${rt}.fromJson(res);`,
      `  }`,
    ].join("\n")
  }
  return [
    `  Future<dynamic> ${mname}(${sig}) async {`,
    `    return _client.fetch(${m.pathDart}, init: ${fetchArgs});`,
    `  }`,
  ].join("\n")
}

function emitResourceClass(res, out) {
  const lines = []
  if (res.doc) lines.push(res.doc)
  lines.push(`class ${res.dartClass} {`)
  const subs = res.subresources
  const hasMethods = res.methods.length > 0
  const subInit = subs.map((s) => `${s.accessor} = ${s.dartClass}(client)`)

  if (subs.length === 0) {
    lines.push(`  ${res.dartClass}(this._client);`)
    lines.push(`  final MedusaClient _client;`)
  } else if (!hasMethods) {
    lines.push(`  ${res.dartClass}(MedusaClient client)`)
    lines.push(`      : ${subInit.join(",\n        ")};`)
    for (const s of subs) lines.push(`  final ${s.dartClass} ${s.accessor};`)
  } else {
    lines.push(`  ${res.dartClass}(MedusaClient client)`)
    lines.push(`      : _client = client,`)
    lines.push(`        ${subInit.join(",\n        ")};`)
    lines.push(`  final MedusaClient _client;`)
    for (const s of subs) lines.push(`  final ${s.dartClass} ${s.accessor};`)
  }
  lines.push("")
  for (const m of res.methods) {
    lines.push(emitMethod(m))
    lines.push("")
  }
  lines.push(`}`)
  out.push(lines.join("\n"))
  for (const s of subs) emitResourceClass(s, out)
}

function parseMembers(members, sf, classPrefix, consts) {
  const methods = []
  const subresources = []
  for (const member of members) {
    if (ts.isMethodDeclaration(member) && member.body) {
      const m = parseFunction(member.name.getText(sf), member, sf, consts)
      if (m) methods.push(m)
      else stats.skipped++
    } else if (ts.isPropertyAssignment(member) || ts.isPropertyDeclaration(member)) {
      const init = member.initializer
      const key = member.name.getText(sf)
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        const m = parseFunction(key, init, sf, consts)
        if (m) methods.push(m)
        else stats.skipped++
      } else if (init && ts.isObjectLiteralExpression(init)) {
        const sub = parseMembers(init.properties, sf, classPrefix, consts)
        subresources.push({ dartClass: `${classPrefix}${upperFirst(key)}Resource`, accessor: safeIdent(key), ...sub })
        stats.resources++
      }
    }
  }
  return { methods, subresources }
}

function parseFile(file, sf, namespace) {
  let cls = null
  ts.forEachChild(sf, (n) => {
    if (!cls && ts.isClassDeclaration(n)) cls = n
  })
  if (!cls) return null
  const consts = {}
  collectConsts(sf, sf, consts)
  const className = cls.name ? cls.name.getText(sf) : path.basename(file, ".ts")
  const prefix = namespace === "admin" ? "Admin" : "Store"
  return { className, ...parseMembers(cls.members, sf, prefix, consts) }
}

function writeFile(name, root) {
  synthesized.clear()
  const out = []
  emitResourceClass(root, out)
  const synthCode = [...synthesized.values()]
  const header =
    `// GENERATED by tool/generate_resources.mjs — do not edit.\n` +
    `import '../client.dart';\n` +
    `import '../models.dart';\n\n`
  const body = out.join("\n\n") + (synthCode.length ? "\n\n// ---- synthesized response models ----\n\n" + synthCode.join("\n\n") : "")
  fs.writeFileSync(`${OUT_DIR}/${name}`, header + body + "\n")
}

function buildAdmin() {
  const dir = `${JS_SRC}/admin`
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "index.ts")
  const resources = []
  for (const f of files) {
    const full = `${dir}/${f}`
    const sf = ts.createSourceFile(full, fs.readFileSync(full, "utf8"), ts.ScriptTarget.Latest, true)
    const parsed = parseFile(full, sf, "admin")
    if (!parsed) {
      stats.warnings.push(`no class in admin/${f}`)
      continue
    }
    resources.push({
      dartClass: `Admin${parsed.className}Resource`,
      accessor: safeIdent(lowerFirst(parsed.className)),
      methods: parsed.methods,
      subresources: parsed.subresources,
    })
    stats.resources++
  }
  resources.sort((a, b) => a.accessor.localeCompare(b.accessor))
  writeFile("admin.dart", {
    dartClass: "Admin",
    doc: "/// Provides access to the admin API resources.",
    methods: [],
    subresources: resources,
  })
}

function buildStore() {
  const full = `${JS_SRC}/store/index.ts`
  const sf = ts.createSourceFile(full, fs.readFileSync(full, "utf8"), ts.ScriptTarget.Latest, true)
  const parsed = parseFile(full, sf, "store")
  writeFile("store.dart", {
    dartClass: "Store",
    doc: "/// Provides access to the store (storefront) API resources.",
    methods: parsed.methods,
    subresources: parsed.subresources,
  })
}

fs.mkdirSync(OUT_DIR, { recursive: true })
buildAdmin()
buildStore()
console.log(
  `resources=${stats.resources} methods=${stats.methods} typed=${stats.typed} ` +
    `synthesized=${stats.synthesized} dynamic=${stats.dynamic} skipped=${stats.skipped}`
)
if (stats.warnings.length) console.log("warnings:\n  " + stats.warnings.join("\n  "))
