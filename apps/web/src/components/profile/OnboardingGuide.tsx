/**
 * OnboardingGuide — "the Stablehand": a floating, gamified guide character that
 * lives bottom-left during onboarding. It:
 *   - bobs idly and hops to celebrate each step,
 *   - shows a speech bubble for the current step (what to do + tips + Show me),
 *   - draws a dashed pointer arrow to the glowing active section (a direction
 *     nudge + Show me when that section is off-screen),
 *   - expands into a chat popover that IS the Stable Studio assistant (replies
 *     appear as the character's bubbles, with the same staged Apply/Discard).
 *
 * It is the single chat surface DURING onboarding (the right-side ProfileAgentPanel
 * drawer is mounted only after completion), so only one chat session is ever live.
 * Reuses useProfileChatSession + the shared profile-agent store/proposals.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles, Send, Square, ArrowRight, ArrowUp, ArrowDown, X, Check, Undo2, MessageCircle, UserPlus, PenLine, SkipForward } from 'lucide-react';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { useProfileAgentUi, type Proposal } from '@/stores/profileAgentUiStore';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';
import { PARTY_ROLE_LABELS } from '@/types/party';
import { useProfileChatSession, messageText } from '@/agent/profile/useProfileChatSession';
import { applyProposal, discardProposal, applyAllProposals, discardAllProposals, undoLastProposal } from '@/agent/profile/applyProposals';
import { serifStyle, displayStyle } from '@/components/profile/kit';

const MASCOT = '🐎'; // the Stablehand — swap for a custom illustration later

export interface GuideStep {
  key: string;
  label: string;
  title: string;
  tips?: string[];
  /** Action target for "Show me" (DOM id, or `module:<key>`). */
  anchorId?: string;
  /** DOM id the pointer arrow aims at (defaults to anchorId when it's a real id). */
  pointerId?: string;
  done: boolean;
}

/* ── staged proposal card (compact; mirrors the drawer) ── */
function ProposalCard({ p }: { p: Proposal }) {
  return (
    <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-200">
          {p.kind === 'field' ? <PenLine size={11} /> : <UserPlus size={11} />}
          {p.kind === 'field' ? p.field : `${PARTY_ROLE_LABELS[p.role] ?? p.role}`}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => void applyProposal(p)} className="flex items-center gap-1 rounded-sm bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-600"><Check size={10} /> Apply</button>
          <button onClick={() => discardProposal(p.id)} className="flex items-center gap-1 rounded-sm border border-white/15 px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/10"><X size={10} /></button>
        </div>
      </div>
      <div className="text-[11px] leading-snug text-white/80">
        {p.kind === 'field'
          ? <><span className="text-white/45">set to </span>“{p.value || '(empty)'}”</>
          : <>{p.partyName}<span className="text-white/45">{' · '}{p.startYear || '—'}{p.present ? '–present' : p.endYear ? `–${p.endYear}` : ''}</span></>}
      </div>
    </div>
  );
}

