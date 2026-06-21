/* Premium template page components (template #2). Isolated from the classic
   pages so template #1 is untouched. Flagship spread: Cover + Aeliana. */

import { Fragment, type ReactNode } from 'react';
import { ArrowUp } from 'lucide-react';
import { PPage, PTab, PFooter, PGoldRule, PREMIUM_CREAM } from './parts';
import { IconStat, NumberStep, ExploreItem, QuoteMark, IconBadge } from './kit';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

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
  { iconId: 'stat1Icon', n: 'stat1Num', l: 'stat1Label' },
  { iconId: 'stat2Icon', n: 'stat2Num', l: 'stat2Label' },
  { iconId: 'stat3Icon', n: 'stat3Num', l: 'stat3Label' },
  { iconId: 'stat4Icon', n: 'stat4Num', l: 'stat4Label' },
];
const EXPLORE = [
  { iconId: 'qr1Icon', qr: 'qr1', l: 'qr1Label' },
  { iconId: 'qr2Icon', qr: 'qr2', l: 'qr2Label' },
  { iconId: 'qr3Icon', qr: 'qr3', l: 'qr3Label' },
  { iconId: 'qr4Icon', qr: 'qr4', l: 'qr4Label' },
  { iconId: 'qr5Icon', qr: 'qr5', l: 'qr5Label' },
];

