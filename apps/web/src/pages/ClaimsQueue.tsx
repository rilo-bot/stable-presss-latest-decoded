import { useEffect, useState } from 'react';
import { useClaimStore } from '@/stores/claimStore';
import { PARTY_ROLE_LABELS } from '@/types/party';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Check, X, FileText, Loader2, ShieldCheck, Inbox } from 'lucide-react';

export default function ClaimsQueue() {
  const pending = useClaimStore((s) => s.pending);
  const loading = useClaimStore((s) => s.loading);
  const fetchPending = useClaimStore((s) => s.fetchPending);
  const verifyClaim = useClaimStore((s) => s.verifyClaim);
  const rejectClaim = useClaimStore((s) => s.rejectClaim);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void fetchPending();
  }, [fetchPending]);

  const onVerify = async (id: string) => {
    setBusyId(id);
    const r = await verifyClaim(id);
    setBusyId(null);
    if (r.ok) toast.success('Claim verified — the role is now active.');
    else toast.error(r.error ?? 'Could not verify the claim.');
  };

  const onReject = async (id: string) => {
    const reason = window.prompt('Reason for rejection (optional):') ?? undefined;
    setBusyId(id);
    const r = await rejectClaim(id, reason);
    setBusyId(null);
    if (r.ok) toast.success('Claim rejected.');
    else toast.error(r.error ?? 'Could not reject the claim.');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-2">
        <ShieldCheck size={20} className="text-primary" />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
          Claim Verification
        </h1>
      </div>
      <div className="h-px w-full bg-border/60 mb-6" />
      <p className="text-sm text-muted-foreground mb-8">
        Pending racing-role claims. Approving a claim activates that role for the member; rejecting
        leaves them as a reader.
      </p>

      {loading && pending.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading queue…
        </div>
      ) : pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 border border-dashed border-border/60 rounded-sm">
          <Inbox size={28} className="text-muted-foreground/50 mb-3" />
          <p className="text-sm font-medium text-foreground">The queue is clear</p>
          <p className="text-xs text-muted-foreground mt-1">No claims are awaiting verification.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {pending.map((c) => (
            <li
              key={c.id}
              className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 border border-border/60 rounded-sm bg-card"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">{c.claimantName}</span>
                  <span className="text-xs text-muted-foreground">{c.claimantEmail}</span>
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span
                    className="text-[10px] uppercase tracking-[0.1em] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'hsl(var(--brand-accent) / 0.14)', color: 'hsl(var(--brand-accent))' }}
                  >
                    {PARTY_ROLE_LABELS[c.role] ?? c.role}
                  </span>
                  {c.partyName && (
                    <span className="text-xs text-muted-foreground">
                      claims party <span className="text-foreground font-medium">{c.partyName}</span>
                    </span>
                  )}
                  {c.evidenceUrl ? (
                    <a
                      href={c.evidenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <FileText size={12} /> View evidence
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground/60 italic">no evidence attached</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  onClick={() => onVerify(c.id)}
                  disabled={busyId === c.id}
                  className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {busyId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReject(c.id)}
                  disabled={busyId === c.id}
                  className="gap-1.5"
                >
                  <X size={14} /> Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
