/* Premium Back Cover page (template #2) — `back-cover-px`.
   Full NAVY "OWNERS OF WINNERS" page: masthead + hero horse photo, big gold/
   white title, a 20-row ranked table, a "Share the Joy. Own the Journey."
   register-as-member QR block, a "Thank You to Our Premium Partners" logo row,
   and a bottom "OWN THE DREAM. SHARE THE THRILL." title band. */

import { PPage, PGoldRule } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const PANEL = '#0d1f3a'; // slightly lighter navy for the table / share panels

export function BackCoverPremium() {
  const rows = Array.from({ length: 20 }, (_, i) => i + 1);
  const partners = [1, 2, 3, 4, 5];
  return (
    <PPage tone="navy">
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-8 pb-[54px]">
        {/* Masthead + hero */}
        <div className="flex items-start justify-between">
          <div>
            <RText id="back-cover-px.masthead" />
            <RText id="back-cover-px.mastheadSub" className="mt-1" />
          </div>
          <div className="overflow-hidden rounded-sm" style={{ border: `1px solid ${GOLD}55` }}>
            <RImage id="back-cover-px.heroImg" rounded="" className="h-[120px] w-[230px]" />
          </div>
        </div>

        {/* Big title */}
        <div className="mt-4">
          <RText id="back-cover-px.h1a" />
          <RText id="back-cover-px.h1b" />
          <PGoldRule className="mt-2 mb-2 max-w-[200px]" />
          <RText id="back-cover-px.sub" />
        </div>

        {/* Ranked table (20 rows) */}
        <div className="mt-3 flex-1 overflow-hidden rounded-sm" style={{ background: PANEL, border: `1px solid ${GOLD}40` }}>
          <div className="border-b px-3 py-2" style={{ borderColor: `${GOLD}55`, background: NAVY }}>
            <RText id="back-cover-px.tableHead" />
          </div>
          <div className="divide-y divide-white/5">
            {rows.map((i) => (
              <div key={i} className="px-3 py-[6px]" style={{ background: i % 2 ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
                <RText id={`back-cover-px.row${i}`} className="!text-white" />
              </div>
            ))}
          </div>
        </div>
        <RText id="back-cover-px.note" className="mt-2" />

        {/* Share the Joy — register QR block */}
        <div className="mt-4 grid grid-cols-[1fr_96px] items-center gap-4 rounded-sm p-4" style={{ background: PANEL, border: `1px solid ${GOLD}40` }}>
          <div>
            <RText id="back-cover-px.shareTitle" />
            <PGoldRule className="my-2 max-w-[120px]" />
            <RText id="back-cover-px.shareBody" />
            <div className="mt-2 flex items-center gap-2">
              <RIcon id="back-cover-px.bandIcon" size={15} color={GOLD} className="flex-shrink-0" />
              <RText id="back-cover-px.registerNote" />
            </div>
          </div>
          <div className="rounded-sm bg-white p-1.5"><RQr id="back-cover-px.registerQr" size={82} /></div>
        </div>

        {/* Premium partners logo row */}
        <div className="mt-3 rounded-sm border p-3" style={{ borderColor: `${GOLD}40` }}>
          <RText id="back-cover-px.partnersTitle" className="!text-center" />
          <div className="mt-2 grid grid-cols-5 gap-2">
            {partners.map((i) => (
              <div key={i} className="flex items-center justify-center rounded-sm bg-white px-1 py-2.5">
                <RText id={`back-cover-px.partner${i}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom title band — gold "OWN THE DREAM. SHARE THE THRILL." */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-center justify-between px-9 py-3"
        style={{ background: NAVY, borderTop: `1px solid ${GOLD}55` }}
      >
        <div className="flex items-center gap-2">
          <RIcon id="back-cover-px.bandIcon" size={16} color={GOLD} className="flex-shrink-0" />
          <RText id="back-cover-px.footer" />
        </div>
        <RText id="back-cover-px.pageNum" />
      </div>
    </PPage>
  );
}
