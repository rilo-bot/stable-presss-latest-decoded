/* Page templates 7–12: Women in Racing, Regional North, Regional South,
   Owners Lounge, Karaka Sales, Celebration Wall. Full-height layouts. */

import { Page, Band, Footer, GoldRule, Card } from './parts';
import { RText, RImage, RQr } from '../components/Region';
import { NAVY, GOLD } from './styles';

const navy = { background: NAVY };

// Region roundup block (shared by North & South)
function RegionBlock({ p }: { p: string }) {
  return (
    <div className="grid flex-1 grid-cols-[200px_1fr] gap-4 border-b pb-4" style={{ borderColor: `${GOLD}40` }}>
      <RImage id={`${p}Img`} rounded="rounded-sm" className="h-full min-h-[170px]" />
      <div>
        <RText id={`${p}Name`} />
        <RText id={`${p}Tag`} className="mt-0.5" />
        <RText id={`${p}Body`} className="mt-2" />
        <RText id={`${p}Quote`} className="mt-2" />
        <div className="mt-3 flex items-center gap-2">
          <div className="rounded-sm bg-white p-1"><RQr id={`${p}Qr`} size={46} /></div>
          <span className="text-[9px] uppercase tracking-wide text-[#8a6b1e]">Scan to read full coverage</span>
        </div>
      </div>
    </div>
  );
}

// ── 7. Women in Racing ──────────────────────────────────────────────
export function WomenPage() {
  return (
    <Page>
      <div className="px-9 py-2.5" style={{ background: '#5a2a3a' }}>
        <RText id="women-in-racing.band" />
      </div>
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <div className="grid grid-cols-[1fr_340px] gap-6">
          <div>
            <RText id="women-in-racing.h1a" />
            <RText id="women-in-racing.h1b" />
            <RText id="women-in-racing.h1c" />
            <div className="mt-1"><RText id="women-in-racing.sub" /></div>
            <RText id="women-in-racing.body" className="mt-3 max-w-[400px]" />
          </div>
          <div className="grid grid-cols-2 grid-rows-2 gap-2">
            <RImage id="women-in-racing.collage1" rounded="rounded-sm" className="row-span-2 h-full" />
            <RImage id="women-in-racing.collage2" rounded="rounded-sm" className="h-[120px]" />
            <RImage id="women-in-racing.collage3" rounded="rounded-sm" className="h-[120px]" />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <RText id={`women-in-racing.col${i}Title`} />
              <RText id={`women-in-racing.col${i}Body`} className="mt-2" />
            </Card>
          ))}
        </div>

        <div className="mt-6 flex-1 rounded-sm border p-5" style={{ borderColor: `${GOLD}66`, background: '#fbf6ec' }}>
          <RText id="women-in-racing.sponsorKicker" />
          <div className="mt-1.5"><RText id="women-in-racing.sponsorScript" /></div>
          <div className="mt-3 grid grid-cols-[1fr_220px] gap-5">
            <div>
              <RText id="women-in-racing.sponsorBody" />
              <RText id="women-in-racing.sponsorName" className="mt-3" />
              <RText id="women-in-racing.sponsorTag" className="mt-2" />
            </div>
            <RImage id="women-in-racing.sponsorImg" rounded="rounded-sm" className="h-[150px]" />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <div className="rounded-sm bg-white p-1"><RQr id="women-in-racing.voteQr" size={54} /></div>
          <RText id="women-in-racing.voteNote" />
        </div>
      </div>
      <Footer footerId="women-in-racing.footer" pageNumId="women-in-racing.pageNum" />
    </Page>
  );
}

// ── 8. Regional North ───────────────────────────────────────────────
export function RegionNorthPage() {
  return (
    <Page>
      <Band id="regional-north.band" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <div className="grid grid-cols-[1fr_300px] items-end gap-6">
          <div>
            <RText id="regional-north.h1a" />
            <RText id="regional-north.h1b" />
            <div className="mt-1"><RText id="regional-north.sub" /></div>
          </div>
          <RText id="regional-north.intro" />
        </div>
        <GoldRule className="my-4" />
        <div className="flex flex-1 flex-col gap-4">
          <RegionBlock p="regional-north.r1" />
          <RegionBlock p="regional-north.r2" />
          <RegionBlock p="regional-north.r3" />
        </div>
      </div>
      <Footer footerId="regional-north.footer" pageNumId="regional-north.pageNum" />
    </Page>
  );
}

// ── 9. Regional South ───────────────────────────────────────────────
export function RegionSouthPage() {
  return (
    <Page>
      <Band id="regional-south.band" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <div className="grid grid-cols-[1fr_300px] items-end gap-6">
          <div>
            <RText id="regional-south.h1a" />
            <RText id="regional-south.h1b" />
            <div className="mt-1"><RText id="regional-south.sub" /></div>
          </div>
          <RText id="regional-south.intro" />
        </div>
        <GoldRule className="my-4" />
        <div className="flex flex-1 flex-col gap-4">
          <RegionBlock p="regional-south.r1" />
          <RegionBlock p="regional-south.r2" />
          <RegionBlock p="regional-south.r3" />
        </div>
      </div>
      <Footer footerId="regional-south.footer" pageNumId="regional-south.pageNum" />
    </Page>
  );
}

