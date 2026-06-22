import { PPage, PFooter } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const navy = { background: NAVY };

/** Collage tile — photo with its caption overlaid on a navy bottom gradient. */
function LabeledPhoto({ id, capId, className }: { id: string; capId: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-sm ${className ?? ''}`}>
      <RImage id={id} className="absolute inset-0" />
      <div
        className="absolute inset-x-0 bottom-0"
        style={{ height: 52, background: 'linear-gradient(0deg, rgba(8,22,46,0.9), rgba(8,22,46,0))' }}
      />
      <div className="absolute bottom-2 left-3 right-2">
        <RText id={capId} />
      </div>
    </div>
  );
}

// ── Owners Lounge (premium, cream page) — photo-collage spread ───────
// "The best part of racing? The people." — a varied photo mosaic (two wide
// tiles, a three-up row, a panorama strip, and a quote + two photos + galleries
// QR row), each tile carrying its caption overlaid on the image.
export function LoungePremium() {
  return (
    <PPage>
      {/* Header band — section label + gold accent icon */}
      <div className="flex items-center justify-between px-9 py-2.5" style={navy}>
        <RText id="owners-lounge-px.band" />
        <RIcon id="owners-lounge-px.bandIcon" size={18} color={GOLD} className="flex-shrink-0" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[56px]">
        {/* Headline (left) + lead (right) */}
        <div className="flex items-start justify-between gap-8">
          <div>
            <RText id="owners-lounge-px.h1a" />
            <RText id="owners-lounge-px.h1b" />
            <div className="mt-1"><RText id="owners-lounge-px.sub" /></div>
          </div>
          <RText id="owners-lounge-px.lead" className="mt-1 max-w-[300px]" />
        </div>

        {/* Row 1 — two wide tiles */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <LabeledPhoto id="owners-lounge-px.photo1" capId="owners-lounge-px.photo1Cap" className="h-[210px]" />
          <LabeledPhoto id="owners-lounge-px.photo2" capId="owners-lounge-px.photo2Cap" className="h-[210px]" />
        </div>

        {/* Row 2 — three tiles */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          <LabeledPhoto id="owners-lounge-px.photo3" capId="owners-lounge-px.photo3Cap" className="h-[150px]" />
          <LabeledPhoto id="owners-lounge-px.photo4" capId="owners-lounge-px.photo4Cap" className="h-[150px]" />
          <LabeledPhoto id="owners-lounge-px.photo5" capId="owners-lounge-px.photo5Cap" className="h-[150px]" />
        </div>

        {/* Row 3 — wide panorama strip */}
        <RImage id="owners-lounge-px.photo6" rounded="rounded-sm" className="mt-3 h-[120px]" />

        {/* Row 4 — pull-quote + two photos + galleries QR */}
        <div className="mt-3 grid h-[212px] grid-cols-[1.1fr_0.9fr_0.9fr_1.2fr] gap-3">
          <div
            className="flex flex-col justify-center rounded-sm px-4 py-3"
            style={{ ...navy, borderLeft: `4px solid ${GOLD}` }}
          >
            <RText id="owners-lounge-px.quote" />
          </div>
          <RImage id="owners-lounge-px.photo7" rounded="rounded-sm" className="h-full" />
          <RImage id="owners-lounge-px.photo8" rounded="rounded-sm" className="h-full" />
          <div className="flex items-center gap-3 rounded-sm p-3" style={navy}>
            <div className="flex-shrink-0 rounded-sm bg-white p-1.5"><RQr id="owners-lounge-px.galleryQr" size={62} /></div>
            <div className="min-w-0">
              <RText id="owners-lounge-px.galleryTitle" />
              <RText id="owners-lounge-px.galleryNote" className="mt-1" />
            </div>
          </div>
        </div>
      </div>

      <PFooter footerId="owners-lounge-px.footer" pageNumId="owners-lounge-px.pageNum" />
    </PPage>
  );
}
