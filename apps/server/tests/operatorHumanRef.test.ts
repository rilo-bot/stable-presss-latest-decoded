// ---------------------------------------------------------------------------
// The Stable Hand never shows a person an id (apps/web/src/agent/operator/
// runtime/humanRef.ts). Pure module, so it is tested here with the rest of the
// suite even though it lives in the web app.
//
// Pins the 2026-11-12 report: "when inviting or sharing any staff the Stable
// Hand is confirming it but it's showing id instead of name". The share card
// read "Share pages 1 and 2 of “Spring” with 6650f1a2…?" because a userId for
// someone who was not a collaborator yet fell straight through to the card.
// Fallback order for a person: name → email → "this staff member". Never the id.
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NEUTRAL_PERSON,
  actionError,
  describePersonRef,
  errorDetail,
  findPerson,
  humanizeKey,
  looksLikeId,
  nameFromAgentId,
  personDisplay,
  personDisplayWithEmail,
  quoteRef,
  scrubIds,
  settleQuestion,
  titleOr,
} from '../../web/src/agent/operator/runtime/humanRef.js'

const OID = '6650f1a2b3c4d5e6f7a8b9c0'
const UUID = '0b6f2c1e-8a4d-4e3b-9c7a-2f1d5e6a7b8c'

// ── looksLikeId ──────────────────────────────────────────────────────────────

test('looksLikeId: the id shapes the app and its services hand out', () => {
  for (const id of [
    OID,
    OID.toUpperCase(),
    UUID,
    'deadbeefdeadbeef1234', // long hex
    '123456789012345', // long digit run
    'V1StGXR8Z5jdHi6B4myT9k', // nanoid-style
    'ckl5n0m3z0000qzrmn831i7rn', // cuid
    `usr_${OID}`,
    `invite:${UUID}`,
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N', // JWT
    `  ${OID}  `,
  ]) {
    assert.equal(looksLikeId(id), true, id)
  }
})

test('looksLikeId: names, emails, slugs and page numbers are never ids', () => {
  for (const s of [
    'Ahmed Khan',
    'ahmed.khan@stable.press',
    'sub-editor-2024-season',
    'stories.edit',
    'Page 3',
    'Horse2024Champion',
    'Spring Carnival 2026',
    'magazine',
    '2026',
    '',
    '   ',
  ]) {
    assert.equal(looksLikeId(s), false, s)
  }
  assert.equal(looksLikeId(undefined), false)
  assert.equal(looksLikeId(42 as unknown), false)
})

// ── scrubIds (the operatorStore safety net) ──────────────────────────────────

test('scrubIds: the reported share card loses the id', () => {
  assert.equal(
    scrubIds(`Share pages 1 and 2 of “Spring” with ${OID}? They'll be emailed a link.`, NEUTRAL_PERSON),
    "Share pages 1 and 2 of “Spring” with this staff member? They'll be emailed a link.",
  )
})

test('scrubIds: wrappers, labels, quotes and paths', () => {
  assert.equal(scrubIds(`Sam Lee <sam@x.io> (userId ${OID}); Jo <jo@x.io> (${UUID}).`), 'Sam Lee <sam@x.io>; Jo <jo@x.io>.')
  assert.equal(scrubIds(`No magazine with id ${OID} in the library.`), 'No magazine with that id in the library.')
  assert.equal(scrubIds(`No story “${OID}” is visible to you.`), 'No story this item is visible to you.')
  assert.equal(scrubIds(`Open /horses/${OID} to edit it.`), 'Open /horses/… to edit it.')
  assert.equal(scrubIds(`Clicked “Remove ${UUID}”`, 'it'), 'Clicked “Remove it”')
})

test('scrubIds: text without ids comes back untouched (same string)', () => {
  const s = 'Publish “Spring Carnival 2026 — Day 3” to the live site?  Page 12 of 16.'
  assert.equal(scrubIds(s), s)
  assert.equal(scrubIds(''), '')
  assert.equal(scrubIds('Grant Stories: Edit, Horses: View to sub-editor-2024?'), 'Grant Stories: Edit, Horses: View to sub-editor-2024?')
})

