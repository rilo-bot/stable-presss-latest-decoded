/* Premium template — Owners Celebration Wall (template #2).
   Restyled version of the classic CelebrationPage: navy band with gold star
   accents, a hero champions photo, a navy "Best Ownership Image of the Quarter"
   panel, two owner-of-the-month profiles, a GAVELHOUSE.COM sponsor strip and a
   row of gold date chips for the upcoming events. */

import { PPage, PFooter, PGoldRule, PCard } from './parts';
import { RText, RImage, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const navy = { background: NAVY };

const EVENTS = [
  { date: 'event1Date', body: 'event1' },
  { date: 'event2Date', body: 'event2' },
  { date: 'event3Date', body: 'event3' },
  { date: 'event4Date', body: 'event4' },
];

export function CelebrationPremium() {
  return (
    <PPage>
      {/* Header band — section label flanked by gold star accents */}
      <div className="flex items-center justify-between px-9 py-2.5" style={navy}>
        <div className="flex items-center gap-2.5">
          <RIcon id="celebration-wall-px.bandIcon" size={16} color={GOLD} className="flex-shrink-0" />
          <RText id="celebration-wall-px.band" />
        </div>
        <RIcon id="celebration-wall-px.bandIcon" size={16} color={GOLD} className="flex-shrink-0" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[64px]">
        <div className="grid grid-cols-[1fr_300px] gap-6">
          {/* Left — headline + hero champions photo */}
          <div className="flex flex-col">
            <RText id="celebration-wall-px.h1a" />
            <RText id="celebration-wall-px.h1b" />
            <div className="mt-1"><RText id="celebration-wall-px.sub" /></div>
            <PGoldRule className="mb-2 mt-2 max-w-[150px]" />
            <RText id="celebration-wall-px.body" className="max-w-[380px]" />
            <RImage id="celebration-wall-px.championsImg" rounded="rounded-sm" className="mt-4 flex-1 min-h-[240px]" />
          </div>

          {/* Right — navy quarter panel + owners-of-the-month card */}
          <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-sm" style={{ ...navy, border: `1px solid ${GOLD}55` }}>
              <div className="px-3 pt-3"><RText id="celebration-wall-px.quarterTitle" /></div>
              <RImage id="celebration-wall-px.quarterImg" rounded="rounded-none" className="my-2 h-[150px]" />
              <div className="px-3 pb-3"><RText id="celebration-wall-px.quarterCap" /></div>
            </div>
            <PCard className="flex-1">
              <RText id="celebration-wall-px.monthTitle" />
              <PGoldRule className="mb-3 mt-1.5 max-w-[90px]" />
              <div className="grid grid-cols-[64px_1fr] items-center gap-3">
                <RImage id="celebration-wall-px.month1Img" rounded="rounded-full" className="h-[64px]" />
                <RText id="celebration-wall-px.month1Body" />
              </div>
              <div className="mt-3 grid grid-cols-[64px_1fr] items-center gap-3">
                <RImage id="celebration-wall-px.month2Img" rounded="rounded-full" className="h-[64px]" />
                <RText id="celebration-wall-px.month2Body" />
              </div>
            </PCard>
          </div>
        </div>

        {/* Sponsor strip */}
        <div className="mt-5 flex items-center gap-3 rounded-sm px-4 py-3.5" style={{ ...navy, borderLeft: `4px solid ${GOLD}` }}>
          <RIcon id="celebration-wall-px.sponsorIcon" size={20} color={GOLD} className="flex-shrink-0" />
          <RText id="celebration-wall-px.sponsorBand" />
        </div>

        {/* Major upcoming ownership events — gold date chips */}
        <div className="mt-auto pt-5">
          <div className="flex items-center gap-2">
            <RIcon id="celebration-wall-px.eventsIcon" size={16} color={NAVY} className="flex-shrink-0" />
            <RText id="celebration-wall-px.eventsTitle" />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3">
            {EVENTS.map((e) => (
              <div key={e.date} className="overflow-hidden rounded-sm border" style={{ borderColor: `${GOLD}66` }}>
                <div className="px-3 py-1.5" style={{ background: GOLD }}>
                  <RText id={`celebration-wall-px.${e.date}`} />
                </div>
                <div className="px-3 py-2.5">
                  <RText id={`celebration-wall-px.${e.body}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <PFooter footerId="celebration-wall-px.footer" pageNumId="celebration-wall-px.pageNum" />
    </PPage>
  );
}
