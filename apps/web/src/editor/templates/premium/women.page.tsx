/* Women in Racing (premium) — maroon-accent headline (STYLE. PASSION.
   LEADERSHIP.), a 3-photo collage hero, three gold-icon feature columns, a
   luxury partner spotlight and a race-day-style vote QR. Restyles the classic
   WomenPage to the premium house design. */

import { IconBadge } from './kit';
import { PFooter, PGoldRule, PREMIUM_CREAM } from './parts';
import { PPage } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const MAROON_BAND = '#5a2a3a';
const navy = { background: NAVY };

const COLS = [
  { img: 'col1Img', icon: 'col1Icon', title: 'col1Title', body: 'col1Body' },
  { img: 'col2Img', icon: 'col2Icon', title: 'col2Title', body: 'col2Body' },
  { img: 'col3Img', icon: 'col3Icon', title: 'col3Title', body: 'col3Body' },
];

export function WomenPremium() {
  return (
    <PPage>
      {/* Maroon section band — label + gold accent icon */}
      <div className="flex items-center justify-between px-9 py-2.5" style={{ background: MAROON_BAND }}>
        <RText id="women-in-racing-px.band" />
        <RIcon id="women-in-racing-px.bandIcon" size={18} color={GOLD} className="flex-shrink-0" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[58px]">
        {/* Hero zone — full-bleed photo bleeding to the top-right page edge,
            blended into the cream so the STYLE / PASSION / LEADERSHIP headline
            reads over it (matching the printed Women in Racing spread). */}
        <div className="relative" style={{ height: 286 }}>
          {/* Full-bleed photo — right:-36 cancels the px-9 padding to reach the
              page edge; the gradient feathers its inner edge into the cream. */}
          <div className="absolute bottom-0 top-0 overflow-hidden" style={{ right: -36, width: 430 }}>
            <RImage id="women-in-racing-px.hero" className="absolute inset-0" />
            <div
              className="absolute inset-y-0 left-0"
              style={{ width: 180, background: `linear-gradient(90deg, ${PREMIUM_CREAM} 14%, rgba(243,236,218,0))` }}
            />
          </div>
          {/* Headline — in front of the photo */}
          <div className="relative z-10 max-w-[440px] pt-1">
            <RText id="women-in-racing-px.h1a" />
            <RText id="women-in-racing-px.h1b" />
            <RText id="women-in-racing-px.h1c" />
            <PGoldRule className="my-2.5 max-w-[120px]" />
            <RText id="women-in-racing-px.sub" />
            <RText id="women-in-racing-px.body" className="mt-3 max-w-[300px]" />
          </div>
        </div>

        {/* Three feature columns — candid photo + gold icon + title + body */}
        <div className="mt-5 grid grid-cols-3 gap-4">
          {COLS.map((c) => (
            <div
              key={c.icon}
              className="flex flex-col overflow-hidden rounded-sm border"
              style={{ borderColor: `${GOLD}55`, background: '#fbf6ec' }}
            >
              <RImage id={`women-in-racing-px.${c.img}`} className="h-[90px]" />
              <div className="flex flex-col gap-1.5 p-3.5">
                <div className="flex items-center gap-2">
                  <IconBadge iconId={`women-in-racing-px.${c.icon}`} size={26} variant="outline" />
                  <RText id={`women-in-racing-px.${c.title}`} />
                </div>
                <RText id={`women-in-racing-px.${c.body}`} />
              </div>
            </div>
          ))}
        </div>

        {/* Luxury partner spotlight */}
        <div className="mt-6 flex-1 rounded-sm border p-5" style={{ borderColor: `${GOLD}66`, background: PREMIUM_CREAM }}>
          <RText id="women-in-racing-px.sponsorKicker" />
          <div className="mt-1.5"><RText id="women-in-racing-px.sponsorScript" /></div>
          <div className="mt-3 grid grid-cols-[1fr_220px] gap-5">
            <div>
              <RText id="women-in-racing-px.sponsorBody" />
              <RText id="women-in-racing-px.sponsorName" className="mt-3" />
              <RText id="women-in-racing-px.sponsorTag" className="mt-2" />
            </div>
            <RImage id="women-in-racing-px.sponsorImg" rounded="rounded-sm" className="h-[150px]" />
          </div>
        </div>

        {/* Race-day-style vote — navy QR strip */}
        <div className="mt-5 flex items-center gap-4 rounded-md p-4" style={navy}>
          <div className="rounded-sm bg-white p-1.5"><RQr id="women-in-racing-px.voteQr" size={56} /></div>
          <RIcon id="women-in-racing-px.voteIcon" size={20} color={GOLD} className="flex-shrink-0" />
          <RText id="women-in-racing-px.voteNote" />
        </div>
      </div>

      <PFooter footerId="women-in-racing-px.footer" pageNumId="women-in-racing-px.pageNum" />
    </PPage>
  );
}
