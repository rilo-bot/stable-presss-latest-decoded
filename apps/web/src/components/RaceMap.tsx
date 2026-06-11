import { useState, useMemo } from 'react';
import { MapPin, ExternalLink, Navigation } from 'lucide-react';
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

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-primary/15 text-primary',
  upcoming: 'bg-muted text-muted-foreground',
  resolved: 'text-[hsl(var(--brand-accent))] bg-[hsl(var(--brand-accent)/0.12)]',
  closed: 'bg-muted text-muted-foreground',
};

function buildGoogleMapsLink(venue: string, lat?: number | null, lng?: number | null): string {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}&center=${lat},${lng}&zoom=15`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
}

function buildStaticMapUrl(lat: number, lng: number): string {
  // Uses OpenStreetMap tile as a static visual — no API key required
  // We compose a simple tile-based preview using a known OSM tile URL
  // Note: this is just a decorative background; the real link goes to google.com/maps
  const zoom = 14;
  const tileX = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  const tileY = Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
  return `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`;
}

export function RaceMap({ races }: RaceMapProps) {
  const racesWithCoords = useMemo(
    () => races.filter((r) => r.lat != null && r.lng != null),
    [races]
  );

  // Include all races for the venue list, even without coords
  const allRaces = races;

  const [selectedId, setSelectedId] = useState<string>(
    (racesWithCoords[0] ?? allRaces[0])?.id ?? ''
  );

  const selectedRace = useMemo(
    () => allRaces.find((r) => r.id === selectedId) ?? allRaces[0],
    [allRaces, selectedId]
  );

  if (allRaces.length === 0) return null;

  const mapsLink = selectedRace
    ? buildGoogleMapsLink(selectedRace.venue, selectedRace.lat, selectedRace.lng)
    : '#';

  const hasCoords =
    selectedRace?.lat != null && selectedRace?.lng != null;

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
        {allRaces.map((race) => (
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

      {/* Map panel */}
      {selectedRace && (
        <div className="relative" style={{ minHeight: '320px' }}>
          {/* Map visual background */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ background: 'hsl(var(--muted) / 0.6)' }}
          >
            {/* OSM tile background (decorative) */}
            {hasCoords && (
              <img
                src={buildStaticMapUrl(selectedRace.lat!, selectedRace.lng!)}
                alt=""
                aria-hidden="true"
                crossOrigin="anonymous"
                className="w-full h-full object-cover opacity-30 blur-sm scale-110"
                style={{ imageRendering: 'pixelated' }}
              />
            )}
            {/* Grid overlay for map aesthetic */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(hsl(var(--border)/0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)/0.4) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
          </div>

          {/* Centre card — venue details + CTA */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full py-12 px-6 text-center gap-5">
            {/* Pin marker */}
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-2 border-primary"
              style={{ background: 'hsl(var(--background))' }}
            >
              <MapPin size={22} className="text-primary" />
            </div>

            {/* Venue info */}
            <div>
              <p className="font-[family-name:var(--font-display)] font-bold text-xl text-foreground leading-snug">
                {selectedRace.venue}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedRace.name}
                {selectedRace.distance ? ` · ${selectedRace.distance}` : ''}
              </p>
              {hasCoords && (
                <p className="text-[11px] text-muted-foreground/70 mt-1 font-mono">
                  {selectedRace.lat!.toFixed(4)}, {selectedRace.lng!.toFixed(4)}
                </p>
              )}
            </div>

            {/* Status badge */}
            <span
              className={cn(
                'px-3 py-1 rounded-sm text-[11px] font-semibold uppercase tracking-[0.08em]',
                STATUS_COLORS[selectedRace.status] ?? 'bg-muted text-muted-foreground'
              )}
            >
              {STATUS_LABEL[selectedRace.status] ?? selectedRace.status}
            </span>

            {/* Google Maps CTA */}
            <a
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center gap-2 px-5 py-2.5 rounded-sm font-semibold text-sm transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
              )}
              aria-label={`View ${selectedRace.venue} on Google Maps`}
            >
              <Navigation size={14} />
              View on Google Maps
              <ExternalLink size={12} className="opacity-70" />
            </a>

            <p className="text-[10px] text-muted-foreground/60 italic">
              Opens google.com/maps in a new tab
            </p>
          </div>
        </div>
      )}

      {/* Footer — quick-glance venue list */}
      <div className="px-5 py-3 border-t border-border/60 bg-muted/20">
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {allRaces.map((race) => (
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
