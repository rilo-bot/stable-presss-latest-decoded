/**
 * Emoji Analytics — /production-system/emoji-analytics
 *
 * Reader reactions on the seven-point scale, for stories, blogs and bulletins.
 *
 * ── THREE ANALYTICS, DELIBERATELY ──
 *   1. How readers feel overall — the whole scale, counted.
 *   2. What they loved — the top ten for whichever reaction you pick.
 *   3. What kind of thing lands — stories vs blogs vs bulletins.
 *
 * Earlier cuts of this screen carried a divisiveness scatter, a reader-role
 * heatmap, weekly trend lines, an arrival curve, audience segments and six
 * tabbed registers. Each was defensible alone; together they were a page nobody
 * reads. The rest is kept in docs/EMOJI-ANALYTICS-PLAN.md for when it is wanted.
 *
 * ── STATIC, WITH SAMPLE DATA ──
 * There is no `reactions` collection and no endpoint. This is the design for
 * that system, so it says so in the header and in the footer. Everything derives
 * from one generated reaction list, so the panels always agree; when the
 * endpoint lands, only the source changes.
 *
 * ── WHAT THIS PAGE WILL NOT CLAIM ──
 * No view tracking, no dwell time, no referrers and no comments exist anywhere
 * in Stable Press. Reactions are the only reader signal there is — which is why
 * nothing here may imply a measurement we do not take.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  CONTENT_TYPES, DATE_RANGES, EMOJI_KEYS, SIDE_FILL, avgStep, compact, deriveDashboard, rangeFor,
  scoreText, shortDate, signed, stepFor, typeLabel,
  type ContentType, type DateRangeId, type EmojiKey, type Filters, type ItemStat,
} from '../emoji-analytics/data';
import {
  Bar, ChipToggles, DivergingBar, Empty, Panel, SampleDataBadge, Section,
  SegmentedControl, StatTile, ThreeWayBar, splitParts,
} from '../emoji-analytics/parts';

/**
 * A piece needs this many reactions before it can be ranked. Fixed rather than
 * exposed as a control — one fewer thing to explain, and the number is stated
 * wherever it bites. Without it, something published yesterday tops the board on
 * a handful of clicks.
 */
const MIN_REACTIONS = 40;

