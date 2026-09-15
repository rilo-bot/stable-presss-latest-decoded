// ---------------------------------------------------------------------------
// Magazine Builder v2 — "Copy a page exactly" (the verbatim door).
//
// The SIBLING of LayoutReference, and the two are kept apart on purpose because
// they disagree about the one question that matters to the person pressing them:
//
//   LayoutReference   takes a reference's ARRANGEMENT and writes this magazine's
//                     own copy into it. The reference's words never come across —
//                     that rule is what stops us reprinting someone else's title.
//   this panel        takes the PAGE. Its real text, at its measured size, in its
//                     own colours, over its own artwork.
//
// One control offering both as a mode was the tempting shape and it is the wrong
// one: "make this page like that" is genuinely ambiguous, and a mode is a setting
// people do not read. Two buttons make the choice at the moment of acting.
//
// Only a PDF can be copied. A picture has no text layer to reconstruct and a Word
// file has no page — `canCopyLayout` on the server says the same, so the picker
// never offers what the server would refuse.
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { toast } from 'sonner';
import { useEditorStore } from './store';
import { PdfPagePicker } from './PdfPagePicker';
import * as api from './api';

export function CopyDocumentPage() {
  const issueId = useEditorStore((s) => s.issueId);
  const currentPageId = useEditorStore((s) => s.currentPageId);
  const pages = useEditorStore((s) => s.pages);
  const [busy, setBusy] = useState(false);

  const run = async (docId: string, sourcePage: number) => {
    if (!issueId || !currentPageId) return;
    const n = pages.findIndex((p) => p.id === currentPageId) + 1;
    // THE CONFIRM NAMES BOTH PAGES AND THE RESHAPE. This replaces every element and
    // cannot be undone, and it also re-shapes the page to the source's proportions —
    // which is what copying means, but is not what anyone expects unless told.
    const ok = window.confirm(
      `Copy page ${sourcePage} of that PDF onto page ${n > 0 ? n : '?'}?\n\n` +
        `This page's current contents are replaced with that page's own text, pictures and colours — it cannot be undone. ` +
        `The page also takes on the source page's shape, so it may end up a different size from the rest of the magazine.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const { from } = await api.copyDocumentPage(issueId, currentPageId, { docId, sourcePage });
      // The rebuild runs in the worker, so there is nothing to show yet. Say what was
      // STARTED rather than implying it is done — the studio's poll brings the page in.
      toast.success(`Copying page ${from.sourcePage} of “${from.name}” — it will appear here shortly.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That page could not be copied.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <PdfPagePicker
        disabled={busy || !currentPageId}
        actionLabel={busy ? 'Starting…' : 'Copy onto this page'}
        emptyNote="No PDF attached to this magazine yet. Attach one in the chat, or add it when creating the magazine, and you can reproduce any of its pages here exactly."
        onRead={(docId, pageNo) => void run(docId, pageNo)}
      />
      <p className="text-ui-sm text-studio-ink-4">
        An exact reproduction — the PDF page's own words, pictures and colours, as editable elements.
        For its <b className="text-studio-ink-3">design only</b>, with copy written for your magazine, use Match a layout above.
      </p>
    </div>
  );
}
