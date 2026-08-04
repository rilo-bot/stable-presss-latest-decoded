import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { can } from '@/lib/permissions';
import { isStaff, primaryPartyId } from '@/rbac/can';
import { ChevronDown, ChevronUp, Menu, X } from 'lucide-react';
import { toast } from 'sonner';
import { type NavSection } from './navbar/config';
import { DesktopMenu } from './navbar/DesktopMenu';
import { MobileMenu } from './navbar/MobileMenu';
import { UserMenu, type AccountLink } from './navbar/UserMenu';

export function NavBar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();

  // The horse (`/horses/:id`) and owner/party (`/parties/:id`) detail pages are
  // dense, viewport-fit dossiers — not the `/horses` or `/parties` indexes.
  // Collapse the three header bars by default there so the dossier fits on one
  // screen; a single arrow toggle re-expands them.
  const isDossier = /^\/(horses|parties)\/[^/]+$/.test(location.pathname);
  const [collapsed, setCollapsed] = useState(isDossier);

  // Re-evaluate on navigation: collapse when entering a dossier page, expand
  // again everywhere else.
  useEffect(() => {
    setCollapsed(isDossier);
  }, [location.pathname, isDossier]);

  // Publish the real header height so viewport-fit pages (ProfileScaffold) and
  // sticky sub-bars (/news pins its category bar to `--navbar-h`) size against the
  // header that is actually on screen.
  //
  // MEASURED, not hardcoded. This was the literal string '112px' — the sum of
  // three rows, maintained by hand. Removing the masthead strip made it wrong, and
  // it would go wrong again the next time anyone changed a padding value. A
  // ResizeObserver on the header keeps it true through the collapse toggle, the
  // responsive breakpoints, and any future row change.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty('--navbar-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--navbar-h');
    };
  }, [collapsed]);

  const staff = isStaff(currentUser);
  const accountLabel = staff ? 'Staff' : 'Member';
  const myPartyId = primaryPartyId(currentUser);

  // The account dropdown's contents.
  //
  // These were separate 10px links strung across the deleted masthead strip, on
  // the PUBLIC site header, so a reader met up to nine account and staff links
  // before a single headline. Same permission checks, same destinations; one click
  // away rather than always on screen. See navbar/UserMenu.tsx.
  //
  // THE CAMPAIGN ENGINE IS NOT HERE. It keeps its position at the right-hand end
  // of the section row (navbar/DesktopMenu.tsx) — which is also why it must not be
  // repeated here: appearing in the strip AND the section row was one of the
  // duplications that made the old three-row header confusing. Podcast production
  // was the second such link; it is a screen inside the Campaign Engine now.
  const accountLinks: AccountLink[] = currentUser
    ? [
        { label: 'Dashboard', to: '/dashboard' },
        ...(myPartyId ? [{ label: 'My Profile', to: `/parties/${myPartyId}` }] : []),
        ...(currentUser.orgMemberships && currentUser.orgMemberships.length > 0
          ? [{ label: 'My Organisation', to: `/orgs/${currentUser.orgMemberships[0].orgId}` }]
          : []),
        ...(staff ? [{ label: 'Site Content', to: '/site-content', staff: true }] : []),
        ...(can('platform.admin')
          ? [{ label: 'Verify Claims', to: '/claims', staff: true }]
          : []),
      ]
    : [];

  const handleLogout = () => {
    logout();
    toast.success('You have signed out of Stable Press.');
    navigate('/');
    setMobileOpen(false);
  };

  // Check if a nav section is "active" based on pathname
  const isSectionActive = (section: NavSection): boolean => {
    const pathname = location.pathname;
    if (section.to.startsWith('/news')) {
      return pathname === '/news';
    }
    if (section.to === '/bulletins') {
      return pathname === '/bulletins';
    }
    if (section.to !== '/') {
      return pathname === section.to || pathname.startsWith(section.to.split('?')[0] + '/');
    }
    return pathname === '/';
  };

  // ── Collapsed header ── a slim brand strip with the wordmark + an arrow
  // that expands the full navigation back in. Shown on horse detail pages.
  if (collapsed) {
    return (
      <header
        ref={headerRef}
        className="sticky top-0 z-50 bg-primary text-primary-foreground border-b print:hidden"
        style={{ borderColor: 'hsl(var(--brand-accent) / 0.22)' }}
      >
        <div className="px-4 md:px-12">
          <div className="flex items-center justify-between h-9">
            <Link
              to="/"
              className="flex items-center gap-2 group"
              aria-label="Stable Press — home"
            >
              <span
                aria-hidden="true"
                className="h-6 w-6 flex-shrink-0 group-hover:opacity-90 transition-opacity"
                style={{
                  backgroundColor: 'hsl(var(--brand-accent))',
                  WebkitMaskImage: "url('/images/Stable_Press.png')",
                  maskImage: "url('/images/Stable_Press.png')",
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                }}
              />
              <span className="font-[family-name:var(--font-display)] text-sm font-bold tracking-tight leading-none group-hover:text-[hsl(var(--brand-accent))] transition-colors">
                Stable Press
              </span>
            </Link>
            <button
              onClick={() => setCollapsed(false)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[10px] uppercase tracking-[0.12em] text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
              aria-label="Expand navigation"
              title="Expand navigation"
            >
              <span className="hidden sm:inline">Show menu</span>
              <ChevronDown size={16} style={{ color: 'hsl(var(--brand-accent))' }} />
            </button>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 bg-primary text-primary-foreground border-b print:hidden"
      style={{ borderColor: 'hsl(var(--brand-accent) / 0.22)' }}
    >
      {/* THE MASTHEAD STRIP IS GONE — the header is TWO rows, not three.
          A third row sat above this one and held two things. On the left, a
          print-broadsheet strapline and today's date; neither told a reader
          anything, so both were dropped rather than relocated. On the right, a
          stack of up to seven role-conditional links at 10px: Subscribe,
          Dashboard, My Profile, My Organisation, Campaign Engine, Site Content,
          Verify Claims, Podcast Studio — so the PUBLIC site header offered nine
          account and staff links before a reader reached a headline. Three of them
          already appeared elsewhere in this same header (Subscribe as a gold button
          one row down; Campaign Engine and Podcast Studio in the section row). The
          personal ones are in the account dropdown now (navbar/UserMenu.tsx); the
          Campaign Engine keeps its place in the section row below. */}

      {/* ── Row 1: wordmark, then the account chip ── */}
      <div className="px-6 md:px-10 lg:px-16">
        <div className="flex items-center h-14 gap-4">
          {/* Wordmark */}
          <Link
            to="/"
            className="flex items-center gap-2.5 group flex-shrink-0"
            aria-label="Stable Press — home"
          >
            {/* Brand mark, recoloured to brand gold via a mask so the green
                artwork reads on the dark-green bar (transparent PNG → gold shape). */}
            <span
              aria-hidden="true"
              className="h-10 w-10 flex-shrink-0 group-hover:opacity-90 transition-opacity"
              style={{
                backgroundColor: 'hsl(var(--brand-accent))',
                WebkitMaskImage: "url('/images/Stable_Press.png')",
                maskImage: "url('/images/Stable_Press.png')",
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskPosition: 'center',
              }}
            />
            <span className="flex flex-col leading-none">
              <span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-primary-foreground group-hover:text-[hsl(var(--brand-accent))] transition-colors duration-150 leading-none">
                Stable Press
              </span>
              <span
                className="text-[10px] uppercase tracking-[0.16em] mt-0.5 opacity-80"
                style={{ color: 'hsl(var(--brand-accent))' }}
              >
                NZTROF Ownership
              </span>
            </span>
          </Link>

          {/* No strapline and no date line. Both came off the deleted masthead
              strip and were briefly moved here; they say nothing a reader needs and
              the wordmark already carries the identity. */}

          <div className="ml-auto flex items-center gap-2">
            {/* Account — one chip, opening one dropdown */}
            <UserMenu
              currentUser={currentUser}
              accountLabel={accountLabel}
              handleLogout={handleLogout}
              accountLinks={accountLinks}
            />

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-md text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Section navigation row ── */}
      <DesktopMenu
        activeDropdown={activeDropdown}
        setActiveDropdown={setActiveDropdown}
        isSectionActive={isSectionActive}
        staff={staff}
        pathname={location.pathname}
      />

      {/* ── Collapse toggle ── only on a dossier page, lets the reader hide
          the header again to reclaim the viewport. */}
      {isDossier && (
        <button
          onClick={() => setCollapsed(true)}
          className="w-full flex items-center justify-center gap-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors border-t border-primary-foreground/10"
          aria-label="Collapse navigation"
          title="Collapse navigation"
        >
          <span className="hidden sm:inline">Hide menu</span>
          <ChevronUp size={14} style={{ color: 'hsl(var(--brand-accent))' }} />
        </button>
      )}

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <MobileMenu
          currentUser={currentUser}
          accountLabel={accountLabel}
          staff={staff}
          pathname={location.pathname}
          setMobileOpen={setMobileOpen}
          handleLogout={handleLogout}
        />
      )}
    </header>
  );
}
