import { useEffect, useRef, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore, useUnreadCount } from '@/stores/notificationStore';

/** Bell + unread badge + dropdown. Renders nothing for signed-out users. */
export function NotificationBell({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const notifications = useNotificationStore((s) => s.notifications);
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const unread = useUnreadCount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser) fetchNotifications();
  }, [currentUser, fetchNotifications]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!currentUser) return null;

  const iconColor = tone === 'dark' ? 'text-primary-foreground/85' : 'text-foreground/80';
  const hover = tone === 'dark' ? 'hover:bg-primary-foreground/10' : 'hover:bg-muted/60';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        className={cn('relative p-1.5 rounded-full transition-colors', hover)}
      >
        <Bell size={16} className={iconColor} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-card border border-border/60 rounded-sm shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 sticky top-0 bg-card">
            <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
              Notifications
            </span>
            {unread > 0 && (
              <button
                onClick={() => markAllRead()}
                className="text-[10px] text-primary hover:underline flex items-center gap-1"
              >
                <Check size={11} /> Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground italic">
              No notifications yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      markRead(n.id);
                      if (n.horseId) navigate(`/horses/${n.horseId}`);
                      setOpen(false);
                    }}
                    className={cn(
                      'w-full text-left px-3 py-2.5 transition-colors hover:bg-muted/50',
                      !n.read && 'bg-primary/5'
                    )}
                  >
                    <p className="text-xs text-foreground leading-snug">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(n.createdAt).toLocaleString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
