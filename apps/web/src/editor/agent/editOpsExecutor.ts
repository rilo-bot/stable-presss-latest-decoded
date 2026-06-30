// The browser side of the Studio Assistant's tools. The server declares these
// tools without an `execute`; the AI SDK streams each call here (via the panel's
// onToolCall), we run it against the client-only magazine draft, and return the
// result. Reads are direct; writes auto-apply when filling an EMPTY region and
// otherwise stage a preview the user approves.

import { useMagazineStore } from '@/stores/magazineStore';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';
import { BLUEPRINT_BY_TYPE, BLUEPRINTS } from '@/editor/templates/blueprints';
import { STOCK } from '@/editor/templates/helpers';
import { isKnownIcon } from '@/editor/templates/iconRegistry';
import { regionDisplayName, findRegionIdByName } from '@/editor/templates/regionNames';
import type { Magazine, MagazinePage, TextStyle, RegionKind } from '@/types/magazine';
import { filledOf, previewOf, resolveCurrentPageId } from './editorContext';
import { applyPayload, computeAfter, uid, undoLast, scrollRegionIntoView } from './applyEdits';
import { runComposeFill } from './composeExecutor';
import type { EditPayload, StagedEdit } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const arg = (input: unknown): Record<string, any> => (input ?? {}) as Record<string, any>;

// The tools executed IN THE BROWSER. Server-executed grounding tools
// (searchHorses/searchArticles/getHorseDossier) resolve server-side and must NOT
// be handled here — onToolCall checks this so we never double-resolve them.
export const EDITOR_CLIENT_TOOLS = new Set<string>([
  'getMagazine', 'getPage', 'getRegion', 'listTemplates', 'pageCatalog', 'suggestImageOptions', 'undoLastEdit',
  'setRegionText', 'setRegionImage', 'setRegionQr', 'setRegionIcon', 'patchRegionStyle', 'applyPageFill', 'clearRegion', 'setPageSelected',
  'fillMagazineFromDocument',
]);
export const isEditorClientTool = (name: string): boolean => EDITOR_CLIENT_TOOLS.has(name);

function currentMag(): Magazine | undefined {
  const ms = useMagazineStore.getState();
  return ms.currentId ? ms.getMagazine(ms.currentId) : undefined;
}

function resolvePage(mag: Magazine, pageId?: string): MagazinePage | undefined {
  const id = pageId || resolveCurrentPageId(mag) || mag.pages[0]?.id;
  return mag.pages.find((p) => p.id === id);
}

/**
 * Resolve a region reference (an exact region id OR a friendly name like
 * "Hero photo") to the real region id on a page. Falls back to the raw ref so
 * the caller still produces a clear "region not found" error for the AI.
 * Pass `kind` when known so a name only resolves to a same-kind slot.
 */
function resolveRegionRef(page: MagazinePage, ref: string, kind?: RegionKind): string {
  if (page.content[ref]) return ref;
  return findRegionIdByName(page.content, ref, kind) ?? ref;
}

function isEditable(mag: Magazine, pageId: string): boolean {
  const ed = useMagazineStore.getState().getAccess(mag.id)?.editablePageIds ?? 'all';
  return ed === 'all' || ed.includes(pageId);
}

function pageIndex(mag: Magazine) {
  return mag.pages.map((p) => {
    const regions = Object.values(p.content);
    return {
      pageId: p.id,
      pageType: p.pageType,
      label: p.label,
      number: p.number,
      filledCount: regions.filter(filledOf).length,
      totalRegions: regions.length,
      editable: isEditable(mag, p.id),
    };
  });
}

function autoApply(magId: string, pageId: string, regionId: string, payload: EditPayload, summary: string) {
  const before = applyPayload(magId, pageId, regionId, payload);
  if (before) {
    useEditorAgentUi.getState().pushUndo({ id: uid('u'), magId, pageId, regionId, before, summary });
  }
  scrollRegionIntoView(pageId, regionId);
}

