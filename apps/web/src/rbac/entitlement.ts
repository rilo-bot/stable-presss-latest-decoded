/**
 * RBAC — entitlement (the "what you've paid for" axis).
 *
 * Orthogonal to roles: a subscription tier gates premium/gated CONTENT only and
 * never grants any racing/editorial data access. See RBAC.md §2 and §8.
 */

export type SubscriptionTier = 'free' | 'standard' | 'premium';

/** Ascending order — index = privilege level. */
export const TIER_ORDER: SubscriptionTier[] = ['free', 'standard', 'premium'];

export const DEFAULT_TIER: SubscriptionTier = 'free';

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: 'Free',
  standard: 'Standard',
  premium: 'Premium',
};

/** True when `have` meets or exceeds `need`. */
export function tierAtLeast(
  have: SubscriptionTier | undefined,
  need: SubscriptionTier,
): boolean {
  return TIER_ORDER.indexOf(have ?? 'free') >= TIER_ORDER.indexOf(need);
}

/** Gate a piece of content by its minimum tier (defaults to free = ungated). */
export function canViewContent(
  have: SubscriptionTier | undefined,
  minTier: SubscriptionTier | undefined,
): boolean {
  return tierAtLeast(have, minTier ?? 'free');
}