export default function EmojiAnalyticsScreen() {
  const [rangeId, setRangeId] = useState<DateRangeId>('90');
  const [types, setTypes] = useState<ContentType[]>([]);
  /** 'score' ranks on the total; a step ranks on how much of that step it earned. */
  const [rank, setRank] = useState<'score' | EmojiKey>('score');

  const filters: Filters = useMemo(
    () => ({ ...rangeFor(rangeId), types }),
    [rangeId, types],
  );

  const d = useMemo(() => deriveDashboard(filters), [filters]);

  const maxEmojiPct = Math.max(1, ...d.emojiRows.map((r) => r.pct));

  const leaders = useMemo(() => {
    // Ranking on the TOTAL needs no floor — a piece with four reactions cannot
    // total anything. Ranking on a single step's count is likewise absolute.
    // The floor exists for the ratios (the average, the band), so it is applied
    // once, here, and the list population never changes when you switch modes.
    const pool = d.items.filter((s) => s.split.reactions >= MIN_REACTIONS);
    if (rank === 'score') {
      return [...pool].sort((a, b) => b.split.score - a.split.score).slice(0, 10);
    }
    const i = EMOJI_KEYS.indexOf(rank);
    return [...pool]
      .sort((a, b) => (b.split.counts[i] ?? 0) - (a.split.counts[i] ?? 0))
      .slice(0, 10);
  }, [d.items, rank]);

  return (
    <div className="space-y-6 pb-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-[family-name:var(--font-display)] text-[19px] font-bold leading-tight text-foreground">
            Reader reactions
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            One emoji per reader, on a seven-point scale — across stories, blogs, the parts within a blog, and
            bulletins.
          </p>
        </div>
        <SampleDataBadge>Sample data · no reaction feed yet</SampleDataBadge>
      </div>

      {/* ── One control row, above everything it scopes ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SegmentedControl
          label="Date range"
          options={DATE_RANGES.map((r) => ({ value: r.id, label: r.label }))}
          value={rangeId}
          onChange={setRangeId}
        />
        <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
        <ChipToggles
          label="Content type"
          allLabel="Everything"
          options={CONTENT_TYPES.map((t) => ({ value: t.id, label: t.label }))}
          values={types}
          onToggle={(v) => setTypes((cur) => (cur.includes(v) ? cur.filter((t) => t !== v) : [...cur, v]))}
          onClear={() => setTypes([])}
        />
      </div>

      {d.reactions === 0 ? (
        <Panel><Empty>No reactions in this range. Widen the dates or clear the type filter.</Empty></Panel>
      ) : (
        <>
          {/* ── Headline figures ── */}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Total score" value={scoreText(d.overall.score)}
              detail={<>Averages <span aria-hidden="true">{avgStep(d.overall.avgScore).emoji}</span>{' '}“{avgStep(d.overall.avgScore).label.toLowerCase()}” across every reaction</>} />
            <StatTile label="Reader mood" value={d.moodVerdict} display
              detail={`${d.overall.forPct}% for · ${d.overall.againstPct}% against`} />
            <StatTile label="Total reactions" value={compact(d.reactions)}
              detail={`From ${compact(d.reactors)} readers, on ${d.coverage.reacted} of ${d.coverage.published} published items`} />
          </div>

          {/* ── 1 · The whole scale ── */}
          <Panel title="How readers feel overall">
            <ThreeWayBar parts={splitParts(d.overall, SIDE_FILL)} />

            {/* Where the scoring model explains itself: count × weight, per
                step, adding up to the total in the tile above. Without this the
                score is a number the page asks you to trust. */}
            <div className="mb-2 mt-7 flex items-baseline justify-between gap-3">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Every emoji, counted — and what it was worth
              </p>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                count × weight = score
              </p>
            </div>
            <ul className="space-y-2">
              {d.emojiRows.map((row, i) => (
                <li key={row.key} className="flex items-center gap-3">
                  <span aria-hidden="true" className="w-6 flex-shrink-0 text-center text-[16px] leading-none">
                    {row.emoji}
                  </span>
                  <span className="w-[104px] flex-shrink-0 truncate text-[12.5px] text-foreground">{row.label}</span>
                  <span className="min-w-0 flex-1">
                    <Bar pct={(row.pct / maxEmojiPct) * 100} fill={row.fill} />
                  </span>
                  <span className="w-11 flex-shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
                    {compact(row.count)}
                  </span>
                  <span className="w-8 flex-shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
                    ×{signed(row.weight)}
                  </span>
                  <span className="w-16 flex-shrink-0 text-right text-[12px] font-semibold tabular-nums text-foreground">
                    {scoreText(d.overall.contributions[i] ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-baseline justify-end gap-3 border-t border-border/50 pt-2.5 text-[12px]">
              <span className="text-muted-foreground">Total score</span>
              <span className="text-[15px] font-bold tabular-nums text-foreground">{scoreText(d.overall.score)}</span>
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
              The scale is not evenly spaced — one 🤬 cancels five 🙂, or one 🤩. Mild opinions barely move a
              score; strong ones decide it.
            </p>
          </Panel>

          {/* ── 2 · Leaderboard ── */}
          <Panel
            title={rank === 'score' ? 'Highest scoring' : `Most ${stepFor(rank).label.toLowerCase()}`}
            subtitle={
              rank === 'score'
                ? 'The ten highest totals in this range. Score adds up every reaction, so reach counts — read it next to the average.'
                : <>The ten pieces that earned the most <span aria-hidden="true">{stepFor(rank).emoji}</span> in this range.</>
            }
            aside={
              <SegmentedControl
                label="Rank by"
                options={[
                  { value: 'score' as const, label: 'Score', title: 'Rank by total score' },
                  ...EMOJI_KEYS.map((k) => ({
                    value: k,
                    label: <span aria-hidden="true" className="text-[16px] leading-none">{stepFor(k).emoji}</span>,
                    title: `Rank by ${stepFor(k).label.toLowerCase()}`,
                  })),
                ]}
                value={rank}
                onChange={setRank}
              />
            }
          >
            {leaders.length === 0 ? (
              <Empty>Nothing has {MIN_REACTIONS} reactions yet in this range.</Empty>
            ) : (
              <ul className="divide-y divide-border/50">
                {leaders.map((s, i) => (
                  <LeaderRow key={s.item.id} rank={i + 1} stat={s} highlight={rank} />
                ))}
              </ul>
            )}
            <p className="mt-4 border-t border-border/50 pt-3 text-[11.5px] leading-relaxed text-muted-foreground">
              <strong className="font-semibold text-foreground">Score</strong> is every reaction added up, so the
              biggest piece usually wins it. <strong className="font-semibold text-foreground">Avg</strong> is the
              score per reaction, −5 to +5 — how well it went down, whatever its size. Ranked on{' '}
              {MIN_REACTIONS}+ reactions, so nothing tops the board on a handful of clicks.
            </p>
          </Panel>

          {/* ── 3 · By content type ── */}
          <Section title="Reactions by content type">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {d.byType.map((t) => (
                <div key={t.id} className="rounded-sm border border-border/60 bg-card p-5">
                  <div className="mb-3 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-[family-name:var(--font-display)] text-[14px] font-bold text-foreground">
                        <Link to={t.href} className="underline-offset-2 hover:underline">{t.label}</Link>
                      </h3>
                      <p className="mt-0.5 text-[11.5px] tabular-nums text-muted-foreground">
                        {t.published} {t.published === 1 ? t.unit.replace(/s$/, '') : t.unit}
                        {' · '}{compact(t.split.reactions)} reactions
                      </p>
                    </div>
                  </div>
                  {t.split.reactions > 0 ? (
                    <>
                      <p className="mb-3 flex items-baseline gap-2">
                        <span className="text-[26px] font-bold leading-none text-foreground">
                          {scoreText(t.split.score)}
                        </span>
                        <span className="text-[11.5px] text-muted-foreground">
                          averages <span aria-hidden="true">{avgStep(t.split.avgScore).emoji}</span>{' '}
                          {avgStep(t.split.avgScore).label.toLowerCase()}
                        </span>
                      </p>
                      <ThreeWayBar parts={splitParts(t.split, SIDE_FILL)} compact />
                    </>
                  ) : (
                    <p className="text-[11.5px] text-muted-foreground">No reactions yet.</p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      {/* ── The honest footer ── */}
      <p className="border-t border-border/50 pt-4 text-[11.5px] leading-relaxed text-muted-foreground">
        <strong className="font-semibold text-foreground">Nothing on this page is live.</strong>{' '}
        Making it real needs three things the platform does not have yet: a reaction bar on published items that
        stores what it collects, a reaction store recording one reaction per reader per item, and reader sign-in —
        until the last of those, every figure here counts reactions rather than people. There is no view tracking
        and no comments anywhere in the platform, so this page claims neither.
      </p>
    </div>
  );
}

function LeaderRow({
  rank, stat, highlight,
}: {
  rank: number;
  stat: ItemStat;
  /** Which number this row is being ranked on — that one is emphasised. */
  highlight: 'score' | EmojiKey;
}) {
  const byScore = highlight === 'score';
  const count = byScore ? 0 : (stat.split.counts[EMOJI_KEYS.indexOf(highlight)] ?? 0);
  const share = byScore ? 0 : Math.round((count / stat.split.reactions) * 100);
  const avg = avgStep(stat.split.avgScore);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <span className="w-4 flex-shrink-0 text-[12px] tabular-nums text-muted-foreground">{rank}</span>
      <span className="min-w-0 flex-1 basis-[240px]">
        <span className="block truncate text-[13px] font-semibold text-foreground">{stat.item.title}</span>
        <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
          {/* A part is never read on its own, so it is never listed on its own —
              the post it belongs to is part of its name here. */}
          {stat.item.parentTitle
            ? <>Part of <span className="italic">{stat.item.parentTitle}</span></>
            : typeLabel(stat.item.type)}
          {stat.item.category ? ` · ${stat.item.category}` : ''}
          {' · '}{shortDate(stat.item.publishedAt)}
          {' · '}{compact(stat.split.reactions)} reactions
        </span>
      </span>
      <span className="w-24 flex-shrink-0">
        <DivergingBar split={stat.split} />
      </span>

      {/* When ranking on one emoji, that count leads and the score follows, so
          the column you sorted by is always the one you read first. */}
      {!byScore && (
        <span className="flex w-14 flex-shrink-0 items-baseline justify-end gap-1">
          <span className="text-[15px] font-bold tabular-nums text-foreground">{compact(count)}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">{share}%</span>
        </span>
      )}
      <span className="w-16 flex-shrink-0 text-right">
        <span className={byScore
          ? 'text-[15px] font-bold tabular-nums text-foreground'
          : 'text-[12.5px] tabular-nums text-muted-foreground'}>
          {scoreText(stat.split.score)}
        </span>
      </span>
      {/* The average, as the step it rounds to. A decimal like "+2.8" is a
          number that exists nowhere on the scale the reader was offered. */}
      <span
        className="w-8 flex-shrink-0 text-right text-[17px] leading-none"
        title={`Averages ${avg.label.toLowerCase()}`}
      >
        <span aria-hidden="true">{avg.emoji}</span>
        <span className="sr-only">Averages {avg.label}</span>
      </span>
    </li>
  );
}
