/* Page templates 19–24: Predictions, Predictions Follow-up, Ownership
   Education, Winning Moments, Owners' Voice, Back Cover. Full-height layouts. */

import { Page, Band, Footer, GoldRule, Disc, Card } from './parts';
import { RText, RImage, RQr } from '../components/Region';
import { NAVY, GOLD } from './styles';

const navy = { background: NAVY };

// ── 19. Predictions ─────────────────────────────────────────────────
function PredCol({ p }: { p: string }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-sm border" style={{ borderColor: `${GOLD}55` }}>
      <div className="px-3 py-2" style={navy}><RText id={`${p}Title`} /></div>
      <RImage id={`${p}Img`} rounded="" className="h-[150px]" />
      <div className="flex flex-1 flex-col gap-3 p-3">
        {[1, 2, 3].map((i) => (
          <RText key={i} id={`${p}I${i}`} />
        ))}
        <div className="mt-auto flex justify-center rounded-sm bg-white p-1.5"><RQr id={`${p}Qr`} size={58} /></div>
      </div>
    </div>
  );
}

export function PredictionsPage() {
  return (
    <Page>
      <Band id="predictions.band" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <div className="grid grid-cols-[1fr_190px] gap-6">
          <div>
            <RText id="predictions.h1a" />
            <RText id="predictions.h1b" />
            <div className="mt-1"><RText id="predictions.sub" /></div>
            <RText id="predictions.intro" className="mt-2 max-w-[440px]" />
          </div>
          <div className="flex items-center justify-center rounded-full p-5" style={navy}>
            <RText id="predictions.badge" className="!text-center" />
          </div>
        </div>

        <div className="mt-6 grid flex-1 grid-cols-3 gap-4">
          <PredCol p="predictions.p1" />
          <PredCol p="predictions.p2" />
          <PredCol p="predictions.p3" />
        </div>

        <div className="mt-5 rounded-sm border p-4 text-center" style={{ borderColor: `${GOLD}55` }}>
          <RText id="predictions.partners" className="text-center" />
        </div>
      </div>
      <Footer footerId="predictions.footer" pageNumId="predictions.pageNum" />
    </Page>
  );
}

// ── 20. Predictions Follow-up ───────────────────────────────────────
export function FollowupPage() {
  return (
    <Page>
      <Band id="predictions-followup.band" subId="predictions-followup.bandSub" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <RText id="predictions-followup.h1a" />
        <RText id="predictions-followup.h1b" />
        <div className="mt-1"><RText id="predictions-followup.sub" /></div>
        <RText id="predictions-followup.body" className="mt-2 max-w-[540px]" />

        <div className="mt-5 grid grid-cols-[1fr_240px] gap-5">
          <div className="rounded-sm p-4" style={navy}>
            <RText id="predictions-followup.scoreTitle" />
            <div className="mt-3 space-y-3">
              {['score1', 'score2', 'score3'].map((k) => (
                <div key={k} className="rounded-sm bg-white/90 px-3 py-2.5"><RText id={`predictions-followup.${k}`} /></div>
              ))}
            </div>
          </div>
          <Card className="flex flex-col">
            <RText id="predictions-followup.topTitle" />
            <RImage id="predictions-followup.topImg" rounded="rounded-sm" className="my-2 flex-1 min-h-[110px]" />
            <RText id="predictions-followup.topBody" />
          </Card>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-4">
          <Card>
            <RText id="predictions-followup.winsTitle" />
            <RText id="predictions-followup.winsBody" className="mt-2" />
          </Card>
          <Card>
            <RText id="predictions-followup.blackTitle" />
            <RText id="predictions-followup.blackBody" className="mt-2" />
          </Card>
          <Card>
            <RText id="predictions-followup.auctionTitle" />
            <RText id="predictions-followup.auctionBody" className="mt-2" />
          </Card>
        </div>

        <div className="mt-5 flex-1">
          <div className="rounded-sm px-4 py-2.5" style={navy}><RText id="predictions-followup.tipstersTitle" /></div>
          <Card className="mt-2"><RText id="predictions-followup.tipsters" /></Card>
        </div>

        <div className="mt-auto flex items-center gap-3">
          <div className="rounded-sm bg-white p-1"><RQr id="predictions-followup.nextQr" size={54} /></div>
          <RText id="predictions-followup.nextNote" />
        </div>
      </div>
      <Footer footerId="predictions-followup.footer" pageNumId="predictions-followup.pageNum" />
    </Page>
  );
}

