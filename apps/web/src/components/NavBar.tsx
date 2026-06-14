import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { can } from '@/lib/permissions';
import { isStaff, primaryPartyId } from '@/rbac/can';
import { NotificationBell } from '@/components/NotificationBell';
import {
  Menu,
  X,
  LogOut,
  User,
  ChevronDown,
  Newspaper,
  BarChart2,
  Mic,
  Tv,
  BookOpen,
  HelpCircle,
  Star,
  LoaderCircle,
  Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface SubItem {
  label: string;
  to: string;
  description: string;
}

interface NavSection {
  label: string;
  to: string;
  icon: React.ReactNode;
  sub?: SubItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'News',
    to: '/news?section=news',
    icon: <Newspaper size={14} />,
    sub: [
      {
        label: 'Race Reports',
        to: '/news?category=race-reports',
        description: 'Post-race analysis and results',
      },
      {
        label: 'Industry News',
        to: '/news?category=industry-news',
        description: 'Transfers, injuries, ownership',
      },
      {
        label: 'Morning Edition',
        to: '/news?category=morning-edition',
        description: "Today's stables dispatch",
      },
    ],
  },
  {
    label: 'Analysis',
    to: '/news?section=analysis',
    icon: <BarChart2 size={14} />,
    sub: [
      {
        label: 'Form Guide',
        to: '/news?category=form-guide',
        description: 'Deep-dive speed and class ratings',
      },
      {
        label: 'Track Notes',
        to: '/news?category=track-notes',
        description: 'Going reports and configurations',
      },
      {
        label: 'Bloodstock',
        to: '/news?category=bloodstock',
        description: 'Pedigree and breeding analysis',
      },
    ],
  },
  {
    label: 'Interviews',
    to: '/news?section=interviews',
    icon: <Mic size={14} />,
    sub: [
      {
        label: 'Trainer Profiles',
        to: '/news?category=trainer-profiles',
        description: 'In-depth trainer conversations',
      },
      {
        label: 'Jockey Desk',
        to: '/news?category=jockey-desk',
        description: 'Rider perspectives and form',
      },
      {
        label: 'Owner Stories',
        to: '/news?category=owner-stories',
        description: 'The people behind the horses',
      },
    ],
  },
  {
    label: 'Horses',
    to: '/horses',
    icon: <Star size={14} />,
  },
  {
    label: 'Podcasts',
    to: '/podcast',
    icon: <Tv size={14} />,
  },
  {
    label: 'Newsletter',
    to: '/newsletter',
    icon: <Mail size={14} />,
    sub: [
      {
        label: 'All Editions',
        to: '/newsletter',
        description: 'Full newsletter archive',
      },
      {
        label: 'Race Reports',
        to: '/newsletter?category=race-reports',
        description: 'Race results and analysis',
      },
      {
        label: 'Form Guide',
        to: '/newsletter?category=form-guide',
        description: 'Sectional and speed data',
      },
      {
        label: 'Trainer Profiles',
        to: '/newsletter?category=trainer-profiles',
        description: 'In-depth trainer conversations',
      },
    ],
  },
  {
    label: 'Bulletins',
    to: '/bulletins',
    icon: <BookOpen size={14} />,
    sub: [
      {
        label: 'All Editions',
        to: '/bulletins',
        description: 'Full fortnightly bulletin archive',
      },
      {
        label: 'Bloodstock',
        to: '/bulletins?category=bloodstock',
        description: 'Pedigree and breeding intelligence',
      },
      {
        label: 'Trainer Profiles',
        to: '/bulletins?category=trainer-profiles',
        description: 'Longform trainer conversations',
      },
      {
        label: 'Form Analysis',
        to: '/bulletins?category=form-guide',
        description: 'Deep sectional and class analysis',
      },
      {
        label: 'Subscribe',
        to: '/signup',
        description: 'Get the bulletin delivered',
      },
    ],
  },
  {
    label: 'Tipping Ring',
    to: '/tipping',
    icon: <HelpCircle size={14} />,
  },
];

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
            className="flex flex-col leading-none group"
            aria-label="Stable Press — home"
          >
            <span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-primary-foreground group-hover:text-[hsl(var(--brand-accent))] transition-colors duration-150 leading-none">
              Stable Press
            </span>
            <span
              className="text-[9px] uppercase tracking-[0.22em] mt-0.5"
              style={{ color: 'hsl(var(--brand-accent))' }}
            >
              NZTROF Ownership
            </span>
          </Link>

          {/* Desktop auth strip */}
          <div className="hidden md:flex items-center gap-3">
            {currentUser ? (
              <div className="flex items-center gap-3">
                <NotificationBell />
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-foreground/10 border border-primary-foreground/20">
                  <User size={12} className="text-primary-foreground/80" />
                  <span className="text-xs font-medium text-primary-foreground">{currentUser.displayName}</span>
                  <span
                    className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-bold"
                    style={{
                      background: 'hsl(var(--brand-accent))',
                      color: 'hsl(var(--brand-accent-foreground))',
                    }}
                  >
                    {accountLabel}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="gap-1.5 text-xs text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <LogOut size={13} />
                  Sign Out
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="text-primary-foreground/85 hover:text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <Link to="/login" className="text-sm">Sign In</Link>
                </Button>
                <Button
                  size="sm"
                  asChild
                  className="text-sm font-semibold hover:opacity-90"
                  style={{
                    background: 'hsl(var(--brand-accent))',
                    color: 'hsl(var(--brand-accent-foreground))',
                  }}
                >
                  <Link to="/signup">Subscribe</Link>
                </Button>
              </div>
            )}
          </div>

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
      <div className="hidden md:block border-t border-primary-foreground/10">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <nav className="flex items-center overflow-x-auto" aria-label="Section navigation">
            {NAV_SECTIONS.map((section) => {
              const isActive = isSectionActive(section);

              return (
                <div
                  key={section.label}
                  className="relative flex-shrink-0"
                  onMouseEnter={() => section.sub && setActiveDropdown(section.label)}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                  <Link
                    to={section.to}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2.5 text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors duration-150 border-b-2 whitespace-nowrap',
                      isActive
                        ? 'text-primary-foreground border-b-2'
                        : 'text-primary-foreground/65 hover:text-primary-foreground border-transparent'
                    )}
                    style={
                      isActive
                        ? { borderBottomColor: 'hsl(var(--brand-accent))' }
                        : undefined
                    }
                  >
                    {section.label}
                    {section.sub && <ChevronDown size={10} className="opacity-50" />}
                  </Link>

                  {/* Dropdown */}
                  {section.sub && activeDropdown === section.label && (
                    <div className="absolute top-full left-0 w-64 bg-card border border-border/60 shadow-lg rounded-sm z-50 py-1">
                      {/* Section link at top */}
                      <Link
                        to={section.to}
                        className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 hover:bg-primary/5 transition-colors"
                        onClick={() => setActiveDropdown(null)}
                      >
                        <span className="text-primary">{section.icon}</span>
                        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary">
                          All {section.label}
                        </span>
                      </Link>
                      {section.sub.map((item) => (
                        <Link
                          key={item.label}
                          to={item.to}
                          className="block px-4 py-2.5 hover:bg-muted/50 transition-colors"
                          onClick={() => setActiveDropdown(null)}
                        >
                          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">
                            {item.label}
                          </span>
                          <span className="block text-[10px] text-muted-foreground mt-0.5 normal-case tracking-normal">
                            {item.description}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Spacer then CMS links */}
            <div className="flex-1" />

            {showPodcastWorkflow && (
              <Link
                to="/podcast/workflow"
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors border-b-2 flex-shrink-0',
                  location.pathname === '/podcast/workflow'
                    ? 'text-primary-foreground'
                    : 'text-primary-foreground/65 hover:text-primary-foreground border-transparent'
                )}
                style={
                  location.pathname === '/podcast/workflow'
                    ? { borderBottomColor: 'hsl(var(--brand-accent))' }
                    : undefined
                }
              >
                <LoaderCircle size={11} />
                Studio
              </Link>
            )}

            {staff && (
              <Link
                to="/newsroom"
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors border-b-2 flex-shrink-0',
                  location.pathname === '/newsroom'
                    ? 'text-primary-foreground'
                    : 'text-primary-foreground/65 hover:text-primary-foreground border-transparent'
                )}
                style={
                  location.pathname === '/newsroom'
                    ? { borderBottomColor: 'hsl(var(--brand-accent))' }
                    : undefined
                }
              >
                CMS
              </Link>
            )}
          </nav>
        </div>
      </div>

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/60 bg-card">
          <div className="px-4 py-4 space-y-0.5">
            {/* All Editorial */}
            <Link
              to="/news"
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm font-medium transition-colors border-l-2',
                location.pathname === '/news'
                  ? 'bg-primary/8 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent'
              )}
              style={
                location.pathname === '/news'
                  ? { borderLeftColor: 'hsl(var(--brand-accent))' }
                  : undefined
              }
            >
              <Newspaper size={14} />
              All News & Editorial
            </Link>

            {/* Section links for mobile */}
            <div className="pl-3 space-y-0.5">
              <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50 px-3 pt-2 pb-1">
                News
              </p>
              {[
                { label: 'Race Reports', to: '/news?category=race-reports' },
                { label: 'Industry News', to: '/news?category=industry-news' },
                { label: 'Morning Edition', to: '/news?category=morning-edition' },
              ].map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  {item.label}
                </Link>
              ))}

              <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50 px-3 pt-2 pb-1">
                Analysis
              </p>
              {[
                { label: 'Form Guide', to: '/news?category=form-guide' },
                { label: 'Track Notes', to: '/news?category=track-notes' },
                { label: 'Bloodstock', to: '/news?category=bloodstock' },
              ].map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  {item.label}
                </Link>
              ))}

              <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50 px-3 pt-2 pb-1">
                Interviews
              </p>
              {[
                { label: 'Trainer Profiles', to: '/news?category=trainer-profiles' },
                { label: 'Jockey Desk', to: '/news?category=jockey-desk' },
                { label: 'Owner Stories', to: '/news?category=owner-stories' },
              ].map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {/* Top-level nav items (Parties removed) */}
            {[
              { label: 'Horses', to: '/horses', icon: <Star size={14} /> },
              { label: 'Podcasts', to: '/podcast', icon: <Tv size={14} /> },
              { label: 'Newsletter', to: '/newsletter', icon: <Mail size={14} /> },
              { label: 'Bulletins', to: '/bulletins', icon: <BookOpen size={14} /> },
              { label: 'Tipping Ring', to: '/tipping', icon: <HelpCircle size={14} /> },
            ].map((item) => (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm font-medium transition-colors border-l-2',
                  location.pathname === item.to
                    ? 'bg-primary/8 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent'
                )}
                style={
                  location.pathname === item.to
                    ? { borderLeftColor: 'hsl(var(--brand-accent))' }
                    : undefined
                }
              >
                {item.icon}
                {item.label}
              </Link>
            ))}

            {/* Bulletin category quick links */}
            <div className="pl-3 space-y-0.5">
              <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50 px-3 pt-1 pb-1">
                Bulletin Categories
              </p>
              {[
                { label: 'Bloodstock', to: '/bulletins?category=bloodstock' },
                { label: 'Trainer Profiles', to: '/bulletins?category=trainer-profiles' },
                { label: 'Form Analysis', to: '/bulletins?category=form-guide' },
                { label: 'Owner Stories', to: '/bulletins?category=owner-stories' },
              ].map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {showPodcastWorkflow && (
              <Link
                to="/podcast/workflow"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm font-medium transition-colors border-l-2',
                  location.pathname === '/podcast/workflow'
                    ? 'bg-primary/8 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent'
                )}
                style={
                  location.pathname === '/podcast/workflow'
                    ? { borderLeftColor: 'hsl(var(--brand-accent))' }
                    : undefined
                }
              >
                <LoaderCircle size={14} />
                Podcast Studio
              </Link>
            )}

            {staff && (
              <Link
                to="/newsroom"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm font-medium transition-colors border-l-2',
                  location.pathname === '/newsroom'
                    ? 'bg-primary/8 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent'
                )}
                style={
                  location.pathname === '/newsroom'
                    ? { borderLeftColor: 'hsl(var(--brand-accent))' }
                    : undefined
                }
              >
                <Newspaper size={14} />
                Newsroom CMS
              </Link>
            )}
          </div>

          {/* Mobile auth */}
          <div className="px-4 pb-5 pt-2 border-t border-border/50">
            {currentUser ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-2">
                  <User size={14} className="text-primary" />
                  <span className="text-sm text-foreground font-medium">{currentUser.displayName}</span>
                  <NotificationBell tone="light" />
                  <span
                    className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-bold ml-auto"
                    style={{
                      background: 'hsl(var(--brand-accent))',
                      color: 'hsl(var(--brand-accent-foreground))',
                    }}
                  >
                    {accountLabel}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 pt-2">
                <Button variant="outline" size="sm" asChild className="w-full">
                  <Link to="/login" onClick={() => setMobileOpen(false)}>Sign In</Link>
                </Button>
                <Button
                  size="sm"
                  asChild
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Link to="/signup" onClick={() => setMobileOpen(false)}>
                    Subscribe to Stable Press
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
