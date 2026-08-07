/**
 * "The Directory" — a few verified figures from the industry register.
 *
 * NEW, and it exists because /parties was a public route in no navigation menu on
 * either breakpoint: reachable only by typing the URL. It is in the nav now, and
 * this is its way in from the front page.
 *
 * VERIFIED ONLY. `routes/parties.ts` already withholds unverified people from
 * non-staff callers, but a staff member browsing the public front page holds an
 * account that sees everything — so the filter is repeated here rather than
 * trusted from the response. The front page must show the same directory to
 * everyone.
 *
 * Renders nothing when there is nobody to show.
 */
import { Link } from 'react-router-dom';
import { MapPin, User } from 'lucide-react';
import { PARTY_ROLE_LABELS } from '@/types/party';
import { SectionHead } from './SectionHead';
import type { RegisterPerson } from '@/lib/register';

interface LandingDirectoryProps {
  parties: RegisterPerson[];
}

export function LandingDirectory({ parties }: LandingDirectoryProps) {
  // Everyone in the register is public — there is no verified/unverified split
  // any more. Show the people who actually fill a role, so the directory can't
  // lead with a bare name that has nothing behind it.
  const verified = parties.filter((p) => p.roles.length > 0).slice(0, 4);
  if (verified.length === 0) return null;

  return (
    <section>
      <SectionHead title="The Directory" to="/parties" linkLabel="Full directory" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {verified.map((party) => (
          <Link
            key={party.id}
            to={`/parties/${party.id}`}
            className="group flex flex-col rounded-sm border border-border/60 bg-card overflow-hidden hover:border-primary/40 transition-colors"
          >
            <div className="relative h-28 bg-muted/30 flex items-center justify-center overflow-hidden">
              {party.imageUrl ? (
                <img
                  src={party.imageUrl}
                  alt={party.name}
                  crossOrigin="anonymous"
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                />
              ) : (
                /* No stand-in portrait. The same rule as HorseCard: a photograph of
                   somebody else is worse than an empty frame. */
                <User size={26} strokeWidth={1.25} className="text-muted-foreground/30" />
              )}
            </div>
            <div className="p-3 flex-1">
              <h3 className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground leading-tight line-clamp-1">
                {party.name}
              </h3>
              {(party.roles ?? []).length > 0 && (
                <p
                  className="text-[11px] font-semibold mt-0.5"
                  style={{ color: 'hsl(var(--brand-accent-ink))' }}
                >
                  {(party.roles ?? []).map((r) => PARTY_ROLE_LABELS[r]).join(' · ')}
                </p>
              )}
              {party.baseLocation && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin size={10} className="flex-shrink-0" />
                  <span className="truncate">{party.baseLocation}</span>
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
