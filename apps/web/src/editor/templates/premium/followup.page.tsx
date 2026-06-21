/* Premium Predictions Follow-up page (template #2).

   "WHAT HAPPENED TO LAST ISSUE'S PREDICTIONS?" — cream page with a navy band
   header, a full-bleed hero photo behind the headline (cream gradient feather),
   a Predictions Scoreboard table with circular success-rate badges, a navy Top
   Performer panel, the Biggest Wins / Black Type / Auction Stars columns, the
   Expert Tipsters head-shot row, and a What's Next? QR block. */

import { PPage, PBand, PFooter, PGoldRule, PCard, PREMIUM_CREAM } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const navy = { background: NAVY };
const navyA = (a: number) => ({ background: `rgba(10,35,66,${a})` });

const SCORE_ROWS = [1, 2, 3];
const COLUMNS = [
  { icon: 'winsIcon', title: 'winsTitle', body: 'winsBody' },
  { icon: 'blackIcon', title: 'blackTitle', body: 'blackBody' },
  { icon: 'auctionIcon', title: 'auctionTitle', body: 'auctionBody' },
];
const TIPSTERS = [1, 2, 3, 4, 5, 6];

export function FollowupPremium() {
  return (
    <PPage>
      <PBand id="predictions-followup-px.band" subId="predictions-followup-px.bandSub" />

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[58px]">
        {/* Hero zone — photo bleeds to the top-right page edge behind the headline,
            a cream gradient feathers its inner edge into the page. */}
        <div className="relative" style={{ height: 150 }}>
          <div className="absolute bottom-0 top-0 overflow-hidden rounded-sm" style={{ right: -36, width: 340 }}>
            <RImage id="predictions-followup-px.hero" className="absolute inset-0" />
            <div
              className="absolute inset-y-0 left-0"
              style={{ width: 150, background: `linear-gradient(90deg, ${PREMIUM_CREAM} 14%, rgba(243,236,218,0))` }}
            />
          </div>
          <div className="relative z-10 max-w-[440px] pt-1">
            <RText id="predictions-followup-px.h1a" />
            <RText id="predictions-followup-px.h1b" />
            <div className="mt-1"><RText id="predictions-followup-px.sub" /></div>
            <RText id="predictions-followup-px.body" className="mt-2 max-w-[360px]" />
          </div>
        </div>

        {/* Predictions Scoreboard — navy table with gold header + success badges */}
        <div className="mt-4 overflow-hidden rounded-sm" style={navy}>
          <div className="px-4 pt-3 pb-1.5">
            <RText id="predictions-followup-px.scoreTitle" />
          </div>
          <div className="px-4 pb-3">
            <div className="grid grid-cols-[1.6fr_0.9fr_0.8fr_0.9fr_0.8fr_0.9fr] items-center gap-2 border-b pb-1.5" style={{ borderColor: `${GOLD}40` }}>
              <RText id="predictions-followup-px.scoreHeadCat" />
              <RText id="predictions-followup-px.scoreHeadPreds" />
              <RText id="predictions-followup-px.scoreHeadWinners" />
              <RText id="predictions-followup-px.scoreHeadBlack" />
              <RText id="predictions-followup-px.scoreHeadG1" />
              <RText id="predictions-followup-px.scoreHeadPct" />
            </div>
            {SCORE_ROWS.map((i) => (
              <div
                key={i}
                className="grid grid-cols-[1.6fr_0.9fr_0.8fr_0.9fr_0.8fr_0.9fr] items-center gap-2 rounded-sm bg-white/90 px-2 py-2"
                style={{ marginTop: 6 }}
              >
                <RText id={`predictions-followup-px.score${i}Cat`} />
                <RText id={`predictions-followup-px.score${i}Preds`} />
                <RText id={`predictions-followup-px.score${i}Winners`} />
                <RText id={`predictions-followup-px.score${i}Black`} />
                <RText id={`predictions-followup-px.score${i}G1`} />
                <div className="flex justify-center">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full"
                    style={{ background: NAVY, border: `2px solid ${GOLD}` }}
                  >
                    <RText id={`predictions-followup-px.score${i}Pct`} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Performer (navy panel) + the three result columns */}
        <div className="mt-4 grid grid-cols-[260px_1fr] gap-4">
          <div className="flex flex-col rounded-sm p-3.5" style={navy}>
            <RText id="predictions-followup-px.topTitle" />
            <RImage id="predictions-followup-px.topImg" rounded="rounded-sm" className="my-2 h-[88px]" />
            <RText id="predictions-followup-px.topBody" />
            <RText id="predictions-followup-px.topQuote" className="mt-2" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {COLUMNS.map((c) => (
              <PCard key={c.title} className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full" style={{ background: GOLD }}>
                    <RIcon id={`predictions-followup-px.${c.icon}`} size={15} color={NAVY} strokeWidth={2.2} />
                  </span>
                  <RText id={`predictions-followup-px.${c.title}`} />
                </div>
                <RText id={`predictions-followup-px.${c.body}`} className="mt-2" />
              </PCard>
            ))}
          </div>
        </div>

        {/* Expert Tipsters — head-shot row */}
        <div className="mt-4">
          <div className="rounded-sm px-4 py-2" style={navyA(0.93)}>
            <RText id="predictions-followup-px.tipstersTitle" className="!text-center" />
          </div>
          <div className="mt-3 grid grid-cols-6 gap-2.5">
            {TIPSTERS.map((i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="h-[58px] w-[58px] overflow-hidden rounded-full" style={{ border: `2px solid ${GOLD}` }}>
                  <RImage id={`predictions-followup-px.tip${i}Img`} className="h-full w-full" />
                </div>
                <RText id={`predictions-followup-px.tip${i}Name`} className="!text-center" />
                <RText id={`predictions-followup-px.tip${i}Score`} className="!text-center" />
                <RText id={`predictions-followup-px.tip${i}Pct`} className="!text-center" />
              </div>
            ))}
          </div>
        </div>

        <PGoldRule className="mt-auto mb-3 max-w-[150px]" />

        {/* What's Next? QR block */}
        <div className="flex items-center gap-3 rounded-sm px-4 py-3" style={navy}>
          <div className="flex-shrink-0 rounded-sm bg-white p-1.5"><RQr id="predictions-followup-px.nextQr" size={54} /></div>
          <RText id="predictions-followup-px.nextNote" />
        </div>
      </div>

      <PFooter footerId="predictions-followup-px.footer" pageNumId="predictions-followup-px.pageNum" />
    </PPage>
  );
}
