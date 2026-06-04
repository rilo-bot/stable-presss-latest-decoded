import { useState, useMemo } from 'react';
import { MapPin, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Race } from '@/types/tip';

interface RaceMapProps {
  races: Race[];
}

const STATUS_DOT: Record<string, string> = {
  open: 'bg-primary',
  upcoming: 'bg-muted-foreground',
  resolved: 'bg-[hsl(var(--brand-accent))]',
  closed: 'bg-muted-foreground',
};

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  upcoming: 'Upcoming',
  resolved: 'Resolved',
  closed: 'Closed',
};

function buildGoogleMapsEmbedUrl(venue: string, lat: number, lng: number): string {
  // Uses the place embed which doesn't require an API key
  const q = encodeURIComponent(`${venue} ${lat},${lng}`);
  return `https://maps.google.com/maps?q=${q}&t=m&z=15&ie=UTF8&iwloc=B&output=embed`;
}

function buildGoogleMapsLink(venue: string, lat: number, lng: number): string {
  const q = encodeURIComponent(`${venue}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=`;
}

export function RaceMap({ races }: RaceMapProps) {
  const racesWithCoords = useMemo(
    () => races.filter((r) => r.lat != null && r.lng != null),
    [races]
  );

  const [selectedId, setSelectedId] = useState<string>(
    racesWithCoords[0]?.id ?? ''
  );

  const selectedRace = useMemo(
    () => racesWithCoords.find((r) => r.id === selectedId) ?? racesWithCoords[0],
    [racesWithCoords, selectedId]
  );

  if (racesWithCoords.length === 0) return null;

  const embedUrl = selectedRace
    ? buildGoogleMapsEmbedUrl(selectedRace.venue, selectedRace.lat!, selectedRace.lng!)
    : '';

  const mapsLink = selectedRace
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedRace.venue)}`
    : '#';

  return (
    <div className="border border-border rounded-sm overflow-hidden bg-card">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPin size={15} className="text-primary" />
          <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground">
            Race Venues
          </h3>
        </div>
        {selectedRace && (
          <a
            href={mapsLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground hover:text-primary transition-colors"
            aria-label={`Open ${selectedRace.venue} in Google Maps`}
          >
            <ExternalLink size={11} />
            Open in Maps
          </a>
        )}
      </div>

      {/* Venue selector tabs */}
      <div className="flex overflow-x-auto border-b border-border/60 bg-muted/30">
        {racesWithCoords.map((race) => (
          <button
            key={race.id}
            onClick={() => setSelectedId(race.id)}
            className={cn(
              'flex-shrink-0 flex flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selectedId === race.id
                ? 'border-primary bg-background text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
            aria-pressed={selectedId === race.id}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full flex-shrink-0',
                  STATUS_DOT[race.status] ?? 'bg-muted-foreground'
                )}
              />
              <span className="text-xs font-semibold whitespace-nowrap">{race.name}</span>
            </div>
            <span className="text-[10px] text-muted-foreground pl-3 whitespace-nowrap">
              {race.venue}
            </span>
          </button>
        ))}
      </div>

      {/* Map embed */}
      {selectedRace && (
        <div className="relative">
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 pointer-events-none">
            <div className="px-2.5 py-1.5 bg-card/95 backdrop-blur-sm border border-border rounded-sm shadow-sm">
              <p className="font-[family-name:var(--font-display)] font-bold text-xs text-foreground leading-snug">
                {selectedRace.name}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {selectedRace.venue} · {selectedRace.distance}
              </p>
            </div>
            <div
              className={cn(
                'self-start px-2 py-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-[0.07em]',
                selectedRace.status === 'open'
                  ? 'bg-primary/15 text-primary'
                  : selectedRace.status === 'resolved'
                  ? 'text-[hsl(var(--brand-accent))]'
                  : 'bg-muted text-muted-foreground',
                selectedRace.status === 'resolved' && 'bg-[hsl(var(--brand-accent)/0.15)]'
              )}
            >
              {STATUS_LABEL[selectedRace.status] ?? selectedRace.status}
            </div>
          </div>

          <iframe
            key={selectedRace.id}
            title={`Map of ${selectedRace.venue}`}
            src={embedUrl}
            width="100%"
            height="360"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="block border-0 w-full"
            style={{ height: '360px' }}
            aria-label={`Google Maps showing ${selectedRace.venue}`}
          />
        </div>
      )}

      {/* Footer — quick-glance venue list */}
      <div className="px-5 py-3 border-t border-border/60 bg-muted/20">
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {racesWithCoords.map((race) => (
            <button
              key={race.id}
              onClick={() => setSelectedId(race.id)}
              className={cn(
                'flex items-center gap-1.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded',
                selectedId === race.id
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <MapPin size={10} />
              {race.venue}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
