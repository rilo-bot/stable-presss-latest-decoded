// ---------------------------------------------------------------------------
// Stablehand Operator — REGISTERS pack (Production System → Stables:
// Thoroughbreds, People, Media Records, Racing Records, Horse Records).
//
// One hook per register screen; each screen file calls its own. Searches type
// into the screen's real search box (the list visibly filters) and read the
// rows back from the same filtered list the table renders. Adds open the real
// form (AddHorseChoice → HorseForm, PartyForm), type each field, pick
// connections from the real pickers and press Save — so horseStore /
// peopleStore / partyStore make the same POSTs a click would and the server's
// RBAC (horses.create, people.create …) still decides.
//
// Media and racing records can be ADDED (registers.addMediaRecord /
// registers.addRacingRecord) by driving MediaDataForm / RacingDataForm field by
// field. File inputs are never touched here: a media record without a URL is
// left open on its File Upload tab with `reg.media-file` anchored, so the file
// can be attached with the Operator's upload tool (or by the user) before Save.
// Sales / report records stay read-only.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/registers.ts — keep in step.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import type { UiDriver } from '@/agent/operator/contracts';
import { actionError } from '@/agent/operator/runtime/humanRef';
import type { ProductionSystemState } from '../useProductionSystemState';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useMediaStore } from '@/stores/mediaStore';
import { useRacingEntryStore } from '@/stores/racingEntryStore';
import { useArticleStore } from '@/stores/articleStore';
import { MEDIA_TYPES, type MediaItem } from '@/types/mediaItem';
import { RACE_STATUSES, type RacingEntry } from '@/types/racingEntry';
import { connectionsForHorse } from '@/lib/horseConnections';
import { SEX_OPTIONS, COLOUR_OPTIONS, COUNTRY_OPTIONS } from '@/components/horse-form/constants';
import type { Horse } from '@/types/horse';
import type { PartyRole } from '@/types/party';
import type { RegisterPerson } from '@/lib/register';
import { anchor, firstError, normKey, resolveOne, sleep, useLive, waitUntil, watchToasts } from './opUtils';

type PS = ProductionSystemState['ps'];

const MAX_ROWS = 25;
const PARTY_ROLE_IDS = ['owner', 'trainer', 'jockey', 'breeder', 'bloodstock agent', 'syndicate manager', 'personnel'] as const;
const roleAnchor = (role: string) => role.replace(/ /g, '-');

// ── Shared readers ───────────────────────────────────────────────────────────

function horseJson(h: Horse, people: RegisterPerson[]) {
  const byId = new Map(people.map((p) => [p.id, p.name]));
  const conn = connectionsForHorse(usePartyStore.getState().parties, h.id);
  const names = (ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean);
  return {
    id: h.id,
    name: h.name || 'Unnamed',
    sex: h.sex ?? null,
    dob: h.dob ?? null,
    age: h.age ?? null,
    colour: h.colour ?? null,
    country: h.country ?? null,
    sire: h.sire ?? null,
    dam: h.dam ?? null,
    owners: names(conn.owner),
    trainers: names(conn.trainer),
    jockeys: names(conn.jockey),
    breeders: names(conn.breeder),
    profilePath: `/horses/${h.id}`,
    studioPath: `/studio/horse/${h.id}`,
  };
}

function personJson(p: RegisterPerson) {
  return {
    id: p.id,
    name: p.name,
    roles: p.roles,
    profession: p.profession ?? null,
    baseLocation: p.baseLocation ?? null,
    countryOfBirth: p.countryOfBirth ?? null,
    startedYear: p.startedYear ?? null,
    horseCount: p.horseIds.length,
    claimed: !!p.claimedByUserId,
    profilePath: `/parties/${p.id}`,
    studioPath: `/studio/${p.id}`,
  };
}

function resolveHorse(query: string, horses: Horse[]) {
  return resolveOne(query, horses, (h) => [h.id, h.name], 'horse', (h) => h.name || 'Un-Named');
}

/** Pick an option from a fixed list case/spacing-insensitively. */
function pickOption(value: string | undefined, options: string[], what: string): string | undefined {
  if (!value) return undefined;
  const hit = options.find((o) => normKey(o) === normKey(value));
  if (!hit) throw new Error(`"${value}" is not a ${what}. Choose one of: ${options.join(', ')}.`);
  return hit;
}

