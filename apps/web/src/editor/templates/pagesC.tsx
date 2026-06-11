/* Page templates 13–18: Future Together, Breeder Feature, Horse Welfare,
   Business & Owners, Leaderboards, Gamification. Full-height layouts. */

import { Page, Band, Footer, GoldRule, Card } from './parts';
import { RText, RImage, RQr } from '../components/Region';
import { NAVY, GOLD } from './styles';

const navy = { background: NAVY };

// ── 13. Our Future Together ─────────────────────────────────────────
export function FuturePage() {
  return (
    <Page>
      <div className="flex flex-1 min-h-0 flex-col px-10 pt-10 pb-[80px]">
        <RText id="future-together.h1a" />
        <RText id="future-together.h1b" />
        <div className="mt-1"><RText id="future-together.sub" /></div>
        <RText id="future-together.body" className="mt-3 max-w-[500px]" />
        <RImage id="future-together.deviceImg" rounded="rounded-sm" className="mt-4 h-[230px]" />

        <div className="mt-6 grid grid-cols-2 gap-5">
          <div className="rounded-sm p-4" style={navy}>
            <RText id="future-together.strategyTitle" />
            <RText id="future-together.strategyBody" className="mt-2.5" />
          </div>
          <div className="rounded-sm p-4" style={{ background: GOLD }}>
            <RText id="future-together.magTitle" />
            <div className="mt-2.5 space-y-2">
              {['mag1', 'mag2', 'mag3', 'mag4'].map((k) => (
                <RText key={k} id={`future-together.${k}`} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="rounded-sm px-4 py-2.5" style={navy}><RText id="future-together.webTitle" /></div>
          <Card className="mt-2"><RText id="future-together.webBody" /></Card>
        </div>

        <div className="mt-auto grid grid-cols-[1fr_90px] items-center gap-4 rounded-sm border p-5" style={{ borderColor: `${GOLD}66` }}>
          <div>
            <RText id="future-together.ctaTitle" />
            <RText id="future-together.ctaBody" className="mt-2" />
          </div>
          <div className="rounded-sm bg-white p-1.5"><RQr id="future-together.ctaQr" size={72} /></div>
        </div>
      </div>
      <Footer footerId="future-together.footer" pageNumId="future-together.pageNum" />
    </Page>
  );
}

// ── 14. Breeder Feature ─────────────────────────────────────────────
export function BreederPage() {
  return (
    <Page>
      <Band id="breeder-feature.band" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <div className="grid grid-cols-[1fr_300px] gap-6">
          <div>
            <RText id="breeder-feature.h1a" />
            <RText id="breeder-feature.h1b" />
            <div className="mt-1"><RText id="breeder-feature.sub" /></div>
            <RText id="breeder-feature.body" className="mt-3 max-w-[380px]" />
            <div className="mt-4 rounded-sm border-l-4 p-4" style={{ borderColor: GOLD, background: NAVY }}>
              <RText id="breeder-feature.quote" />
              <RText id="breeder-feature.quoteBy" className="mt-1.5" />
            </div>
          </div>
          <RImage id="breeder-feature.familyImg" rounded="rounded-sm" className="h-[260px]" />
        </div>

        <div className="mt-6 grid flex-1 grid-cols-2 gap-6">
          <div className="flex flex-col">
            <RText id="breeder-feature.journeyTitle" />
            <RText id="breeder-feature.journeyBody" className="mt-2" />
            <RImage id="breeder-feature.mareImg" rounded="rounded-sm" className="mt-3 flex-1 min-h-[150px]" />
            <RText id="breeder-feature.mareCap" className="mt-1.5" />
          </div>
          <div className="flex flex-col">
            <RImage id="breeder-feature.jockeyImg" rounded="rounded-sm" className="h-[160px]" />
            <RText id="breeder-feature.jockeyCap" className="mt-1.5" />
            <RText id="breeder-feature.effortTitle" className="mt-4" />
            <RText id="breeder-feature.effortBody" className="mt-2" />
          </div>
        </div>

        <GoldRule className="my-5" />
        <div className="grid grid-cols-[1fr_80px] items-center gap-4">
          <div>
            <RText id="breeder-feature.highsTitle" />
            <RText id="breeder-feature.highsBody" className="mt-2" />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="rounded-sm bg-white p-1"><RQr id="breeder-feature.qr" size={60} /></div>
            <RText id="breeder-feature.qrNote" className="!text-center" />
          </div>
        </div>
      </div>
      <Footer footerId="breeder-feature.footer" pageNumId="breeder-feature.pageNum" />
    </Page>
  );
}

// ── 15. Horse Welfare ───────────────────────────────────────────────
export function WelfarePage() {
  return (
    <Page>
      <div className="px-9 py-2.5" style={{ background: '#1a3322' }}>
        <RText id="horse-welfare.band" />
      </div>
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <div className="grid grid-cols-[1fr_320px] gap-6">
          <div>
            <RText id="horse-welfare.h1a" />
            <RText id="horse-welfare.h1b" />
            <div className="mt-1"><RText id="horse-welfare.sub" /></div>
            <RText id="horse-welfare.body" className="mt-3 max-w-[360px]" />
            <RText id="horse-welfare.henryTitle" className="mt-4" />
            <RText id="horse-welfare.henryBody" className="mt-2 max-w-[360px]" />
            <RImage id="horse-welfare.henryImg" rounded="rounded-sm" className="mt-3 h-[160px]" />
          </div>
          <RImage id="horse-welfare.heroImg" rounded="rounded-sm" className="h-[330px]" />
        </div>

        <div className="mt-6 grid flex-1 grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="flex flex-col">
              <RImage id={`horse-welfare.card${i}Img`} rounded="rounded-sm" className="flex-1 min-h-[120px]" />
              <RText id={`horse-welfare.card${i}Body`} className="mt-2.5" />
            </Card>
          ))}
        </div>

        <div className="mt-5 rounded-sm border-l-4 p-4" style={{ borderColor: '#1a3322', background: '#eef2ee' }}>
          <RText id="horse-welfare.quote" />
        </div>

        <div className="mt-5 rounded-sm p-4" style={{ background: '#1a3322' }}>
          <RText id="horse-welfare.sponsorBand" />
        </div>
      </div>
      <Footer footerId="horse-welfare.footer" pageNumId="horse-welfare.pageNum" />
    </Page>
  );
}

