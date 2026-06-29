/**
 * EditableImage — fills its (page-provided) container. Clicking the image opens
 * the OS file picker straight away to upload/replace the photo, and selects the
 * region so the inspector's fit/position controls are available for follow-up
 * tweaks. Read-only swaps to ImageView.
 */

import { useMagazineStore } from '@/stores/magazineStore';
import { useEditorContext } from '../EditorContext';
import { useImageUpload } from './useImageUpload';
import { regionDisplayName } from '../templates/regionNames';
import type { ImageContent } from '@/types/magazine';
import { cn } from '@/lib/utils';
import { ImageIcon, Loader2, Upload } from 'lucide-react';

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
  const selected = useMagazineStore((s) => s.selectedRegionId === regionId && s.selectedPageId === pageId);
  const select = useMagazineStore((s) => s.select);
  const resolveImage = useMagazineStore((s) => s.resolveImage);
  const { busy, openPicker, inputProps } = useImageUpload(magazineId, pageId, regionId);

  if (!content) return null;
  const src = resolveImage(content.src);
  const name = regionDisplayName(regionId);

  return (
    <button
      type="button"
      onClick={() => {
        select(regionId, pageId);
        if (!busy) openPicker();
      }}
      className={cn(
        'group relative block w-full h-full overflow-hidden bg-black/5',
        rounded,
        'ring-offset-0 transition-shadow',
        selected ? 'ring-2 ring-sky-500/90' : 'hover:ring-2 hover:ring-sky-400/50',
        className
      )}
      title={name}
      aria-label={`${name} — click to upload or replace this photo`}
    >
      <input {...inputProps} />
      {/* The photo's name — so editors know what to call it (incl. when asking the AI). */}
      <span
        className={cn(
          'absolute left-0 top-0 z-10 max-w-full truncate rounded-br-sm bg-sky-600/85 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white transition-opacity pointer-events-none',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
      >
        {name}
      </span>
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
        {busy ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
        {busy ? 'Uploading…' : src ? 'Replace photo' : 'Upload photo'}
      </span>
      {busy && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Loader2 size={22} className="animate-spin text-white" />
        </span>
      )}
    </button>
  );
}
