import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RACE_VENUES } from './constants';

/**
 * Race venue selector + Google Maps embed. Extracted verbatim from the
 * Bulletins page; manages its own selected-venue state.
 */
export default function VenueMap() {
  const [selectedVenueIdx, setSelectedVenueIdx] = useState(0);

  const selectedVenue = RACE_VENUES[selectedVenueIdx];
  const mapSearchQuery = encodeURIComponent(selectedVenue.location);

  return (
    <div className="border-t border-border/40" style={{ background: 'hsl(var(--primary) / 0.04)' }}>
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 md:py-16">
        {/* Section header */}
        <div className="flex items-center gap-4 mb-8">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-sm"
            style={{ background: 'hsl(var(--brand-accent) / 0.12)' }}
          >
            <MapPin size={13} style={{ color: 'hsl(var(--brand-accent))' }} />
            <span
              className="text-[9px] uppercase tracking-[0.22em] font-bold"
              style={{ color: 'hsl(var(--brand-accent))' }}
            >
              Race Venues
            </span>
          </div>
          <div className="flex-1 h-px bg-border/50" />
          <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground font-semibold hidden sm:block">
            Featured in this edition
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Venue selector */}
          <div className="lg:col-span-1 space-y-2">
            <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-4">
              Select a venue to explore
            </p>
            {RACE_VENUES.map((venue, idx) => (
              <button
                key={venue.name}
                onClick={() => setSelectedVenueIdx(idx)}
                className={cn(
                  'w-full text-left flex items-start gap-3 px-4 py-3 rounded-sm border transition-all',
                  selectedVenueIdx === idx
                    ? 'border-transparent text-primary-foreground'
                    : 'border-border/50 bg-card text-foreground hover:border-primary/30 hover:bg-primary/5'
                )}
                style={
                  selectedVenueIdx === idx
                    ? { background: 'hsl(var(--primary))' }
                    : undefined
                }
                aria-label={`View map for ${venue.name}`}
              >
                <MapPin
                  size={14}
                  className="mt-0.5 flex-shrink-0"
                  style={
                    selectedVenueIdx === idx
                      ? { color: 'hsl(var(--brand-accent))' }
                      : { color: 'hsl(var(--brand-accent))' }
                  }
                />
                <div>
                  <span className="block text-[12px] font-semibold leading-tight">
                    {venue.name}
                  </span>
                  <span
                    className={cn(
                      'block text-[10px] mt-0.5',
                      selectedVenueIdx === idx
                        ? 'text-primary-foreground/70'
                        : 'text-muted-foreground'
                    )}
                  >
                    {venue.location}
                  </span>
                </div>
              </button>
            ))}

            {/* Open in Google Maps link */}
            <a
              href={`https://www.google.com/maps/search/${mapSearchQuery}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm text-[11px] font-semibold uppercase tracking-[0.1em] border border-border/60 bg-card text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all"
              aria-label={`Open ${selectedVenue.name} in Google Maps`}
            >
              <MapPin size={12} className="text-primary" />
              Open in Google Maps
            </a>
          </div>

          {/* Map embed */}
          <div className="lg:col-span-2">
            <div className="relative rounded-sm overflow-hidden border border-border/50 shadow-sm" style={{ height: '420px' }}>
              {/* Broadsheet accent bar */}
              <div
                className="absolute top-0 left-0 right-0 z-10 h-[3px]"
                style={{ background: 'hsl(var(--brand-accent))' }}
              />

              <iframe
                key={selectedVenueIdx}
                title={`Map of ${selectedVenue.name}`}
                src={`https://maps.google.com/maps?q=${mapSearchQuery}&output=embed&z=15`}
                width="100%"
                height="100%"
                style={{ border: 0, display: 'block' }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                aria-label={`Google Map showing ${selectedVenue.name} at ${selectedVenue.location}`}
              />

              {/* Venue label overlay */}
              <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 px-3 py-2 rounded-sm backdrop-blur-sm"
                style={{ background: 'hsl(var(--primary) / 0.92)' }}
              >
                <MapPin size={12} style={{ color: 'hsl(var(--brand-accent))' }} />
                <div>
                  <span className="block text-[11px] font-bold text-primary-foreground leading-tight">
                    {selectedVenue.name}
                  </span>
                  <span className="block text-[9px] text-primary-foreground/70 uppercase tracking-[0.1em]">
                    {selectedVenue.location}
                  </span>
                </div>
              </div>
            </div>

            {/* Attribution */}
            <p className="text-[9px] text-muted-foreground/60 mt-2 text-right tracking-wide uppercase">
              Map data © Google Maps
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
