import { Plus, DollarSign, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { useCan } from '@/lib/permissions';
import type { Horse } from '@/types/horse';
import type { Sale } from '@/types/sale';
import type { HorseReport } from '@/types/horseReport';

interface HorseRecordsProductionSystemProps {
  horses: Horse[];
  salesRecords: Sale[];
  reportRecords: HorseReport[];
  setEditSale: (s: Sale | undefined) => void;
  setSalesFormOpen: (v: boolean) => void;
  removeSale: (id: string) => void;
  setEditReport: (r: HorseReport | undefined) => void;
  setReportFormOpen: (v: boolean) => void;
  removeReport: (id: string) => void;
}

/**
 * The Horse Records register: what a horse sold for, and the paperwork that
 * follows it around.
 *
 * This was a TAB inside Editor Hub, which meant two things. It was the only
 * door to the `sales` and `reports` collections in the whole app — so removing
 * Editor Hub without this screen would have stranded them — and it was reached
 * only by someone who already held an editing verb, so it never had to ask
 * whether the viewer could write. Now it is a register in the Stables section
 * that anyone holding `horse-records.view` can open, so every button below is
 * gated. The server agrees: /sales and /reports are gated on the same screen.
 */
export function HorseRecordsProductionSystem({
  horses,
  salesRecords,
  reportRecords,
  setEditSale,
  setSalesFormOpen,
  removeSale,
  setEditReport,
  setReportFormOpen,
  removeReport,
}: HorseRecordsProductionSystemProps) {
  const mayCreate = useCan('horse-records.create');
  const mayEdit = useCan('horse-records.edit');
  const mayDelete = useCan('horse-records.delete');

  function horseName(id: string) {
    const h = horses.find((x) => x.id === id);
    return h ? (h.isUnnamed ? 'Un-Named' : h.name) : id;
  }

  return (
    <div className="space-y-8">
      {/* Sales */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.14em] font-bold text-muted-foreground">Sales Records</p>
            <p className="text-sm text-muted-foreground/70">Auction & transfer history — surfaces on the horse's Sales Data module.</p>
          </div>
          {mayCreate && (
            <Button size="sm" className="gap-1.5 text-sm bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditSale(undefined); setSalesFormOpen(true); }}>
              <Plus size={13} /> Add Sale
            </Button>
          )}
        </div>
        {salesRecords.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            heading="No sale records yet."
            description={mayCreate
              ? 'Add auction or transfer records and they will appear on the matching horse profile.'
              : 'Auction and transfer records appear here once someone with Create adds them.'}
            ctaLabel={mayCreate ? 'Add Sale' : undefined}
            onCta={mayCreate ? () => { setEditSale(undefined); setSalesFormOpen(true); } : undefined}
          />
        ) : (
          <div className="border border-border/60 rounded-sm overflow-hidden bg-card divide-y divide-border/50">
            {salesRecords.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{horseName(s.horse_id)} — {s.venue}{s.lot ? ` · ${s.lot}` : ''}</p>
                  <p className="text-[13px] text-muted-foreground">{s.sale_type} · {s.sale_date}{s.price ? ` · ${s.currency === 'NZD' ? 'NZ$' : '$'}${s.price.toLocaleString('en-AU')}` : ''}</p>
                </div>
                {mayEdit && <button className="text-sm text-primary hover:underline" onClick={() => { setEditSale(s); setSalesFormOpen(true); }}>Edit</button>}
                {mayDelete && <button className="text-sm text-destructive hover:underline" onClick={() => removeSale(s.id)}>Delete</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reports / Forms */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.14em] font-bold text-muted-foreground">Reports / Forms</p>
            <p className="text-sm text-muted-foreground/70">Registration, passport, vet & other documents. Restricted docs show to members only.</p>
          </div>
          {mayCreate && (
            <Button size="sm" className="gap-1.5 text-sm bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditReport(undefined); setReportFormOpen(true); }}>
              <Plus size={13} /> Add Document
            </Button>
          )}
        </div>
        {reportRecords.length === 0 ? (
          <EmptyState
            icon={File}
            heading="No documents yet."
            description={mayCreate
              ? 'Add registration, passport, or veterinary documents for a horse.'
              : 'Registration, passport and veterinary documents appear here once someone with Create adds them.'}
            ctaLabel={mayCreate ? 'Add Document' : undefined}
            onCta={mayCreate ? () => { setEditReport(undefined); setReportFormOpen(true); } : undefined}
          />
        ) : (
          <div className="border border-border/60 rounded-sm overflow-hidden bg-card divide-y divide-border/50">
            {reportRecords.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{horseName(r.horse_id)} — {r.title}</p>
                  <p className="text-[13px] text-muted-foreground">{r.doc_type} · {r.visibility === 'restricted' ? 'Restricted' : 'Public'}{r.issued_date ? ` · ${r.issued_date}` : ''}</p>
                </div>
                {mayEdit && <button className="text-sm text-primary hover:underline" onClick={() => { setEditReport(r); setReportFormOpen(true); }}>Edit</button>}
                {mayDelete && <button className="text-sm text-destructive hover:underline" onClick={() => removeReport(r.id)}>Delete</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