function stage(edit: StagedEdit) {
  useEditorAgentUi.getState().addStaged([edit]);
}

/** Validate + write one region: auto-apply if empty & allowed, else stage. */
function writeRegion(
  mag: Magazine,
  page: MagazinePage,
  regionId: string,
  payload: EditPayload,
  summary: string,
  allowAuto: boolean,
): Record<string, unknown> {
  if (!isEditable(mag, page.id)) {
    return { ok: false, reason: 'not-editable', message: `The page "${page.label}" isn't shared with you to edit.` };
  }
  const before = page.content[regionId];
  if (!before) {
    return { ok: false, error: `No region matches "${regionId}" on a ${page.pageType} page. Call getPage or pageCatalog for the real region ids and names.` };
  }
  const needKind = payload.kind === 'style' ? 'text' : payload.kind === 'clear' ? before.kind : payload.kind;
  if (before.kind !== needKind) {
    return { ok: false, error: `Region "${regionId}" is ${before.kind}, not ${needKind}.` };
  }
  const empty = !filledOf(before);
  if (allowAuto && empty) {
    autoApply(mag.id, page.id, regionId, payload, summary);
    return { ok: true, applied: true, regionId, note: 'Filled an empty region — applied instantly (undoable).' };
  }
  stage({
    id: uid(),
    magId: mag.id,
    pageId: page.id,
    pageLabel: page.label,
    regionId,
    payload,
    before,
    afterPreview: computeAfter(before, payload),
    summary,
  });
  return { staged: true, regionId, summary, note: 'Staged for the user to review and Apply.' };
}

/**
 * Resolve an image `src` the AI passed for an UPLOADED image. The assistant
 * addresses a user-uploaded photo as `upload:<attachmentId>` (or the bare id);
 * we map that to the image's persisted URL so the staged edit — and the applied
 * region — carry a real, durable URL instead of an unresolvable ref or an
 * ephemeral vision data-URL. Returns null when an `upload:` ref doesn't match a
 * known uploaded image (so the caller can tell the AI to ask for a re-upload);
 * any non-upload src (e.g. a stock URL) passes through unchanged.
 */
function resolveImageSrc(src: string): string | null {
  const isRef = src.startsWith('upload:');
  const ref = isRef ? src.slice('upload:'.length) : src;
  const att = useEditorAgentUi.getState().attachments.find((a) => a.id === ref && a.uploadedUrl);
  if (att?.uploadedUrl) return att.uploadedUrl;
  return isRef ? null : src;
}

function suggestImages(query?: string): Array<{ name: string; url: string }> {
  const entries = Object.entries(STOCK);
  const q = (query ?? '').toLowerCase().trim();
  const ranked = q
    ? entries
        .map(([name, url]) => ({ name, url, score: q.split(/\s+/).filter(Boolean).reduce((s, t) => s + (name.toLowerCase().includes(t) ? 1 : 0), 0) }))
        .sort((a, b) => b.score - a.score)
    : entries.map(([name, url]) => ({ name, url, score: 0 }));
  const top = (ranked.some((r) => r.score > 0) ? ranked.filter((r) => r.score > 0) : ranked).slice(0, 6);
  return top.map(({ name, url }) => ({ name, url }));
}

