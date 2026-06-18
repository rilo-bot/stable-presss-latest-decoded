/**
 * Premium template — shared layout primitives.
 *
 * These are SEPARATE from the classic template's parts.tsx so the premium design
 * (template #2) can evolve without touching template #1. Same fixed A4 canvas,
 * but with theme-inverted (navy) feature pages, gold pill tabs and gold rules to
 * match the printed NZTROF bulletin.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { RText } from '../../components/Region';
import { PAGE_W, PAGE_H } from '../parts';
import { NAVY, GOLD } from '../styles';

export { PAGE_W, PAGE_H };

/** Premium template's own page background — a warmer ivory than the shared CREAM
 *  (#f6f1e6), which reads too white. Scoped here so template #1 is unaffected. */
export const PREMIUM_CREAM = '#f3ecda';

/** Page surface. `tone='navy'` = inverted dark feature page (gold/white text). */
export function PPage({
  children,
  tone = 'cream',
  className,
}: {
  children: ReactNode;
  tone?: 'cream' | 'navy';
  className?: string;
}) {
  return (
    <div
      className={cn('relative flex flex-col overflow-hidden', className)}
      style={{ width: PAGE_W, height: PAGE_H, background: tone === 'navy' ? NAVY : PREMIUM_CREAM }}
    >
      {children}
    </div>
  );
}

/** Cream-page navy section band (label + optional right note). */
export function PBand({ id, subId, accent = NAVY }: { id: string; subId?: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between px-9 py-2.5" style={{ background: accent }}>
      <RText id={id} />
      {subId && <RText id={subId} className="text-right" />}
    </div>
  );
}

/** Navy-page header: a gold pill tab (page label) + a gold italic tagline. */
export function PTab({ labelId, taglineId }: { labelId: string; taglineId?: string }) {
  return (
    <div className="flex items-center justify-between px-9 pt-6 pb-1">
      <span className="inline-flex rounded-[3px] px-3 py-1.5" style={{ background: GOLD }}>
        <RText id={labelId} />
      </span>
      {taglineId && <RText id={taglineId} className="text-right" />}
    </div>
  );
}

/** Footer strip pinned to the page bottom (navy, with a hairline gold rule on top). */
export function PFooter({ footerId, pageNumId }: { footerId: string; pageNumId: string }) {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-9 py-2.5"
      style={{ background: NAVY, borderTop: `1px solid ${GOLD}40` }}
    >
      <RText id={footerId} />
      <RText id={pageNumId} />
    </div>
  );
}

export function PGoldRule({ className }: { className?: string }) {
  return (
    <div
      className={cn('h-[2px] w-full', className)}
      style={{ background: `linear-gradient(90deg, ${GOLD}, transparent)` }}
    />
  );
}

/** Gold-bordered panel. On navy pages pass `onNavy` for a translucent fill. */
export function PCard({
  children,
  className,
  onNavy = false,
}: {
  children: ReactNode;
  className?: string;
  onNavy?: boolean;
}) {
  return (
    <div
      className={cn('rounded-sm border p-3', className)}
      style={{ borderColor: `${GOLD}55`, background: onNavy ? 'rgba(255,255,255,0.04)' : PREMIUM_CREAM }}
    >
      {children}
    </div>
  );
}
