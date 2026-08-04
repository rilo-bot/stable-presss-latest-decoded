/**
 * The Overview's data: one role-scoped aggregate (`/api/newsroom/summary`) and
 * one short AI narration of it (`/api/newsroom/brief`).
 *
 * `/summary` also returns the caller's capability list. The Overview no longer
 * reads it: the old "Quick actions" grid built eight buttons from it, three of
 * which navigated to screens that no longer exist, and the other five duplicated
 * sidebar rows. The list is still the Stablehand's source of truth server-side
 * (lib/agent/capabilities.ts) — it just isn't a second navigation surface.
 */
import { useCallback, useEffect, useState } from 'react';

import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export interface AttentionItem {
  id: string;
  label: string;
  count: number;
  /** A nav token — resolve it through `resolveWhere`, never `pathForModule`. */
  where: string;
}

export interface OverviewSummary {
  generatedFor: { name: string; roles: string[] };
  stories: { total: number; mine: number; live: number; byStatus: Record<string, number> };
  needsAttention: AttentionItem[];
  snapshot: {
    horses: number;
    unverifiedHorses: number;
    parties: number;
    unverifiedParties: number;
    articlesLive: number;
    upcomingRaces: number;
    issues: number;
    issuesInProgress: number;
  };
}

function authHeaders(): HeadersInit {
  const token = useAuthStore.getState().token;
  return token
    ? { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    : { 'content-type': 'application/json' };
}

export function useOverviewSummary() {
  const [summary, setSummary] = useState<OverviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(apiUrl('/api/newsroom/summary'), { headers: authHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setSummary(data.summary);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadBrief = useCallback(async () => {
    setBriefLoading(true);
    try {
      const res = await fetch(apiUrl('/api/newsroom/brief'), {
        method: 'POST',
        headers: authHeaders(),
        body: '{}',
      });
      const data = await res.json();
      setBrief(typeof data.brief === 'string' ? data.brief : null);
    } catch {
      setBrief(null);
    } finally {
      setBriefLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    void reloadBrief();
  }, [reload, reloadBrief]);

  return { summary, brief, loading, error, briefLoading, reload, reloadBrief };
}