// ── 21. Ownership Education ─────────────────────────────────────────
export function EducationPage() {
  return (
    <Page>
      <Band id="ownership-education.band" subId="ownership-education.bandSub" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <RText id="ownership-education.h1a" />
        <RText id="ownership-education.h1b" />
        <div className="mt-1"><RText id="ownership-education.sub" /></div>
        <RText id="ownership-education.body" className="mt-2 max-w-[540px]" />

        <div className="mt-6 grid grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="flex flex-col">
              <div className="mb-2"><Disc>{i}</Disc></div>
              <RText id={`ownership-education.step${i}`} />
            </Card>
          ))}
        </div>

        <RImage id="ownership-education.photoStrip" rounded="rounded-sm" className="mt-6 flex-1 min-h-[150px]" />

        <div className="mt-6 rounded-sm p-4" style={navy}>
          <RText id="ownership-education.toolsTitle" />
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-sm bg-white/90 p-2.5">
                <div className="rounded-sm bg-white p-1"><RQr id={`ownership-education.tool${i}Qr`} size={50} /></div>
                <RText id={`ownership-education.tool${i}`} />
              </div>
            ))}
          </div>
        </div>

        <GoldRule className="my-5" />
        <div className="grid grid-cols-[1fr_90px] items-center gap-4">
          <div>
            <RText id="ownership-education.ctaTitle" />
            <RText id="ownership-education.ctaBody" className="mt-2" />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="rounded-sm bg-white p-1"><RQr id="ownership-education.guideQr" size={64} /></div>
            <RText id="ownership-education.guideNote" className="!text-center" />
          </div>
        </div>
      </div>
      <Footer footerId="ownership-education.footer" pageNumId="ownership-education.pageNum" />
    </Page>
  );
}

// ── 22. Winning Moments ─────────────────────────────────────────────
function WinnerCard({ p }: { p: string }) {
  return (
    <Card className="!p-0 flex flex-col overflow-hidden">
      <RImage id={`${p}Img`} rounded="" className="h-[150px]" />
      <div className="flex-1 p-3">
        <RText id={`${p}Race`} />
        <RText id={`${p}Horse`} className="mt-0.5" />
        <RText id={`${p}Detail`} className="mt-1.5" />
      </div>
    </Card>
  );
}

export function WinningPage() {
  return (
    <Page>
      <Band id="winning-moments.band" subId="winning-moments.bandSub" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <div className="grid grid-cols-[1fr_300px] gap-6">
          <div>
            <RText id="winning-moments.h1a" />
            <RText id="winning-moments.h1b" />
            <div className="mt-1"><RText id="winning-moments.sub" /></div>
            <RText id="winning-moments.intro" className="mt-2 max-w-[340px]" />
          </div>
          <RImage id="winning-moments.heroImg" rounded="rounded-sm" className="h-[190px]" />
        </div>

        <div className="mt-6 grid flex-1 grid-cols-3 gap-4">
          <WinnerCard p="winning-moments.w1" />
          <WinnerCard p="winning-moments.w2" />
          <WinnerCard p="winning-moments.w3" />
          <WinnerCard p="winning-moments.w4" />
          <WinnerCard p="winning-moments.w5" />
          <div className="flex flex-col items-center justify-center gap-3 rounded-sm p-4" style={navy}>
            <div className="rounded-sm bg-white p-2"><RQr id="winning-moments.uploadQr" size={84} /></div>
            <RText id="winning-moments.uploadNote" className="!text-center" />
          </div>
        </div>
      </div>
      <Footer footerId="winning-moments.uploadNote" pageNumId="winning-moments.pageNum" />
    </Page>
  );
}

