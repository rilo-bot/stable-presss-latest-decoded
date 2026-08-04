/**
 * The signed-in account menu — one chip that opens everything personal.
 *
 * This used to be a row of always-visible controls (notification bell, name pill,
 * role badge, Sign Out button) sitting beside a SECOND header row that carried
 * Dashboard, My Profile, My Organisation, Campaign Engine, Site Content, Verify
 * Claims and Podcast Studio as 10px links. Between them the public site header
 * was 112px tall and offered a reader up to nine account and staff links before
 * they had read a headline — with Sign Out permanently on screen.
 *
 * All of it lives here now, behind one click. The masthead strip that held the
 * other half is gone; see the note in NavBar.tsx.
 *
 * Click, not hover: a menu whose last item signs you out should not open because
 * the pointer crossed it.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { NotificationBell } from '@/components/NotificationBell';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronDown, LogOut, User } from 'lucide-react';
import type { AuthUser } from '@/stores/authStore';

export interface AccountLink {
  label: string;
  to: string;
  /** Staff tools are grouped below the member links. */
  staff?: boolean;
}

interface UserMenuProps {
  currentUser: AuthUser | null;
  accountLabel: string;
  handleLogout: () => void;
  /** Member + staff destinations, already permission-filtered by NavBar. */
  accountLinks: AccountLink[];
}

export function UserMenu({ currentUser, accountLabel, handleLogout, accountLinks }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside click and on Escape. Without both, a menu opened by click
  // has no way out except clicking the trigger again — and Escape is the shortcut
  // a keyboard user reaches for first.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!currentUser) {
    return (
      <div className="hidden md:flex items-center gap-2">
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
    );
  }

  const memberLinks = accountLinks.filter((l) => !l.staff);
  const staffLinks = accountLinks.filter((l) => l.staff);

  return (
    <div className="hidden md:flex items-center gap-3">
      <NotificationBell />

      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1 transition-colors',
            open
              ? 'bg-primary-foreground/20 border-primary-foreground/30'
              : 'bg-primary-foreground/10 border-primary-foreground/20 hover:bg-primary-foreground/15'
          )}
        >
          <User size={12} className="text-primary-foreground/80" />
          <span className="text-xs font-medium text-primary-foreground">{currentUser.displayName}</span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{
              background: 'hsl(var(--brand-accent))',
              color: 'hsl(var(--brand-accent-foreground))',
            }}
          >
            {accountLabel}
          </span>
          <ChevronDown
            size={12}
            className={cn('text-primary-foreground/60 transition-transform', open && 'rotate-180')}
          />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 w-56 rounded-sm border border-border/60 bg-card py-1 shadow-lg"
          >
            {memberLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-[13px] text-foreground transition-colors hover:bg-muted/60"
              >
                {link.label}
              </Link>
            ))}

            {staffLinks.length > 0 && (
              <>
                <div className="my-1 border-t border-border/40" />
                <p className="px-4 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Staff
                </p>
                {staffLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2 text-[13px] text-foreground transition-colors hover:bg-muted/60"
                  >
                    {link.label}
                  </Link>
                ))}
              </>
            )}

            <div className="my-1 border-t border-border/40" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                handleLogout();
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-muted/60"
            >
              <LogOut size={13} className="text-muted-foreground" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
