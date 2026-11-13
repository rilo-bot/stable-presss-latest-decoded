// ---------------------------------------------------------------------------
// The Stable Hand Operator — SITE CONTENT pack (/site-content).
//
// Registered by pages/SiteContent while it is mounted. Everything here is LIVE
// on the public landing page the moment it saves: the breaking-news ticker
// shows every active headline, and the sponsors strip shows every sponsor. So
// every ticker change and every sponsor add / edit / removal asks first.
//
// Writes drive the page's own controls — the "Add a headline" box, each row's
// eye (show / hide) and × (delete), the "Add a sponsor" form and each sponsor's
// pencil (inline edit) — so sponsorStore / breakingNewsStore make the same
// /api/sponsors and /api/breakingNews calls (admin-gated on the server).
//
// Catalog: apps/server/src/lib/agent/operator/catalog/content.ts — keep in step.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import type { UiDriver } from '@/agent/operator/contracts';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import { useBreakingNewsStore } from '@/stores/breakingNewsStore';
import { useSponsorStore } from '@/stores/sponsorStore';
import type { BreakingNewsItem } from '@/types/breakingNews';
import type { Sponsor } from '@/types/sponsor';

import { clip, has, listWords, resolveOne, settleOptimistic, useLive, waitUntil, watchRecord, watchToasts } from './contentUtils';

const news = () => useBreakingNewsStore.getState().items;
const sponsors = () => useSponsorStore.getState().sponsors;
const liveNews = () => news().filter((i) => i.active);

function readContent() {
  return {
    ticker: news().map((i) => ({ id: i.id, text: i.text, live: i.active })),
    liveHeadlines: liveNews().length,
    sponsors: sponsors().map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category || '',
      tagline: s.tagline || '',
      websiteUrl: s.websiteUrl ?? '',
    })),
  };
}

function resolveHeadline(q: string) {
  return resolveOne(q, news(), (i) => [i.id, i.text], 'headline', (i) => `“${clip(i.text, 60)}”${i.active ? '' : ' (hidden)'}`);
}
function mustHeadline(q: string): BreakingNewsItem {
  const r = resolveHeadline(q);
  if (!r.hit) throw new Error(r.error);
  return r.hit;
}
function resolveSponsor(q: string) {
  return resolveOne(q, sponsors(), (s) => [s.id, s.name], 'sponsor', (s) => s.name);
}
function mustSponsor(q: string): Sponsor {
  const r = resolveSponsor(q);
  if (!r.hit) throw new Error(r.error);
  return r.hit;
}

/** Both lists load on mount; an action that runs first waits for them. A
 *  list that failed to load must not read as "no headlines" / "no sponsors". */
async function loaded(ui: UiDriver) {
  const ok = await waitUntil(() => useBreakingNewsStore.getState().loaded && useSponsorStore.getState().loaded, {
    timeoutMs: 8000,
    signal: ui.signal,
  });
  if (!ok) {
    const failed = [
      !useBreakingNewsStore.getState().loaded ? 'the ticker' : '',
      !useSponsorStore.getState().loaded ? 'the sponsors' : '',
    ].filter(Boolean);
    throw new Error(`Site Content could not load ${listWords(failed)} — reload the page and try again.`);
  }
}

/** A write's server answer, for settleOptimistic: the record was swapped back
 *  or replaced (watchRecord), or — for a removal, which changes nothing more
 *  in the store when it succeeds — the store's own success toast showed. */
function answeredBy(rec: { answered: () => boolean }, toasts: ReturnType<typeof watchToasts>) {
  return () => rec.answered() || toasts.collect().some((t) => t.type === 'success');
}

/** Click a headline's eye so it ends up shown (true) or hidden. */
async function setActive(ui: UiDriver, item: BreakingNewsItem, active: boolean) {
  const cur = news().find((i) => i.id === item.id);
  if (!cur || cur.active === active) return;
  const toasts = watchToasts();
  const rec = watchRecord(useBreakingNewsStore, (st) => st.items.find((i) => i.id === item.id));
  try {
    await ui.click(`site.headline-toggle-${item.id}`, `${active ? 'Show' : 'Hide'} “${clip(item.text, 40)}”`);
    await settleOptimistic(ui, () => news().find((i) => i.id === item.id)?.active === active, 'The ticker change', toasts, 500, rec.answered);
  } finally {
    rec.stop();
  }
}

