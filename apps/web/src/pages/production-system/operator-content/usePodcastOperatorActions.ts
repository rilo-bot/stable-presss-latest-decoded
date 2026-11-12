// ---------------------------------------------------------------------------
// The Stable Hand Operator — PODCAST pack (/production-system/podcast).
//
// Registered by PodcastScreen while it is mounted. Every write drives the
// screen the way a producer does: the "New episode" dialog, the episode card,
// the drawer's Next-step buttons, its Guests and Distribution tabs — so
// podcastStore makes the same /api/podcastEpisodes calls (server-enforced
// podcast.* + own/everyone scope) and the user watches each control move.
//
// One exception, said out loud: the drawer has no "unpublish" control (a live
// episode only shows "Published across N channels"), so podcast.unpublish
// calls the store's own advanceStatus(id, 'in_review') — the same PUT the
// Return-for-revisions button makes, which the server allows only with
// podcast.publish.
//
// Publishing and unpublishing change the live site, so both confirm; so does
// scheduling (it locks in a go-live date).
//
// Catalog: apps/server/src/lib/agent/operator/catalog/content.ts — keep in step.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import type { UiDriver } from '@/agent/operator/contracts';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import { can, canEditEpisode } from '@/lib/permissions';
import { useAuthStore } from '@/stores/authStore';
import { usePodcastStore } from '@/stores/podcastStore';
import type { DistributionChannel, EpisodeStatus, PodcastEpisode } from '@/types/podcast';
import { DISTRIBUTION_CHANNELS, WORKFLOW_STAGES } from '@/pages/podcast-workflow/constants';

import {
  anchor,
  clip,
  firstError,
  has,
  listWords,
  normKey,
  resolveOne,
  settleOptimistic,
  sleep,
  useLive,
  waitUntil,
  watchToasts,
} from './contentUtils';

interface PodcastOperatorInput {
  canView: boolean;
  /** The episode whose drawer is open, if any. */
  selectedId: string | null;
}

const stageLabel = (s: EpisodeStatus) => WORKFLOW_STAGES.find((x) => x.status === s)?.label ?? s;
const channelLabel = (c: DistributionChannel) => DISTRIBUTION_CHANNELS.find((x) => x.id === c)?.label ?? c;
const episodes = () => usePodcastStore.getState().episodes;
const live = (id: string) => episodes().find((e) => e.id === id);
const me = () => useAuthStore.getState().currentUser?.name;
const isOwn = (ep: PodcastEpisode) => canEditEpisode(ep.producedBy, me());
const tag = (ep: PodcastEpisode) => `“${ep.title}” (S${ep.season} E${ep.episodeNumber})`;

function resolveEpisode(query: string) {
  return resolveOne(
    query,
    episodes(),
    (e) => [e.id, e.title, `s${e.season}e${e.episodeNumber}`, `season ${e.season} episode ${e.episodeNumber}`],
    'episode',
    (e) => `${e.title} (S${e.season} E${e.episodeNumber}, ${stageLabel(e.status)})`,
  );
}

function mustEpisode(query: string): PodcastEpisode {
  const r = resolveEpisode(query);
  if (!r.hit) throw new Error(r.error);
  return r.hit;
}

/** What the drawer offers next, in words the model can act on. */
function nextStep(ep: PodcastEpisode): string {
  switch (ep.status) {
    case 'draft':
      return ep.audioUrl ? 'podcast.advance (audio is attached)' : 'needs audio: podcast.advance with audioUrl, or upload to podcast.audio first';
    case 'audio_uploaded':
      return (ep.guests ?? []).length ? 'podcast.advance (confirm guest list)' : 'podcast.addGuest, then podcast.advance';
    case 'guests_added':
      return 'podcast.advance (marks copy done)';
    case 'description_written':
      return 'podcast.advance with publishDate (schedules; needs podcast.publish)';
    case 'scheduled':
      return 'podcast.advance (submits for review)';
    case 'in_review':
      return 'podcast.publish, or podcast.sendBack';
    case 'published':
      return 'live — podcast.unpublish takes it down';
  }
}

