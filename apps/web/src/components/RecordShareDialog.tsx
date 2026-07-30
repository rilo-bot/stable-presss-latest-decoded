/**
 * Share a production-system record with a colleague.
 *
 * A share grants READING only — editing and deleting stay with the creator and
 * admins, and only they can change who a record is shared with. The dialog says
 * so out loud, because "Share" in most tools implies write access and quietly
 * meaning something else is worse than saying it.
 *
 * Candidates come from the existing staff directory (anyone with newsroom
 * access), reused rather than re-implemented.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Share2, UserPlus, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { authFetch } from '@/lib/api';
import type { RecordShare } from '@/types/sharing';
import { toast } from 'sonner';

interface StaffOption {
  userId: string;
  displayName: string;
  email: string;
}

export interface RecordShareDialogProps {
  open: boolean;
  onClose: () => void;
  /** What is being shared, for the dialog copy. */
  recordLabel: string;
  /** Who already has access. */
  sharedWith: RecordShare[];
  /** Creator's name, shown as the permanent owner row. */
  ownerName?: string;
  busy?: boolean;
  onShare: (email: string) => Promise<{ ok: boolean; error?: string }>;
  onUnshare: (userId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function RecordShareDialog({
  open,
  onClose,
  recordLabel,
  sharedWith,
  ownerName,
  busy,
  onShare,
  onUnshare,
}: RecordShareDialogProps) {
  const [directory, setDirectory] = useState<StaffOption[]>([]);
  const [selected, setSelected] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await authFetch('/api/magazines/staff-directory');
        if (!res.ok) return;
        const list = (await res.json()) as StaffOption[];
        if (!cancelled) setDirectory(Array.isArray(list) ? list : []);
      } catch {
        /* the picker just stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const alreadyShared = useMemo(
    () => new Set(sharedWith.map((s) => s.userId)),
    [sharedWith],
  );
  const candidates = directory.filter((d) => !alreadyShared.has(d.userId));

  const submit = async () => {
    if (!selected) return;
    setWorking(true);
    const r = await onShare(selected);
    setWorking(false);
    if (r.ok) {
      setSelected('');
      toast.success('Access granted.');
    } else {
      toast.error(r.error ?? 'Could not share this record.');
    }
  };

  const revoke = async (userId: string, name: string) => {
    setWorking(true);
    const r = await onUnshare(userId);
    setWorking(false);
    if (r.ok) toast.success(`Removed ${name}'s access.`);
    else toast.error(r.error ?? 'Could not remove access.');
  };

  const disabled = working || busy;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 size={16} /> Share this {recordLabel}
          </DialogTitle>
          <DialogDescription>
            People you add can <strong>view</strong> this {recordLabel}. Editing, deleting and
            sharing stay with you and your administrators.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add someone */}
          <div className="flex gap-2">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={disabled}
              className="flex-1 min-w-0 px-2 py-2 text-sm border border-input rounded-sm bg-background"
              aria-label="Person to share with"
            >
              <option value="">
                {candidates.length === 0 ? 'Nobody else to add' : 'Choose a colleague…'}
              </option>
              {candidates.map((c) => (
                <option key={c.userId} value={c.email}>
                  {c.displayName || c.email}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={submit} disabled={disabled || !selected} className="gap-1.5">
              {working ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
              Share
            </Button>
          </div>

          {/* Who has access */}
          <div>
            <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground mb-2">
              Has access
            </p>
            <ul className="space-y-1.5">
              {ownerName && (
                <li className="flex items-center gap-2 text-sm px-3 py-2 rounded-sm bg-muted/30">
                  <span className="flex-1 truncate text-foreground">{ownerName}</span>
                  <span className="text-[11px] uppercase tracking-wide font-bold text-muted-foreground">
                    Owner
                  </span>
                </li>
              )}
              {sharedWith.map((s) => (
                <li
                  key={s.userId}
                  className="flex items-center gap-2 text-sm px-3 py-2 rounded-sm border border-border/60"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-foreground">{s.displayName || s.email}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">{s.email}</span>
                  </span>
                  <span className="text-[11px] uppercase tracking-wide font-bold text-muted-foreground">
                    Can view
                  </span>
                  <button
                    onClick={() => void revoke(s.userId, s.displayName || s.email)}
                    disabled={disabled}
                    className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    aria-label={`Remove ${s.displayName || s.email}'s access`}
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
              {sharedWith.length === 0 && (
                <li className="text-sm text-muted-foreground px-3 py-2">
                  Not shared with anyone yet.
                </li>
              )}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
