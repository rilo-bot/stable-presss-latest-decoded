import { IconBadge } from './kit';
import { PPage, PFooter, PGoldRule, PCard } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const navy = { background: NAVY };
const forest = { background: '#1a3322' };

const FEATURES = [1, 2, 3, 4];

// ── Karaka Sales & Syndicates (premium, cream page) ─────────────────
export function KarakaPremium() {
  return (
    <PPage>
      {/* Header band — section label + gold accent icon */}
      <div className="flex items-center justify-between px-9 py-2.5" style={navy}>
        <RText id="karaka-sales-px.band" />
        <RIcon id="karaka-sales-px.bandIcon" size={18} color={GOLD} className="flex-shrink-0" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[64px]">
        {/* Top — feature list (left) + hero photo with badge & results (right) */}
        <div className="grid grid-cols-[1fr_270px] gap-6">
          {/* Left — headline + body + gold-icon feature list */}
          <div>
            <RText id="karaka-sales-px.h1a" />
            <RText id="karaka-sales-px.h1b" />
            <PGoldRule className="mb-1.5 mt-2 max-w-[120px]" />
            <div className="mt-1"><RText id="karaka-sales-px.sub" /></div>
            <RText id="karaka-sales-px.body" className="mt-3 max-w-[420px]" />
            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4">
              {FEATURES.map((i) => (
                <div key={i} className="flex items-start gap-3">
                  <IconBadge iconId={`karaka-sales-px.point${i}Icon`} size={36} variant="outline" />
                  <div className="min-w-0">
                    <RText id={`karaka-sales-px.point${i}Title`} />
                    <RText id={`karaka-sales-px.point${i}Body`} className="mt-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — hero photo with overlapping circular results badge + stat list */}
          <div>
            <div className="relative">
              <RImage id="karaka-sales-px.heroImg" rounded="rounded-sm" className="h-[180px]" />
              {/* Circular sale-results badge overlapping the photo's lower edge */}
              <div
                className="absolute -bottom-7 right-3 flex h-[92px] w-[92px] items-center justify-center rounded-full p-2.5"
                style={{ ...navy, border: `2px solid ${GOLD}` }}
              >
                <RText id="karaka-sales-px.badge" className="!text-center" />
              </div>
            </div>
            <PCard className="mt-9">
              <RText id="karaka-sales-px.resultsTitle" />
              <PGoldRule className="mb-2 mt-1.5 max-w-[80px]" />
              <RText id="karaka-sales-px.results" />
              <RText id="karaka-sales-px.resultsNote" className="mt-2" />
              <div className="mt-2 flex items-center gap-2.5">
                <div className="rounded-sm bg-white p-1 ring-1 ring-black/5"><RQr id="karaka-sales-px.resultsQr" size={52} /></div>
              </div>
            </PCard>
          </div>
        </div>

        {/* Sponsor blocks — NZB (navy) + Cambridge Stud (forest) */}
        <div className="mt-6 grid flex-1 grid-cols-2 gap-4">
          <div className="flex flex-col rounded-md p-4" style={navy}>
            <RText id="karaka-sales-px.ad1Name" />
            <RImage id="karaka-sales-px.ad1Img" rounded="rounded-sm" className="mt-3 min-h-[110px] flex-1" />
          </div>
          <div className="flex flex-col rounded-md p-4" style={forest}>
            <RText id="karaka-sales-px.ad2Name" />
            <RImage id="karaka-sales-px.ad2Img" rounded="rounded-sm" className="mt-3 min-h-[110px] flex-1" />
          </div>
        </div>

        {/* Browse-syndication QR row */}
        <div className="mt-5 rounded-md border p-4" style={{ borderColor: `${GOLD}55` }}>
          <RText id="karaka-sales-px.ctaTitle" />
          <PGoldRule className="mb-3 mt-1.5 max-w-[150px]" />
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_72px] items-center gap-3">
            <RText id="karaka-sales-px.cta1" />
            <RText id="karaka-sales-px.cta2" />
            <RText id="karaka-sales-px.cta3" />
            <RText id="karaka-sales-px.cta4" />
            <div className="rounded-sm bg-white p-1"><RQr id="karaka-sales-px.ctaQr" size={64} /></div>
          </div>
        </div>
      </div>

      <PFooter footerId="karaka-sales-px.footer" pageNumId="karaka-sales-px.pageNum" />
    </PPage>
  );
}
