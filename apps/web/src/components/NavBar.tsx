import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { can } from '@/lib/permissions';
import { isStaff, primaryPartyId } from '@/rbac/can';
import { Menu, X } from 'lucide-react';
import { toast } from 'sonner';
import { type NavSection } from './navbar/config';
import { DesktopMenu } from './navbar/DesktopMenu';
import { MobileMenu } from './navbar/MobileMenu';
import { UserMenu } from './navbar/UserMenu';

export function NavBar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();

  const role = currentUser?.role;
  const staff = isStaff(currentUser);
  const accountLabel = staff ? 'Staff' : 'Member';
  const myPartyId = primaryPartyId(currentUser);

  const showPodcastWorkflow =
    can(role, 'podcast.manage') ||
    can(role, 'podcast.episode.create') ||
    can(role, 'podcast.episode.approve') ||
    can(role, 'podcast.episode.edit_any');

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
    if (section.to === '/newsletter') {
      return pathname === '/newsletter';
    }
    if (section.to === '/bulletins') {
      return pathname === '/bulletins';
    }
    if (section.to !== '/') {
      return pathname === section.to || pathname.startsWith(section.to.split('?')[0] + '/');
    }
    return pathname === '/';
  };

  return (
    <header
      className="sticky top-0 z-50 bg-primary text-primary-foreground border-b"
      style={{ borderColor: 'hsl(var(--brand-accent) / 0.22)' }}
    >
      {/* ── Masthead strip ── */}
      <div className="border-b border-primary-foreground/10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.12em]">
            <span className="opacity-60 hidden sm:block">The Thoroughbred Racing Record</span>
            <span className="h-3 w-px bg-primary-foreground/20 hidden sm:block" />
            <span
              className="font-semibold"
              style={{ color: 'hsl(var(--brand-accent))' }}
            >
              {new Date().toLocaleDateString('en-AU', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.1em]">
            {!currentUser && (
              <Link
                to="/signup"
                className="opacity-70 hover:opacity-100 transition-opacity font-semibold"
                style={{ color: 'hsl(var(--brand-accent))' }}
              >
                Subscribe
              </Link>
            )}
            {currentUser && (
              <Link
                to="/dashboard"
                className="opacity-70 hover:opacity-100 transition-opacity font-semibold"
                style={{ color: 'hsl(var(--brand-accent))' }}
              >
                Dashboard
              </Link>
            )}
            {currentUser && myPartyId && (
              <>
                <span className="h-3 w-px bg-primary-foreground/20" />
                <Link
                  to={`/parties/${myPartyId}`}
                  className="opacity-70 hover:opacity-100 transition-opacity font-semibold"
                  style={{ color: 'hsl(var(--brand-accent))' }}
                >
                  My Profile
                </Link>
              </>
            )}
            {currentUser?.orgMemberships && currentUser.orgMemberships.length > 0 && (
              <>
                <span className="h-3 w-px bg-primary-foreground/20" />
                <Link
                  to={`/orgs/${currentUser.orgMemberships[0].orgId}`}
                  className="opacity-70 hover:opacity-100 transition-opacity"
                >
                  My Organisation
                </Link>
              </>
            )}
            {staff && (
              <>
                <span className="h-3 w-px bg-primary-foreground/20" />
                <Link
                  to="/newsroom"
                  className="opacity-60 hover:opacity-100 transition-opacity"
                >
                  Newsroom
                </Link>
                <span className="h-3 w-px bg-primary-foreground/20" />
                <Link
                  to="/site-content"
                  className={cn(
                    'transition-opacity',
                    location.pathname === '/site-content' ? 'opacity-100' : 'opacity-60 hover:opacity-100'
                  )}
                >
                  Site Content
                </Link>
              </>
            )}
            {role === 'administrator' && (
              <>
                <span className="h-3 w-px bg-primary-foreground/20" />
                <Link
                  to="/claims"
                  className={cn(
                    'transition-opacity font-semibold',
                    location.pathname === '/claims' ? 'opacity-100' : 'opacity-60 hover:opacity-100'
                  )}
                  style={{ color: 'hsl(var(--brand-accent))' }}
                >
                  Verify Claims
                </Link>
              </>
            )}
            {showPodcastWorkflow && (
              <>
                <span className="h-3 w-px bg-primary-foreground/20" />
                <Link
                  to="/podcast/workflow"
                  className={cn(
                    'transition-opacity font-semibold',
                    location.pathname === '/podcast/workflow'
                      ? 'opacity-100'
                      : 'opacity-60 hover:opacity-100'
                  )}
                  style={{ color: 'hsl(var(--brand-accent))' }}
                >
                  Podcast Studio
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Wordmark row ── */}
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Wordmark */}
          <Link
            to="/"
            className="flex items-center gap-2.5 group"
            aria-label="Stable Press — home"
          >
            {/* Brand mark, recoloured to brand gold via a mask so the green
                artwork reads on the dark-green bar (transparent PNG → gold shape). */}
            <span
              aria-hidden="true"
              className="h-12 w-12 flex-shrink-0 group-hover:opacity-90 transition-opacity"
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
              <span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-primary-foreground group-hover:text-[hsl(var(--brand-accent))] transition-colors duration-150 leading-none">
                Stable Press
              </span>
              <span
                className="text-[9px] uppercase tracking-[0.22em] mt-0.5"
                style={{ color: 'hsl(var(--brand-accent))' }}
              >
                NZTROF Ownership
              </span>
            </span>
          </Link>

          {/* Desktop auth strip */}
          <UserMenu
            currentUser={currentUser}
            accountLabel={accountLabel}
            handleLogout={handleLogout}
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

      {/* ── Section navigation row ── */}
      <DesktopMenu
        activeDropdown={activeDropdown}
        setActiveDropdown={setActiveDropdown}
        isSectionActive={isSectionActive}
        showPodcastWorkflow={showPodcastWorkflow}
        staff={staff}
        pathname={location.pathname}
      />

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <MobileMenu
          currentUser={currentUser}
          accountLabel={accountLabel}
          showPodcastWorkflow={showPodcastWorkflow}
          staff={staff}
          pathname={location.pathname}
          setMobileOpen={setMobileOpen}
          handleLogout={handleLogout}
        />
      )}
    </header>
  );
}
