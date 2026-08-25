// ---------------------------------------------------------------------------
// The command layer — planning is total, applying is all-or-nothing.
//
// Two guarantees are worth this much test surface, because both are the kind that
// look fine in a demo and cost data in production:
//
//   1. PLANNING REJECTS BEFORE WRITING. Every failure detectable from state —
//      missing ids, locked elements, invalid patches, element caps, contradictory
//      batches — must be caught with zero writes performed.
//   2. A PARTIAL APPLY IS UNDONE. A multi-page batch that fails on its third page
//      must put the first two back. This is the path that never runs in testing
//      against a real database, which is exactly why the executor takes a store
//      port: here we can make the third write fail on demand.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planBatch, resolveSelector, type PageState } from '../../src/lib/magazineV2/commands/plan.ts';
import {
  executeBatch,
  type BatchOutcome,
  type BatchRecord,
  type CommandStore,
  type PageWrite,
} from '../../src/lib/magazineV2/commands/execute.ts';
import type { MagazineCommand, MagazineElement } from '@rilo/schema';
import { PAGE_H, PAGE_W } from '../../src/lib/magazineV2/config.ts';

// ── fixtures ──────────────────────────────────────────────────────────────────

function textEl(id: string, role: string, content = 'Some real copy that is long enough to survive.'): MagazineElement {
  return {
    id,
    type: 'text',
    x: 100,
    y: 100,
    w: 600,
    h: 200,
    rotation: 0,
    zIndex: 1,
    locked: false,
    source: 'manual',
    text: {
      content,
      role: role as MagazineElement['text'] extends undefined ? never : 'headline',
      fontFamily: 'Inter, Arial, sans-serif',
      fontSize: 40,
      fontWeight: 700,
      color: '#111111',
      align: 'left',
      lineHeight: 1.2,
      autoFit: 'shrink',
    },
  } as MagazineElement;
}

function imageEl(id: string): MagazineElement {
  return {
    id,
    type: 'image',
    x: 0,
    y: 0,
    w: 400,
    h: 400,
    rotation: 0,
    zIndex: 0,
    locked: false,
    source: 'manual',
    image: { assetId: 'a1', url: 'https://cdn.example.com/a.jpg', alt: '', fit: 'cover' },
  } as MagazineElement;
}

function page(id: string, index: number, elements: MagazineElement[]): PageState {
  return {
    id,
    index,
    rev: 3,
    width: PAGE_W,
    height: PAGE_H,
    background: { type: 'color', value: '#ffffff' },
    elements,
  };
}

/** Three pages: two with a headline, the middle one with only a photo. */
const threePages = (): PageState[] => [
  page('p1', 0, [textEl('e1', 'headline', 'Page one headline'), imageEl('i1')]),
  page('p2', 1, [imageEl('i2')]),
  page('p3', 2, [textEl('e3', 'headline', 'Page three headline')]),
];

// ── addressability ────────────────────────────────────────────────────────────

test('a role selector scoped to the issue reaches every page, in page order', () => {
  const found = resolveSelector({ kind: 'role', role: 'headline', scope: { kind: 'issue' } }, threePages());
  assert.deepEqual(found, [
    { pageId: 'p1', elementId: 'e1' },
    { pageId: 'p3', elementId: 'e3' },
  ]);
});

test('a type selector finds images across pages', () => {
  const found = resolveSelector({ kind: 'type', type: 'image', scope: { kind: 'issue' } }, threePages());
  assert.deepEqual(found.map((f) => f.elementId), ['i1', 'i2']);
});

test('scope narrows the reach', () => {
  const found = resolveSelector({ kind: 'role', role: 'headline', scope: { kind: 'page', pageId: 'p3' } }, threePages());
  assert.deepEqual(found, [{ pageId: 'p3', elementId: 'e3' }]);
});

