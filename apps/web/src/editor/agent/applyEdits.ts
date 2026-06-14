// Applies AI edits to the magazine draft via the SAME magazineStore actions a
// human uses (setText/setImage/setQr/setTextStyle), and maintains the undo stack.
// Text writes blur the editor first (select(null)) so the uncontrolled
// contentEditable re-syncs from the store. Apply-time re-reads the current
// content for the undo snapshot, so undo is correct even if the region changed
// since the edit was proposed.

import { useMagazineStore } from '@/stores/magazineStore';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';
import { sanitizeRichText } from '@/editor/lib/sanitize';
import type { RegionContent } from '@/types/magazine';
import type { EditPayload, StagedEdit, UndoEntry } from './types';

export function uid(prefix = 'e'): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * If the user is actively typing in THIS region's contentEditable, blur it so
 * EditableText re-syncs the DOM from the store after our write. We blur only the
 * target node (matched by data-region-id), never the chat input or other fields.
 * EditableText only writes store→DOM when its own node is unfocused (see
 * components/EditableText.tsx), so without this an AI edit to the focused region
 * would persist to the store but not appear until the user clicked away.
 */
function blurRegionIfActive(regionId: string): void {
  if (typeof document === 'undefined') return;
  const el = document.querySelector<HTMLElement>(`[data-region-id="${CSS.escape(regionId)}"]`);
  if (el && document.activeElement === el) el.blur();
}

/**
 * Bring an edited region/page into view so the user actually SEES the change
 * (without this, edits to an off-screen/zoomed page look like "nothing happened").
 * Deferred a frame so the DOM has re-synced from the store first.
 */
export function scrollRegionIntoView(pageId: string, regionId?: string): void {
  if (typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    const target =
      (regionId ? document.querySelector<HTMLElement>(`[data-region-id="${CSS.escape(regionId)}"]`) : null) ??
      document.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(pageId)}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

export function regionContentOf(magId: string, pageId: string, regionId: string): RegionContent | undefined {
  const m = useMagazineStore.getState().getMagazine(magId);
  return m?.pages.find((p) => p.id === pageId)?.content[regionId];
}

/** Project what a region will look like after a payload — for the preview card. */
export function computeAfter(before: RegionContent, payload: EditPayload): RegionContent {
  switch (payload.kind) {
    case 'text':
      return before.kind === 'text' ? { ...before, html: sanitizeRichText(payload.html) } : before;
    case 'image':
      return before.kind === 'image' ? { ...before, ...payload.patch } : before;
    case 'qr':
      return before.kind === 'qr' ? { ...before, ...payload.patch } : before;
    case 'style':
      return before.kind === 'text' ? { ...before, style: { ...before.style, ...payload.patch } } : before;
    case 'clear':
      if (before.kind === 'text') return { ...before, html: '' };
      if (before.kind === 'image') return { ...before, src: '' };
      return { ...before, targetUrl: '' };
  }
}

/** Perform one payload against the store; returns the pre-edit snapshot (for undo). */
export function applyPayload(
  magId: string,
  pageId: string,
  regionId: string,
  payload: EditPayload,
): RegionContent | null {
  const ms = useMagazineStore.getState();
  const before = regionContentOf(magId, pageId, regionId) ?? null;
  blurRegionIfActive(regionId); // re-sync the DOM if the user is typing in this region
  switch (payload.kind) {
    case 'text':
      ms.setText(magId, pageId, regionId, payload.html);
      break;
    case 'image':
      ms.setImage(magId, pageId, regionId, payload.patch);
      break;
    case 'qr':
      ms.setQr(magId, pageId, regionId, payload.patch);
      break;
    case 'style':
      ms.setTextStyle(magId, pageId, regionId, payload.patch);
      break;
    case 'clear':
      if (payload.targetKind === 'text') ms.setText(magId, pageId, regionId, '');
      else if (payload.targetKind === 'image') ms.setImage(magId, pageId, regionId, { src: '' });
      else ms.setQr(magId, pageId, regionId, { targetUrl: '' });
      break;
  }
  return before;
}

/** Restore a region to a captured content snapshot (used by undo). */
function restoreContent(magId: string, pageId: string, regionId: string, content: RegionContent): void {
  const ms = useMagazineStore.getState();
  blurRegionIfActive(regionId);
  if (content.kind === 'text') {
    ms.setText(magId, pageId, regionId, content.html);
    ms.setTextStyle(magId, pageId, regionId, content.style);
  } else if (content.kind === 'image') {
    ms.setImage(magId, pageId, regionId, {
      src: content.src,
      fit: content.fit,
      focalX: content.focalX,
      focalY: content.focalY,
      alt: content.alt,
    });
  } else {
    ms.setQr(magId, pageId, regionId, { targetUrl: content.targetUrl, fg: content.fg, bg: content.bg });
  }
}

/** Apply a staged edit, record undo, remove it from the buffer. */
export function applyStagedEdit(edit: StagedEdit): void {
  const before = applyPayload(edit.magId, edit.pageId, edit.regionId, edit.payload);
  const ui = useEditorAgentUi.getState();
  if (before) {
    const entry: UndoEntry = {
      id: uid('u'),
      magId: edit.magId,
      pageId: edit.pageId,
      regionId: edit.regionId,
      before,
      summary: edit.summary,
    };
    ui.pushUndo(entry);
  }
  ui.removeStaged(edit.id);
  scrollRegionIntoView(edit.pageId, edit.regionId);
}

export function applyAllStaged(): void {
  const staged = [...useEditorAgentUi.getState().staged];
  for (const e of staged) applyStagedEdit(e);
}

export function applyBatch(batchId: string): void {
  const staged = useEditorAgentUi.getState().staged.filter((e) => e.batchId === batchId);
  for (const e of staged) applyStagedEdit(e);
}

export const discardStaged = (id: string) => useEditorAgentUi.getState().removeStaged(id);
export const discardBatch = (batchId: string) => useEditorAgentUi.getState().removeBatch(batchId);
export const discardAll = () => useEditorAgentUi.getState().clearStaged();

/** Undo the most recent applied edit. Returns false if there was nothing to undo. */
export function undoLast(): boolean {
  const entry = useEditorAgentUi.getState().popUndo();
  if (!entry) return false;
  restoreContent(entry.magId, entry.pageId, entry.regionId, entry.before);
  scrollRegionIntoView(entry.pageId, entry.regionId);
  return true;
}
