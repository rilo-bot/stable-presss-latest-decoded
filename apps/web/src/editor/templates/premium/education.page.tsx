/* Premium Ownership Education page (template #2).

   "HOW TO BECOME AN OWNER" — cream page with a navy band header, a full-bleed
   hero photo behind the headline (cream gradient feather), FIVE numbered steps
   each with a gold icon + check-list, a 5-photo strip, a navy "Useful Tools to
   Get Started" band with 3 tool + QR items, a "Learn. Connect. Experience."
   block, and a "New to Racing?" Ownership Starter Guide booklet block with QR. */

import { IconBadge } from './kit';
import { PPage, PBand, PFooter, PGoldRule, PCard, PREMIUM_CREAM } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const navy = { background: NAVY };

const STEPS = [1, 2, 3, 4, 5];
const STRIP = ['strip1', 'strip2', 'strip3', 'strip4', 'strip5'];
const TOOLS = [
  { icon: 'tool1Icon', body: 'tool1', qr: 'tool1Qr' },
  { icon: 'tool2Icon', body: 'tool2', qr: 'tool2Qr' },
  { icon: 'tool3Icon', body: 'tool3', qr: 'tool3Qr' },
];

export function EducationPremium() {
  return (
    <PPage>
      <PBand id="ownership-education-px.band" subId="ownership-education-px.bandSub" />

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[58px]">
        {/* Hero zone — photo bleeds to the top-right page edge behind the headline,
            a cream gradient feathers its inner edge into the page. */}
        <div className="relative" style={{ height: 138 }}>
          <div className="absolute bottom-0 top-0 overflow-hidden rounded-sm" style={{ right: -36, width: 340 }}>
            <RImage id="ownership-education-px.hero" className="absolute inset-0" />
            <div
              className="absolute inset-y-0 left-0"
              style={{ width: 150, background: `linear-gradient(90deg, ${PREMIUM_CREAM} 14%, rgba(243,236,218,0))` }}
            />
          </div>
          <div className="relative z-10 max-w-[440px] pt-1">
            <RText id="ownership-education-px.h1a" />
            <RText id="ownership-education-px.h1b" />
            <div className="mt-1"><RText id="ownership-education-px.sub" /></div>
            <RText id="ownership-education-px.body" className="mt-2 max-w-[360px]" />
          </div>
        </div>

        {/* Five numbered steps — gold disc number + icon + body + check-list */}
        <div className="mt-4 grid grid-cols-5 gap-3">
          {STEPS.map((i) => (
            <PCard key={i} className="flex flex-col">
              <div className="flex items-center justify-between">
                <span
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                  style={{ background: GOLD, color: NAVY }}
                >
                  {i}
                </span>
                <IconBadge iconId={`ownership-education-px.step${i}Icon`} size={30} variant="outline" />
              </div>
              <div className="mt-2.5"><RText id={`ownership-education-px.step${i}Title`} /></div>
              <RText id={`ownership-education-px.step${i}`} className="mt-1.5" />
              <div className="mt-2 space-y-1">
                <RText id={`ownership-education-px.step${i}Check1`} />
                <RText id={`ownership-education-px.step${i}Check2`} />
              </div>
            </PCard>
          ))}
        </div>

        {/* 5-photo strip */}
        <div className="mt-4 grid grid-cols-5 gap-2">
          {STRIP.map((k) => (
            <RImage key={k} id={`ownership-education-px.${k}`} rounded="rounded-sm" className="h-[66px]" />
          ))}
        </div>

        {/* Useful Tools to Get Started (navy band) — 3 tool + QR items */}
        <div className="mt-4 rounded-sm p-4" style={navy}>
          <RText id="ownership-education-px.toolsTitle" />
          <div className="mt-3 grid grid-cols-3 gap-3">
            {TOOLS.map((t) => (
              <div key={t.qr} className="flex items-center gap-2.5 rounded-sm bg-white/90 p-2.5">
                <div className="flex-shrink-0 rounded-sm bg-white p-1"><RQr id={`ownership-education-px.${t.qr}`} size={48} /></div>
                <div className="min-w-0">
                  <span className="mb-1 inline-flex">
                    <RIcon id={`ownership-education-px.${t.icon}`} size={16} color={GOLD} strokeWidth={2.1} />
                  </span>
                  <RText id={`ownership-education-px.${t.body}`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <PGoldRule className="mt-auto mb-3" />

        {/* Learn. Connect. Experience. + New to Racing? starter guide booklet */}
        <div className="grid grid-cols-[1fr_240px] items-center gap-5">
          <div>
            <RText id="ownership-education-px.ctaTitle" />
            <RText id="ownership-education-px.ctaBody" className="mt-2 max-w-[400px]" />
          </div>
          <div className="flex items-center gap-3 rounded-md p-3.5" style={navy}>
            <div className="flex-shrink-0 rounded-sm bg-white p-1.5"><RQr id="ownership-education-px.guideQr" size={60} /></div>
            <div className="min-w-0">
              <RText id="ownership-education-px.guideTitle" />
              <RText id="ownership-education-px.guideNote" className="mt-1" />
            </div>
          </div>
        </div>
      </div>

      <PFooter footerId="ownership-education-px.footer" pageNumId="ownership-education-px.pageNum" />
    </PPage>
  );
}
