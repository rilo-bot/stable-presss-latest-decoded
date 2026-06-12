import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { useFollowStore, followerCount } from '@/stores/followStore';

const serif: React.CSSProperties = { fontFamily: "'IM Fell English', 'Palatino Linotype', Georgia, serif" };

/**
 * Gamified "Follow This Horse" CTA — gold pill with a live follower count and a
 * heart pop. Persists via followStore. Reusable for future entity pages.
 */
export function FollowButton({ horseId, label = 'Follow This Horse' }: { horseId: string; label?: string }) {
  const following = useFollowStore((s) => s.followedHorseIds.includes(horseId));
  const toggle = useFollowStore((s) => s.toggleFollow);
  const count = followerCount(horseId, following);

  const onClick = () => {
    toggle(horseId);
    toast.success(following ? 'Removed from your stable' : 'Added to your stable — you are now following');
  };

  return (
    <button
      onClick={onClick}
      aria-pressed={following}
      className="sku-gold-btn"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 16px',
        cursor: 'pointer', ...serif,
        background: following
          ? 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-deep) 100%)'
          : undefined,
        border: following ? '1px solid var(--gold-mid)' : undefined,
      }}
    >
      <motion.span
        key={following ? 'on' : 'off'}
        initial={{ scale: 0.6 }}
        animate={{ scale: [1.4, 1] }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        style={{ display: 'inline-flex' }}
      >
        <Heart
          size={13}
          strokeWidth={2}
          style={{ color: following ? 'var(--gold-bright)' : 'var(--forest-deep)' }}
          fill={following ? 'var(--gold-bright)' : 'none'}
        />
      </motion.span>
      <span style={{
        fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700,
        color: following ? 'var(--gold-bright)' : 'var(--forest-deep)',
      }}>
        {following ? 'Following' : label}
      </span>
      <span style={{
        fontSize: '0.6rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10,
        background: following ? 'var(--gold-mid)' : 'rgba(0,0,0,0.18)',
        color: following ? 'var(--forest-deep)' : 'var(--forest-deep)',
      }}>
        {count.toLocaleString('en-AU')}
      </span>
    </button>
  );
}
