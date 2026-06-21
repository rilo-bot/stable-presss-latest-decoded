/**
 * Premium template — Leaderboards & Competitions page component (template #2).
 *
 * "THE COMPETITION HEATS UP!" — racing hero photo, THREE styled leaderboard
 * tables (navy header strip with gold/white headers + five hairline-separated
 * ranked rows), a "Get Involved!" row of three icon+QR columns, and a
 * competition-partners logo row. Mirrors the classic LeaderboardsPage,
 * restyled premium. Region ids match leaderboards.bp.ts.
 */

import { IconBadge } from './kit';
import { PPage, PFooter, PGoldRule } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const navy = { background: NAVY };

/** Styled leaderboard table: navy title strip + gold/white column head, then
 *  five hairline-separated ranked rows (gold rank · name · right-aligned value). */
function LbTable({ p }: { p: string }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-sm border" style={{ borderColor: `${GOLD}55` }}>
      <div className="px-3 py-2" style={navy}>
        <RText id={`${p}Title`} />
      </div>
      <div
        className="grid grid-cols-[28px_1fr_auto] gap-2 px-3 py-1.5"
        style={{ background: '#0d1f3a', borderBottom: `1px solid ${GOLD}40` }}
      >
        <RText id={`${p}Col1`} />
        <RText id={`${p}Col2`} />
        <RText id={`${p}Col3`} />
      </div>
      <div className="flex-1 divide-y" style={{ background: '#fbf6ec', borderColor: `${GOLD}22` }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="grid grid-cols-[28px_1fr_auto] items-center gap-2 px-3 py-2">
            <RText id={`${p}R${i}Pos`} />
            <RText id={`${p}R${i}Name`} />
            <RText id={`${p}R${i}Val`} />
          </div>
        ))}
      </div>
    </div>
  );
}

const GETS = [
  { icon: 'get1Icon', body: 'get1', qr: 'get1Qr' },
  { icon: 'get2Icon', body: 'get2', qr: 'get2Qr' },
  { icon: 'get3Icon', body: 'get3', qr: 'get3Qr' },
];
const PARTNERS = ['partner1', 'partner2', 'partner3', 'partner4'];

export function LeaderboardsPremium() {
  return (
    <PPage>
      {/* Header band — section label + gold accent icon */}
      <div className="flex items-center justify-between px-9 py-2.5" style={navy}>
        <RText id="leaderboards-px.band" />
        <RIcon id="leaderboards-px.bandIcon" size={18} color={GOLD} className="flex-shrink-0" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[64px]">
        {/* Headline + racing hero */}
        <div className="grid grid-cols-[1fr_300px] items-start gap-6">
          <div>
            <RText id="leaderboards-px.h1a" />
            <RText id="leaderboards-px.h1b" />
            <div className="mt-1"><RText id="leaderboards-px.sub" /></div>
            <RText id="leaderboards-px.intro" className="mt-2 max-w-[420px]" />
          </div>
          <RImage id="leaderboards-px.heroImg" rounded="rounded-sm" className="h-[150px]" />
        </div>

        {/* Three leaderboard tables */}
        <div className="mt-5 grid grid-cols-3 gap-4">
          <LbTable p="leaderboards-px.lb1" />
          <LbTable p="leaderboards-px.lb2" />
          <LbTable p="leaderboards-px.lb3" />
        </div>

        {/* Get Involved! */}
        <div className="mt-5">
          <RText id="leaderboards-px.getTitle" />
          <PGoldRule className="mb-3 mt-1.5 max-w-[110px]" />
          <div className="grid grid-cols-3 gap-4">
            {GETS.map((g) => (
              <div
                key={g.icon}
                className="flex flex-col items-center gap-2.5 rounded-sm border p-3.5 text-center"
                style={{ borderColor: `${GOLD}55` }}
              >
                <IconBadge iconId={`leaderboards-px.${g.icon}`} size={38} variant="outline" />
                <RText id={`leaderboards-px.${g.body}`} className="!text-center" />
                <div className="mt-auto rounded-sm bg-white p-2"><RQr id={`leaderboards-px.${g.qr}`} size={66} /></div>
              </div>
            ))}
          </div>
        </div>

        {/* Competition partners logo row */}
        <div className="mt-auto rounded-sm border p-4" style={{ borderColor: `${GOLD}55` }}>
          <RText id="leaderboards-px.partnersTitle" className="!text-center" />
          <div className="mt-3 grid grid-cols-4 gap-2">
            {PARTNERS.map((k) => (
              <div key={k} className="flex items-center justify-center rounded-sm bg-white px-1 py-2.5">
                <RText id={`leaderboards-px.${k}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <PFooter footerId="leaderboards-px.footer" pageNumId="leaderboards-px.pageNum" />
    </PPage>
  );
}