/** Make sure a collapsible form section is open (its toggle reports aria-expanded). */
async function ensureOpen(ui: UiDriver, toggleId: string) {
  if (anchor(toggleId)?.getAttribute('aria-expanded') === 'true') return;
  await ui.click(toggleId, 'Open section');
  await waitUntil(() => anchor(toggleId)?.getAttribute('aria-expanded') === 'true', { timeoutMs: 1500, signal: ui.signal });
}

/** Type into a field, then confirm React holds the value (date inputs reject
 *  partial strings, so fall back to a single native set + input event). */
async function typeField(ui: UiDriver, agentId: string, value: string) {
  const host = anchor(agentId);
  const el = (host instanceof HTMLInputElement ? host : host?.querySelector('input')) as HTMLInputElement | null;
  // A date input rejects every partial keystroke ("2", "20", …) — point at it
  // and set the whole value once instead of typing it out.
  if (el && el.type === 'date') await ui.point(agentId, value);
  else await ui.type(agentId, value, { clear: true });
  if (el && el.value !== value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/**
 * A form that opens with "Unsaved draft restored from your last session" holds
 * the USER's unfinished work (useFormDraft autosave). The add actions have no
 * confirm card, so never discard it silently: ask first, and on No stop with
 * the form (and the draft) left open for the user.
 */
async function discardRestoredDraft(ui: UiDriver, agentId: string, what: string) {
  if (!anchor(agentId)) return;
  const ok = await ui.confirm(
    `The ${what} form has an unsaved draft from an earlier session. Discard that draft so I can fill the form from scratch?`,
  );
  if (!ok) {
    throw new Error(`Stopped: the user chose to keep their unsaved ${what} draft. The form is left open with it.`);
  }
  await ui.click(agentId, 'Discard the old draft');
}

/** Type a search query into a register's search box and let the list filter. */
async function typeSearch(ui: UiDriver, agentId: string, query: string, applied: () => boolean) {
  await ui.type(agentId, query, { clear: true });
  await waitUntil(applied, { timeoutMs: 2000, signal: ui.signal });
  await sleep(120, ui.signal);
  ui.flash(agentId);
}

// ── Thoroughbreds ────────────────────────────────────────────────────────────

const addHorseArgs = z.object({
  name: z.string().trim().min(1).max(120),
  sex: z.string().optional().describe(SEX_OPTIONS.join(' | ')),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dob must be YYYY-MM-DD').optional(),
  colour: z.string().optional(),
  country: z.string().optional(),
  sire: z.string().optional(),
  dam: z.string().optional(),
  owners: z.array(z.string()).min(1).describe('Owner names from the People register'),
  trainers: z.array(z.string()).min(1).describe('Trainer names from the People register'),
  jockeys: z.array(z.string()).optional(),
  breeders: z.array(z.string()).optional(),
});
type AddHorseArgs = z.infer<typeof addHorseArgs>;

export function useHorseRegisterActions(ps: PS): void {
  const live = useLive(ps);

  useAgentAction<{ query: string }>({
    name: 'registers.searchHorses',
    description: 'Search the Thoroughbred register (name, trainer, owner, jockey, country) and return the matching rows.',
    args: z.object({ query: z.string().max(120) }),
    run: async (a, ui) => {
      const s = live.current;
      if ((s.horses ?? []).length === 0) return { query: a.query, total: 0, rows: [], note: 'The horse register is empty.' };
      await typeSearch(ui, 'reg.horse-search', a.query, () => live.current.horseSearch === a.query);
      const rows = live.current.filteredHorses;
      return {
        query: a.query,
        total: rows.length,
        rows: rows.slice(0, MAX_ROWS).map((h) => horseJson(h, live.current.parties ?? [])),
        truncated: rows.length > MAX_ROWS,
      };
    },
  });

  useAgentAction<AddHorseArgs>({
    name: 'registers.addHorse',
    description:
      'Add a thoroughbred via the quick form: name, sex, dob, colour, country, sire/dam, and owners + trainers picked from the People register.',
    args: addHorseArgs,
    run: async (a, ui) => {
      const s = live.current;
      const people = s.parties ?? [];
      // Validate everything BEFORE touching the screen.
      const sex = pickOption(a.sex, SEX_OPTIONS, 'sex');
      const colour = pickOption(a.colour, COLOUR_OPTIONS, 'colour');
      const country = pickOption(a.country, COUNTRY_OPTIONS, 'country');
      const dupe = (s.horses ?? []).find((h) => normKey(h.name) === normKey(a.name));
      if (dupe) {
        throw actionError(`“${dupe.name}” is already in the register — edit that record instead (see detail).`, {
          horseId: dupe.id,
          studioPath: `/studio/horse/${dupe.id}`,
        });
      }

      const wanted: Array<[PartyRole, string[]]> = [
        ['owner', a.owners],
        ['trainer', a.trainers],
        ['jockey', a.jockeys ?? []],
        ['breeder', a.breeders ?? []],
      ];
      const picks: Array<{ role: PartyRole; person: RegisterPerson }> = [];
      for (const [role, names] of wanted) {
        const pool = people.filter((p) => p.roles.includes(role));
        for (const n of names) {
          const r = resolveOne(n, pool, (p) => [p.id, p.name], `${role} in the People register`, (p) => p.name);
          if (!r.hit) {
            const elsewhere = people.find((p) => normKey(p.name) === normKey(n));
            throw new Error(
              elsewhere
                ? `${elsewhere.name} is in the People register but not as a ${role} (roles: ${elsewhere.roles.join(', ') || 'none'}). Add the ${role} role to them first.`
                : `${r.error} Add them first with registers.addPerson (role "${role}") on /production-system/people.`,
            );
          }
          picks.push({ role, person: r.hit });
        }
      }

      const before = new Set((useHorseStore.getState().horses ?? []).map((h) => h.id));
      ui.step(`Adding ${a.name} to the stables`);
      await ui.click('reg.add-horse', 'Add Thoroughbred');
      await ui.waitFor('reg.add-horse-quick', 4000);
      await ui.click('reg.add-horse-quick', 'Quick form');
      await ui.waitFor('reg.horse-form', 5000);
      await discardRestoredDraft(ui, 'reg.horse-discard-draft', 'horse');

      await typeField(ui, 'reg.horse-name', a.name);
      if (sex) await ui.select('reg.horse-sex', sex);
      if (a.dob) await typeField(ui, 'reg.horse-dob', a.dob);
      if (colour) await ui.select('reg.horse-colour', colour);
      if (country) await ui.select('reg.horse-country', country);

      if (a.sire || a.dam) {
        await ensureOpen(ui, 'reg.horse-section-pedigree');
        if (a.sire) await typeField(ui, 'reg.horse-sire', a.sire);
        if (a.dam) await typeField(ui, 'reg.horse-dam', a.dam);
      }

      await ensureOpen(ui, 'reg.horse-section-connections');
      for (const role of ['owner', 'trainer', 'jockey', 'breeder'] as PartyRole[]) {
        const mine = picks.filter((p) => p.role === role);
        if (!mine.length) continue;
        const trigger = `reg.horse-conn-${roleAnchor(role)}`;
        if (anchor(trigger)?.getAttribute('aria-expanded') !== 'true') await ui.click(trigger, `Choose ${role}s`);
        for (const { person } of mine) {
          const opt = `${trigger}.option-${person.id}`;
          await ui.waitFor(opt, 3000);
          if (anchor(opt)?.getAttribute('aria-selected') !== 'true') await ui.click(opt, person.name);
        }
        if (anchor(trigger)?.getAttribute('aria-expanded') === 'true') await ui.click(trigger, 'Done');
      }

      const toasts = watchToasts();
      await ui.click('reg.horse-save', 'Add to Stables');
      const closed = await waitUntil(
        () => !anchor('reg.horse-form') || toasts.collect().some((t) => t.type === 'error'),
        { timeoutMs: 45_000, signal: ui.signal },
      );
      const msgs = toasts.collect();
      if (!closed || anchor('reg.horse-form')) {
        throw new Error(firstError(msgs) ?? 'The horse form did not save — it is still open for you to check.');
      }
      const created = (useHorseStore.getState().horses ?? []).find(
        (h) => !before.has(h.id) && normKey(h.name) === normKey(a.name),
      );
      if (!created) throw new Error(firstError(msgs) ?? 'Saved, but the new horse is not in the register yet — refresh to check.');
      await waitUntil(() => !!anchor(`reg.horse-row-${created.id}`), { timeoutMs: 2000, signal: ui.signal });
      ui.flash(`reg.horse-row-${created.id}`);
      return {
        ok: true,
        horse: horseJson(created, live.current.parties ?? []),
        warnings: msgs.filter((t) => t.type === 'warning').map((t) => t.text),
      };
    },
  });
}

// ── People ───────────────────────────────────────────────────────────────────

const addPersonArgs = z.object({
  name: z.string().trim().min(1).max(120),
  roles: z.array(z.enum(PARTY_ROLE_IDS)).min(1),
  profession: z.string().max(120).optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dob must be YYYY-MM-DD').optional(),
  countryOfBirth: z.string().max(80).optional(),
  baseLocation: z.string().max(120).optional(),
  startedYear: z.number().int().min(1900).max(2100).optional(),
});
type AddPersonArgs = z.infer<typeof addPersonArgs>;

export function usePeopleRegisterActions(ps: PS): void {
  const live = useLive(ps);

  useAgentAction<{ query: string; role?: (typeof PARTY_ROLE_IDS)[number] }>({
    name: 'registers.searchPeople',
    description: 'Search the People register (owners, trainers, jockeys, breeders …) by name, profession or location.',
    args: z.object({ query: z.string().max(120), role: z.enum(PARTY_ROLE_IDS).optional() }),
    run: async (a, ui) => {
      if (live.current.safeParties.length === 0) return { query: a.query, total: 0, rows: [], note: 'The People register is empty.' };
      await typeSearch(ui, 'reg.person-search', a.query, () => live.current.partySearch === a.query);
      let rows = live.current.filteredParties;
      if (a.role) rows = rows.filter((p) => p.roles.includes(a.role!));
      return {
        query: a.query,
        role: a.role ?? null,
        total: rows.length,
        rows: rows.slice(0, MAX_ROWS).map(personJson),
        truncated: rows.length > MAX_ROWS,
      };
    },
  });

  useAgentAction<AddPersonArgs>({
    name: 'registers.addPerson',
    description: 'Add a person to the People register with their roles (owner, trainer, jockey …) and optional details.',
    args: addPersonArgs,
    run: async (a, ui) => {
      const dupe = live.current.safeParties.find((p) => normKey(p.name) === normKey(a.name));
      if (dupe) {
        throw new Error(
          `${dupe.name} is already in the register (id ${dupe.id}, roles: ${dupe.roles.join(', ') || 'none'}). Edit them instead of adding a duplicate.`,
        );
      }
      const before = new Set(live.current.safeParties.map((p) => p.id));
      ui.step(`Adding ${a.name} to the People register`);
      await ui.click('reg.add-person', 'Add to the register');
      await ui.waitFor('reg.person-form', 5000);
      await discardRestoredDraft(ui, 'reg.person-discard-draft', 'person');

      await typeField(ui, 'reg.person-name', a.name);
      if (a.profession) await typeField(ui, 'reg.person-profession', a.profession);
      // Roles are toggle chips (aria-pressed). End with exactly the requested set.
      for (const role of PARTY_ROLE_IDS) {
        const id = `reg.person-role-${roleAnchor(role)}`;
        const pressed = anchor(id)?.getAttribute('aria-pressed') === 'true';
        if (pressed !== a.roles.includes(role)) await ui.click(id, role);
      }
      if (a.dob) await typeField(ui, 'reg.person-dob', a.dob);
      if (a.countryOfBirth) await typeField(ui, 'reg.person-country', a.countryOfBirth);
      if (a.baseLocation) await typeField(ui, 'reg.person-base', a.baseLocation);
      if (a.startedYear) await typeField(ui, 'reg.person-started-year', String(a.startedYear));

      const toasts = watchToasts();
      await ui.click('reg.person-save', 'Add to Register');
      const closed = await waitUntil(
        () => !anchor('reg.person-form') || toasts.collect().some((t) => t.type === 'error'),
        { timeoutMs: 45_000, signal: ui.signal },
      );
      const msgs = toasts.collect();
      if (!closed || anchor('reg.person-form')) {
        throw new Error(firstError(msgs) ?? 'The form did not save — it is still open for you to check.');
      }
      let created: RegisterPerson | undefined;
      await waitUntil(
        () => !!(created = live.current.safeParties.find((p) => !before.has(p.id) && normKey(p.name) === normKey(a.name))),
        { timeoutMs: 5000, signal: ui.signal },
      );
      if (!created) return { ok: true, name: a.name, note: 'Saved; the register is still refreshing.' };
      if (anchor(`reg.person-row-${created.id}`)) ui.flash(`reg.person-row-${created.id}`);
      return { ok: true, person: personJson(created) };
    },
  });
}

// ── Media / Racing / Horse records (read) ────────────────────────────────────

const searchWithHorse = z.object({
  query: z.string().max(120).default(''),
  horse: z.string().optional().describe('Horse name or id to filter by; "" for all horses'),
});
type SearchWithHorse = z.infer<typeof searchWithHorse>;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MEDIA_TYPE_IDS = ['Article', 'Photo', 'Video', 'Press Release', 'Publication'] as const;
const RACE_STATUS_IDS = ['Entered', 'Accepted', 'Scratched', 'Declared', 'Finished'] as const;
// Kept in step with the app's own lists (a new type/status must be added here too).
if (import.meta.env.DEV) {
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
  if (!same(MEDIA_TYPE_IDS, MEDIA_TYPES) || !same(RACE_STATUS_IDS, RACE_STATUSES)) {
    console.warn('[operator] registers: MEDIA_TYPE_IDS / RACE_STATUS_IDS drifted from types/mediaItem / types/racingEntry');
  }
}

const addMediaArgs = z.object({
  horse: z.string().trim().min(1).describe('Horse name or id'),
  title: z.string().trim().min(1).max(300),
  subject: z.string().trim().min(1).max(2000).describe('What the item covers (1–2 sentences)'),
  mediaType: z.enum(MEDIA_TYPE_IDS).default('Article'),
  sourcePublication: z.string().trim().max(200).optional(),
  publishedDate: z.string().regex(YMD, 'publishedDate must be YYYY-MM-DD').optional(),
  url: z.string().trim().min(1).max(2000).optional().describe('External URL or /articles/<id>; omit to attach a file instead'),
  featured: z.array(z.string()).optional().describe('People register names featured in it'),
  linkedArticle: z.string().optional().describe('Stable Press article title or id'),
});
type AddMediaArgs = z.infer<typeof addMediaArgs>;

const addRacingArgs = z.object({
  horse: z.string().trim().min(1).describe('Horse name or id'),
  raceName: z.string().trim().min(1).max(200),
  raceDate: z.string().regex(YMD, 'raceDate must be YYYY-MM-DD'),
  venue: z.string().trim().min(1).max(200),
  subject: z.string().trim().max(500).optional(),
  status: z.enum(RACE_STATUS_IDS).optional(),
  country: z.string().trim().max(80).optional(),
  classGrade: z.string().trim().max(80).optional(),
  distance: z.string().trim().max(40).optional(),
  trackCondition: z.string().trim().max(80).optional(),
  finishPosition: z.number().int().min(1).max(40).optional(),
  margin: z.string().trim().max(40).optional(),
  time: z.string().trim().max(40).optional(),
  prizeMoney: z.number().min(0).optional(),
  barrier: z.number().int().min(1).max(40).optional(),
  weightCarried: z.string().trim().max(40).optional(),
  jockey: z.string().optional().describe('Jockey name from the People register'),
  trainer: z.string().optional().describe('Trainer name from the People register'),
});
type AddRacingArgs = z.infer<typeof addRacingArgs>;

const mediaJson = (m: MediaItem, horse: string) => ({
  id: m.id,
  horse,
  title: m.title,
  subject: m.subject,
  type: m.media_type,
  publication: m.source_publication ?? null,
  published: m.published_date ?? null,
  url: m.url ?? null,
  file: m.file_name ?? null,
  featuredPeople: m.featured_party_ids?.length ?? 0,
  linkedArticleId: m.linked_article_id ?? null,
});

const racingJson = (r: RacingEntry, horse: string) => ({
  id: r.id,
  horse,
  race: r.race_name,
  date: r.race_date,
  venue: r.venue,
  status: r.status,
  country: r.country ?? null,
  class: r.class_grade ?? null,
  distance: r.distance ?? null,
  finish: r.finish_position ?? null,
  prizeMoney: r.prize_money ?? null,
  subject: r.subject,
});

export function useMediaRegisterActions(ps: PS): void {
  const live = useLive(ps);
  useAgentAction<SearchWithHorse>({
    name: 'registers.searchMedia',
    description: 'Search Media Records (title, subject, publication), optionally filtered to one horse.',
    args: searchWithHorse,
    run: async (a, ui) => {
      const s = live.current;
      if ((s.mediaItems ?? []).length === 0) return { total: 0, rows: [], note: 'No media records yet.' };
      const horses = s.horses ?? [];
      let horseId = '';
      if (a.horse) {
        const h = resolveHorse(a.horse, horses);
        if (!h.hit) throw new Error(h.error);
        horseId = h.hit.id;
      }
      if (s.mediaHorseFilter !== horseId) await ui.select('reg.media-horse-filter', horseId);
      await typeSearch(ui, 'reg.media-search', a.query, () => live.current.mediaSearch === a.query);
      const name = new Map(horses.map((h) => [h.id, h.name]));
      const rows = live.current.filteredMediaItems;
      return {
        total: rows.length,
        typeFilter: live.current.mediaTypeFilter || null,
        rows: rows.slice(0, MAX_ROWS).map((m) => ({
          id: m.id,
          title: m.title,
          subject: m.subject,
          type: m.media_type,
          publication: m.source_publication ?? null,
          published: m.published_date ?? null,
          horse: name.get(m.horse_id) ?? m.horse_id,
        })),
        truncated: rows.length > MAX_ROWS,
      };
    },
  });

  useAgentAction<AddMediaArgs>({
    name: 'registers.addMediaRecord',
    description:
      'Add a media record (article / photo / video / press release / publication) to a horse by filling the Add Media Record form. With a url it saves; without one it stops on the File Upload tab so a file can be attached.',
    args: addMediaArgs,
    run: async (a, ui) => {
      const s = live.current;
      // Resolve everything BEFORE touching the screen.
      const h = resolveHorse(a.horse, s.horses ?? []);
      if (!h.hit) throw new Error(h.error);
      const horse = h.hit;
      const featured = (a.featured ?? []).map((n) => {
        const r = resolveOne(n, s.safeParties, (p) => [p.id, p.name], 'person in the People register', (p) => p.name);
        if (!r.hit) throw new Error(`${r.error} Add them first with registers.addPerson on /production-system/people.`);
        return r.hit;
      });
      let article: { id: string; title: string } | undefined;
      if (a.linkedArticle) {
        const r = resolveOne(
          a.linkedArticle,
          useArticleStore.getState().articles ?? [],
          (x) => [x.id, x.title],
          'Stable Press article',
          (x) => x.title,
        );
        if (!r.hit) throw new Error(r.error);
        article = r.hit;
      }
      const before = new Set((useMediaStore.getState().items ?? []).map((m) => m.id));

      ui.step(`Adding a media record (${a.mediaType}) for ${horse.name}`);
      await ui.click('reg.add-media', 'Add Media Record');
      await ui.waitFor('reg.media-form', 5000);
      await discardRestoredDraft(ui, 'reg.media-discard-draft', 'media record');

      // Horse — a searchable dropdown: open, type the name, pick it.
      await ui.click('reg.media-horse', 'Choose the horse');
      await ui.waitFor('reg.media-horse-search', 3000);
      await ui.type('reg.media-horse-search', horse.name, { clear: true });
      await ui.waitFor(`reg.media-horse.option-${horse.id}`, 3000);
      await ui.click(`reg.media-horse.option-${horse.id}`, horse.name);

      await ui.type('reg.media-subject', a.subject, { clear: true });
      const typeId = `reg.media-type-${a.mediaType.toLowerCase().replace(/ /g, '-')}`;
      if (anchor(typeId)?.getAttribute('aria-pressed') !== 'true') await ui.click(typeId, a.mediaType);
      await typeField(ui, 'reg.media-title', a.title);
      if (a.sourcePublication) await typeField(ui, 'reg.media-source', a.sourcePublication);
      if (a.publishedDate) await typeField(ui, 'reg.media-date', a.publishedDate);

      if (a.url) {
        if (anchor('reg.media-mode-url')?.getAttribute('aria-pressed') !== 'true') await ui.click('reg.media-mode-url', 'External URL');
        await typeField(ui, 'reg.media-url', a.url);
      } else if (anchor('reg.media-mode-file')?.getAttribute('aria-pressed') !== 'true') {
        await ui.click('reg.media-mode-file', 'File Upload');
      }

      if (featured.length) {
        await ui.click('reg.media-featured', 'Add featured people');
        for (const p of featured) {
          const opt = `reg.media-featured.option-${p.id}`;
          await ui.waitFor(opt, 3000);
          if (anchor(opt)?.getAttribute('aria-selected') !== 'true') await ui.click(opt, p.name);
        }
        if (anchor('reg.media-featured')?.getAttribute('aria-expanded') === 'true') await ui.click('reg.media-featured', 'Done');
      }
      if (article) {
        await ui.click('reg.media-article', 'Link an article');
        await ui.waitFor(`reg.media-article.option-${article.id}`, 3000);
        await ui.click(`reg.media-article.option-${article.id}`, article.title);
      }

      if (!a.url) {
        await ui.point('reg.media-file', 'Attach the file here');
        return {
          ok: true,
          saved: false,
          needsFile: true,
          horse: horse.name,
          fileAnchor: 'reg.media-file',
          saveAnchor: 'reg.media-save',
          note:
            'The form is filled and open on its File Upload tab, but NOT saved — a media record needs a URL or a file. ' +
            'Attach the file to reg.media-file with the upload tool (or ask the user to choose it), then click reg.media-save. ' +
            'Or call this again with a url.',
        };
      }

      const toasts = watchToasts();
      await ui.click('reg.media-save', 'Save Media Record');
      const closed = await waitUntil(
        () => !anchor('reg.media-form') || toasts.collect().some((t) => t.type === 'error'),
        { timeoutMs: 45_000, signal: ui.signal },
      );
      const msgs = toasts.collect();
      if (!closed || anchor('reg.media-form')) {
        throw new Error(firstError(msgs) ?? 'The media form did not save — it is still open for you to check.');
      }
      let created: MediaItem | undefined;
      await waitUntil(
        () => !!(created = (useMediaStore.getState().items ?? []).find((m) => !before.has(m.id) && normKey(m.title) === normKey(a.title))),
        { timeoutMs: 5000, signal: ui.signal },
      );
      if (!created) return { ok: true, saved: true, title: a.title, note: 'Saved; the list is still refreshing.' };
      if (anchor(`reg.media-row-${created.id}`)) ui.flash(`reg.media-row-${created.id}`);
      return { ok: true, saved: true, record: mediaJson(created, horse.name) };
    },
  });
}

export function useRacingRegisterActions(ps: PS): void {
  const live = useLive(ps);
  useAgentAction<SearchWithHorse>({
    name: 'registers.searchRacing',
    description: 'Search Racing Records (race, venue, subject, country), optionally filtered to one horse.',
    args: searchWithHorse,
    run: async (a, ui) => {
      const s = live.current;
      if ((s.racingEntries ?? []).length === 0) return { total: 0, rows: [], note: 'No racing records yet.' };
      const horses = s.horses ?? [];
      let horseId = '';
      if (a.horse) {
        const h = resolveHorse(a.horse, horses);
        if (!h.hit) throw new Error(h.error);
        horseId = h.hit.id;
      }
      if (s.racingHorseFilter !== horseId) await ui.select('reg.racing-horse-filter', horseId);
      await typeSearch(ui, 'reg.racing-search', a.query, () => live.current.racingSearch === a.query);
      const name = new Map(horses.map((h) => [h.id, h.name]));
      const rows = live.current.filteredRacingEntries;
      return {
        total: rows.length,
        rows: rows.slice(0, MAX_ROWS).map((r) => ({
          id: r.id,
          race: r.race_name,
          date: r.race_date,
          venue: r.venue,
          country: r.country ?? null,
          class: r.class_grade ?? null,
          distance: r.distance ?? null,
          status: r.status,
          finish: r.finish_position ?? null,
          prizeMoney: r.prize_money ?? null,
          horse: name.get(r.horse_id) ?? r.horse_id,
        })),
        truncated: rows.length > MAX_ROWS,
      };
    },
  });

  useAgentAction<AddRacingArgs>({
    name: 'registers.addRacingRecord',
    description:
      'Add a racing record (an entry or a result) to a horse by filling the Add Racing Record form field by field, then saving.',
    args: addRacingArgs,
    run: async (a, ui) => {
      const s = live.current;
      const h = resolveHorse(a.horse, s.horses ?? []);
      if (!h.hit) throw new Error(h.error);
      const horse = h.hit;
      // Jockey / trainer come from the register's party edges with that role
      // (the form's own dropdown lists exactly those people).
      const edges = usePartyStore.getState().parties;
      const pickPerson = (name: string | undefined, role: 'jockey' | 'trainer') => {
        if (!name) return undefined;
        const pool = [...new Map(edges.filter((e) => e.role === role).map((e) => [e.personId || e.id, e])).values()];
        const r = resolveOne(name, pool, (e) => [e.name, e.personId, e.id], `${role} in the People register`, (e) => e.name);
        if (!r.hit) throw new Error(`${r.error} Add them with registers.addPerson (role "${role}") first, or leave ${role} out.`);
        return r.hit.name;
      };
      const jockey = pickPerson(a.jockey, 'jockey');
      const trainer = pickPerson(a.trainer, 'trainer');
      const status = a.status ?? (a.finishPosition !== undefined ? 'Finished' : 'Entered');
      const subject = a.subject?.trim() || `${horse.name} — ${a.raceName}, ${a.venue}`;
      const before = new Set((useRacingEntryStore.getState().entries ?? []).map((r) => r.id));

      ui.step(`Adding the ${a.raceName} for ${horse.name}`);
      await ui.click('reg.add-racing', 'Add Racing Record');
      await ui.waitFor('reg.racing-form', 5000);
      await discardRestoredDraft(ui, 'reg.racing-discard-draft', 'racing record');

      await ui.select('reg.racing-horse', horse.id);
      await typeField(ui, 'reg.racing-subject', subject);
      await typeField(ui, 'reg.racing-race-name', a.raceName);
      await ui.select('reg.racing-status', status);
      await typeField(ui, 'reg.racing-date', a.raceDate);
      await typeField(ui, 'reg.racing-venue', a.venue);
      const optional: Array<[string, string | number | undefined]> = [
        ['reg.racing-country', a.country],
        ['reg.racing-class', a.classGrade],
        ['reg.racing-distance', a.distance],
        ['reg.racing-track', a.trackCondition],
        ['reg.racing-finish', a.finishPosition],
        ['reg.racing-margin', a.margin],
        ['reg.racing-time', a.time],
        ['reg.racing-prize', a.prizeMoney],
        ['reg.racing-barrier', a.barrier],
        ['reg.racing-weight', a.weightCarried],
      ];
      for (const [id, v] of optional) if (v !== undefined && v !== '') await typeField(ui, id, String(v));
      if (jockey) await ui.select('reg.racing-jockey', jockey);
      if (trainer) await ui.select('reg.racing-trainer', trainer);

      const toasts = watchToasts();
      await ui.click('reg.racing-save', 'Save Racing Record');
      const closed = await waitUntil(
        () => !anchor('reg.racing-form') || toasts.collect().some((t) => t.type === 'error'),
        { timeoutMs: 45_000, signal: ui.signal },
      );
      const msgs = toasts.collect();
      if (!closed || anchor('reg.racing-form')) {
        throw new Error(firstError(msgs) ?? 'The racing form did not save — it is still open for you to check.');
      }
      let created: RacingEntry | undefined;
      await waitUntil(
        () =>
          !!(created = (useRacingEntryStore.getState().entries ?? []).find(
            (r) => !before.has(r.id) && normKey(r.race_name) === normKey(a.raceName),
          )),
        { timeoutMs: 5000, signal: ui.signal },
      );
      if (!created) return { ok: true, raceName: a.raceName, note: 'Saved; the list is still refreshing.' };
      if (anchor(`reg.racing-row-${created.id}`)) ui.flash(`reg.racing-row-${created.id}`);
      return { ok: true, record: racingJson(created, horse.name), jockey: jockey ?? null, trainer: trainer ?? null };
    },
  });
}

export function useHorseRecordsActions(ps: PS): void {
  const live = useLive(ps);
  useAgentAction<{ horse?: string }>({
    name: 'registers.listHorseRecords',
    description: 'List sale records and documents/reports, optionally for one horse.',
    args: z.object({ horse: z.string().optional() }),
    run: async (a) => {
      const s = live.current;
      const horses = s.horses ?? [];
      let horseId: string | undefined;
      if (a.horse) {
        const h = resolveHorse(a.horse, horses);
        if (!h.hit) throw new Error(h.error);
        horseId = h.hit.id;
      }
      const name = new Map(horses.map((h) => [h.id, h.name]));
      const sales = (s.salesRecords ?? []).filter((x) => !horseId || x.horse_id === horseId);
      const reports = (s.reportRecords ?? []).filter((x) => !horseId || x.horse_id === horseId);
      return {
        sales: sales.slice(0, MAX_ROWS).map((x) => ({
          id: x.id,
          horse: name.get(x.horse_id) ?? x.horse_id,
          date: x.sale_date,
          type: x.sale_type,
          venue: x.venue,
          lot: x.lot ?? null,
          price: x.price ?? null,
          currency: x.currency ?? null,
        })),
        reports: reports.slice(0, MAX_ROWS).map((x) => ({
          id: x.id,
          horse: name.get(x.horse_id) ?? x.horse_id,
          type: x.doc_type,
          title: x.title,
          issued: x.issued_date ?? null,
          issuer: x.issuing_body ?? null,
        })),
        totals: { sales: sales.length, reports: reports.length },
      };
    },
  });
}
