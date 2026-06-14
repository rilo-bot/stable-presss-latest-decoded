import { create } from 'zustand';
import { authFetch } from '@/lib/api';

export interface AppNotification {
  id: string;
  type: 'horse_link' | 'claim_verified' | 'claim_rejected' | 'org_join';
  message: string;
  read: boolean;
  createdAt: string;
  horseId?: string;
  partyId?: string;
  linkId?: string;
  actorUserId?: string;
}

interface NotificationState {
  notifications: AppNotification[];
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],
  loading: false,

  fetchNotifications: async () => {
    set({ loading: true });
    try {
      const res = await authFetch('/api/notifications');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      set({ notifications: await res.json(), loading: false });
    } catch {
      set({ loading: false });
    }
  },

  markRead: async (id) => {
    set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
    try {
      await authFetch(`/api/notifications/${id}/read`, { method: 'POST' });
    } catch {
      /* optimistic — leave as read */
    }
  },

  markAllRead: async () => {
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
    try {
      await authFetch('/api/notifications/read-all', { method: 'POST' });
    } catch {
      /* optimistic */
    }
  },
}));

/** Unread count selector hook. */
export function useUnreadCount(): number {
  return useNotificationStore((s) => s.notifications.filter((n) => !n.read).length);
}