// ── people: name → email → neutral ───────────────────────────────────────────

test('personDisplay: name, then email, then the neutral phrase — never the id', () => {
  assert.equal(personDisplay({ userId: OID, name: 'Ahmed Khan', email: 'a@x.io' }), 'Ahmed Khan')
  assert.equal(personDisplay({ userId: OID, displayName: 'Jo Bloggs', email: 'jo@x.io' }), 'Jo Bloggs')
  assert.equal(personDisplay({ userId: OID, name: '', email: 'a@x.io' }), 'a@x.io')
  assert.equal(personDisplay({ userId: OID, name: '   ', email: '' }), NEUTRAL_PERSON)
  // A "name" that is itself an id is not a name.
  assert.equal(personDisplay({ userId: OID, name: OID, email: 'a@x.io' }), 'a@x.io')
  assert.equal(personDisplay({ userId: OID, name: OID }), NEUTRAL_PERSON)
  assert.equal(personDisplay(undefined), NEUTRAL_PERSON)
  assert.equal(personDisplay(null, 'this person'), 'this person')
})

test('personDisplayWithEmail: both when both are known', () => {
  assert.equal(personDisplayWithEmail({ name: 'Ahmed Khan', email: 'a@x.io' }), 'Ahmed Khan (a@x.io)')
  assert.equal(personDisplayWithEmail({ name: '', email: 'a@x.io' }), 'a@x.io')
  assert.equal(personDisplayWithEmail({ name: 'a@x.io', email: 'A@x.io' }), 'a@x.io')
  assert.equal(personDisplayWithEmail({ userId: OID }), NEUTRAL_PERSON)
})

