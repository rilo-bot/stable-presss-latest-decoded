/**
 * Shared image-upload flow for a magazine image region. Used both by the image
 * Inspector's "Choose image…" button and by clicking an image directly on the
 * page (EditableImage) — so there's a single compress→upload→store path.
 *
 * Render the hidden <input> somewhere in your component and spread `inputProps`
 * onto it; call `openPicker()` to launch the OS file dialog.
 */

import { useCallback, useRef, useState } from 'react';
import { useMagazineStore } from '@/stores/magazineStore';
import { uploadImage } from '@/lib/upload';
import { toast } from 'sonner';

export function useImageUpload(
  magazineId: string | undefined,
  pageId: string | undefined,
  regionId: string,
) {
  const setImage = useMagazineStore((s) => s.setImage);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !magazineId || !pageId) return;
      setBusy(true);
      try {
        // Compress + upload to object storage (S3 URL), falling back to an inline
        // data URL in local dev. Either way the URL is stored straight on the
        // region, so a published issue is self-contained.
        const { url } = await uploadImage(file, { kind: 'media', maxDim: 1280, quality: 0.72 });
        setImage(magazineId, pageId, regionId, { src: url });
        toast.success('Photo updated.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load that image.');
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [magazineId, pageId, regionId, setImage],
  );

  const openPicker = useCallback(() => fileRef.current?.click(), []);

  /** Props for the hidden file <input> the component must render. */
  const inputProps = {
    ref: fileRef,
    type: 'file' as const,
    accept: 'image/*',
    className: 'hidden',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void handleFile(e.target.files?.[0]),
  };

  return { busy, openPicker, inputProps };
}
