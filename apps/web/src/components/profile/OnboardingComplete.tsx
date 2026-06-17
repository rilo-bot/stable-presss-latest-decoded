/**
 * OnboardingComplete — the reward shown in place of the OnboardingSteps stepper
 * once every onboarding step is done (edit mode only). A small celebratory burst
 * (framer-motion, index-driven delays — no random/Date) + a primary "View public
 * page" button that takes the owner to the read-only public profile. Closes the
 * gamification loop the stepper opens.
 */
import { motion } from 'framer-motion';
import { PartyPopper, ArrowRight } from 'lucide-react';
import { serifStyle, displayStyle, goldStyle } from '@/components/profile/kit';

const BURST = [0, 1, 2, 3, 4, 5, 6, 7]; // index-driven confetti dots (no randomness)

export function OnboardingComplete({ title, subtitle, onViewPublic }: {
  title: string;
  subtitle: string;
  onViewPublic: () => void;
}) {
  return (
    <div className="sku-gold-card" style={{ ...serifStyle, overflow: 'hidden', position: 'relative' }}>
      {/* Confetti burst */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {BURST.map((i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 8, scale: 0.4 }}
            animate={{ opacity: [0, 1, 0], y: [-4, -34], scale: [0.4, 1, 0.7] }}
            transition={{ duration: 1.1, delay: i * 0.07, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: 14,
              left: `${8 + i * 11}%`,
              width: 7,
              height: 7,
              borderRadius: i % 2 === 0 ? '50%' : 2,
              background: i % 3 === 0 ? 'var(--gold-bright)' : i % 3 === 1 ? 'var(--gold-mid)' : 'var(--forest-light)',
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="sku-parchment"
        style={{ padding: '18px 16px', display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}
      >
        <motion.span
          initial={{ scale: 0, rotate: -25 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
          style={{ flexShrink: 0, width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, var(--gold-bright), var(--gold-mid))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.35)' }}
        >
          <PartyPopper size={22} style={{ color: 'var(--forest-deep)' }} />
        </motion.span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...displayStyle, fontSize: '1rem', fontWeight: 700, color: 'var(--forest-deep)' }}>{title}</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--forest-mid)', fontStyle: 'italic', marginTop: 1 }}>{subtitle}</div>
        </div>

        <button
          type="button"
          onClick={onViewPublic}
          className="sku-gold-btn"
          style={{ flexShrink: 0, padding: '7px 13px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', ...goldStyle, color: 'var(--forest-deep)', ...serifStyle }}
        >
          View public page <ArrowRight size={12} />
        </button>
      </motion.div>
    </div>
  );
}
