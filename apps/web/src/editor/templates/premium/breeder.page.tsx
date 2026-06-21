/* Breeder Feature (premium, template #2) — "FROM PADDOCK TO WINNER'S CIRCLE".
   Cream page: navy band header, navy gold-edged pull-quote, the breeding-journey
   body with the mare-and-foal photo + caption, the stakes-winner photo + caption,
   "A Family Effort" block, and a trophy-icon highs block with a meet-the-breeder
   QR — a premium restyle of the classic BreederPage. */

import { PPage, PFooter, PGoldRule, PREMIUM_CREAM } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const navy = { background: NAVY };

export function BreederPremium() {
  return (
    <PPage>
      {/* Header band — section label + gold accent icon */}
      <div className="flex items-center justify-between px-9 py-2.5" style={navy}>
        <RText id="breeder-feature-px.band" />
        <RIcon id="breeder-feature-px.bandIcon" size={18} color={GOLD} className="flex-shrink-0" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[64px]">
        {/* Hero zone — family photo bleeds to the top-right page edge, blended
            into the cream so the headline + pull-quote read over it. */}
        <div className="relative" style={{ height: 300 }}>
          <div className="absolute bottom-0 top-0 overflow-hidden" style={{ right: -36, width: 360 }}>
            <RImage id="breeder-feature-px.familyImg" className="absolute inset-0" />
            <div className="absolute inset-y-0 left-0" style={{ width: 160, background: `linear-gradient(90deg, ${PREMIUM_CREAM} 14%, rgba(243,236,218,0))` }} />
          </div>
          <div className="relative z-10 max-w-[430px] pt-1">
            <RText id="breeder-feature-px.h1a" />
            <RText id="breeder-feature-px.h1b" />
            <div className="mt-1"><RText id="breeder-feature-px.sub" /></div>
            <RText id="breeder-feature-px.body" className="mt-3 max-w-[300px]" />
            <div className="mt-4 max-w-[330px] rounded-sm p-4" style={{ ...navy, borderLeft: `4px solid ${GOLD}` }}>
              <RText id="breeder-feature-px.quote" />
              <RText id="breeder-feature-px.quoteBy" className="mt-1.5" />
            </div>
          </div>
        </div>

        {/* Breeding journey + mare/foal | stakes-winner photo + a family effort */}
        <div className="mt-6 grid flex-1 grid-cols-2 gap-6">
          <div className="flex flex-col">
            <RText id="breeder-feature-px.journeyTitle" />
            <PGoldRule className="mb-2 mt-1.5 max-w-[120px]" />
            <RText id="breeder-feature-px.journeyBody" />
            <RImage id="breeder-feature-px.mareImg" rounded="rounded-sm" className="mt-3 flex-1 min-h-[150px]" />
            <RText id="breeder-feature-px.mareCap" className="mt-1.5" />
          </div>
          <div className="flex flex-col">
            <RImage id="breeder-feature-px.jockeyImg" rounded="rounded-sm" className="h-[160px]" />
            <RText id="breeder-feature-px.jockeyCap" className="mt-1.5" />
            <RText id="breeder-feature-px.effortTitle" className="mt-4" />
            <PGoldRule className="mb-2 mt-1.5 max-w-[90px]" />
            <RText id="breeder-feature-px.effortBody" />
          </div>
        </div>

        {/* Trophy-icon "the highs make it all worth it" navy block + QR */}
        <div className="mt-auto grid grid-cols-[1fr_92px] items-center gap-5 rounded-md p-5" style={navy}>
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full" style={{ border: `2px solid ${GOLD}` }}>
              <RIcon id="breeder-feature-px.highsIcon" size={24} color={GOLD} />
            </span>
            <div className="min-w-0">
              <RText id="breeder-feature-px.highsTitle" />
              <PGoldRule className="mb-2 mt-1.5 max-w-[150px]" />
              <RText id="breeder-feature-px.highsBody" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="rounded-sm p-1" style={{ background: PREMIUM_CREAM }}><RQr id="breeder-feature-px.qr" size={68} /></div>
            <RText id="breeder-feature-px.qrNote" className="!text-center" />
          </div>
        </div>
      </div>

      <PFooter footerId="breeder-feature-px.footer" pageNumId="breeder-feature-px.pageNum" />
    </PPage>
  );
}
