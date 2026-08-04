/**
 * ONE section header for the whole front page.
 *
 * There were two patterns in use on the same page at the same visual level:
 * "Featured Analysis", "Top of the Ring", "On the Card" and "Print Bulletins"
 * carried a gold bar before the title; "Latest Dispatches" and "Form the Stables"
 * did not. Some had an "All X →" link on the right, some did not. Nothing chose
 * between them — they were written at different times.
 *
 * Every section on the landing page uses this, so the rule is the rule.
 */
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

interface SectionHeadProps {
  title: string;
  /** Optional "all of these" destination, shown on the right. */
  to?: string;
  linkLabel?: string;
}

export function SectionHead({ title, to, linkLabel }: SectionHeadProps) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <div
        className="flex-shrink-0 w-1 h-5 rounded-full"
        style={{ background: 'hsl(var(--brand-accent))' }}
      />
      <h2 className="font-[family-name:var(--font-display)] text-xl md:text-2xl font-bold text-foreground whitespace-nowrap">
        {title}
      </h2>
      <div className="flex-1 h-px bg-border/50" />
      {to && (
        /* 12px sentence case. These were 10px uppercase at 0.1em tracking — a
           navigational link smaller than every caption around it. */
        <Link
          to={to}
          className="flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          {linkLabel ?? `All ${title.toLowerCase()}`} <ChevronRight size={13} />
        </Link>
      )}
    </div>
  );
}
