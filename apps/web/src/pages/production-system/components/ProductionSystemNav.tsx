/**
 * Campaign Engine navigation.
 *
 * Two presentations of one nav list:
 *   - `ProductionSystemSidebar` — the desktop rail. Sticky, full viewport
 *     height, and it scrolls its own nav list rather than scrolling with the
 *     page, so the brand mark and the account chip stay put however long the
 *     screen's content is.
 *   - `ProductionSystemNavDrawer` — the same list as a slide-in drawer below
 *     `md`, opened from the top bar. Previously the rail was simply
 *     `hidden md:flex` with nothing behind it, leaving all 16 screens
 *     unreachable on a phone.
 *
 * The public site's masthead/wordmark/section rows are deliberately absent:
 * navigation lives here, the screen name and its primary action live in the top
 * bar, and the account sits in this rail's footer.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ChevronsUpDown, ExternalLink, LogOut, PanelLeftClose, PanelLeftOpen, X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { roleSummary, useAssignedRoles } from '@/lib/roleDisplay';
import type { AuthUser } from '@/stores/authStore';
import type { Horse } from '@/types/horse';
import type { RegisterPerson } from '@/lib/register';
import type { MediaItem } from '@/types/mediaItem';
import type { RacingEntry } from '@/types/racingEntry';

import { SIDE_NAV, navPath } from '../../newsroom/constants';
import type { SideNavItem } from '../../newsroom/constants';

/**
 * Section order, DERIVED from SIDE_NAV rather than listed here.
 *
 * This was a hardcoded `['Workspace', 'Content', 'Stables', 'Management']`, and
 * renaming the sections in SIDE_NAV silently deleted three of them from the
 * rail: any row whose section was not in this array rendered nowhere, with no
 * error — a superadmin lost Stories, Community and Personal entirely.
 *
 * Deriving it means the sidebar has ONE source of order, the same way the
 * permission grid has one source of rows.
 */
const SECTIONS: string[] = [...new Set(SIDE_NAV.map((i) => i.section).filter((s): s is string => !!s))];

export interface NavCounts {
  pendingReview: number;
  horses: Horse[];
  safeParties: RegisterPerson[];
  mediaItems: MediaItem[];
  racingEntries: RacingEntry[];
}

interface NavListProps extends NavCounts {
  visibleNav: SideNavItem[];
  collapsed: boolean;
  /** Called after a navigation — closes the mobile drawer. */
  onNavigate?: () => void;
}

/** Count badge for a nav row, or null when there's nothing to report. */
function navBadge(item: SideNavItem, counts: NavCounts) {
  const { pendingReview, horses, safeParties, mediaItems, racingEntries } = counts;
  switch (item.id) {
    case 'editor-hub':
      return pendingReview > 0 ? pendingReview : null;
    // The register ids lost their "-production-system" tails when they became
    // permission prefixes; a stale id here costs a count badge, silently.
    case 'horses':
      return horses.length || null;
    case 'people':
      return safeParties.length || null;
    case 'media-records':
      return mediaItems.length || null;
    case 'racing-records':
      return racingEntries.length || null;
    default:
      return null;
  }
}

