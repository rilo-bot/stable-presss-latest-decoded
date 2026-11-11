// ---------------------------------------------------------------------------
// The Stable Hand — PUBLIC SITE read actions: Home, News (+ search), a story,
// the Blog index, a blog post and the Podcast hub.
//
// Each hook is called by its page and reads the SAME store data the page
// renders, so what the model is told is what the reader sees. The only one that
// drives the UI is site.searchNews, which types into the page's real search box.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/site.ts — keep in step.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import { isLive, type Article } from '@/types/article';
import { allBlocks, type Blog, type BlogSummary } from '@/types/blog';
import type { PodcastEpisode } from '@/types/podcast';
import { useArticleStore } from '@/stores/articleStore';
import { useBreakingNewsStore } from '@/stores/breakingNewsStore';
import { useBlogStore } from '@/stores/blogStore';
import { useIssueStore } from '@/stores/issueStore';
import { usePodcastStore } from '@/stores/podcastStore';
import { useHorseStore } from '@/stores/horseStore';
import { clip, day, stripHtml, typeSearch, useLive } from './siteUtils';

const MAX = 25;

const storyRow = (a: Article) => ({
  id: a.id,
  title: a.title,
  category: a.category ?? null,
  author: a.author || null,
  publishedAt: day(a.publishedAt),
  path: `/articles/${a.id}`,
});

const byNewest = (a: Article, b: Article) =>
  new Date(b.publishedAt ?? b.createdAt ?? 0).getTime() - new Date(a.publishedAt ?? a.createdAt ?? 0).getTime();

const blogRow = (b: BlogSummary) => ({
  title: b.title,
  author: b.author?.name ?? null,
  category: b.category ?? null,
  excerpt: clip(b.excerpt || b.subtitle, 200) || null,
  publishedAt: day(b.publishedAt),
  path: `/blog/${b.slug}`,
});

// ── Home ─────────────────────────────────────────────────────────────────────

export function useHomeOperatorActions(): void {
  useAgentAction({
    name: 'site.readHome',
    description: 'Read the home page: lead headlines, breaking-news ticker, latest blog posts, editions and episodes.',
    args: z.object({}),
    run: async () => {
      const articles = (useArticleStore.getState().articles ?? []).filter(isLive).sort(byNewest);
      const episodes = (usePodcastStore.getState().episodes ?? []).filter((e) => e.status === 'published');
      return {
        headlines: articles.slice(0, 8).map(storyRow),
        breaking: (useBreakingNewsStore.getState().items ?? []).filter((i) => i.active).map((i) => i.text),
        latestBlogPosts: (useBlogStore.getState().latest ?? []).slice(0, 5).map(blogRow),
        latestBulletins: (useIssueStore.getState().issues ?? []).slice(0, 3).map((i) => ({ title: i.title, edition: i.edition, pages: i.pageCount, path: `/bulletins/${i.id}` })),
        latestEpisodes: episodes.slice(0, 3).map((e) => ({ title: e.title, host: e.host, season: e.season, episode: e.episodeNumber })),
        horsesInRegister: (useHorseStore.getState().horses ?? []).length,
      };
    },
  });
}

// ── News index ───────────────────────────────────────────────────────────────

export function useNewsOperatorActions(state: {
  filtered: Article[];
  search: string;
  section: string | null;
  category: string | null;
}): void {
  const live = useLive(state);
  const read = () => {
    const s = live.current;
    return {
      search: s.search || null,
      section: s.section,
      category: s.category,
      shown: s.filtered.length,
      stories: [...s.filtered].sort(byNewest).slice(0, MAX).map(storyRow),
    };
  };

  useAgentAction({
    name: 'site.readNews',
    description: 'List the published stories the News page is showing (with the current search / section).',
    args: z.object({}),
    run: async () => read(),
  });

  useAgentAction<{ query: string }>({
    name: 'site.searchNews',
    description: 'Type into the News search box and return the matching stories.',
    args: z.object({ query: z.string().max(120) }),
    run: async (a, ui) => {
      await typeSearch(ui, 'site.news-search', a.query, () => live.current.search === a.query);
      return read();
    },
  });
}