export function OnboardingGuide({ steps, name, onShowMe, onAskStep, onSkipStep }: {
  steps: GuideStep[];
  name: string;
  onShowMe: (anchorId?: string) => void;
  onAskStep: (step: GuideStep) => void;
  /** Skip the current step (optional — when wired, a Skip button appears). */
  onSkipStep?: (step: GuideStep) => void;
}) {
  const reduce = useReducedMotion();
  const open = useProfileAgentUi((s) => s.open);
  const setOpen = useProfileAgentUi((s) => s.setOpen);
  const ctx = useProfileAgentUi((s) => s.context);
  const staged = useProfileAgentUi((s) => s.staged);
  const undoCount = useProfileAgentUi((s) => s.undo.length);
  const pendingPrompt = useProfileAgentUi((s) => s.pendingPrompt);

  const { messages, sendMessage, status, error, stop } = useProfileChatSession();
  const busy = status === 'submitted' || status === 'streaming';

  const [input, setInput] = useState('');
  const [bubbleOpen, setBubbleOpen] = useState(true);
  const [pointer, setPointer] = useState<{ show: boolean; dir: 'up' | 'down' | null }>({ show: false, dir: null });

  const mascotRef = useRef<HTMLButtonElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef('');

  const activeStep = steps.find((s) => !s.done);
  const activeKey = activeStep?.key;
  const activeIdx = steps.findIndex((s) => s.key === activeKey);
  const targetId = activeStep?.pointerId ?? (activeStep?.anchorId && !activeStep.anchorId.startsWith('module:') ? activeStep.anchorId : undefined);

  // Suppress the global Stablehand widget while the guide is on screen (one character).
  useEffect(() => {
    useEditorAgentUi.getState().setSuppressGlobal(true);
    return () => useEditorAgentUi.getState().setSuppressGlobal(false);
  }, []);

  // Auto-send a queued prompt (from "Ask" / suggestion) once the chat is open.
  useEffect(() => {
    if (pendingPrompt && open && !busy) {
      void sendMessage({ text: pendingPrompt });
      useProfileAgentUi.getState().consumePrompt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt, open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status, staged]);

  // Pointer arrow: a rAF loop glues the dashed path from the mascot to the active
  // section. Path is mutated via ref (no per-frame re-render); only show/dir state
  // changes trigger React updates.
  useEffect(() => {
    // Re-evaluate from scratch on every open/target change. Without this reset the
    // stale signature survives a chat open→close, so the arrow never re-shows when
    // "Show me" is tapped again after asking the Stablehand.
    lastPointer.current = '';
    if (open || !targetId) { setPointer((p) => (p.show || p.dir ? { show: false, dir: null } : p)); return; }
    let raf = 0;
    const tick = () => {
      const target = document.getElementById(targetId);
      const mascot = mascotRef.current?.getBoundingClientRect();
      if (target && mascot) {
        const r = target.getBoundingClientRect();
        const margin = 64;
        if (r.bottom < margin) { commit(false, 'up'); }
        else if (r.top > window.innerHeight - margin) { commit(false, 'down'); }
        else {
          const sx = mascot.right - 12, sy = mascot.top + 8;
          const ex = r.left + 4, ey = r.top + r.height / 2;
          const cx = (sx + ex) / 2, cy = Math.min(sy, ey) - 50;
          pathRef.current?.setAttribute('d', `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`);
          commit(true, null);
        }
      } else { commit(false, null); }
      raf = requestAnimationFrame(tick);
    };
    const commit = (show: boolean, dir: 'up' | 'down' | null) => {
      const sig = `${show}:${dir}`;
      if (sig !== lastPointer.current) { lastPointer.current = sig; setPointer({ show, dir }); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, targetId]);

  if (!activeStep) return null;

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    void sendMessage({ text: t });
    setInput('');
  };

  const bob = reduce ? {} : { animate: { y: [0, -6, 0] }, transition: { repeat: Infinity, duration: 2.6, ease: 'easeInOut' as const } };

  return (
    <>
      {/* Pointer arrow overlay */}
      {!open && (
        <svg style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 60, opacity: pointer.show ? 1 : 0, transition: 'opacity 0.2s' }} aria-hidden>
          <defs>
            <marker id="onb-arrowhead" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 Z" fill="var(--gold-bright)" />
            </marker>
          </defs>
          <path ref={pathRef} className="onb-arrow" fill="none" stroke="var(--gold-bright)" strokeWidth={2.5} strokeLinecap="round" markerEnd="url(#onb-arrowhead)" />
        </svg>
      )}

      {/* Mascot + bubble / chat, docked bottom-left */}
      <div style={{ position: 'fixed', left: 18, bottom: 18, zIndex: 70, display: 'flex', alignItems: 'flex-end', gap: 12, maxWidth: 'min(92vw, 380px)' }}>
        {/* Mascot */}
        <motion.button
          ref={mascotRef}
          type="button"
          onClick={() => setOpen(!open)}
          title={open ? `Hide ${name}` : `Chat with ${name}`}
          {...bob}
          style={{ flexShrink: 0, width: 56, height: 56, borderRadius: '50%', border: '2px solid var(--gold-bright)', background: 'radial-gradient(circle at 50% 35%, var(--forest-light), var(--forest-deep))', boxShadow: '0 4px 16px rgba(0,0,0,0.5), 0 0 0 4px rgba(212,168,67,0.18)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: 0 }}
        >
          <motion.span key={activeKey} initial={reduce ? false : { scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 280, damping: 12 }} style={{ fontSize: 28, lineHeight: 1 }}>{MASCOT}</motion.span>
          <span style={{ position: 'absolute', top: -3, right: -3, width: 18, height: 18, borderRadius: '50%', background: 'linear-gradient(135deg, var(--gold-bright), var(--gold-mid))', border: '1.5px solid var(--forest-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={9} style={{ color: 'var(--forest-deep)' }} />
          </span>
        </motion.button>

        {/* Guidance bubble (when chat closed) */}
        {!open && bubbleOpen && (
          <motion.div
            key={activeKey}
            initial={reduce ? false : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="sku-gold-card"
            style={{ ...serifStyle, position: 'relative', overflow: 'hidden', flex: 1, minWidth: 0 }}
          >
            <div className="sku-parchment" style={{ padding: '10px 12px', borderLeft: '3px solid var(--gold-mid)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--forest-deep)', background: 'rgba(212,168,67,0.35)', border: '1px solid var(--gold-dark)', borderRadius: 10, padding: '1px 7px' }}>Step {activeIdx + 1} of {steps.length}</span>
                <button onClick={() => setBubbleOpen(false)} title="Hide" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-dark)', padding: 0, lineHeight: 0 }}><X size={13} /></button>
              </div>
              <div style={{ ...displayStyle, fontSize: '0.92rem', fontWeight: 700, color: 'var(--forest-deep)', lineHeight: 1.2 }}>{activeStep.title}</div>
              {activeStep.tips && activeStep.tips.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '5px 0 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {activeStep.tips.map((t) => (
                    <li key={t} style={{ display: 'flex', gap: 6, fontSize: '0.62rem', color: 'var(--forest-mid)', lineHeight: 1.4 }}>
                      <span style={{ color: 'var(--gold-dark)', fontWeight: 700 }}>·</span><span>{t}</span>
                    </li>
                  ))}
                </ul>
              )}
              {pointer.dir && (
                <div style={{ marginTop: 6, fontSize: '0.6rem', fontStyle: 'italic', color: 'var(--gold-dark)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {pointer.dir === 'up' ? <ArrowUp size={11} /> : <ArrowDown size={11} />} It’s {pointer.dir === 'up' ? 'above' : 'below'} — tap Show me.
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => onShowMe(activeStep.anchorId)} className="sku-gold-btn" style={{ padding: '5px 11px', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.56rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', ...serifStyle }}>
                  Show me <ArrowRight size={11} />
                </button>
                <button type="button" onClick={() => onAskStep(activeStep)} style={{ padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.56rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderRadius: 3, border: '1px solid var(--gold-mid)', background: 'rgba(180,140,30,0.12)', color: 'var(--forest-deep)', cursor: 'pointer', ...serifStyle }}>
                  <Sparkles size={11} style={{ color: 'var(--gold-dark)' }} /> Ask {name}
                </button>
                {onSkipStep && (
                  <button type="button" onClick={() => onSkipStep(activeStep)} title="Skip this step — you can add it later" style={{ marginLeft: 'auto', padding: '5px 8px', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.56rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderRadius: 3, border: 'none', background: 'none', color: 'var(--parchment-label)', cursor: 'pointer', ...serifStyle }}>
                    <SkipForward size={11} /> Skip
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Re-open guidance puck */}
        {!open && !bubbleOpen && (
          <button onClick={() => setBubbleOpen(true)} title="Show the guide" style={{ alignSelf: 'center', width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--gold-mid)', background: 'rgba(14,36,22,0.85)', color: 'var(--gold-bright)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={14} />
          </button>
        )}
      </div>

      {/* Chat popover (when open) — anchored above the mascot */}
      {open && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="sku-gold-card"
          style={{ position: 'fixed', left: 18, bottom: 86, zIndex: 71, width: 'min(92vw, 340px)', maxHeight: '66vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          <div className="sku-green-header" style={{ padding: '8px 11px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{MASCOT}</span>
            <div style={{ lineHeight: 1.1, flex: 1, minWidth: 0 }}>
              <div style={{ ...displayStyle, fontSize: '0.82rem', fontWeight: 700, color: 'var(--parchment)' }}>{name}</div>
              <div style={{ fontSize: '0.56rem', color: 'var(--gold-mid)' }}>{ctx?.name ? `Helping with ${ctx.name}` : 'Your onboarding guide'}</div>
            </div>
            {undoCount > 0 && (
              <button onClick={() => void undoLastProposal()} title="Undo last applied change" className="flex items-center gap-1 rounded-sm border border-white/15 px-1.5 py-1 text-[10px] text-white/75 hover:bg-white/10"><Undo2 size={11} /> Undo</button>
            )}
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: '1px solid var(--gold-dark)', borderRadius: 3, color: 'var(--gold-mid)', cursor: 'pointer', display: 'flex', padding: 4 }}><X size={13} /></button>
          </div>

          <div ref={scrollRef} className="sku-parchment" style={{ flex: 1, overflowY: 'auto', padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.length === 0 && (
              <p style={{ fontSize: '0.66rem', color: 'var(--forest-mid)', fontStyle: 'italic', lineHeight: 1.5 }}>
                Hi! I’m {name}. Tell me about this {ctx?.entityKind ?? 'profile'} and I’ll draft values for you to review and Apply — nothing saves without your tap.
              </p>
            )}
            {messages.map((m) => {
              const text = messageText(m);
              const mine = m.role === 'user';
              if (!text && !mine) return null;
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  <div style={mine
                    ? { maxWidth: '88%', whiteSpace: 'pre-wrap', borderRadius: '10px 10px 2px 10px', background: 'linear-gradient(135deg, var(--forest-mid), var(--forest-deep))', color: 'var(--parchment)', padding: '6px 9px', fontSize: '0.72rem' }
                    : { maxWidth: '92%', borderRadius: '10px 10px 10px 2px', background: 'rgba(26,51,34,0.06)', border: '1px solid var(--parchment-dark)', color: 'var(--forest-deep)', padding: '6px 9px', fontSize: '0.72rem' }}>
                    {mine ? text : <MarkdownMessage text={text} />}
                  </div>
                </div>
              );
            })}
            {busy && <div style={{ fontSize: '0.66rem', color: 'var(--forest-mid)', fontStyle: 'italic' }}>…thinking</div>}
            {error && <p style={{ fontSize: '0.62rem', color: '#a33' }}>{error.message?.includes('resting') ? 'The assistant isn’t switched on — set OPENROUTER_API_KEY on the server.' : 'Something went wrong — please try again.'}</p>}
          </div>

          {staged.length > 0 && (
            <div style={{ maxHeight: '42%', overflowY: 'auto', borderTop: '2px solid rgba(212,168,67,0.5)', background: 'rgba(180,140,30,0.08)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--forest-deep)' }}>
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-[#0b1220]">{staged.length}</span> Review &amp; apply
                </span>
                {staged.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => void applyAllProposals()} className="rounded-sm bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-600">Apply all</button>
                    <button onClick={() => discardAllProposals()} className="rounded-sm border border-black/15 px-2 py-0.5 text-[10px] hover:bg-black/5" style={{ color: 'var(--forest-mid)' }}>Discard all</button>
                  </div>
                )}
              </div>
              {staged.map((p) => <ProposalCard key={p.id} p={p} />)}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="sku-green-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px' }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Ask ${name}…`} style={{ flex: 1, borderRadius: 14, border: '1px solid var(--gold-dark)', background: 'rgba(0,0,0,0.25)', color: 'var(--parchment)', padding: '5px 11px', fontSize: '0.72rem', outline: 'none', ...serifStyle }} />
            {busy ? (
              <button type="button" onClick={() => stop()} aria-label="Stop" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', color: 'var(--parchment)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Square size={12} /></button>
            ) : (
              <button type="submit" aria-label="Send" disabled={!input.trim()} style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: 'var(--gold-bright)', color: 'var(--forest-deep)', border: 'none', cursor: 'pointer', opacity: input.trim() ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Send size={12} /></button>
            )}
          </form>
        </motion.div>
      )}
    </>
  );
}
