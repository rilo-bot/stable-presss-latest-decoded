import type { QrContent } from '@/types/magazine';
import { useMagazineStore } from '@/stores/magazineStore';
import { Section } from './controls';
import { QRCodeSVG } from 'qrcode.react';

export function QrInspector({
  magazineId,
  pageId,
  regionId,
  content,
}: {
  magazineId: string;
  pageId: string;
  regionId: string;
  content: QrContent;
}) {
  const setQr = useMagazineStore((s) => s.setQr);

  return (
    <div>
      <Section title="Scan destination">
        <input
          type="text"
          value={content.targetUrl}
          placeholder="https://raceowners.co.nz/join"
          onChange={(e) => setQr(magazineId, pageId, regionId, { targetUrl: e.target.value })}
          className="w-full rounded-sm border border-white/15 bg-white/5 px-2 py-2 text-xs text-white outline-none"
          spellCheck={false}
        />
        <p className="mt-2 text-[10px] leading-relaxed text-white/40">
          Anyone scanning this QR code will be taken to this link. The code updates live as you type.
        </p>
      </Section>

      <Section title="Preview">
        <div className="flex justify-center rounded-sm bg-white py-4">
          <QRCodeSVG
            value={content.targetUrl || 'https://raceowners.co.nz'}
            size={120}
            fgColor={content.fg ?? '#0a2342'}
            bgColor={content.bg ?? '#ffffff'}
            level="M"
          />
        </div>
      </Section>
    </div>
  );
}
