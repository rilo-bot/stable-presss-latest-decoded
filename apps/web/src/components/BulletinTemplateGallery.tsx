import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  BarChart2,
  Mic,
  Newspaper,
  Trophy,
  TrendingUp,
  Star,
  ChevronRight,
  Check,
  X,
  Eye,
  ArrowRight,
  Clock,
  Calendar,
  AlignLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ── Template catalogue ──────────────────────────────── */

export interface BulletinTemplate {
  id: string;
  name: string;
  category: string;
  section: 'news' | 'analysis' | 'interviews';
  description: string;
  tags: string[];
  icon: React.ReactNode;
  accentColor: string;
  edition: string;
  prefilledTitle: string;
  prefilledSummary: string;
  structure: string[];
  readingTimeHint: number;
  imageUrl: string;
}

export const BULLETIN_TEMPLATES: BulletinTemplate[] = [
  {
    id: 'tpl-lead-story',
    name: 'Lead Story',
    category: 'race-report',
    section: 'news',
    description:
      'The front-page headline piece — a major race report or breaking industry story designed to anchor the entire edition.',
    tags: ['Feature', 'Lead', 'Race Report'],
    icon: <Newspaper size={16} />,
    accentColor: 'hsl(var(--primary))',
    edition: 'Vol. 47 · Fortnightly',
    prefilledTitle: 'Race Day at [Venue]: A Full Report',
    prefilledSummary:
      'A comprehensive report on [race name], detailing the key performances, sectional splits, and post-race observations from trackside. This piece leads the bulletin edition.',
    structure: ['Opening Hook', 'Race Narrative', 'Winning Performance', 'Sectional Analysis', 'Trainer Comment', 'Outlook'],
    readingTimeHint: 10,
    imageUrl:
      'https://images.pexels.com/photos/27305774/pexels-photo-27305774.jpeg?auto=compress&cs=tinysrgb&h=400&w=600',
  },
  {
    id: 'tpl-trainer-profile',
    name: 'Trainer Profile',
    category: 'trainer-profiles',
    section: 'interviews',
    description:
      'An in-depth sit-down with a trainer — their philosophy, preparation methods, notable horses, and outlook on the season ahead.',
    tags: ['Profile', 'Interview', 'Long-form'],
    icon: <Star size={16} />,
    accentColor: 'hsl(var(--chart-2))',
    edition: 'Vol. 47 · Fortnightly',
    prefilledTitle: 'Trainer [Name]: [Number] Group Ones and the Season Ahead',
    prefilledSummary:
      "We sat down with [Trainer Name] at their [Location] stables for a conversation on patience, preparation, and what it takes to win at the highest level of thoroughbred racing.",
    structure: ['Introduction', 'Early Career', 'Training Philosophy', 'Standout Horses', 'Current Campaign', 'Looking Ahead'],
    readingTimeHint: 14,
    imageUrl:
      'https://images.pexels.com/photos/7882582/pexels-photo-7882582.jpeg?auto=compress&cs=tinysrgb&h=400&w=600',
  },
  {
    id: 'tpl-form-guide',
    name: 'Form Guide Deep-Dive',
    category: 'form-guide',
    section: 'analysis',
    description:
      'A data-led analysis of form, sectionals, and race-shape trends — the essential analytical piece for handicappers and punters.',
    tags: ['Analysis', 'Data', 'Form'],
    icon: <BarChart2 size={16} />,
    accentColor: 'hsl(var(--chart-3))',
    edition: 'Vol. 47 · Fortnightly',
    prefilledTitle: 'Sectional Intelligence: [Meeting Name] — Reading the Numbers',
    prefilledSummary:
      'Modern race timing has changed how we evaluate thoroughbred performance. In this deep-dive, our analysis team breaks down the final 400m splits and form cycles for the coming [meeting/carnival].',
    structure: ['Data Overview', 'Key Sectionals', 'Horses to Watch', 'Track Bias Notes', 'Conclusion'],
    readingTimeHint: 16,
    imageUrl:
      'https://images.pexels.com/photos/11341144/pexels-photo-11341144.jpeg?auto=compress&cs=tinysrgb&h=400&w=600',
  },
  {
    id: 'tpl-bloodstock',
    name: 'Bloodstock Report',
    category: 'bloodstock',
    section: 'analysis',
    description:
      'Covering yearling sales, sire updates, pedigree trends, and the movement of breeding stock across hemispheres.',
    tags: ['Bloodstock', 'Breeding', 'Sales'],
    icon: <TrendingUp size={16} />,
    accentColor: 'hsl(var(--chart-4))',
    edition: 'Vol. 47 · Fortnightly',
    prefilledTitle: '[Sale Name] Yearling Results: The Standout Lots and Sire Trends',
    prefilledSummary:
      'A data-driven review of the [sale name] yearling sale — analysing which sire lines dominated, what the prices signal about breeding priorities, and the horses to watch in coming seasons.',
    structure: ['Sale Overview', 'Top Lots', 'Sire Leaders', 'Emerging Trends', 'Editor Picks'],
    readingTimeHint: 12,
    imageUrl:
      'https://images.pexels.com/photos/18913040/pexels-photo-18913040.jpeg?auto=compress&cs=tinysrgb&h=400&w=600',
  },
  {
    id: 'tpl-owner-story',
    name: 'Owner Story',
    category: 'owner-stories',
    section: 'interviews',
    description:
      'A personal narrative from an owner or syndicate — the human side of the sport and what draws people into racing.',
    tags: ['Interview', 'Human Interest', 'Owner'],
    icon: <Mic size={16} />,
    accentColor: 'hsl(var(--brand-accent))',
    edition: 'Vol. 47 · Fortnightly',
    prefilledTitle: 'Why I Race: [Owner/Syndicate Name] in Their Own Words',
    prefilledSummary:
      'We speak to [Owner/Syndicate Name] about what drew them into thoroughbred racing, what ownership really looks like from the inside, and what they hope the future holds for their horses.',
    structure: ['Introduction', 'How They Got Started', 'The Horses They Love', 'What Ownership Means', 'Advice to Others'],
    readingTimeHint: 11,
    imageUrl:
      'https://images.pexels.com/photos/12995066/pexels-photo-12995066.jpeg?auto=compress&cs=tinysrgb&h=400&w=600',
  },
  {
    id: 'tpl-track-notes',
    name: 'Track Notes',
    category: 'track-notes',
    section: 'news',
    description:
      'Concise observations from trackwork — what the horses looked like in the morning, any notable gallops, and the conditions on the day.',
    tags: ['Track', 'Observations', 'Concise'],
    icon: <Clock size={16} />,
    accentColor: 'hsl(var(--chart-1))',
    edition: 'Vol. 47 · Fortnightly',
    prefilledTitle: 'Trackwork Notes: [Date] — [Venue] Morning Gallops',
    prefilledSummary:
      'Early morning at [venue]. Here are the standout gallops, the horses who caught the eye, and the conditions on the track ahead of [upcoming meeting].',
    structure: ['Conditions', 'Standout Gallops', 'Horse-by-Horse Notes', 'Trainer Quotes', 'What to Watch'],
    readingTimeHint: 7,
    imageUrl:
      'https://images.pexels.com/photos/11341144/pexels-photo-11341144.jpeg?auto=compress&cs=tinysrgb&h=400&w=600',
  },
  {
    id: 'tpl-group-one-preview',
    name: 'Group One Preview',
    category: 'race-report',
    section: 'analysis',
    description:
      'A pre-race preview of a Group One contest — field analysis, barrier draws, track conditions, and editorial selections.',
    tags: ['Preview', 'Group One', 'Selections'],
    icon: <Trophy size={16} />,
    accentColor: 'hsl(var(--primary))',
    edition: 'Vol. 47 · Fortnightly',
    prefilledTitle: '[Race Name] Preview: The Field, The Form, Our Selections',
    prefilledSummary:
      'With [race name] days away, our racing desk breaks down the full field — form, barrier draws, market watch, and the editorial selections we are standing behind.',
    structure: ['Race Overview', 'Field Assessment', 'Barrier Draw Impact', 'Market Watch', 'Editorial Selections', 'The Verdict'],
    readingTimeHint: 13,
    imageUrl:
      'https://images.pexels.com/photos/27305774/pexels-photo-27305774.jpeg?auto=compress&cs=tinysrgb&h=400&w=600',
  },
  {
    id: 'tpl-editorial-comment',
    name: 'Editorial Comment',
    category: 'news',
    section: 'news',
    description:
      'The masthead opinion piece — a considered view on a current issue in the industry, written in the Stable Press editorial voice.',
    tags: ['Opinion', 'Editorial', 'Comment'],
    icon: <AlignLeft size={16} />,
    accentColor: 'hsl(var(--primary))',
    edition: 'Vol. 47 · Fortnightly',
    prefilledTitle: 'Editorial: [Issue or Topic]',
    prefilledSummary:
      'The Stable Press editorial desk offers a considered view on [topic]. Here is where we stand, and why it matters for the industry.',
    structure: ['Context', 'The Issue', 'Our Position', 'Counter-Arguments Addressed', 'Conclusion'],
    readingTimeHint: 8,
    imageUrl:
      'https://images.pexels.com/photos/7882582/pexels-photo-7882582.jpeg?auto=compress&cs=tinysrgb&h=400&w=600',
  },
  {
    id: 'tpl-carnival-preview',
    name: 'Carnival Preview',
    category: 'race-report',
    section: 'news',
    description:
      'A full carnival or season preview — key races, horses to follow, trainer and jockey to watch, and the storylines to track.',
    tags: ['Preview', 'Carnival', 'Season'],
    icon: <Calendar size={16} />,
    accentColor: 'hsl(var(--chart-2))',
    edition: 'Vol. 47 · Fortnightly',
    prefilledTitle: '[Carnival Name] [Year]: Everything You Need to Know',
    prefilledSummary:
      'The [carnival name] is upon us. Here is the essential guide — the race schedule, the headline horses, the trainers shaping the carnival, and the storylines our desk will be following.',
    structure: ['Carnival Overview', 'Key Race Schedule', 'Horses to Follow', 'Trainers to Watch', 'Jockeys in Form', 'Our Verdict'],
    readingTimeHint: 15,
    imageUrl:
      'https://images.pexels.com/photos/12995066/pexels-photo-12995066.jpeg?auto=compress&cs=tinysrgb&h=400&w=600',
  },
];

