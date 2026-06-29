import type { IconContent } from '@/types/magazine';
import { useMagazineStore } from '@/stores/magazineStore';
import { useIconUpload } from '../components/useIconUpload';
import { ICON_NAMES, resolveIcon } from '../templates/iconRegistry';
import { Section, ColorControl } from './controls';
import { DeleteRegionButton } from './DeleteRegionButton';
import { Upload, RotateCcw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function IconInspector({
  magazineId,
  pageId,
  regionId,
  content,
}: {
  magazineId: string;
  pageId: string;
  regionId: string;
  content: IconContent;
}) {
  const setIcon = useMagazineStore((s) => s.setIcon);
  const { busy, openPicker, inputProps } = useIconUpload(magazineId, pageId, regionId);
  const usingCustom = !!content.src;

  return (
    <div>
      <Section title="Upload custom icon">
        <input {...inputProps} />
        <button
          type="button"
          disabled={busy}
          onClick={openPicker}
          className="flex w-full items-center justify-center gap-2 rounded-sm border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {busy ? 'Processing…' : usingCustom ? 'Replace icon…' : 'Upload icon…'}
        </button>
        <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">SVG keeps its vector form; PNG/JPG keep transparency.</p>
      </Section>

      <Section title="Choose an icon">
        <div className="grid grid-cols-7 gap-1">
          {ICON_NAMES.map((name) => {
            const Glyph = resolveIcon(name);
            const active = !usingCustom && content.name === name;
            return (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => setIcon(magazineId, pageId, regionId, { name, src: undefined })}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-sm border transition-colors',
                  active ? 'border-sky-400 bg-sky-500/20 text-sky-200' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10',
                )}
                aria-label={`Use ${name} icon`}
              >
                <Glyph size={15} />
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Colour">
        <ColorControl
          value={content.color ?? '#0a2342'}
          onChange={(v) => setIcon(magazineId, pageId, regionId, { color: v })}
        />
        <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">Tint applies to library icons; uploaded art keeps its own colours.</p>
      </Section>

      {usingCustom && (
        <Section title="Reset">
          <button
            type="button"
            onClick={() => setIcon(magazineId, pageId, regionId, { src: undefined })}
            className="flex w-full items-center justify-center gap-2 rounded-sm border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
          >
            <RotateCcw size={13} /> Remove custom icon
          </button>
        </Section>
      )}

      <DeleteRegionButton magazineId={magazineId} pageId={pageId} regionId={regionId} label="icon" />
    </div>
  );
}
