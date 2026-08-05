import { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useFollowStore } from '@/stores/followStore';
import { useAuthStore } from '@/stores/authStore';
import { isAdmin } from '@/rbac/can';
import { connectionResolver } from '@/lib/horseConnections';
import { HorseCard } from '@/components/HorseCard';
import { HorseSkeletonCard } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { Input } from '@/components/ui/input';
import { Search, Plus, Heart, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useRegister } from '@/lib/register';

export default function HorseProfiles() {
  // === auto fetch-on-mount (backend planner) ===
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  useEffect(() => {
    fetchHorses();
    fetchParties();
  }, [fetchHorses, fetchParties]);
  // === end auto fetch-on-mount ===

  const horses = useHorseStore((s) => s.horses);
  const parties = useRegister();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const staff = isAdmin(useAuthStore((s) => s.currentUser));

  // Real fetch state, not a timer.
  //
  // This was `setTimeout(() => setLoading(false), 600)` — a fixed 600ms of
  // skeletons with no relation to whether the horses had arrived. Two ways to be
  // wrong, and it hit both: a fast response sat behind the shimmer, and a
  // response slower than 600ms dropped the reader onto "The stables await their
  // first resident" — an empty register, on a populated database. Same fix as
  // /news and the landing hero, whose comments name this bug.
  const loading = useHorseStore((s) => !s.loaded && !s.error);

  const followedIds = useFollowStore((s) => s.followedHorseIds);

  const safeHorses = horses ?? [];

  const myStable = useMemo(
    () => safeHorses.filter((h) => followedIds.includes(h.id)),
    [safeHorses, followedIds]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return safeHorses;
    const conn = connectionResolver(parties ?? []);
    return safeHorses.filter((h) => {
      const c = conn(h);
      return (
        h.name?.toLowerCase().includes(q) ||
        c.trainer.toLowerCase().includes(q) ||
        c.jockey.toLowerCase().includes(q) ||
        c.owner.toLowerCase().includes(q)
      );
    });
  }, [safeHorses, query, parties]);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-10">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 flex-col sm:flex-row sm:items-end mb-3">
          <div>
            <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-foreground block mb-2">
              The Stables
            </span>
            <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-bold text-foreground leading-tight">
              Thoroughbred Profiles
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-sm text-left sm:text-right pb-0.5 leading-relaxed">
            Pedigree, connections, and the stories that run beside them.
          </p>
        </div>
        {/* Masthead rule */}
        <div className="h-px bg-border/60 mt-1 mb-6" />

        {/* Search + count row */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative max-w-sm flex-1 min-w-[200px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, trainer, or jockey…"
              className="pl-8 text-sm"
              aria-label="Search horse profiles"
            />
          </div>
          {!loading && safeHorses.length > 0 && (
            <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold flex-shrink-0">
              <span
                className="font-[family-name:var(--font-display)] font-bold text-base tabular-nums"
                style={{ color: 'hsl(var(--brand-accent))' }}
              >
                {safeHorses.length}
              </span>{' '}
              {safeHorses.length === 1 ? 'profile' : 'profiles'} in the stables
            </span>
          )}
        </div>
      </div>

      {/* My Stable — followed horses (gamification) */}
      {!loading && myStable.length > 0 && (
        <div className="mb-8 rounded-sm border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Heart size={13} className="text-primary" fill="hsl(var(--primary))" />
            <span className="text-[10px] uppercase tracking-[0.16em] font-bold text-primary">
              My Stable
            </span>
            <span className="text-[10px] text-muted-foreground">
              {myStable.length} followed
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {myStable.map((h) => (
              <Link
                key={h.id}
                to={`/horses/${h.id}`}
                className="group flex-shrink-0 w-44 rounded-sm border border-border/60 bg-card hover:border-primary/40 transition-colors overflow-hidden"
              >
                <div className="h-20 overflow-hidden bg-muted">
                  {h.imageUrl && (
                    <img src={h.imageUrl} alt={h.name} crossOrigin="anonymous" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  )}
                </div>
                <div className="p-2.5">
                  <div className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground truncate">{h.name}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Heart size={9} style={{ color: 'hsl(var(--brand-accent))' }} fill="hsl(var(--brand-accent))" />
                      Following
                    </span>
                    <ChevronRight size={12} className="text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Skeleton phase */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <HorseSkeletonCard key={i} />
          ))}
        </div>
      ) : safeHorses.length === 0 ? (
        /* Empty stables — no horses added via Production System yet */
        /* The newsroom CTA is staff-only — /production-system is RequireStaff and
           redirects a reader home. A reader is told what the page is for instead. */
        <EmptyState
          icon={staff ? Plus : Search}
          heading="The stables await their first resident."
          description={
            staff
              ? 'No thoroughbred profiles have been entered yet. Add horses through the Newsroom Production System to begin building the stable record.'
              : 'No thoroughbred profiles have been published yet. Pedigree, connections and form will appear here as the register is built.'
          }
          ctaLabel={staff ? 'Go to Newsroom' : 'Read the blog'}
          onCta={() => navigate(staff ? '/production-system' : '/blog')}
          size="lg"
        />
      ) : filtered.length === 0 ? (
        /* Search returned nothing */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
            style={{ background: 'hsl(var(--primary) / 0.08)' }}
          >
            <Search size={28} className="text-primary" />
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground mb-2">
            No horses match that search
          </h2>
          <div
            className="h-px w-12 mb-4"
            style={{ background: 'hsl(var(--brand-accent))' }}
          />
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed italic font-[family-name:var(--font-display)]">
            Try a different name, trainer, or jockey to find what you are looking for.
          </p>
          <button
            onClick={() => setQuery('')}
            className="mt-5 text-xs uppercase tracking-[0.1em] font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            Clear search
          </button>
        </div>
      ) : (
        <>
          {/* Result count when filtering */}
          {query && (
            <p className="text-xs text-muted-foreground uppercase tracking-[0.08em] mb-4">
              {filtered.length} profile{filtered.length !== 1 ? 's' : ''} found
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((horse, i) => (
              <motion.div
                key={horse.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: i * 0.03,
                  duration: 0.18,
                  ease: 'easeOut',
                }}
              >
                <HorseCard horse={horse} />
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}