test('an issue-wide selector reaches ONLY the pages it is given — the access boundary', () => {
  // This is the mechanism the POST /commands route relies on for access control:
  // it hands the planner only the pages the caller may VIEW, so a page-scoped
  // collaborator's `scope: 'issue'` cannot reach — or even reveal — a page that
  // was never shared with them. Enforcing it by restricting the input, rather than
  // by filtering results afterwards, is what makes that guarantee total.
  const shared = threePages().filter((p) => p.id !== 'p3');
  const found = resolveSelector({ kind: 'role', role: 'headline', scope: { kind: 'issue' } }, shared);
  assert.deepEqual(found, [{ pageId: 'p1', elementId: 'e1' }]);

  // Naming the unshared page explicitly does not get you there either.
  const direct = resolveSelector({ kind: 'element', pageId: 'p3', elementId: 'e3' }, shared);
  assert.deepEqual(direct, []);

  // ...and a batch aimed at it is refused rather than silently doing nothing.
  const res = planBatch(
    [{ type: 'element.setText', target: { kind: 'element', pageId: 'p3', elementId: 'e3' }, content: 'x' }],
    shared,
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, 'no-match');
});

test('a manual batch stamps new elements as manual, an agent batch as ai-agent', () => {
  const add: MagazineCommand = {
    type: 'element.add',
    pageId: 'p2',
    element: {
      type: 'shape',
      x: 10,
      y: 10,
      w: 200,
      h: 40,
      rotation: 0,
      zIndex: 5,
      locked: false,
      shape: { fill: '#c9a961' },
    } as MagazineCommand extends { element: infer E } ? E : never,
  };
  const asAgent = planBatch([add], threePages(), { origin: 'agent' });
  assert.ok(asAgent.ok);
  assert.equal(asAgent.pages[0]!.elements.at(-1)!.source, 'ai-agent');

  const asHuman = planBatch([add], threePages(), { origin: 'manual' });
  assert.ok(asHuman.ok);
  assert.equal(asHuman.pages[0]!.elements.at(-1)!.source, 'manual');
});

// ── planning ──────────────────────────────────────────────────────────────────

test('one command can plan writes across several pages', () => {
  const cmd: MagazineCommand = {
    type: 'element.setStyle',
    target: { kind: 'role', role: 'headline', scope: { kind: 'issue' } },
    style: { textTransform: 'uppercase', letterSpacing: 2 },
  };
  const res = planBatch([cmd], threePages());
  assert.ok(res.ok);
  // Only the two pages that HAVE a headline are written — p2 is untouched.
  assert.deepEqual(res.pages.map((p) => p.pageId), ['p1', 'p3']);
  for (const p of res.pages) {
    const el = p.elements.find((e) => e.type === 'text')!;
    assert.equal(el.text!.textTransform, 'uppercase');
    assert.equal(el.text!.letterSpacing, 2);
    assert.equal(p.revBefore, 3);
  }
});

test('the inverse snapshot is the page as it was, not as it will be', () => {
  const before = threePages();
  const res = planBatch(
    [{ type: 'element.setText', target: { kind: 'element', pageId: 'p1', elementId: 'e1' }, content: 'Changed' }],
    before,
  );
  assert.ok(res.ok);
  const planned = res.pages[0]!;
  assert.equal(planned.elements.find((e) => e.id === 'e1')!.text!.content, 'Changed');
  assert.equal(planned.before.elements.find((e) => e.id === 'e1')!.text!.content, 'Page one headline');
});

test('planning is pure — the input pages are never mutated', () => {
  const pages = threePages();
  const snapshot = JSON.stringify(pages);
  planBatch(
    [
      { type: 'element.setText', target: { kind: 'element', pageId: 'p1', elementId: 'e1' }, content: 'Mutated?' },
      { type: 'element.delete', target: { kind: 'element', pageId: 'p3', elementId: 'e3' } },
    ],
    pages,
  );
  assert.equal(JSON.stringify(pages), snapshot);
});

test('a locked element refuses the batch, and nothing is planned', () => {
  const pages = threePages();
  pages[0]!.elements[0]!.locked = true;
  const res = planBatch(
    [{ type: 'element.setText', target: { kind: 'element', pageId: 'p1', elementId: 'e1' }, content: 'nope' }],
    pages,
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, 'locked');
});

test('a batch that edits an element it already deleted is refused as contradictory', () => {
  const res = planBatch(
    [
      { type: 'element.delete', target: { kind: 'element', pageId: 'p1', elementId: 'e1' } },
      { type: 'element.setText', target: { kind: 'element', pageId: 'p1', elementId: 'e1' }, content: 'ghost' },
    ],
    threePages(),
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, 'not-found');
});

test('an unknown page id is refused', () => {
  const res = planBatch(
    [{ type: 'page.setBackground', pageId: 'nope', background: { type: 'color', value: '#000000' } }],
    threePages(),
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, 'not-found');
});

