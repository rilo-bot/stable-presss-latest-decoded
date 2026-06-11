/**
 * EditableImage — fills its (page-provided) container; clicking selects the
 * region so the inspector opens the image panel. Read-only swaps to ImageView.
 */

import { useMagazineStore } from '@/stores/magazineStore';
import { useEditorContext } from '../EditorContext';
import type { ImageContent } from '@/types/magazine';
import { cn } from '@/lib/utils';
import { ImageIcon } from 'lucide-react';

interface Props {
  regionId: string;
  className?: string;
  rounded?: string;
}

export function EditableImage({ regionId, className, rounded }: Props) {
  const { magazineId, pageId } = useEditorContext();

  const content = useMagazineStore((s) => {
    const p = s.magazines.find((m) => m.id === magazineId)?.pages.find((pg) => pg.id === pageId);
    const c = p?.content[regionId];
    return c && c.kind === 'image' ? (c as ImageContent) : undefined;
  });
  const selected = useMagazineStore((s) => s.selectedRegionId === regionId);
  const select = useMagazineStore((s) => s.select);
  const resolveImage = useMagazineStore((s) => s.resolveImage);

  if (!content) return null;
  const src = resolveImage(content.src);

  return (
    <button
      type="button"
      onClick={() => select(regionId)}
      className={cn(
        'group relative block w-full h-full overflow-hidden bg-black/5',
        rounded,
        'ring-offset-0 transition-shadow',
        selected ? 'ring-2 ring-sky-500/90' : 'hover:ring-2 hover:ring-sky-400/50',
        className
      )}
      aria-label={`Edit image: ${content.alt ?? regionId}`}
    >
      {src ? (
        <img
          src={src}
          alt={content.alt ?? ''}
          draggable={false}
          className="w-full h-full select-none pointer-events-none"
          style={{
            objectFit: content.fit,
            objectPosition: `${(content.focalX ?? 0.5) * 100}% ${(content.focalY ?? 0.5) * 100}%`,
          }}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-black/30">
          <ImageIcon size={28} />
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-white bg-sky-600/80 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <ImageIcon size={11} /> Edit photo
      </span>
    </button>
  );
}