function NavList({ visibleNav, collapsed, onNavigate, ...counts }: NavListProps) {
  const { pathname } = useLocation();

  return (
    // px-3 rather than px-2: with the rows themselves also on px-3, the labels
    // clear the rail's edges by 24px instead of 16px, which is what stops a full
    // green rail reading as a wall of text pressed against its own border.
    // The rail widens to match (see ProductionSystemSidebar) so nothing truncates
    // that didn't before.
    <nav className="slim-scroll flex-1 overflow-y-auto px-3 py-3">
      {SECTIONS.map((section) => {
        const items = visibleNav.filter((i) => i.section === section);
        if (items.length === 0) return null;
        return (
          <div key={section} className="mb-4 last:mb-0">
            {/* Section label. The AA floor for cream-on-forest is /56, and this
                was /45 — a pleasantly recessive 3.50:1, i.e. a fail at 11px.
                /60 (4.97:1) is the nearest value that passes AND exists: the
                opacity scale is multiples of 5, so a bare /62 is not generated
                at all and the label would silently inherit full-brightness cream. */}
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/60">
                {section}
              </p>
            )}
            <div className="space-y-0.5">
              {items.map((item) => {
                const to = navPath(item);
                const active = pathname === to || pathname.startsWith(`${to}/`);
                const badge = navBadge(item, counts);
                return (
                  <Link
                    key={item.id}
                    to={to}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-[13.5px] font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      collapsed && 'justify-center px-0',
                      // Green chrome: the rail is --primary, so states are spelled
                      // in primary-foreground alpha, not in light-surface tokens.
                      // /70 is the inactive weight (6.15:1); the floor for AA on
                      // this green is /62. Active is the gold accent (5.19:1).
                      active
                        ? 'bg-primary-foreground/10 text-[hsl(var(--brand-accent))]'
                        : 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground',
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className={cn('flex-shrink-0', active ? 'text-[hsl(var(--brand-accent))]' : 'text-primary-foreground/60')}>
                      {item.icon}
                    </span>
                    {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
                    {!collapsed && item.badge && (
                      <span
                        className="flex-shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                        style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
                      >
                        {item.badge}
                      </span>
                    )}
                    {/* One neutral badge treatment for every count. Five
                        different accent colours implied a meaning none carried. */}
                    {!collapsed && badge !== null && (
                      <span
                        className={cn(
                          'flex-shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                          active
                            ? 'bg-primary-foreground/15 text-primary-foreground'
                            : 'bg-primary-foreground/10 text-primary-foreground/70',
                        )}
                      >
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/** Gold brand mark, masked from the logo artwork like the public masthead. */
function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="h-8 w-8 flex-shrink-0 rounded-sm"
      style={{
        // Gold, as the comment above always said — it was --primary, which is now
        // the rail's own background and would render the mark invisible.
        backgroundColor: 'hsl(var(--brand-accent))',
        WebkitMaskImage: "url('/images/Stable_Press.png')",
        maskImage: "url('/images/Stable_Press.png')",
        WebkitMaskSize: '22px',
        maskSize: '22px',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
}

/**
 * The masthead in the rail. Clicking it leaves for the public site, the same
 * convention the site's own masthead follows — so the logo behaves the way a
 * logo is expected to, rather than being the one unclickable brand mark in the
 * app.
 */
function NavBrand({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <Link
      to="/"
      onClick={onNavigate}
      title="Go to the public site"
      className={cn(
        'group/brand flex min-w-0 items-center gap-2.5 rounded-sm transition-opacity hover:opacity-80',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        collapsed && 'justify-center',
      )}
    >
      <BrandMark />
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate font-[family-name:var(--font-display)] text-[15px] font-bold leading-tight text-primary-foreground">
            Stable Press
          </span>
          <span className="flex items-center gap-1 truncate text-[11px] leading-tight text-primary-foreground/60">
            Campaign Engine
            <ExternalLink
              size={9}
              className="flex-shrink-0 opacity-0 transition-opacity group-hover/brand:opacity-100"
              aria-hidden="true"
            />
          </span>
        </span>
      )}
    </Link>
  );
}

/** Account chip: identity plus the menu holding "View site" and "Sign out". */
function NavAccount({
  currentUser, accentColor, collapsed, onLogout,
}: {
  currentUser: AuthUser | null;
  accentColor: string;
  collapsed: boolean;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const assignedRoles = useAssignedRoles();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!currentUser) return null;

  const initial = currentUser.name.charAt(0).toUpperCase();
  const roleText = assignedRoles.length ? roleSummary(assignedRoles) : 'No role assigned';

  return (
    // px-3 to sit on the same left edge as the nav rows above it, rather than
    // 4px inboard of them.
    <div ref={ref} className="relative border-t border-primary-foreground/10 px-3 py-2.5">
      {open && (
        <div className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-sm border border-border bg-popover shadow-lg">
          <Link
            to="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/70"
          >
            <ExternalLink size={14} className="text-muted-foreground" />
            View public site
          </Link>
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="flex w-full items-center gap-2 border-t border-border/60 px-3 py-2.5 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-muted/70"
          >
            <LogOut size={14} className="text-muted-foreground" />
            Sign out
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className={cn(
          'flex w-full items-center gap-2.5 rounded-sm border border-primary-foreground/15 bg-primary-foreground/5 p-2 text-left transition-colors hover:bg-primary-foreground/10',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60',
          collapsed && 'justify-center border-transparent bg-transparent p-1',
        )}
        title={collapsed ? `${currentUser.name} — ${roleText}` : undefined}
      >
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-primary-foreground"
          style={{ background: accentColor }}
        >
          {initial}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight text-primary-foreground">
                {currentUser.name}
              </span>
              <span className="block truncate text-[11px] leading-tight text-primary-foreground/60">
                {roleText}
              </span>
            </span>
            <ChevronsUpDown size={14} className="flex-shrink-0 text-primary-foreground/60" />
          </>
        )}
      </button>
    </div>
  );
}

interface SidebarProps extends NavCounts {
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  accentColor: string;
  visibleNav: SideNavItem[];
  currentUser: AuthUser | null;
  onLogout: () => void;
}

export function ProductionSystemSidebar({
  collapsed, setCollapsed, accentColor, visibleNav, currentUser, onLogout, ...counts
}: SidebarProps) {
  return (
    <aside
      className={cn(
        // sticky + h-screen: the rail owns its own scroll, so the nav never
        // scrolls away with the page body.
        // GREEN CHROME — see docs/THEME-DIRECTION.md. Navigation is the frame
        // around the work, so the rail is --primary, matching NavBar.tsx on the
        // public site. It was bg-card, which put cream chrome around cream
        // content and left the screen with no figure/ground at all.
        'sticky top-0 hidden h-screen flex-shrink-0 flex-col border-r border-primary-foreground/10 bg-primary text-primary-foreground md:flex',
        'transition-[width] duration-200',
        // w-64, up from w-60: the rows gained 8px of horizontal padding, so the
        // rail takes the 16px back rather than taking it out of the labels.
        collapsed ? 'w-[68px]' : 'w-64',
      )}
    >
      <div
        className={cn(
          'flex h-14 flex-shrink-0 items-center gap-2 border-b border-primary-foreground/10 px-4',
          collapsed && 'justify-center px-0',
        )}
      >
        <NavBrand collapsed={collapsed} />
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="ml-auto rounded-sm p-1.5 text-primary-foreground/60 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60"
            aria-label="Collapse sidebar"
            aria-expanded
            title="Collapse sidebar"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="mx-auto mt-2 rounded-sm p-1.5 text-primary-foreground/60 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60"
          aria-label="Expand sidebar"
          aria-expanded={false}
          title="Expand sidebar"
        >
          <PanelLeftOpen size={16} />
        </button>
      )}

      <NavList visibleNav={visibleNav} collapsed={collapsed} {...counts} />
      <NavAccount
        currentUser={currentUser}
        accentColor={accentColor}
        collapsed={collapsed}
        onLogout={onLogout}
      />
    </aside>
  );
}

interface DrawerProps extends NavCounts {
  open: boolean;
  onClose: () => void;
  accentColor: string;
  visibleNav: SideNavItem[];
  currentUser: AuthUser | null;
  onLogout: () => void;
}

/** The same rail as a `md:hidden` slide-in, opened from the top bar. */
export function ProductionSystemNavDrawer({
  open, onClose, accentColor, visibleNav, currentUser, onLogout, ...counts
}: DrawerProps) {
  const { pathname } = useLocation();

  // A drawer that survives navigation would cover the screen just asked for.
  useEffect(() => { onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes, and the body must not scroll behind the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex md:hidden">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} aria-hidden="true" />
      <div
        // Same width bump as the desktop rail, so the drawer's rows get the same
        // 24px edge gap instead of eating it out of the labels on the narrowest
        // viewport, where truncation actually bites.
        className="relative flex h-full w-[17rem] max-w-[85%] flex-col border-r border-primary-foreground/10 bg-primary text-primary-foreground shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Campaign Engine navigation"
      >
        <div className="flex h-14 flex-shrink-0 items-center gap-2 border-b border-primary-foreground/10 px-4">
          <NavBrand collapsed={false} onNavigate={onClose} />
          <button
            onClick={onClose}
            className="ml-auto rounded-sm p-1.5 text-primary-foreground/60 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60"
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>
        <NavList visibleNav={visibleNav} collapsed={false} onNavigate={onClose} {...counts} />
        <NavAccount
          currentUser={currentUser}
          accentColor={accentColor}
          collapsed={false}
          onLogout={onLogout}
        />
      </div>
    </div>
  );
}
