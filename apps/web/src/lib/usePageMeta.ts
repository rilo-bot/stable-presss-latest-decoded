/**
 * Set the document title and description for a page.
 *
 * Nothing in this app managed the head before, so every route shared index.html's
 * one static title — the browser tab, the history entry and any bookmark all read
 * the same thing whatever you were looking at.
 *
 * SCOPE, so this isn't mistaken for SEO: this runs in the browser, after React
 * mounts. It fixes the tab, bookmarks, history and the in-app experience. It does
 * NOT help search engines or link unfurlers, which read the server's HTML and
 * never execute this. Real SEO for /blog needs prerendering or SSR — see
 * docs/BLOG-FEATURE-REVIEW.md.
 */
import { useEffect } from 'react';

const SITE = 'Stable Press';

/** Read the original value once, so unmounting can put it back. */
const BASE_TITLE = typeof document === 'undefined' ? SITE : document.title;

function setMeta(name: string, content: string | undefined): void {
  let tag = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!content) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

export interface PageMeta {
  /** Page name. Suffixed with the site name; pass the bare page title. */
  title?: string;
  description?: string;
  /** Adds `<meta name="robots" content="noindex">` while this page is mounted. */
  noindex?: boolean;
}

export function usePageMeta({ title, description, noindex }: PageMeta): void {
  useEffect(() => {
    // A post still loading has no title yet; leave the previous one rather than
    // flashing a bare site name into the tab and the history entry.
    if (title) document.title = `${title} · ${SITE}`;
    setMeta('description', description);
    setMeta('robots', noindex ? 'noindex' : undefined);

    return () => {
      document.title = BASE_TITLE;
      setMeta('description', undefined);
      setMeta('robots', undefined);
    };
  }, [title, description, noindex]);
}
