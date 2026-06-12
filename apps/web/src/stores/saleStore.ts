import { create } from 'zustand';
import { toast } from 'sonner';
import type { Sale } from '@/types/sale';
import { apiUrl } from '@/lib/api';

interface SaleState {
  sales: Sale[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  fetchSales: () => Promise<void>;
  addSale: (sale: Omit<Sale, 'id' | 'createdAt'>) => Promise<string>;
  updateSale: (id: string, updates: Partial<Omit<Sale, 'id' | 'createdAt'>>) => Promise<void>;
  removeSale: (id: string) => Promise<void>;
}

export const useSaleStore = create<SaleState>()((set, get) => ({
  sales: [],
  loading: false,
  loaded: false,
  error: null,

  fetchSales: async () => {
    if (get().loading || get().loaded) return;
    set({ loading: true, error: null });
    try {
      const res = await fetch(apiUrl('/api/sales'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sales = await res.json();
      set({ sales, loading: false, loaded: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load sales';
      set({ loading: false, error: message });
      toast.error(message);
    }
  },

  addSale: async (sale) => {
    try {
      const res = await fetch(apiUrl('/api/sales'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sale),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created: Sale = await res.json();
      set((state) => ({ sales: [created, ...state.sales] }));
      return created.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add sale';
      set({ error: message });
      toast.error(message);
      return '';
    }
  },

  updateSale: async (id, updates) => {
    const previous = get().sales;
    set((state) => ({ sales: state.sales.map((s) => (s.id === id ? { ...s, ...updates } : s)) }));
    try {
      const res = await fetch(apiUrl(`/api/sales/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: Sale = await res.json();
      set((state) => ({ sales: state.sales.map((s) => (s.id === id ? updated : s)) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update sale';
      set({ sales: previous, error: message });
      toast.error(message);
    }
  },

  removeSale: async (id) => {
    const previous = get().sales;
    set((state) => ({ sales: state.sales.filter((s) => s.id !== id) }));
    try {
      const res = await fetch(apiUrl(`/api/sales/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Sale record removed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete sale — restoring it';
      set({ sales: previous, error: message });
      toast.error(message);
    }
  },
}));
