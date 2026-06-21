/* Premium Winning Moments page (template #2) — `winning-moments-px`.
   "OWNERSHIP. PASSION. VICTORY." — hero winners photo, six winner cards (five
   winners + a share/upload QR strip) on the premium cream surface with gold
   rules, navy race labels and a pinned navy footer. */

import { PPage, PFooter, PGoldRule, PREMIUM_CREAM } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const navy = { background: NAVY };

/** Premium winner card: full-width photo, navy gold-rule race label, horse + detail. */
function WinnerCard({ p }: { p: string }) {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-sm border"
      style={{ borderColor: `${GOLD}55`, background: PREMIUM_CREAM }}
    >
      <RImage id={`${p}Img`} rounded="" className="h-[132px]" />
      <div className="px-3 py-1.5" style={{ ...navy, borderTop: `1px solid ${GOLD}55` }}>
        <RText id={`${p}Race`} />
      </div>
      <div className="flex-1 p-3">
        <RText id={`${p}Horse`} />
        <PGoldRule className="my-1.5 max-w-[70px]" />
        <RText id={`${p}Detail`} />
      </div>
    </div>
  );
}

export function WinningPremium() {
  return (
    <PPage>
      {/* Header band — section label + gold trophy accent */}
      <div className="flex items-center justify-between px-9 py-2.5" style={navy}>
        <div className="flex items-center gap-2">
          <RIcon id="winning-moments-px.bandIcon" size={17} color={GOLD} className="flex-shrink-0" />
          <RText id="winning-moments-px.band" />
        </div>
        <RText id="winning-moments-px.bandSub" className="text-right" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[64px]">
        {/* Hero zone — winners photo bleeds to the top-right page edge, blended
            into the cream so the headline reads over it. */}
        <div className="relative" style={{ height: 196 }}>
          <div className="absolute bottom-0 top-0 overflow-hidden" style={{ right: -36, width: 372 }}>
            <RImage id="winning-moments-px.heroImg" className="absolute inset-0" />
            <div className="absolute inset-y-0 left-0" style={{ width: 160, background: `linear-gradient(90deg, ${PREMIUM_CREAM} 14%, rgba(243,236,218,0))` }} />
          </div>
          <div className="relative z-10 max-w-[430px] pt-1">
            <RText id="winning-moments-px.h1a" />
            <RText id="winning-moments-px.h1b" />
            <PGoldRule className="mt-2 mb-1 max-w-[130px]" />
            <div className="mt-1"><RText id="winning-moments-px.sub" /></div>
            <RText id="winning-moments-px.intro" className="mt-2 max-w-[320px]" />
          </div>
        </div>

        {/* Six cells — five winner cards + the share/upload QR strip */}
        <div className="mt-5 grid flex-1 grid-cols-3 gap-4">
          <WinnerCard p="winning-moments-px.w1" />
          <WinnerCard p="winning-moments-px.w2" />
          <WinnerCard p="winning-moments-px.w3" />
          <WinnerCard p="winning-moments-px.w4" />
          <WinnerCard p="winning-moments-px.w5" />
          <div className="flex flex-col items-center justify-center gap-3 rounded-sm p-4" style={{ ...navy, border: `1px solid ${GOLD}55` }}>
            <RIcon id="winning-moments-px.uploadIcon" size={26} color={GOLD} className="flex-shrink-0" />
            <RText id="winning-moments-px.uploadTitle" className="!text-center" />
            <div className="rounded-sm bg-white p-2"><RQr id="winning-moments-px.uploadQr" size={80} /></div>
            <RText id="winning-moments-px.uploadNote" className="!text-center" />
          </div>
        </div>
      </div>

      <PFooter footerId="winning-moments-px.footer" pageNumId="winning-moments-px.pageNum" />
    </PPage>
  );
}
