import { create } from 'zustand';
import { toast } from 'sonner';
import type { HorseReport } from '@/types/horseReport';
import { authFetch } from '@/lib/api';

interface ReportState {
  reports: HorseReport[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  fetchReports: () => Promise<void>;
  addReport: (report: Omit<HorseReport, 'id' | 'createdAt'>) => Promise<string>;
  updateReport: (id: string, updates: Partial<Omit<HorseReport, 'id' | 'createdAt'>>) => Promise<void>;
  removeReport: (id: string) => Promise<void>;
}

export const useReportStore = create<ReportState>()((set, get) => ({
  reports: [],
  loading: false,
  loaded: false,
  error: null,

  fetchReports: async () => {
    if (get().loading || get().loaded) return;
    set({ loading: true, error: null });
    try {
      const res = await authFetch('/api/reports');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reports = await res.json();
      set({ reports, loading: false, loaded: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load reports';
      set({ loading: false, error: message });
      toast.error(message);
    }
  },

  addReport: async (report) => {
    try {
      const res = await authFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created: HorseReport = await res.json();
      set((state) => ({ reports: [created, ...state.reports] }));
      return created.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add report';
      set({ error: message });
      toast.error(message);
      return '';
    }
  },

  updateReport: async (id, updates) => {
    const previous = get().reports;
    set((state) => ({ reports: state.reports.map((r) => (r.id === id ? { ...r, ...updates } : r)) }));
    try {
      const res = await authFetch(`/api/reports/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: HorseReport = await res.json();
      set((state) => ({ reports: state.reports.map((r) => (r.id === id ? updated : r)) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update report';
      set({ reports: previous, error: message });
      toast.error(message);
    }
  },

  removeReport: async (id) => {
    const previous = get().reports;
    set((state) => ({ reports: state.reports.filter((r) => r.id !== id) }));
    try {
      const res = await authFetch(`/api/reports/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Document removed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete document — restoring it';
      set({ reports: previous, error: message });
      toast.error(message);
    }
  },
}));
