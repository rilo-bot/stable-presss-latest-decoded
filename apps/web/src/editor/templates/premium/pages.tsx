/* Premium template page components (template #2). Isolated from the classic
   pages so template #1 is untouched. Flagship spread: Cover + Aeliana. */

import { PPage, PTab, PFooter, PGoldRule } from './parts';
import { IconStat, NumberStep, ExploreItem, QuoteMark } from './kit';
import { RText, RImage, RQr } from '../../components/Region';
import { NAVY, GOLD } from '../styles';
import { Gavel, Trophy, Star, Globe, PlayCircle, BarChart3, Users, Sprout, Award } from 'lucide-react';

const navy = { background: NAVY };
const navyA = (a: number) => ({ background: `rgba(10,35,66,${a})` });

// ── Cover (premium) — full-bleed hero in the lower half ─────────────
export function CoverPremium() {
  return (
    <PPage>
      {/* Photo — fills the lower region full width, BEHIND the text, so it shows
          up the right side beside the inside-list and across the bottom. */}
      <div className="absolute left-0 right-0 bottom-0" style={{ top: 420 }}>
        <RImage id="cover-px.hero" className="absolute inset-0" />
      </div>

      {/* Top cream content: tagline + logo, headline, intro, edition pill */}
      <div className="absolute inset-x-0 top-0 px-10 pt-9">
        <div className="flex items-start justify-between">
          <div className="w-[55%]"><RText id="cover-px.tagline" /></div>
          <div className="flex flex-col items-end gap-1">
            <RText id="cover-px.masthead" />
            <RText id="cover-px.mastheadSub" className="text-right" />
            <RText id="cover-px.badge" className="text-right" />
          </div>
        </div>
        <div className="mt-7 max-w-[66%]">
          <RText id="cover-px.h1" />
          <RText id="cover-px.h2" />
          <RText id="cover-px.h3" />
          <div className="mt-4 max-w-[360px]"><RText id="cover-px.intro" /></div>
          <div className="mt-3 inline-flex w-fit rounded-sm px-3 py-1.5" style={navy}>
            <RText id="cover-px.editionBadge" />
          </div>
        </div>
      </div>

      {/* Inside-this-issue — points float over the photo on a translucent scrim
          (transparent background so the image shows through behind them). */}
      <div className="absolute left-0 px-10" style={{ top: 416, width: '52%' }}>
        <div className="rounded-md pb-5 pl-1 pr-6 pt-3" style={{ background: 'rgba(243, 236, 218, 0.42)' }}>
          <RText id="cover-px.insideTitle" />
          <div className="mt-2.5 space-y-2.5">
            {['inside1', 'inside2', 'inside3', 'inside4', 'inside5'].map((k) => (
              <div key={k} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={navy} />
                <RText id={`cover-px.${k}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Navy partner band over the photo, above the footer */}
      <div className="absolute inset-x-0 grid grid-cols-[215px_1fr] gap-4 px-10 py-4" style={{ ...navyA(0.93), bottom: 36 }}>
        <div className="flex items-center gap-2 rounded-sm bg-white p-2">
          <RQr id="cover-px.joinQr" size={62} />
          <div className="min-w-0">
            <RText id="cover-px.scanTitle" />
            <RText id="cover-px.scanSub" className="mt-0.5" />
            <RText id="cover-px.scanUrl" className="mt-0.5" />
          </div>
        </div>
        <div>
          <RText id="cover-px.partnersTitle" />
          <div className="mt-1.5 grid grid-cols-6 gap-1.5">
            {['partner1', 'partner2', 'partner3', 'partner4', 'partner5', 'partner6'].map((k) => (
              <div key={k} className="flex items-center justify-center rounded-sm bg-white px-1 py-2.5">
                <RText id={`cover-px.${k}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <PFooter footerId="cover-px.footer" pageNumId="cover-px.pageNum" />
    </PPage>
  );
}

// ── Best Headline Story — Aeliana (premium NAVY feature page) ───────
const STATS = [
  { icon: Gavel, n: 'stat1Num', l: 'stat1Label' },
  { icon: Trophy, n: 'stat2Num', l: 'stat2Label' },
  { icon: Star, n: 'stat3Num', l: 'stat3Label' },
  { icon: Globe, n: 'stat4Num', l: 'stat4Label' },
];
const EXPLORE = [
  { icon: PlayCircle, qr: 'qr1', l: 'qr1Label' },
  { icon: BarChart3, qr: 'qr2', l: 'qr2Label' },
  { icon: Users, qr: 'qr3', l: 'qr3Label' },
  { icon: Sprout, qr: 'qr4', l: 'qr4Label' },
  { icon: Award, qr: 'qr5', l: 'qr5Label' },
];

export function HeadlinePremium() {
  return (
    <PPage tone="navy">
      <PTab labelId="headline-px.band" taglineId="headline-px.bandSub" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-2 pb-[70px]">
        <div className="grid grid-cols-[1fr_300px] items-start gap-5">
          <div>
            <RText id="headline-px.title" />
            <RText id="headline-px.subtitle" className="mt-1" />
          </div>
          <RImage id="headline-px.hero" rounded="rounded-sm" className="h-[150px]" />
        </div>

        {/* Stat row with gold icon badges */}
        <div className="mt-4 grid grid-cols-4 gap-3 rounded-sm px-3 py-3" style={navyA(0.5)}>
          {STATS.map((s) => (
            <IconStat key={s.n} icon={s.icon} numId={`headline-px.${s.n}`} labelId={`headline-px.${s.l}`} />
          ))}
        </div>

        <div className="mt-4"><RText id="headline-px.intro" className="max-w-[680px]" /></div>

        <div className="mt-4 grid flex-1 grid-cols-[1fr_240px] gap-5">
          <div className="flex flex-col">
            <RText id="headline-px.journeyTitle" />
            <PGoldRule className="my-2 max-w-[90px]" />
            <div className="mt-1 space-y-2.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <NumberStep key={i} n={i} id={`headline-px.j${i}`} />
              ))}
            </div>
            <div className="relative mt-auto pl-7 pt-2">
              <span className="absolute left-0 top-0"><QuoteMark /></span>
              <RText id="headline-px.quote" />
              <RText id="headline-px.quoteBy" className="mt-1" />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <RImage id="headline-px.photo1" rounded="rounded-sm" className="flex-1" />
            <RImage id="headline-px.photo2" rounded="rounded-sm" className="flex-1" />
          </div>
        </div>

        {/* Explore strip */}
        <div className="mt-4 rounded-sm px-4 py-3" style={{ border: `1px solid ${GOLD}40` }}>
          <RText id="headline-px.exploreTitle" className="!text-center" />
          <div className="mt-3 grid grid-cols-5 gap-2">
            {EXPLORE.map((e) => (
              <ExploreItem key={e.qr} icon={e.icon} qrId={`headline-px.${e.qr}`} labelId={`headline-px.${e.l}`} />
            ))}
          </div>
        </div>
      </div>
      <PFooter footerId="headline-px.footer" pageNumId="headline-px.pageNum" />
    </PPage>
  );
}

// ── President's Update (premium, cream page) ────────────────────────
export function PresidentPremium() {
  return (
    <PPage>
      <div className="flex flex-1 min-h-0 gap-7 px-9 pt-9 pb-[64px]">
        {/* Left — letter */}
        <div className="flex w-[55%] flex-col">
          <div className="flex items-baseline gap-3">
            <RText id="president-px.h1a" />
            <RText id="president-px.h1b" />
          </div>
          <div className="mt-1"><RText id="president-px.byline" /></div>
          <PGoldRule className="my-4 max-w-[120px]" />
          <RText id="president-px.body" className="max-w-[430px]" />
          <div className="mt-3"><RText id="president-px.signoff" /></div>
          <RText id="president-px.name" className="mt-1" />
          <RText id="president-px.role" />
          <div className="mt-auto flex items-center gap-3 rounded-sm p-4" style={navy}>
            <div className="rounded-sm bg-white p-2"><RQr id="president-px.stayQr" size={70} /></div>
            <div className="flex-1">
              <RText id="president-px.stayTitle" />
              <RText id="president-px.stayBody" className="mt-1" />
              <RText id="president-px.siteLabel" className="mt-1.5" />
            </div>
          </div>
        </div>
        {/* Right — portrait + board */}
        <div className="flex flex-1 flex-col gap-3">
          <RImage id="president-px.portrait" rounded="rounded-sm" className="h-[225px]" />
          <div className="flex-1 rounded-sm border" style={{ borderColor: `${GOLD}66` }}>
            <div className="px-3 py-2" style={navy}><RText id="president-px.boardTitle" /></div>
            <div className="space-y-2 p-3">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="h-9 w-9 flex-shrink-0">
                    <RImage id={`president-px.memberImg${i}`} rounded="rounded-full" />
                  </div>
                  <RText id={`president-px.member${i}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <PFooter footerId="president-px.footer" pageNumId="president-px.pageNum" />
    </PPage>
  );
}
