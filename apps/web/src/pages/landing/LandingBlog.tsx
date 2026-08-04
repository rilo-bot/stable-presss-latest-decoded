/**
 * "From the Blog" — the newest published posts.
 *
 * NEW. /blog had no presence on the front page at all: the landing page linked to
 * /news, /horses, /bulletins, /podcast and /tipping, but the blog existed only as
 * a nav item. A reader arriving at the front door had no way to learn the longform
 * writing was there.
 *
 * The rows deliberately match /blog's own list rows — thumbnail left, category and
 * date, headline, two lines of the opening — so following the section link lands
 * somewhere that looks like where you came from.
 *
 * Renders nothing when there are no posts. The front page never carries an empty
 * shell announcing a section with no content.
 */
import { Link } from 'react-router-dom';
import { BookOpen, Clock } from 'lucide-react';
import type { BlogSummary } from '@/types/blog';
import { SectionHead } from './SectionHead';

interface LandingBlogProps {
  posts: BlogSummary[];
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function LandingBlog({ posts }: LandingBlogProps) {
  if (posts.length === 0) return null;

  return (
    <section>
      <SectionHead title="From the Blog" to="/blog" linkLabel="All posts" />

      <ul>
        {posts.map((post, idx) => {
          const date = formatDate(post.publishedAt);
          return (
            <li key={post.id}>
              <Link
                to={`/blog/${post.slug}`}
                className={`group flex gap-4 py-5 transition-colors hover:bg-muted/30 -mx-3 px-3 rounded-sm sm:gap-6 ${
                  idx < posts.length - 1 ? 'border-b border-border/40' : ''
                }`}
                aria-label={`Read: ${post.title}`}
              >
                {post.thumbnailUrl ? (
                  <img
                    src={post.thumbnailUrl}
                    alt={post.thumbnailAlt ?? ''}
                    crossOrigin="anonymous"
                    loading="lazy"
                    className="hidden h-20 w-28 flex-shrink-0 rounded-sm object-cover sm:block"
                  />
                ) : (
                  <span
                    className="hidden h-20 w-28 flex-shrink-0 items-center justify-center rounded-sm bg-muted/40 sm:flex"
                    aria-hidden="true"
                  >
                    <BookOpen size={18} className="text-muted-foreground/30" />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                    {post.category && (
                      /* Gold as INK, not as fill. `--brand-accent` is 2.06:1 as
                         text on this surface; `--brand-accent-ink` is what the
                         token set provides for exactly this. */
                      <span
                        className="font-semibold"
                        style={{ color: 'hsl(var(--brand-accent-ink))' }}
                      >
                        {post.category}
                      </span>
                    )}
                    {date && <span>{date}</span>}
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} />
                      {post.readingTime} min read
                    </span>
                  </div>

                  <h3 className="font-[family-name:var(--font-display)] text-base md:text-lg font-bold leading-snug text-foreground group-hover:text-primary transition-colors">
                    {post.title}
                  </h3>

                  {post.excerpt && (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {post.excerpt}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
