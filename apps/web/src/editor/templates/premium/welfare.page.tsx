/* Horse Welfare & Rehoming (premium, template #2) — "LIFE AFTER RACING".
   Cream page with the classic FOREST-green accent preserved: green band header,
   eventing hero with a play button, "Meet Henry" body, a 3-photo strip with
   sub-captions (New Disciplines / Great Partners / Forever Grateful), a green
   "How You Can Help" panel with 3 QR rows, a centred pull-quote and a navy
   ambulance strip with horseambulance.co.nz. */

import { PPage, PFooter, PGoldRule, PREMIUM_CREAM } from './parts';
import { RText, RImage, RQr, RIcon } from '../../components/Region';
import { NAVY, GOLD } from '../styles';

const FOREST = '#1a3322';
const navy = { background: NAVY };
const forest = { background: FOREST };

const CARDS = [
  { img: 'card1Img', cap: 'card1Cap', body: 'card1Body' },
  { img: 'card2Img', cap: 'card2Cap', body: 'card2Body' },
  { img: 'card3Img', cap: 'card3Cap', body: 'card3Body' },
];
const HELP = [
  { icon: 'help1Icon', label: 'help1Label', qr: 'help1Qr' },
  { icon: 'help2Icon', label: 'help2Label', qr: 'help2Qr' },
  { icon: 'help3Icon', label: 'help3Label', qr: 'help3Qr' },
];

export function WelfarePremium() {
  return (
    <PPage>
      {/* Header band — forest green, section label + gold accent icon */}
      <div className="flex items-center justify-between px-9 py-2.5" style={forest}>
        <RText id="horse-welfare-px.band" />
        <RIcon id="horse-welfare-px.bandIcon" size={18} color={GOLD} className="flex-shrink-0" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-9 pt-5 pb-[58px]">
        {/* Headline + Meet Henry on the left; eventing hero (with play button) right */}
        <div className="grid grid-cols-[1fr_320px] items-start gap-6">
          <div>
            <RText id="horse-welfare-px.h1a" />
            <RText id="horse-welfare-px.h1b" />
            <div className="mt-1"><RText id="horse-welfare-px.sub" /></div>
            <RText id="horse-welfare-px.body" className="mt-3 max-w-[360px]" />
            <RText id="horse-welfare-px.henryTitle" className="mt-4" />
            <PGoldRule className="mb-2 mt-1.5 max-w-[90px]" />
            <RText id="horse-welfare-px.henryBody" className="max-w-[360px]" />
            <RImage id="horse-welfare-px.henryImg" rounded="rounded-sm" className="mt-3 h-[150px]" />
          </div>
          {/* Hero with overlaid play button */}
          <div className="relative">
            <RImage id="horse-welfare-px.heroImg" rounded="rounded-sm" className="h-[330px]" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'rgba(10,35,66,0.55)' }}>
                <RIcon id="horse-welfare-px.heroPlayIcon" size={32} color="#ffffff" />
              </span>
            </span>
          </div>
        </div>

        {/* 3-photo strip with sub-captions */}
        <div className="mt-5 grid grid-cols-3 gap-4">
          {CARDS.map((c) => (
            <div key={c.img} className="flex flex-col overflow-hidden rounded-sm border" style={{ borderColor: `${GOLD}55`, background: PREMIUM_CREAM }}>
              <RImage id={`horse-welfare-px.${c.img}`} className="h-[112px]" />
              <div className="flex flex-1 flex-col p-2.5">
                <RText id={`horse-welfare-px.${c.cap}`} />
                <RText id={`horse-welfare-px.${c.body}`} className="mt-1" />
              </div>
            </div>
          ))}
        </div>

        {/* Green "How You Can Help" panel — 3 QR rows */}
        <div className="mt-5 rounded-md p-4" style={forest}>
          <RText id="horse-welfare-px.helpTitle" />
          <PGoldRule className="mb-3 mt-1.5 max-w-[120px]" />
          <div className="grid grid-cols-3 gap-4">
            {HELP.map((h) => (
              <div key={h.qr} className="flex items-center gap-2.5">
                <div className="rounded-sm bg-white p-1"><RQr id={`horse-welfare-px.${h.qr}`} size={48} /></div>
                <div className="flex min-w-0 flex-col gap-1">
                  <RIcon id={`horse-welfare-px.${h.icon}`} size={16} color={GOLD} className="flex-shrink-0" />
                  <RText id={`horse-welfare-px.${h.label}`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Centred pull-quote */}
        <div className="mt-auto pt-4">
          <RText id="horse-welfare-px.quote" className="!text-center" />
        </div>

        {/* Navy "proudly supporting" ambulance strip */}
        <div className="mt-4 flex items-center gap-3 rounded-sm px-4 py-3" style={navy}>
          <RIcon id="horse-welfare-px.sponsorIcon" size={20} color={GOLD} className="flex-shrink-0" />
          <RText id="horse-welfare-px.sponsorBand" className="flex-1" />
          <RText id="horse-welfare-px.sponsorUrl" className="flex-shrink-0" />
        </div>
      </div>

      <PFooter footerId="horse-welfare-px.footer" pageNumId="horse-welfare-px.pageNum" />
    </PPage>
  );
}