// ── 16. Business & Owners ───────────────────────────────────────────
export function BusinessPage() {
  return (
    <Page>
      <Band id="business-owners.band" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <div className="grid grid-cols-[1fr_320px] gap-6">
          <div>
            <RText id="business-owners.h1a" />
            <RText id="business-owners.h1b" />
            <RText id="business-owners.h1c" />
            <div className="mt-1"><RText id="business-owners.sub" /></div>
            <RText id="business-owners.body" className="mt-3 max-w-[360px]" />
          </div>
          <RImage id="business-owners.heroImg" rounded="rounded-sm" className="h-[210px]" />
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <RText id={`business-owners.col${i}Title`} />
              <RText id={`business-owners.col${i}Body`} className="mt-2" />
            </Card>
          ))}
        </div>

        <div className="mt-6 flex-1">
          <div className="rounded-sm px-4 py-2.5" style={navy}><RText id="business-owners.spotlightTitle" /></div>
          <div className="mt-4 grid grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <RImage id={`business-owners.spot${i}Img`} rounded="rounded-sm" className="h-[150px]" />
                <RText id={`business-owners.spot${i}Body`} className="mt-2.5" />
              </div>
            ))}
          </div>
        </div>

        <GoldRule className="my-4" />
        <div className="rounded-sm border p-4" style={{ borderColor: `${GOLD}55` }}>
          <RText id="business-owners.partners" className="text-center" />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="rounded-sm bg-white p-1"><RQr id="business-owners.qr" size={54} /></div>
          <RText id="business-owners.qrNote" />
        </div>
      </div>
      <Footer footerId="business-owners.footer" pageNumId="business-owners.pageNum" />
    </Page>
  );
}

