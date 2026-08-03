/**
 * Emoji Analytics — /production-system/emoji-analytics
 *
 * What readers did with the emoji picker, read as one page: the mood, the whole
 * scale counted, which categories are warm ground, which posts to lead with, and
 * which content type is carrying the newsroom.
 *
 * STATIC, WITH SAMPLE DATA. Nothing here is wired: there is no reaction
 * collection, no endpoint, and no picker on the public site yet. This screen is
 * the design for that feature — so it labels itself as sample data in the header
 * and again under the panels that would need data we don't collect. Everything
 * it shows is derived from one invented dataset (see `../emoji-analytics/data.ts`),
 * so the panels agree with each other; when the endpoint lands, only the dataset
 * is replaced.
 *
 * Blogs are the unit of analysis, not policies or electorates: the leaderboard
 * ranks posts, and the geography cut is a CATEGORY cut, because a reaction here
 * has an item and a category but no location.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Eye, Search, Sparkles, Wrench } from 'lucide-react';

import { cn } from '@/lib/utils';

import {
  BANDS, SECTION_LABELS, SIDE_FILL, TRACK_FILL, bandFor, compact, deriveDashboard, signed, splitOf,
  type Band, type CategoryStat,
} from '../emoji-analytics/data';
import {
  Bar, BandChip, BandLegend, MeterKey, ModelledNote, Net, NetBar, Panel, SampleDataBadge,
  SplitLine, StackedMeter, StatTile, splitParts,
} from '../emoji-analytics/parts';

/** The band filter, grouped the way someone actually asks the question. */
type Ground = 'all' | 'warm' | 'split' | 'cool';

const GROUND_LABEL: Record<Ground, string> = {
  all: 'All',
  warm: 'Warm ground',
  split: 'Split',
  cool: 'Cool ground',
};

function inGround(band: Band, ground: Ground): boolean {
  if (ground === 'all') return true;
  if (ground === 'warm') return band.id === 'loved' || band.id === 'warm';
  if (ground === 'split') return band.id === 'split';
  return band.id === 'cool' || band.id === 'rejected';
}

/** One category as a filled tile: band colour, its net, and how many reacted. */
function CategoryTile({
  stat, maxVolume, selected, onSelect,
}: {
  stat: CategoryStat;
  maxVolume: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { band, split } = stat;
  const volumePct = maxVolume > 0 ? (split.reactions / maxVolume) * 100 : 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'group flex flex-col gap-2 rounded-sm p-3 text-left transition-shadow',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
        selected && 'ring-2 ring-offset-2 ring-offset-card',
      )}
      style={{
        background: band.fill,
        color: band.ink,
        // The ring reads as selection on any of the five fills.
        ...(selected ? { ['--tw-ring-color' as string]: 'hsl(var(--foreground))' } : null),
      }}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] font-semibold leading-tight">{stat.label}</span>
          <span className="block truncate text-[10px] uppercase tracking-[0.08em] opacity-75">
            {SECTION_LABELS[stat.section]}
          </span>
        </span>
        <span className="flex-shrink-0 text-[19px] font-bold leading-none tabular-nums">{signed(split.net)}</span>
      </span>

      {/* Volume, inside the tile: a thin bar in the tile's own ink so it never
          introduces a sixth colour, plus the count in words. */}
      <span className="block">
        <span aria-hidden="true" className="block h-[3px] w-full overflow-hidden rounded-[2px]" style={{ background: `color-mix(in srgb, ${band.ink} 22%, transparent)` }}>
          <span className="block h-full rounded-[0_2px_2px_0]" style={{ width: `${volumePct}%`, background: `color-mix(in srgb, ${band.ink} 72%, transparent)` }} />
        </span>
        <span className="mt-1 block text-[10.5px] tabular-nums opacity-85">
          {compact(split.reactions)} reactions · {stat.published} published
        </span>
      </span>
    </button>
  );
}

