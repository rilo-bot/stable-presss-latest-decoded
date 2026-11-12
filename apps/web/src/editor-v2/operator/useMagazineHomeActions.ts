// ---------------------------------------------------------------------------
// Magazine Builder v2 — Operator actions for the LIBRARY / composer screen
// (/production-system/magazine-v2). Catalog twin:
// apps/server/src/lib/agent/operator/catalog/magazine.ts ('magazine-home').
//
// Every action drives the real controls (data-agent-id anchors in
// MagazineV2Home.tsx) so the user watches the brief being typed and Generate
// being pressed; nothing here calls a REST route the screen doesn't.
//
// What is NOT here, and why:
//   · createBlank — the composer's "Blank magazine" entry point was removed from
//     this screen (see the header of MagazineV2Home.tsx). There is no control to
//     drive, so there is no action; a short brief to `magazine.generate` is the
//     way to start one.
//   · attaching files — a native file picker cannot be driven from script.
//   · deleting a magazine — the card's Delete goes through window.confirm twice
//     (and a second time for a live edition); the Operator leaves it to a person.
// ---------------------------------------------------------------------------

import { useRef } from 'react';
import { z } from 'zod';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import { actionError, quoteRef } from '@/agent/operator/runtime/humanRef';
import type { IssueSummary } from '../api';
import { anchor, assertEnabled, waitUntil } from './shared';
import { JOB_STARTED_NOTE, startMagazineBuildJob } from './magazineJobs';

