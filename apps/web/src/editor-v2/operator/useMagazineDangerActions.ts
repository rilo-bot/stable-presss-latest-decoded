// ---------------------------------------------------------------------------
// Magazine Builder v2 — Operator DANGER actions for the studio
// (/production-system/magazine-v2/:id). Catalog twin:
// apps/server/src/lib/agent/operator/catalog/magazine.ts ('magazine-editor').
//
// Every one of these is irreversible, and every one is guarded in the app by a
// native window.confirm() — which the Operator cannot click. They drive the REAL
// buttons anyway (THE RULE in agent/operator/contracts.ts): the user OKs the
// Operator's confirm card first, which pre-approves this step
// (runtime/nativeDialogs.ts), so the app's own window.confirm() answers OK while
// the action runs — and only then.
//
//   magazine.deleteMagazine   More ▸ Delete magazine…        (confirm card up front)
//   magazine.startOver        More ▸ Start over…              (confirm card up front)
//   magazine.copyPdfPage      Page panel ▸ Copy a page exactly (card once the PDF
//                             and page are known to be valid)
//   magazine.applyLayout      Page panel ▸ Match a layout ▸ "Put this page in that
//                             layout" (card once a reading exists). The reference
//                             picture is uploaded FIRST with the `upload` client
//                             tool (agentId 'mag.layout-upload'); calling this
//                             before that opens the panel and says so.
// ---------------------------------------------------------------------------

import { useRef } from 'react';
import { z } from 'zod';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import type { UiDriver } from '@/agent/operator/contracts';
import { useEditorStore } from '../store';
import { anchor, assertEnabled, clickIfPresent, errorToasts, pageAt, pageNo, pageNoOf, sleep, waitUntil, watchToasts, type SeenToast } from './shared';

const get = () => useEditorStore.getState();
const LIBRARY = '/production-system/magazine-v2';

const DECLINED = 'The user declined — do not retry unless they ask.';
const toastLines = (ts: SeenToast[]) => ts.map((t) => `${t.type}: ${t.text}`);

async function ready(ui: UiDriver) {
  return waitUntil(
    () => {
      const s = get();
      return !s.loading && s.issue ? s : null;
    },
    { signal: ui.signal, timeoutMs: 30_000, what: 'the magazine to load' },
  );
}

/** Open the More menu unless its item is already showing (clicking the trigger
 *  of an open menu would close it). */
async function openMore(ui: UiDriver, item: string) {
  if (anchor(item)) return;
  await ui.click('mag.more-button', 'More');
  await ui.waitFor(item, 4000);
}

/** Open page n through the rail (skipped when it is already open). */
async function openPageN(ui: UiDriver, n: number) {
  const s = get();
  const target = pageAt(s.pages, n);
  if (s.currentPageId !== target.id || s.page?.id !== target.id) {
    if (!anchor('mag.pages-rail')) {
      await ui.click('mag.pages-show', 'Show the pages');
      await ui.waitFor('mag.pages-rail', 5000);
    }
    await ui.click(`mag.page-${n}`, `Page ${n}`);
    await waitUntil(() => get().currentPageId === target.id && get().page?.id === target.id, {
      signal: ui.signal,
      what: `page ${n} to open`,
    });
    // Let the canvas's scroll-settle picker land before acting on "this page".
    await sleep(700, ui.signal);
  }
  return target;
}

const currentPageNumber = () => {
  const s = get();
  return pageNoOf(s.pages, s.currentPageId);
};

/**
 * The right-hand "Page & element" panel showing the PAGE (where "Match a layout"
 * and "Copy a page exactly" live): close an attachment preview, show the pane,
 * clear the selection (an element's panel replaces the page's), pick the tab.
 */
async function ensurePagePanel(ui: UiDriver) {
  if (get().previewDoc) {
    if (!(await clickIfPresent(ui, 'mag.preview-close', 'Close the preview'))) get().setPreviewDoc(null);
    await sleep(200, ui.signal);
  }
  if (!anchor('mag.inspector-tab-element')) {
    await ui.click('mag.inspector-show', 'Show the page panel');
    await ui.waitFor('mag.inspector-tab-element', 4000);
  }
  // Selection is view state (like pressing Esc on the canvas), not a write.
  if (get().selectedId) {
    get().select(null);
    await sleep(200, ui.signal);
  }
  if (anchor('mag.inspector-tab-element')?.getAttribute('aria-pressed') !== 'true') {
    await ui.click('mag.inspector-tab-element', 'Page');
    await sleep(150, ui.signal);
  }
}

/** Hide + show the pane: remounts the panel so its PDF list is fetched again
 *  (it loads once per mount; a PDF attached since then would be missing). */
