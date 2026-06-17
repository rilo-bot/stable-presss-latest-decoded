import { Link } from 'react-router-dom';
import { NotificationBell } from '@/components/NotificationBell';
import { Button } from '@/components/ui/button';
import { LogOut, User } from 'lucide-react';
import type { AuthUser } from '@/stores/authStore';

interface UserMenuProps {
  currentUser: AuthUser | null;
  accountLabel: string;
  handleLogout: () => void;
}

export function UserMenu({ currentUser, accountLabel, handleLogout }: UserMenuProps) {
  return (
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
  );
}