// ── 10. Owners Lounge ───────────────────────────────────────────────
export function LoungePage() {
  return (
    <Page>
      <Band id="owners-lounge.band" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <div className="grid grid-cols-[1fr_300px] items-end gap-6">
          <div>
            <RText id="owners-lounge.h1a" />
            <RText id="owners-lounge.h1b" />
            <div className="mt-1"><RText id="owners-lounge.sub" /></div>
          </div>
          <RText id="owners-lounge.lead" className="max-w-[270px]" />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i}>
              <RImage id={`owners-lounge.photo${i}`} rounded="rounded-sm" className="h-[150px]" />
              <RText id={`owners-lounge.photo${i}Cap`} className="mt-1.5" />
            </div>
          ))}
          <div className="flex items-center rounded-sm border-l-4 p-4" style={{ borderColor: GOLD, background: '#fbf6ec' }}>
            <RText id="owners-lounge.quote" />
          </div>
        </div>

        <div className="mt-auto flex items-center gap-4 rounded-sm p-5" style={navy}>
          <div className="rounded-sm bg-white p-2"><RQr id="owners-lounge.galleryQr" size={80} /></div>
          <RText id="owners-lounge.galleryNote" />
        </div>
      </div>
      <Footer footerId="owners-lounge.footer" pageNumId="owners-lounge.pageNum" />
    </Page>
  );
}

// ── 11. Karaka Sales ────────────────────────────────────────────────
export function KarakaPage() {
  return (
    <Page>
      <Band id="karaka-sales.band" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <div className="grid grid-cols-[1fr_280px] gap-6">
          <div>
            <RText id="karaka-sales.h1a" />
            <RText id="karaka-sales.h1b" />
            <div className="mt-1"><RText id="karaka-sales.sub" /></div>
            <RText id="karaka-sales.body" className="mt-3 max-w-[400px]" />
            <div className="mt-4 space-y-3">
              {['point1', 'point2', 'point3', 'point4'].map((k) => (
                <div key={k} className="flex gap-2.5">
                  <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: GOLD }} />
                  <RText id={`karaka-sales.${k}`} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <RImage id="karaka-sales.heroImg" rounded="rounded-sm" className="h-[185px]" />
            <div className="mt-3 rounded-sm p-3 text-center" style={navy}>
              <RText id="karaka-sales.badge" className="!text-center" />
            </div>
            <Card className="mt-3">
              <RText id="karaka-sales.resultsTitle" />
              <RText id="karaka-sales.results" className="mt-2" />
              <RText id="karaka-sales.resultsNote" className="mt-2" />
              <div className="mt-2 flex justify-center rounded-sm bg-white p-1"><RQr id="karaka-sales.resultsQr" size={58} /></div>
            </Card>
          </div>
        </div>

        <div className="mt-6 grid flex-1 grid-cols-2 gap-4">
          <div className="flex flex-col rounded-sm p-4" style={navy}>
            <RText id="karaka-sales.ad1Name" />
            <RImage id="karaka-sales.ad1Img" rounded="rounded-sm" className="mt-3 flex-1 min-h-[120px]" />
          </div>
          <div className="flex flex-col rounded-sm p-4" style={{ background: '#1a3322' }}>
            <RText id="karaka-sales.ad2Name" />
            <RImage id="karaka-sales.ad2Img" rounded="rounded-sm" className="mt-3 flex-1 min-h-[120px]" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_1fr_1fr_1fr_80px] items-center gap-3 rounded-sm border p-4" style={{ borderColor: `${GOLD}55` }}>
          <RText id="karaka-sales.cta1" />
          <RText id="karaka-sales.cta2" />
          <RText id="karaka-sales.cta3" />
          <RText id="karaka-sales.cta4" />
          <div className="rounded-sm bg-white p-1"><RQr id="karaka-sales.ctaQr" size={64} /></div>
        </div>
      </div>
      <Footer footerId="karaka-sales.footer" pageNumId="karaka-sales.pageNum" />
    </Page>
  );
}

// ── 12. Celebration Wall ────────────────────────────────────────────
export function CelebrationPage() {
  return (
    <Page>
      <Band id="celebration-wall.band" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <div className="grid grid-cols-[1fr_300px] gap-6">
          <div className="flex flex-col">
            <RText id="celebration-wall.h1a" />
            <RText id="celebration-wall.h1b" />
            <div className="mt-1"><RText id="celebration-wall.sub" /></div>
            <RText id="celebration-wall.body" className="mt-3 max-w-[380px]" />
            <RImage id="celebration-wall.championsImg" rounded="rounded-sm" className="mt-4 flex-1 min-h-[240px]" />
          </div>
          <div className="flex flex-col gap-3">
            <Card>
              <RText id="celebration-wall.quarterTitle" />
              <RImage id="celebration-wall.quarterImg" rounded="rounded-sm" className="my-2 h-[150px]" />
              <RText id="celebration-wall.quarterCap" />
            </Card>
            <Card className="flex-1">
              <RText id="celebration-wall.monthTitle" />
              <div className="mt-3 grid grid-cols-[64px_1fr] items-center gap-3">
                <RImage id="celebration-wall.month1Img" rounded="rounded-full" className="h-[64px]" />
                <RText id="celebration-wall.month1Body" />
              </div>
              <div className="mt-3 grid grid-cols-[64px_1fr] items-center gap-3">
                <RImage id="celebration-wall.month2Img" rounded="rounded-full" className="h-[64px]" />
                <RText id="celebration-wall.month2Body" />
              </div>
            </Card>
          </div>
        </div>

        <div className="mt-5 rounded-sm p-4" style={navy}>
          <RText id="celebration-wall.sponsorBand" />
        </div>

        <div className="mt-auto pt-5">
          <RText id="celebration-wall.eventsTitle" />
          <div className="mt-3 grid grid-cols-4 gap-3">
            {['event1', 'event2', 'event3', 'event4'].map((k) => (
              <Card key={k}><RText id={`celebration-wall.${k}`} /></Card>
            ))}
          </div>
        </div>
      </div>
      <Footer footerId="celebration-wall.footer" pageNumId="celebration-wall.pageNum" />
    </Page>
  );
}
