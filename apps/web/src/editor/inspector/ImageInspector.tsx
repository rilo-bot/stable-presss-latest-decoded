import { useRef, useState } from 'react';
import type { ImageContent } from '@/types/magazine';
import { useMagazineStore } from '@/stores/magazineStore';
import { compressImageFile } from '@/lib/imageCompress';
import { Section, Segmented } from './controls';
import { Upload, ExternalLink, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
  const addImageDataUrl = useMagazineStore((s) => s.addImageDataUrl);
  const addImageUrl = useMagazineStore((s) => s.addImageUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [unsplashUrl, setUnsplashUrl] = useState('');

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await compressImageFile(file, { maxDim: 1280, quality: 0.72 });
      const key = addImageDataUrl(dataUrl);
      setImage(magazineId, pageId, regionId, { src: key });
      toast.success('Photo updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load that image.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const applyUnsplash = () => {
    const url = unsplashUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast.error('Paste a valid image URL (it should start with http).');
      return;
    }
    const key = addImageUrl(url);
    setImage(magazineId, pageId, regionId, { src: key });
    setUnsplashUrl('');
    toast.success('Photo updated from URL.');
  };

  return (
    <div>
      <Section title="Upload from device">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-sm border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {busy ? 'Processing…' : 'Choose image…'}
        </button>
      </Section>

      {/* <Section title="Upload from Unsplash">
        <button
          type="button"
          onClick={() => window.open('https://unsplash.com', '_blank', 'noopener,noreferrer')}
          className="mb-2 flex w-full items-center justify-center gap-2 rounded-sm border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
        >
          <ExternalLink size={13} /> Open Unsplash
        </button>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={unsplashUrl}
            placeholder="Paste image URL…"
            onChange={(e) => setUnsplashUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyUnsplash()}
            className="flex-1 rounded-sm border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white outline-none"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={applyUnsplash}
            className="rounded-sm bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600"
          >
            OK
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-white/40">
          Tip: open Unsplash, right-click the photo you like, choose <em>Copy Image Address</em>,
          then paste the URL here and press OK.
        </p>
      </Section> */}

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
