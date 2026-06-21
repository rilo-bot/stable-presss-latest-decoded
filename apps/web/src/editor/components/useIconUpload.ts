/**
 * Shared icon-upload flow for an editable icon region — the icon counterpart of
 * useImageUpload. Used by the icon Inspector's "Upload icon…" button (and any
 * direct-upload affordance). SVGs keep their vector form; raster icons become
 * transparent PNGs. The stored URL is written straight onto the region (and the
 * library `name` is cleared so the custom upload takes precedence).
 *
 * Render the hidden <input> somewhere in your component and spread `inputProps`
 * onto it; call `openPicker()` to launch the OS file dialog.
 */

import { useCallback, useRef, useState } from 'react';
import { useMagazineStore } from '@/stores/magazineStore';
import { uploadIcon } from '@/lib/upload';
import { toast } from 'sonner';

export function useIconUpload(
  magazineId: string | undefined,
  pageId: string | undefined,
  regionId: string,
) {
  const setIcon = useMagazineStore((s) => s.setIcon);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !magazineId || !pageId) return;
      setBusy(true);
      try {
        const { url } = await uploadIcon(file);
        // Custom upload overrides the library glyph (name cleared).
        setIcon(magazineId, pageId, regionId, { src: url, name: undefined });
        toast.success('Icon updated.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load that icon.');
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [magazineId, pageId, regionId, setIcon],
  );

  const openPicker = useCallback(() => fileRef.current?.click(), []);

  /** Props for the hidden file <input> the component must render. */
  const inputProps = {
    ref: fileRef,
    type: 'file' as const,
    accept: '.svg,.png,.webp,.jpg,.jpeg,image/svg+xml,image/png,image/webp,image/jpeg',
    className: 'hidden',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void handleFile(e.target.files?.[0]),
  };

  return { busy, openPicker, inputProps };
}