const directory = [
  { userId: OID, name: 'Ahmed Khan', email: 'ahmed@stable.press' },
  { userId: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Sam Lee', email: 'sam.lee@stable.press' },
  { userId: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Sam Ortiz', email: 'sam.o@stable.press' },
  { userId: 'cccccccccccccccccccccccc', name: '', email: 'noname@stable.press' },
]

test('findPerson: userId, email (any case), exact name, then a UNIQUE partial name', () => {
  assert.equal(findPerson(OID, directory)?.name, 'Ahmed Khan')
  assert.equal(findPerson('AHMED@stable.press', directory)?.name, 'Ahmed Khan')
  assert.equal(findPerson('sam lee', directory)?.name, 'Sam Lee')
  assert.equal(findPerson('ahmed', directory)?.name, 'Ahmed Khan')
  assert.equal(findPerson('sam', directory), undefined, 'two Sams — ambiguous')
  assert.equal(findPerson('nobody', directory), undefined)
  assert.equal(findPerson('', directory), undefined)
  // an id or email never partially matches
  assert.equal(findPerson(OID.slice(0, 12), directory), undefined)
  assert.equal(findPerson('stable.press', directory), undefined)
})

test('findPerson: the same person from two sources is one person', () => {
  const pool = [
    { userId: OID, displayName: '', email: 'ahmed@stable.press' }, // a collaborator row with no name
    ...directory,
  ]
  const hit = findPerson(OID, pool)
  assert.equal(hit?.name, 'Ahmed Khan', 'keeps the copy that has a name')
})

test('describePersonRef: the fallback order the confirm cards use', () => {
  assert.deepEqual(
    { label: describePersonRef(OID, directory).label, found: describePersonRef(OID, directory).found },
    { label: 'Ahmed Khan', found: true },
  )
  assert.equal(describePersonRef('cccccccccccccccccccccccc', directory).label, 'noname@stable.press')
  // not in the directory:
  assert.equal(describePersonRef('new.hire@stable.press', directory).label, 'new.hire@stable.press')
  assert.equal(describePersonRef('dddddddddddddddddddddddd', directory).label, NEUTRAL_PERSON)
  assert.equal(describePersonRef(UUID, [], 'this colleague').label, 'this colleague')
  assert.equal(describePersonRef('Priya', directory).label, 'Priya', 'a name the user typed is shown as typed')
  assert.equal(describePersonRef('sam', directory).label, 'sam', 'ambiguous → as typed, not a guess')
})

// ── other references ─────────────────────────────────────────────────────────

test('quoteRef: quotes text, never echoes an id', () => {
  assert.equal(quoteRef('Ahmed'), '“Ahmed”')
  assert.equal(quoteRef(` ${OID} `), 'that id')
  assert.equal(quoteRef(UUID, 'That reference'), 'That reference')
})

test('titleOr: a title, else the fallback (empty or an id)', () => {
  assert.equal(titleOr('Spring Carnival', 'this post'), 'Spring Carnival')
  assert.equal(titleOr('', 'this post'), 'this post')
  assert.equal(titleOr(OID, 'this post'), 'this post')
  assert.equal(titleOr(undefined, 'this post'), 'this post')
})

test('nameFromAgentId: a readable control name with record ids taken out', () => {
  assert.equal(nameFromAgentId(`team.remove-${OID}`), 'Remove')
  assert.equal(nameFromAgentId(`mag.share-edit-${UUID}`), 'Share edit')
  assert.equal(nameFromAgentId(`community.delete-confirm-${OID}`), 'Delete confirm')
  assert.equal(nameFromAgentId('mag.page-3-delete'), 'Page 3 delete')
  assert.equal(nameFromAgentId('mag.share-button'), 'Share')
  assert.equal(nameFromAgentId(`team.member-${OID}`), 'Member')
  assert.equal(nameFromAgentId(`x.${OID}`), 'this control')
  assert.equal(nameFromAgentId(''), 'this control')
  assert.equal(nameFromAgentId(undefined, 'that button'), 'that button')
})

test('humanizeKey: field keys read as words', () => {
  assert.equal(humanizeKey('dateOfBirth'), 'date of birth')
  assert.equal(humanizeKey('sire_name'), 'sire name')
  assert.equal(humanizeKey('colour'), 'colour')
})

// ── async confirm questions ──────────────────────────────────────────────────

test('settleQuestion: a sync answer passes straight through', async () => {
  assert.equal(await settleQuestion('Delete page 2?', 50, 'fallback'), 'Delete page 2?')
  assert.equal(await settleQuestion(null, 50, 'fallback'), null)
  assert.equal(await settleQuestion(undefined, 50, 'fallback'), null)
  assert.equal(await settleQuestion('', 50, 'fallback'), null, "'' means no card, as before")
})

test('settleQuestion: an async lookup is awaited', async () => {
  assert.equal(await settleQuestion(Promise.resolve('Share page 2 with Ahmed Khan?'), 200, 'fallback'), 'Share page 2 with Ahmed Khan?')
  assert.equal(await settleQuestion(Promise.resolve(null), 200, 'fallback'), null, 'a no-op still asks nothing')
})

test('settleQuestion: slow or failed lookups still ASK, with the id-free fallback', async () => {
  const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 500))
  assert.equal(await settleQuestion(slow, 20, 'Go ahead with “Share pages”?'), 'Go ahead with “Share pages”?')
  assert.equal(await settleQuestion(Promise.reject(new Error('offline')), 200, 'Go ahead?'), 'Go ahead?')
})

// ── errors with a model-only detail ──────────────────────────────────────────

test('actionError: the message is for the person, the detail for the model', () => {
  const e = actionError('“Sam” matches 2 people: Sam Lee; Sam Ortiz.', { candidates: [{ userId: OID }] })
  assert.ok(e instanceof Error)
  assert.equal(e.message.includes(OID), false)
  assert.deepEqual(errorDetail(e), { candidates: [{ userId: OID }] })
  assert.equal(errorDetail(new Error('plain')), undefined)
  assert.equal(errorDetail('nope'), undefined)
})
