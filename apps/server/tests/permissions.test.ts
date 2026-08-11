// The permission model, tested where grep cannot reach.
//
// `check:permissions` proves every catalogue id is gated somewhere. It CANNOT
// prove the gate asks the right question, because gates map the HTTP method to a
// verb at runtime — `'horses.delete'` never appears as a literal anywhere. These
// tests cover exactly that seam, plus the two rules the whole model rests on.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALWAYS_ON_MODULES,
  BUILTIN_ROLE_PERMISSIONS,
  BUILTIN_ROLE_SCOPES,
  LEGACY_PERMISSION_ALIASES,
  PERMISSION_CATALOGUE,
  SCREEN_CATALOGUE,
  isPermissionAction,
  modulesForPermissions,
  normalisePermissions,
  normaliseScopes,
} from '../src/lib/permissionCatalogue.js'

// ── The shape ───────────────────────────────────────────────────────────────

test('every screen supports view, and only declared verbs become ids', () => {
  for (const screen of SCREEN_CATALOGUE) {
    assert.ok(screen.verbs.includes('view'), `${screen.id} must support view`)
    for (const verb of ['view', 'create', 'edit', 'delete', 'publish'] as const) {
      const id = `${screen.id}.${verb}`
      assert.equal(
        isPermissionAction(id),
        screen.verbs.includes(verb),
        `${id} should exist iff ${screen.id} declares ${verb}`,
      )
    }
  }
})

test('catalogue ids are unique', () => {
  const ids = PERMISSION_CATALOGUE.map((p) => p.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('a lens screen carries view ONLY — its actions belong to the screen it shows', () => {
  // This is the rule that stops a lens becoming a bypass: if Instant Capture had
  // its own `create`, it would mint stories for someone holding no stories.create.
  for (const screen of SCREEN_CATALOGUE.filter((s) => s.lensOver)) {
    assert.deepEqual(screen.verbs, ['view'], `${screen.id} is a lens and must be view-only`)
    assert.ok(
      SCREEN_CATALOGUE.some((s) => s.id === screen.lensOver),
      `${screen.id} points at a screen that does not exist`,
    )
  }
})

// ── Rule 2: any verb implies view ───────────────────────────────────────────

test('granting a verb grants that screen’s view', () => {
  const out = normalisePermissions(['stories.edit'])
  assert.ok(out.includes('stories.view'), 'edit must imply view')
})

test('a role of only writes still ends up able to open its screens', () => {
  const out = normalisePermissions(['blogs.publish', 'podcast.delete'])
  assert.ok(out.includes('blogs.view'))
  assert.ok(out.includes('podcast.view'))
})

test('unknown ids are dropped, not carried', () => {
  assert.deepEqual(normalisePermissions(['not.a.permission', 'stories.view']), ['stories.view'])
  assert.deepEqual(normalisePermissions('nonsense' as unknown), [])
  assert.deepEqual(normalisePermissions([42, null] as unknown[]), [])
})

// ── Legacy ids ──────────────────────────────────────────────────────────────

test('every legacy alias maps to ids that exist', () => {
  for (const [old, mapped] of Object.entries(LEGACY_PERMISSION_ALIASES)) {
    for (const id of mapped) {
      assert.ok(isPermissionAction(id), `alias ${old} → ${id} is not a real permission`)
    }
  }
})

test('an unmigrated editor role still resolves to editing and publishing', () => {
  // The exact array a seeded `editor` carried before the migration.
  const out = normalisePermissions([
    'content.draft.create',
    'content.draft.edit_any',
    'content.publish',
    'blog.create',
    'blog.publish',
    'comments.moderate',
  ])
  assert.ok(out.includes('stories.create'))
  assert.ok(out.includes('stories.edit'))
  assert.ok(out.includes('stories.publish'))
  assert.ok(out.includes('blogs.create'))
  assert.ok(out.includes('blogs.publish'))
  assert.ok(out.includes('comments.delete'))
  assert.ok(out.includes('stories.view'), 'implied view still applies to migrated ids')
})

test('the three retired grants resolve to nothing', () => {
  // Uploading is part of editing what the file belongs to; your own payouts are
  // not a grant; platform.admin is `isSuper`.
  assert.deepEqual(
    normalisePermissions(['media.upload_own', 'compensation.view_own', 'platform.admin']),
    [],
  )
})

// ── Scope ───────────────────────────────────────────────────────────────────

test('scope defaults to own, and legacy edit_any means all', () => {
  assert.deepEqual(normaliseScopes(undefined), {})
  assert.deepEqual(normaliseScopes({ stories: 'all' }), { stories: 'all' })
  // The old id carried the intent; nothing else records it.
  assert.deepEqual(normaliseScopes({}, ['content.draft.edit_any']), { stories: 'all' })
  assert.deepEqual(normaliseScopes({}, ['content.draft.edit_own']), {})
})

test('scope is refused for screens whose records have no author', () => {
  assert.deepEqual(normaliseScopes({ team: 'all', settings: 'all' }), {})
})

test('junk scope values are dropped rather than trusted', () => {
  assert.deepEqual(normaliseScopes({ stories: 'everything' }), {})
  assert.deepEqual(normaliseScopes('all' as unknown), {})
})

// ── The derived sidebar ─────────────────────────────────────────────────────

test('a module appears exactly when its view is held', () => {
  const mods = modulesForPermissions(['stories.view', 'blogs.view'])
  assert.ok(mods.includes('stories'))
  assert.ok(mods.includes('blogs'))
  assert.ok(!mods.includes('podcast'))
})

test('the always-on screens need no permission', () => {
  const mods = modulesForPermissions([])
  for (const id of ALWAYS_ON_MODULES) assert.ok(mods.includes(id), `${id} must always be present`)
})

test('a non-view permission alone does not open a module', () => {
  // …because normalisePermissions is what adds the view. Passing a raw array
  // that skipped it must not quietly open the screen anyway.
  assert.ok(!modulesForPermissions(['settings.edit']).includes('settings'))
})

// ── The seeded roles ────────────────────────────────────────────────────────

test('a contributor can write but never publish or delete', () => {
  const held = new Set(BUILTIN_ROLE_PERMISSIONS.contributor)
  assert.ok(held.has('stories.create'))
  assert.ok(held.has('stories.edit'))
  assert.ok(!held.has('stories.publish'), 'a contributor must not publish')
  assert.ok(!held.has('stories.delete'))
  assert.ok(!held.has('blogs.publish'))
  // …and only over their own work.
  assert.equal(BUILTIN_ROLE_SCOPES.contributor.stories, 'own')
})

test('an editor publishes and reaches everyone’s work', () => {
  const held = new Set(BUILTIN_ROLE_PERMISSIONS.editor)
  assert.ok(held.has('stories.publish'))
  assert.ok(held.has('blogs.publish'))
  assert.equal(BUILTIN_ROLE_SCOPES.editor.stories, 'all')
  // But not the newsroom itself.
  assert.ok(!held.has('roles.edit'), 'an editor must not be able to redefine roles')
  assert.ok(!held.has('team.delete'))
})

test('administrator holds the whole catalogue', () => {
  assert.equal(BUILTIN_ROLE_PERMISSIONS.administrator.length, PERMISSION_CATALOGUE.length)
})

test('no seeded role is left holding a permission that is not in the catalogue', () => {
  for (const [name, ids] of Object.entries(BUILTIN_ROLE_PERMISSIONS)) {
    for (const id of ids) assert.ok(isPermissionAction(id), `${name} holds unknown id ${id}`)
  }
})
