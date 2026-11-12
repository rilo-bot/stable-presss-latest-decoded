// ---------------------------------------------------------------------------
// Photo sourcing under the Pexels free tier (200 requests/hour) — lib/stock.ts's
// search cache, in-flight de-duplication and rate-limit cooldown; storing a pick
// WITHOUT a second API lookup; and the issue ledger seeded from stored media so a
// later run cannot repeat an older photo.
//
// Mocks only: `fetch` is replaced by a router that answers the Pexels API and CDN
// and THROWS on anything else (so nothing can reach the network); storage is
// patched in memory; the clock is node:test's mocked Date. No DB, no S3, no model.
// ---------------------------------------------------------------------------

import { after, afterEach, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';

// Read at import time by lib/stock.ts / storage.ts / photoDirector.ts — set first.
process.env.PEXELS_API_KEY = 'test-pexels-key';
process.env.STOCK_PROVIDER = 'pexels';
process.env.MAGAZINE_V2_PHOTO_DIRECTOR = '0'; // the director's vision call is never made here
for (const k of ['S3_BUCKET', 'S3_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_ENDPOINT', 'S3_PUBLIC_BASE_URL']) delete process.env[k];

type StockMod = typeof import('../../src/lib/stock.js');
type DirectorMod = typeof import('../../src/lib/magazineV2/photoDirector.js');
type StorageMod = typeof import('../../src/lib/storage.js');
let stock: StockMod;
let director: DirectorMod;
let storage: StorageMod['storage'];

const T0 = Date.UTC(2026, 10, 12, 10, 0, 0);
const realFetch = globalThis.fetch;

// ── the fake Pexels ──────────────────────────────────────────────────────────

interface Call {
  url: string;
}
let calls: Call[] = [];
/** The fake API: /v1/search → 12 photos, /v1/photos/:id → that photo. */
function defaultApi(url: URL): Response {
  if (url.pathname.startsWith('/v1/photos/')) return json(pexelsPhoto(Number(url.pathname.split('/').pop())));
  return searchResponse(url);
}
/** Answer for every api.pexels.com request; overridable per test. */
let apiHandler: (url: URL) => Response = defaultApi;
const uploads: string[] = [];

function pexelsPhoto(id: number) {
  return {
    id,
    url: `https://www.pexels.com/photo/horse-${id}/`,
    alt: `Horse photo ${id}`,
    width: 4000,
    height: 3000,
    photographer: `Photographer ${id}`,
    photographer_url: `https://www.pexels.com/@p${id}`,
    src: {
      medium: `https://images.pexels.com/photos/${id}/m.jpeg`,
      large: `https://images.pexels.com/photos/${id}/l.jpeg`,
      large2x: `https://images.pexels.com/photos/${id}/l2x.jpeg`,
    },
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

/** A search answer: 12 photos whose ids derive from the query, so queries differ. */
function searchResponse(url: URL, ids?: number[]): Response {
  const base = [...(url.searchParams.get('query') ?? '')].reduce((a, ch) => a + ch.charCodeAt(0), 0) * 100;
  const list = ids ?? Array.from({ length: Number(url.searchParams.get('per_page') ?? 12) }, (_, i) => base + i);
  return json({ photos: list.map(pexelsPhoto) });
}

const fakeFetch = (async (input: string | URL | Request) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  calls.push({ url: url.href });
  if (url.hostname === 'api.pexels.com') return apiHandler(url);
  if (url.hostname === 'images.pexels.com') {
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  }
  throw new Error(`test: unexpected network request to ${url.href}`);
}) as typeof fetch;

const apiCalls = (path: string) => calls.filter((c) => c.url.startsWith(`https://api.pexels.com/v1/${path}`)).length;

before(async () => {
  globalThis.fetch = fakeFetch;
  stock = await import('../../src/lib/stock.js');
  director = await import('../../src/lib/magazineV2/photoDirector.js');
  storage = (await import('../../src/lib/storage.js')).storage;
  // In-memory "S3".
  storage.isConfigured = () => true;
  storage.uploadObject = (async (o: { key: string }) => {
    uploads.push(o.key);
  }) as typeof storage.uploadObject;
  storage.publicUrl = (key: string) => `https://cdn.test/${key}`;
});

after(() => {
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  stock.resetStockSearchState();
  calls = [];
  uploads.length = 0;
  apiHandler = defaultApi;
  mock.timers.enable({ apis: ['Date'], now: T0 });
});

afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
});

