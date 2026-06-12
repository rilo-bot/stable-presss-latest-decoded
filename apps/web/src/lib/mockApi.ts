/**
 * In-browser mock API server for Stable Press.
 *
 * Intercepts fetch() calls to paths starting with `/api/` and routes them
 * to the in-memory mock database. Supports full CRUD for every entity.
 *
 * Install once by calling installMockApi() before any store fetch actions run.
 */

import {
  articles,
  horses,
  parties,
  horsePartyLinks,
  races,
  tips,
  podcastEpisodes,
  mediaItems,
  racingEntries,
  sales,
  reports,
  nextId,
} from '@/lib/mockDb';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function created(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

function notFound(msg = 'Not found'): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

async function parseBody<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// Articles
function handleArticles(method: string, id: string | null, body: Record<string, unknown>): Response {
  if (method === 'GET' && !id) return ok(articles);
  if (method === 'GET' && id) {
    const item = articles.find((a) => a.id === id);
    return item ? ok(item) : notFound();
  }
  if (method === 'POST') {
    const newItem = {
      ...body,
      id: nextId('art'),
      createdAt: new Date(),
      publishedAt: (body as { publishedAt?: unknown }).publishedAt ?? null,
    };
    articles.push(newItem as typeof articles[0]);
    return created(newItem);
  }
  if (method === 'PUT' && id) {
    const idx = articles.findIndex((a) => a.id === id);
    if (idx === -1) return notFound();
    articles[idx] = { ...articles[idx], ...body };
    return ok(articles[idx]);
  }
  if (method === 'DELETE' && id) {
    const idx = articles.findIndex((a) => a.id === id);
    if (idx !== -1) articles.splice(idx, 1);
    return noContent();
  }
  return notFound();
}

// Horses
function handleHorses(method: string, id: string | null, body: Record<string, unknown>): Response {
  if (method === 'GET' && !id) return ok(horses);
  if (method === 'GET' && id) {
    const item = horses.find((h) => h.id === id);
    return item ? ok(item) : notFound();
  }
  if (method === 'POST') {
    const newItem = { ...body, id: nextId('horse'), createdAt: new Date() };
    horses.push(newItem as typeof horses[0]);
    return created(newItem);
  }
  if (method === 'PUT' && id) {
    const idx = horses.findIndex((h) => h.id === id);
    if (idx === -1) return notFound();
    horses[idx] = { ...horses[idx], ...body };
    return ok(horses[idx]);
  }
  if (method === 'DELETE' && id) {
    const idx = horses.findIndex((h) => h.id === id);
    if (idx !== -1) horses.splice(idx, 1);
    return noContent();
  }
  return notFound();
}

// Parties
function handleParties(method: string, id: string | null, body: Record<string, unknown>): Response {
  if (method === 'GET' && !id) return ok(parties);
  if (method === 'GET' && id) {
    const item = parties.find((p) => p.id === id);
    return item ? ok(item) : notFound();
  }
  if (method === 'POST') {
    const newItem = { ...body, id: nextId('party'), createdAt: new Date() };
    parties.push(newItem as typeof parties[0]);
    return created(newItem);
  }
  if (method === 'PUT' && id) {
    const idx = parties.findIndex((p) => p.id === id);
    if (idx === -1) return notFound();
    parties[idx] = { ...parties[idx], ...body };
    return ok(parties[idx]);
  }
  if (method === 'DELETE' && id) {
    const idx = parties.findIndex((p) => p.id === id);
    if (idx !== -1) parties.splice(idx, 1);
    return noContent();
  }
  return notFound();
}

// HorsePartyLinks
function handleLinks(method: string, id: string | null, body: Record<string, unknown>): Response {
  if (method === 'GET' && !id) return ok(horsePartyLinks);
  if (method === 'GET' && id) {
    const item = horsePartyLinks.find((l) => l.id === id);
    return item ? ok(item) : notFound();
  }
  if (method === 'POST') {
    const newItem = { ...body, id: nextId('link'), createdAt: new Date() };
    horsePartyLinks.push(newItem as typeof horsePartyLinks[0]);
    return created(newItem);
  }
  if (method === 'PUT' && id) {
    const idx = horsePartyLinks.findIndex((l) => l.id === id);
    if (idx === -1) return notFound();
    horsePartyLinks[idx] = { ...horsePartyLinks[idx], ...body };
    return ok(horsePartyLinks[idx]);
  }
  if (method === 'DELETE' && id) {
    const idx = horsePartyLinks.findIndex((l) => l.id === id);
    if (idx !== -1) horsePartyLinks.splice(idx, 1);
    return noContent();
  }
  return notFound();
}

// Races
function handleRaces(method: string, id: string | null, body: Record<string, unknown>): Response {
  if (method === 'GET' && !id) return ok(races);
  if (method === 'GET' && id) {
    const item = races.find((r) => r.id === id);
    return item ? ok(item) : notFound();
  }
  if (method === 'POST') {
    const newItem = { ...body, id: nextId('race'), createdAt: new Date().toISOString() };
    races.push(newItem as typeof races[0]);
    return created(newItem);
  }
  if (method === 'PUT' && id) {
    const idx = races.findIndex((r) => r.id === id);
    if (idx === -1) return notFound();
    const bodyTyped = body as { winnerHorseId?: string };
    if (bodyTyped.winnerHorseId !== undefined) {
      races[idx] = { ...races[idx], ...body, status: 'resolved' as const };
    } else {
      races[idx] = { ...races[idx], ...body };
    }
    return ok(races[idx]);
  }
  if (method === 'DELETE' && id) {
    const idx = races.findIndex((r) => r.id === id);
    if (idx !== -1) races.splice(idx, 1);
    return noContent();
  }
  return notFound();
}

// Tips
function handleTips(method: string, id: string | null, body: Record<string, unknown>): Response {
  if (method === 'GET' && !id) return ok(tips);
  if (method === 'GET' && id) {
    const item = tips.find((t) => t.id === id);
    return item ? ok(item) : notFound();
  }
  if (method === 'POST') {
    const newItem = {
      ...body,
      id: nextId('tip'),
      payout: null,
      result: 'pending',
      createdAt: new Date().toISOString(),
    };
    tips.push(newItem as typeof tips[0]);
    return created(newItem);
  }
  if (method === 'PUT' && id) {
    const idx = tips.findIndex((t) => t.id === id);
    if (idx === -1) return notFound();
    tips[idx] = { ...tips[idx], ...body };
    return ok(tips[idx]);
  }
  if (method === 'DELETE' && id) {
    const idx = tips.findIndex((t) => t.id === id);
    if (idx !== -1) tips.splice(idx, 1);
    return noContent();
  }
  return notFound();
}

// Podcast Episodes
function handlePodcasts(method: string, id: string | null, body: Record<string, unknown>): Response {
  if (method === 'GET' && !id) return ok(podcastEpisodes);
  if (method === 'GET' && id) {
    const item = podcastEpisodes.find((e) => e.id === id);
    return item ? ok(item) : notFound();
  }
  if (method === 'POST') {
    const newItem = { ...body, id: nextId('pod'), createdAt: new Date().toISOString() };
    podcastEpisodes.push(newItem as typeof podcastEpisodes[0]);
    return created(newItem);
  }
  if (method === 'PUT' && id) {
    const idx = podcastEpisodes.findIndex((e) => e.id === id);
    if (idx === -1) return notFound();
    podcastEpisodes[idx] = { ...podcastEpisodes[idx], ...body };
    return ok(podcastEpisodes[idx]);
  }
  if (method === 'DELETE' && id) {
    const idx = podcastEpisodes.findIndex((e) => e.id === id);
    if (idx !== -1) podcastEpisodes.splice(idx, 1);
    return noContent();
  }
  return notFound();
}

// Media Items
function handleMediaItems(method: string, id: string | null, body: Record<string, unknown>): Response {
  if (method === 'GET' && !id) return ok(mediaItems);
  if (method === 'GET' && id) {
    const item = mediaItems.find((m) => m.id === id);
    return item ? ok(item) : notFound();
  }
  if (method === 'POST') {
    const newItem = { ...body, id: nextId('media'), createdAt: new Date() };
    mediaItems.push(newItem as typeof mediaItems[0]);
    return created(newItem);
  }
  if (method === 'PUT' && id) {
    const idx = mediaItems.findIndex((m) => m.id === id);
    if (idx === -1) return notFound();
    mediaItems[idx] = { ...mediaItems[idx], ...body };
    return ok(mediaItems[idx]);
  }
  if (method === 'DELETE' && id) {
    const idx = mediaItems.findIndex((m) => m.id === id);
    if (idx !== -1) mediaItems.splice(idx, 1);
    return noContent();
  }
  return notFound();
}

// Racing Entries
function handleRacingEntries(method: string, id: string | null, body: Record<string, unknown>): Response {
  if (method === 'GET' && !id) return ok(racingEntries);
  if (method === 'GET' && id) {
    const item = racingEntries.find((e) => e.id === id);
    return item ? ok(item) : notFound();
  }
  if (method === 'POST') {
    const newItem = { ...body, id: nextId('rentry'), createdAt: new Date() };
    racingEntries.push(newItem as typeof racingEntries[0]);
    return created(newItem);
  }
  if (method === 'PUT' && id) {
    const idx = racingEntries.findIndex((e) => e.id === id);
    if (idx === -1) return notFound();
    racingEntries[idx] = { ...racingEntries[idx], ...body };
    return ok(racingEntries[idx]);
  }
  if (method === 'DELETE' && id) {
    const idx = racingEntries.findIndex((e) => e.id === id);
    if (idx !== -1) racingEntries.splice(idx, 1);
    return noContent();
  }
  return notFound();
}

// Sales
function handleSales(method: string, id: string | null, body: Record<string, unknown>): Response {
  if (method === 'GET' && !id) return ok(sales);
  if (method === 'GET' && id) {
    const item = sales.find((s) => s.id === id);
    return item ? ok(item) : notFound();
  }
  if (method === 'POST') {
    const newItem = { ...body, id: nextId('sale'), createdAt: new Date() };
    sales.unshift(newItem as typeof sales[0]);
    return created(newItem);
  }
  if (method === 'PUT' && id) {
    const idx = sales.findIndex((s) => s.id === id);
    if (idx === -1) return notFound();
    sales[idx] = { ...sales[idx], ...body };
    return ok(sales[idx]);
  }
  if (method === 'DELETE' && id) {
    const idx = sales.findIndex((s) => s.id === id);
    if (idx !== -1) sales.splice(idx, 1);
    return noContent();
  }
  return notFound();
}

// Reports / Forms
function handleReports(method: string, id: string | null, body: Record<string, unknown>): Response {
  if (method === 'GET' && !id) return ok(reports);
  if (method === 'GET' && id) {
    const item = reports.find((r) => r.id === id);
    return item ? ok(item) : notFound();
  }
  if (method === 'POST') {
    const newItem = { ...body, id: nextId('report'), createdAt: new Date() };
    reports.unshift(newItem as typeof reports[0]);
    return created(newItem);
  }
  if (method === 'PUT' && id) {
    const idx = reports.findIndex((r) => r.id === id);
    if (idx === -1) return notFound();
    reports[idx] = { ...reports[idx], ...body };
    return ok(reports[idx]);
  }
  if (method === 'DELETE' && id) {
    const idx = reports.findIndex((r) => r.id === id);
    if (idx !== -1) reports.splice(idx, 1);
    return noContent();
  }
  return notFound();
}

// ─── Main interceptor ─────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch.bind(globalThis);

async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  // Only intercept relative /api/* paths or absolute paths with /api/
  const apiMatch = url.match(/(?:^|\/)api\/([\w/]+?)(?:\?|$)/);
  if (!apiMatch) return originalFetch(input, init);

  const fullPath = apiMatch[1]; // e.g. "articles/art-001" or "articles"

  // Auth is served by the REAL backend (dev proxy / VITE_API_URL), not the mock.
  if (fullPath === 'auth' || fullPath.startsWith('auth/')) {
    return originalFetch(input, init);
  }

  const method = (init?.method ?? 'GET').toUpperCase();
  const body = await parseBody<Record<string, unknown>>(new Request(url, init));

  const parts = fullPath.split('/');
  const resource = parts[0];
  const id = parts[1] ?? null;

  try {
    switch (resource) {
      case 'articles':        return handleArticles(method, id, body);
      case 'horses':          return handleHorses(method, id, body);
      case 'parties':         return handleParties(method, id, body);
      case 'horsePartyLinks': return handleLinks(method, id, body);
      case 'races':           return handleRaces(method, id, body);
      case 'tips':            return handleTips(method, id, body);
      case 'podcastEpisodes': return handlePodcasts(method, id, body);
      case 'mediaItems':      return handleMediaItems(method, id, body);
      case 'racingEntries':   return handleRacingEntries(method, id, body);
      case 'sales':           return handleSales(method, id, body);
      case 'reports':         return handleReports(method, id, body);
      default:
        return new Response(JSON.stringify({ error: `Unknown resource: ${resource}` }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal mock error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ─── Install ──────────────────────────────────────────────────────────────────

let installed = false;

export function installMockApi(): void {
  if (installed) return;
  installed = true;
  // @ts-expect-error override global fetch
  globalThis.fetch = mockFetch;
}