function episodeJson(ep: PodcastEpisode) {
  return {
    id: ep.id,
    title: ep.title,
    season: ep.season,
    episode: ep.episodeNumber,
    host: ep.host,
    status: ep.status,
    stage: stageLabel(ep.status),
    producedBy: ep.producedBy ?? null,
    yours: isOwn(ep),
    hasAudio: !!ep.audioUrl,
    durationMin: Math.round((ep.durationSeconds ?? 0) / 60),
    guests: (ep.guests ?? []).map((g) => g.name),
    channels: (ep.distributionChannels ?? []).map(channelLabel),
    scheduledFor: ep.scheduledFor?.slice(0, 10) ?? null,
    description: clip(ep.description ?? '', 200),
    next: nextStep(ep),
  };
}

function channelId(raw: string): DistributionChannel {
  const k = normKey(raw);
  const hit = DISTRIBUTION_CHANNELS.find((c) => normKey(c.id) === k || normKey(c.label) === k || normKey(c.label).startsWith(k));
  if (!hit) throw new Error(`No channel “${raw}”. Channels: ${DISTRIBUTION_CHANNELS.map((c) => c.label).join(', ')}.`);
  return hit.id;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function usePodcastOperatorActions(input: PodcastOperatorInput): void {
  const st = useLive(input);
  const enabled = input.canView;

  /** Open the episode's drawer (closing another one first) on the given tab. */
  async function openEpisode(ui: UiDriver, ep: PodcastEpisode, tab: 'overview' | 'guests' | 'distribution' | 'review' = 'overview') {
    if (has('podcast.drawer') && st.current.selectedId !== ep.id) {
      await ui.click('podcast.drawer-close', 'Close the open episode');
      await waitUntil(() => !has('podcast.drawer'), { timeoutMs: 3000, signal: ui.signal });
    }
    if (!has('podcast.drawer')) {
      if (!has(`podcast.episode-${ep.id}`)) {
        await ui.click('podcast.filter-all', 'Show all episodes');
        await waitUntil(() => has(`podcast.episode-${ep.id}`), { timeoutMs: 3000, signal: ui.signal });
      }
      await ui.click(`podcast.episode-${ep.id}`, ep.title);
      await ui.waitFor('podcast.drawer', 4000);
      await sleep(350, ui.signal); // let the drawer finish sliding in
    }
    await ui.click(`podcast.tab-${tab}`, tab[0].toUpperCase() + tab.slice(1));
  }

  /** Press a Next-step button that only renders when the role may use it. */
  async function press(ui: UiDriver, agentId: string, label: string, why: string) {
    await sleep(150, ui.signal);
    if (!has(agentId)) throw new Error(why);
    await ui.click(agentId, label);
  }

  async function statusMove(ui: UiDriver, ep: PodcastEpisode, agentId: string, label: string, to: EpisodeStatus, why: string) {
    const toasts = watchToasts();
    await press(ui, agentId, label, why);
    await settleOptimistic(ui, () => live(ep.id)?.status === to, `Moving ${tag(ep)} to ${stageLabel(to)}`, toasts);
  }

  useAgentAction(
    {
      name: 'podcast.list',
      description: 'List podcast episodes with their stage, owner and the next workflow step.',
      args: z.object({ status: z.string().optional() }),
      run: async (a) => {
        const want = a.status ? normKey(a.status) : '';
        const list = episodes()
          .filter((e) => !want || normKey(e.status) === want || normKey(stageLabel(e.status)) === want)
          .sort((x, y) => (y.createdAt ?? '').localeCompare(x.createdAt ?? ''));
        return {
          stages: WORKFLOW_STAGES.map((s) => `${s.status} (${s.label})`),
          you: { canCreate: can('podcast.create'), canEdit: can('podcast.edit'), canPublish: can('podcast.publish') },
          episodes: list.map(episodeJson),
        };
      },
    },
    enabled,
  );

  // ── Create ────────────────────────────────────────────────────────────────
  const createArgs = z.object({
    title: z.string().trim().min(1).max(200),
    host: z.string().trim().min(1).optional(),
    season: z.number().int().min(1).optional(),
    episodeNumber: z.number().int().min(1).optional(),
    durationMinutes: z.number().int().min(0).optional(),
    description: z.string().max(5000).optional(),
    audioUrl: z.string().url().optional(),
    coverUrl: z.string().url().optional(),
  });
  useAgentAction<z.infer<typeof createArgs>>(
    {
      name: 'podcast.create',
      description: 'Create a draft episode through the New episode dialog (fields typed visibly).',
      args: createArgs,
      run: async (a, ui) => {
        if (!can('podcast.create')) throw new Error('Your role cannot create episodes (needs podcast.create).');
        if (has('podcast.drawer')) {
          await ui.click('podcast.drawer-close', 'Close the open episode');
          await waitUntil(() => !has('podcast.drawer'), { timeoutMs: 3000, signal: ui.signal });
        }
        const before = new Set(episodes().map((e) => e.id));
        ui.step(`Creating “${a.title}”`);
        await ui.click('podcast.new', 'New episode');
        await ui.waitFor('podcast.create-title', 4000);
        await ui.type('podcast.create-title', a.title, { clear: true });
        if (a.host) await ui.type('podcast.create-host', a.host, { clear: true });
        if (a.season !== undefined) await ui.type('podcast.create-season', String(a.season), { clear: true });
        if (a.episodeNumber !== undefined) await ui.type('podcast.create-number', String(a.episodeNumber), { clear: true });
        if (a.durationMinutes !== undefined) await ui.type('podcast.create-duration', String(a.durationMinutes), { clear: true });
        if (a.description) await ui.type('podcast.create-description', a.description, { clear: true });
        for (const [kind, url] of [['audio', a.audioUrl], ['cover', a.coverUrl]] as const) {
          if (!url) continue;
          await ui.click(`podcast.create-${kind}-mode-url`, 'Paste URL');
          await ui.waitFor(`podcast.create-${kind}-url`, 2000);
          await ui.type(`podcast.create-${kind}-url`, url, { clear: true });
        }
        const toasts = watchToasts();
        await ui.click('podcast.create-submit', 'Create Episode Draft');
        const ok = await waitUntil(
          () => episodes().some((e) => !before.has(e.id)) || !!firstError(toasts.collect()),
          { timeoutMs: 20_000, signal: ui.signal },
        );
        const err = firstError(toasts.collect());
        if (err) throw new Error(err);
        const created = episodes().find((e) => !before.has(e.id));
        if (!ok || !created) throw new Error('The episode was not created — check the dialog.');
        await waitUntil(() => has(`podcast.episode-${created.id}`), { timeoutMs: 2000, signal: ui.signal });
        ui.flash(`podcast.episode-${created.id}`);
        return { ok: true, episode: episodeJson(created) };
      },
    },
    enabled,
  );

  // ── Workflow: one step forward ────────────────────────────────────────────
  const advanceArgs = z.object({
    episode: z.string().min(1),
    audioUrl: z.string().url().optional(),
    publishDate: z.string().regex(DATE_RE, 'YYYY-MM-DD').optional(),
  });
  useAgentAction<z.infer<typeof advanceArgs>>(
    {
      name: 'podcast.advance',
      description: 'Move an episode ONE stage forward with the drawer’s Next-step button (not publishing).',
      args: advanceArgs,
      confirm: (a) => {
        const r = resolveEpisode(a.episode);
        if (!r.hit || r.hit.status !== 'description_written' || !a.publishDate) return null;
        return `Schedule ${tag(r.hit)} for ${a.publishDate}? This locks in its go-live date.`;
      },
      run: async (a, ui) => {
        const ep = mustEpisode(a.episode);
        const noPower = (what: string) =>
          `The drawer offers no “${what}” to you for ${tag(ep)} — it needs podcast.edit (podcast.publish to schedule) and, unless your scope is Everyone, an episode you produced (producer: ${ep.producedBy ?? 'unknown'}).`;
        ui.step(`Moving ${tag(ep)} on from ${stageLabel(ep.status)}`);
        switch (ep.status) {
          case 'draft': {
            await openEpisode(ui, ep);
            if (!live(ep.id)?.audioUrl) {
              if (!a.audioUrl) {
                throw new Error(`${tag(ep)} has no audio yet. Pass audioUrl, or upload the user's file to podcast.audio, then call podcast.advance again.`);
              }
              // The uploader shows EITHER the drop zone (podcast.audio) or, once
              // switched to Paste URL, the URL box — either one means it is offered.
              if (!has('podcast.audio') && !has('podcast.audio-url')) throw new Error(noPower('Confirm Audio & Continue'));
              // The URL box saves on every keystroke (one PUT each), so the
              // finished URL is stored in one write — the same store call the
              // box makes — after pointing at it.
              await ui.click('podcast.audio-mode-url', 'Paste URL');
              await ui.point('podcast.audio-url', 'Audio URL');
              const toasts = watchToasts();
              void usePodcastStore.getState().updateEpisode(ep.id, { audioUrl: a.audioUrl });
              await settleOptimistic(ui, () => live(ep.id)?.audioUrl === a.audioUrl, 'Attaching the audio', toasts);
              ui.flash('podcast.audio-url');
            }
            await statusMove(ui, ep, 'podcast.confirm-audio', 'Confirm Audio & Continue', 'audio_uploaded', noPower('Confirm Audio & Continue'));
            break;
          }
          case 'audio_uploaded': {
            if (!(live(ep.id)?.guests ?? []).length) throw new Error(`${tag(ep)} has no guests — add one with podcast.addGuest first.`);
            await openEpisode(ui, ep, 'guests');
            await statusMove(ui, ep, 'podcast.confirm-guests', 'Confirm Guest List', 'guests_added', noPower('Confirm Guest List'));
            break;
          }
          case 'guests_added': {
            await openEpisode(ui, ep);
            await statusMove(ui, ep, 'podcast.mark-copy-done', 'Mark Copy as Done', 'description_written', noPower('Mark Copy as Done'));
            break;
          }
          case 'description_written': {
            if (!a.publishDate) throw new Error('Scheduling needs publishDate (YYYY-MM-DD). Ask the user for the go-live date.');
            await openEpisode(ui, ep);
            await sleep(150, ui.signal);
            if (!has('podcast.schedule-date')) throw new Error(noPower('Schedule'));
            await ui.type('podcast.schedule-date', a.publishDate, { clear: true });
            await statusMove(ui, ep, 'podcast.schedule', 'Schedule', 'scheduled', noPower('Schedule'));
            break;
          }
          case 'scheduled': {
            await openEpisode(ui, ep);
            await statusMove(ui, ep, 'podcast.submit-review', 'Submit for Approval Review', 'in_review', noPower('Submit for Approval Review'));
            break;
          }
          case 'in_review':
            throw new Error(`${tag(ep)} is In Review — the next step is publishing (podcast.publish) or podcast.sendBack.`);
          case 'published':
            throw new Error(`${tag(ep)} is already published.`);
        }
        const after = live(ep.id)!;
        ui.flash('podcast.drawer-stages');
        return { ok: true, from: stageLabel(ep.status), to: stageLabel(after.status), episode: episodeJson(after) };
      },
    },
    enabled,
  );

  const episodeArg = z.object({ episode: z.string().min(1) });

  useAgentAction<z.infer<typeof episodeArg>>(
    {
      name: 'podcast.sendBack',
      description: 'Return an In Review episode to Scheduled for revisions.',
      args: episodeArg,
      run: async (a, ui) => {
        const ep = mustEpisode(a.episode);
        if (ep.status !== 'in_review') throw new Error(`${tag(ep)} is ${stageLabel(ep.status)}, not In Review.`);
        await openEpisode(ui, ep);
        await statusMove(ui, ep, 'podcast.return-revisions', 'Return for Revisions', 'scheduled', 'Returning for revisions needs podcast.publish.');
        return { ok: true, episode: episodeJson(live(ep.id)!) };
      },
    },
    enabled,
  );

  useAgentAction<z.infer<typeof episodeArg>>(
    {
      name: 'podcast.publish',
      description: 'Approve & publish an In Review episode (live on the public Podcast page).',
      args: episodeArg,
      confirm: (a) => {
        const r = resolveEpisode(a.episode);
        if (!r.hit || r.hit.status !== 'in_review' || !can('podcast.publish')) return null;
        const ch = (r.hit.distributionChannels ?? []).map(channelLabel);
        return `Publish ${tag(r.hit)} now? It goes live on the public Podcast page${ch.length ? ` and ${listWords(ch)}` : ' (no distribution channels are ticked)'}.`;
      },
      run: async (a, ui) => {
        const ep = mustEpisode(a.episode);
        if (!can('podcast.publish')) throw new Error('Your role cannot publish episodes (needs podcast.publish).');
        if (ep.status === 'published') return { ok: true, unchanged: true, episode: episodeJson(ep) };
        if (ep.status !== 'in_review') {
          throw new Error(`${tag(ep)} is ${stageLabel(ep.status)}; only an In Review episode can be published. Next: ${nextStep(ep)}.`);
        }
        await openEpisode(ui, ep);
        await statusMove(ui, ep, 'podcast.approve-publish', 'Approve & Publish', 'published', 'The drawer does not offer Approve & Publish.');
        return { ok: true, published: true, episode: episodeJson(live(ep.id)!) };
      },
    },
    enabled,
  );

  useAgentAction<z.infer<typeof episodeArg>>(
    {
      name: 'podcast.unpublish',
      description: 'Take a published episode off the public site (back to In Review).',
      args: episodeArg,
      confirm: (a) => {
        const r = resolveEpisode(a.episode);
        if (!r.hit || r.hit.status !== 'published' || !can('podcast.publish')) return null;
        return `Unpublish ${tag(r.hit)}? It disappears from the public Podcast page and goes back to In Review.`;
      },
      run: async (a, ui) => {
        const ep = mustEpisode(a.episode);
        if (!can('podcast.publish')) throw new Error('Your role cannot unpublish episodes (needs podcast.publish).');
        if (ep.status !== 'published') return { ok: true, unchanged: true, note: `${tag(ep)} is not published.`, episode: episodeJson(ep) };
        await openEpisode(ui, ep);
        await ui.point('podcast.drawer-stages', 'Back to In Review');
        const toasts = watchToasts();
        void usePodcastStore.getState().advanceStatus(ep.id, 'in_review');
        await settleOptimistic(ui, () => live(ep.id)?.status === 'in_review', `Unpublishing ${tag(ep)}`, toasts);
        ui.flash('podcast.drawer-stages');
        return { ok: true, unpublished: true, episode: episodeJson(live(ep.id)!) };
      },
    },
    enabled,
  );

  // ── Guests ────────────────────────────────────────────────────────────────
  const guestArgs = z.object({
    episode: z.string().min(1),
    name: z.string().trim().min(1).max(120),
    title: z.string().max(120).optional(),
    bio: z.string().max(1000).optional(),
  });
  useAgentAction<z.infer<typeof guestArgs>>(
    {
      name: 'podcast.addGuest',
      description: 'Add a guest (name, title, bio) on the episode’s Guests tab.',
      args: guestArgs,
      run: async (a, ui) => {
        const ep = mustEpisode(a.episode);
        const n0 = (ep.guests ?? []).length;
        await openEpisode(ui, ep, 'guests');
        await sleep(150, ui.signal);
        if (!has('podcast.guest-name')) {
          throw new Error(`You cannot edit guests on ${tag(ep)} — it needs podcast.edit and an episode you produced (or Everyone scope).`);
        }
        await ui.type('podcast.guest-name', a.name, { clear: true });
        if (a.title) await ui.type('podcast.guest-title', a.title, { clear: true });
        if (a.bio) await ui.type('podcast.guest-bio', a.bio, { clear: true });
        const toasts = watchToasts();
        await ui.click('podcast.add-guest', 'Add Guest');
        await settleOptimistic(ui, () => (live(ep.id)?.guests ?? []).length > n0, `Adding ${a.name}`, toasts);
        return { ok: true, episode: episodeJson(live(ep.id)!) };
      },
    },
    enabled,
  );

  // ── Distribution ──────────────────────────────────────────────────────────
  const channelArgs = z.object({ episode: z.string().min(1), channels: z.array(z.string()) });
  useAgentAction<z.infer<typeof channelArgs>>(
    {
      name: 'podcast.setChannels',
      description: 'Set exactly which distribution channels an episode goes out on (Distribution tab).',
      args: channelArgs,
      run: async (a, ui) => {
        const ep = mustEpisode(a.episode);
        const want = new Set(a.channels.map(channelId));
        await openEpisode(ui, ep, 'distribution');
        await sleep(150, ui.signal);
        for (const ch of DISTRIBUTION_CHANNELS) {
          const on = (live(ep.id)?.distributionChannels ?? []).includes(ch.id);
          if (on === want.has(ch.id)) continue;
          const btn = anchor(`podcast.channel-${ch.id}`) as HTMLButtonElement | null;
          if (!btn || btn.disabled) {
            throw new Error(`You cannot change channels on ${tag(ep)}${ep.status === 'published' ? ' while it is published' : ' (needs podcast.edit on an episode you can edit)'}.`);
          }
          const toasts = watchToasts();
          await ui.click(`podcast.channel-${ch.id}`, `${want.has(ch.id) ? 'Add' : 'Remove'} ${ch.label}`);
          await settleOptimistic(ui, () => (live(ep.id)?.distributionChannels ?? []).includes(ch.id) === want.has(ch.id), ch.label, toasts, 400);
        }
        return { ok: true, episode: episodeJson(live(ep.id)!) };
      },
    },
    enabled,
  );
}
