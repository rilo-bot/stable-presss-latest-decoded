import { PPage, PBand, PFooter, PGoldRule } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const navy = { background: NAVY };

const TILES = [1, 2, 3, 4, 5];

// ── Owners Lounge (premium, cream page) ─────────────────────────────
export function LoungePremium() {
  return (
    <PPage>
      {/* Header band — section label + gold accent icon */}
      <div className="flex items-center justify-between px-9 py-2.5" style={navy}>
        <RText id="owners-lounge-px.band" />
        <RIcon id="owners-lounge-px.bandIcon" size={18} color={GOLD} className="flex-shrink-0" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-6 pb-[70px]">
        {/* Headline + lead */}
        <div className="grid grid-cols-[1fr_300px] items-end gap-6">
          <div>
            <RText id="owners-lounge-px.h1a" />
            <RText id="owners-lounge-px.h1b" />
            <PGoldRule className="mb-1.5 mt-2 max-w-[120px]" />
            <div className="mt-1"><RText id="owners-lounge-px.sub" /></div>
          </div>
          <RText id="owners-lounge-px.lead" className="max-w-[280px]" />
        </div>

        {/* Labelled photo tiles + navy pull-quote tile */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          {TILES.map((i) => (
            <div key={i}>
              <RImage id={`owners-lounge-px.photo${i}`} rounded="rounded-sm" className="h-[156px]" />
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="h-1 w-5 flex-shrink-0" style={{ background: GOLD }} />
                <RText id={`owners-lounge-px.photo${i}Cap`} />
              </div>
            </div>
          ))}
          {/* Pull quote — navy tile with gold accent rule */}
          <div
            className="flex items-center rounded-sm px-5 py-4"
            style={{ ...navy, borderLeft: `4px solid ${GOLD}` }}
          >
            <RText id="owners-lounge-px.quote" />
          </div>
        </div>

        {/* Gallery QR row */}
        <div className="mt-auto flex items-center gap-5 rounded-md p-5" style={navy}>
          <div className="flex-shrink-0 rounded-sm bg-white p-2"><RQr id="owners-lounge-px.galleryQr" size={78} /></div>
          <div className="min-w-0">
            <RText id="owners-lounge-px.galleryTitle" />
            <RText id="owners-lounge-px.galleryNote" className="mt-1.5" />
          </div>
        </div>
      </div>

      <PFooter footerId="owners-lounge-px.footer" pageNumId="owners-lounge-px.pageNum" />
    </PPage>
  );
}
