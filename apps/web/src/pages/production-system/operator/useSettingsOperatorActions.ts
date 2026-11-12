// ---------------------------------------------------------------------------
// Operator pack — SETTINGS (/production-system/settings).
//
// Registered by the Website Customisation card in newsroom/views/SettingsView.
// settings.setSections ticks / unticks the card's own checkboxes (the same
// click a person makes) and presses its own "Save changes" button, which calls
// useSiteSettingsStore.savePublicNav → PUT /api/site-settings/public-nav. The
// server re-checks settings.edit as the signed-in user.
//
// The Publication rows below the card are read-only in the UI (they describe
// the workflow, which is code), so they are reported by settings.read and have
// no write action.
//
// Names and arg shapes MUST match apps/server/src/lib/agent/operator/catalog/
// settings.ts.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import type { UiDriver } from '@/agent/operator/contracts';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import { can } from '@/lib/permissions';
import { useSiteSettingsStore } from '@/stores/siteSettingsStore';
import { PUBLIC_NAV_KEYS, PUBLIC_NAV_SECTIONS, type PublicNavKey, type PublicNavVisibility } from '@/types/siteSettings';

import { anchorEl, hasAnchor, sleep, waitUntil } from './studioTurn';

/** The read-only Publication rows, as the screen shows them. */
export const PUBLICATION_ROWS = [
  { key: 'publication-name', label: 'Publication Name', value: 'Stable Press', desc: 'Displayed across all editorial output' },
  { key: 'default-category', label: 'Default Category', value: 'Race Report', desc: 'Applied to new stories without a category' },
  { key: 'approval-steps', label: 'Approval Steps', value: '1', desc: 'One approval before a story may be scheduled or published' },
  { key: 'workflow-stages', label: 'Workflow Stages', value: '5', desc: 'Draft · Submitted · Approved · Scheduled · Published' },
] as const;

const ALIASES: Record<string, PublicNavKey> = {
  stories: 'news',
  articles: 'news',
  blogs: 'blog',
  register: 'horses',
  horse: 'horses',
  parties: 'directory',
  people: 'directory',
  podcasts: 'podcast',
  bulletin: 'bulletins',
  magazine: 'bulletins',
  magazines: 'bulletins',
};

