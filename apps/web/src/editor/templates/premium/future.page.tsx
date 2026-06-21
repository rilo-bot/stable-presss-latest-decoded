/* Premium template — Our Future. Together. (template #2).
   Restyled version of the classic FuturePage: a laptop/phone device hero image,
   two header cards (Long-Term Strategic Direction; The Print Magazine) with
   outline-icon features each, a navy "THE WEBSITE: DELIVERING DEPTH &
   INTERACTION" band with seven outline-icon feature columns, and a
   "Together, we grow racing" footer block with QR. */

import { IconBadge } from './kit';
import { PPage, PFooter, PGoldRule } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const navy = { background: NAVY };

const STRATEGY = [
  { icon: 'strat1Icon', body: 'strat1' },
  { icon: 'strat2Icon', body: 'strat2' },
  { icon: 'strat3Icon', body: 'strat3' },
];
const MAG = [
  { icon: 'mag1Icon', body: 'mag1' },
  { icon: 'mag2Icon', body: 'mag2' },
  { icon: 'mag3Icon', body: 'mag3' },
  { icon: 'mag4Icon', body: 'mag4' },
];
const WEB = [
  { icon: 'web1Icon', label: 'web1' },
  { icon: 'web2Icon', label: 'web2' },
  { icon: 'web3Icon', label: 'web3' },
  { icon: 'web4Icon', label: 'web4' },
  { icon: 'web5Icon', label: 'web5' },
  { icon: 'web6Icon', label: 'web6' },
  { icon: 'web7Icon', label: 'web7' },
];

export function FuturePremium() {
  return (
    <PPage>
      <div className="flex flex-1 min-h-0 flex-col px-9 pt-9 pb-[64px]">
        {/* Headline + intro + device hero */}
        <RText id="future-together-px.h1a" />
        <RText id="future-together-px.h1b" />
        <div className="mt-1"><RText id="future-together-px.sub" /></div>
        <PGoldRule className="mb-2.5 mt-2 max-w-[160px]" />
        <RText id="future-together-px.body" className="max-w-[520px]" />
        <RImage id="future-together-px.deviceImg" rounded="rounded-sm" className="mt-4 h-[210px]" />

        {/* Two header cards — strategic direction + print magazine */}
        <div className="mt-5 grid grid-cols-2 gap-5">
          <div className="flex flex-col rounded-md p-4" style={navy}>
            <RText id="future-together-px.strategyTitle" />
            <PGoldRule className="mb-3 mt-1.5 max-w-[80px]" />
            <RText id="future-together-px.strategyBody" />
            <div className="mt-3 space-y-2.5">
              {STRATEGY.map((s) => (
                <div key={s.icon} className="flex items-center gap-2.5">
                  <RIcon id={`future-together-px.${s.icon}`} size={16} color={GOLD} className="flex-shrink-0" />
                  <RText id={`future-together-px.${s.body}`} />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col rounded-md p-4" style={navy}>
            <RText id="future-together-px.magTitle" />
            <PGoldRule className="mb-3 mt-1.5 max-w-[80px]" />
            <div className="space-y-2.5">
              {MAG.map((m) => (
                <div key={m.icon} className="flex items-start gap-2.5">
                  <RIcon id={`future-together-px.${m.icon}`} size={16} color={GOLD} className="mt-0.5 flex-shrink-0" />
                  <RText id={`future-together-px.${m.body}`} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* The website band — seven outline-icon feature columns */}
        <div className="mt-5 rounded-md border" style={{ borderColor: `${GOLD}66` }}>
          <div className="rounded-t-md px-4 py-2.5" style={navy}>
            <RText id="future-together-px.webTitle" />
          </div>
          <div className="grid grid-cols-7 gap-2 px-4 py-4">
            {WEB.map((w) => (
              <div key={w.icon} className="flex flex-col items-center gap-2 text-center">
                <IconBadge iconId={`future-together-px.${w.icon}`} size={36} variant="outline" />
                <RText id={`future-together-px.${w.label}`} className="!text-center" />
              </div>
            ))}
          </div>
        </div>

        {/* Together, we grow racing — CTA block with QR */}
        <div className="mt-auto grid grid-cols-[1fr_90px] items-center gap-5 rounded-md p-5" style={{ ...navy, borderLeft: `4px solid ${GOLD}` }}>
          <div>
            <RText id="future-together-px.ctaTitle" />
            <RText id="future-together-px.ctaBody" className="mt-2" />
          </div>
          <div className="rounded-sm bg-white p-1.5"><RQr id="future-together-px.ctaQr" size={72} /></div>
        </div>
      </div>
      <PFooter footerId="future-together-px.footer" pageNumId="future-together-px.pageNum" />
    </PPage>
  );
}
