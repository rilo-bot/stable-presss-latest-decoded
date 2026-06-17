// The browser side of the Studio Assistant's tools. The server declares these
// tools without an `execute`; the AI SDK streams each call here (via the panel's
// onToolCall), we run it against the client-only magazine draft, and return the
// result. Reads are direct; writes auto-apply when filling an EMPTY region and
// otherwise stage a preview the user approves.

import { useMagazineStore } from '@/stores/magazineStore';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';
import { BLUEPRINT_BY_TYPE, BLUEPRINTS } from '@/editor/templates/blueprints';
import { STOCK } from '@/editor/templates/helpers';
import type { Magazine, MagazinePage, TextStyle } from '@/types/magazine';
import { filledOf, previewOf, resolveCurrentPageId } from './editorContext';
import { applyPayload, computeAfter, uid, undoLast, scrollRegionIntoView } from './applyEdits';
import type { EditPayload, StagedEdit } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const arg = (input: unknown): Record<string, any> => (input ?? {}) as Record<string, any>;

// The tools executed IN THE BROWSER. Server-executed grounding tools
// (searchHorses/searchArticles/getHorseDossier) resolve server-side and must NOT
// be handled here — onToolCall checks this so we never double-resolve them.
export const EDITOR_CLIENT_TOOLS = new Set<string>([
  'getMagazine', 'getPage', 'getRegion', 'listTemplates', 'pageCatalog', 'suggestImageOptions', 'undoLastEdit',
  'setRegionText', 'setRegionImage', 'setRegionQr', 'patchRegionStyle', 'applyPageFill', 'clearRegion', 'setPageSelected',
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
    return { ok: false, error: `Region "${regionId}" doesn't exist on a ${page.pageType} page. Call getPage or pageCatalog for the real ids.` };
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
        regions: Object.entries(bp.defaultContent).map(([regionId, c]) => ({ regionId, kind: c.kind })),
      };
    }
    case 'suggestImageOptions':
      return { candidates: suggestImages(a.query) };
    case 'undoLastEdit':
      return undoLast() ? { ok: true, message: 'Reverted the last AI change.' } : { ok: false, message: 'Nothing to undo.' };
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
      regions: Object.entries(page.content).map(([regionId, c]) => ({ regionId, kind: c.kind, filled: filledOf(c), preview: previewOf(c, 140) })),
    };
  }
  if (toolName === 'getRegion') {
    const page = resolvePage(mag, a.pageId);
    const c = page?.content[String(a.regionId)];
    if (!page || !c) return { error: `Region "${a.regionId}" not found.` };
    return { regionId: a.regionId, pageId: page.id, kind: c.kind, filled: filledOf(c), preview: previewOf(c, 240) };
  }

  // ── writes ────────────────────────────────────────────────────────────────
  const page = resolvePage(mag, a.pageId);
  if (!page) return { ok: false, error: 'Page not found.' };

  // `review:true` (used for content drawn from an uploaded document) forces a
  // write to be staged for Apply/Discard rather than auto-applied into an empty region.
  const allowAuto = !a.review;

  switch (toolName) {
    case 'setRegionText':
      return writeRegion(mag, page, String(a.regionId), { kind: 'text', html: String(a.html ?? '') }, `Write “${a.regionId}”`, allowAuto);
    case 'setRegionImage':
      return writeRegion(
        mag,
        page,
        String(a.regionId),
        { kind: 'image', patch: { src: String(a.src ?? ''), ...(a.fit ? { fit: a.fit } : {}), ...(a.alt ? { alt: String(a.alt) } : {}) } },
        `Set photo on “${a.regionId}”`,
        allowAuto,
      );
    case 'setRegionQr': {
      const url = String(a.targetUrl ?? '');
      if (!/^https:\/\//i.test(url) && !/^mailto:/i.test(url)) return { ok: false, error: 'QR target must be an https: or mailto: URL.' };
      return writeRegion(mag, page, String(a.regionId), { kind: 'qr', patch: { targetUrl: url, ...(a.fg ? { fg: String(a.fg) } : {}) } }, `Set QR on “${a.regionId}”`, allowAuto);
    }
    case 'patchRegionStyle':
      return writeRegion(mag, page, String(a.regionId), { kind: 'style', patch: (a.style ?? {}) as Partial<TextStyle> }, `Restyle “${a.regionId}”`, false);
    case 'clearRegion': {
      const c = page.content[String(a.regionId)];
      if (!c) return { ok: false, error: `Region "${a.regionId}" not found.` };
      return writeRegion(mag, page, String(a.regionId), { kind: 'clear', targetKind: c.kind }, `Clear “${a.regionId}”`, false);
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
        const rid = String(e.regionId);
        const before = page.content[rid];
        if (!before || before.kind !== e.kind) {
          skipped.push(rid);
          continue;
        }
        let payload: EditPayload | null = null;
        if (e.kind === 'text') payload = { kind: 'text', html: String(e.html ?? '') };
        else if (e.kind === 'image') payload = { kind: 'image', patch: { src: String(e.src ?? '') } };
        else if (e.kind === 'qr') payload = { kind: 'qr', patch: { targetUrl: String(e.targetUrl ?? '') } };
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
          summary: `Fill “${rid}”`,
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