// ── 1. cache + in-flight de-duplication ──────────────────────────────────────

test('identical searches in flight share ONE request, whatever count each asks for', async () => {
  const [a, b, c] = await Promise.all([
    stock.searchStockPhotos('Grey horse  galloping', { orientation: 'landscape', count: 8 }),
    stock.searchStockPhotos('grey horse galloping', { orientation: 'landscape', count: 1 }),
    stock.searchStockPhotos(' grey horse galloping ', { orientation: 'landscape' }),
  ]);
  assert.equal(apiCalls('search'), 1);
  assert.equal(a.length, 8);
  assert.equal(b.length, 1);
  assert.equal(c.length, 6);
  assert.equal(b[0]!.id, a[0]!.id);
  // One request always asks for the module maximum, so every count is served from it.
  const sent = new URL(calls[0]!.url);
  assert.equal(sent.searchParams.get('per_page'), '12');
  assert.equal(sent.searchParams.get('orientation'), 'landscape');
});

test('results are cached per (query, orientation) for an hour', async () => {
  await stock.searchStockPhotos('stable yard at dawn', { orientation: 'portrait', count: 8 });
  mock.timers.setTime(T0 + 59 * 60_000);
  const again = await stock.searchStockPhotos('Stable yard at dawn', { orientation: 'portrait', count: 12 });
  assert.equal(apiCalls('search'), 1, 'served from cache');
  assert.equal(again.length, 12);

  await stock.searchStockPhotos('stable yard at dawn', { orientation: 'landscape' });
  assert.equal(apiCalls('search'), 2, 'another orientation is another search');

  mock.timers.setTime(T0 + 61 * 60_000);
  await stock.searchStockPhotos('stable yard at dawn', { orientation: 'portrait' });
  assert.equal(apiCalls('search'), 3, 'expired after the TTL');
});

test('a failed search is not cached — the next caller asks again', async () => {
  apiHandler = () => json({ error: 'boom' }, 500);
  assert.deepEqual(await stock.searchStockPhotos('farrier at work'), []);
  apiHandler = defaultApi;
  const ok = await stock.searchStockPhotos('farrier at work');
  assert.equal(ok.length, 6);
  assert.equal(apiCalls('search'), 2);
  assert.equal(stock.stockCooldownUntil(), 0, 'a 500 is not a rate limit');
});

// ── 2. rate limit: cooldown, then recovery ───────────────────────────────────

test('a 429 pauses Pexels until X-Ratelimit-Reset: nothing is sent, the cache still answers, logged once, then it recovers', async () => {
  const warns: string[] = [];
  mock.method(console, 'warn', (...args: unknown[]) => {
    warns.push(args.map(String).join(' '));
  });

  const cached = await stock.searchStockPhotos('auctioneer at a yearling sale', { count: 3 });
  assert.equal(cached.length, 3);

  const resetAt = T0 + 10 * 60_000;
  apiHandler = () => json({ error: 'Rate limit exceeded' }, 429, { 'X-Ratelimit-Reset': String(Math.floor(resetAt / 1000)), 'X-Ratelimit-Remaining': '0' });
  assert.deepEqual(await stock.searchStockPhotos('jockey weighing in'), []);
  assert.equal(stock.stockCooldownUntil(), resetAt);
  const sentBefore = calls.length;

  // During the cooldown: uncached searches cost no request and come back empty (the
  // magazine then generates the frame); a cached one is still served; a lookup is null.
  const during = await Promise.all([
    stock.searchStockPhotos('grandstand at dusk'),
    stock.searchStockPhotos('jockey weighing in'),
    stock.searchStockPhotos('auctioneer at a yearling sale', { count: 3 }),
    stock.getStockPhoto('12345'),
  ]);
  assert.deepEqual(during[0], []);
  assert.deepEqual(during[1], []);
  assert.deepEqual(during[2].map((c) => c.id), cached.map((c) => c.id));
  assert.equal(during[3], null);
  assert.equal(calls.length, sentBefore, 'no request while cooling down');
  assert.equal(warns.filter((w) => /rate limit/i.test(w)).length, 1, 'logged once per cooldown');

  // After the reset: requests resume.
  apiHandler = defaultApi;
  mock.timers.setTime(resetAt + 1);
  assert.equal(stock.stockCooldownUntil(), 0);
  const after = await stock.searchStockPhotos('jockey weighing in');
  assert.equal(after.length, 6);
  assert.equal(calls.length, sentBefore + 1);
});

