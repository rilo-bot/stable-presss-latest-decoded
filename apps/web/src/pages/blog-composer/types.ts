/**
 * Local aliases for the composer panels.
 *
 * Re-exported rather than imported straight from `@/types/blog` and
 * `@/rbac/entitlement` so the panel components have one place to look, and so a
 * later change to either source is a single-line edit here.
 */
import type { CoverTreatment } from '@/types/blog';
import type { SubscriptionTier } from '@/rbac/entitlement';

export type { CoverTreatment };

/** The tier axis as the settings panel uses it. */
export type SubscriptionTierLike = SubscriptionTier;