export function HeadlinePremium() {
  return (
    <PPage tone="navy">
      <PTab labelId="headline-px.band" taglineId="headline-px.bandSub" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-2 pb-[70px]">
        {/* Hero zone — the jockey photo bleeds to the right page edge behind the
            AELIANA title; a navy gradient feathers its inner edge. */}
        <div className="relative" style={{ height: 150 }}>
          <div className="absolute bottom-0 top-0 overflow-hidden" style={{ right: -36, width: 420 }}>
            <RImage id="headline-px.hero" className="absolute inset-0" />
            <div className="absolute inset-y-0 left-0" style={{ width: 180, background: `linear-gradient(90deg, ${NAVY} 14%, rgba(10,35,66,0))` }} />
          </div>
          <div className="relative z-10 max-w-[440px] pt-1">
            <RText id="headline-px.title" />
            <RText id="headline-px.subtitle" className="mt-1" />
          </div>
        </div>

        {/* Stat row with gold icon badges */}
        <div className="mt-4 grid grid-cols-4 gap-3 rounded-sm px-3 py-3" style={navyA(0.5)}>
          {STATS.map((s) => (
            <IconStat key={s.n} iconId={`headline-px.${s.iconId}`} numId={`headline-px.${s.n}`} labelId={`headline-px.${s.l}`} />
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
              <ExploreItem key={e.qr} iconId={`headline-px.${e.iconId}`} qrId={`headline-px.${e.qr}`} labelId={`headline-px.${e.l}`} />
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
  const board = [1, 2, 3, 4, 5, 6, 7];
  return (
    <PPage>
      <div className="flex flex-1 min-h-0 gap-7 px-9 pt-9 pb-[92px]">
        {/* Left — letter */}
        <div className="flex w-[54%] flex-col">
          <div>
            <RText id="president-px.h1a" />
            <RText id="president-px.h1b" />
          </div>
          <div className="mt-1"><RText id="president-px.byline" /></div>
          <PGoldRule className="mt-1.5 mb-4 max-w-[90px]" />
          <RText id="president-px.body" className="max-w-[430px]" />
          <div className="mt-4"><RText id="president-px.signoff" /></div>
          <RText id="president-px.name" className="mt-1" />
          <RText id="president-px.role" className="mt-0.5" />
          <div className="mt-1.5 flex items-center gap-2">
            <RIcon id="president-px.emailIcon" size={14} color={NAVY} className="flex-shrink-0" />
            <RText id="president-px.email" />
          </div>
          {/* Stay connected — anchored to the bottom of the column */}
          <div className="mt-auto flex items-center gap-4 rounded-md p-4" style={navy}>
            <div className="min-w-0 flex-1">
              <RText id="president-px.stayTitle" />
              <RText id="president-px.stayBody" className="mt-1" />
              <div className="mt-2 flex items-center gap-1.5">
                <RIcon id="president-px.siteIcon" size={13} color={GOLD} className="flex-shrink-0" />
                <RText id="president-px.siteLabel" />
              </div>
            </div>
            <div className="rounded-sm bg-white p-2"><RQr id="president-px.stayQr" size={74} /></div>
          </div>
        </div>

        {/* Right — portrait + board */}
        <div className="flex flex-1 flex-col gap-3">
          <RImage id="president-px.portrait" rounded="rounded-sm" className="h-[225px]" />
          <div className="flex flex-1 flex-col overflow-hidden rounded-sm border" style={{ borderColor: `${GOLD}66` }}>
            <div className="px-3 py-2" style={navy}><RText id="president-px.boardTitle" /></div>
            <div className="flex flex-1 flex-col justify-between gap-2 p-3">
              {board.map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="h-14 w-14 flex-shrink-0">
                    <RImage id={`president-px.memberImg${i}`} rounded="rounded-sm" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <RText id={`president-px.memberName${i}`} />
                    <RText id={`president-px.memberRole${i}`} className="mt-0.5" />
                    <div className="mt-1 flex items-center gap-1">
                      <RIcon id={`president-px.memberIcon${i}`} size={10} color={NAVY} className="flex-shrink-0" />
                      <RText id={`president-px.memberEmail${i}`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Page number — the printed "2", centered above the brand band */}
      <div className="absolute inset-x-0" style={{ bottom: 62 }}>
        <RText id="president-px.pageNum" />
      </div>
      {/* NZTROF brand band — wordmark + federation name */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-4 px-9 py-3" style={navy}>
        <RText id="president-px.brand" />
        <div className="border-l pl-4" style={{ borderColor: `${GOLD}55` }}>
          <RText id="president-px.brandSub" />
        </div>
      </div>
    </PPage>
  );
}

// ── From the Editor (premium, cream page) ───────────────────────────
const SOCIALS = ['editor-px.fbIcon', 'editor-px.igIcon', 'editor-px.ytIcon'];

export function EditorPremium() {
  const members = [1, 2, 3, 4];
  return (
    <PPage>
      {/* Faint horse watermark behind the lower-left content */}
      <div className="absolute" style={{ bottom: 150, left: 4, width: 300, height: 200, opacity: 0.05, filter: 'grayscale(1)' }}>
        <RImage id="editor-px.watermark" />
      </div>

      <div className="relative flex flex-1 min-h-0 gap-8 px-9 pt-9 pb-[82px]">
        {/* Left — title + letter + welcome */}
        <div className="flex w-[52%] flex-col">
          <div className="flex items-start gap-2">
            <RText id="editor-px.h1a" />
            <div className="mt-1"><RText id="editor-px.interim" /></div>
          </div>
          <RText id="editor-px.h1b" />
          <div className="mt-1"><RText id="editor-px.byline" /></div>
          <PGoldRule className="mt-1.5 mb-4 max-w-[120px]" />

          <RText id="editor-px.body" className="max-w-[400px]" />

          {/* Signature + scan-to-email QR */}
          <div className="mt-3 flex items-end gap-5">
            <div>
              <RText id="editor-px.signoff" />
              <RText id="editor-px.name" className="mt-1" />
              <RText id="editor-px.role" className="mt-0.5" />
              <div className="mt-1.5 flex items-center gap-2">
                <RIcon id="editor-px.emailIcon" size={13} color={NAVY} className="flex-shrink-0" />
                <RText id="editor-px.email" />
              </div>
            </div>
            <div className="mb-1 flex items-center gap-2">
              <div className="rounded-sm bg-white p-1.5 ring-1 ring-black/5"><RQr id="editor-px.emailQr" size={54} /></div>
              <RText id="editor-px.emailQrLabel" />
            </div>
          </div>

          {/* Welcome new members */}
          <div className="mt-16">
            <RText id="editor-px.welcomeTitle" />
            <PGoldRule className="mt-1.5 mb-2.5 max-w-[150px]" />
            <RText id="editor-px.welcomeIntro" />
            <div className="mt-2.5 space-y-2.5">
              {members.map((i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={navy} />
                  <RText id={`editor-px.member${i}`} />
                </div>
              ))}
            </div>
            <div className="mt-2.5"><RText id="editor-px.welcomeOutro" /></div>
          </div>
        </div>

        {/* Right — on-the-cover rail + website + follow us */}
        <div className="flex flex-1 flex-col gap-5">
          <div>
            <RText id="editor-px.coverKicker" />
            <RText id="editor-px.coverTitle" className="mt-1.5" />
            <RText id="editor-px.coverBody" className="mt-2" />
          </div>
          <RImage id="editor-px.coverImg" rounded="rounded-sm" className="h-[214px]" />
          <div className="flex items-center gap-3">
            <div className="rounded-sm bg-white p-1.5 ring-1 ring-black/5"><RQr id="editor-px.coverQr" size={56} /></div>
            <RText id="editor-px.coverQrLabel" />
          </div>

          {/* Visit our website */}
          <div className="flex items-center gap-3 rounded-md border p-4" style={{ borderColor: `${GOLD}66` }}>
            <div className="min-w-0 flex-1">
              <RText id="editor-px.webTitle" />
              <RText id="editor-px.webUrl" className="mt-0.5" />
              <RText id="editor-px.webBody" className="mt-1.5" />
            </div>
            <div className="rounded-sm bg-white p-1.5 ring-1 ring-black/5"><RQr id="editor-px.webQr" size={60} /></div>
          </div>

          {/* Follow us */}
          <div className="mt-1 rounded-md p-4" style={navy}>
            <RText id="editor-px.followTitle" />
            <RText id="editor-px.followBody" className="mt-1.5" />
            <div className="mt-3 flex items-center gap-2.5">
              {SOCIALS.map((id) => (
                <span key={id} className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }}>
                  <RIcon id={id} size={17} color="#ffffff" />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Decorative fountain pen straddling the title (swap for the brand pen art) */}
      <div className="absolute" style={{ top: 16, left: 280, transform: 'rotate(12deg)' }}>
        <RIcon id="editor-px.penIcon" size={140} color={GOLD} strokeWidth={1.5} />
      </div>

      {/* Page number — printed "3", centered above the band */}
      <div className="absolute inset-x-0" style={{ bottom: 60 }}>
        <RText id="editor-px.pageNum" />
      </div>
      {/* Subscription-rates band */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-5 px-9 py-3.5" style={navy}>
        <RText id="editor-px.subTitle" />
        <span className="h-4 w-px" style={{ background: `${GOLD}66` }} />
        <RText id="editor-px.subSingle" />
        <span className="h-4 w-px" style={{ background: `${GOLD}66` }} />
        <RText id="editor-px.subDouble" />
      </div>
    </PPage>
  );
}

// ── Important Discussion (premium, TWO-TONE infographic page) ───────
// Light top zone (header, headline, tree) over a navy lower zone that carries
// the white infographic cards — matching the printed bulletin spread.
const D_TOP_BG = '#f6f4ee'; // light top zone
const D_CARD = '#ffffff';
const D_BADGE = '#e7ebf2';
const DRIVERS = ['d1', 'd2', 'd3', 'd4'];
const CYCLE = ['c1', 'c2', 'c3', 'c4'];
const DATA = ['data1', 'data2', 'data3', 'data4'];
const D_TIERS = [1, 2, 3];
// Pyramid tiers as stacked trapezoids (apex → base) so they read as one triangle.
const PYR = [
  { clip: 'polygon(38% 0, 62% 0, 70% 100%, 30% 100%)', bg: GOLD, ic: '#ffffff' },
  { clip: 'polygon(30% 0, 70% 0, 82% 100%, 18% 100%)', bg: NAVY, ic: '#ffffff' },
  { clip: 'polygon(18% 0, 82% 0, 100% 100%, 0 100%)', bg: '#aeb8c6', ic: NAVY },
];

/** White infographic card: navy header strip (gold title) + white body, on navy. */
function DCard({ titleId, children, className }: { titleId: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col overflow-hidden rounded-sm ${className ?? ''}`} style={{ background: D_CARD }}>
      <div className="px-3 py-1.5" style={{ background: NAVY, borderBottom: `1px solid ${GOLD}55` }}><RText id={titleId} /></div>
      <div className="flex flex-1 flex-col p-3">{children}</div>
    </div>
  );
}

/** Dark-navy icon badge (white glyph) + navy title + grey description. */
function DiscussionLine({ id, circle }: { id: string; circle?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={`mt-px flex h-8 w-8 flex-shrink-0 items-center justify-center ${circle ? 'rounded-full' : 'rounded-[7px]'}`} style={{ background: NAVY }}>
        <RIcon id={`discussion-px.${id}Icon`} size={16} color="#ffffff" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <RText id={`discussion-px.${id}Title`} />
        <RText id={`discussion-px.${id}Desc`} className="mt-0.5" />
      </div>
    </div>
  );
}

export function DiscussionPremium() {
  return (
    <PPage>
      {/* ── TOP — light zone: header + headline + tree ── */}
      <div className="relative px-9 pt-6 pb-4" style={{ background: D_TOP_BG }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex rounded-full px-3 py-1" style={{ background: GOLD }}>
              <RText id="discussion-px.pill" />
            </span>
            <div className="flex items-center gap-1.5">
              <RIcon id="discussion-px.discussIcon" size={14} color={NAVY} className="flex-shrink-0" />
              <RText id="discussion-px.bandLabel" />
            </div>
          </div>
          <RText id="discussion-px.tagline" className="text-right" />
        </div>
        <div className="mt-3 grid grid-cols-[1fr_240px] items-start gap-5">
          <div>
            <RText id="discussion-px.h1a" />
            <RText id="discussion-px.h1b" />
            <RText id="discussion-px.h1c" />
            <div className="mt-2"><RText id="discussion-px.lead" /></div>
            <RText id="discussion-px.body" className="mt-2 max-w-[440px]" />
          </div>
          <RImage id="discussion-px.treeImg" rounded="rounded-sm" className="h-[210px]" />
        </div>
      </div>

      {/* ── BOTTOM — navy zone: infographic cards ── */}
      <div className="relative flex flex-1 min-h-0 flex-col gap-2.5 px-9 pt-3 pb-3" style={{ background: NAVY }}>
        {/* Ownership pyramid (wide) + structural cycle */}
        <div className="grid grid-cols-[1fr_280px] gap-2.5">
          <DCard titleId="discussion-px.pyramidTitle">
            <div className="grid grid-cols-[244px_1fr] gap-3">
              {/* pyramid graphic + tier labels */}
              <div>
                <div className="flex gap-2.5">
                  <div className="w-[132px] flex-shrink-0">
                    {PYR.map((t, idx) => (
                      <div key={idx} className="flex h-[40px] items-center justify-center" style={{ background: t.bg, clipPath: t.clip }}>
                        <RIcon id={`discussion-px.tier${idx + 1}Icon`} size={13} color={t.ic} strokeWidth={2.1} />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-1 flex-col">
                    {D_TIERS.map((i) => (
                      <div key={i} className="flex h-[40px] flex-col justify-center">
                        <RText id={`discussion-px.tier${i}Name`} />
                        <RText id={`discussion-px.tier${i}Sub`} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-2 rounded-[3px] px-2.5 py-2 text-center" style={{ background: '#aeb8c6' }}>
                  <RText id="discussion-px.tier4Name" />
                  <RText id="discussion-px.tier4Sub" className="mt-0.5" />
                </div>
              </div>
              {/* owner drivers */}
              <div>
                <RText id="discussion-px.driversIntro" />
                <div className="mt-2 space-y-2">
                  {DRIVERS.map((id) => <DiscussionLine key={id} id={id} />)}
                </div>
              </div>
            </div>
          </DCard>

          <DCard titleId="discussion-px.cycleTitle">
            <div className="flex flex-1 flex-col justify-between py-1">
              {CYCLE.map((id, idx) => (
                <Fragment key={id}>
                  {idx > 0 && (
                    <div className="pl-[14px]"><ArrowUp size={13} color={NAVY} strokeWidth={2.5} /></div>
                  )}
                  <DiscussionLine id={id} circle />
                </Fragment>
              ))}
            </div>
          </DCard>
        </div>

        {/* What the data is telling us + every-dollar box */}
        <div className="grid grid-cols-[1fr_176px] gap-2.5">
          <DCard titleId="discussion-px.dataTitle">
            <div className="grid flex-1 grid-cols-4 gap-3">
              {DATA.map((id) => (
                <div key={id}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-[8px]" style={{ background: NAVY }}>
                    <RIcon id={`discussion-px.${id}Icon`} size={20} color="#ffffff" strokeWidth={2} />
                  </span>
                  <RText id={`discussion-px.${id}Title`} className="mt-1.5" />
                  <RText id={`discussion-px.${id}Desc`} className="mt-1" />
                </div>
              ))}
            </div>
          </DCard>
          <div className="relative overflow-hidden rounded-sm" style={{ border: `1px solid ${GOLD}55` }}>
            <RImage id="discussion-px.dollarImg" className="absolute inset-0" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(28,16,4,0.25), rgba(18,10,2,0.7))' }} />
            <div className="relative flex h-full items-end p-3"><RText id="discussion-px.dollarQuote" /></div>
          </div>
        </div>

        {/* What must change + the NZ model */}
        <div className="grid flex-1 grid-cols-2 gap-2.5">
          <DCard titleId="discussion-px.changeTitle">
            <div className="flex flex-1 flex-col justify-evenly gap-2 py-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-start gap-2">
                  <RIcon id={`discussion-px.change${i}Icon`} size={16} color={GOLD} strokeWidth={2.2} className="mt-px flex-shrink-0" />
                  <RText id={`discussion-px.change${i}`} />
                </div>
              ))}
            </div>
          </DCard>
          <DCard titleId="discussion-px.blueprintTitle">
            <div className="flex flex-1 flex-col justify-evenly gap-3 py-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold" style={{ background: GOLD, color: NAVY }}>
                    {i}
                  </span>
                  <div className="min-w-0">
                    <RText id={`discussion-px.step${i}Title`} />
                    <RText id={`discussion-px.step${i}Sub`} className="mt-0.5" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-sm p-2" style={{ background: D_BADGE }}>
              <div className="flex-shrink-0 rounded-sm bg-white p-1"><RQr id="discussion-px.qr" size={46} /></div>
              <RText id="discussion-px.qrNote" />
            </div>
          </DCard>
        </div>
      </div>

      {/* ── Footer — navy band ── */}
      <div className="relative flex items-center gap-2 px-9 py-2.5" style={{ background: NAVY, borderTop: `1px solid ${GOLD}40` }}>
        <RIcon id="discussion-px.footerIcon" size={15} color={GOLD} className="flex-shrink-0" />
        <RText id="discussion-px.footer" />
      </div>
    </PPage>
  );
}

// ── Young Owners Feature (premium, cream page) ──────────────────────
// The next generation of racing: headline + hero, navy pull-quote, Charlie King
// profile + the next-wave list, three gold-icon pathways, and a starter-guide /
// balancing / social row — mirroring the printed Young Owners spread.
const PATHWAYS = [
  { icon: 'path1Icon', title: 'path1Title', body: 'path1Body' },
  { icon: 'path2Icon', title: 'path2Title', body: 'path2Body' },
  { icon: 'path3Icon', title: 'path3Title', body: 'path3Body' },
];

export function YoungOwnersPremium() {
  return (
    <PPage>
      {/* Header band — section label + gold accent icon */}
      <div className="flex items-center justify-between px-9 py-2.5" style={navy}>
        <RText id="young-owners-px.band" />
        <RIcon id="young-owners-px.bandIcon" size={18} color={GOLD} className="flex-shrink-0" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[58px]">
        {/* Hero zone — the photo bleeds to the top-right page edge BEHIND the
            headline, a cream gradient feathers its left side into the page so
            the headline reads over the blend, and the navy pull-quote overlaps
            the lower-right of the image (matching the printed spread). */}
        <div className="relative" style={{ height: 296 }}>
          {/* Full-bleed photo — right:-36 cancels the px-9 padding to reach the
              page edge; the gradient blends its inner edge into the cream. */}
          <div className="absolute bottom-0 top-0 overflow-hidden" style={{ right: -36, width: 372 }}>
            <RImage id="young-owners-px.hero" className="absolute inset-0" />
            <div
              className="absolute inset-y-0 left-0"
              style={{ width: 150, background: `linear-gradient(90deg, ${PREMIUM_CREAM} 12%, rgba(243,236,218,0))` }}
            />
          </div>

          {/* Headline — in front of the photo */}
          <div className="relative z-10 max-w-[430px] pt-1">
            <RText id="young-owners-px.h1a" />
            <RText id="young-owners-px.h1b" />
            <RText id="young-owners-px.h1c" />
            <div className="mt-1"><RText id="young-owners-px.sub" /></div>
            <RText id="young-owners-px.body" className="mt-3 max-w-[260px]" />
          </div>

          {/* Pull quote — navy box overlapping the lower-right of the photo */}
          <div
            className="absolute bottom-0 right-0 z-20 rounded-sm px-6 py-3.5"
            style={{ ...navy, width: 312, borderLeft: `4px solid ${GOLD}` }}
          >
            <span className="absolute left-3 top-1"><QuoteMark size={30} /></span>
            <RText id="young-owners-px.quote" className="pl-5" />
          </div>
        </div>

        {/* Meet Charlie King + The next wave */}
        <div className="mt-4 grid grid-cols-[1fr_236px] items-stretch gap-5">
          {/* Charlie — photo on the left; heading, body, quote + QR on the right */}
          <div className="grid grid-cols-[150px_1fr] gap-4">
            <RImage id="young-owners-px.charlieImg" rounded="rounded-sm" className="h-full min-h-[180px]" />
            <div>
              <RText id="young-owners-px.charlieTitle" />
              <PGoldRule className="mb-2 mt-1.5 max-w-[120px]" />
              <RText id="young-owners-px.charlieBody" />
              <RText id="young-owners-px.charlieQuote" className="mt-2" />
              <div className="mt-3 flex items-center gap-3">
                <div className="rounded-sm bg-white p-1 ring-1 ring-black/5"><RQr id="young-owners-px.charlieQr" size={52} /></div>
                <div className="flex items-center gap-2">
                  <RIcon id="young-owners-px.charliePlayIcon" size={20} className="flex-shrink-0" />
                  <div>
                    <RText id="young-owners-px.charlieScan" />
                    <RText id="young-owners-px.charlieScanSub" className="mt-0.5" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* The next wave — photo on top, bullets in the middle, sign-off last */}
          <div className="flex flex-col rounded-md p-4" style={navy}>
            <RText id="young-owners-px.waveTitle" />
            <PGoldRule className="mb-2.5 mt-1.5 max-w-[80px]" />
            <RImage id="young-owners-px.waveImg" rounded="rounded-sm" className="h-[62px]" />
            <RText id="young-owners-px.waveBody" className="mt-3" />
            <div className="mt-auto pt-2"><RText id="young-owners-px.waveOutro" /></div>
          </div>
        </div>

        {/* Pathways into ownership — three gold-icon columns + image */}
        <div className="mt-4">
          <RText id="young-owners-px.pathTitle" />
          <PGoldRule className="mb-3 mt-1.5 max-w-[150px]" />
          <div className="grid grid-cols-[1fr_196px] gap-5">
            <div className="grid grid-cols-3 gap-4">
              {PATHWAYS.map((p) => (
                <div key={p.icon} className="flex flex-col gap-2">
                  <IconBadge iconId={`young-owners-px.${p.icon}`} size={40} variant="outline" />
                  <RText id={`young-owners-px.${p.title}`} />
                  <RText id={`young-owners-px.${p.body}`} />
                </div>
              ))}
            </div>
            <RImage id="young-owners-px.pathImg" rounded="rounded-sm" className="h-[124px]" />
          </div>
        </div>

        {/* Starter guide + balancing work + social culture */}
        <div className="mt-auto grid grid-cols-[230px_1fr_1fr] items-stretch gap-4 pt-4">
          <div className="flex items-center gap-3 rounded-md p-3.5" style={navy}>
            <div className="flex-shrink-0 rounded-sm bg-white p-1.5"><RQr id="young-owners-px.guideQr" size={58} /></div>
            <div className="min-w-0">
              <RText id="young-owners-px.guideTitle" />
              <RText id="young-owners-px.guideBody" className="mt-1" />
            </div>
          </div>
          <div>
            <RText id="young-owners-px.balanceTitle" />
            <RImage id="young-owners-px.balanceImg" rounded="rounded-sm" className="mt-2 h-[60px]" />
            <RText id="young-owners-px.balanceBody" className="mt-2" />
          </div>
          <div>
            <RText id="young-owners-px.socialTitle" />
            <RText id="young-owners-px.socialBody" className="mt-2" />
          </div>
        </div>
      </div>

      <PFooter footerId="young-owners-px.footer" pageNumId="young-owners-px.pageNum" />
    </PPage>
  );
}
