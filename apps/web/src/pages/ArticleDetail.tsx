import { useMemo, useEffect } from 'react'
import { useParams, Navigate, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useArticleStore } from '@/stores/articleStore';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { connectionResolver } from '@/lib/horseConnections';
import {
  Clock,
  ChevronRight,
  ArrowLeft,
  Share2,
  Bookmark,
  ChevronLeft,
  BookOpen,
  Calendar,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { canViewPremium } from '@/rbac/can';
import { Paywall } from '@/components/Paywall';
import { AskAgentButton } from '@/components/AskAgentButton';
import { STATUS_LABELS, splitIntoParagraphs, DEFAULT_HERO } from './article-detail/helpers';
import { Sidebar } from './article-detail/Sidebar';
import { RelatedPanel } from './article-detail/RelatedPanel';

export default function ArticleDetail() {
  // All hooks run unconditionally, before any early return (Rules of Hooks):
  // the guards below branch only on the resulting values.
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const fetchArticles = useArticleStore((s) => s.fetchArticles);
  useEffect(() => {
    fetchHorses();
    fetchParties();
    fetchArticles();
  }, [fetchHorses, fetchParties, fetchArticles]);

  const articles = useArticleStore((s) => s.articles);
  const articlesLoaded = useArticleStore((s) => s.loaded);
  const horses = useHorseStore((s) => s.horses);
  const parties = usePartyStore((s) => s.parties);
  const currentUser = useAuthStore((s) => s.currentUser);
  const horseConn = useMemo(() => connectionResolver(parties), [parties]);

  const article = useMemo(() => articles.find((a) => a.id === id), [articles, id]);

  const linkedHorses = useMemo(() => {
    if (!article) return [];
    return horses.filter((h) => article.linkedHorseIds?.includes(h.id));
  }, [article, horses]);

  // Related articles: same category, excluding current
  const relatedArticles = useMemo(() => {
    if (!article) return [];
    return articles
      .filter(
        (a) =>
          a.id !== id &&
          (a.status === 'published' || a.status === 'newsletter' || a.status === 'bulletin') &&
          a.category === article.category
      )
      .slice(0, 3);
  }, [articles, article, id]);

  if (!id) return <Navigate to="/" replace />;

  // Don't redirect while the store is still loading. On a hard refresh (or a
  // direct link) the article list starts empty and arrives asynchronously —
  // redirecting on the first render would bounce the reader to /news before
  // their story ever loads. Only treat a missing article as "not found" once
  // the fetch has completed.
  if (!article) {
    if (!articlesLoaded) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <p className="font-[family-name:var(--font-display)] italic text-muted-foreground">
            Loading the story…
          </p>
        </div>
      );
    }
    return <Navigate to="/news" replace />;
  }

  const heroImage = article.imageUrl ?? DEFAULT_HERO;

  const formattedDate = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString('en-AU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : article.createdAt
    ? new Date(article.createdAt).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const isLive =
    article.status === 'published' ||
    article.status === 'newsletter' ||
    article.status === 'bulletin';

  const paragraphs = splitIntoParagraphs(article.summary ?? '');

  // Premium gate (entitlement axis) — independent of roles. Defaults to free/ungated.
  const locked = !canViewPremium(currentUser, article.minTier);

  return (
    <div className="min-h-screen bg-background">

      {/* ── Full-bleed Hero ───────────────────────────── */}
      <div className="relative w-full h-[60vh] min-h-[400px] max-h-[680px] overflow-hidden">
        <img
          src={heroImage}
          alt={article.title}
          crossOrigin="anonymous"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        {/* Multi-stop scrim: bottom-to-top opacity for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/95 via-foreground/50 to-foreground/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/20 via-transparent to-transparent" />

        {/* Breadcrumb nav over hero */}
        <div className="absolute top-0 left-0 right-0 px-4 md:px-10 pt-5">
          <nav className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] font-semibold text-primary-foreground/60">
            <button
              onClick={() => navigate('/')}
              className="hover:text-primary-foreground transition-colors flex items-center gap-1"
              aria-label="Back to home"
            >
              <ChevronLeft size={11} />
              Home
            </button>
            <ChevronRight size={10} />
            <button
              onClick={() => navigate('/news')}
              className="hover:text-primary-foreground transition-colors"
            >
              Editorial
            </button>
            {article.category && (
              <>
                <ChevronRight size={10} />
                <span className="text-primary-foreground/80">{article.category}</span>
              </>
            )}
          </nav>
        </div>

        {/* Hero headline block */}
        <div className="absolute bottom-0 left-0 right-0 px-4 md:px-10 pb-8 md:pb-12">
          <div className="max-w-4xl">
            {/* Category stamp */}
            {article.category && (
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="text-[9px] uppercase tracking-[0.22em] font-bold px-2.5 py-1 rounded-sm"
                  style={{
                    background: 'hsl(var(--brand-accent))',
                    color: 'hsl(var(--brand-accent-foreground))',
                  }}
                >
                  {article.category}
                </span>
                {isLive && (
                  <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] font-semibold text-primary-foreground/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                    Published
                  </span>
                )}
              </div>
            )}

            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl md:text-5xl font-bold text-primary-foreground leading-[1.08] mb-4 max-w-3xl"
            >
              {article.title}
            </motion.h1>

            {/* Byline row */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.28, delay: 0.1, ease: 'easeOut' }}
              className="flex flex-wrap items-center gap-4"
            >
              <div className="flex items-center gap-2.5">
                {/* Avatar initials */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                  style={{
                    background: 'hsl(var(--brand-accent))',
                    color: 'hsl(var(--brand-accent-foreground))',
                  }}
                >
                  {(article.author ?? 'A').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-semibold text-primary-foreground/90">
                    {article.author}
                  </p>
                  <p className="text-[10px] text-primary-foreground/50 uppercase tracking-[0.08em]">
                    Staff Correspondent
                  </p>
                </div>
              </div>

              <span className="w-px h-8 bg-primary-foreground/20 hidden sm:block" />

              {formattedDate && (
                <span className="flex items-center gap-1.5 text-[11px] text-primary-foreground/60">
                  <Calendar size={11} />
                  {formattedDate}
                </span>
              )}

              {article.readingTime && (
                <span className="flex items-center gap-1.5 text-[11px] text-primary-foreground/60">
                  <Clock size={11} />
                  {article.readingTime} min read
                </span>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* ── Gold masthead rule ────────────────────────── */}
      <div
        className="h-[3px] w-full"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, hsl(var(--brand-accent)) 20%, hsl(var(--brand-accent)) 80%, transparent 100%)',
        }}
      />

      {/* ── Article Body ──────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 xl:gap-16">

          {/* ── Main reading column ── */}
          <article>
            {/* Action row: back + share */}
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-border/50">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-[0.08em] group"
                aria-label="Go back"
              >
                <ArrowLeft
                  size={13}
                  className="group-hover:-translate-x-0.5 transition-transform duration-140"
                />
                Back
              </button>

              <div className="flex items-center gap-3">
                <AskAgentButton
                  prompt="Give me a quick summary of this article and why it matters."
                  label="Ask"
                />
                {article.tags && article.tags.length > 0 && (
                  <div className="hidden sm:flex items-center gap-1.5">
                    {article.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[9px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground font-semibold"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Bookmark article"
                >
                  <Bookmark size={13} />
                  <span className="hidden sm:inline">Save</span>
                </button>
                <button
                  className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Share article"
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({ title: article.title, url: window.location.href }).catch(() => {});
                    }
                  }}
                >
                  <Share2 size={13} />
                  <span className="hidden sm:inline">Share</span>
                </button>
              </div>
            </div>

            {/* Status notice for unpublished articles */}
            {!isLive && (
              <div className="mb-6 flex items-center gap-2 px-4 py-2.5 rounded-sm border border-primary/30 bg-primary/5 text-primary text-xs font-semibold uppercase tracking-[0.1em]">
                <span className="w-2 h-2 rounded-full bg-primary/60 inline-block" />
                {STATUS_LABELS[article.status] ?? article.status}
              </div>
            )}

            {/* Lead deck — editorial intro */}
            {paragraphs.length > 0 && (
              <div className="mb-8">
                {/* Drop-cap first paragraph */}
                <p
                  className="font-[family-name:var(--font-display)] text-lg md:text-xl leading-relaxed text-foreground mb-5"
                  style={{ lineHeight: 1.72 }}
                >
                  <span
                    className="float-left font-[family-name:var(--font-display)] font-bold mr-2 mt-1 leading-none"
                    style={{
                      fontSize: 'clamp(3.5rem, 7vw, 5rem)',
                      color: 'hsl(var(--brand-accent))',
                      lineHeight: 0.82,
                    }}
                    aria-hidden="true"
                  >
                    {paragraphs[0].charAt(0)}
                  </span>
                  {paragraphs[0].slice(1)}
                </p>

                {locked ? (
                  /* Premium gate — first paragraph above is the free teaser. */
                  <Paywall requiredTier={article.minTier ?? 'premium'} />
                ) : (
                  <>
                    {/* Pull quote after first paragraph if we have enough */}
                    {paragraphs.length >= 3 && (
                      <div
                        className="my-8 pl-5 border-l-[3px] py-2"
                        style={{ borderColor: 'hsl(var(--brand-accent))' }}
                      >
                        <p
                          className="font-[family-name:var(--font-display)] italic text-xl md:text-2xl font-semibold text-foreground/85 leading-snug"
                          style={{ fontStyle: 'italic' }}
                        >
                          "{paragraphs[1]}"
                        </p>
                        <p
                          className="mt-3 text-[10px] uppercase tracking-[0.14em] font-bold"
                          style={{ color: 'hsl(var(--brand-accent))' }}
                        >
                          — {article.author}
                        </p>
                      </div>
                    )}

                    {/* Remaining body paragraphs */}
                    <div className="space-y-5">
                      {paragraphs.slice(paragraphs.length >= 3 ? 2 : 1).map((para, idx) => (
                        <p
                          key={idx}
                          className="text-base text-foreground/85 leading-relaxed font-[family-name:var(--font-body,inherit)]"
                          style={{ lineHeight: 1.78 }}
                        >
                          {para}
                        </p>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* When no body copy yet (draft / pending) */}
            {paragraphs.length === 0 && (
              <div className="py-10 flex flex-col items-center justify-center border border-dashed border-border/60 rounded-sm bg-muted/20 mb-8">
                <BookOpen size={32} className="text-primary/30 mb-3" />
                <p className="font-[family-name:var(--font-display)] italic text-muted-foreground text-base text-center max-w-sm">
                  The full text of this story is being prepared for print. Check back soon.
                </p>
              </div>
            )}

            {/* ── Ornate divider ── */}
            <div className="sku-divider my-8" />

            {/* Tags strip */}
            {article.tags && article.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-8">
                <span className="text-[9px] uppercase tracking-[0.14em] font-bold text-muted-foreground mr-1">
                  Filed under
                </span>
                {article.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] uppercase tracking-[0.1em] px-2.5 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors cursor-pointer font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Author card */}
            <div
              className="flex items-start gap-4 p-5 rounded-sm border border-border/60"
              style={{ background: 'hsl(var(--brand-accent) / 0.04)' }}
            >
              <div
                className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-base font-bold"
                style={{
                  background: 'hsl(var(--brand-accent))',
                  color: 'hsl(var(--brand-accent-foreground))',
                }}
              >
                {(article.author ?? 'A').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p
                  className="text-[9px] uppercase tracking-[0.16em] font-bold mb-0.5"
                  style={{ color: 'hsl(var(--brand-accent))' }}
                >
                  Written by
                </p>
                <h4 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground">
                  {article.author}
                </h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Staff Correspondent, Stable Press. Covering the thoroughbred
                  racing circuit with a focus on form analysis and paddock intelligence.
                </p>
              </div>
            </div>

            {/* ── Related Articles (real, same-category) ── */}
            <RelatedPanel relatedArticles={relatedArticles} category={article.category} />
          </article>

          {/* ── Sidebar ── */}
          <Sidebar
            linkedHorses={linkedHorses}
            horseConn={horseConn}
            relatedArticles={relatedArticles}
          />
        </div>
      </div>

      {/* ── Bottom CTA band ───────────────────────────── */}
      <div className="border-t border-border/50 bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <p
              className="text-[9px] uppercase tracking-[0.2em] font-bold mb-1"
              style={{ color: 'hsl(var(--brand-accent))' }}
            >
              Stable Press
            </p>
            <h3 className="font-[family-name:var(--font-display)] text-xl md:text-2xl font-bold text-primary-foreground leading-tight">
              The form is everything. The rest is conversation.
            </h3>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 flex-shrink-0">
            <Link
              to="/news"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] rounded-sm border border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
            >
              More editorial <ArrowLeft size={12} className="rotate-180" />
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] rounded-sm transition-colors"
              style={{
                background: 'hsl(var(--brand-accent))',
                color: 'hsl(var(--brand-accent-foreground))',
              }}
            >
              Join Stable Press
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}