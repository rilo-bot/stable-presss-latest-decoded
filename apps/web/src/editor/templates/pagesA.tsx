/* Page templates 1–6: Cover, President's Update, Editor Letter, Important
   Discussion, Headline Story, Young Owners. Full-height NZTROF layouts. */

import { Page, Band, Footer, GoldRule, Disc, Card } from './parts';
import { RText, RImage, RQr } from '../components/Region';
import { NAVY, GOLD } from './styles';

const navy = { background: NAVY };
const navyA = (a: number) => ({ background: `rgba(10,35,66,${a})` });
const gold = { background: GOLD };

// ── 1. Cover — full-bleed hero in the lower half ────────────────────
export function CoverPage() {
  return (
    <Page>
      <div className="absolute inset-0 flex flex-col pb-[30px]">
        {/* Top cream area */}
        <div className="px-10 pt-9" style={{ height: 530 }}>
          <div className="flex items-start justify-between">
            <div className="w-[55%]"><RText id="cover.tagline" /></div>
            <div className="flex flex-col items-end gap-1">
              <RText id="cover.masthead" />
              <RText id="cover.mastheadSub" className="text-right" />
              <RText id="cover.badge" className="text-right" />
            </div>
          </div>

          <div className="mt-9 max-w-[64%]">
            <RText id="cover.h1" />
            <RText id="cover.h2" />
            <RText id="cover.h3" />
            <div className="mt-5 max-w-[340px]"><RText id="cover.intro" /></div>
            <div className="mt-4 inline-flex w-fit rounded-sm px-3 py-1.5" style={navy}>
              <RText id="cover.editionBadge" />
            </div>
            <div className="mt-6">
              <RText id="cover.insideTitle" />
              <div className="mt-2.5 space-y-2.5">
                {['inside1', 'inside2', 'inside3', 'inside4', 'inside5'].map((k) => (
                  <div key={k} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={navy} />
                    <RText id={`cover.${k}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Full-bleed hero fills the rest, with the navy band over its base */}
        <div className="relative flex-1">
          <RImage id="cover.hero" className="absolute inset-0" />
          <div className="absolute bottom-0 left-0 right-0 grid grid-cols-[215px_1fr] gap-4 px-10 py-4" style={navyA(0.93)}>
            <div className="flex items-center gap-2 rounded-sm bg-white p-2">
              <RQr id="cover.joinQr" size={62} />
              <div className="min-w-0">
                <RText id="cover.scanTitle" />
                <RText id="cover.scanSub" className="mt-0.5" />
                <RText id="cover.scanUrl" className="mt-0.5" />
              </div>
            </div>
            <div>
              <RText id="cover.partnersTitle" />
              <div className="mt-1.5 grid grid-cols-6 gap-1.5">
                {['partner1', 'partner2', 'partner3', 'partner4', 'partner5', 'partner6'].map((k) => (
                  <div key={k} className="flex items-center justify-center rounded-sm bg-white px-1 py-2.5">
                    <RText id={`cover.${k}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer footerId="cover.footer" pageNumId="cover.pageNum" />
    </Page>
  );
}

// ── 2. President's Update ───────────────────────────────────────────
const BOARD = [
  { k: 'member1', n: 'SB' },
  { k: 'member2', n: 'BS' },
  { k: 'member3', n: 'BH' },
  { k: 'member4', n: 'MV' },
  { k: 'member5', n: 'PF' },
  { k: 'member6', n: 'IH' },
  { k: 'member7', n: 'DM' },
];
export function PresidentPage() {
  return (
    <Page>
      <div className="flex flex-1 min-h-0 flex-col px-10 pt-10 pb-[60px]">
        <div className="grid flex-1 grid-cols-[1fr_320px] gap-8">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-3">
              <RText id="president-update.h1a" />
              <RText id="president-update.h1b" />
            </div>
            <div className="mt-1"><RText id="president-update.byline" /></div>
            <GoldRule className="my-5 max-w-[130px]" />
            <RText id="president-update.body" className="max-w-[400px] flex-1" />
            <div className="mt-4"><RText id="president-update.signoff" /></div>
            <RText id="president-update.name" className="mt-1" />
            <RText id="president-update.role" />
          </div>
          <div className="flex flex-col gap-4">
            <RImage id="president-update.portrait" rounded="rounded-sm" className="h-[330px]" />
            <div className="flex-1 rounded-sm border" style={{ borderColor: `${GOLD}66` }}>
              <div className="px-3 py-2" style={navy}><RText id="president-update.boardTitle" /></div>
              <div className="space-y-2.5 p-3">
                {BOARD.map(({ k, n }) => (
                  <div key={k} className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={navy}>
                      {n}
                    </span>
                    <RText id={`president-update.${k}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4 rounded-sm p-5" style={navy}>
          <div className="rounded-sm bg-white p-2"><RQr id="president-update.stayQr" size={86} /></div>
          <div className="flex-1">
            <RText id="president-update.stayTitle" />
            <RText id="president-update.stayBody" className="mt-1.5" />
            <RText id="president-update.siteLabel" className="mt-2" />
          </div>
        </div>
      </div>
      <Footer footerId="president-update.footer" pageNumId="president-update.pageNum" />
    </Page>
  );
}

// ── 3. From the Editor ──────────────────────────────────────────────
export function EditorLetterPage() {
  return (
    <Page>
      <div className="grid flex-1 min-h-0 grid-cols-[1fr_290px] gap-7 px-10 pt-10 pb-[60px]">
        <div className="flex flex-col">
          <div className="flex items-baseline gap-2">
            <RText id="editor-letter.h1a" />
            <RText id="editor-letter.interim" />
          </div>
          <RText id="editor-letter.h1b" />
          <div className="mt-1"><RText id="editor-letter.byline" /></div>
          <GoldRule className="my-5 max-w-[130px]" />
          <RText id="editor-letter.body" className="max-w-[440px]" />
          <div className="mt-5"><RText id="editor-letter.signoff" /></div>
          <RText id="editor-letter.name" className="mt-1" />
          <div className="mt-4 flex items-center gap-3">
            <div className="rounded-sm bg-white p-1.5"><RQr id="editor-letter.emailQr" size={64} /></div>
            <RText id="editor-letter.emailNote" />
          </div>

          <div className="mt-auto rounded-sm border p-4" style={{ borderColor: `${GOLD}55` }}>
            <RText id="editor-letter.welcomeTitle" />
            <RText id="editor-letter.welcomeBody" className="mt-2" />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="flex-1">
            <RText id="editor-letter.coverTitle" />
            <RText id="editor-letter.coverHeading" className="mt-1" />
            <RImage id="editor-letter.coverImg" rounded="rounded-sm" className="my-2 h-[150px]" />
            <RText id="editor-letter.coverBody" />
            <div className="mt-3 flex items-center gap-2">
              <div className="rounded-sm bg-white p-1"><RQr id="editor-letter.coverQr" size={52} /></div>
              <RText id="editor-letter.coverQrNote" />
            </div>
          </Card>
          <Card>
            <RText id="editor-letter.siteTitle" />
            <RText id="editor-letter.siteBody" className="mt-1.5" />
            <div className="mt-3 flex justify-center rounded-sm bg-white p-2">
              <RQr id="editor-letter.siteQr" size={88} />
            </div>
          </Card>
          <div className="rounded-sm px-3 py-2 text-center" style={navy}>
            <RText id="editor-letter.subs" className="text-center" />
          </div>
        </div>
      </div>
      <Footer footerId="editor-letter.footer" pageNumId="editor-letter.pageNum" />
    </Page>
  );
}

// ── 4. Important Discussion ─────────────────────────────────────────
export function DiscussionPage() {
  return (
    <Page>
      <Band id="important-discussion.band" subId="important-discussion.bandSub" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <div className="grid grid-cols-[1fr_240px] gap-6">
          <div>
            <RText id="important-discussion.h1a" />
            <RText id="important-discussion.h1b" />
            <div className="mt-3"><RText id="important-discussion.lead" /></div>
            <RText id="important-discussion.body" className="mt-2 max-w-[440px]" />
          </div>
          <RImage id="important-discussion.treeImg" rounded="rounded-sm" className="h-[185px]" />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <Card>
            <RText id="important-discussion.pyramidTitle" />
            <div className="mt-3 space-y-2.5">
              {['tier1', 'tier2', 'tier3'].map((k, i) => (
                <div key={k} className="flex items-center gap-2" style={{ paddingLeft: i * 18 }}>
                  <span className="h-2.5 w-2.5 rounded-full" style={gold} />
                  <RText id={`important-discussion.${k}`} />
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <RText id="important-discussion.cycleTitle" />
            <RText id="important-discussion.cycleBody" className="mt-3" />
          </Card>
        </div>

        <div className="mt-5 rounded-sm p-4" style={navy}>
          <RText id="important-discussion.dataTitle" />
          <div className="mt-3 grid grid-cols-4 gap-3">
            {['data1', 'data2', 'data3', 'data4'].map((k) => (
              <div key={k} className="rounded-sm bg-white/90 p-2.5"><RText id={`important-discussion.${k}`} /></div>
            ))}
          </div>
          <div className="mt-4 border-l-2 pl-3" style={{ borderColor: GOLD }}>
            <RText id="important-discussion.quote" />
          </div>
        </div>

        <div className="mt-5 grid flex-1 grid-cols-2 gap-4">
          <Card>
            <RText id="important-discussion.changeTitle" />
            <RText id="important-discussion.changeBody" className="mt-2.5" />
          </Card>
          <Card>
            <RText id="important-discussion.blueprintTitle" />
            <RText id="important-discussion.blueprintBody" className="mt-2.5" />
            <div className="mt-3 flex items-center gap-2">
              <div className="rounded-sm bg-white p-1"><RQr id="important-discussion.qrMain" size={54} /></div>
              <RText id="important-discussion.qrNote" />
            </div>
          </Card>
        </div>
      </div>
      <Footer footerId="important-discussion.footer" pageNumId="important-discussion.pageNum" />
    </Page>
  );
}

// ── 5. Headline Story — Aeliana ─────────────────────────────────────
export function HeadlinePage() {
  return (
    <Page>
      <Band id="headline-story.band" subId="headline-story.bandSub" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-4 pb-[80px]">
        <RText id="headline-story.title" />
        <RText id="headline-story.subtitle" className="mt-1" />
        <RImage id="headline-story.hero" rounded="rounded-sm" className="my-3 h-[250px]" />
        <RText id="headline-story.intro" className="max-w-[660px]" />

        <div className="mt-4 grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="text-center">
              <RText id={`headline-story.stat${i}Num`} className="!text-center" />
              <RText id={`headline-story.stat${i}Label`} className="mt-1 !text-center" />
            </Card>
          ))}
        </div>

        <div className="mt-5 grid flex-1 grid-cols-[1fr_250px] gap-6">
          <div className="flex flex-col">
            <RText id="headline-story.journeyTitle" />
            <div className="mt-3 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-3">
                  <Disc>{i}</Disc>
                  <RText id={`headline-story.j${i}`} />
                </div>
              ))}
            </div>
            <div className="mt-auto border-l-2 pl-3" style={{ borderColor: GOLD }}>
              <RText id="headline-story.quote" />
              <RText id="headline-story.quoteBy" className="mt-1" />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <RImage id="headline-story.photo1" rounded="rounded-sm" className="flex-1" />
            <RImage id="headline-story.photo2" rounded="rounded-sm" className="flex-1" />
          </div>
        </div>

        <div className="mt-5 rounded-sm p-4" style={navy}>
          <RText id="headline-story.exploreTitle" className="text-center" />
          <div className="mt-3 grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="rounded-sm bg-white p-1"><RQr id={`headline-story.qr${i}`} size={52} /></div>
                <RText id={`headline-story.qr${i}Label`} className="!text-center" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <Footer footerId="headline-story.footer" pageNumId="headline-story.pageNum" />
    </Page>
  );
}

// ── 6. Young Owners ─────────────────────────────────────────────────
export function YoungOwnersPage() {
  return (
    <Page>
      <Band id="young-owners.band" />
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[80px]">
        <div className="grid grid-cols-[1fr_320px] gap-6">
          <div>
            <RText id="young-owners.h1a" />
            <RText id="young-owners.h1b" />
            <RText id="young-owners.h1c" />
            <div className="mt-1"><RText id="young-owners.sub" /></div>
            <RText id="young-owners.body" className="mt-3 max-w-[420px]" />
          </div>
          <RImage id="young-owners.hero" rounded="rounded-sm" className="h-[230px]" />
        </div>

        <div className="mt-5 rounded-sm border-l-4 p-4" style={{ borderColor: GOLD, background: NAVY }}>
          <RText id="young-owners.quote" />
        </div>

        <div className="mt-6 grid grid-cols-[1fr_240px] gap-6">
          <div>
            <RText id="young-owners.charlieTitle" />
            <div className="mt-3 grid grid-cols-[150px_1fr] gap-4">
              <RImage id="young-owners.charlieImg" rounded="rounded-sm" className="h-[170px]" />
              <div>
                <RText id="young-owners.charlieBody" />
                <RText id="young-owners.charlieQuote" className="mt-2" />
                <div className="mt-3 rounded-sm bg-white p-1 w-fit"><RQr id="young-owners.charlieQr" size={52} /></div>
              </div>
            </div>
          </div>
          <div className="rounded-sm p-4" style={navy}>
            <RText id="young-owners.waveTitle" />
            <RText id="young-owners.waveBody" className="mt-2.5" />
          </div>
        </div>

        <div className="mt-6">
          <RText id="young-owners.pathTitle" />
          <div className="mt-3 grid grid-cols-3 gap-3">
            {['path1', 'path2', 'path3'].map((k, i) => (
              <Card key={k}>
                <div className="mb-2"><Disc>{i + 1}</Disc></div>
                <RText id={`young-owners.${k}`} />
              </Card>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="rounded-sm bg-white p-1"><RQr id="young-owners.guideQr" size={54} /></div>
            <RText id="young-owners.guideNote" />
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-4 pt-5">
          <Card>
            <RText id="young-owners.col1Title" />
            <RText id="young-owners.col1Body" className="mt-2" />
          </Card>
          <Card>
            <RText id="young-owners.col2Title" />
            <RText id="young-owners.col2Body" className="mt-2" />
          </Card>
        </div>
      </div>
      <Footer footerId="young-owners.footer" pageNumId="young-owners.pageNum" />
    </Page>
  );
}
