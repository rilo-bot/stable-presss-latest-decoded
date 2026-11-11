// ---------------------------------------------------------------------------
// The Stable Hand — BULLETINS: the newsstand (/bulletins) and the reader
// (/bulletins/:id).
//
//   bulletins.list        the published editions, newest first.
//   bulletins.open        clicks an edition's cover on the newsstand.
//   bulletins.read        the open edition: title, edition, pages, page in view.
//   bulletins.goToPage    scrolls the reader to page N (1-based), visibly.
//   bulletins.downloadPdf presses the reader's own Download PDF button — the
//                         same GET /api/issues/:id/pdf a click makes — and
//                         reports what the page said (ready / still preparing /
//                         failed). Nothing is written.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/site.ts — keep in step.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import { useIssueStore } from '@/stores/issueStore';
import type { IssueSummary } from '@/types/magazine';
import { anchor, day, resolveOne, sleep, useLive, waitUntil, watchToasts } from './siteUtils';

const issueRow = (i: IssueSummary) => ({
  id: i.id,
  title: i.title,
  edition: i.edition,
  pages: i.pageCount,
  publishedAt: day(i.publishedAt),
  path: `/bulletins/${i.id}`,
});

export const bulletinPageId = (n: number) => `site.bulletin-page-${n}`;

export function useBulletinListOperatorActions(): void {
  useAgentAction({
    name: 'bulletins.list',
    description: 'List the published Bulletin editions on the newsstand, newest first.',
    args: z.object({}),
    run: async () => {
      const s = useIssueStore.getState();
      return { loaded: s.loaded, editions: (s.issues ?? []).map(issueRow) };
    },
  });

  useAgentAction<{ edition: string }>({
    name: 'bulletins.open',
    description: 'Open an edition in the reader by clicking its cover (by id, title or edition name).',
    args: z.object({ edition: z.string().min(1).max(160) }),
    run: async (a, ui) => {
      await waitUntil(() => useIssueStore.getState().loaded, { timeoutMs: 8000, signal: ui.signal });
      const issues = useIssueStore.getState().issues ?? [];
      const hit = resolveOne(a.edition, issues, (i) => [i.id, i.title, i.edition, `${i.title} ${i.edition}`], 'edition', (i) => `${i.title} (${i.edition})`);
      await ui.click(`site.bulletin-${hit.id}`, hit.title);
      await ui.waitForRoute(`/bulletins/${hit.id}`);
      const ok = await waitUntil(() => !!useIssueStore.getState().byId[hit.id], { timeoutMs: 15_000, signal: ui.signal });
      const full = useIssueStore.getState().byId[hit.id];
      return { opened: issueRow(hit), loaded: ok, pages: full?.pages.length ?? hit.pageCount, path: `/bulletins/${hit.id}` };
    },
  });
}

/** 1-based page whose box covers most of the viewport right now. */
function pageInView(total: number): number | null {
  let best: { n: number; seen: number } | null = null;
  for (let n = 1; n <= total; n++) {
    const el = anchor(bulletinPageId(n));
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const seen = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
    if (!best || seen > best.seen) best = { n, seen };
  }
  return best && best.seen > 0 ? best.n : null;
}

export function useBulletinReaderOperatorActions(issueId: string | undefined): void {
  const live = useLive(issueId);
  const current = () => (live.current ? useIssueStore.getState().byId[live.current] : undefined);

  useAgentAction({
    name: 'bulletins.read',
    description: 'Read the open edition: title, edition, page count, which page is in view.',
    args: z.object({}),
    run: async () => {
      const i = current();
      if (!i) throw new Error('The edition has not loaded (or is unavailable).');
      return {
        id: i.id,
        title: i.title,
        edition: i.edition,
        pages: i.pages.length,
        scope: i.scope,
        publishedAt: day(i.publishedAt),
        live: !i.unpublishedAt,
        pageInView: pageInView(i.pages.length),
      };
    },
  });

  useAgentAction<{ page: number }>({
    name: 'bulletins.goToPage',
    description: 'Scroll the reader to page N (1-based).',
    args: z.object({ page: z.number().int().min(1) }),
    run: async (a, ui) => {
      const i = current();
      if (!i) throw new Error('The edition has not loaded yet.');
      if (a.page > i.pages.length) throw new Error(`This edition has ${i.pages.length} page(s).`);
      const id = bulletinPageId(a.page);
      await ui.point(id, `Page ${a.page}`);
      anchor(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      await sleep(600, ui.signal);
      ui.flash(id);
      return { page: a.page, of: i.pages.length, pageInView: pageInView(i.pages.length) };
    },
  });

  useAgentAction({
    name: 'bulletins.downloadPdf',
    description: "Press the reader's Download PDF button and report whether the PDF downloaded or is still being prepared.",
    args: z.object({}),
    run: async (_a, ui) => {
      const i = current();
      if (!i) throw new Error('The edition has not loaded yet.');
      const btn = () => anchor<HTMLButtonElement>('site.bulletin-download');
      const toasts = watchToasts();
      await ui.click('site.bulletin-download', 'Download PDF');
      // handleDownload polls a 202 for up to 90s, then re-enables the button.
      await waitUntil(() => !!btn()?.disabled, { timeoutMs: 1500, signal: ui.signal });
      ui.step('Waiting for the PDF');
      const done = await waitUntil(() => !btn()?.disabled, { timeoutMs: 100_000, intervalMs: 300, signal: ui.signal });
      await sleep(300, ui.signal);
      const msgs = toasts.collect();
      const err = msgs.find((t) => t.type === 'error');
      if (err) throw new Error(err.text);
      const preparing = msgs.find((t) => /still being prepared/i.test(t.text));
      return {
        edition: i.title,
        status: !done ? 'still-working' : preparing ? 'still-preparing' : 'download-started',
        note: preparing
          ? 'The server is still rendering this PDF — try again in a minute.'
          : 'The browser downloads the PDF file (Content-Disposition: attachment); the reader stays on this page.',
        messages: msgs.map((t) => t.text),
      };
    },
  });
}
