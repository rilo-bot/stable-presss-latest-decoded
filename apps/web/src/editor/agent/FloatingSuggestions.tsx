// The always-3 floating suggestion chips, pinned to the canvas. Heuristics show
// instantly and update as the page fills; a debounced model call upgrades them.
// Clicking a chip opens the panel and seeds the question.

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useMagazineStore } from '@/stores/magazineStore';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';
import { heuristicForCurrent, fetchModelSuggestions } from './suggestions';
import type { SuggestionChip } from './types';

export function FloatingSuggestions({ magazineId }: { magazineId: string }) {
  const mag = useMagazineStore((s) => s.magazines.find((m) => m.id === magazineId));
  const currentPageId = useEditorAgentUi((s) => s.currentPageId);
  const open = useEditorAgentUi((s) => s.open);
  const ask = useEditorAgentUi((s) => s.ask);

  const [chips, setChips] = useState<SuggestionChip[]>([]);

  // Heuristic chips — instant, always 3, recomputed as the page changes/fills.
  useEffect(() => {
    setChips(heuristicForCurrent(mag, currentPageId));
  }, [mag, currentPageId]);

  // Model-enriched chips — debounced; replace heuristics only if they arrive.
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const better = await fetchModelSuggestions();
      if (live && better.length === 3) setChips(better);
    }, 700);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [currentPageId, magazineId]);

  // Hide while the panel is open (it carries its own prompts) or if none.
  if (open || chips.length === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 flex max-w-[92%] -translate-x-1/2 flex-wrap items-center justify-center gap-2">
      <span className="pointer-events-none flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
        <Sparkles size={11} style={{ color: 'var(--gold-bright)' }} /> Suggestions
      </span>
      {chips.map((c, i) => (
        <button
          key={i}
          onClick={() => ask(c.prompt)}
          className="pointer-events-auto rounded-full border px-3 py-1.5 text-[11px] font-medium text-white shadow-lg backdrop-blur transition-colors hover:bg-white/10"
          style={{ background: 'rgba(13,22,38,0.85)', borderColor: 'var(--gold-mid)' }}
          title={c.prompt}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
