// Client side of the bulk "fill the bulletin from this document" flow. Called by
// the fillMagazineFromDocument tool: it builds a region catalog of the open
// magazine, sends it + the document's full text to POST /api/agent/editor/compose,
// then RE-VALIDATES the returned plan against the live draft and stages it through
// the existing staging machinery — one batch (card) per page — so the user reviews
// and Applies page by page. Nothing is auto-applied; everything is staged.

import { useMagazineStore } from '@/stores/magazineStore';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';
import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { sanitizeRichText } from '@/editor/lib/sanitize';
import { isKnownIcon } from '@/editor/templates/iconRegistry';
import { filledOf, previewOf } from './editorContext';
import { computeAfter, uid } from './applyEdits';
import type { EditPayload, StagedEdit } from './types';
import type { Magazine } from '@/types/magazine';

interface ComposeEntry { pageId: string; regionId: string; kind: 'text' | 'qr' | 'icon'; html?: string; targetUrl?: string; iconName?: string; reason?: string }
interface ComposeResponse { plan: ComposeEntry[]; coverageNote: string; unplacedFacts: string[]; groupsOk: number; groupsFailed: number }

const COMPOSE_TIMEOUT_MS = 180_000;

function editablePageIds(magId: string): string[] | 'all' {
  return useMagazineStore.getState().getAccess(magId)?.editablePageIds ?? 'all';
}
function isEditable(magId: string, pageId: string): boolean {
  const ed = editablePageIds(magId);
  return ed === 'all' || ed.includes(pageId);
}

/** Full text/qr region catalog of the open magazine's editable pages. */
function buildCatalog(mag: Magazine) {
  return mag.pages
    .filter((p) => isEditable(mag.id, p.id))
    .map((p) => ({
      pageId: p.id,
      pageType: p.pageType,
      label: p.label,
      editable: true,
      regions: Object.entries(p.content)
        .filter(([, c]) => c.kind === 'text' || c.kind === 'qr' || c.kind === 'icon')
        .map(([regionId, c]) => ({
          regionId,
          kind: c.kind,
          name: regionId.split('.').pop() ?? regionId,
          filled: filledOf(c),
          preview: previewOf(c, 80),
        })),
    }))
    .filter((p) => p.regions.length > 0);
}

/** Document sources: verbatim full text, falling back to the digest for vision-only docs. */
function sources(): { name: string; text: string }[] {
  return useEditorAgentUi
    .getState()
    .attachments.map((a) => {
      const base =
        a.fullText && a.fullText.trim()
          ? a.fullText
          : [a.digest?.summary, ...(a.digest?.sections ?? []).map((s) => `${s.heading}: ${s.body}`), ...(a.digest?.facts ?? [])]
              .filter(Boolean)
              .join('\n');
      // Detected icons live in the digest (vision), not the verbatim text — append
      // them so the text-only compose pass can map them onto icon regions.
      const icons = a.digest?.icons ?? [];
      const iconsLine = icons.length ? `\n\nDetected icons: ${icons.map((ic) => `${ic.label} → ${ic.name}`).join(', ')}` : '';
      return { name: a.name, text: `${base}${iconsLine}` };
    })
    .filter((s) => s.text.trim().length > 0);
}

export async function runComposeFill(instruction: string): Promise<Record<string, unknown>> {
  const ms = useMagazineStore.getState();
  const mag = ms.currentId ? ms.getMagazine(ms.currentId) : undefined;
  if (!mag) return { ok: false, error: 'No magazine is open.' };

  const srcs = sources();
  if (srcs.length === 0) return { ok: false, error: 'There is no uploaded document to fill from — ask the user to attach one (the paperclip) first.' };

  const pages = buildCatalog(mag);
  if (pages.length === 0) return { ok: false, error: 'There are no editable pages to fill.' };

  const token = useAuthStore.getState().token;
  let resp: ComposeResponse;
  try {
    const res = await fetch(apiUrl('/api/agent/editor/compose'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ userPrompt: instruction, sources: srcs, pages }),
      signal: AbortSignal.timeout(COMPOSE_TIMEOUT_MS),
    });
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: e.error || `Compose failed (${res.status}).` };
    }
    resp = (await res.json()) as ComposeResponse;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') return { ok: false, error: 'The fill took too long — try again, or use a shorter document.' };
    return { ok: false, error: 'Could not reach the assistant to compose the layout.' };
  }

  // Re-validate every entry against the LIVE draft and stage one batch per page.
  const staged: StagedEdit[] = [];
  const perPage = new Map<string, string>();
  let skipped = 0;
  let pagesTouched = 0;

  for (const e of resp.plan ?? []) {
    const page = mag.pages.find((p) => p.id === e.pageId);
    const before = page?.content[e.regionId];
    if (!page || !before || !isEditable(mag.id, page.id)) { skipped++; continue; }

    let payload: EditPayload | null = null;
    if (e.kind === 'text' && before.kind === 'text' && e.html && e.html.trim()) {
      payload = { kind: 'text', html: sanitizeRichText(e.html) };
    } else if (e.kind === 'qr' && before.kind === 'qr') {
      const u = (e.targetUrl || '').trim();
      if (/^https:\/\//i.test(u) || /^mailto:/i.test(u)) payload = { kind: 'qr', patch: { targetUrl: u } };
    } else if (e.kind === 'icon' && before.kind === 'icon') {
      const n = (e.iconName || '').trim();
      if (isKnownIcon(n)) payload = { kind: 'icon', patch: { name: n, src: undefined } };
    }
    if (!payload) { skipped++; continue; }

    let batchId = perPage.get(page.id);
    if (!batchId) { batchId = uid('compose'); perPage.set(page.id, batchId); pagesTouched++; }
    staged.push({
      id: uid(),
      magId: mag.id,
      pageId: page.id,
      pageLabel: page.label,
      regionId: e.regionId,
      payload,
      before,
      afterPreview: computeAfter(before, payload),
      summary: `Fill “${e.regionId.split('.').pop()}”`,
      batchId,
    });
  }

  if (staged.length === 0) {
    return {
      ok: false,
      staged: 0,
      error: "I read the document but couldn't confidently map it onto these pages. Tell me which pages or sections to focus on and I'll try again.",
      coverageNote: resp.coverageNote,
      unplacedFacts: resp.unplacedFacts,
      groupsFailed: resp.groupsFailed,
    };
  }

  useEditorAgentUi.getState().addStaged(staged);
  return {
    ok: true,
    staged: staged.length,
    pagesTouched,
    skipped,
    coverageNote: resp.coverageNote,
    unplacedFacts: resp.unplacedFacts,
    groupsFailed: resp.groupsFailed,
    note: `Staged ${staged.length} edits across ${pagesTouched} page(s), shown as one card per page in the Review & apply panel. Tell the user warmly what you placed and that they should review and Apply (or Discard) page by page — and to apply in batches, since a full-bulletin apply is large.`,
  };
}