export default function EmojiAnalyticsScreen() {
  const d = useMemo(() => deriveDashboard(), []);

  const [query, setQuery] = useState('');
  const [ground, setGround] = useState<Ground>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const overallParts = splitParts(d.overall, SIDE_FILL);
  const maxEmojiPct = Math.max(...d.emojiRows.map((r) => r.pct));
  const maxVolume = Math.max(...d.categories.map((c) => c.split.reactions));

  const best = d.rankedCategories[0];
  const worst = d.rankedCategories[d.rankedCategories.length - 1];
  const blogs = d.contentTypes.find((t) => t.id === 'blog')!;
  const stories = d.contentTypes.find((t) => t.id === 'article')!;
  const worstBlog = d.blogLeaders[d.blogLeaders.length - 1];

  // The filter row scopes BOTH the grid and the ranking beside it — one control
  // row over everything it changes, rather than a filter per panel.
  const q = query.trim().toLowerCase();
  const filtered = d.rankedCategories.filter(
    (c) => inGround(c.band, ground) && (!q || c.label.toLowerCase().includes(q)),
  );
  const groundCounts: Record<Ground, number> = {
    all: d.rankedCategories.length,
    warm: d.rankedCategories.filter((c) => inGround(c.band, 'warm')).length,
    split: d.rankedCategories.filter((c) => inGround(c.band, 'split')).length,
    cool: d.rankedCategories.filter((c) => inGround(c.band, 'cool')).length,
  };

  const selected = d.categories.find((c) => c.key === selectedKey && c.published > 0);

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p
            className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
            style={{ color: 'hsl(var(--brand-accent-ink))' }}
          >
            Reader reactions
          </p>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
            One emoji per reader, per item, on a seven-point scale. This page counts them and says
            what they mean — the mood, the ground you hold, and the posts worth building on.
          </p>
        </div>
        <SampleDataBadge>Sample data · no reaction feed yet</SampleDataBadge>
      </div>

      {/* ── Headline figures ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Reader mood"
          value={d.moodVerdict.headline}
          detail={d.moodVerdict.detail}
          display
        />
        <StatTile
          label="Total reactions"
          value={compact(d.overall.reactions)}
          detail={`Across ${d.published} published items`}
          hero
        />
        <StatTile
          label="Most common reaction"
          value={`${d.topEmoji.pct}%`}
          detail={
            <>
              react with <span aria-hidden="true">{d.topEmoji.emoji}</span> “{d.topEmoji.label.toLowerCase()}”
              {' '}— {compact(d.topEmoji.count)} of them
            </>
          }
        />
        <StatTile
          label="Firmest ground"
          value={best.label}
          detail={`${SECTION_LABELS[best.section]} · net ${signed(best.split.net)} on ${compact(best.split.reactions)} reactions`}
          display
        />
      </div>

      {/* ── The plain-words read ── */}
      <Panel title="The story, in plain words">
        <ul className="space-y-2">
          {[
            {
              emoji: '🤝',
              text: `Out of every 10 reactions, about ${Math.round(d.overall.forPct / 10)} are for you and ${Math.round(d.overall.againstPct / 10)} push back — overall: ${d.moodVerdict.headline.toLowerCase()}.`,
            },
            {
              emoji: '📈',
              text: `Your firmest ground is ${best.label} (net ${signed(best.split.net)}); your weakest is ${worst.label} (net ${signed(worst.split.net)}), and it is also your busiest category — ${compact(worst.split.reactions)} reactions.`,
            },
            {
              emoji: '✍️',
              text: `Blogs beat news and stories on the same volume: net ${signed(blogs.split.net)} across ${compact(blogs.split.reactions)} reactions against ${signed(stories.split.net)} across ${compact(stories.split.reactions)}.`,
            },
          ].map((line) => (
            <li key={line.text} className="flex gap-2.5 text-[12.5px] leading-relaxed text-foreground">
              <span aria-hidden="true" className="flex-shrink-0 text-[14px] leading-tight">{line.emoji}</span>
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
      </Panel>

      {/* ── The scale ── */}
      <Panel
        title="How readers feel overall"
        subtitle="Every reaction on the seven-point scale, folded into three sides."
        aside={<SplitLine split={d.overall} />}
      >
        <StackedMeter parts={overallParts} height={16} />
        <MeterKey parts={overallParts} />

        <p className="mb-2 mt-5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Every emoji, counted
        </p>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Bars are relative to the most-used reaction ({d.topEmoji.label.toLowerCase()}, {d.topEmoji.pct}%).
          The share of all reactions is printed on every row.
        </p>
        <ul className="space-y-1.5">
          {d.emojiRows.map((row) => (
            <li key={row.key} className="flex items-center gap-3">
              <span aria-hidden="true" className="w-5 flex-shrink-0 text-center text-[15px] leading-none">{row.emoji}</span>
              <span className="w-[104px] flex-shrink-0 truncate text-[12px] text-foreground">{row.label}</span>
              <span className="min-w-0 flex-1">
                <Bar pct={maxEmojiPct > 0 ? (row.pct / maxEmojiPct) * 100 : 0} fill={row.fill} />
              </span>
              <span className="w-14 flex-shrink-0 text-right text-[11.5px] tabular-nums text-muted-foreground">
                {compact(row.count)}
              </span>
              <span className="w-9 flex-shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-foreground">
                {row.pct}%
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      {/* ── One filter row for the two panels below it ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-60">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a category…"
            aria-label="Find a category"
            className="w-full rounded-sm border border-input bg-background py-1.5 pl-8 pr-2 text-xs text-foreground focus:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div role="group" aria-label="Filter categories by how they are going" className="flex flex-wrap gap-1">
          {(['all', 'warm', 'split', 'cool'] as Ground[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGround(g)}
              aria-pressed={ground === g}
              className={cn(
                'rounded-sm px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                ground === g
                  ? 'bg-primary/10 font-semibold text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {GROUND_LABEL[g]}
              <span className="ml-1.5 tabular-nums opacity-70">{groundCounts[g]}</span>
            </button>
          ))}
        </div>
        <p className="ml-auto text-[11px] text-muted-foreground">
          Net = % for minus % against, in points — so a big category and a small one compare fairly.
        </p>
      </div>

      {/* ── Category grid + ranking ── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          title="How readers feel, by category"
          subtitle="Colour is the band · the bar inside each tile is how many reacted · pick one to break it down."
        >
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-muted-foreground">
              No category matches that filter.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((stat) => (
                <CategoryTile
                  key={stat.key}
                  stat={stat}
                  maxVolume={maxVolume}
                  selected={selectedKey === stat.key}
                  onSelect={() => setSelectedKey(selectedKey === stat.key ? null : stat.key)}
                />
              ))}
            </div>
          )}

          <BandLegend className="mt-4 border-t border-border/50 pt-3" />

          {selected && (
            <div className="mt-4 rounded-sm border border-border/60 bg-muted/40 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 flex-1 truncate font-[family-name:var(--font-display)] text-[13px] font-bold text-foreground">
                  {selected.label}
                </h3>
                <BandChip band={selected.band} />
                <Net net={selected.split.net} className="text-[13px]" />
                <button
                  type="button"
                  onClick={() => setSelectedKey(null)}
                  className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                >
                  Clear
                </button>
              </div>
              <StackedMeter parts={splitParts(selected.split, SIDE_FILL)} height={12} />
              <p className="mt-2 text-[11px] text-muted-foreground">
                <SplitLine split={selected.split} /> · {compact(selected.split.reactions)} reactions on{' '}
                {selected.published} published {selected.published === 1 ? 'item' : 'items'}
              </p>
              <ul className="mt-3 space-y-1.5 border-t border-border/50 pt-2.5">
                {selected.items
                  .map((item) => ({ item, split: splitOf([item.r]) }))
                  .sort((a, b) => b.split.net - a.split.net)
                  .map(({ item, split }) => (
                    <li key={item.id} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground">{item.title}</span>
                      <span className="w-20 flex-shrink-0">
                        <NetBar net={split.net} fill={bandFor(split.net).fill} height={7} />
                      </span>
                      <Net net={split.net} className="w-9 flex-shrink-0 text-right text-[11.5px]" />
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <ModelledNote>
            This is a content cut, not an audience cut: a reaction carries the item it was left on,
            so it can be grouped by that item’s category — but nothing tells us who left it or where
            they read it. Reader-level and regional breakdowns need sign-in on the public site first.
          </ModelledNote>
        </Panel>

        <Panel
          title="Category ranking"
          subtitle="Best net first. This is the same data as the grid, as numbers."
          aside={`${filtered.length} of ${d.rankedCategories.length}`}
          className="lg:sticky lg:top-[72px] lg:self-start"
        >
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground">Nothing matches.</p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((stat) => (
                <li key={stat.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(selectedKey === stat.key ? null : stat.key)}
                    aria-pressed={selectedKey === stat.key}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-sm px-1.5 py-1.5 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selectedKey === stat.key ? 'bg-muted' : 'hover:bg-muted/60',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{stat.label}</span>
                    <span className="w-20 flex-shrink-0">
                      <NetBar net={stat.split.net} fill={stat.band.fill} height={8} />
                    </span>
                    <Net net={stat.split.net} className="w-9 flex-shrink-0 text-right text-[11.5px]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 border-t border-border/50 pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
            Bars run either side of the centre line: right of it is support, left is opposition. The
            longest bar is a 100-point margin.
          </p>
        </Panel>
      </div>

      {/* ── Audience segments ── */}
      <Panel
        title="Your readers, warmest to coldest"
        subtitle={
          <>
            Everyone who reacted, in five groups. This counts <strong className="font-semibold text-foreground">reactions</strong>,
            not people — one enthusiast reacting on every post counts more than once, until sign-in
            makes per-person counting possible.
          </>
        }
      >
        <p className="mb-3 text-[12.5px] text-foreground">
          Of every 100 reactions, <strong className="font-semibold">{d.overall.forPct} are friendly</strong>,{' '}
          {d.overall.middlePct} sit in the middle and{' '}
          <strong className="font-semibold">{d.overall.againstPct} push back</strong>.
        </p>
        <StackedMeter
          parts={d.segments.map((s) => ({ key: s.id, pct: s.pct, fill: s.fill, label: s.label }))}
          height={16}
        />
        <div className="mt-4 grid gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-5">
          {d.segments.map((s) => (
            <div key={s.id}>
              <p className="flex items-center gap-1.5 text-[11.5px] text-foreground">
                <span aria-hidden="true" className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: s.fill }} />
                {s.label}
              </p>
              <p className="mt-0.5 text-[22px] font-bold leading-none text-foreground">{s.pct}%</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {s.hint} · {compact(s.count)} reactions
              </p>
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Blog leaderboard ── */}
      <Panel
        title="Blog leaderboard — what to lead with"
        subtitle="Most-loved first. The posts at the top are safe to build on; the ones at the bottom need a rethink before you commission more like them."
        aside={
          <Link
            to="/production-system/blogs"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
          >
            {d.blogLeaders.length} posts
            <ArrowUpRight size={11} />
          </Link>
        }
      >
        <ul className="divide-y divide-border/50">
          {d.blogLeaders.map((row, i) => (
            <li key={row.item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 first:pt-0 last:pb-0">
              <span className="w-4 flex-shrink-0 text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 basis-[240px]">
                <span className="block truncate text-[12.5px] font-semibold text-foreground">{row.item.title}</span>
                <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                  {row.split.forPct}% for · {row.split.againstPct}% against ·{' '}
                  {compact(row.split.reactions)} reactions · {row.item.comments} comments
                </span>
              </span>
              <span className="w-24 flex-shrink-0">
                <NetBar net={row.split.net} fill={row.band.fill} />
              </span>
              <Net net={row.split.net} className="w-9 flex-shrink-0 text-right text-[12px]" />
              <BandChip band={row.band} />
            </li>
          ))}
        </ul>
      </Panel>

      {/* ── Content types ── */}
      <div>
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-sm font-bold text-foreground">
          Reactions by content type
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {d.contentTypes.map((t) => {
            const parts = splitParts(t.split, SIDE_FILL);
            return (
              <div key={t.id} className="rounded-sm border border-border/60 bg-card p-4">
                <div className="mb-2 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-[family-name:var(--font-display)] text-[13px] font-bold text-foreground">
                      {t.href ? (
                        <Link to={t.href} className="underline-offset-2 hover:underline">{t.label}</Link>
                      ) : (
                        t.label
                      )}
                    </h3>
                    <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                      {t.published} {t.published === 1 ? t.unit.replace(/s$/, '') : t.unit} ·{' '}
                      {compact(t.split.reactions)} reactions
                    </p>
                  </div>
                  {t.split.reactions > 0 ? (
                    <BandChip band={t.band} />
                  ) : (
                    <span className="flex-shrink-0 text-[11px] text-muted-foreground" aria-label="No data">—</span>
                  )}
                </div>

                {t.split.reactions > 0 ? (
                  <>
                    <StackedMeter parts={parts} height={12} />
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      <SplitLine split={t.split} /> · net {signed(t.split.net)}
                    </p>
                    {t.topItem && (
                      <p className="mt-2 truncate border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                        Top: <span className="text-foreground">{t.topItem.title}</span>
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="w-full rounded-[4px]" style={{ height: 12, background: TRACK_FILL }} />
                    <p className="mt-2 text-[11px] text-muted-foreground">No reactions yet.</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── What to do about it ── */}
      <div>
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-sm font-bold text-foreground">
          Recommended moves
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            {
              kicker: 'Lean in',
              icon: <Sparkles size={13} />,
              title: `${best.label} is your firmest ground`,
              body: `Net ${signed(best.split.net)} on ${compact(best.split.reactions)} reactions. ${best.topItem ? `“${best.topItem.title}” led it.` : ''} Commission more of this and put it where readers land first.`,
              to: '/production-system/blogs/new',
              cta: 'Start a post',
            },
            {
              kicker: 'Fix',
              icon: <Wrench size={13} />,
              title: `One post is doing most of the damage`,
              body: `“${worstBlog.item.title}” sits at net ${signed(worstBlog.split.net)} on ${compact(worstBlog.split.reactions)} reactions and ${worstBlog.item.comments} comments — your most-reacted post and your worst-received. Reframe it before the next one in that series.`,
              // Deliberately the list, not `blogs/${id}` — these ids are sample
              // data and the editor would 404 on them.
              to: '/production-system/blogs',
              cta: 'Open the posts',
            },
            {
              kicker: 'Watch',
              icon: <Eye size={13} />,
              title: `${worst.label} is the ground you are losing`,
              body: `Net ${signed(worst.split.net)} and your busiest category at ${compact(worst.split.reactions)} reactions — the strongest feelings you have are the negative ones. Worth an editorial line before the next piece runs.`,
            },
          ].map((move) => (
            <div key={move.title} className="rounded-sm border border-border/60 bg-card p-4">
              <p
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ color: 'hsl(var(--brand-accent-ink))' }}
              >
                <span aria-hidden="true">{move.icon}</span>
                {move.kicker}
              </p>
              <h3 className="mt-1.5 font-[family-name:var(--font-display)] text-[13px] font-bold leading-snug text-foreground">
                {move.title}
              </h3>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{move.body}</p>
              {move.to && (
                <Link
                  to={move.to}
                  className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                >
                  {move.cta}
                  <ArrowUpRight size={11} />
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── The honest footer ── */}
      <p className="border-t border-border/50 pt-3 text-[11px] leading-relaxed text-muted-foreground">
        <strong className="font-semibold text-foreground">Nothing on this page is live.</strong>{' '}
        Making it real needs three things the platform doesn’t have yet: an emoji picker on published
        items, a reaction store that records one reaction per reader per item, and reader sign-in — until
        the last of those, every figure here counts reactions rather than people.
      </p>
    </div>
  );
}
