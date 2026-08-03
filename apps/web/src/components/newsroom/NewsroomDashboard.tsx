// ---------------------------------------------------------------------------
// Production System dashboard — the AI-powered overview at the top of the
// Newsroom. One fetch (/api/newsroom/summary) drives everything: a streamed-feel
// AI "Studio brief", live snapshot stats, a role-scoped "Needs your attention"
// lane, and capability-gated Quick Actions. Nothing here grants access — the
// server scopes the summary + capabilities to the caller's editorial role, and
// every action either deep-links into a module or hands off to the Stablehand
// (which still confirms before any write).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import {
  Sparkles, RefreshCw, ArrowRight, AlertCircle, FileText, Star, Users, Flag,
  BookOpen, CheckCircle2, Wand2,
} from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useAgentUi } from '@/stores/agentUiStore';

interface Capability {
  id: string;
  label: string;
  category: string;
  allowed: boolean;
  reason?: string;
  where?: string;
}
interface NeedItem { id: string; label: string; count: number; where: string }
interface Summary {
  generatedFor: { name: string; roles: string[]; isAdmin: boolean };
  stories: { total: number; mine: number; live: number; byStatus: Record<string, number> };
  needsAttention: NeedItem[];
  snapshot: {
    horses: number; unverifiedHorses: number; parties: number; unverifiedParties: number;
    articlesLive: number; upcomingRaces: number; issues: number; issuesInProgress: number;
  };
}

/** Editorial capability id → a `where` token the parent maps to a nav/route. */
const CAP_NAV: Record<string, string> = {
  'create-draft': 'drafts',
  'edit-any-story': 'all-stories',
  'review-story': 'review',
  'publish-story': 'workflow',
  'manage-bulletins': 'bulletin-templates',
  'manage-racing-data': 'horses',
  'verify-claims': 'claims',
  'manage-team': 'team',
};

function authHeaders(): HeadersInit {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' };
}

/**
 * `tone` is accepted and ignored on purpose.
 *
 * The six tiles used to be tinted chart-2/3/4/5/brand-accent — six hues for six
 * counts of identical importance, which reads as a rainbow and implies a
 * grouping none of them share. Colour is for state, not identity; the icon and
 * label already say which tile is which. Kept in the signature so the six call
 * sites don't all need editing, and so a future genuine state tone has a home.
 */
