import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, Clock, ArrowRight, Mail } from 'lucide-react';
import { SECTION_ICONS, SECTION_IMAGES } from './constants';
import type { SectionGroup } from './useArticleGroups';

interface SectionGridProps {
  /** Which page is rendering — selects the layout/styling. */
  variant: 'bulletin' | 'newsletter';
  /** Grouped sections from useArticleGroups. */
  sections: SectionGroup[];
  /** Whether any CMS articles matched (gates "is real" links). */
  hasCmsArticles: boolean;
}

/**
 * Grouped-by-section/category article display, parameterised by variant.
 * Each branch reproduces the original page markup verbatim:
 *  - 'bulletin'  → broadsheet horizontal editorial list
 *  - 'newsletter' → card grid with show-more expansion
 */
export default function SectionGrid({ variant, sections, hasCmsArticles }: SectionGridProps) {
  if (variant === 'bulletin') {
    return <BulletinSections sections={sections} hasCmsArticles={hasCmsArticles} />;
  }
  return <NewsletterSections sections={sections} hasCmsArticles={hasCmsArticles} />;
}

/* ── Bulletin broadsheet layout ──────────────────────── */

function BulletinSections({
  sections,
  hasCmsArticles,
}: Omit<SectionGridProps, 'variant'>) {
  return (
    <>
      {sections.map((group, groupIdx) => (
        <section key={group.section}>
          {/* Section header — broadsheet style */}
          <div className="flex items-center gap-4 mb-8">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-sm"
              style={{ background: 'hsl(var(--brand-accent) / 0.1)' }}
            >
              <span style={{ color: 'hsl(var(--brand-accent))' }}>
                {SECTION_ICONS[group.section]}
              </span>
              <span
                className="text-[9px] uppercase tracking-[0.22em] font-bold"
                style={{ color: 'hsl(var(--brand-accent))' }}
              >
                {group.section.charAt(0).toUpperCase() + group.section.slice(1)}
              </span>
            </div>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          {group.cats.map((catGroup, catIdx) => {
            const { catDef, items } = catGroup;

            return (
              <div key={catDef.key} className="mb-12">
                {/* Category heading */}
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="flex-shrink-0 w-1.5 h-5 rounded-full"
                    style={{ background: 'hsl(var(--brand-accent))' }}
                  />
                  <h3 className="font-[family-name:var(--font-display)] text-lg font-bold italic text-foreground">
                    {catDef.label}
                  </h3>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-[0.1em] font-semibold">
                    {items.length} {items.length === 1 ? 'piece' : 'pieces'}
                  </span>
                  <div className="flex-1 h-px bg-border/40" />
                </div>

                {/* Broadsheet-style editorial list */}
                <div className="space-y-5">
                  {items.map((item, itemIdx) => {
                    const isReal =
                      hasCmsArticles &&
                      (item as any).id &&
                      !(item as any).id.startsWith('bl');
                    const itemImageUrl =
                      (item as any).imageUrl ??
                      'https://images.pexels.com/photos/11341144/pexels-photo-11341144.jpeg?auto=compress&cs=tinysrgb&h=400&w=600';
                    const itemKey =
                      (item as any).id ?? `item-${groupIdx}-${catIdx}-${itemIdx}`;

                    const cardContent = (
                      <div className="group flex flex-col sm:flex-row gap-0 border border-border/50 rounded-sm overflow-hidden bg-card hover:border-primary/30 transition-colors">
                        {/* Sidebar image */}
                        <div className="relative sm:w-48 md:w-56 flex-shrink-0 h-44 sm:h-auto overflow-hidden">
                          <img
                            src={itemImageUrl}
                            alt={item.title}
                            crossOrigin="anonymous"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-foreground/50 via-transparent to-transparent sm:bg-gradient-to-r" />
                        </div>

                        {/* Body */}
                        <div className="flex flex-col justify-between p-5 flex-1 border-t sm:border-t-0 sm:border-l border-border/40">
                          <div>
                            {/* Top rule */}
                            <div
                              className="w-8 h-[2px] mb-3"
                              style={{ background: 'hsl(var(--brand-accent))' }}
                            />

                            <h4 className="font-[family-name:var(--font-display)] text-base md:text-lg font-bold italic text-foreground leading-snug mb-2 group-hover:opacity-85 transition-opacity line-clamp-2">
                              {item.title}
                            </h4>

                            {(item as any).summary && (
                              <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-3 mb-4">
                                {(item as any).summary}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                              <span className="font-medium">{item.author}</span>
                              {item.readingTime && (
                                <>
                                  <span className="opacity-30">·</span>
                                  <span className="flex items-center gap-1">
                                    <Clock size={9} />
                                    {item.readingTime} min
                                  </span>
                                </>
                              )}
                              {(item as any).edition && (
                                <>
                                  <span className="opacity-30">·</span>
                                  <span
                                    className="text-[9px] uppercase tracking-[0.1em] font-semibold"
                                    style={{ color: 'hsl(var(--brand-accent))' }}
                                  >
                                    {(item as any).edition}
                                  </span>
                                </>
                              )}
                            </div>
                            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                              Read <ArrowRight size={10} />
                            </span>
                          </div>
                        </div>
                      </div>
                    );

                    return (
                      <motion.div
                        key={itemKey}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: itemIdx * 0.05 + catIdx * 0.08,
                          duration: 0.22,
                          ease: 'easeOut',
                        }}
                      >
                        {isReal ? (
                          <Link
                            to={`/articles/${(item as any).id}`}
                            className="block"
                            aria-label={`Read: ${item.title}`}
                          >
                            {cardContent}
                          </Link>
                        ) : (
                          cardContent
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}

/* ── Newsletter card-grid layout ─────────────────────── */

function NewsletterSections({
  sections,
  hasCmsArticles,
}: Omit<SectionGridProps, 'variant'>) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  return (
    <>
      {sections.map((group, groupIdx) => (
        <section key={group.section}>
          {/* Section header */}
          <div className="flex items-center gap-4 mb-8">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-sm"
              style={{ background: 'hsl(var(--primary) / 0.08)' }}
            >
              <span className="text-primary">{SECTION_ICONS[group.section]}</span>
              <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-primary">
                {group.section.charAt(0).toUpperCase() + group.section.slice(1)}
              </span>
            </div>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          {group.cats.map((catGroup) => {
            const { catDef, items } = catGroup;
            const isExpanded = expandedSection === catDef.key || items.length <= 3;

            return (
              <div key={catDef.key} className="mb-10">
                {/* Category sub-header */}
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="flex-shrink-0 w-1 h-4 rounded-full"
                    style={{ background: 'hsl(var(--brand-accent))' }}
                  />
                  <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground">
                    {catDef.label}
                  </h3>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-[0.1em] font-semibold">
                    {items.length} {items.length === 1 ? 'story' : 'stories'}
                  </span>
                  <div className="flex-1 h-px bg-border/40" />
                  <Link
                    to={`/news?category=${catDef.key}`}
                    className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    News index <ChevronRight size={10} />
                  </Link>
                </div>

                {/* Articles grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {(isExpanded ? items : items.slice(0, 3)).map((item, itemIdx) => {
                    const isReal = hasCmsArticles && (item as any).id && !(item as any).id.startsWith('fb');
                    const itemImageUrl = (item as any).imageUrl ?? SECTION_IMAGES[catDef.section];

                    const cardContent = (
                      <div className="group border border-border/60 rounded-sm overflow-hidden bg-card hover:border-primary/30 transition-colors h-full flex flex-col">
                        {/* Card image */}
                        <div className="relative h-40 overflow-hidden flex-shrink-0">
                          <img
                            src={itemImageUrl}
                            alt={item.title}
                            crossOrigin="anonymous"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent" />
                          <span
                            className="absolute top-2.5 left-2.5 flex items-center gap-1 text-[8px] uppercase tracking-[0.16em] font-bold px-2 py-0.5"
                            style={{ background: 'hsl(var(--chart-1))', color: 'hsl(var(--primary-foreground))' }}
                          >
                            <Mail size={8} />
                            Newsletter
                          </span>
                        </div>

                        {/* Card body */}
                        <div className="p-4 flex flex-col flex-1">
                          <span
                            className="text-[9px] uppercase tracking-[0.14em] font-bold mb-2"
                            style={{ color: 'hsl(var(--brand-accent))' }}
                          >
                            {catDef.label}
                          </span>
                          <h4 className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground leading-snug line-clamp-2 mb-2 group-hover:opacity-[0.85] transition-opacity flex-1">
                            {item.title}
                          </h4>
                          {(item as any).summary && (
                            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                              {(item as any).summary}
                            </p>
                          )}
                          <div className="flex items-center justify-between mt-auto">
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span>{item.author}</span>
                              {item.readingTime && (
                                <>
                                  <span>·</span>
                                  <span className="flex items-center gap-0.5">
                                    <Clock size={9} />
                                    {item.readingTime}m
                                  </span>
                                </>
                              )}
                            </div>
                            <span className="text-[9px] uppercase tracking-[0.08em] font-semibold text-primary flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              Read <ArrowRight size={9} />
                            </span>
                          </div>
                        </div>
                      </div>
                    );

                    const itemKey = (item as any).id ?? `item-${groupIdx}-${itemIdx}`;

                    return (
                      <motion.div
                        key={itemKey}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: itemIdx * 0.04 + groupIdx * 0.05, duration: 0.22, ease: 'easeOut' }}
                      >
                        {isReal ? (
                          <Link
                            to={`/articles/${(item as any).id}`}
                            className="block h-full"
                            aria-label={`Read: ${item.title}`}
                          >
                            {cardContent}
                          </Link>
                        ) : (
                          cardContent
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                {/* Show more */}
                {items.length > 3 && !isExpanded && (
                  <div className="mt-4 text-center">
                    <button
                      onClick={() => setExpandedSection(catDef.key)}
                      className="text-[11px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 mx-auto"
                    >
                      Show {items.length - 3} more in {catDef.label}
                      <ChevronRight size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
