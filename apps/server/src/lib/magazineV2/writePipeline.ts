// ---------------------------------------------------------------------------
// Magazine Builder v2 — the single element write pipeline.
//
// EVERY element write (manual, AI-agent, extraction, generation) goes through
// these two functions, so the guardrails can't be bypassed by any caller:
//     validate → sanitise → refit.
// This is the discipline that earns "no layout bugs": geometry is clamped to the
// page, unknown/invalid elements are dropped (never throw), rich text is
// sanitised, and shrink-to-fit text is re-fit to its box.
// ---------------------------------------------------------------------------

import {
  validateElements,
  validateElementPatch,
  type MagazineElement,
} from './model.js';
import { sanitizeElements } from './sanitize.js';
import { refitText } from './layout.js';

type PageDims = { width: number; height: number };

/**
 * Is this write blocked by the element's lock?
 *
 * A locked element refuses every write EXCEPT the one that unlocks it, so a user
 * is never stuck. Lives here, in the shared write pipeline, because it is a
 * guardrail every caller must honour — the element PATCH route, the AI agent's
 * tools, and the command layer. It used to be a private helper inside the routes
 * file, which meant any second write path had to re-implement it from memory.
 */
export function isLockedAgainst(
  stored: Pick<MagazineElement, 'locked'>,
  partial?: Record<string, unknown>,
): boolean {
  if (stored.locked !== true) return false;
  return !(partial && partial.locked === false);
}

/** Full-list write path (extraction, generation, bulk import, page create). */
export function normalizeElements(raw: unknown, page: PageDims): MagazineElement[] {
  return refitText(sanitizeElements(validateElements(raw, page)));
}

/**
 * Deep-merge a client's PARTIAL element onto the stored one (text/image/shape/qr
 * merged one level), so a patch that only sends `{text:{fontSize:20}}` doesn't
 * wipe geometry or the rest of the text data. Must run BEFORE validation.
 */
export function mergeElement(
  stored: MagazineElement,
  partial: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...stored, ...partial };
  for (const sub of ['text', 'image', 'shape', 'qr', 'icon'] as const) {
    const p = partial[sub];
    if (p && typeof p === 'object') {
      merged[sub] = { ...(stored[sub] as object | undefined), ...(p as object) };
    }
  }
  return merged;
}

/**
 * Single-element patch write path. Merges the partial onto the stored element,
 * then validates → sanitises → (conditionally) refits, returning the canonical
 * element to store.
 *
 * Refit is a server-side FALLBACK estimate, so it must not clobber the client's
 * own precise measurement: it runs only when the patch could actually change the
 * fit (edited `content` or resized `w`/`h`) AND the client did not send an
 * explicit `fontSize`. A style-only patch (e.g. colour) never rewrites the size.
 */
export function normalizeElementPatch(
  stored: MagazineElement,
  partial: Record<string, unknown>,
  page: PageDims,
): MagazineElement | null {
  const merged = mergeElement(stored, partial);
  const validated = validateElementPatch(merged, page);
  if (!validated.type) return null; // unusable
  const [sanitized] = sanitizeElements([validated as MagazineElement]);
  if (!sanitized) return null;

  const pText = partial.text && typeof partial.text === 'object' ? (partial.text as Record<string, unknown>) : undefined;
  const explicitFontSize = pText != null && typeof pText.fontSize === 'number';
  const changedContent = pText != null && typeof pText.content === 'string';
  const changedGeometry = 'w' in partial || 'h' in partial;
  const shouldRefit = !explicitFontSize && (changedContent || changedGeometry);

  return shouldRefit ? (refitText([sanitized])[0] ?? sanitized) : sanitized;
}