const HOME = '/production-system/magazine-v2';
const editorRoute = (id: string) => `${HOME}/${id}`;
/** The id in an editor path, or null on any other route. */
const idFromPath = (path: string) => {
  const m = path.match(/^\/production-system\/magazine-v2\/([^/?#]+)/);
  return m ? m[1]! : null;
};

/** Mirrors parsePageCount in MagazineV2Home — the composer's only page-count input
 *  is the brief itself ("… 6 pages"), so that is what the action writes into. */
const COUNT_RE =
  /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen)[-\s]*pages?\b/i;

interface HomeState {
  issues: IssueSummary[];
  loading: boolean;
  mayCreate: boolean;
  error: string | null;
  starting: boolean;
  /** Id of the card with a copy/delete in flight, else null. */
  pubBusy: string | null;
}

export function useMagazineHomeActions(state: HomeState): void {
  // Live view of the screen's state for runs already in flight: the registry
  // always calls the latest def, but a run that is AWAITING keeps its own closure,
  // so polling must read through a ref.
  const live = useRef(state);
  live.current = state;

  const summary = (it: IssueSummary) => ({
    id: it.id,
    title: it.title,
    status: it.status,
    pageCount: it.pageCount,
    myRole: it.myRole ?? 'view-only',
    // Live = has an edition AND still published (unpublish keeps the id, sets status 'ready').
    published: !!it.publishedIssueId && it.status === 'published',
    owner: it.ownerName || undefined,
    route: editorRoute(it.id),
  });

  useAgentAction({
    name: 'magazine.list',
    description: 'List the magazines in the library (id, title, status, pages, your role, published).',
    args: z.object({}),
    run: async (_a, ui) => {
      await waitUntil(() => !live.current.loading, { signal: ui.signal, what: 'the library to load' });
      return { magazines: live.current.issues.map(summary) };
    },
  });

  useAgentAction({
    name: 'magazine.open',
    description: 'Open a magazine from the library in the studio (by id, or by exact/partial title).',
    args: z.object({ magazine: z.string().min(1) }),
    run: async ({ magazine }, ui) => {
      await waitUntil(() => !live.current.loading, { signal: ui.signal, what: 'the library to load' });
      const q = magazine.trim().toLowerCase();
      const list = live.current.issues;
      let hit = list.find((it) => it.id === magazine.trim()) ?? list.find((it) => it.title.toLowerCase() === q);
      if (!hit) {
        const partial = list.filter((it) => it.title.toLowerCase().includes(q));
        if (partial.length > 1) {
          // Titles for the person; the ids ride in the model-only detail.
          throw actionError(
            `${quoteRef(magazine, 'That reference')} matches ${partial.length} magazines: ${partial.map((p) => `“${p.title}”`).join('; ')}. Pass the id (see detail).`,
            { candidates: partial.map((p) => ({ id: p.id, title: p.title })) },
          );
        }
        hit = partial[0];
      }
      if (!hit) throw new Error(`No magazine in the library matches ${quoteRef(magazine)}. Call magazine.list to see them.`);
      ui.step(`Opening “${hit.title}”`);
      await ui.click(`mag.card-${hit.id}`, `Open “${hit.title}”`);
      await ui.waitForRoute(editorRoute(hit.id), 20_000);
      return { magazineId: hit.id, title: hit.title, route: editorRoute(hit.id) };
    },
  });

  useAgentAction(
    {
      name: 'magazine.generate',
      description:
        'Start a new magazine with AI from a brief: types it into the composer, presses Generate, and lands in the new studio. Returns at once with a jobId — the pages build in the background and a [job-update] message arrives when they are done (no need to wait).',
      args: z.object({
        brief: z.string().min(3).max(4000),
        pageCount: z.number().int().min(3).max(16).optional(),
      }),
      // A new magazine is a sizeable AI build — the user approves the brief first.
      confirm: ({ brief, pageCount }) =>
        `Build a new ${pageCount ? `${pageCount}-page ` : ''}magazine from this brief? “${brief.trim().slice(0, 160)}${brief.trim().length > 160 ? '…' : ''}”`,
      run: async ({ brief, pageCount }, ui) => {
        if (!live.current.mayCreate) throw new Error('Your role cannot create magazines.');
        // The composer reads the page count out of the brief; say it there, the way
        // a person would, unless the brief already names one.
        let text = brief.trim();
        if (pageCount && !COUNT_RE.test(text)) text = `${text.replace(/[.\s]+$/, '')} — ${pageCount} pages.`;

        ui.step('Writing the brief');
        await ui.type('mag.brief-input', text, { clear: true });
        assertEnabled('mag.generate-submit', 'Generate is not available right now.');
        ui.step('Pressing Generate');
        await ui.click('mag.generate-submit', 'Generate');

        // Either the studio opens (the screen navigates to /magazine-v2/:id) or the
        // composer shows its error and stops "starting".
        const outcome = await waitUntil(
          () => {
            const id = idFromPath(window.location.pathname);
            if (id) return { id };
            if (!live.current.starting && live.current.error) return { error: live.current.error };
            return null;
          },
          { signal: ui.signal, timeoutMs: 180_000, intervalMs: 300, what: 'the new magazine to open' },
        );
        if ('error' in outcome) throw new Error(outcome.error);
        // The build runs on the server for minutes. Watch it in the background
        // (polls the server, survives navigation) instead of holding the turn open.
        const job = startMagazineBuildJob({ magazineId: outcome.id, mode: 'new', requested: pageCount });
        return {
          magazineId: outcome.id,
          route: editorRoute(outcome.id),
          brief: text,
          jobId: job.id,
          started: true,
          note: JOB_STARTED_NOTE,
        };
      },
    },
    state.mayCreate,
  );

  useAgentAction(
    {
      name: 'magazine.reuseTemplate',
      description: "Start a NEW magazine from an existing one's layout (its text and photos are cleared; the source is untouched), then open it.",
      args: z.object({ magazineId: z.string().min(1) }),
      run: async ({ magazineId }, ui) => {
        await waitUntil(() => !live.current.loading, { signal: ui.signal, what: 'the library to load' });
        const it = live.current.issues.find((x) => x.id === magazineId);
        if (!it) throw new Error('No magazine with that id is in the library. Call magazine.list to see them.');
        if (!anchor(`mag.card-${it.id}-reuse`)) throw new Error('Reuse template is not available for this magazine.');
        ui.step(`Copying the layout of “${it.title}”`);
        await ui.click(`mag.card-${it.id}-reuse`, 'Reuse template');
        const clickedAt = Date.now();
        // Navigates on success; on failure the card stops being busy and a toast
        // says why — so "not busy, still here" after a beat is the failure signal.
        const out = await waitUntil(
          () => {
            const id = idFromPath(window.location.pathname);
            if (id && id !== magazineId) return { id };
            if (Date.now() - clickedAt > 800 && live.current.pubBusy === null) return { failed: true as const };
            return null;
          },
          { signal: ui.signal, timeoutMs: 60_000, what: 'the copy to open' },
        );
        if (!out.id) throw new Error('The template could not be copied — see the message on screen.');
        return { magazineId: out.id, route: editorRoute(out.id), copiedFrom: { id: it.id, title: it.title } };
      },
    },
    state.mayCreate,
  );
}
