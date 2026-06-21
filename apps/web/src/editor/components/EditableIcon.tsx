/**
 * EditableIcon — renders an editable icon region (library glyph or uploaded
 * SVG/PNG) inside a selectable button. Clicking SELECTS the region so the
 * inspector's icon picker / upload / colour controls appear — it does NOT open
 * the file dialog straight away (unlike EditableImage), because picking a library
 * glyph is the common case. Read-only swaps to IconView.
 */

import { useMagazineStore } from '@/stores/magazineStore';
import { useEditorContext } from '../EditorContext';
import { IconView } from './readonly';
import type { IconContent } from '@/types/magazine';
import { cn } from '@/lib/utils';

interface Props {
  regionId: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export function EditableIcon({ regionId, size = 24, color, strokeWidth, className }: Props) {
  const { magazineId, pageId } = useEditorContext();

  const content = useMagazineStore((s) => {
    const p = s.magazines.find((m) => m.id === magazineId)?.pages.find((pg) => pg.id === pageId);
    const c = p?.content[regionId];
    return c && c.kind === 'icon' ? (c as IconContent) : undefined;
  });
  const selected = useMagazineStore((s) => s.selectedRegionId === regionId && s.selectedPageId === pageId);
  const select = useMagazineStore((s) => s.select);

  if (!content) return null;

  return (
    <button
      type="button"
      onClick={() => select(regionId, pageId)}
      className={cn(
        'group relative inline-flex items-center justify-center rounded-[3px] transition-shadow',
        selected ? 'ring-2 ring-sky-500/90' : 'hover:ring-2 hover:ring-sky-400/50',
        className,
      )}
      aria-label={`Change icon: ${content.name ?? 'custom'}`}
    >
      <IconView content={content} size={size} color={color} strokeWidth={strokeWidth} />
    </button>
  );
}
