import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  /** Optional leading icon, rendered at the same size across the app. */
  icon?: ReactNode;
  children: ReactNode;
  /** Bottom margin varies by context (cards use more room than bare columns). */
  className?: string;
}

/**
 * The one section heading used across the hub screens (Dashboard, OrgDashboard).
 * Before this existed each screen hand-rolled the same <h2> markup, which is how
 * they drifted apart.
 */
export function SectionHeading({ icon, children, className }: SectionHeadingProps) {
  return (
    <h2
      className={cn(
        'flex items-center gap-2 text-sm font-bold uppercase tracking-[0.1em] text-foreground',
        className ?? 'mb-3'
      )}
    >
      {icon}
      {children}
    </h2>
  );
}
