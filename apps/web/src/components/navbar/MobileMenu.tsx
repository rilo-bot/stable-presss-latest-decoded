import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/NotificationBell';
import { Button } from '@/components/ui/button';
import {
  LogOut,
  User,
  Newspaper,
  Tv,
  BookOpen,
  HelpCircle,
  Star,
  LoaderCircle,
  Mail,
} from 'lucide-react';
import type { AuthUser } from '@/stores/authStore';

interface MobileMenuProps {
  currentUser: AuthUser | null;
  accountLabel: string;
  showPodcastWorkflow: boolean;
  staff: boolean;
  pathname: string;
  setMobileOpen: (value: boolean) => void;
  handleLogout: () => void;
}

export function MobileMenu({
  currentUser,
  accountLabel,
  showPodcastWorkflow,
  staff,
  pathname,
  setMobileOpen,
  handleLogout,
}: MobileMenuProps) {
  return (
    <div className="md:hidden border-t border-border/60 bg-card">
      <div className="px-4 py-4 space-y-0.5">
        {/* All Editorial */}
        <Link
          to="/news"
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm font-medium transition-colors border-l-2',
            pathname === '/news'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent'
          )}
          style={
            pathname === '/news'
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
              pathname === item.to
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent'
            )}
            style={
              pathname === item.to
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
              pathname === '/podcast/workflow'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent'
            )}
            style={
              pathname === '/podcast/workflow'
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
            to="/production-system"
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm font-medium transition-colors border-l-2',
              pathname === '/production-system'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent'
            )}
            style={
              pathname === '/production-system'
                ? { borderLeftColor: 'hsl(var(--brand-accent))' }
                : undefined
            }
          >
            <Newspaper size={14} />
            Production System
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
  );
}
