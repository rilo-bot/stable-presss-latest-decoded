import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';

import { NotificationBell } from '@/components/NotificationBell';

interface TopBarProps {
  title: string;
  /** The screen's primary action (e.g. File a Story). */
  actions?: ReactNode;
  /** Opens the mobile nav drawer; the button only renders below `md`. */
  onOpenNav: () => void;
}

/**
 * The production system's single header row.
 *
 * One bar, not the public site's three: screen name on the left, notifications
 * and the screen's primary action on the right. Screens render their content
 * directly beneath it — the title and primary action live here rather than in a
 * per-screen header, so there is exactly one place a page is named and one
 * place its main action sits.
 */
export function ProductionSystemTopBar({ title, actions, onOpenNav }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
      <button
        onClick={onOpenNav}
        className="md:hidden -ml-1 rounded-sm p-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Open navigation"
      >
        <Menu size={18} />
      </button>

      <h1 className="min-w-0 truncate font-[family-name:var(--font-display)] text-base font-bold tracking-tight text-foreground">
        {title}
      </h1>

      <div className="ml-auto flex items-center gap-2">
        <NotificationBell tone="light" />
        {actions}
      </div>
    </header>
  );
}
