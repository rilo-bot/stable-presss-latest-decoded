/* Premium Gamification page (template #2). "PLAY. WIN. EXPERIENCE." —
   hero photo, a gold Prize Pool list, three numbered game cards (Spot the
   Difference / Ownership Memory / Racing Connections) each with images / grid /
   mini-table + a Play Online QR, a navy "Climb the Leaderboard!" strip, a
   "Share your score!" social block and a gamification-partners logo row. */

import { PPage, PFooter, PGoldRule } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD, WHITE } from '../styles';

const navy = { background: NAVY };
const PRIZES = [1, 2, 3, 4, 5];

/** Numbered game-card header: gold disc + title. */
function GameHead({ num, title }: { num: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full" style={{ background: GOLD }}>
        <RText id={num} className="!text-center" />
      </span>
      <RText id={title} />
    </div>
  );
}

export function GamificationPremium() {
  return (
    <PPage>
      {/* Header band — section label + gold accent icon */}
      <div className="flex items-center justify-between px-9 py-2.5" style={navy}>
        <RText id="gamification-px.band" />
        <RIcon id="gamification-px.bandIcon" size={18} color={GOLD} className="flex-shrink-0" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[58px]">
        {/* Headline + hero + prize pool */}
        <div className="grid grid-cols-[1fr_232px] items-stretch gap-5">
          <div className="flex flex-col">
            <RText id="gamification-px.h1a" />
            <RText id="gamification-px.h1b" />
            <div className="mt-1"><RText id="gamification-px.sub" /></div>
            <RText id="gamification-px.body" className="mt-2 max-w-[360px]" />
            <RImage id="gamification-px.hero" rounded="rounded-sm" className="mt-3 flex-1 min-h-[96px]" />
          </div>
          <div className="flex flex-col rounded-md p-4" style={{ background: GOLD }}>
            <RText id="gamification-px.prizeTitle" />
            <PGoldRule className="mb-2.5 mt-1.5 max-w-[80px]" />
            <div className="space-y-2">
              {PRIZES.map((i) => (
                <div key={i} className="flex items-start gap-2">
                  <RIcon id={`gamification-px.prizeIcon${i}`} size={13} color={NAVY} className="mt-0.5 flex-shrink-0" />
                  <RText id={`gamification-px.prize${i}`} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Three numbered game cards */}
        <div className="mt-5 grid flex-1 grid-cols-3 gap-4">
          {/* Game 1 — Spot the Difference */}
          <div className="flex flex-col overflow-hidden rounded-sm border p-3" style={{ borderColor: `${GOLD}55` }}>
            <GameHead num="gamification-px.game1Num" title="gamification-px.game1Title" />
            <RImage id="gamification-px.game1Img" rounded="rounded-sm" className="my-3 flex-1 min-h-[120px]" />
            <div className="mt-auto flex items-center justify-center gap-2 rounded-sm bg-white p-2">
              <RQr id="gamification-px.game1Qr" size={52} />
              <RText id="gamification-px.game1Play" />
            </div>
          </div>

          {/* Game 2 — Ownership Memory (memory-grid tiles) */}
          <div className="flex flex-col overflow-hidden rounded-sm border p-3" style={{ borderColor: `${GOLD}55` }}>
            <GameHead num="gamification-px.game2Num" title="gamification-px.game2Title" />
            <div className="my-3 grid flex-1 grid-cols-2 gap-1.5">
              {[1, 2, 3, 4].map((i) => (
                <RImage key={i} id={`gamification-px.game2Tile${i}`} rounded="rounded-sm" className="min-h-[54px]" />
              ))}
            </div>
            <div className="mt-auto flex items-center justify-center gap-2 rounded-sm bg-white p-2">
              <RQr id="gamification-px.game2Qr" size={52} />
              <RText id="gamification-px.game2Play" />
            </div>
          </div>

          {/* Game 3 — Racing Connections (horse / trainer / jockey mini-table) */}
          <div className="flex flex-col overflow-hidden rounded-sm border p-3" style={{ borderColor: `${GOLD}55` }}>
            <GameHead num="gamification-px.game3Num" title="gamification-px.game3Title" />
            <RText id="gamification-px.game3Body" className="mt-2" />
            <div className="mt-3 overflow-hidden rounded-sm" style={{ border: `1px solid ${GOLD}40` }}>
              <div className="grid grid-cols-3 gap-px px-2 py-1.5" style={navy}>
                <RText id="gamification-px.game3Head1" />
                <RText id="gamification-px.game3Head2" />
                <RText id="gamification-px.game3Head3" />
              </div>
              {[1, 2, 3].map((r) => (
                <div key={r} className="grid grid-cols-3 gap-px border-t px-2 py-1.5" style={{ borderColor: `${GOLD}30` }}>
                  <RText id={`gamification-px.game3r${r}c1`} />
                  <RText id={`gamification-px.game3r${r}c2`} />
                  <RText id={`gamification-px.game3r${r}c3`} />
                </div>
              ))}
            </div>
            <div className="mt-auto flex items-center justify-center gap-2 rounded-sm bg-white p-2 pt-3">
              <RQr id="gamification-px.game3Qr" size={52} />
              <RText id="gamification-px.game3Play" />
            </div>
          </div>
        </div>

        {/* Climb the leaderboard + Share your score (navy strip) */}
        <div className="mt-4 grid grid-cols-[1fr_236px] items-stretch gap-4 rounded-md p-4" style={navy}>
          <div>
            <div className="flex items-center gap-2">
              <RIcon id="gamification-px.climbIcon" size={18} color={GOLD} className="flex-shrink-0" />
              <RText id="gamification-px.climbTitle" />
            </div>
            <RText id="gamification-px.climbBody" className="mt-2" />
          </div>
          <div className="border-l pl-4" style={{ borderColor: `${GOLD}40` }}>
            <RText id="gamification-px.shareTitle" />
            <RText id="gamification-px.shareNote" className="mt-1.5" />
            <div className="mt-2.5 flex items-center gap-2.5">
              {['shareFbIcon', 'shareIgIcon', 'shareYtIcon'].map((k) => (
                <span key={k} className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }}>
                  <RIcon id={`gamification-px.${k}`} size={15} color={WHITE} />
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Gamification-partners logo row */}
        <div className="mt-4 rounded-sm border p-3" style={{ borderColor: `${GOLD}55` }}>
          <RText id="gamification-px.partnersTitle" className="!text-center" />
          <div className="mt-2.5 grid grid-cols-4 gap-2">
            {['partner1', 'partner2', 'partner3', 'partner4'].map((k) => (
              <div key={k} className="flex items-center justify-center rounded-sm bg-white px-1 py-2.5">
                <RText id={`gamification-px.${k}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <PFooter footerId="gamification-px.footer" pageNumId="gamification-px.pageNum" />
    </PPage>
  );
}
