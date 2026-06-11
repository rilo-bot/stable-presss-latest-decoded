import { useRef, useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { PodcastEpisode } from '@/types/podcast';
import { useArticleStore } from '@/stores/articleStore';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

interface PodcastPlayerProps {
  episode: PodcastEpisode;
  isActive: boolean;
  onActivate: () => void;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatPublished(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

// Circular progress ring SVG
function ProgressRing({
  progress,
  playing,
}: {
  progress: number;
  playing: boolean;
}) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const safeProgress = isNaN(progress) || !isFinite(progress) ? 0 : Math.min(1, Math.max(0, progress));
  const strokeDashoffset = circumference - safeProgress * circumference;

  return (
    <div className="relative flex items-center justify-center w-12 h-12 flex-shrink-0">
      {/* Background track */}
      <svg
        className="absolute inset-0 w-full h-full -rotate-90"
        viewBox="0 0 48 48"
        aria-hidden="true"
      >
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="2"
        />
        {/* Accent progress ring */}
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="hsl(var(--brand-accent))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-300"
        />
      </svg>
      {/* Play/pause button */}
      <div
        className="relative z-10 flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90 transition-colors select-none"
        role="button"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor" aria-hidden="true">
            <rect x="0" y="0" width="4" height="14" rx="1" />
            <rect x="8" y="0" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg
            width="11"
            height="13"
            viewBox="0 0 11 13"
            fill="currentColor"
            style={{ marginLeft: 2 }}
            aria-hidden="true"
          >
            <path d="M0 0L11 6.5L0 13V0Z" />
          </svg>
        )}
      </div>
    </div>
  );
}

export function PodcastPlayer({ episode, isActive, onActivate }: PodcastPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [canPlay, setCanPlay] = useState(false);

  const articles = useArticleStore((s) => s.articles);

  const relatedArticles = useMemo(() => {
    const ids = episode?.relatedArticleIds ?? [];
    return (articles ?? []).filter(
      (a) => ids.includes(a.id) && a.status === 'published'
    );
  }, [articles, episode?.relatedArticleIds]);

  // Pause when no longer active
  useEffect(() => {
    if (!isActive && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
    }
  }, [isActive]);

  const handleTogglePlay = () => {
    const audio = audioRef.current;

    // If there's no valid audio source, do nothing safely
    if (!episode?.audioUrl) return;

    if (!isActive) {
      onActivate();
    }

    if (!audio) return;

    if (audio.paused) {
      audio.play().catch(() => {
        // Silently swallow autoplay / source errors
        setPlaying(false);
      });
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const duration = audio.duration;
    if (!duration || isNaN(duration) || !isFinite(duration) || duration === 0) return;
    const ratio = audio.currentTime / duration;
    setProgress(isFinite(ratio) ? ratio : 0);
    setCurrentTime(audio.currentTime ?? 0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const duration = audio.duration;
    if (!duration || isNaN(duration) || !isFinite(duration) || duration === 0) return;
    const ratio = parseFloat(e.target.value);
    if (isNaN(ratio)) return;
    audio.currentTime = ratio * duration;
    setProgress(ratio);
  };

  const handleEnded = () => {
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
  };

  const handleCanPlay = () => {
    setCanPlay(true);
  };

  const handleError = () => {
    setPlaying(false);
    setCanPlay(false);
  };

  // Guard: episode must exist
  if (!episode) return null;

  const durationDisplay = formatTime(episode.durationSeconds ?? 0);
  const currentDisplay = formatTime(Math.floor(currentTime));
  const seasonLabel = episode.season != null ? `S${episode.season}` : null;
  const epLabel = episode.episodeNumber != null ? `Ep ${episode.episodeNumber}` : null;
  const metaLabel = [seasonLabel, epLabel].filter(Boolean).join(' · ');

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        'border rounded-sm bg-card overflow-hidden transition-colors',
        isActive ? 'border-primary/40' : 'border-border'
      )}
    >
      {/* Main row */}
      <div className="flex gap-4 p-5">
        {/* Cover art */}
        {episode.coverUrl ? (
          <div className="hidden sm:block flex-shrink-0">
            <img
              src={episode.coverUrl}
              alt={episode.title ?? 'Episode cover'}
              crossOrigin="anonymous"
              className="w-16 h-16 rounded-sm object-cover"
            />
          </div>
        ) : null}

        {/* Player + meta */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {/* Season / Ep label */}
          {(metaLabel || episode.publishedAt) && (
            <div className="flex items-center gap-2 flex-wrap">
              {metaLabel ? (
                <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {metaLabel}
                </span>
              ) : null}
              {metaLabel && episode.publishedAt ? (
                <span className="text-[10px] text-muted-foreground">·</span>
              ) : null}
              {episode.publishedAt ? (
                <span className="text-[10px] text-muted-foreground">
                  {formatPublished(episode.publishedAt)}
                </span>
              ) : null}
            </div>
          )}

          <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground leading-snug">
            {episode.title ?? 'Untitled Episode'}
          </h3>

          {episode.description ? (
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {episode.description}
            </p>
          ) : null}

          {/* Player controls row */}
          <div className="flex items-center gap-3 mt-1">
            {/* Circular play button — only clickable when there's an audio URL */}
            <div
              onClick={episode.audioUrl ? handleTogglePlay : undefined}
              style={{ opacity: episode.audioUrl ? 1 : 0.4, cursor: episode.audioUrl ? 'pointer' : 'default' }}
            >
              <ProgressRing progress={progress} playing={playing && isActive} />
            </div>

            {/* Scrubber + time */}
            <div className="flex-1 min-w-0">
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={isFinite(progress) ? progress : 0}
                onChange={handleSeek}
                disabled={!canPlay}
                className="w-full h-1 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Seek position"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1 tabular-nums font-[family-name:var(--font-display)]">
                <span>{currentDisplay}</span>
                <span
                  style={{ color: 'hsl(var(--brand-accent))' }}
                  className="font-bold"
                >
                  {durationDisplay}
                </span>
              </div>
            </div>

            {/* Host */}
            {episode.host ? (
              <div className="hidden md:block text-right flex-shrink-0">
                <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Host</div>
                <div className="text-xs font-medium text-foreground">{episode.host}</div>
              </div>
            ) : null}
          </div>

          {/* No audio warning */}
          {!episode.audioUrl ? (
            <p className="text-[10px] text-muted-foreground italic mt-0.5">
              No audio file attached yet.
            </p>
          ) : null}
        </div>
      </div>

      {/* Related articles */}
      {relatedArticles.length > 0 ? (
        <>
          <div className="h-px bg-border/60 mx-5" />
          <div className="px-5 py-3">
            <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-2">
              Related Reading
            </p>
            <div className="flex flex-col gap-1.5">
              {relatedArticles.map((article) => (
                <Link
                  key={article.id}
                  to={`/articles/${article.id}`}
                  className="flex items-center gap-2 group"
                >
                  <ArrowRight
                    size={11}
                    className="text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0"
                  />
                  <span className="text-sm font-[family-name:var(--font-display)] text-foreground group-hover:text-primary transition-colors leading-snug">
                    {article.title ?? ''}
                  </span>
                  {article.category ? (
                    <span className="hidden sm:inline text-[10px] text-muted-foreground uppercase tracking-[0.06em] ml-auto flex-shrink-0">
                      {article.category}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {/* Hidden audio element — only rendered when there is a valid src */}
      {episode.audioUrl ? (
        <audio
          ref={audioRef}
          src={episode.audioUrl}
          preload="metadata"
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onCanPlay={handleCanPlay}
          onError={handleError}
        />
      ) : null}
    </motion.article>
  );
}
