/* Premium Predictions page (template #2). "THE HORSES TO FOLLOW" —
   a hero gallop photo with an "Insights from those who know" badge, and THREE
   columns (Yearlings to Watch / Young Horses to Follow / Stallions Making an
   Impact). Each column lists three entries with a per-horse photo, name, expert
   note and a row of 3 action QRs (watch / view / track). Closes with the
   industry-partners logo row. */

import { PPage, PFooter, PREMIUM_CREAM } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const navy = { background: NAVY };
const COLS = ['p1', 'p2', 'p3'] as const;
const HORSES = [1, 2, 3];
const ACTIONS = [
  { qr: 'WatchQr', label: 'WatchLabel' },
  { qr: 'ViewQr', label: 'ViewLabel' },
  { qr: 'TrackQr', label: 'TrackLabel' },
];

/** A single prediction column: navy header, three horse entries, action QRs. */
function PredColumn({ p }: { p: string }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-sm border" style={{ borderColor: `${GOLD}55` }}>
      <div className="px-3 py-2" style={navy}>
        <RText id={`predictions-px.${p}Title`} />
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-2.5">
        {HORSES.map((i) => (
          <div key={i} className="flex gap-2.5">
            <div className="h-[52px] w-[52px] flex-shrink-0">
              <RImage id={`predictions-px.${p}h${i}Img`} rounded="rounded-sm" />
            </div>
            <div className="min-w-0 flex-1">
              <RText id={`predictions-px.${p}h${i}Name`} />
              <RText id={`predictions-px.${p}h${i}Note`} className="mt-0.5" />
              <RText id={`predictions-px.${p}h${i}Expert`} className="mt-0.5" />
            </div>
          </div>
        ))}

        {/* Row of three action QRs (watch / view / track) */}
        <div className="mt-auto grid grid-cols-3 gap-1.5 border-t pt-2.5" style={{ borderColor: `${GOLD}30` }}>
          {ACTIONS.map((a) => (
            <div key={a.qr} className="flex flex-col items-center gap-1">
              <div className="rounded-sm bg-white p-1">
                <RQr id={`predictions-px.${p}${a.qr}`} size={40} />
              </div>
              <RText id={`predictions-px.${p}${a.label}`} className="!text-center" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PredictionsPremium() {
  return (
    <PPage>
      {/* Header band */}
      <div className="flex items-center px-9 py-2.5" style={navy}>
        <RText id="predictions-px.band" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[58px]">
        {/* Hero zone — gallop photo bleeds to the top-right edge behind the
            headline; cream gradient feathers its left into the page; the
            "insights" badge overlaps the lower-right of the photo. */}
        <div className="relative" style={{ height: 188 }}>
          <div className="absolute bottom-0 top-0 overflow-hidden" style={{ right: -36, width: 372 }}>
            <RImage id="predictions-px.hero" className="absolute inset-0" />
            <div
              className="absolute inset-y-0 left-0"
              style={{ width: 150, background: `linear-gradient(90deg, ${PREMIUM_CREAM} 12%, rgba(243,236,218,0))` }}
            />
          </div>

          {/* Headline — in front of the photo */}
          <div className="relative z-10 max-w-[420px] pt-1">
            <RText id="predictions-px.h1a" />
            <RText id="predictions-px.h1b" />
            <div className="mt-1"><RText id="predictions-px.sub" /></div>
            <RText id="predictions-px.intro" className="mt-2 max-w-[330px]" />
          </div>

          {/* Insights badge — navy pill overlapping the lower-right of the photo */}
          <div
            className="absolute bottom-0 right-0 z-20 flex items-center gap-2 rounded-sm px-5 py-3"
            style={{ ...navy, borderLeft: `4px solid ${GOLD}` }}
          >
            <RIcon id="predictions-px.badgeIcon" size={20} color={GOLD} className="flex-shrink-0" />
            <RText id="predictions-px.badge" className="!text-center" />
          </div>
        </div>

        {/* Three prediction columns */}
        <div className="mt-5 grid flex-1 grid-cols-3 gap-4">
          {COLS.map((p) => (
            <PredColumn key={p} p={p} />
          ))}
        </div>

        {/* Industry-partners logo row */}
        <div className="mt-4 rounded-sm border p-3" style={{ borderColor: `${GOLD}55` }}>
          <RText id="predictions-px.partnersTitle" className="!text-center" />
          <div className="mt-2.5 grid grid-cols-5 gap-2">
            {['partner1', 'partner2', 'partner3', 'partner4', 'partner5'].map((k) => (
              <div key={k} className="flex items-center justify-center rounded-sm bg-white px-1 py-2.5">
                <RText id={`predictions-px.${k}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <PFooter footerId="predictions-px.footer" pageNumId="predictions-px.pageNum" />
    </PPage>
  );
}
