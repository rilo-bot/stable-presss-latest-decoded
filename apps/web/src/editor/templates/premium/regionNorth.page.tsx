/* Regional Roundups — North (premium) — navy band header with a horse accent
   icon, a headline + intro, then three region blocks (Auckland/Northland,
   Waikato/BOP, Hawke's Bay) each with a photo, name, gold tagline, body, owner
   quote and a scan-to-read QR. Premium restyle of the classic RegionNorthPage. */

import { PFooter, PGoldRule } from './parts';
import { PPage } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const ROLE_GOLD = '#8a6b1e';

function RegionBlock({ p }: { p: string }) {
  return (
    <div className="grid flex-1 grid-cols-[200px_1fr] gap-4 border-b pb-4" style={{ borderColor: `${GOLD}40` }}>
      <RImage id={`${p}Img`} rounded="rounded-sm" className="h-full min-h-[160px]" />
      <div>
        <RText id={`${p}Name`} />
        <RText id={`${p}Tag`} className="mt-0.5" />
        <RText id={`${p}Body`} className="mt-2" />
        <RText id={`${p}Quote`} className="mt-2" />
        <div className="mt-3 flex items-center gap-2">
          <div className="rounded-sm bg-white p-1 ring-1 ring-black/5"><RQr id={`${p}Qr`} size={46} /></div>
          <RText id={`${p}ScanLabel`} />
        </div>
      </div>
    </div>
  );
}

export function RegionNorthPremium() {
  return (
    <PPage>
      {/* Navy band — label + gold horse accent icon */}
      <div className="flex items-center justify-between px-9 py-2.5" style={{ background: NAVY }}>
        <RText id="regional-north-px.band" />
        <RIcon id="regional-north-px.bandIcon" size={20} color={GOLD} className="flex-shrink-0" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[58px]">
        <div className="grid grid-cols-[1fr_300px] items-end gap-6">
          <div>
            <RText id="regional-north-px.h1a" />
            <RText id="regional-north-px.h1b" />
            <div className="mt-1"><RText id="regional-north-px.sub" /></div>
          </div>
          <RText id="regional-north-px.intro" />
        </div>
        <PGoldRule className="my-4" />
        <div className="flex flex-1 flex-col gap-4">
          <RegionBlock p="regional-north-px.r1" />
          <RegionBlock p="regional-north-px.r2" />
          <RegionBlock p="regional-north-px.r3" />
        </div>
      </div>

      <PFooter footerId="regional-north-px.footer" pageNumId="regional-north-px.pageNum" />
    </PPage>
  );
}
