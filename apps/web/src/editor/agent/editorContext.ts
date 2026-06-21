// Builds the compact EditorContext blob sent to the server each chat turn, so
// the assistant knows the open magazine, the current page in full, and a light
// index of the other pages — without shipping all 24 full region maps.

import { useMagazineStore } from '@/stores/magazineStore';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';
import { toPlainText } from '@/editor/lib/sanitize';
import type { Magazine, MagazinePage, RegionContent } from '@/types/magazine';
import type { CtxRegion, EditorContextBlob } from './types';

export function filledOf(c: RegionContent): boolean {
  if (c.kind === 'text') return toPlainText(c.html).trim() !== '';
  if (c.kind === 'image') return (c.src ?? '').trim() !== '';
  if (c.kind === 'icon') return !!((c.name ?? '').trim() || (c.src ?? '').trim());
  return (c.targetUrl ?? '').trim() !== '';
}

export function previewOf(c: RegionContent, max = 80): string {
  if (c.kind === 'text') {
    const t = toPlainText(c.html).trim();
    return t ? (t.length > max ? t.slice(0, max) + '…' : t) : '(empty)';
  }
  if (c.kind === 'image') return c.src ? 'image set' : '(empty)';
  if (c.kind === 'icon') return c.src ? 'custom icon' : c.name ? `icon: ${c.name}` : '(empty)';
  return c.targetUrl ? c.targetUrl : '(empty)';
}

function regionsOf(page: MagazinePage): CtxRegion[] {
  return Object.entries(page.content).map(([regionId, c]) => ({
    regionId,
    kind: c.kind,
    filled: filledOf(c),
    preview: previewOf(c),
  }));
}

/** The page the editor is viewing — tracker value, else selected region's page, else first. */
export function resolveCurrentPageId(mag: Magazine | undefined): string | null {
  if (!mag) return null;
  const tracked = useEditorAgentUi.getState().currentPageId;
  if (tracked && mag.pages.some((p) => p.id === tracked)) return tracked;
  const ms = useMagazineStore.getState();
  const selPage = ms.selectedPageId;
  if (selPage && mag.pages.some((p) => p.id === selPage)) return selPage;
  const sel = ms.selectedRegionId;
  if (sel) {
    const page = mag.pages.find((p) => sel in p.content);
    if (page) return page.id;
  }
  return mag.pages[0]?.id ?? null;
}

export function buildEditorContext(): EditorContextBlob {
  const ms = useMagazineStore.getState();
  // Digest only in context (compact); the heavy fullText is sent separately to /compose.
  const attachments = useEditorAgentUi.getState().attachments.map((a) => ({ id: a.id, name: a.name, kind: a.kind, digest: a.digest }));
  const magId = ms.currentId;
  const mag = magId ? ms.getMagazine(magId) : undefined;
  if (!mag) return { magazine: null, currentPage: null, selection: null, otherPages: [], attachments };

  const access = ms.getAccess(mag.id);
  const editable = access?.editablePageIds ?? 'all';
  const isEditable = (pageId: string) => editable === 'all' || editable.includes(pageId);

  const currentPageId = resolveCurrentPageId(mag);
  const currentPage = mag.pages.find((p) => p.id === currentPageId) ?? null;

  const selRegionId = ms.selectedRegionId;
  const selContent = currentPage && selRegionId ? currentPage.content[selRegionId] : undefined;

  return {
    magazine: {
      id: mag.id,
      title: mag.title,
      edition: mag.edition,
      status: mag.status,
      pageCount: mag.pages.length,
      myRole: access?.role ?? 'owner',
      editable,
    },
    currentPage: currentPage
      ? {
          pageId: currentPage.id,
          pageType: currentPage.pageType,
          label: currentPage.label,
          number: currentPage.number,
          editable: isEditable(currentPage.id),
          regions: regionsOf(currentPage),
        }
      : null,
    selection: selContent
      ? { regionId: selRegionId as string, kind: selContent.kind, filled: filledOf(selContent) }
      : null,
    otherPages: mag.pages
      .filter((p) => p.id !== currentPageId)
      .map((p) => {
        const regions = regionsOf(p);
        return {
          pageId: p.id,
          pageType: p.pageType,
          label: p.label,
          number: p.number,
          filledCount: regions.filter((r) => r.filled).length,
          totalRegions: regions.length,
          editable: isEditable(p.id),
        };
      }),
    attachments,
  };
}