async function reopenPagePanel(ui: UiDriver) {
  if (await clickIfPresent(ui, 'mag.inspector-hide', 'Hide the page panel')) {
    await sleep(250, ui.signal);
  }
  await ensurePagePanel(ui);
}

/** Wait for an anchor to appear; false (not a throw) when it does not. */
async function appears(ui: UiDriver, agentId: string, timeoutMs: number): Promise<boolean> {
  try {
    await waitUntil(() => !!anchor(agentId), { signal: ui.signal, timeoutMs, what: agentId });
    return true;
  } catch (e) {
    if (ui.signal.aborted) throw e;
    return false;
  }
}

interface DangerPerms {
  /** issue.myRole === 'owner' (store.canManage). */
  isOwner: boolean;
  /** staff permission `magazine.delete`. */
  mayDelete: boolean;
}

export function useMagazineDangerActions(perms: DangerPerms): void {
  const live = useRef(perms);
  live.current = perms;
  const { isOwner, mayDelete } = perms;

  // ── Delete the whole magazine ────────────────────────────────────────────
  useAgentAction(
    {
      name: 'magazine.deleteMagazine',
      description:
        'Owner with Magazine delete. Delete this magazine — the draft and all its pages — through More ▸ Delete magazine…; if it is live it also comes off Bulletins. Cannot be undone. Ends back in the library.',
      args: z.object({}),
      confirm: () => {
        const issue = get().issue;
        const title = issue?.title ? `“${issue.title}”` : 'this magazine';
        const isLive = !!issue?.publishedIssueId && issue.status === 'published';
        return (
          `Delete ${title}? The draft and all ${get().pages.length} of its pages are removed — this cannot be undone.` +
          (isLive ? ' It is live on Bulletins, so it is taken off the public newsstand too.' : '')
        );
      },
      run: async (_a, ui) => {
        const s = await ready(ui);
        const title = s.issue!.title;
        const id = s.issue!.id;
        ui.step('Opening More ▸ Delete magazine…');
        await openMore(ui, 'mag.delete-magazine');
        assertEnabled('mag.delete-magazine', 'Delete is not available right now (a publish may be running).');
        const toasts = watchToasts();
        try {
          await ui.click('mag.delete-magazine', 'Delete magazine…');
          // Success navigates to the library; a refusal is a toast.
          await waitUntil(
            () => window.location.pathname.replace(/\/+$/, '') === LIBRARY || errorToasts(toasts.peek()).length > 0,
            { signal: ui.signal, timeoutMs: 30_000, what: 'the magazine to be deleted' },
          );
          const seen = toasts.stop();
          const errs = errorToasts(seen);
          if (errs.length) throw new Error(errs.map((t) => t.text).join(' '));
          return { deleted: true, magazineId: id, title, route: LIBRARY, toasts: toastLines(seen) };
        } finally {
          toasts.stop();
        }
      },
    },
    isOwner && mayDelete,
  );

  // ── Start over (reset to one blank page) ─────────────────────────────────
  useAgentAction(
    {
      name: 'magazine.startOver',
      description:
        'Owner only. More ▸ Start over…: reset this magazine to a single blank page. Every page and its content is deleted and the undo history is cleared — cannot be undone.',
      args: z.object({}),
      confirm: () => {
        const s = get();
        const title = s.issue?.title ? `“${s.issue.title}”` : 'this magazine';
        return `Start ${title} over? All ${s.pages.length} page${s.pages.length === 1 ? '' : 's'} and everything on them are deleted and it is reset to one blank page — this cannot be undone.`;
      },
      run: async (_a, ui) => {
        const before = (await ready(ui)).pages.length;
        ui.step('Opening More ▸ Start over…');
        await openMore(ui, 'mag.start-over');
        const toasts = watchToasts();
        try {
          await ui.click('mag.start-over', 'Start over…');
          const seen = await waitUntil(
            () => {
              const ts = toasts.peek();
              return ts.some((t) => /reset to a blank page/i.test(t.text)) || errorToasts(ts).length ? ts : null;
            },
            { signal: ui.signal, timeoutMs: 30_000, what: 'the reset to finish' },
          );
          const errs = errorToasts(seen);
          if (errs.length) throw new Error(errs.map((t) => t.text).join(' '));
          return { reset: true, pagesBefore: before, pagesNow: get().pages.length, toasts: toastLines(seen) };
        } finally {
          toasts.stop();
        }
      },
    },
    isOwner,
  );

  // ── Copy a PDF page exactly onto a page ──────────────────────────────────
  useAgentAction(
    {
      name: 'magazine.copyPdfPage',
      description:
        'Owner only. Page panel ▸ "Copy a page exactly": reproduce page docPage of a PDF attached to this magazine (its own text, pictures and colours, as editable elements) onto page `page` (default: the open page), replacing everything on it — the page also takes the PDF page\'s shape. Cannot be undone. doc = part of the PDF\'s file name when there are several. Only PDFs already attached to the magazine count (attach one first with upload on mag.ai-attach).',
      args: z.object({
        page: z.number().int().min(1).optional(),
        docPage: z.number().int().min(1),
        doc: z.string().min(1).optional(),
      }),
      run: async (a, ui) => {
        await ready(ui);
        const target = a.page ? await openPageN(ui, a.page) : pageAt(get().pages, currentPageNumber() ?? 1);
        const n = pageNo(target);
        ui.step('Opening Copy a page exactly');
        await ensurePagePanel(ui);
        let found = await appears(ui, 'mag.copy-pdf-go', 8000);
        if (!found) {
          // The list loads once per mount — reload it in case a PDF was attached since.
          await reopenPagePanel(ui);
          found = await appears(ui, 'mag.copy-pdf-go', 8000);
        }
        if (!found) {
          throw new Error(
            'This magazine has no PDF attached. Attach the PDF first (upload { agentId: "mag.ai-attach" } with the user\'s file, or the AI Studio Uploads tab), then call magazine.copyPdfPage again.',
          );
        }

        // Which PDF.
        const sel = anchor('mag.copy-pdf-doc') as HTMLSelectElement | null;
        const options = sel ? Array.from(sel.options).map((o) => ({ value: o.value, text: (o.textContent ?? '').trim() })) : [];
        let chosen = options.find((o) => o.value === sel?.value) ?? options[0];
        if (a.doc) {
          const want = a.doc.trim().toLowerCase();
          const hits = options.filter((o) => o.text.toLowerCase().includes(want));
          if (hits.length === 0) {
            throw new Error(`No attached PDF matches “${a.doc}”. Attached PDFs: ${options.map((o) => `“${o.text}”`).join(', ')}.`);
          }
          if (hits.length > 1 && !hits.some((h) => h.text.toLowerCase() === want)) {
            throw new Error(`“${a.doc}” matches several PDFs: ${hits.map((o) => `“${o.text}”`).join(', ')}. Pass a longer part of the name.`);
          }
          chosen = hits.find((h) => h.text.toLowerCase() === want) ?? hits[0];
          if (sel && sel.value !== chosen.value) await ui.select('mag.copy-pdf-doc', chosen.value);
        } else if (options.length > 1) {
          throw new Error(`Several PDFs are attached: ${options.map((o) => `“${o.text}”`).join(', ')}. Ask the user which one, then pass doc.`);
        }

        // Which page of it (bounded when the PDF's length is known).
        await ui.type('mag.copy-pdf-page', String(a.docPage), { clear: true });
        await sleep(150, ui.signal);
        const pageInput = anchor('mag.copy-pdf-page') as HTMLInputElement | null;
        const max = pageInput?.max ? Number(pageInput.max) : 0;
        if (max > 0 && a.docPage > max) {
          throw new Error(`“${chosen?.text ?? 'That PDF'}” has ${max} pages — there is no page ${a.docPage}.`);
        }

        const ok = await ui.confirm(
          `Copy page ${a.docPage} of “${chosen?.text ?? 'the PDF'}” onto page ${n}? Everything on page ${n} is replaced with that PDF page's own text, pictures and colours, and the page takes on its shape — this cannot be undone.`,
        );
        if (!ok) throw new Error(DECLINED);

        const revBefore = get().pages.find((p) => p.id === target.id)?.rev;
        const toasts = watchToasts();
        try {
          assertEnabled('mag.copy-pdf-go', 'The copy button is busy right now.');
          await ui.click('mag.copy-pdf-go', 'Copy onto this page');
          const seen = await waitUntil(
            () => {
              const ts = toasts.peek();
              return ts.some((t) => /copying page/i.test(t.text)) || errorToasts(ts).length ? ts : null;
            },
            { signal: ui.signal, timeoutMs: 45_000, what: 'the copy to start' },
          );
          const errs = errorToasts(seen);
          if (errs.length) throw new Error(errs.map((t) => t.text).join(' '));
          // The rebuild runs in the worker; give the studio's poll a moment to bring it in.
          let rebuilt = false;
          try {
            await waitUntil(() => get().pages.find((p) => p.id === target.id)?.rev !== revBefore, {
              signal: ui.signal,
              timeoutMs: 30_000,
            });
            rebuilt = true;
          } catch (e) {
            if (ui.signal.aborted) throw e;
          }
          return {
            started: true,
            page: n,
            pdf: chosen?.text,
            docPage: a.docPage,
            rebuilt,
            note: rebuilt ? undefined : 'Still rebuilding in the background — it appears on the page shortly; check with magazine.status.',
            toasts: toastLines(toasts.stop()),
          };
        } finally {
          toasts.stop();
        }
      },
    },
    isOwner,
  );

  // ── Rebuild a page in an uploaded reference's layout ─────────────────────
  useAgentAction(
    {
      name: 'magazine.applyLayout',
      description:
        'Owner only. Page panel ▸ "Match a layout": rebuild page `page` (default: the open page) in the arrangement of a reference picture — fit "exact" puts every box where the reference had it, "adapt" re-composes it around this page\'s content. Fresh copy is written; nothing is copied from the reference. Replaces everything on the page; cannot be undone. FLOW: (1) call it once — it opens the page and the Match-a-layout panel; (2) upload the user\'s reference image with upload { agentId: "mag.layout-upload", attachment }; (3) call it again: it waits for the reading, asks the user, then rebuilds. Returns the measured verdict (matched / adapted / loose + %).',
      args: z.object({
        page: z.number().int().min(1).optional(),
        fit: z.enum(['exact', 'adapt']),
      }),
      run: async (a, ui) => {
        await ready(ui);
        const target = a.page ? await openPageN(ui, a.page) : pageAt(get().pages, currentPageNumber() ?? 1);
        const n = pageNo(target);
        ui.step('Opening Match a layout');
        await ensurePagePanel(ui);
        if (!(await appears(ui, 'mag.layout-upload', 6000))) {
          throw new Error('The Match a layout panel is not available here (owner only, with the page panel open).');
        }

        // A reading in flight (the upload button shows busy) → wait for it.
        const uploadBtn = () => anchor('mag.layout-upload') as HTMLButtonElement | null;
        if (!anchor('mag.layout-apply') && uploadBtn()?.disabled) {
          ui.step('Waiting for the reference to be read');
          await waitUntil(() => !!anchor('mag.layout-apply') || !uploadBtn()?.disabled, {
            signal: ui.signal,
            timeoutMs: 120_000,
            what: 'the layout reference to be read',
          });
        }
        if (!anchor('mag.layout-apply')) {
          await ui.point('mag.layout-upload', 'Upload the reference here');
          throw new Error(
            `No layout reference has been read for page ${n} yet. The panel is open now: upload the user's reference image with ` +
              'upload { agentId: "mag.layout-upload", attachment: <0 or its file name> }, then call magazine.applyLayout again ' +
              '(it waits for the reading). If the upload fails to read, the error toast says why.',
          );
        }

        // Choose the fit (radio), then ask.
        const radio = `mag.layout-fit-${a.fit}`;
        if (!(anchor(radio) as HTMLInputElement | null)?.checked) await ui.click(radio, a.fit === 'exact' ? 'Copy the layout exactly' : 'Adapt it to my content');
        const count = get().page?.id === target.id ? get().page!.elements.length : target.elementCount;
        const ok = await ui.confirm(
          `Rebuild page ${n} in the reference's layout (${a.fit === 'exact' ? 'every box where the reference had it' : 'adapted to this page\'s content'})? ` +
            `Its ${count} current item${count === 1 ? '' : 's'} are replaced — fresh words are written and its photos re-used — and this cannot be undone.`,
        );
        if (!ok) throw new Error(DECLINED);

        const toasts = watchToasts();
        try {
          assertEnabled('mag.layout-apply', 'A layout rebuild is already running.');
          await ui.click('mag.layout-apply', 'Put this page in that layout');
          // layoutBusy goes up on the request and down when it lands.
          await waitUntil(() => get().layoutBusy, { signal: ui.signal, timeoutMs: 5000, what: 'the rebuild to start' }).catch((e) => {
            if (ui.signal.aborted) throw e;
          });
          await waitUntil(() => !get().layoutBusy, { signal: ui.signal, timeoutMs: 180_000, what: 'the rebuild to finish' });
          await sleep(300, ui.signal);
          const seen = toasts.stop();
          const errs = errorToasts(seen);
          if (errs.length) throw new Error(errs.map((t) => t.text).join(' '));
          if (seen.length === 0) {
            throw new Error('The rebuild did not run — nothing changed on the page. Call readScreen to see the panel state.');
          }
          const verdict = seen.find((t) => t.type === 'success' || t.type === 'warning');
          return {
            rebuilt: true,
            page: n,
            fit: a.fit,
            verdict: verdict?.text,
            elements: get().page?.id === target.id ? get().page!.elements.length : undefined,
            toasts: toastLines(seen),
          };
        } finally {
          toasts.stop();
        }
      },
    },
    isOwner,
  );
}
