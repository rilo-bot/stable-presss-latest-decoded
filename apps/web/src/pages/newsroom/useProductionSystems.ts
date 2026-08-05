import { useState, useMemo, useEffect } from 'react';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useMediaStore } from '@/stores/mediaStore';
import { useRacingEntryStore } from '@/stores/racingEntryStore';
import { useSaleStore } from '@/stores/saleStore';
import { useReportStore } from '@/stores/reportStore';
import { connectionResolver } from '@/lib/horseConnections';
import { toast } from 'sonner';
import type { Horse } from '@/types/horse';
import type { MediaItem, MediaType } from '@/types/mediaItem';
import type { RacingEntry } from '@/types/racingEntry';
import type { Sale } from '@/types/sale';
import type { HorseReport } from '@/types/horseReport';
import type { RegisterPerson } from '@/lib/register';

/**
 * Owns all "production system" concerns for the Newsroom: the horse, party,
 * media and racing/sales/report registers — their store subscriptions, fetch
 * effects, search/filter state, derived filtered lists, and the open/close/
 * delete handlers. Returns the same variable names the Newsroom JSX already
 * uses, so the page composes it with a single destructure.
 */
export function useProductionSystems() {
  // === Store subscriptions + fetch-on-mount ===
  const fetchParties = usePartyStore((s) => s.fetchParties);
  useEffect(() => {
    fetchParties();
  }, [fetchParties]);

  const horses = useHorseStore((s) => s.horses);
  const removeHorse = useHorseStore((s) => s.removeHorse);
  const parties = useRegister();
  const removeParty = usePartyStore((s) => s.removeParty);
  const horseConn = useMemo(() => connectionResolver(parties ?? []), [parties]);

  const mediaItems = useMediaStore((s) => s.items);
  const fetchMediaItems = useMediaStore((s) => s.fetchItems);
  const removeMediaItem = useMediaStore((s) => s.removeItem);
  useEffect(() => { fetchMediaItems(); }, [fetchMediaItems]);

  const racingEntries = useRacingEntryStore((s) => s.entries);
  const fetchRacingEntries = useRacingEntryStore((s) => s.fetchEntries);
  const removeRacingEntry = useRacingEntryStore((s) => s.removeEntry);

  const salesRecords = useSaleStore((s) => s.sales);
  const fetchSales = useSaleStore((s) => s.fetchSales);
  const removeSale = useSaleStore((s) => s.removeSale);
  const reportRecords = useReportStore((s) => s.reports);
  const fetchReports = useReportStore((s) => s.fetchReports);
  const removeReport = useReportStore((s) => s.removeReport);
  useEffect(() => { fetchSales(); fetchReports(); }, [fetchSales, fetchReports]);

  useEffect(() => { fetchRacingEntries(); }, [fetchRacingEntries]);

  // === Horse Production System state ===
  const [horseFormOpen, setHorseFormOpen] = useState(false);
  const [editHorse, setEditHorse] = useState<Horse | null>(null);
  const [horseSearch, setHorseSearch] = useState('');
  const [expandedHorseId, setExpandedHorseId] = useState<string | null>(null);
  const [horseDeleteTarget, setHorseDeleteTarget] = useState<Horse | null>(null);
  const [horseDeleteConfirm, setHorseDeleteConfirm] = useState(false);

  // === Parties Production System state ===
  const [partyFormOpen, setPartyFormOpen] = useState(false);
  const [editParty, setEditParty] = useState<RegisterPerson | undefined>(undefined);
  const [partySearch, setPartySearch] = useState('');
  const [partyDeleteTarget, setPartyDeleteTarget] = useState<RegisterPerson | null>(null);
  const [partyDeleteConfirm, setPartyDeleteConfirm] = useState(false);

  // === Media Production System state ===
  const [mediaFormOpen, setMediaFormOpen] = useState(false);
  const [editMedia, setEditMedia] = useState<MediaItem | undefined>(undefined);
  const [mediaSearch, setMediaSearch] = useState('');
  const [mediaHorseFilter, setMediaHorseFilter] = useState('');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaType | ''>('');
  const [mediaDeleteTarget, setMediaDeleteTarget] = useState<MediaItem | null>(null);
  const [mediaDeleteConfirm, setMediaDeleteConfirm] = useState(false);

  // === Racing Production System state ===
  const [racingFormOpen, setRacingFormOpen] = useState(false);
  const [editRacing, setEditRacing] = useState<RacingEntry | undefined>(undefined);
  const [salesFormOpen, setSalesFormOpen] = useState(false);
  const [editSale, setEditSale] = useState<Sale | undefined>(undefined);
  const [reportFormOpen, setReportFormOpen] = useState(false);
  const [editReport, setEditReport] = useState<HorseReport | undefined>(undefined);
  const [racingSearch, setRacingSearch] = useState('');
  const [racingHorseFilter, setRacingHorseFilter] = useState('');
  const [racingDeleteTarget, setRacingDeleteTarget] = useState<RacingEntry | null>(null);
  const [racingDeleteConfirm, setRacingDeleteConfirm] = useState(false);

  // === Derived / filtered lists ===
  const filteredHorses = useMemo(() => {
    const q = horseSearch.toLowerCase().trim();
    if (!q) return horses ?? [];
    return (horses ?? []).filter((h) => {
      const c = horseConn(h);
      return (
        h.name?.toLowerCase().includes(q) ||
        c.trainer.toLowerCase().includes(q) ||
        c.jockey.toLowerCase().includes(q) ||
        c.owner.toLowerCase().includes(q) ||
        h.country?.toLowerCase().includes(q)
      );
    });
  }, [horses, horseSearch, horseConn]);

  const safeParties = parties ?? [];

  const filteredParties = useMemo(() => {
    const q = partySearch.toLowerCase().trim();
    if (!q) return safeParties;
    return safeParties.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.profession?.toLowerCase().includes(q) ||
        p.baseLocation?.toLowerCase().includes(q) ||
        (p.roles ?? []).some((r) => r.toLowerCase().includes(q))
    );
  }, [safeParties, partySearch]);

  const filteredMediaItems = useMemo(() => {
    let result = mediaItems ?? [];
    if (mediaHorseFilter) {
      result = result.filter((m) => m.horse_id === mediaHorseFilter);
    }
    if (mediaTypeFilter) {
      result = result.filter((m) => m.media_type === mediaTypeFilter);
    }
    const q = mediaSearch.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (m) =>
          m.title?.toLowerCase().includes(q) ||
          m.subject?.toLowerCase().includes(q) ||
          m.source_publication?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [mediaItems, mediaHorseFilter, mediaTypeFilter, mediaSearch]);

  const filteredRacingEntries = useMemo(() => {
    let result = racingEntries ?? [];
    if (racingHorseFilter) {
      result = result.filter((r) => r.horse_id === racingHorseFilter);
    }
    const q = racingSearch.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (r) =>
          r.race_name?.toLowerCase().includes(q) ||
          r.venue?.toLowerCase().includes(q) ||
          r.subject?.toLowerCase().includes(q) ||
          r.country?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [racingEntries, racingHorseFilter, racingSearch]);

  // === Handlers ===
  const handleOpenHorseForm = (horse?: Horse) => {
    setEditHorse(horse ?? null);
    setHorseFormOpen(true);
  };

  const handleCloseHorseForm = () => {
    setHorseFormOpen(false);
    setEditHorse(null);
  };

  const handleHorseDelete = (horse: Horse) => {
    setHorseDeleteTarget(horse);
    setHorseDeleteConfirm(true);
  };

  const confirmHorseDelete = async () => {
    if (!horseDeleteTarget) return;
    const name = horseDeleteTarget.name || 'Unnamed';
    await removeHorse(horseDeleteTarget.id);
    setHorseDeleteTarget(null);
    setHorseDeleteConfirm(false);
    toast.success(`${name} has been removed.`);
  };

  const handleOpenPartyForm = (party?: RegisterPerson) => {
    setEditParty(party);
    setPartyFormOpen(true);
  };

  const handleClosePartyForm = () => {
    setPartyFormOpen(false);
    setEditParty(undefined);
  };

  const handlePartyDelete = (party: RegisterPerson) => {
    setPartyDeleteTarget(party);
    setPartyDeleteConfirm(true);
  };

  const confirmPartyDelete = async () => {
    if (!partyDeleteTarget) return;
    const name = partyDeleteTarget.name;
    const ok = await removeParty(partyDeleteTarget.id);
    setPartyDeleteTarget(null);
    setPartyDeleteConfirm(false);
    if (ok) toast.success(`${name} has been removed.`);
  };

  const handleOpenMediaForm = (item?: MediaItem) => {
    setEditMedia(item);
    setMediaFormOpen(true);
  };

  const handleCloseMediaForm = () => {
    setMediaFormOpen(false);
    setEditMedia(undefined);
  };

  const handleMediaDelete = (item: MediaItem) => {
    setMediaDeleteTarget(item);
    setMediaDeleteConfirm(true);
  };

  const confirmMediaDelete = () => {
    if (!mediaDeleteTarget) return;
    removeMediaItem(mediaDeleteTarget.id);
    setMediaDeleteTarget(null);
    setMediaDeleteConfirm(false);
  };

  const handleOpenRacingForm = (entry?: RacingEntry) => {
    setEditRacing(entry);
    setRacingFormOpen(true);
  };

  const handleCloseRacingForm = () => {
    setRacingFormOpen(false);
    setEditRacing(undefined);
  };

  const handleRacingDelete = (entry: RacingEntry) => {
    setRacingDeleteTarget(entry);
    setRacingDeleteConfirm(true);
  };

  const confirmRacingDelete = () => {
    if (!racingDeleteTarget) return;
    removeRacingEntry(racingDeleteTarget.id);
    setRacingDeleteTarget(null);
    setRacingDeleteConfirm(false);
  };

  return {
    // store data
    horses, parties, removeParty, horseConn,
    mediaItems, fetchMediaItems, removeMediaItem,
    racingEntries, fetchRacingEntries, removeRacingEntry,
    salesRecords, fetchSales, removeSale,
    reportRecords, fetchReports, removeReport,
    // horse state
    horseFormOpen, setHorseFormOpen, editHorse, setEditHorse,
    horseSearch, setHorseSearch, expandedHorseId, setExpandedHorseId,
    horseDeleteTarget, setHorseDeleteTarget, horseDeleteConfirm, setHorseDeleteConfirm,
    // party state
    partyFormOpen, setPartyFormOpen, editParty, setEditParty,
    partySearch, setPartySearch, partyDeleteTarget, setPartyDeleteTarget,
    partyDeleteConfirm, setPartyDeleteConfirm,
    // media state
    mediaFormOpen, setMediaFormOpen, editMedia, setEditMedia,
    mediaSearch, setMediaSearch, mediaHorseFilter, setMediaHorseFilter,
    mediaTypeFilter, setMediaTypeFilter, mediaDeleteTarget, setMediaDeleteTarget,
    mediaDeleteConfirm, setMediaDeleteConfirm,
    // racing / sales / reports state
    racingFormOpen, setRacingFormOpen, editRacing, setEditRacing,
    salesFormOpen, setSalesFormOpen, editSale, setEditSale,
    reportFormOpen, setReportFormOpen, editReport, setEditReport,
    racingSearch, setRacingSearch, racingHorseFilter, setRacingHorseFilter,
    racingDeleteTarget, setRacingDeleteTarget, racingDeleteConfirm, setRacingDeleteConfirm,
    // derived
    safeParties, filteredHorses, filteredParties, filteredMediaItems, filteredRacingEntries,
    // handlers
    handleOpenHorseForm, handleCloseHorseForm, handleHorseDelete, confirmHorseDelete,
    handleOpenPartyForm, handleClosePartyForm, handlePartyDelete, confirmPartyDelete,
    handleOpenMediaForm, handleCloseMediaForm, handleMediaDelete, confirmMediaDelete,
    handleOpenRacingForm, handleCloseRacingForm, handleRacingDelete, confirmRacingDelete,
  };
}
