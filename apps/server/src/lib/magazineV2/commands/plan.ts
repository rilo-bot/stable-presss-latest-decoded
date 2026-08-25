// ---------------------------------------------------------------------------
// Magazine command planner — turn a batch of commands into per-page writes.
//
// PURE. No database, no clock, no randomness: given the current pages and a
// batch, it returns either the exact writes to perform or the reason it refused.
// That is what makes "nothing is half-applied" achievable — every failure mode
// that can be detected from state (missing ids, locked elements, invalid
// patches, element caps, selectors that match nothing) is caught HERE, with
// zero writes done. The executor's remaining job is I/O.
//
// THE ONE ARCHITECTURAL FACT THIS RESTS ON: elements are stored INSIDE the page
// document (`pages.elements`), so every command touching one page collapses into
// a single document write, which MongoDB already applies atomically. Twenty
// edits across six pages is therefore six atomic writes, not twenty racing ones
// — and cross-page atomicity is the only part left to arrange (see execute.ts).
//
// Writes reuse the SAME normalize pipeline as the element PATCH route
// (normalizeElementPatch / normalizeElements), so this is not a second, weaker
// write path — the guardrails cannot be bypassed by routing through commands.
// ---------------------------------------------------------------------------

import type {
  AppliedPage,
  BoxPatch,
  CommandFailure,
  ElementSelector,
  MagazineCommand,
  MagazineElement,
  NewElement,
  PageBackground,
  TextStylePatch,
} from '@rilo/schema';
import { MAX_ELEMENTS_PER_PAGE } from '../model.js';
import { isLockedAgainst, normalizeElementPatch, normalizeElements } from '../writePipeline.js';

/** The current state of one page, as the planner needs to see it. */
export interface PageState {
  id: string;
  /** 0-based position in the issue. Used only for stable ordering of results. */
  index: number;
  rev: number;
  width: number;
  height: number;
  background: PageBackground;
  elements: MagazineElement[];
}

/** One page's write, with everything needed to undo it. */
export interface PlannedPage {
  pageId: string;
  /** The rev the write is conditional on — the CAS token. */
  revBefore: number;
  elements: MagazineElement[];
  /** Present only when the batch actually changes the ground. */
  background?: PageBackground;
  /**
   * The page as it was. The inverse is a SNAPSHOT of the element array, not a
   * list of per-command inverses, and that is deliberate: the array is the unit
   * the storage layer writes anyway, and a snapshot cannot go stale the way a
   * computed inverse can when other commands in the same batch touch the same
   * element. Undo re-writes this under a rev check, so a page edited since the
   * batch refuses to revert rather than clobbering the newer edit.
   */
  before: { elements: MagazineElement[]; background: PageBackground };
  /** How many commands in the batch hit this page (reported to the user). */
  commands: number;
}

export type PlanResult =
  | { ok: true; pages: PlannedPage[] }
  | { ok: false; reason: CommandFailure; detail: string };

const fail = (reason: CommandFailure, detail: string): PlanResult => ({ ok: false, reason, detail });

// ── Selector resolution ───────────────────────────────────────────────────────

/** Pages a selector's scope covers, in issue order. */
function pagesInScope(sel: ElementSelector, pages: PageState[]): PageState[] {
  if (sel.kind === 'element') {
    const p = pages.find((x) => x.id === sel.pageId);
    return p ? [p] : [];
  }
  const scope = sel.scope;
  if (scope.kind === 'issue') return pages;
  const wanted = scope.kind === 'page' ? [scope.pageId] : scope.pageIds;
  const set = new Set(wanted);
  return pages.filter((p) => set.has(p.id));
}

export interface ResolvedTarget {
  pageId: string;
  elementId: string;
}

/**
 * Every element a selector names, in a STABLE order (page order, then the
 * element's position on its page). Order matters because two commands in one
 * batch can touch the same element and the later one must win predictably.
 */
export function resolveSelector(sel: ElementSelector, pages: PageState[]): ResolvedTarget[] {
  const scoped = pagesInScope(sel, pages);
  const out: ResolvedTarget[] = [];
  for (const page of [...scoped].sort((a, b) => a.index - b.index)) {
    for (const el of page.elements) {
      if (sel.kind === 'element') {
        if (el.id === sel.elementId) out.push({ pageId: page.id, elementId: el.id });
      } else if (sel.kind === 'role') {
        if (el.type === 'text' && el.text?.role === sel.role) out.push({ pageId: page.id, elementId: el.id });
      } else if (el.type === sel.type) {
        out.push({ pageId: page.id, elementId: el.id });
      }
    }
  }
  return out;
}

// ── Command → element patch ───────────────────────────────────────────────────

/** Drop keys whose value is undefined so a patch never blanks a stored field. */
function defined<T extends object>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

function stylePatch(style: TextStylePatch): Record<string, unknown> {
  return { text: defined(style) };
}

function boxPatch(box: BoxPatch): Record<string, unknown> {
  return defined(box);
}

/**
 * The partial patch a command applies to one element, in the shape
 * normalizeElementPatch already understands. Returns null for commands that do
 * not patch an element (add / delete / page-level).
 */
function patchFor(cmd: MagazineCommand): Record<string, unknown> | null {
  switch (cmd.type) {
    case 'element.setText':
      return { text: { content: cmd.content } };
    case 'element.setStyle':
      return stylePatch(cmd.style);
    case 'element.move':
      return boxPatch(cmd.box);
    case 'element.setImage':
      return { image: defined({ url: cmd.url, assetId: cmd.assetId, alt: cmd.alt }) };
    default:
      return null;
  }
}