/** 'Bulletins', 'bulletins', '/parties', 'People' → a section key (or throws). */
function sectionKey(raw: string): PublicNavKey {
  const t = raw.trim().toLowerCase().replace(/^\/+/, '');
  const hit = PUBLIC_NAV_SECTIONS.find(
    (s) => s.key === t || s.label.toLowerCase() === t || s.path.replace(/^\//, '') === t,
  );
  if (hit) return hit.key;
  if (ALIASES[t]) return ALIASES[t];
  throw new Error(`There is no website section “${raw}”. Sections: ${PUBLIC_NAV_SECTIONS.map((s) => s.label).join(', ')}.`);
}

const label = (k: PublicNavKey) => PUBLIC_NAV_SECTIONS.find((s) => s.key === k)?.label ?? k;

const setArgs = z
  .object({
    visible: z.array(z.string()).optional(),
    hide: z.array(z.string()).optional(),
    show: z.array(z.string()).optional(),
  })
  .refine((a) => a.visible !== undefined || (a.hide?.length ?? 0) > 0 || (a.show?.length ?? 0) > 0, {
    message: 'Pass visible (the full list to show), or hide / show lists.',
  });
type SetArgs = z.infer<typeof setArgs>;

/** The map the args ask for, starting from what is saved now. */
function targetFrom(a: SetArgs, saved: PublicNavVisibility): PublicNavVisibility {
  let next: PublicNavVisibility;
  if (a.visible !== undefined) {
    const on = new Set(a.visible.map(sectionKey));
    next = Object.fromEntries(PUBLIC_NAV_KEYS.map((k) => [k, on.has(k)])) as PublicNavVisibility;
  } else {
    next = { ...saved };
  }
  for (const k of (a.show ?? []).map(sectionKey)) next[k] = true;
  for (const k of (a.hide ?? []).map(sectionKey)) next[k] = false;
  return next;
}

function diff(from: PublicNavVisibility, to: PublicNavVisibility) {
  const hide = PUBLIC_NAV_KEYS.filter((k) => from[k] !== false && to[k] === false);
  const show = PUBLIC_NAV_KEYS.filter((k) => from[k] === false && to[k] !== false);
  return { hide, show };
}

const names = (keys: PublicNavKey[]) => {
  const l = keys.map(label);
  return l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
};

function readState() {
  const nav = useSiteSettingsStore.getState().publicNav;
  return {
    sections: PUBLIC_NAV_SECTIONS.map((s) => ({
      key: s.key,
      label: s.label,
      path: s.path,
      visible: nav[s.key] !== false,
      ...(hasAnchor(`settings.section-${s.key}`)
        ? { ticked: !!anchorEl<HTMLInputElement>(`settings.section-${s.key}`)?.checked }
        : {}),
    })),
    canEdit: can('settings.edit'),
    publication: PUBLICATION_ROWS.map((r) => ({ label: r.label, value: r.value, note: r.desc, editable: false })),
  };
}

export function useSettingsOperatorActions(toggleFallback: (key: PublicNavKey, on: boolean) => void): void {
  useAgentAction({
    name: 'settings.read',
    description: 'Read the Settings screen: which public website sections are visible, and the Publication facts.',
    args: z.object({}),
    run: async () => readState(),
  });

  useAgentAction({
    name: 'settings.setSections',
    description: 'Show / hide public website sections (ticks the checkboxes, then Save changes).',
    args: setArgs,
    confirm: (a) => {
      // No settings.edit: run() refuses — no card for something that cannot happen.
      if (!can('settings.edit')) return null;
      let to: PublicNavVisibility;
      const saved = useSiteSettingsStore.getState().publicNav;
      try {
        to = targetFrom(a, saved);
      } catch {
        return null; // run() reports the bad section name
      }
      // Everything hidden: run() refuses (one section must stay visible).
      if (PUBLIC_NAV_KEYS.every((k) => to[k] === false)) return null;
      const { hide, show } = diff(saved, to);
      if (!hide.length && !show.length) return null;
      const parts = [
        hide.length ? `Hide ${names(hide)} from the public website` : '',
        show.length ? `${hide.length ? 'show' : 'Show'} ${names(show)} on the public website` : '',
      ].filter(Boolean);
      return `${parts.join(' and ')}? This changes the live site's navigation straight away (nothing is unpublished).`;
    },
    run: async (a, ui: UiDriver) => {
      if (!can('settings.edit')) throw new Error('Your role cannot change website settings (needs settings.edit).');
      const saved = useSiteSettingsStore.getState().publicNav;
      const target = targetFrom(a, saved);
      if (PUBLIC_NAV_KEYS.every((k) => target[k] === false)) {
        throw new Error('At least one website section has to stay visible.');
      }
      const { hide, show } = diff(saved, target);

      ui.step(hide.length || show.length ? 'Updating website sections' : 'Checking website sections');
      // Make every checkbox match the target — this also undoes any half-made,
      // unsaved ticks the user left on the card.
      for (const s of PUBLIC_NAV_SECTIONS) {
        const id = `settings.section-${s.key}`;
        const box = anchorEl<HTMLInputElement>(id);
        if (!box) throw new Error('The Website Customisation card is not on screen.');
        const want = target[s.key] !== false;
        if (box.checked === want) continue;
        await ui.click(id, `${want ? 'Show' : 'Hide'} ${s.label}`);
        // A synthetic click should toggle a real checkbox; if the browser did
        // not, set the same draft state the checkbox's onChange sets.
        const ok = await waitUntil(() => anchorEl<HTMLInputElement>(id)?.checked === want, { signal: ui.signal, timeoutMs: 1_000 });
        if (!ok) toggleFallback(s.key, want);
      }

      if (!hide.length && !show.length) {
        return { ok: true, unchanged: true, ...readState() };
      }

      await sleep(100, ui.signal);
      await ui.waitFor('settings.save', 3_000);
      await ui.click('settings.save', 'Save changes');
      const matches = () => {
        const nav = useSiteSettingsStore.getState().publicNav;
        return PUBLIC_NAV_KEYS.every((k) => (nav[k] !== false) === (target[k] !== false));
      };
      // savePublicNav is optimistic and rolls back on failure, so wait for the
      // request to finish before trusting the map.
      await waitUntil(() => useSiteSettingsStore.getState().saving || matches(), { signal: ui.signal, timeoutMs: 3_000 });
      await waitUntil(() => !useSiteSettingsStore.getState().saving, { signal: ui.signal, timeoutMs: 15_000 });
      if (useSiteSettingsStore.getState().saving) throw new Error('The save is taking too long — check the Settings screen.');
      if (!matches()) throw new Error('The website settings did not save (the server refused it — see the toast).');
      ui.flash('settings.save');
      return {
        ok: true,
        hidden: hide.map(label),
        shown: show.map(label),
        ...readState(),
      };
    },
  });
}
