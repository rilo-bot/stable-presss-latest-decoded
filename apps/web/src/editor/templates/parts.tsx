/**
 * Shared layout primitives for the page templates. They provide the fixed A4
 * canvas, navy section bands, footer strips and gold rules; all editable text
 * inside them is rendered through the <RText> region wrapper so the same markup
 * works in the editor and the public viewer.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { RText } from '../components/Region';
import { NAVY, GOLD, CREAM } from './styles';

/** A4 @96dpi portrait. */
export const PAGE_W = 794;
export const PAGE_H = 1123;

export function Page({
  children,
  className,
  bg = CREAM,
}: {
  children: ReactNode;
  className?: string;
  bg?: string;
}) {
  return (
    <div
      className={cn('relative flex flex-col overflow-hidden', className)}
      style={{ width: PAGE_W, height: PAGE_H, background: bg }}
    >
      {children}
    </div>
  );
}

/** Navy section band with an editable label (and optional right-aligned note). */
export function Band({ id, subId }: { id: string; subId?: string }) {
  return (
    <div className="flex items-center justify-between px-7 py-2.5" style={{ background: NAVY }}>
      <RText id={id} />
      {subId && <RText id={subId} className="text-right" />}
    </div>
  );
}

/** Navy footer strip pinned to the bottom of a page. */
export function Footer({ footerId, pageNumId }: { footerId: string; pageNumId: string }) {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-7 py-2"
      style={{ background: NAVY }}
    >
      <RText id={footerId} />
      <RText id={pageNumId} />
    </div>
  );
}

export function GoldRule({ className }: { className?: string }) {
  return (
    <div
      className={cn('h-[2px] w-full', className)}
      style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }}
    />
  );
}

/** Small numbered/lettered marker disc used in step lists & timelines. */
export function Disc({ children }: { children: ReactNode }) {
  return (
    <span
      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
      style={{ background: GOLD }}
    >
      {children}
    </span>
  );
}

/** Gold-bordered card frame used for stats / panels. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('rounded-sm border bg-white/70 p-3', className)}
      style={{ borderColor: `${GOLD}55` }}
    >
      {children}
    </div>
  );
}
