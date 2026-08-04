/**
 * Published magazine issues — the public "Bulletins". READ-ONLY.
 *
 * The list endpoint returns lightweight `IssueSummary` rows (no page payload); the
 * viewer fetches one full `PublishedIssue` on demand and caches it in `byId`.
 *
 * There were four write actions here — `publish`, `republish`, `unpublish` and
 * `deleteIssue` — and they were the v1 template builder's publish path: the browser
 * assembled a whole snapshot from its local draft and POSTed it to /api/issues.
 *
 * The Magazine Builder does all of that SERVER-SIDE against stored pages
 * (`POST /api/magazinesV2/issues/:id/publish` and `/unpublish`; deleting a draft
 * cascades to its snapshot), so /api/issues is now read-only and so is this store.
 */

import { create } from 'zustand';
import { authFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { IssueSummary, PublishedIssue } from '@/types/magazine';

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
  }
}));
