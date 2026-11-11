// The Stablehand OPERATOR's catalog, held to the web app it describes.
//
// The catalog (src/lib/agent/operator/catalog/*.ts) is what the model reads in its
// cached system prompt: "on this route, these actions exist". The web app is what
// actually registers them (useAgentAction in apps/web/src). Nothing links the two
// but a naming convention, so they drift silently — and a drifted entry is worse
// than a missing one: the model confidently calls an action that is not there, or
// never learns about one that is. These tests pin both directions, the routes, and
// the prompt-cache property the static prompt depends on (byte-identical output).
//
// Pure file reads + in-memory rendering. No database, no network.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { CATALOG } from '../src/lib/agent/operator/catalog/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const SERVER = path.resolve(here, '..')
const WEB_SRC = path.resolve(here, '../../web/src')

/** Warn above this many characters of static prompt; fail far above it. */
const PROMPT_WARN_CHARS = 70_000
const PROMPT_FAIL_CHARS = 90_000

// prompt.ts reaches lib/db.ts (via capabilities), which throws at import without a
// MONGODB_URI. The client connects lazily, so an unroutable placeholder is enough —
// nothing here ever queries.
function loadPromptModule() {
  process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/operator-catalog-test-never-connects'
  return import('../src/lib/agent/operator/prompt.js')
}

// ── web side: every action name registered with useAgentAction ──────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walk(p, out)
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p)
  }
  return out
}

const PACKS = [...new Set(CATALOG.flatMap((s) => s.actions.map((a) => a.name.split('.')[0])))]
const packAlt = PACKS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')

