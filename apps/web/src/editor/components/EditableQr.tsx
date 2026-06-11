/**
 * EditableQr — renders a live QR (qrcode.react) for the region's target URL.
 * Clicking selects the region so the inspector can edit the scan target.
 */

import { QRCodeSVG } from 'qrcode.react';
import { useMagazineStore } from '@/stores/magazineStore';
import { useEditorContext } from '../EditorContext';
import type { QrContent } from '@/types/magazine';
import { cn } from '@/lib/utils';

interface Props {
  regionId: string;
  size?: number;
  className?: string;
}

const DEFAULT_FG = '#0a2342';
const DEFAULT_BG = '#ffffff';

export function EditableQr({ regionId, size = 72, className }: Props) {
  const { magazineId, pageId } = useEditorContext();

  const content = useMagazineStore((s) => {
    const p = s.magazines.find((m) => m.id === magazineId)?.pages.find((pg) => pg.id === pageId);
    const c = p?.content[regionId];
    return c && c.kind === 'qr' ? (c as QrContent) : undefined;
  });
  const selected = useMagazineStore((s) => s.selectedRegionId === regionId);
  const select = useMagazineStore((s) => s.select);

  if (!content) return null;

  return (
    <button
      type="button"
      onClick={() => select(regionId)}
      className={cn(
        'inline-flex items-center justify-center bg-white p-1 rounded-[2px] transition-shadow',
        selected ? 'ring-2 ring-sky-500/90' : 'hover:ring-2 hover:ring-sky-400/50',
        className
      )}
      aria-label="Edit QR code target"
    >
      <QRCodeSVG
        value={content.targetUrl || 'https://raceowners.co.nz'}
        size={size}
        fgColor={content.fg ?? DEFAULT_FG}
        bgColor={content.bg ?? DEFAULT_BG}
        level="M"
        marginSize={0}
      />
    </button>
  );
}
