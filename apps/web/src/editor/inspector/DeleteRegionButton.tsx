/**
 * Destructive control shared by every inspector panel: removes the selected
 * region from the page entirely (not just its content — the slot disappears).
 * Undoable via the toolbar, so no confirm dialog — matching the other inline
 * remove actions in the inspectors.
 */

import { useMagazineStore } from '@/stores/magazineStore';
import { Section } from './controls';
import { Trash2 } from 'lucide-react';

export function DeleteRegionButton({
  magazineId,
  pageId,
  regionId,
  label,
}: {
  magazineId: string;
  pageId: string;
  regionId: string;
  /** What this region is, for the button copy — e.g. "text", "image". */
  label: string;
}) {
  const deleteRegion = useMagazineStore((s) => s.deleteRegion);

  return (
    <Section title="Delete">
      <button
        type="button"
        onClick={() => deleteRegion(magazineId, pageId, regionId)}
        className="flex w-full items-center justify-center gap-2 rounded-sm border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
      >
        <Trash2 size={13} /> Delete {label}
      </button>
      <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">
        Removes this {label} from the page. Use undo to bring it back.
      </p>
    </Section>
  );
}
