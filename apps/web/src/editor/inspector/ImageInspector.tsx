import type { ImageContent } from '@/types/magazine';
import { useMagazineStore } from '@/stores/magazineStore';
import { useImageUpload } from '../components/useImageUpload';
import { Section, Segmented } from './controls';
import { Upload, Trash2, Loader2 } from 'lucide-react';

export function ImageInspector({
  magazineId,
  pageId,
  regionId,
  content,
}: {
  magazineId: string;
  pageId: string;
  regionId: string;
  content: ImageContent;
}) {
  const setImage = useMagazineStore((s) => s.setImage);
  const { busy, openPicker, inputProps } = useImageUpload(magazineId, pageId, regionId);

  return (
    <div>
      <Section title="Upload from device">
        <input {...inputProps} />
        <button
          type="button"
          disabled={busy}
          onClick={openPicker}
          className="flex w-full items-center justify-center gap-2 rounded-sm border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {busy ? 'Processing…' : content.src ? 'Replace image…' : 'Choose image…'}
        </button>
      </Section>

      <Section title="Fit">
        <Segmented<ImageContent['fit']>
          value={content.fit}
          options={[
            { value: 'cover', label: 'Cover' },
            { value: 'contain', label: 'Contain' },
          ]}
          onChange={(v) => setImage(magazineId, pageId, regionId, { fit: v })}
        />
      </Section>

      <Section title="Position">
        <div className="space-y-2">
          <label className="block text-[10px] text-white/40">
            Horizontal
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((content.focalX ?? 0.5) * 100)}
              onChange={(e) =>
                setImage(magazineId, pageId, regionId, { focalX: Number(e.target.value) / 100 })
              }
              className="w-full accent-sky-500"
            />
          </label>
          <label className="block text-[10px] text-white/40">
            Vertical
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((content.focalY ?? 0.5) * 100)}
              onChange={(e) =>
                setImage(magazineId, pageId, regionId, { focalY: Number(e.target.value) / 100 })
              }
              className="w-full accent-sky-500"
            />
          </label>
        </div>
      </Section>

      <Section title="Remove">
        <button
          type="button"
          onClick={() => setImage(magazineId, pageId, regionId, { src: '' })}
          className="flex w-full items-center justify-center gap-2 rounded-sm border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
        >
          <Trash2 size={13} /> Clear photo
        </button>
      </Section>
    </div>
  );
}