// ── One story ────────────────────────────────────────────────────────────────

export function useArticleOperatorActions(
  article: Article | undefined,
  extra: { linkedHorses: Array<{ id: string; name: string }>; related: Article[] },
): void {
  const live = useLive({ article, extra });
  useAgentAction({
    name: 'site.readArticle',
    description: 'Read the open story: headline, standfirst, byline, category, linked horses and a body excerpt.',
    args: z.object({}),
    run: async () => {
      const { article: a, extra: x } = live.current;
      if (!a) throw new Error('The story has not loaded (or is not available to you).');
      const body = a.summary ?? '';
      return {
        id: a.id,
        title: a.title,
        author: a.author || null,
        category: a.category ?? null,
        status: a.status,
        publishedAt: day(a.publishedAt),
        readingTimeMin: a.readingTime ?? null,
        tags: a.tags ?? [],
        standfirst: clip(body.split(/\n\s*\n/)[0], 300),
        bodyExcerpt: clip(body, 1500),
        bodyChars: body.length,
        linkedHorses: x.linkedHorses.map((h) => ({ name: h.name, path: `/horses/${h.id}` })),
        related: x.related.slice(0, 4).map(storyRow),
      };
    },
  });
}

// ── Blog ─────────────────────────────────────────────────────────────────────

export function useBlogIndexOperatorActions(state: { filters: Record<string, string | undefined>; total: number }): void {
  const live = useLive(state);
  useAgentAction({
    name: 'site.readBlog',
    description: 'List the blog posts the Blog page is showing (with any search / tag / category filter).',
    args: z.object({}),
    run: async () => {
      const items = useBlogStore.getState().items ?? [];
      const f = live.current.filters;
      return {
        filters: Object.fromEntries(Object.entries(f).filter(([k, v]) => v && k !== 'status')),
        total: live.current.total,
        posts: items.slice(0, MAX).map(blogRow),
      };
    },
  });
}

function blockText(b: unknown): string {
  const r = b as Record<string, unknown>;
  if (typeof r.html === 'string') return stripHtml(r.html);
  if (typeof r.text === 'string' && r.kind !== 'code') return r.text;
  if (Array.isArray(r.items)) return r.items.map((x) => stripHtml(String(x))).join('; ');
  return '';
}

export function useBlogPostOperatorActions(current: Blog | null): void {
  const live = useLive(current);
  useAgentAction({
    name: 'site.readBlogPost',
    description: 'Read the open blog post: title, author, excerpt, sections and a body excerpt.',
    args: z.object({}),
    run: async () => {
      const b = live.current;
      if (!b) throw new Error('The post has not loaded (or is not available to you).');
      const text = allBlocks(b).map(blockText).filter(Boolean).join('\n');
      return {
        title: b.title,
        subtitle: b.subtitle ?? null,
        author: b.author?.name ?? null,
        status: b.status,
        publishedAt: day(b.publishedAt),
        excerpt: clip(b.excerpt, 300) || null,
        sections: (b.parts ?? []).map((p) => p.title).filter(Boolean),
        bodyExcerpt: clip(text, 1500),
        path: `/blog/${b.slug}`,
      };
    },
  });
}

// ── Podcast ──────────────────────────────────────────────────────────────────

export function usePodcastOperatorActions(published: PodcastEpisode[]): void {
  const live = useLive(published);
  useAgentAction({
    name: 'site.readPodcast',
    description: 'List the published podcast episodes on the Podcast page, newest first.',
    args: z.object({}),
    run: async () => ({
      episodes: live.current.slice(0, MAX).map((e) => ({
        title: e.title,
        host: e.host,
        season: e.season,
        episode: e.episodeNumber,
        minutes: Math.round((e.durationSeconds ?? 0) / 60),
        publishedAt: day(e.publishedAt),
        description: clip(e.description, 240),
      })),
    }),
  });
}