/** String literals an initialiser can evaluate to: `published ? 'publish' : 'unpublish'` → both. */
function literalsOf(expr: string): string[] {
  return [...expr.matchAll(/(['"])([A-Za-z0-9_-]+)\1/g)].map((m) => m[2])
}

interface WebAction {
  name: string
  file: string
}

function webActions(): { actions: WebAction[]; unresolved: string[] } {
  const actions: WebAction[] = []
  const unresolved: string[] = []
  const literal = new RegExp(`\\bname:\\s*(['"\`])((?:${packAlt})\\.[A-Za-z][A-Za-z0-9]*)\\1`, 'g')
  const template = new RegExp(`\\bname:\\s*\`((?:${packAlt})\\.[A-Za-z0-9]*)\\$\\{(\\w+)\\}([A-Za-z0-9]*)\``, 'g')
  for (const file of walk(WEB_SRC)) {
    const src = fs.readFileSync(file, 'utf8')
    if (!/useAgentAction|OperatorActionDef/.test(src)) continue
    const rel = path.relative(WEB_SRC, file).replace(/\\/g, '/')
    for (const m of src.matchAll(literal)) actions.push({ name: m[2], file: rel })
    for (const m of src.matchAll(template)) {
      const [, prefix, variable, suffix] = m
      const decls = [...src.matchAll(new RegExp(`(?:const|let|var)\\s+${variable}\\s*=\\s*([^;\\n]+)`, 'g'))]
      const values = [...new Set(decls.flatMap((d) => literalsOf(d[1])))]
      if (values.length === 0) unresolved.push(`${rel}: name: \`${prefix}\${${variable}}${suffix}\``)
      for (const v of values) actions.push({ name: `${prefix}${v}${suffix}`, file: rel })
    }
  }
  return { actions, unresolved }
}

// ── App.tsx: every route the router can render ──────────────────────────────

/** Route paths in App.tsx, nested <Route> children joined onto their parent. */
function appRoutes(): string[] {
  const src = fs.readFileSync(path.join(WEB_SRC, 'App.tsx'), 'utf8')
  const routes: string[] = []
  const stack: string[] = [] // the parent path for each OPEN <Route>
  const join = (parent: string, child: string) =>
    child.startsWith('/') ? child : `${parent.replace(/\/$/, '')}/${child}`.replace(/\/+/g, '/')
  let i = 0
  while (i < src.length) {
    const open = src.indexOf('<Route', i)
    const close = src.indexOf('</Route>', i)
    if (open === -1 && close === -1) break
    if (close !== -1 && (open === -1 || close < open)) {
      stack.pop()
      i = close + '</Route>'.length
      continue
    }
    // `<Routes` is the container, not a route.
    if (/[A-Za-z]/.test(src[open + '<Route'.length] ?? '')) {
      i = open + '<Route'.length
      continue
    }
    // Scan to the tag's closing '>' at brace depth 0 (element={<X />} nests JSX).
    let j = open + '<Route'.length
    let depth = 0
    let quote = ''
    for (; j < src.length; j++) {
      const ch = src[j]
      if (quote) {
        if (ch === quote) quote = ''
      } else if (ch === '"' || ch === "'" || ch === '`') quote = ch
      else if (ch === '{') depth++
      else if (ch === '}') depth--
      else if (ch === '>' && depth === 0) break
    }
    const tag = src.slice(open, j + 1)
    const selfClosing = src[j - 1] === '/'
    const parent = stack.length ? stack[stack.length - 1] : ''
    // Only the tag's OWN attributes: drop {…} expressions (element={…} may contain path=).
    const attrs = tag.replace(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g, '{}')
    const pathAttr = attrs.match(/\bpath="([^"]+)"/)?.[1]
    const full = pathAttr ? join(parent || '/', pathAttr) : parent
    if (pathAttr) routes.push(full)
    if (!selfClosing) stack.push(full)
    i = j + 1
  }
  return routes
}

/** Param names erased, as prompt.ts does: '/x/:id' and '/x/:postId' are one route. */
const routeKey = (r: string) => r.replace(/:[A-Za-z0-9_]+/g, ':').replace(/\/$/, '') || '/'

// ── tests ───────────────────────────────────────────────────────────────────

test('the web-side action scan finds the packs (guards the scanner itself)', () => {
  const { actions, unresolved } = webActions()
  assert.deepEqual(unresolved, [], 'a templated action name could not be resolved to literals')
  // If the scan silently found nothing, every later assertion would be vacuous.
  assert.ok(actions.length >= 40, `expected dozens of registered actions, found ${actions.length}`)
  assert.ok(actions.some((a) => a.name === 'blog.publish') && actions.some((a) => a.name === 'blog.unpublish'), 'blog.${verb} must resolve to publish + unpublish')
})

test('every action the web app registers is in the server catalog', () => {
  const catalogNames = new Set(CATALOG.flatMap((s) => s.actions.map((a) => a.name)))
  const missing = webActions().actions.filter((a) => !catalogNames.has(a.name))
  assert.deepEqual(
    missing.map((a) => `${a.name} (${a.file})`),
    [],
    'registered in apps/web but absent from the catalog — the model will never know it exists',
  )
})

test('every catalog action is registered somewhere in the web app', () => {
  const webNames = new Set(webActions().actions.map((a) => a.name))
  const ghosts = CATALOG.flatMap((s) => s.actions.filter((a) => !webNames.has(a.name)).map((a) => `${a.name} (${s.id})`))
  assert.deepEqual(ghosts, [], 'in the catalog but registered nowhere — the model will call an action that does not exist')
})

test('the App.tsx route scan finds the router (guards the scanner itself)', () => {
  const routes = appRoutes()
  for (const r of ['/', '/production-system/team', '/production-system/blogs/:id', '/production-system/magazine-v2/:id', '/studio/horse/:id']) {
    assert.ok(routes.includes(r), `scanner should find ${r}; found ${routes.length} routes`)
  }
})

test('every catalog surface route is a real route in App.tsx', () => {
  const keys = new Set(appRoutes().map(routeKey))
  const orphans = CATALOG.filter((s) => !keys.has(routeKey(s.route))).map((s) => `${s.route} (${s.id})`)
  assert.deepEqual(orphans, [], 'the model would navigate to a route the router does not have')
})

test('no surface lists the same action twice', () => {
  for (const s of CATALOG) {
    const names = s.actions.map((a) => a.name)
    const dupes = names.filter((n, i) => names.indexOf(n) !== i)
    assert.deepEqual(dupes, [], `surface ${s.id} (${s.route}) lists an action twice`)
  }
})

test('catalog entries are complete', () => {
  for (const s of CATALOG) {
    assert.ok(s.id && s.title && s.route.startsWith('/') && s.who && s.purpose, `surface ${s.id || s.route} is missing a field`)
    for (const a of s.actions) {
      assert.match(a.name, /^[a-z]+\.[a-zA-Z]+$/, `${s.id}: action name ${a.name} is not '<pack>.<verb>'`)
      assert.ok(a.description.trim(), `${a.name}: empty description`)
      assert.ok(a.args.trim().startsWith('{'), `${a.name}: args must be an object signature, got ${a.args}`)
    }
  }
})

test('the static prompt renders deterministically and within budget', async () => {
  const prompt = await loadPromptModule()
  const a = prompt.getStaticOperatorPrompt()
  const b = prompt.getStaticOperatorPrompt()
  assert.equal(a, b)
  // The memo above would hide nondeterminism — re-render the catalog from scratch,
  // and from a structurally fresh copy, and require the same bytes.
  const r1 = prompt.renderCatalog()
  const r2 = prompt.renderCatalog(CATALOG.map((s) => ({ ...s, actions: s.actions.map((x) => ({ ...x })), anchors: s.anchors && [...s.anchors] })))
  assert.equal(r1, r2, 'renderCatalog is not a pure function of the catalog')
  assert.ok(a.includes(r1), 'the static prompt must embed the rendered catalog verbatim')

  const today = new Date().toISOString().slice(0, 10)
  assert.ok(!a.includes(today), "the static prompt contains today's date — that breaks the cache prefix every day")

  if (a.length > PROMPT_WARN_CHARS) {
    console.warn(`[operatorCatalog] static operator prompt is ${a.length} chars (> ${PROMPT_WARN_CHARS} warn budget) — every request pays to cache-read it`)
  }
  assert.ok(a.length <= PROMPT_FAIL_CHARS, `static operator prompt is ${a.length} chars, over the ${PROMPT_FAIL_CHARS} hard budget`)
})

test('the static prompt is byte-identical across processes', async () => {
  // Catches what one process cannot: Date.now(), Math.random(), env-dependent or
  // insertion-order-dependent output. A second process renders it from scratch.
  const prompt = await loadPromptModule()
  const hash = (s: string) => createHash('sha256').update(s).digest('hex')
  const promptPath = path.join(SERVER, 'src/lib/agent/operator/prompt.ts').replace(/\\/g, '/')
  const code = `const p = require(${JSON.stringify(promptPath)}); process.stdout.write(require('node:crypto').createHash('sha256').update(p.getStaticOperatorPrompt()).digest('hex'))`
  const other = execFileSync(process.execPath, [...process.execArgv, '-e', code], {
    cwd: SERVER,
    env: { ...process.env, MONGODB_URI: process.env.MONGODB_URI },
    encoding: 'utf8',
    timeout: 60_000,
  }).trim()
  assert.equal(other, hash(prompt.getStaticOperatorPrompt()))
})