// ── 23. Owners' Voice ───────────────────────────────────────────────
export function VoicePage() {
  return (
    <Page>
      <Band id="owners-voice.band" subId="owners-voice.bandSub" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <RText id="owners-voice.h1a" />
        <RText id="owners-voice.h1b" />
        <div className="mt-1"><RText id="owners-voice.sub" /></div>
        <RText id="owners-voice.intro" className="mt-2 max-w-[560px]" />

        <div className="mt-6 grid flex-1 grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col overflow-hidden rounded-sm border" style={{ borderColor: `${GOLD}55` }}>
              <div className="px-3 py-2" style={navy}><RText id={`owners-voice.col${i}Title`} /></div>
              <div className="flex-1 space-y-3 p-3">
                <RText id={`owners-voice.col${i}Said`} />
                <RText id={`owners-voice.col${i}Ideas`} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-[1fr_240px] gap-5">
          <div>
            <RText id="owners-voice.buildTitle" />
            <RText id="owners-voice.buildBody" className="mt-2" />
            <div className="mt-3 flex items-center gap-2">
              <div className="rounded-sm bg-white p-1"><RQr id="owners-voice.sayQr" size={56} /></div>
              <RText id="owners-voice.sayNote" />
            </div>
          </div>
          <RImage id="owners-voice.boardImg" rounded="rounded-sm" className="h-[150px]" />
        </div>

        <div className="mt-5 rounded-sm border p-4" style={{ borderColor: `${GOLD}55` }}>
          <RText id="owners-voice.topics" />
        </div>
      </div>
      <Footer footerId="owners-voice.footer" pageNumId="owners-voice.pageNum" />
    </Page>
  );
}

// ── 24. Back Cover ──────────────────────────────────────────────────
export function BackCoverPage() {
  const rows = Array.from({ length: 20 }, (_, i) => i + 1);
  return (
    <Page bg={NAVY}>
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-8 pb-[60px]">
        <div className="flex items-start justify-between">
          <div>
            <RText id="back-cover.masthead" />
            <RText id="back-cover.mastheadSub" className="mt-1" />
          </div>
          <RImage id="back-cover.heroImg" rounded="rounded-sm" className="h-[130px] w-[230px]" />
        </div>

        <div className="mt-4">
          <RText id="back-cover.h1a" />
          <RText id="back-cover.h1b" />
          <RText id="back-cover.sub" className="mt-2" />
        </div>

        <div className="mt-4 flex-1 overflow-hidden rounded-sm" style={{ background: '#0d1f3a' }}>
          <div className="border-b px-3 py-2" style={{ borderColor: `${GOLD}55` }}>
            <RText id="back-cover.tableHead" />
          </div>
          <div className="divide-y divide-white/5">
            {rows.map((i) => (
              <div key={i} className="px-3 py-[7px]" style={{ background: i % 2 ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
                <RText id={`back-cover.row${i}`} className="!text-white" />
              </div>
            ))}
          </div>
        </div>
        <RText id="back-cover.note" className="mt-2" />

        <div className="mt-4 grid grid-cols-[1fr_100px] items-center gap-4 rounded-sm p-5" style={{ background: '#0d1f3a' }}>
          <div>
            <RText id="back-cover.shareTitle" />
            <RText id="back-cover.shareBody" className="mt-2" />
            <RText id="back-cover.registerNote" className="mt-2.5" />
          </div>
          <div className="rounded-sm bg-white p-1.5"><RQr id="back-cover.registerQr" size={84} /></div>
        </div>

        <div className="mt-4 rounded-sm border p-3 text-center" style={{ borderColor: `${GOLD}55` }}>
          <RText id="back-cover.partners" className="text-center" />
        </div>
      </div>
      <Footer footerId="back-cover.footer" pageNumId="back-cover.pageNum" />
    </Page>
  );
}
