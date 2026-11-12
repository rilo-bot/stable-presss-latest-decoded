// ---------------------------------------------------------------------------
// The Photo Director's pure half, the per-page photo memo, the issue ledger and the
// aspect-ratio rule for generated frames. No model, no Pexels, no storage: candidates
// are hand-made, the director's answer is a string.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  photoMemoKey,
  memoKeysFor,
  PhotoMemo,
  issueStockLedger,
  labelCandidates,
  parseDirectorChoices,
  decideSlots,
  directorContent,
  type DirectorSlot,
  type LabelledCandidate,
} from '../../src/lib/magazineV2/photoDirector.js';
import { nearestAspectRatio, IMAGE_ASPECT_RATIOS } from '../../src/lib/magazineV2/imageBytes.js';
import type { StockCandidate } from '../../src/lib/stock.js';

function cand(id: string, w = 4000, h = 3000): StockCandidate {
  return { id, alt: `photo ${id}`, thumbUrl: `https://images.example/${id}.jpeg`, attribution: { author: `Author ${id}`, url: '' }, width: w, height: h };
}

function slot(slotId: string, ids: string[], index: number): DirectorSlot {
  const [labelled] = labelCandidates([ids.map((id) => cand(id))]);
  return {
    slotId,
    brief: `${slotId} brief`,
    orientation: 'landscape',
    boxW: 1000,
    boxH: 600,
    pageShare: 0.3,
    // Re-label with this slot's position so labels read "2a", "2b"… for slot 2.
    candidates: (labelled ?? []).map((c, j) => ({ ...c, label: `${index + 1}${'abcdefghij'[j]}` })),
  };
}

// ── memo ─────────────────────────────────────────────────────────────────────

test('memo keys normalise the brief and keep the frame shape', () => {
  assert.equal(photoMemoKey('  Chestnut   Horse ', 'portrait'), 'chestnut horse|portrait#0');
  assert.notEqual(photoMemoKey('horse', 'portrait'), photoMemoKey('horse', 'landscape'));
});

test('the nth request of the same brief+shape on a page gets its own key (no shared photo)', () => {
  const keys = memoKeysFor([
    { brief: 'horse', orientation: 'portrait' },
    { brief: 'Horse', orientation: 'portrait' },
    { brief: 'stable', orientation: 'portrait' },
    { brief: 'horse', orientation: 'landscape' },
  ]);
  assert.deepEqual(keys, ['horse|portrait#0', 'horse|portrait#1', 'stable|portrait#0', 'horse|landscape#0']);
  assert.equal(new Set(keys).size, 4);
});

test('a retry asking for the same things in the same order hits the same keys', () => {
  const first = memoKeysFor([{ brief: 'horse', orientation: 'square' }, { brief: 'horse', orientation: 'square' }]);
  const retry = memoKeysFor([{ brief: 'horse ', orientation: 'square' }, { brief: 'HORSE', orientation: 'square' }]);
  assert.deepEqual(retry, first);
});

test('the memo keeps successes only — a slot that found nothing is asked again', () => {
  const memo = new PhotoMemo();
  memo.set('a', { url: 'https://s3/x.jpg', assetId: '1', alt: 'x' });
  memo.set('b', null);
  memo.set('c', { url: '', assetId: '', alt: '' });
  assert.equal(memo.size, 1);
  assert.equal(memo.get('a')?.assetId, '1');
  assert.equal(memo.get('b'), undefined);
});

test('the issue ledger is one shared set per issue', () => {
  const a = issueStockLedger('issue-test-1');
  a.add('123');
  assert.equal(issueStockLedger('issue-test-1').has('123'), true);
  assert.equal(issueStockLedger('issue-test-2').has('123'), false);
});

// ── labels + parsing ─────────────────────────────────────────────────────────

test('candidates are labelled per slot: 1a, 1b… 2a…', () => {
  const out = labelCandidates([[cand('1'), cand('2')], [cand('3')]]);
  assert.deepEqual(out.map((s) => s.map((c) => c.label)), [['1a', '1b'], ['2a']]);
  assert.equal(out[0]![0]!.id, '1');
});

const SLOTS = [slot('hero', ['10', '11', '12'], 0), slot('inset', ['20', '21'], 1)];

test('reads picks and rejections; labels are case-insensitive', () => {
  const choices = parseDirectorChoices(
    '```json\n{"choices":[{"slot":"hero","pick":"1B","why":"subject"},{"slot":"inset","pick":null,"shoot":"a farrier shoeing a hoof in morning light"}]}\n```',
    SLOTS,
  );
  assert.deepEqual(choices.get('hero'), { pick: '1b' });
  assert.deepEqual(choices.get('inset'), { reject: true, shoot: 'a farrier shoeing a hoof in morning light' });
});

test('a label from ANOTHER slot, or an invented one, is no answer — never a rejection', () => {
  const choices = parseDirectorChoices('{"choices":[{"slot":"hero","pick":"2a"},{"slot":"inset","pick":"9z"}]}', SLOTS);
  assert.equal(choices.size, 0);
});