function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string; tone?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-sm border border-border bg-card px-3 py-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary/10 text-primary">{icon}</span>
      <div className="leading-tight">
        <div className="text-lg font-bold tabular-nums text-foreground">{value}</div>
        <div className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export function NewsroomDashboard({ onNavigate }: { onNavigate: (where: string) => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [caps, setCaps] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const askAgent = useAgentUi((s) => s.ask);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(apiUrl('/api/newsroom/summary'), { headers: authHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setSummary(data.summary);
      setCaps(Array.isArray(data.capabilities) ? data.capabilities : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBrief = useCallback(async () => {
    setBriefLoading(true);
    try {
      const res = await fetch(apiUrl('/api/newsroom/brief'), { method: 'POST', headers: authHeaders(), body: '{}' });
      const data = await res.json();
      setBrief(typeof data.brief === 'string' ? data.brief : null);
    } catch {
      setBrief(null);
    } finally {
      setBriefLoading(false);
    }
  }, []);

  useEffect(() => { void loadSummary(); void loadBrief(); }, [loadSummary, loadBrief]);

  if (loading) {
    return (
      <div className="mb-8 flex items-center gap-2 rounded-sm border border-border/60 bg-card px-4 py-6 text-sm text-muted-foreground">
        <RefreshCw size={15} className="animate-spin" /> Gathering your Production System summary…
      </div>
    );
  }
  if (error || !summary) {
    return (
      <div className="mb-8 flex items-center justify-between gap-3 rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
        <span className="flex items-center gap-2 text-destructive"><AlertCircle size={15} /> Couldn’t load the dashboard summary.</span>
        <button onClick={() => void loadSummary()} className="rounded-sm border border-border px-2 py-1 text-sm hover:bg-muted">Retry</button>
      </div>
    );
  }

  const s = summary.snapshot;
  const firstName = summary.generatedFor.name.split(/\s+/)[0];
  const quickActions = caps.filter((c) => c.allowed && CAP_NAV[c.id]);

  return (
    <div className="mb-8 space-y-5">
      {/* AI Studio brief. A cream box with a gold left rule — an editorial
          device that actually reads — rather than the old 7%-gold gradient,
          which resolved to within ~1 L* of the page and just looked like a
          smudge. The eyebrow uses the gold INK token: the fill it used before
          was 2.19:1 here, on the most prominent label of the screen. */}
      <div className="rounded-sm border border-border border-l-[3px] border-l-brand-accent bg-card p-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.1em] text-brand-accent-ink">
            <Sparkles size={13} /> Today’s Studio Brief
          </span>
          <button
            onClick={() => void loadBrief()}
            disabled={briefLoading}
            title="Regenerate brief"
            className="flex items-center gap-1 rounded-sm border border-border/60 px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={11} className={briefLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
        {briefLoading && !brief ? (
          <p className="text-sm italic text-muted-foreground">Writing your brief…</p>
        ) : brief ? (
          <p className="text-sm leading-relaxed text-foreground">{brief}</p>
        ) : (
          <p className="text-sm leading-relaxed text-foreground">
            Welcome back, {firstName}. {summary.needsAttention.length
              ? `You have ${summary.needsAttention.reduce((n, i) => n + i.count, 0)} item(s) needing attention below.`
              : 'Everything looks clear — the queue is calm.'}
            {' '}<span className="text-muted-foreground">(AI brief is offline — set OPENROUTER_API_KEY to enable it.)</span>
          </p>
        )}
      </div>

      {/* Snapshot stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={<FileText size={15} />} value={summary.stories.live} label="Stories live" />
        <StatCard icon={<FileText size={15} />} value={summary.stories.total} label="Stories total" tone="hsl(var(--chart-2))" />
        <StatCard icon={<Star size={15} />} value={s.horses} label="Horses" tone="hsl(var(--chart-3))" />
        <StatCard icon={<Users size={15} />} value={s.parties} label="Parties" tone="hsl(var(--chart-4))" />
        <StatCard icon={<Flag size={15} />} value={s.upcomingRaces} label="Upcoming races" tone="hsl(var(--chart-5))" />
        <StatCard icon={<BookOpen size={15} />} value={s.issues} label="Bulletins" tone="hsl(var(--brand-accent))" />
      </div>

      {/* Needs your attention */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold text-foreground">
          Needs your attention
          {/* White on gold is 2.1:1. The gold token's own foreground is the dark
              green-black that pairs with it (6.79:1) — the inline `color: white`
              was overriding exactly the value that already worked. */}
          {summary.needsAttention.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent px-1.5 text-[13px] font-bold text-brand-accent-foreground">
              {summary.needsAttention.length}
            </span>
          )}
        </h3>
        {summary.needsAttention.length === 0 ? (
          <div className="flex items-center gap-2 rounded-sm border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">
            <CheckCircle2 size={15} className="text-success" /> Nothing waiting on you right now. Nicely done.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {summary.needsAttention.map((n) => (
              <button
                key={n.id}
                onClick={() => onNavigate(n.where)}
                className="group flex items-center justify-between gap-3 rounded-sm border border-border/60 bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
              >
                <span className="flex items-center gap-2.5">
                  {/* Gold as ink, so --brand-accent-ink (5.9:1 on this tint) —
                      --brand-accent itself is a fill and reads 2.19:1 as text. */}
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-sm bg-brand-accent/15 px-1.5 text-sm font-bold tabular-nums text-brand-accent-ink">{n.count}</span>
                  <span className="text-sm text-foreground">{n.label}</span>
                </span>
                <ArrowRight size={15} className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      {quickActions.length > 0 && (
        <div>
          <h3 className="mb-2 font-[family-name:var(--font-display)] text-base font-bold text-foreground">Quick actions</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-sm border border-border/60 bg-card px-3 py-2.5">
                <button onClick={() => onNavigate(CAP_NAV[c.id])} className="flex-1 text-left text-sm text-foreground hover:text-primary">{c.label}</button>
                <button
                  onClick={() => askAgent(`In the Production System: ${c.label.toLowerCase()}. Walk me through it and do what you can for me.`)}
                  title="Ask the Stablehand to help with this"
                  className="flex h-7 w-7 items-center justify-center rounded-sm border border-border text-muted-foreground hover:bg-muted hover:text-brand-accent-ink"
                >
                  <Wand2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