test('a 429 with no reset header backs off; a success saying 0 remain pauses until its reset', async () => {
  mock.method(console, 'warn', () => {});
  apiHandler = () => json({}, 429);
  // Three different searches sent at once all come back 429 — ONE burst.
  await Promise.all([
    stock.searchStockPhotos('paddock parade'),
    stock.searchStockPhotos('saddling enclosure'),
    stock.searchStockPhotos('mounting yard'),
  ]);
  assert.equal(apiCalls('search'), 3);
  const until = stock.stockCooldownUntil();
  // The default back-off (5 min), not escalated by the burst's other two 429s.
  assert.equal(until, T0 + 5 * 60_000);

  // A 429 straight after the back-off is a NEW refusal: the back-off doubles.
  mock.timers.setTime(until + 1);
  await stock.searchStockPhotos('paddock parade');
  assert.equal(stock.stockCooldownUntil(), until + 1 + 10 * 60_000);

  mock.timers.setTime(stock.stockCooldownUntil() + 1);
  const now = Date.now();
  const resetAt = now + 120_000;
  apiHandler = (url) => {
    const r = searchResponse(url);
    return new Response(r.body, { status: 200, headers: { 'X-Ratelimit-Remaining': '0', 'X-Ratelimit-Reset': String(Math.floor(resetAt / 1000)) } });
  };
  const got = await stock.searchStockPhotos('paddock parade');
  assert.equal(got.length, 6, 'the last allowed request still answers');
  assert.equal(stock.stockCooldownUntil(), Math.floor(resetAt / 1000) * 1000);
  const sent = calls.length;
  assert.deepEqual(await stock.searchStockPhotos('winners enclosure'), []);
  assert.equal(calls.length, sent, 'stopped BEFORE a request is refused');
});

// ── 3. storing a pick: no second lookup ──────────────────────────────────────

test('storing a searched candidate downloads its full-size URL directly — no second Pexels lookup', async () => {
  const [, , pick] = await stock.searchStockPhotos('chestnut mare in a paddock', { count: 6 });
  assert.ok(pick?.fullUrl?.startsWith('https://images.pexels.com/'));
  calls = [];

  const stored = await stock.storeStockPhoto(pick!, 'public/magazinesV2/mag-1');
  assert.ok(stored);
  assert.equal(apiCalls(''), 0, 'no API request at all');
  assert.deepEqual(calls.map((c) => c.url), [pick!.fullUrl]);
  assert.equal(uploads.length, 1);
  assert.match(uploads[0]!, /^public\/magazinesV2\/mag-1\/[0-9a-f-]+-stock\.jpg$/);
  // Credit, source link and the exact provider id travel onto the stored photo.
  assert.equal(stored!.provider, 'pexels');
  assert.equal(stored!.providerId, pick!.id);
  assert.equal(stored!.sourceUrl, pick!.pageUrl);
  assert.deepEqual(stored!.attribution, pick!.attribution);
  assert.equal(stored!.url, `https://cdn.test/${uploads[0]}`);
});

test('a stored pick still works during an API cooldown (the CDN is not the API)', async () => {
  const [pick] = await stock.searchStockPhotos('starting gates', { count: 1 });
  mock.method(console, 'warn', () => {});
  apiHandler = () => json({}, 429);
  await stock.searchStockPhotos('something uncached');
  assert.ok(stock.stockCooldownUntil() > 0);
  const stored = await stock.storeStockPhoto(pick!, 'public/magazinesV2/mag-1');
  assert.ok(stored, 'stored from the candidate URL despite the cooldown');
});

test('getStockPhoto + storeStockPhoto (the library route) is ONE API request, not two', async () => {
  const candidate = await stock.getStockPhoto('4242');
  assert.ok(candidate);
  const stored = await stock.storeStockPhoto(candidate!, 'public/magazinesV2/mag-1/media');
  assert.ok(stored);
  assert.equal(apiCalls('photos/'), 1);
  assert.equal(stored!.providerId, '4242');
});

