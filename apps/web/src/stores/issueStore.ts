/**
 * Published magazine issues (the public "Bulletins"), server-backed.
 *
 * Drafts live client-side in the magazine store (a per-editor working buffer);
 * PUBLISHING crosses to the server so an issue is visible to every reader on any
 * device. The public Bulletins list + viewer read from here, not from the local
 * draft store.
 *
 * The list endpoint returns lightweight `IssueSummary` rows (no page payload);
 * the viewer fetches one full `PublishedIssue` on demand and caches it in `byId`.
 */

import { create } from 'zustand';
import { authFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { IssueSummary, PublishedIssue, PublishPayload } from '@/types/magazine';

interface IssueState {
  issues: IssueSummary[];
  byId: Record<string, PublishedIssue>;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** Scope of the last list load — re-used so post-mutation refreshes stay consistent. */
  includeUnpublished: boolean;

  /** `includeUnpublished` (staff studio) also returns hidden issues; default public list does not. */
  fetchIssues: (opts?: { includeUnpublished?: boolean }) => Promise<void>;
  /** Re-fetch the list at the scope it was last loaded with. */
  refresh: () => Promise<void>;
  fetchIssue: (id: string) => Promise<PublishedIssue | null>;
  publish: (payload: PublishPayload) => Promise<string | null>;
  republish: (id: string, payload?: PublishPayload) => Promise<boolean>;
  unpublish: (id: string) => Promise<boolean>;
  deleteIssue: (id: string) => Promise<boolean>;
}

export const useIssueStore = create<IssueState>()((set, get) => ({
  issues: [],
  byId: {},
  loading: false,
  loaded: false,
  error: null,
  includeUnpublished: false,

  fetchIssues: async (opts) => {
    if (get().loading) return;
    const includeUnpublished = !!opts?.includeUnpublished;
    set({ loading: true, error: null, includeUnpublished });
    try {
      const res = await authFetch(`/api/issues${includeUnpublished ? '?includeUnpublished=1' : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const issues = (await res.json()) as IssueSummary[];
      set({ issues, loading: false, loaded: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load bulletins';
      set({ loading: false, error: message });
    }
  },

  /** Refresh the list using the scope it was last loaded with (studio vs public). */
  refresh: () => get().fetchIssues({ includeUnpublished: get().includeUnpublished }),

  fetchIssue: async (id) => {
    try {
      const res = await authFetch(`/api/issues/${id}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const issue = (await res.json()) as PublishedIssue;
      set((s) => ({ byId: { ...s.byId, [id]: issue } }));
      return issue;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load bulletin';
      set({ error: message });
      return null;
    }
  },

  publish: async (payload) => {
    try {
      const res = await authFetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = (await res.json()) as PublishedIssue;
      // Cache the full issue and refresh the summary list.
      set((s) => ({ byId: { ...s.byId, [created.id]: created } }));
      await get().refresh();
      return created.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to publish';
      set({ error: message });
      toast.error(message);
      return null;
    }
  },

  republish: async (id, payload) => {
    try {
      const res = await authFetch(`/api/issues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'republish', ...(payload ?? {}) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = (await res.json()) as PublishedIssue;
      set((s) => ({ byId: { ...s.byId, [id]: updated } }));
      await get().refresh();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to republish';
      set({ error: message });
      toast.error(message);
      return false;
    }
  },

  unpublish: async (id) => {
    try {
      const res = await authFetch(`/api/issues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unpublish' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      set((s) => {
        const next = { ...s.byId };
        delete next[id];
        return { byId: next };
      });
      await get().refresh();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unpublish';
      set({ error: message });
      toast.error(message);
      return false;
    }
  },

  deleteIssue: async (id) => {
    try {
      const res = await authFetch(`/api/issues/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      set((s) => {
        const next = { ...s.byId };
        delete next[id];
        return { issues: s.issues.filter((i) => i.id !== id), byId: next };
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete bulletin';
      set({ error: message });
      toast.error(message);
      return false;
    }
  },
}));
