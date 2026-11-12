/**
 * AI Activity — wire types (mirror apps/server/src/lib/agent/aiActivityQuery.ts)
 * and the data hooks for GET /api/ai-activity/*.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { authFetchRetry } from '@/lib/api';

export type Scope = 'mine' | 'all';
/** 'forbidden' = asked for Everyone without the right (the page drops back to Mine). */
export type LoadState = 'loading' | 'ready' | 'error' | 'forbidden';

export interface UsageSums {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  costUsd: number;
  errors: number;
  estimated: number;
  durationMs: number;
  lastUsedAt: string | null;
}

export interface SurfaceRow extends UsageSums {
  surface: string;
  sessions: number;
  users: number;
  days: { date: string; calls: number; costUsd: number }[];
}

export interface SurfacesResponse {
  scope: Scope;
  canSeeAll: boolean;
  windowDays: number;
  from: string;
  to: string;
  surfaces: SurfaceRow[];
  totals: UsageSums & { sessions: number };
  meteredSince: string | null;
}

export interface DetailDay {
  date: string;
  calls: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  errors: number;
}

export interface BreakdownRow extends UsageSums {
  key: string;
}

export interface UserRow extends BreakdownRow {
  userName: string;
}

export interface SessionSummary extends UsageSums {
  sessionId: string | null;
  callId: string | null;
  surface: string;
  userId: string;
  userName: string;
  startedAt: string;
  features: string[];
  models: string[];
  kinds: string[];
  entityType: string;
  entityId: string;
  entityTitle: string;
  error: string;
}

export interface DetailResponse {
  scope: Scope;
  canSeeAll: boolean;
  windowDays: number;
  surface: string;
  from: string;
  to: string;
  totals: UsageSums & { sessions: number; users: number };
  days: DetailDay[];
  byFeature: BreakdownRow[];
  byModel: BreakdownRow[];
  byUser: UserRow[];
  sessions: SessionSummary[];
  nextBefore: string | null;
}

export interface SessionCall {
  id: string;
  createdAt: string;
  surface: string;
  feature: string;
  model: string;
  kind: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  costUsd: number;
  costSource: string;
  durationMs: number;
  ok: boolean;
  error: string;
}

export interface SessionDetail {
  sessionId: string;
  surface: string;
  userId: string;
  userName: string;
  entityType: string;
  entityId: string;
  entityTitle: string;
  calls: SessionCall[];
  truncated: boolean;
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await authFetchRetry(path);
  if (!res.ok) throw new HttpError(res.status);
  return (await res.json()) as T;
}

const failState = (scope: Scope) => (err: unknown): LoadState =>
  err instanceof HttpError && err.status === 403 && scope === 'all' ? 'forbidden' : 'error';

/** GET /api/ai-activity/surfaces — every surface's figures for the window. */
export function useSurfaces(scope: Scope, days: string) {
  const [data, setData] = useState<SurfacesResponse | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let active = true;
    setState('loading');
    getJson<SurfacesResponse>(`/api/ai-activity/surfaces?scope=${scope}&days=${days}`)
      .then((d) => {
        if (!active) return;
        setData(d);
        setState('ready');
      })
      .catch((err) => active && setState(failState(scope)(err)));
    return () => {
      active = false;
    };
  }, [scope, days]);

  return { data, state };
}

/** GET /api/ai-activity/surfaces/:surface (+ /sessions for older pages). */
export function useSurfaceDetail(surface: string, scope: Scope, days: string, enabled = true) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    if (!enabled) return;
    setState('loading');
    setSessions([]);
    getJson<DetailResponse>(`/api/ai-activity/surfaces/${encodeURIComponent(surface)}?scope=${scope}&days=${days}&limit=25`)
      .then((d) => {
        if (gen !== generation.current) return;
        setData(d);
        setSessions(d.sessions);
        setNextBefore(d.nextBefore);
        setState('ready');
      })
      .catch((err) => gen === generation.current && setState(failState(scope)(err)));
  }, [surface, scope, days, enabled]);

  const loadMore = useCallback(() => {
    if (!nextBefore || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    const qs = new URLSearchParams({ scope, days, limit: '25', before: nextBefore });
    getJson<{ sessions: SessionSummary[]; nextBefore: string | null }>(
      `/api/ai-activity/surfaces/${encodeURIComponent(surface)}/sessions?${qs.toString()}`,
    )
      .then((page) => {
        if (gen !== generation.current) return;
        setSessions((cur) => [...cur, ...page.sessions]);
        setNextBefore(page.nextBefore);
      })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }, [surface, scope, days, nextBefore, loadingMore]);

  return { data, sessions, nextBefore, state, loadMore, loadingMore };
}

/** GET /api/ai-activity/sessions/:sessionId — every call of one session. */
export function useSession(summary: SessionSummary | null) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const sessionId = summary?.sessionId ?? null;
  const userId = summary?.userId ?? '';
  const surface = summary?.surface ?? '';

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    setState('loading');
    setSession(null);
    const qs = new URLSearchParams({ surface });
    if (userId) qs.set('userId', userId);
    getJson<{ session: SessionDetail }>(`/api/ai-activity/sessions/${encodeURIComponent(sessionId)}?${qs.toString()}`)
      .then((d) => {
        if (!active) return;
        setSession(d.session);
        setState('ready');
      })
      .catch(() => active && setState('error'));
    return () => {
      active = false;
    };
  }, [sessionId, userId, surface]);

  return { session, state };
}
