import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { TIER_LABELS } from '@/rbac/entitlement';
import type { SubscriptionTier } from '@/rbac/entitlement';
import { useAuthStore } from '@/stores/authStore';

/**
 * Shown in place of gated content when the viewer's tier is below `requiredTier`.
 * Entitlement gate only — never about roles. See RBAC.md §8.
 */
export function Paywall({ requiredTier }: { requiredTier: SubscriptionTier }) {
  const currentUser = useAuthStore((s) => s.currentUser);
  return (
    <div className="my-8 border border-dashed border-border rounded-sm bg-muted/30 px-6 py-12 text-center">
      <div
        className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4"
        style={{ background: 'hsl(var(--brand-accent) / 0.14)', color: 'hsl(var(--brand-accent))' }}
      >
        <Lock size={20} />
      </div>
      <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground mb-2">
        A {TIER_LABELS[requiredTier]} membership is required
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
        The rest of this piece is reserved for {TIER_LABELS[requiredTier]} members.
        {' '}
        {currentUser ? 'Upgrade your plan to keep reading.' : 'Sign in and upgrade to keep reading.'}
      </p>
      <Link
        to={currentUser ? '/dashboard' : '/login'}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-sm hover:bg-primary/90 transition-colors"
      >
        {currentUser ? 'Upgrade your plan' : 'Sign in'}
      </Link>
    </div>
  );
}
