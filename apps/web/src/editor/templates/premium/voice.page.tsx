/* Premium Owners' Voice page (template #2) — `owners-voice-px`.
   "THE OWNERS' VOICE" — hero photo, four feature columns (each gold icon +
   What You Said + Ideas for Change), a navy "Let's Build a Better Future" block
   with a boardroom photo + Have Your Say QR, and a "Recent Topics Raised by
   Owners" gold-icon row. Premium cream surface, pinned navy footer. */

import { IconBadge } from './kit';
import { PPage, PFooter, PGoldRule, PREMIUM_CREAM } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const navy = { background: NAVY };

const COLS = [1, 2, 3, 4];
const TOPICS = [1, 2, 3, 4, 5];

export function VoicePremium() {
  return (
    <PPage>
      {/* Header band — section label + gold accent icon */}
      <div className="flex items-center justify-between px-9 py-2.5" style={navy}>
        <div className="flex items-center gap-2">
          <RIcon id="owners-voice-px.bandIcon" size={17} color={GOLD} className="flex-shrink-0" />
          <RText id="owners-voice-px.band" />
        </div>
        <RText id="owners-voice-px.bandSub" className="text-right" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[62px]">
        {/* Hero zone — crowd photo bleeds to the top-right page edge, blended
            into the cream so the headline reads over it. */}
        <div className="relative" style={{ height: 166 }}>
          <div className="absolute bottom-0 top-0 overflow-hidden" style={{ right: -36, width: 320 }}>
            <RImage id="owners-voice-px.heroImg" className="absolute inset-0" />
            <div className="absolute inset-y-0 left-0" style={{ width: 150, background: `linear-gradient(90deg, ${PREMIUM_CREAM} 14%, rgba(243,236,218,0))` }} />
          </div>
          <div className="relative z-10 max-w-[440px] pt-1">
            <RText id="owners-voice-px.h1a" />
            <RText id="owners-voice-px.h1b" />
            <PGoldRule className="mt-2 mb-1 max-w-[120px]" />
            <div className="mt-1"><RText id="owners-voice-px.sub" /></div>
            <RText id="owners-voice-px.intro" className="mt-2 max-w-[320px]" />
          </div>
        </div>

        {/* Four feature columns — gold icon + What You Said + Ideas for Change */}
        <div className="mt-5 grid flex-1 grid-cols-4 gap-3">
          {COLS.map((i) => (
            <div
              key={i}
              className="flex flex-col overflow-hidden rounded-sm border"
              style={{ borderColor: `${GOLD}55`, background: PREMIUM_CREAM }}
            >
              <div className="flex items-center gap-2 px-3 py-2" style={{ ...navy, borderBottom: `1px solid ${GOLD}40` }}>
                <IconBadge iconId={`owners-voice-px.col${i}Icon`} size={26} variant="outline" />
                <RText id={`owners-voice-px.col${i}Title`} />
              </div>
              <div className="flex-1 space-y-2.5 p-3">
                <RText id={`owners-voice-px.col${i}Said`} />
                <PGoldRule className="max-w-[50px]" />
                <RText id={`owners-voice-px.col${i}Ideas`} />
              </div>
            </div>
          ))}
        </div>

        {/* Let's Build a Better Future — navy block + boardroom photo + QR */}
        <div className="mt-4 grid grid-cols-[1fr_220px] items-stretch gap-4 rounded-md p-4" style={navy}>
          <div className="flex flex-col">
            <RText id="owners-voice-px.buildTitle" />
            <PGoldRule className="my-2 max-w-[120px]" />
            <RText id="owners-voice-px.buildBody" />
            <div className="mt-auto flex items-center gap-3 pt-3">
              <div className="rounded-sm bg-white p-1.5"><RQr id="owners-voice-px.sayQr" size={58} /></div>
              <RText id="owners-voice-px.sayNote" />
            </div>
          </div>
          <RImage id="owners-voice-px.boardImg" rounded="rounded-sm" className="h-full min-h-[140px]" />
        </div>

        {/* Recent Topics Raised by Owners — gold-icon row */}
        <div className="mt-4 rounded-sm border p-3" style={{ borderColor: `${GOLD}55` }}>
          <RText id="owners-voice-px.topicsTitle" />
          <div className="mt-2.5 grid grid-cols-5 gap-3">
            {TOPICS.map((i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 text-center">
                <IconBadge iconId={`owners-voice-px.topic${i}Icon`} size={30} />
                <RText id={`owners-voice-px.topic${i}`} className="!text-center" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <PFooter footerId="owners-voice-px.footer" pageNumId="owners-voice-px.pageNum" />
    </PPage>
  );
}
