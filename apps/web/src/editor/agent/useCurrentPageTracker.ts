// Tracks which magazine page is most in view (for page-aware context + the 3
// floating suggestions) by observing [data-page-id] elements inside the canvas
// scroll container.

import { useEffect, type RefObject } from 'react';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';

export function useCurrentPageTracker(
  scrollRef: RefObject<HTMLElement | null>,
  magazineId: string,
  pageCount: number,
): void {
  const setCurrentPage = useEditorAgentUi((s) => s.setCurrentPage);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-page-id]'));
    if (els.length === 0) return;

    const ratios = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.pageId;
          if (id) ratios.set(id, e.intersectionRatio);
        }
        let best: string | null = null;
        let bestR = -1;
        for (const [id, r] of ratios) if (r > bestR) ((bestR = r), (best = id));
        if (best) setCurrentPage(best);
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // Re-attach when the page set changes (pages render after load).
  }, [scrollRef, magazineId, pageCount, setCurrentPage]);
}