test('strict mode fails on a selector that matches nothing; lenient mode skips it', () => {
  const cmd: MagazineCommand = {
    type: 'element.setText',
    target: { kind: 'role', role: 'pullquote', scope: { kind: 'issue' } },
    content: 'x',
  };
  const strict = planBatch([cmd], threePages(), { strict: true });
  assert.equal(strict.ok, false);
  assert.equal(strict.ok === false && strict.reason, 'no-match');

  // Lenient still reports the no-op rather than claiming a successful empty batch.
  const lenient = planBatch([cmd], threePages(), { strict: false });
  assert.equal(lenient.ok, false);
  assert.equal(lenient.ok === false && lenient.reason, 'no-match');
});

test('lenient mode applies the commands that DO match and drops the ones that do not', () => {
  const res = planBatch(
    [
      { type: 'element.setText', target: { kind: 'role', role: 'pullquote', scope: { kind: 'issue' } }, content: 'x' },
      { type: 'element.setText', target: { kind: 'element', pageId: 'p1', elementId: 'e1' }, content: 'kept' },
    ],
    threePages(),
    { strict: false },
  );
  assert.ok(res.ok);
  assert.deepEqual(res.pages.map((p) => p.pageId), ['p1']);
  assert.equal(res.pages[0]!.elements.find((e) => e.id === 'e1')!.text!.content, 'kept');
});

test('a background change alone is enough to plan a write', () => {
  const res = planBatch(
    [{ type: 'page.setBackground', pageId: 'p2', background: { type: 'color', value: '#101010' } }],
    threePages(),
  );
  assert.ok(res.ok);
  assert.equal(res.pages.length, 1);
  assert.deepEqual(res.pages[0]!.background, { type: 'color', value: '#101010' });
  assert.deepEqual(res.pages[0]!.before.background, { type: 'color', value: '#ffffff' });
});

// ── executing ─────────────────────────────────────────────────────────────────

/** A fake store that records writes and can be told to fail the Nth one. */
function fakeStore(opts: { failWriteNumber?: number; failRollback?: boolean; throwOnWrite?: boolean } = {}) {
  const writes: PageWrite[] = [];
  const outcomes: BatchOutcome[] = [];
  let records: BatchRecord[] = [];
  let n = 0;
  const store: CommandStore = {
    async writePage(w) {
      n += 1;
      const isRollback = writes.some((prev) => prev.pageId === w.pageId);
      if (opts.failRollback && isRollback) return false;
      if (opts.failWriteNumber === n) {
        if (opts.throwOnWrite) throw new Error('socket hang up');
        return false;
      }
      writes.push(w);
      return true;
    },
    async recordBatch(r) {
      records.push(r);
      return `batch-${records.length}`;
    },
    async finishBatch(_id, outcome) {
      outcomes.push(outcome);
    },
  };
  return { store, writes, outcomes, records: () => records };
}

const deps = (store: CommandStore) => ({ store, now: () => '2026-08-18T00:00:00.000Z' });

test('a clean multi-page batch writes every page under its own rev check', async () => {
  const plan = planBatch(
    [
      {
        type: 'element.setStyle',
        target: { kind: 'role', role: 'headline', scope: { kind: 'issue' } },
        style: { color: '#c9a961' },
      },
    ],
    threePages(),
  );
  assert.ok(plan.ok);
  const f = fakeStore();
  const res = await executeBatch(plan.pages, meta(plan.pages.length), deps(f.store));

  assert.equal(res.ok, true);
  assert.deepEqual(f.writes.map((w) => w.pageId), ['p1', 'p3']);
  for (const w of f.writes) assert.equal(w.expectedRev, 3);
  assert.deepEqual(res.applied.map((a) => a.revAfter), [4, 4]);
  assert.equal(f.outcomes[0]!.status, 'applied');
});

test('the batch and its inverses are recorded BEFORE the first write', async () => {
  const plan = planBatch(
    [{ type: 'element.setText', target: { kind: 'element', pageId: 'p1', elementId: 'e1' }, content: 'new' }],
    threePages(),
  );
  assert.ok(plan.ok);
  const f = fakeStore({ failWriteNumber: 1 });
  await executeBatch(plan.pages, meta(1), deps(f.store));

  // Recorded even though the only write failed — that record is what makes a
  // partially applied batch recoverable at all.
  const rec = f.records()[0]!;
  assert.equal(rec.inverse.length, 1);
  assert.equal(rec.inverse[0]!.revAfter, 4);
  assert.equal(rec.inverse[0]!.elements.find((e) => e.id === 'e1')!.text!.content, 'Page one headline');
});