export function useSiteContentOperatorActions(input: { editingId: string | null }): void {
  const st = useLive(input);

  useAgentAction({
    name: 'site.readContent',
    description: 'Read the breaking-news ticker (each headline, live or hidden) and the sponsors.',
    args: z.object({}),
    run: async (_a, ui) => {
      await loaded(ui);
      return readContent();
    },
  });

  // ── Sponsors ──────────────────────────────────────────────────────────────
  const sponsorFields = {
    category: z.string().max(80).optional(),
    tagline: z.string().max(200).optional(),
    websiteUrl: z.string().max(500).optional(),
  };
  const addArgs = z.object({ name: z.string().trim().min(1).max(120), ...sponsorFields });
  useAgentAction<z.infer<typeof addArgs>>({
    name: 'site.addSponsor',
    description: 'Add a sponsor through the Add a sponsor form.',
    args: addArgs,
    // A new sponsor is on the public landing page the moment it saves.
    confirm: (a) => `Add “${clip(a.name, 60)}” to the sponsors strip? It shows on the public landing page straight away.`,
    run: async (a, ui) => {
      await loaded(ui);
      const before = new Set(sponsors().map((s) => s.id));
      ui.step(`Adding the sponsor ${a.name}`);
      await ui.type('site.sponsor-name', a.name, { clear: true });
      if (a.category) await ui.type('site.sponsor-category', a.category, { clear: true });
      if (a.tagline) await ui.type('site.sponsor-tagline', a.tagline, { clear: true });
      if (a.websiteUrl) await ui.type('site.sponsor-url', a.websiteUrl, { clear: true });
      const toasts = watchToasts();
      await ui.click('site.sponsor-add', 'Add sponsor');
      await settleOptimistic(ui, () => sponsors().some((s) => !before.has(s.id)), `Adding ${a.name}`, toasts, 200);
      const created = sponsors().find((s) => !before.has(s.id))!;
      ui.flash(`site.sponsor-${created.id}`);
      return { ok: true, sponsor: readContent().sponsors.find((s) => s.id === created.id) };
    },
  });

  const editArgs = z.object({ sponsor: z.string().min(1), name: z.string().trim().min(1).max(120).optional(), ...sponsorFields });
  useAgentAction<z.infer<typeof editArgs>>({
    name: 'site.editSponsor',
    description: "Edit a sponsor's name, category, tagline or website (pencil → fields → Save).",
    args: editArgs,
    // The edit is live on the public landing page at once. No card when the
    // sponsor does not resolve (run() throws) or nothing would change.
    confirm: (a) => {
      const r = resolveSponsor(a.sponsor);
      if (!r.hit) return null;
      const sp = r.hit;
      const diff = (label: string, next: string | undefined, cur: string | undefined) =>
        next !== undefined && next.trim() !== (cur ?? '').trim() ? `${label} → “${clip(next.trim(), 60)}”` : null;
      const changes = [
        diff('name', a.name, sp.name),
        diff('category', a.category, sp.category),
        diff('tagline', a.tagline, sp.tagline),
        diff('website', a.websiteUrl, sp.websiteUrl),
      ].filter((c): c is string => !!c);
      if (!changes.length) return null;
      return `Change the sponsor “${sp.name}” (${listWords(changes)})? The public landing page updates straight away.`;
    },
    run: async (a, ui) => {
      await loaded(ui);
      const sp = mustSponsor(a.sponsor);
      if (st.current.editingId !== sp.id) {
        if (st.current.editingId && has('site.sponsor-cancel')) await ui.click('site.sponsor-cancel', 'Cancel the other edit');
        await ui.click(`site.sponsor-edit-${sp.id}`, `Edit ${sp.name}`);
        await ui.waitFor('site.sponsor-edit-name', 3000);
      }
      const fields: Array<[keyof typeof a, string]> = [
        ['name', 'site.sponsor-edit-name'],
        ['category', 'site.sponsor-edit-category'],
        ['tagline', 'site.sponsor-edit-tagline'],
        ['websiteUrl', 'site.sponsor-edit-url'],
      ];
      for (const [k, id] of fields) {
        const v = a[k];
        if (v !== undefined) await ui.type(id, v, { clear: true });
      }
      const want = {
        name: a.name?.trim() ?? sp.name,
        category: a.category?.trim() ?? sp.category ?? '',
        tagline: a.tagline?.trim() ?? sp.tagline ?? '',
      };
      const toasts = watchToasts();
      const rec = watchRecord(useSponsorStore, (st) => st.sponsors.find((x) => x.id === sp.id));
      try {
        await ui.click('site.sponsor-save', 'Save');
        await settleOptimistic(
          ui,
          () => {
            const s = sponsors().find((x) => x.id === sp.id);
            return !!s && s.name === want.name && (s.category ?? '') === want.category && (s.tagline ?? '') === want.tagline;
          },
          `Saving ${sp.name}`,
          toasts,
          400,
          rec.answered,
        );
      } finally {
        rec.stop();
      }
      ui.flash(`site.sponsor-${sp.id}`);
      return { ok: true, sponsor: readContent().sponsors.find((s) => s.id === sp.id) };
    },
  });

  const sponsorArg = z.object({ sponsor: z.string().min(1) });
  useAgentAction<z.infer<typeof sponsorArg>>({
    name: 'site.removeSponsor',
    description: 'Delete a sponsor (it leaves the public landing page).',
    args: sponsorArg,
    confirm: (a) => {
      const r = resolveSponsor(a.sponsor);
      return r.hit ? `Remove the sponsor “${r.hit.name}”? It disappears from the public landing page straight away.` : null;
    },
    run: async (a, ui) => {
      await loaded(ui);
      const sp = mustSponsor(a.sponsor);
      const toasts = watchToasts();
      const rec = watchRecord(useSponsorStore, (st) => st.sponsors.find((s) => s.id === sp.id));
      try {
        await ui.click(`site.sponsor-remove-${sp.id}`, `Delete ${sp.name}`);
        await settleOptimistic(ui, () => !sponsors().some((s) => s.id === sp.id), `Removing ${sp.name}`, toasts, 1200, answeredBy(rec, toasts));
      } finally {
        rec.stop();
      }
      return { ok: true, removed: sp.name, sponsors: readContent().sponsors.map((s) => s.name) };
    },
  });

  // ── Breaking-news ticker ──────────────────────────────────────────────────
  const headlineArgs = z.object({ text: z.string().trim().min(1).max(300), only: z.boolean().default(false) });
  useAgentAction<z.infer<typeof headlineArgs>>({
    name: 'site.addHeadline',
    description: 'Put a new headline on the live ticker; only:true hides every other live headline.',
    args: headlineArgs,
    confirm: (a) => {
      const others = liveNews().length;
      return (
        `Put “${clip(a.text)}” on the breaking-news ticker? It is live on the public site straight away.` +
        (a.only && others ? ` The ${others} other live headline(s) will be hidden (not deleted).` : '')
      );
    },
    run: async (a, ui) => {
      await loaded(ui);
      const before = new Set(news().map((i) => i.id));
      await ui.type('site.headline-input', a.text, { clear: true });
      const toasts = watchToasts();
      await ui.click('site.headline-add', 'Add');
      await settleOptimistic(ui, () => news().some((i) => !before.has(i.id)), 'Adding the headline', toasts, 200);
      const created = news().find((i) => !before.has(i.id))!;
      const hidden: string[] = [];
      if (a.only) {
        for (const item of liveNews()) {
          if (item.id === created.id) continue;
          await setActive(ui, item, false);
          hidden.push(item.text);
        }
      }
      ui.flash(`site.headline-${created.id}`);
      return { ok: true, added: created.text, hidden, ...readContent() };
    },
  });

  const showArgs = z.object({ headline: z.string().min(1), show: z.boolean() });
  useAgentAction<z.infer<typeof showArgs>>({
    name: 'site.showHeadline',
    description: 'Show (show:true) or hide an existing headline on the live ticker (the row’s eye).',
    args: showArgs,
    confirm: (a) => {
      const r = resolveHeadline(a.headline);
      if (!r.hit || r.hit.active === a.show) return null;
      return a.show
        ? `Put “${clip(r.hit.text)}” back on the live ticker?`
        : `Hide “${clip(r.hit.text)}” from the live ticker? It stays in the list.`;
    },
    run: async (a, ui) => {
      await loaded(ui);
      const item = mustHeadline(a.headline);
      await setActive(ui, item, a.show);
      return { ok: true, headline: item.text, live: a.show, ...readContent() };
    },
  });

  const headlineArg = z.object({ headline: z.string().min(1) });
  useAgentAction<z.infer<typeof headlineArg>>({
    name: 'site.removeHeadline',
    description: 'Delete a ticker headline for good (the row’s ×).',
    args: headlineArg,
    confirm: (a) => {
      const r = resolveHeadline(a.headline);
      return r.hit ? `Delete the headline “${clip(r.hit.text)}”?${r.hit.active ? ' It is live on the ticker now.' : ''}` : null;
    },
    run: async (a, ui) => {
      await loaded(ui);
      const item = mustHeadline(a.headline);
      const toasts = watchToasts();
      const rec = watchRecord(useBreakingNewsStore, (st) => st.items.find((i) => i.id === item.id));
      try {
        await ui.click(`site.headline-remove-${item.id}`, 'Delete');
        await settleOptimistic(ui, () => !news().some((i) => i.id === item.id), 'Deleting the headline', toasts, 1200, answeredBy(rec, toasts));
      } finally {
        rec.stop();
      }
      return { ok: true, removed: item.text, ...readContent() };
    },
  });

  useAgentAction({
    name: 'site.clearTicker',
    description: 'Hide every live headline (the ticker goes empty; nothing is deleted).',
    args: z.object({}),
    confirm: () => {
      const n = liveNews();
      if (!n.length) return null;
      return `Clear the breaking-news ticker? ${n.length === 1 ? 'Its live headline' : `All ${n.length} live headlines`} (${listWords(n.slice(0, 3).map((i) => `“${clip(i.text, 40)}”`))}${n.length > 3 ? '…' : ''}) will be hidden from the public site. Nothing is deleted.`;
    },
    run: async (_a, ui) => {
      await loaded(ui);
      const hidden: string[] = [];
      for (const item of liveNews()) {
        await setActive(ui, item, false);
        hidden.push(item.text);
      }
      return { ok: true, hidden, ...readContent() };
    },
  });
}
