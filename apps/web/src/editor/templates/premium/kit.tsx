/**
 * Premium template — icon + infographic kit.
 *
 * The classic template renders text on cream with plain cards. The premium design
 * adds the printed bulletin's gold line-icons, stat badges, numbered timelines and
 * the ownership pyramid. Icons are FIXED design furniture (lucide-react); the text
 * beside them stays editable via <RText>.
 */

import type { LucideIcon } from 'lucide-react';
import { RText, RQr } from '../../components/Region';
import { NAVY, GOLD, WHITE, NAVY_SOFT } from '../styles';

/** Gold disc (solid) or gold ring (outline) wrapping a lucide glyph. */
export function IconBadge({
  icon: Icon,
  size = 38,
  variant = 'solid',
}: {
  icon: LucideIcon;
  size?: number;
  variant?: 'solid' | 'outline';
}) {
  const inner = Math.round(size * 0.5);
  if (variant === 'outline') {
    return (
      <span
        className="flex flex-shrink-0 items-center justify-center rounded-full"
        style={{ width: size, height: size, border: `2px solid ${GOLD}` }}
      >
        <Icon size={inner} color={GOLD} strokeWidth={1.6} />
      </span>
    );
  }
  return (
    <span
      className="flex flex-shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: GOLD }}
    >
      <Icon size={inner} color={NAVY} strokeWidth={2.2} />
    </span>
  );
}

/** Centered stat: gold icon badge + big figure + caption (both editable). */
export function IconStat({ icon, numId, labelId }: { icon: LucideIcon; numId: string; labelId: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <IconBadge icon={icon} size={34} />
      <RText id={numId} className="!text-center" />
      <RText id={labelId} className="!text-center" />
    </div>
  );
}

/** Numbered timeline step: gold disc + editable text (with its own gold lead). */
export function NumberStep({ n, id }: { n: number; id: string }) {
  return (
    <div className="flex gap-3">
      <span
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
        style={{ background: GOLD, color: NAVY }}
      >
        {n}
      </span>
      <RText id={id} />
    </div>
  );
}

/** Icon + text row (data points, structural-cycle items). */
export function IconRow({ icon, id }: { icon: LucideIcon; id: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <IconBadge icon={icon} size={26} />
      <RText id={id} />
    </div>
  );
}

/** Circular outline icon + title + body, stacked (feature grids / "what you said"). */
export function IconFeature({ icon, titleId, bodyId }: { icon: LucideIcon; titleId: string; bodyId?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <IconBadge icon={icon} size={44} variant="outline" />
      <RText id={titleId} className="!text-center" />
      {bodyId && <RText id={bodyId} className="!text-center" />}
    </div>
  );
}

/** Explore column: outline icon + QR + caption (the Aeliana "explore" strip). */
export function ExploreItem({ icon, qrId, labelId }: { icon: LucideIcon; qrId: string; labelId: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <IconBadge icon={icon} size={28} variant="outline" />
      <div className="rounded-sm bg-white p-1">
        <RQr id={qrId} size={46} />
      </div>
      <RText id={labelId} className="!text-center" />
    </div>
  );
}

/** Big decorative quote mark (Playfair). */
export function QuoteMark({ color = GOLD, size = 40 }: { color?: string; size?: number }) {
  return (
    <span
      className="font-[family-name:var(--font-display)] leading-[0.6]"
      style={{ color, fontSize: size }}
      aria-hidden
    >
      &ldquo;
    </span>
  );
}

/** Ownership pyramid: 3 widening tiers (gold apex → steel base) + a base label.
 *  Tier labels are editable regions; the base is a static design label. */
export function Pyramid({ tierIds, baseLabel }: { tierIds: string[]; baseLabel?: string }) {
  const tiers = [
    { w: '56%', bg: GOLD },
    { w: '78%', bg: NAVY_SOFT },
    { w: '100%', bg: '#6b7a91' },
  ];
  return (
    <div className="flex flex-col items-center gap-1.5">
      {tierIds.slice(0, 3).map((id, i) => (
        <div
          key={id}
          className="flex items-center justify-center rounded-[3px] px-2 py-2 text-center"
          style={{ width: tiers[i]?.w ?? '100%', background: tiers[i]?.bg ?? NAVY_SOFT }}
        >
          <RText id={id} className="!text-center" />
        </div>
      ))}
      {baseLabel && (
        <div
          className="mt-1 w-full rounded-[3px] border border-dashed px-2 py-1.5 text-center text-[8px] font-bold uppercase tracking-[0.12em]"
          style={{ borderColor: `${GOLD}66`, color: GOLD }}
        >
          {baseLabel}
        </div>
      )}
    </div>
  );
}

export { NAVY, GOLD, WHITE };