test('a conflict on the FIRST page writes nothing and needs no rollback', async () => {
  const plan = planBatch(
    [{ type: 'element.setText', target: { kind: 'element', pageId: 'p1', elementId: 'e1' }, content: 'new' }],
    threePages(),
  );
  assert.ok(plan.ok);
  const f = fakeStore({ failWriteNumber: 1 });
  const res = await executeBatch(plan.pages, meta(1), deps(f.store));

  assert.equal(res.ok, false);
  assert.equal(res.failure!.reason, 'conflict');
  assert.deepEqual(res.applied, []);
  assert.equal(res.rolledBack, undefined);
  assert.equal(f.writes.length, 0);
  assert.equal(f.outcomes[0]!.status, 'conflict');
});

test('a conflict PART WAY through reverts the pages already written', async () => {
  const plan = planBatch(
    [
      {
        type: 'element.setStyle',
        target: { kind: 'role', role: 'headline', scope: { kind: 'issue' } },
        style: { color: '#c9a961' },
      },
    ],
    threePages(),
  );
  assert.ok(plan.ok);
  assert.equal(plan.pages.length, 2);

  const f = fakeStore({ failWriteNumber: 2 }); // p1 lands, p3 conflicts
  const res = await executeBatch(plan.pages, meta(1), deps(f.store));

  assert.equal(res.ok, false);
  assert.equal(res.rolledBack, true);
  // p1 written, then p1 written BACK — conditional on the rev it now holds.
  assert.deepEqual(f.writes.map((w) => w.pageId), ['p1', 'p1']);
  const revert = f.writes[1]!;
  assert.equal(revert.expectedRev, 4);
  assert.equal(revert.elements.find((e) => e.type === 'text')!.text!.color, '#111111');
  assert.equal(f.outcomes[0]!.status, 'rolled-back');
});

test('a thrown write is treated as a failure and still triggers the revert', async () => {
  const plan = planBatch(
    [
      {
        type: 'element.setStyle',
        target: { kind: 'role', role: 'headline', scope: { kind: 'issue' } },
        style: { color: '#c9a961' },
      },
    ],
    threePages(),
  );
  assert.ok(plan.ok);
  const f = fakeStore({ failWriteNumber: 2, throwOnWrite: true });
  const res = await executeBatch(plan.pages, meta(1), deps(f.store));

  assert.equal(res.ok, false);
  assert.equal(res.rolledBack, true);
  assert.match(res.failure!.detail, /socket hang up/);
});

test('a FAILED revert is reported as such, not swallowed', async () => {
  const plan = planBatch(
    [
      {
        type: 'element.setStyle',
        target: { kind: 'role', role: 'headline', scope: { kind: 'issue' } },
        style: { color: '#c9a961' },
      },
    ],
    threePages(),
  );
  assert.ok(plan.ok);
  const f = fakeStore({ failWriteNumber: 2, failRollback: true });
  const res = await executeBatch(plan.pages, meta(1), deps(f.store));

  assert.equal(res.ok, false);
  assert.equal(res.rolledBack, false);
  assert.equal(f.outcomes[0]!.status, 'rollback-failed');
  // The message has to name the batch, because a human now has to look at it.
  assert.match(res.failure!.detail, /revert failed/);
  assert.match(res.failure!.detail, /batch-1/);
});

test('a store that cannot stamp the outcome does not fail the batch', async () => {
  const plan = planBatch(
    [{ type: 'element.setText', target: { kind: 'element', pageId: 'p1', elementId: 'e1' }, content: 'new' }],
    threePages(),
  );
  assert.ok(plan.ok);
  const f = fakeStore();
  const store: CommandStore = {
    ...f.store,
    finishBatch: async () => {
      throw new Error('mongo down');
    },
  };
  const res = await executeBatch(plan.pages, meta(1), deps(store));
  assert.equal(res.ok, true);
});

function meta(commandCount: number) {
  return {
    magazineId: 'm1',
    label: 'Make the headlines gold',
    origin: 'agent' as const,
    actorId: 'u1',
    commandCount,
  };
}