function LbTable({ p }: { p: string }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-sm border" style={{ borderColor: `${GOLD}55` }}>
      <div className="px-3 py-2" style={navy}><RText id={`${p}Title`} /></div>
      <div className="border-b px-3 py-1.5" style={{ borderColor: `${GOLD}40`, background: '#0d1f3a' }}>
        <RText id={`${p}Head`} />
      </div>
      <div className="flex-1 divide-y" style={{ background: '#fbf6ec' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="px-3 py-2"><RText id={`${p}R${i}`} /></div>
        ))}
      </div>
    </div>
  );
}

// ── 17. Leaderboards ────────────────────────────────────────────────
export function LeaderboardsPage() {
  return (
    <Page>
      <Band id="leaderboards.band" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <RText id="leaderboards.h1a" />
        <RText id="leaderboards.h1b" />
        <div className="mt-1"><RText id="leaderboards.sub" /></div>
        <RText id="leaderboards.intro" className="mt-2 max-w-[540px]" />

        <div className="mt-6 grid grid-cols-3 gap-4">
          <LbTable p="leaderboards.lb1" />
          <LbTable p="leaderboards.lb2" />
          <LbTable p="leaderboards.lb3" />
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="flex flex-col items-center text-center">
              <RText id={`leaderboards.get${i}`} />
              <div className="mt-3 rounded-sm bg-white p-2"><RQr id={`leaderboards.get${i}Qr`} size={72} /></div>
            </Card>
          ))}
        </div>

        <div className="mt-auto rounded-sm border p-4 text-center" style={{ borderColor: `${GOLD}55` }}>
          <RText id="leaderboards.partners" className="text-center" />
        </div>
      </div>
      <Footer footerId="leaderboards.footer" pageNumId="leaderboards.pageNum" />
    </Page>
  );
}

// ── 18. Gamification ────────────────────────────────────────────────
export function GamificationPage() {
  return (
    <Page>
      <Band id="gamification.band" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <div className="grid grid-cols-[1fr_240px] gap-6">
          <div>
            <RText id="gamification.h1a" />
            <RText id="gamification.h1b" />
            <div className="mt-1"><RText id="gamification.sub" /></div>
            <RText id="gamification.body" className="mt-3 max-w-[380px]" />
          </div>
          <div className="rounded-sm p-4" style={{ background: GOLD }}>
            <RText id="gamification.prizeTitle" />
            <RText id="gamification.prizes" className="mt-2" />
          </div>
        </div>

        <div className="mt-6 grid flex-1 grid-cols-3 gap-4">
          <Card className="flex flex-col">
            <RText id="gamification.game1Title" />
            <RImage id="gamification.game1Img" rounded="rounded-sm" className="my-3 flex-1 min-h-[130px]" />
            <div className="flex justify-center rounded-sm bg-white p-2"><RQr id="gamification.game1Qr" size={64} /></div>
          </Card>
          <Card className="flex flex-col">
            <RText id="gamification.game2Title" />
            <RImage id="gamification.game2Img" rounded="rounded-sm" className="my-3 flex-1 min-h-[130px]" />
            <div className="flex justify-center rounded-sm bg-white p-2"><RQr id="gamification.game2Qr" size={64} /></div>
          </Card>
          <Card className="flex flex-col">
            <RText id="gamification.game3Title" />
            <RText id="gamification.game3Body" className="mt-2 flex-1" />
            <div className="flex justify-center rounded-sm bg-white p-2"><RQr id="gamification.game3Qr" size={64} /></div>
          </Card>
        </div>

        <div className="mt-6 rounded-sm p-5" style={navy}>
          <RText id="gamification.climbTitle" />
          <RText id="gamification.climbBody" className="mt-2" />
          <RText id="gamification.shareNote" className="mt-3" />
        </div>

        <div className="mt-5 rounded-sm border p-4 text-center" style={{ borderColor: `${GOLD}55` }}>
          <RText id="gamification.partners" className="text-center" />
        </div>
      </div>
      <Footer footerId="gamification.footer" pageNumId="gamification.pageNum" />
    </Page>
  );
}
