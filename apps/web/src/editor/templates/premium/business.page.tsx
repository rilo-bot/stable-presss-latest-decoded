/**
 * Premium template — Business & Owners page component (template #2).
 *
 * "WHERE RACING AND BUSINESS CONNECT" — hero photo, three gold-icon features,
 * a navy "Owner Business Spotlights" band with three owner profiles, a sponsor
 * logo row, and a connect-with-owner-businesses QR strip. Mirrors the classic
 * BusinessPage faithfully, restyled premium. Region ids match business.bp.ts.
 */

import { IconBadge } from './kit';
import { PPage, PFooter, PGoldRule, PREMIUM_CREAM } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const navy = { background: NAVY };

const FEATURES = [
  { icon: 'col1Icon', title: 'col1Title', body: 'col1Body' },
  { icon: 'col2Icon', title: 'col2Title', body: 'col2Body' },
  { icon: 'col3Icon', title: 'col3Title', body: 'col3Body' },
];
const PARTNERS = ['partner1', 'partner2', 'partner3', 'partner4', 'partner5'];

export function BusinessPremium() {
  return (
    <PPage>
      {/* Header band — section label + gold accent icon */}
      <div className="flex items-center justify-between px-9 py-2.5" style={navy}>
        <RText id="business-owners-px.band" />
        <RIcon id="business-owners-px.bandIcon" size={18} color={GOLD} className="flex-shrink-0" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[64px]">
        {/* Hero zone — group photo bleeds to the top-right page edge, blended
            into the cream so the headline reads over it. */}
        <div className="relative" style={{ height: 222 }}>
          <div className="absolute bottom-0 top-0 overflow-hidden" style={{ right: -36, width: 380 }}>
            <RImage id="business-owners-px.heroImg" className="absolute inset-0" />
            <div className="absolute inset-y-0 left-0" style={{ width: 160, background: `linear-gradient(90deg, ${PREMIUM_CREAM} 14%, rgba(243,236,218,0))` }} />
          </div>
          <div className="relative z-10 max-w-[430px] pt-1">
            <RText id="business-owners-px.h1a" />
            <RText id="business-owners-px.h1b" />
            <RText id="business-owners-px.h1c" />
            <div className="mt-1"><RText id="business-owners-px.sub" /></div>
            <RText id="business-owners-px.body" className="mt-3 max-w-[300px]" />
          </div>
        </div>

        {/* Three gold-icon features */}
        <div className="mt-5 grid grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.icon}
              className="flex flex-col gap-2 rounded-sm border p-3.5"
              style={{ borderColor: `${GOLD}55` }}
            >
              <IconBadge iconId={`business-owners-px.${f.icon}`} size={40} variant="outline" />
              <RText id={`business-owners-px.${f.title}`} className="mt-1" />
              <RText id={`business-owners-px.${f.body}`} />
            </div>
          ))}
        </div>

        {/* Owner Business Spotlights — navy band + three profiles */}
        <div className="mt-5 flex flex-1 flex-col overflow-hidden rounded-md" style={navy}>
          <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${GOLD}40` }}>
            <RText id="business-owners-px.spotlightTitle" />
          </div>
          <div className="grid flex-1 grid-cols-3 gap-5 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col">
                <RImage id={`business-owners-px.spot${i}Img`} rounded="rounded-sm" className="h-[130px]" />
                <RText id={`business-owners-px.spot${i}Name`} className="mt-2.5" />
                <RText id={`business-owners-px.spot${i}Company`} className="mt-0.5" />
                <RText id={`business-owners-px.spot${i}Body`} className="mt-2" />
                <div className="mt-auto pt-2"><RText id={`business-owners-px.spot${i}Quote`} /></div>
              </div>
            ))}
          </div>
        </div>

        <PGoldRule className="my-4" />

        {/* Sponsor logo row */}
        <div className="rounded-sm border p-4" style={{ borderColor: `${GOLD}55` }}>
          <RText id="business-owners-px.partnersTitle" className="!text-center" />
          <div className="mt-3 grid grid-cols-5 gap-2">
            {PARTNERS.map((k) => (
              <div key={k} className="flex items-center justify-center rounded-sm bg-white px-1 py-2.5">
                <RText id={`business-owners-px.${k}`} />
              </div>
            ))}
          </div>
        </div>

        {/* Connect QR strip */}
        <div className="mt-3 flex items-center gap-3">
          <div className="rounded-sm bg-white p-1.5 ring-1 ring-black/5"><RQr id="business-owners-px.qr" size={54} /></div>
          <RText id="business-owners-px.qrNote" />
        </div>
      </div>

      <PFooter footerId="business-owners-px.footer" pageNumId="business-owners-px.pageNum" />
    </PPage>
  );
}