/* ── Props ──────────────────────────────────────────── */

interface BulletinTemplateGalleryProps {
  onSelectTemplate: (template: BulletinTemplate) => void;
  onClose: () => void;
}

/* ── Component ────────────────────────────────────────── */

export function BulletinTemplateGallery({
  onSelectTemplate,
  onClose,
}: BulletinTemplateGalleryProps) {
  const [activeSection, setActiveSection] = useState<'all' | 'news' | 'analysis' | 'interviews'>('all');
  const [previewTemplate, setPreviewTemplate] = useState<BulletinTemplate | null>(null);

  const sections = [
    { key: 'all' as const, label: 'All Templates', count: BULLETIN_TEMPLATES.length },
    { key: 'news' as const, label: 'News', count: BULLETIN_TEMPLATES.filter((t) => t.section === 'news').length },
    { key: 'analysis' as const, label: 'Analysis', count: BULLETIN_TEMPLATES.filter((t) => t.section === 'analysis').length },
    { key: 'interviews' as const, label: 'Interviews', count: BULLETIN_TEMPLATES.filter((t) => t.section === 'interviews').length },
  ];

  const filtered =
    activeSection === 'all'
      ? BULLETIN_TEMPLATES
      : BULLETIN_TEMPLATES.filter((t) => t.section === activeSection);

  return (
    <div className="flex flex-col h-full">
      {/* ── Panel header ── */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b border-border/50 flex-shrink-0"
        style={{ background: 'hsl(var(--primary))' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-sm flex items-center justify-center"
            style={{ background: 'hsl(var(--brand-accent))' }}
          >
            <BookOpen size={16} style={{ color: 'hsl(var(--brand-accent-foreground))' }} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-primary-foreground/60">
              Stable Press CMS
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-primary-foreground leading-tight">
              Bulletin Template Gallery
            </h2>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-sm text-primary-foreground/50 hover:text-primary-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Close template gallery"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Section filter tabs ── */}
      <div className="flex items-center gap-0.5 px-6 pt-4 pb-0 border-b border-border/40 flex-shrink-0 overflow-x-auto">
        {sections.map((sec) => (
          <button
            key={sec.key}
            onClick={() => { setActiveSection(sec.key); setPreviewTemplate(null); }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-[11px] uppercase tracking-[0.1em] font-semibold border-b-2 transition-all whitespace-nowrap -mb-px',
              activeSection === sec.key
                ? 'text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
            )}
            aria-selected={activeSection === sec.key}
          >
            {sec.label}
            <span
              className={cn(
                'text-[9px] font-bold px-1.5 py-0.5 rounded-full tabular-nums',
                activeSection === sec.key
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {sec.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Body: grid + preview ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Template grid */}
        <div
          className={cn(
            'overflow-y-auto transition-all',
            previewTemplate ? 'w-full md:w-1/2 lg:w-[55%]' : 'w-full'
          )}
        >
          <div className="p-5">
            <p className="text-[11px] text-muted-foreground mb-4 leading-relaxed">
              Choose a template to pre-fill your bulletin with the right structure, category, and placeholder text.
              You can edit everything before publishing.
            </p>

            <div className={cn(
              'grid gap-3',
              previewTemplate
                ? 'grid-cols-1'
                : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
            )}>
              {filtered.map((tpl) => {
                const isSelected = previewTemplate?.id === tpl.id;
                return (
                  <motion.div
                    key={tpl.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <div
                      className={cn(
                        'group relative border rounded-sm overflow-hidden bg-card cursor-pointer transition-all hover:shadow-sm',
                        isSelected
                          ? 'border-primary shadow-sm'
                          : 'border-border/60 hover:border-primary/40'
                      )}
                      onClick={() => setPreviewTemplate(isSelected ? null : tpl)}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={`Select template: ${tpl.name}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setPreviewTemplate(isSelected ? null : tpl);
                        }
                      }}
                    >
                      {/* Top accent stripe */}
                      <div
                        className="h-[3px] w-full"
                        style={{ background: tpl.accentColor }}
                      />

                      {/* Thumbnail */}
                      <div className="relative h-28 overflow-hidden">
                        <img
                          src={tpl.imageUrl}
                          alt={tpl.name}
                          crossOrigin="anonymous"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent" />

                        {/* Section badge */}
                        <div className="absolute top-2 left-2">
                          <span
                            className="text-[8px] uppercase tracking-[0.18em] font-bold px-2 py-1"
                            style={{ background: tpl.accentColor, color: 'hsl(var(--primary-foreground))' }}
                          >
                            {tpl.section}
                          </span>
                        </div>

                        {/* Selected check */}
                        {isSelected && (
                          <div className="absolute top-2 right-2">
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                              <Check size={11} className="text-primary-foreground" />
                            </div>
                          </div>
                        )}

                        {/* Template name overlay */}
                        <div className="absolute bottom-0 left-0 right-0 px-3 py-2">
                          <p className="font-[family-name:var(--font-display)] text-sm font-bold text-primary-foreground leading-tight">
                            {tpl.name}
                          </p>
                        </div>
                      </div>

                      {/* Body */}
                      <div className="p-3">
                        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mb-2">
                          {tpl.description}
                        </p>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-1 mb-2">
                          {tpl.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[8px] uppercase tracking-[0.12em] font-bold px-1.5 py-0.5 rounded-sm border border-border/50 text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        {/* Footer row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock size={9} />
                            <span>~{tpl.readingTimeHint} min</span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                            <Eye size={9} />
                            Preview
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Preview panel */}
        <AnimatePresence>
          {previewTemplate && (
            <motion.div
              key={previewTemplate.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.22 }}
              className="hidden md:flex flex-col w-1/2 lg:w-[45%] border-l border-border/50 overflow-y-auto"
            >
              <div className="flex-shrink-0 border-b border-border/40 bg-card">
                <div className="relative h-40 overflow-hidden">
                  <img
                    src={previewTemplate.imageUrl}
                    alt={previewTemplate.name}
                    crossOrigin="anonymous"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <div
                      className="w-6 h-[2px] mb-2"
                      style={{ background: 'hsl(var(--brand-accent))' }}
                    />
                    <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-primary-foreground leading-tight">
                      {previewTemplate.name}
                    </h3>
                    <p className="text-[10px] text-primary-foreground/70 uppercase tracking-[0.12em] mt-0.5">
                      {previewTemplate.section} · {previewTemplate.edition}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 p-5 space-y-5">
                {/* Description */}
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-1.5">
                    About This Template
                  </p>
                  <p className="text-xs text-foreground leading-relaxed">
                    {previewTemplate.description}
                  </p>
                </div>

                {/* Pre-filled title */}
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-1.5">
                    Pre-filled Title
                  </p>
                  <div className="px-3 py-2 border border-primary/20 rounded-sm bg-primary/5">
                    <p className="text-xs font-[family-name:var(--font-display)] font-bold italic text-foreground leading-snug">
                      {previewTemplate.prefilledTitle}
                    </p>
                  </div>
                </div>

                {/* Pre-filled summary */}
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-1.5">
                    Pre-filled Summary
                  </p>
                  <div className="px-3 py-2 border border-border/50 rounded-sm bg-muted/20">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {previewTemplate.prefilledSummary}
                    </p>
                  </div>
                </div>

                {/* Article structure */}
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-2">
                    Article Structure
                  </p>
                  <div className="space-y-1.5">
                    {previewTemplate.structure.map((section, idx) => (
                      <div key={section} className="flex items-center gap-2.5">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-primary-foreground flex-shrink-0"
                          style={{ background: previewTemplate.accentColor }}
                        >
                          {idx + 1}
                        </div>
                        <span className="text-xs text-foreground font-medium">{section}</span>
                        {idx < previewTemplate.structure.length - 1 && (
                          <div className="flex-1 h-px border-b border-dashed border-border/40" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick facts */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Category', value: previewTemplate.category.replace(/-/g, ' ') },
                    { label: 'Section', value: previewTemplate.section },
                    { label: 'Read Time', value: `~${previewTemplate.readingTimeHint} min` },
                    { label: 'Edition', value: previewTemplate.edition },
                  ].map((fact) => (
                    <div key={fact.label} className="p-2.5 border border-border/50 rounded-sm bg-card">
                      <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-semibold mb-0.5">
                        {fact.label}
                      </p>
                      <p className="text-xs font-semibold text-foreground capitalize">
                        {fact.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <Button
                  className="w-full gap-2 text-sm font-semibold"
                  style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
                  onClick={() => onSelectTemplate(previewTemplate)}
                >
                  Use This Template
                  <ArrowRight size={14} />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Mobile: select CTA when preview is active ── */}
      {previewTemplate && (
        <div className="md:hidden flex-shrink-0 border-t border-border/50 p-4 bg-card">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{previewTemplate.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {previewTemplate.section} · ~{previewTemplate.readingTimeHint} min
              </p>
            </div>
            <Button
              size="sm"
              className="gap-1.5 text-xs flex-shrink-0"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
              onClick={() => onSelectTemplate(previewTemplate)}
            >
              Use Template
              <ArrowRight size={11} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
