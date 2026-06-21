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
  { icon: 'col1Icon', title: 'col1Title', body: 'col1Body' },
  { icon: 'col2Icon', title: 'col2Title', body: 'col2Body' },
  { icon: 'col3Icon', title: 'col3Title', body: 'col3Body' },
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
        {/* Headline + 3-photo collage hero */}
        <div className="grid grid-cols-[1fr_340px] items-start gap-6">
          <div>
            <RText id="women-in-racing-px.h1a" />
            <RText id="women-in-racing-px.h1b" />
            <RText id="women-in-racing-px.h1c" />
            <PGoldRule className="my-2.5 max-w-[120px]" />
            <RText id="women-in-racing-px.sub" />
            <RText id="women-in-racing-px.body" className="mt-3 max-w-[400px]" />
          </div>
          <div className="grid grid-cols-2 grid-rows-2 gap-2">
            <RImage id="women-in-racing-px.collage1" rounded="rounded-sm" className="row-span-2 h-full" />
            <RImage id="women-in-racing-px.collage2" rounded="rounded-sm" className="h-[128px]" />
            <RImage id="women-in-racing-px.collage3" rounded="rounded-sm" className="h-[128px]" />
          </div>
        </div>

        {/* Three gold-icon feature columns */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          {COLS.map((c) => (
            <div
              key={c.icon}
              className="flex flex-col gap-2 rounded-sm border p-4"
              style={{ borderColor: `${GOLD}55`, background: '#fbf6ec' }}
            >
              <IconBadge iconId={`women-in-racing-px.${c.icon}`} size={38} variant="outline" />
              <RText id={`women-in-racing-px.${c.title}`} className="mt-1" />
              <RText id={`women-in-racing-px.${c.body}`} />
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