test('a candidate without a trusted full-size URL is re-resolved by id — never downloaded from elsewhere', async () => {
  const [c] = await stock.searchStockPhotos('owner leading in', { count: 1 });
  calls = [];
  const forged = { ...c!, fullUrl: 'https://evil.example/x.jpg' };
  const stored = await stock.storeStockPhoto(forged, 'public/magazinesV2/mag-1');
  assert.ok(stored);
  assert.equal(apiCalls(`photos/${c!.id}`), 1);
  assert.equal(calls.some((x) => x.url.includes('evil.example')), false);
  // And a made-up id still fails rather than storing anything.
  assert.equal(await stock.storeStockPhoto({ ...c!, id: 'not-an-id', fullUrl: undefined }, 'public/x'), null);
});

// ── 4. the ledger, seeded from the issue's stored media ──────────────────────

const REQ = { slotId: 'hero', brief: 'horse in morning mist', orientation: 'landscape' as const, boxW: 1200, boxH: 700, pageShare: 0.4 };
const CTX = { magazineTitle: 'Test', pageNumber: 3, pageType: 'feature', intent: 'a feature' };

test('seeding: exact ids from new rows, fingerprints from older rows; non-stock rows ignored', () => {
  const ledger = new Set<string>();
  const n = director.seedStockLedger(ledger, [
    { source: 'stock', stockId: '101' },
    { source: 'stock', stockId: 202 },
    // Stored before stockId was recorded: photographer URL + Pexels alt only.
    { source: 'stock', alt: '  Horse   photo 303 ', attribution: { url: 'https://www.pexels.com/@P303/' } },
    { source: 'stock' }, // nothing to match on
    { source: 'upload', stockId: '404', alt: 'Horse photo 404', attribution: { url: 'https://www.pexels.com/@p404' } },
    { source: 'ai-image', alt: 'Horse photo 505' },
  ]);
  assert.equal(n, 3);
  assert.ok(director.isStockTaken(ledger, { id: '101', alt: 'x', thumbUrl: '', attribution: { author: '', url: '' } }));
  assert.ok(director.isStockTaken(ledger, { id: '202', alt: 'x', thumbUrl: '', attribution: { author: '', url: '' } }));
  // The older row matches the same photo found again, by fingerprint (case/space-insensitive).
  assert.ok(director.isStockTaken(ledger, { id: '303', alt: 'Horse photo 303', thumbUrl: '', attribution: { author: 'P', url: 'https://www.pexels.com/@p303' } }));
  assert.equal(director.isStockTaken(ledger, { id: '404', alt: 'Horse photo 404', thumbUrl: '', attribution: { author: '', url: 'https://www.pexels.com/@p404' } }), false);
});

test('a later run never re-places a photo the issue already holds; the ledger is per magazine', async () => {
  apiHandler = (url) => searchResponse(url, [101, 303, 505, 606, 707]);
  const ledger = director.issueStockLedger('mag-seeded');
  director.seedStockLedger(ledger, [
    { source: 'stock', stockId: '101' },
    { source: 'stock', alt: 'Horse photo 303', attribution: { url: 'https://www.pexels.com/@p303' } },
  ]);

  const first = await director.directPagePhotos([REQ], CTX, ledger);
  const d1 = first.decisions.get('hero');
  assert.equal(d1?.kind, 'stock');
  assert.equal(d1?.kind === 'stock' && d1.candidate.id, '505', 'skips 101 (by id) and 303 (by fingerprint)');
  assert.ok(ledger.has('505'), 'the pick joins the ledger');

  // The next page asks for the same brief: cached search, next free photo.
  const second = await director.directPagePhotos([{ ...REQ, slotId: 'inset' }], CTX, ledger);
  const d2 = second.decisions.get('inset');
  assert.equal(d2?.kind === 'stock' && d2.candidate.id, '606');
  assert.equal(apiCalls('search'), 1, 'the second page reused the cached search');

  // Another magazine's ledger is its own.
  const other = await director.directPagePhotos([REQ], CTX, director.issueStockLedger('mag-other'));
  const d3 = other.decisions.get('hero');
  assert.equal(d3?.kind === 'stock' && d3.candidate.id, '101');
});

test('during a Pexels cooldown a slot falls through to generation instead of failing', async () => {
  mock.method(console, 'warn', () => {});
  apiHandler = () => json({}, 429);
  const res = await director.directPagePhotos([REQ], CTX, director.issueStockLedger('mag-cooldown'));
  assert.deepEqual(res.decisions.get('hero'), { kind: 'generate', prompt: REQ.brief });
});