// ── Planning ──────────────────────────────────────────────────────────────────

/** Mutable per-page working copy, built once and shared across commands. */
interface Working {
  page: PageState;
  elements: MagazineElement[];
  background: PageBackground;
  commands: number;
  dirty: boolean;
}

/**
 * Plan a batch.
 *
 * `strict` decides what an empty selector means. A human clicking a control has
 * picked a real element, so no match is a bug worth reporting. An agent asked to
 * "shorten every headline" on an issue where one page has none should not fail
 * the whole batch — so agent batches pass `strict: false` and a selector that
 * matches nothing simply contributes no writes.
 */
export function planBatch(
  commands: MagazineCommand[],
  pages: PageState[],
  opts: { strict?: boolean; origin?: 'agent' | 'manual' } = {},
): PlanResult {
  const strict = opts.strict ?? true;
  // Stamped onto anything the batch CREATES, so the editor can still tell an
  // AI-authored element from a hand-made one — the reason `source` exists.
  const source = opts.origin === 'manual' ? 'manual' : 'ai-agent';
  if (commands.length === 0) return fail('invalid', 'A batch must contain at least one command.');

  const working = new Map<string, Working>();
  const workFor = (pageId: string): Working | null => {
    const existing = working.get(pageId);
    if (existing) return existing;
    const page = pages.find((p) => p.id === pageId);
    if (!page) return null;
    const w: Working = {
      page,
      elements: page.elements.slice(),
      background: page.background,
      commands: 0,
      dirty: false,
    };
    working.set(pageId, w);
    return w;
  };

  for (const [i, cmd] of commands.entries()) {
    const at = `command ${i + 1} (${cmd.type})`;

    // ── page-level ──
    if (cmd.type === 'page.setBackground') {
      const w = workFor(cmd.pageId);
      if (!w) return fail('not-found', `${at}: page ${cmd.pageId} is not in this issue.`);
      w.background = cmd.background;
      w.commands += 1;
      w.dirty = true;
      continue;
    }

    // ── add ──
    if (cmd.type === 'element.add') {
      const w = workFor(cmd.pageId);
      if (!w) return fail('not-found', `${at}: page ${cmd.pageId} is not in this issue.`);
      if (w.elements.length >= MAX_ELEMENTS_PER_PAGE) {
        return fail('limit', `${at}: page already holds the maximum of ${MAX_ELEMENTS_PER_PAGE} elements.`);
      }
      const dims = { width: w.page.width, height: w.page.height };
      // id/source stripped so the pipeline assigns them, exactly as the element
      // POST route does — an agent must not be able to choose an element id.
      const [created] = normalizeElements([{ ...(cmd.element as NewElement), id: undefined, source }], dims);
      if (!created) return fail('invalid', `${at}: the element did not survive validation.`);
      w.elements.push(created);
      w.commands += 1;
      w.dirty = true;
      continue;
    }

    // ── element-targeting ──
    const targets = resolveSelector(cmd.target, pages);
    if (targets.length === 0) {
      if (strict) return fail('no-match', `${at}: nothing matched that target.`);
      continue;
    }

    for (const t of targets) {
      const w = workFor(t.pageId);
      if (!w) return fail('not-found', `${at}: page ${t.pageId} is not in this issue.`);
      const idx = w.elements.findIndex((e) => e.id === t.elementId);
      // An earlier command in the same batch may already have deleted it. That is
      // a contradictory batch, not a race, so refuse rather than silently skip.
      if (idx === -1) {
        return fail('not-found', `${at}: element ${t.elementId} was already removed earlier in this batch.`);
      }
      const stored = w.elements[idx]!;

      if (cmd.type === 'element.delete') {
        if (isLockedAgainst(stored)) {
          return fail('locked', `${at}: element ${t.elementId} is locked. Unlock it first.`);
        }
        w.elements.splice(idx, 1);
        w.commands += 1;
        w.dirty = true;
        continue;
      }

      const partial = patchFor(cmd);
      if (!partial) return fail('unsupported', `${at}: not implemented.`);
      if (isLockedAgainst(stored, partial)) {
        return fail('locked', `${at}: element ${t.elementId} is locked. Unlock it first.`);
      }
      const updated = normalizeElementPatch(stored, partial, { width: w.page.width, height: w.page.height });
      if (!updated) return fail('invalid', `${at}: the patch did not survive validation.`);
      w.elements[idx] = updated;
      w.commands += 1;
      w.dirty = true;
    }
  }

  const planned: PlannedPage[] = [...working.values()]
    .filter((w) => w.dirty)
    .sort((a, b) => a.page.index - b.page.index)
    .map((w) => ({
      pageId: w.page.id,
      revBefore: w.page.rev,
      elements: w.elements,
      ...(w.background !== w.page.background ? { background: w.background } : {}),
      before: { elements: w.page.elements, background: w.page.background },
      commands: w.commands,
    }));

  // Every command matched nothing, under strict:false. Honest outcome: the batch
  // is a no-op. The caller reports that rather than claiming success.
  if (planned.length === 0) return fail('no-match', 'Nothing in this batch matched anything to change.');

  return { ok: true, pages: planned };
}

/** The user-facing tally of what a plan will do. */
export function summarisePlan(pages: PlannedPage[]): AppliedPage[] {
  return pages.map((p) => ({
    pageId: p.pageId,
    revBefore: p.revBefore,
    revAfter: p.revBefore + 1,
    commands: p.commands,
  }));
}
