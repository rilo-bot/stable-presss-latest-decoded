import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  heading: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
  ctaHref?: string;
  className?: string;
  /** Subdued variant — no border, used inline within larger containers */
  subdued?: boolean;
  /** Size variant for compact contexts like Kanban columns */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Reusable empty-state block — editorial-minimal style.
 * Circular primary/10 halo → icon in primary → gold rule → heading → body → optional CTA.
 * Calm, authoritative, literary voice throughout.
 */
export function EmptyState({
  icon: Icon,
  heading,
  description,
  ctaLabel,
  onCta,
  ctaHref,
  className,
  subdued = false,
  size = 'md',
}: EmptyStateProps) {
  const padY = size === 'sm' ? 'py-8' : size === 'lg' ? 'py-24' : 'py-16';
  const haloSize = size === 'sm' ? 'w-10 h-10' : 'w-16 h-16';
  const iconSize = size === 'sm' ? 18 : 26;
  const headingClass =
    size === 'sm'
      ? 'text-sm font-bold'
      : size === 'lg'
      ? 'text-2xl font-bold'
      : 'text-xl font-bold';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6',
        padY,
        !subdued && 'border border-border/50 rounded-sm bg-card',
        className
      )}
    >
      {/* Halo */}
      <div
        className={cn(
          'rounded-full flex items-center justify-center mb-4 motion-reduce:transition-none',
          haloSize
        )}
        style={{ background: 'hsl(var(--primary) / 0.08)' }}
      >
        <Icon size={iconSize} className="text-primary" />
      </div>

      {/* Heading */}
      <h3
        className={cn(
          'font-[family-name:var(--font-display)] text-foreground mb-3 leading-snug max-w-xs',
          headingClass
        )}
      >
        {heading}
      </h3>

      {/* Gold rule */}
      <div
        className="h-px w-10 mb-4"
        style={{ background: 'hsl(var(--brand-accent))' }}
      />

      {/* Body */}
      <p
        className={cn(
          'text-muted-foreground leading-relaxed max-w-xs italic font-[family-name:var(--font-display)]',
          size === 'sm' ? 'text-xs' : 'text-sm'
        )}
      >
        {description}
      </p>

      {/* CTA */}
      {ctaLabel && (onCta || ctaHref) && (
        <div className="mt-6">
          {onCta ? (
            <Button
              size={size === 'sm' ? 'sm' : 'sm'}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={onCta}
            >
              {ctaLabel}
            </Button>
          ) : ctaHref ? (
            <Button
              size={size === 'sm' ? 'sm' : 'sm'}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              asChild
            >
              <Link to={ctaHref}>{ctaLabel}</Link>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