test('a slot can be named by its 1-based position; the first answer for a slot wins', () => {
  const choices = parseDirectorChoices('{"choices":[{"slot":2,"pick":"2b"},{"slot":"inset","pick":"2a"}]}', SLOTS);
  assert.deepEqual(choices.get('inset'), { pick: '2b' });
});

test('garbage is an empty answer', () => {
  assert.equal(parseDirectorChoices('no idea', SLOTS).size, 0);
  assert.equal(parseDirectorChoices('{"choices": "none"}', SLOTS).size, 0);
});

// ── decisions ────────────────────────────────────────────────────────────────

test('director picks are stored; a rejection becomes a generation from its shoot brief', () => {
  const taken = new Set<string>();
  const d = decideSlots(SLOTS, new Map([['hero', { pick: '1c' }], ['inset', { reject: true as const, shoot: 'farrier at dawn' }]]), taken);
  assert.deepEqual(d.get('hero'), { kind: 'stock', candidate: cand('12'), by: 'director' });
  assert.deepEqual(d.get('inset'), { kind: 'generate', prompt: 'farrier at dawn' });
  assert.deepEqual([...taken], ['12']);
});

test('a rejection without a shoot brief generates from the slot brief', () => {
  const d = decideSlots(SLOTS, new Map([['hero', { reject: true as const }]]), new Set());
  assert.deepEqual(d.get('hero'), { kind: 'generate', prompt: 'hero brief' });
});

test('no photo is placed twice: a pick already taken falls back to the next free candidate', () => {
  const shared: DirectorSlot[] = [slot('a', ['1', '2'], 0), slot('b', ['1', '3'], 1)];
  const d = decideSlots(shared, new Map([['a', { pick: '1a' }], ['b', { pick: '2a' }]]), new Set());
  assert.equal((d.get('a') as { candidate: StockCandidate }).candidate.id, '1');
  assert.deepEqual(d.get('b'), { kind: 'stock', candidate: cand('3'), by: 'fallback' });
});

test('photos the issue already placed (the ledger) are skipped by the fallback', () => {
  const ledger = new Set(['10']);
  const d = decideSlots([SLOTS[0]!], null, ledger);
  assert.deepEqual(d.get('hero'), { kind: 'stock', candidate: cand('11'), by: 'fallback' });
  assert.ok(ledger.has('11'));
});

test('no director answer → first free candidate; no candidates → generate', () => {
  const empty: DirectorSlot = { ...SLOTS[1]!, slotId: 'empty', candidates: [] as LabelledCandidate[] };
  const d = decideSlots([SLOTS[1]!, empty], null, new Set());
  assert.deepEqual(d.get('inset'), { kind: 'stock', candidate: cand('20'), by: 'fallback' });
  assert.deepEqual(d.get('empty'), { kind: 'generate', prompt: 'inset brief' });
});

test('the director sees each slot, then only the candidates whose previews loaded', () => {
  const previews = new Map([
    ['1a', { bytes: Buffer.from([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' }],
    ['2b', { bytes: Buffer.from([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' }],
  ]);
  const parts = directorContent(SLOTS, { magazineTitle: 'Turf', pageNumber: 3, pageType: 'Feature', intent: 'A day at the races', photoStyle: 'soft dawn light, 85mm, muted greens' }, previews);
  const files = parts.filter((p) => p.type === 'file');
  assert.equal(files.length, 2);
  const text = parts.filter((p): p is { type: 'text'; text: string } => p.type === 'text').map((p) => p.text).join('\n');
  assert.match(text, /PHOTOGRAPHIC STYLE.*soft dawn light/);
  assert.match(text, /SLOT 1 — id "hero": 30% of the page, frame 1\.67:1 \(wide\)/);
  assert.match(text, /1a — 4000×3000 \(wide\), by Author 10/);
  assert.doesNotMatch(text, /1b —/);
  // Each preview immediately follows its label.
  const i = parts.findIndex((p) => p.type === 'text' && p.text.startsWith('2b —'));
  assert.equal(parts[i + 1]?.type, 'file');
});

// ── generated frames ─────────────────────────────────────────────────────────

test('generated frames use the supported ratio nearest the slot box', () => {
  assert.equal(nearestAspectRatio(1000, 1000), '1:1');
  assert.equal(nearestAspectRatio(1240, 1754), '2:3'); // a full A4 page ≈ 0.707 — a hair nearer 2:3 than 3:4 in log space
  assert.equal(nearestAspectRatio(1240, 600), '21:9'); // 2.07:1 is nearer 21:9 (2.33) than 16:9 (1.78) in log space
  assert.equal(nearestAspectRatio(400, 1200), '9:16');
  assert.equal(nearestAspectRatio(800, 1000), '4:5');
  assert.equal(nearestAspectRatio(1500, 1000), '3:2');
  for (const r of IMAGE_ASPECT_RATIOS) assert.match(r, /^\d+:\d+$/);
});
