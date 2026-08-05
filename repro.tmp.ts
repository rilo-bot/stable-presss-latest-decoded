import { fitFontSize, refitText, estimateTextHeight } from './apps/server/src/lib/magazineV2/layout.js';
import { ROLE_SCALE } from './apps/server/src/lib/magazineV2/roleScale.js';

const s = ROLE_SCALE.headline!;
const fontFamily = 'Oswald, sans-serif';
const BOX = { w: 1100, h: 300 };

const headlines = [
  'THE UNSTOPPABLE RISE OF SYNDICATE OWNERSHIP IN AUSTRALIAN THOROUGHBRED RACING',
  'INSIDE THE SPRING CARNIVAL: HOW TRAINERS PREPARE A CHAMPION',
  'SILKS',
];

console.log(`role "headline" scale: maxFontSize=${s.maxFontSize} minFontSize=${s.minFontSize} lineHeight=${s.lineHeight}`);
console.log(`refitText's INVENTED floor = round(${s.maxFontSize} * 0.55) = ${Math.round(s.maxFontSize*0.55)}`);
console.log(`box ${BOX.w}x${BOX.h}\n`);

for (const text of headlines) {
  // What compose does (designed range):
  const designed = fitFontSize({ text, boxW: BOX.w, boxH: BOX.h, maxFontSize: s.maxFontSize,
    minFontSize: s.minFontSize, lineHeight: s.lineHeight, fontFamily, fontWeight: s.fontWeight });
  // What refitText does (invented 55% floor), via the real function:
  const el: any = { id: 'x', type: 'text', x: 0, y: 0, w: BOX.w, h: BOX.h,
    text: { content: text, fontFamily, fontSize: designed, maxFontSize: s.maxFontSize,
            fontWeight: s.fontWeight, lineHeight: s.lineHeight, autoFit: 'shrink', color: '#111', align: 'left' } };
  const after = (refitText([el])[0] as any).text.fontSize;
  const hDesigned = estimateTextHeight({ text, fontSize: designed, boxWidthPx: BOX.w, lineHeight: s.lineHeight, fontFamily, fontWeight: s.fontWeight });
  const hAfter    = estimateTextHeight({ text, fontSize: after,    boxWidthPx: BOX.w, lineHeight: s.lineHeight, fontFamily, fontWeight: s.fontWeight });
  const flag = (h: number) => h > BOX.h * 1.25 ? 'OVERFLOW FLAGGED' : 'ok';
  console.log(`"${text.slice(0,52)}${text.length>52?'…':''}"`);
  console.log(`   compose  fontSize=${String(designed).padStart(3)}  height=${hDesigned.toFixed(0).padStart(4)}  ${flag(hDesigned)}`);
  console.log(`   refit    fontSize=${String(after).padStart(3)}  height=${hAfter.toFixed(0).padStart(4)}  ${flag(hAfter)}`);
  console.log(`   → refit ${after>designed?`RAISED size by ${after-designed}px`:'left size alone'}\n`);
}
