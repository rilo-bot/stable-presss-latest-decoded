/**
 * Cross-link block renderers: horseCard, partyCard, articleRef.
 *
 * These are what make a blog post part of the platform rather than a page of
 * text that happens to live on it — a post about a campaign can drop the actual
 * horse record inline, and it stays current because the card reads from the
 * store rather than from copy pasted at write time.
 *
 * Each degrades to a plain link when the referenced record isn't loaded or no
 * longer exists. A post must never fail to render because something it points
 * at was deleted.
 */
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useHorseStore } from '@/stores/horseStore';
import { useRegister } from '@/lib/register';
import { useArticleStore } from '@/stores/articleStore';
import { PARTY_ROLE_LABELS } from '@/types/party';
import { ArrowUpRight, FileText, User } from 'lucide-react';

/** Shared shell so the three cards read as one family. */
function RefCard({
  to,
  eyebrow,
  title,
  meta,
  thumb,
  thumbAlt,
  fallbackIcon,
}: {
  to: string;
  eyebrow: string;
  title: string;
  meta?: string;
  thumb?: string;
  thumbAlt?: string;
  fallbackIcon?: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group my-6 flex items-center gap-4 rounded-sm border border-border/60 bg-card p-3.5',
        'transition-colors hover:border-primary/30 hover:bg-muted/30',
      )}
    >
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted/40">
        {thumb ? (
          <img src={thumb} alt={thumbAlt ?? ''} crossOrigin="anonymous" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="text-muted-foreground/50">{fallbackIcon}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'hsl(var(--brand-accent))' }}>
          {eyebrow}
        </p>
        <p className="truncate font-[family-name:var(--font-display)] text-base font-bold text-foreground">{title}</p>
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      </div>
      <ArrowUpRight
        size={16}
        className="flex-shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary"
        aria-hidden="true"
      />
    </Link>
  );
}

/** Shown when the referenced record is gone or not yet loaded. */
function RefMissing({ label }: { label: string }) {
  return (
    <p className="my-6 rounded-sm border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-xs italic text-muted-foreground">
      {label}
    </p>
  );
}

export function HorseCardBlockView({ horseId }: { horseId: string }) {
  const horse = useHorseStore((s) => s.horses.find((h) => h.id === horseId));
  if (!horse) return <RefMissing label="This horse record is no longer available." />;

  const meta = [horse.sex, horse.country, horse.sire && `by ${horse.sire}`].filter(Boolean).join(' · ');
  return (
    <RefCard
      to={`/horses/${horse.id}`}
      eyebrow="Horse"
      title={horse.name}
      meta={meta || undefined}
      thumb={horse.imageUrl}
      thumbAlt={horse.name}
      fallbackIcon={<span className="text-lg">🐎</span>}
    />
  );
}

export function PartyCardBlockView({ partyId }: { partyId: string }) {
  // `partyId` is a PERSON id — a reference card points at who someone is, not at
  // one of their role edges. The register join supplies the roles to list.
  const register = useRegister();
  const party = register.find((p) => p.id === partyId);
  if (!party) return <RefMissing label="This profile is no longer available." />;

  const meta = party.roles.map((r) => PARTY_ROLE_LABELS[r] ?? r).join(' · ');
  return (
    <RefCard
      to={`/parties/${party.id}`}
      eyebrow="Profile"
      title={party.name}
      meta={meta || undefined}
      thumb={party.imageUrl}
      thumbAlt={party.name}
      fallbackIcon={<User size={20} />}
    />
  );
}

export function ArticleRefBlockView({ articleId }: { articleId: string }) {
  const article = useArticleStore((s) => s.articles.find((a) => a.id === articleId));
  if (!article) return <RefMissing label="This story is no longer available." />;

  return (
    <RefCard
      to={`/articles/${article.id}`}
      eyebrow="Related story"
      title={article.title}
      meta={article.author}
      thumb={article.imageUrl}
      thumbAlt={article.title}
      fallbackIcon={<FileText size={20} />}
    />
  );
}
