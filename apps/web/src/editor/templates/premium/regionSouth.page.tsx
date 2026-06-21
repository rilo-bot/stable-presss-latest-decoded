/* Regional Roundups — South (premium) — mirror of North (Manawatu/Wellington,
   Central South Island, Otago/Southland) with the region blocks on the left and
   a navy right rail carrying the Regional Event Calendar / Ownership Groups /
   Trainer Visits icon list plus an events QR. Premium restyle of RegionSouthPage. */

import { PFooter, PGoldRule } from './parts';
import { PPage } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const navy = { background: NAVY };

function RegionBlock({ p }: { p: string }) {
  return (
    <div className="grid flex-1 grid-cols-[180px_1fr] gap-4 border-b pb-4" style={{ borderColor: `${GOLD}40` }}>
      <RImage id={`${p}Img`} rounded="rounded-sm" className="h-full min-h-[150px]" />
      <div>
        <RText id={`${p}Name`} />
        <RText id={`${p}Tag`} className="mt-0.5" />
        <RText id={`${p}Body`} className="mt-2" />
        <RText id={`${p}Quote`} className="mt-2" />
        <div className="mt-3 flex items-center gap-2">
          <div className="rounded-sm bg-white p-1 ring-1 ring-black/5"><RQr id={`${p}Qr`} size={44} /></div>
          <RText id={`${p}ScanLabel`} />
        </div>
      </div>
    </div>
  );
}

const RAIL = [
  { icon: 'rail1Icon', label: 'rail1Label', body: 'rail1Body' },
  { icon: 'rail2Icon', label: 'rail2Label', body: 'rail2Body' },
  { icon: 'rail3Icon', label: 'rail3Label', body: 'rail3Body' },
];

export function RegionSouthPremium() {
  return (
    <PPage>
      {/* Navy band — label + gold horse accent icon */}
      <div className="flex items-center justify-between px-9 py-2.5" style={{ background: NAVY }}>
        <RText id="regional-south-px.band" />
        <RIcon id="regional-south-px.bandIcon" size={20} color={GOLD} className="flex-shrink-0" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[58px]">
        <div className="grid grid-cols-[1fr_300px] items-end gap-6">
          <div>
            <RText id="regional-south-px.h1a" />
            <RText id="regional-south-px.h1b" />
            <div className="mt-1"><RText id="regional-south-px.sub" /></div>
          </div>
          <RText id="regional-south-px.intro" />
        </div>
        <PGoldRule className="my-4" />

        {/* Region blocks on the left, navy icon-list rail on the right */}
        <div className="grid flex-1 grid-cols-[1fr_212px] gap-5">
          <div className="flex flex-col gap-4">
            <RegionBlock p="regional-south-px.r1" />
            <RegionBlock p="regional-south-px.r2" />
            <RegionBlock p="regional-south-px.r3" />
          </div>

          <div className="flex flex-col rounded-md p-4" style={navy}>
            <RText id="regional-south-px.railTitle" />
            <PGoldRule className="mb-3 mt-2 max-w-[90px]" />
            <div className="flex flex-1 flex-col gap-4">
              {RAIL.map((r) => (
                <div key={r.icon} className="flex items-start gap-2.5">
                  <span className="mt-px flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full" style={{ border: `2px solid ${GOLD}` }}>
                    <RIcon id={`regional-south-px.${r.icon}`} size={16} color={GOLD} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0">
                    <RText id={`regional-south-px.${r.label}`} />
                    <RText id={`regional-south-px.${r.body}`} className="mt-0.5" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-auto flex items-center gap-2.5 pt-4">
              <div className="rounded-sm bg-white p-1.5"><RQr id="regional-south-px.railQr" size={52} /></div>
              <RText id="regional-south-px.railScan" />
            </div>
          </div>
        </div>
      </div>

      <PFooter footerId="regional-south-px.footer" pageNumId="regional-south-px.pageNum" />
    </PPage>
  );
}
