import { Link } from 'react-router-dom';
import { ChevronRight, MapPin, Ruler, Users } from 'lucide-react';
import type { Race } from '@/types/tip';

interface LandingRacesProps {
  races: Race[];
}

function fmtRaceTime(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { day: '', time: '' };
  return {
    day: d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }),
  };
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Tipping open',
  upcoming: 'Upcoming',
  closed: 'Closed',
  resolved: 'Resolved',
};

/**
 * Full-width "On the Card" band — the next races drawn live from the tipping
 * ring. Renders nothing when there are no races to show, so the landing page
 * never carries an empty shell.
 */
export function LandingRaces({ races }: LandingRacesProps) {
  if (races.length === 0) return null;

  return (
    <section
      className="border-y border-border"
      style={{ background: 'hsl(var(--brand-accent) / 0.04)' }}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-9">
        <div className="flex items-center gap-4 mb-6">
          <div
            className="flex-shrink-0 w-1 h-5 rounded-full"
            style={{ background: 'hsl(var(--brand-accent))' }}
          />
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground whitespace-nowrap">
            On the Card
          </h2>
          <div className="flex-1 h-px bg-border/50" />
          <Link
            to="/tipping"
            className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            Tipping ring <ChevronRight size={11} />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {races.map((race) => {
            const { day, time } = fmtRaceTime(race.scheduledAt);
            const isOpen = race.status === 'open';
            return (
              <Link
                key={race.id}
                to="/tipping"
                className="group relative flex flex-col gap-3 p-4 rounded-sm border border-border/60 bg-card hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-[9px] uppercase tracking-[0.16em] font-bold px-2 py-0.5 rounded-sm"
                    style={{
                      background: isOpen ? 'hsl(var(--brand-accent))' : 'hsl(var(--muted))',
                      color: isOpen
                        ? 'hsl(var(--brand-accent-foreground))'
                        : 'hsl(var(--muted-foreground))',
                    }}
                  >
                    {STATUS_LABEL[race.status] ?? race.status}
                  </span>
                  {(day || time) && (
                    <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                      {day}
                      {time && ` · ${time}`}
                    </span>
                  )}
                </div>

                <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground leading-snug line-clamp-2 group-hover:text-[hsl(var(--brand-accent))] transition-colors">
                  {race.name}
                </h3>

                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  {race.venue && (
                    <span className="flex items-center gap-1">
                      <MapPin size={11} /> {race.venue}
                    </span>
                  )}
                  {race.distance && (
                    <span className="flex items-center gap-1">
                      <Ruler size={11} /> {race.distance}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users size={11} /> {race.entrants.length} runners
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