export async function executeEditorTool(toolName: string, input: unknown): Promise<unknown> {
  const a = arg(input);
  const mag = currentMag();

  // Reads / writes that don't strictly need a page resolve a page lazily below.
  switch (toolName) {
    // ── reads ──────────────────────────────────────────────────────────────
    case 'getMagazine': {
      if (!mag) return { error: 'No magazine is open.' };
      const ms = useMagazineStore.getState();
      const access = ms.getAccess(mag.id);
      return {
        magazine: { id: mag.id, title: mag.title, edition: mag.edition, status: mag.status, myRole: access?.role ?? 'owner', editable: access?.editablePageIds ?? 'all' },
        currentPageId: resolveCurrentPageId(mag),
        pages: pageIndex(mag),
      };
    }
    case 'listTemplates':
      return { templates: BLUEPRINTS.map((b) => ({ pageType: b.pageType, label: b.label })) };
    case 'pageCatalog': {
      const bp = BLUEPRINT_BY_TYPE[String(a.pageType)];
      if (!bp) return { error: `Unknown page type "${a.pageType}".` };
      return {
        pageType: bp.pageType,
        label: bp.label,
        regions: Object.entries(bp.defaultContent).map(([regionId, c]) => ({ regionId, name: regionDisplayName(regionId), kind: c.kind })),
      };
    }
    case 'suggestImageOptions':
      return { candidates: suggestImages(a.query) };
    case 'undoLastEdit':
      return undoLast() ? { ok: true, message: 'Reverted the last AI change.' } : { ok: false, message: 'Nothing to undo.' };
    case 'fillMagazineFromDocument':
      return runComposeFill(String(a.instruction ?? ''));
  }

  if (!mag) return { ok: false, error: 'No magazine is open.' };

  if (toolName === 'getPage') {
    const page = resolvePage(mag, a.pageId);
    if (!page) return { error: 'Page not found.' };
    return {
      pageId: page.id,
      pageType: page.pageType,
      label: page.label,
      number: page.number,
      editable: isEditable(mag, page.id),
      regions: Object.entries(page.content).map(([regionId, c]) => ({ regionId, name: regionDisplayName(regionId), kind: c.kind, filled: filledOf(c), preview: previewOf(c, 140) })),
    };
  }
  if (toolName === 'getRegion') {
    const page = resolvePage(mag, a.pageId);
    const regionId = page ? resolveRegionRef(page, String(a.regionId)) : String(a.regionId);
    const c = page?.content[regionId];
    if (!page || !c) return { error: `Region "${a.regionId}" not found.` };
    return { regionId, name: regionDisplayName(regionId), pageId: page.id, kind: c.kind, filled: filledOf(c), preview: previewOf(c, 240) };
  }

  // ── writes ────────────────────────────────────────────────────────────────
  const page = resolvePage(mag, a.pageId);
  if (!page) return { ok: false, error: 'Page not found.' };

  // `review:true` (used for content drawn from an uploaded document) forces a
  // write to be staged for Apply/Discard rather than auto-applied into an empty region.
  const allowAuto = !a.review;

  // Accept either an exact region id or the friendly NAME the user/AI saw. Pass
  // the expected kind so a name resolves to the right-kind slot (never an image
  // phrase landing on a text region).
  const regionRef = String(a.regionId ?? '');
  const named = (kind?: RegionKind) => {
    const id = resolveRegionRef(page, regionRef, kind);
    return { id, name: regionDisplayName(id) };
  };

  switch (toolName) {
    case 'setRegionText': {
      const r = named('text');
      return writeRegion(mag, page, r.id, { kind: 'text', html: String(a.html ?? '') }, `Write “${r.name}”`, allowAuto);
    }
    case 'setRegionImage': {
      const r = named('image');
      const raw = String(a.src ?? '');
      if (!raw.trim()) return { ok: false, error: 'No image provided. Pass the uploaded image as src "upload:<id>", use suggestImageOptions for a stock URL, or clearRegion to empty a photo.' };
      const src = resolveImageSrc(raw);
      if (src === null) return { ok: false, error: `No uploaded image matches "${raw}". The user must upload that image first; uploaded images appear in your context as upload:<id>.` };
      return writeRegion(
        mag,
        page,
        r.id,
        { kind: 'image', patch: { src, ...(a.fit ? { fit: a.fit } : {}), ...(a.alt ? { alt: String(a.alt) } : {}) } },
        `Set photo on “${r.name}”`,
        allowAuto,
      );
    }
    case 'setRegionQr': {
      const r = named('qr');
      const url = String(a.targetUrl ?? '');
      if (!/^https:\/\//i.test(url) && !/^mailto:/i.test(url)) return { ok: false, error: 'QR target must be an https: or mailto: URL.' };
      return writeRegion(mag, page, r.id, { kind: 'qr', patch: { targetUrl: url, ...(a.fg ? { fg: String(a.fg) } : {}) } }, `Set QR on “${r.name}”`, allowAuto);
    }
    case 'setRegionIcon': {
      const r = named('icon');
      const name = String(a.name ?? '');
      if (!isKnownIcon(name)) return { ok: false, error: `Unknown icon "${name}". Use a known Lucide name (PascalCase), e.g. Trophy, Star, Mail, Award.` };
      return writeRegion(mag, page, r.id, { kind: 'icon', patch: { name, src: undefined, ...(a.color ? { color: String(a.color) } : {}) } }, `Set icon on “${r.name}”`, allowAuto);
    }
    case 'patchRegionStyle': {
      const r = named('text');
      return writeRegion(mag, page, r.id, { kind: 'style', patch: (a.style ?? {}) as Partial<TextStyle> }, `Restyle “${r.name}”`, false);
    }
    case 'clearRegion': {
      const id = resolveRegionRef(page, regionRef);
      const c = page.content[id];
      if (!c) return { ok: false, error: `No region matches "${regionRef}". Call getPage for the real region names and ids.` };
      return writeRegion(mag, page, id, { kind: 'clear', targetKind: c.kind }, `Clear “${regionDisplayName(id)}”`, false);
    }
    case 'setPageSelected':
      if (!isEditable(mag, page.id)) return { ok: false, message: "That page isn't shared with you." };
      useMagazineStore.getState().setPageSelected(mag.id, page.id, !!a.selected);
      return { ok: true, applied: true, selected: !!a.selected };
    case 'applyPageFill': {
      if (!isEditable(mag, page.id)) return { ok: false, reason: 'not-editable', message: `The page "${page.label}" isn't shared with you to edit.` };
      const edits = Array.isArray(a.edits) ? a.edits : [];
      const batchId = uid('b');
      const staged: StagedEdit[] = [];
      const skipped: string[] = [];
      for (const e of edits) {
        const rid = resolveRegionRef(page, String(e.regionId), e.kind as RegionKind);
        const before = page.content[rid];
        if (!before || before.kind !== e.kind) {
          skipped.push(rid);
          continue;
        }
        let payload: EditPayload | null = null;
        if (e.kind === 'text') payload = { kind: 'text', html: String(e.html ?? '') };
        else if (e.kind === 'image') {
          const src = resolveImageSrc(String(e.src ?? ''));
          if (src) payload = { kind: 'image', patch: { src } };
        }
        else if (e.kind === 'qr') payload = { kind: 'qr', patch: { targetUrl: String(e.targetUrl ?? '') } };
        else if (e.kind === 'icon' && isKnownIcon(String(e.name ?? ''))) payload = { kind: 'icon', patch: { name: String(e.name), src: undefined } };
        if (!payload) {
          skipped.push(rid);
          continue;
        }
        staged.push({
          id: uid(),
          magId: mag.id,
          pageId: page.id,
          pageLabel: page.label,
          regionId: rid,
          payload,
          before,
          afterPreview: computeAfter(before, payload),
          summary: `Fill “${regionDisplayName(rid)}”`,
          batchId,
        });
      }
      if (staged.length === 0) return { ok: false, error: 'No valid regions to fill.', skipped };
      useEditorAgentUi.getState().addStaged(staged);
      return { staged: true, batchId, count: staged.length, skipped, note: `Staged a ${staged.length}-region fill on "${page.label}" — review and Apply.` };
    }
  }

  return { ok: false, error: `Unknown tool "${toolName}".` };
}
