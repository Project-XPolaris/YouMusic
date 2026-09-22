/** Normalize titles/artists for fuzzy lyric matching. */
export function normalizeMusicName(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u3000]/g, ' ')
    .replace(/[（(【\[].*?[）)\]】]/g, ' ')
    .replace(/\b(feat\.?|ft\.?|featuring|with)\b.*$/i, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dice coefficient on character bigrams. */
export function stringSimilarity(a: string, b: string): number {
  const left = normalizeMusicName(a);
  const right = normalizeMusicName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }
  const bigrams = (s: string) => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      map.set(g, (map.get(g) || 0) + 1);
    }
    return map;
  };
  const A = bigrams(left);
  const B = bigrams(right);
  let overlap = 0;
  for (const [g, n] of A) {
    const m = B.get(g);
    if (m) overlap += Math.min(n, m);
  }
  const total = Math.max(1, left.length - 1) + Math.max(1, right.length - 1);
  return (2 * overlap) / total;
}

export type TimedLyricStats = {
  timedCount: number;
  lastTs: number;
  firstTs: number;
  monotone: boolean;
  coverRatio: number;
  ok: boolean;
};

const LRC_LINE = /^\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\](.*)$/;

function fracToSec(frac: string): number {
  if (!frac) return 0;
  if (frac.length === 1) return Number(frac) / 10;
  if (frac.length === 2) return Number(frac) / 100;
  return Number(frac.padEnd(3, '0').slice(0, 3)) / 1000;
}

export function analyzeSyncedLyric(
  content: string,
  durationSec?: number,
): TimedLyricStats {
  const times: number[] = [];
  for (const row of (content || '').split(/\r?\n/)) {
    const m = row.trim().match(LRC_LINE);
    if (!m) continue;
    const text = (m[4] || '').trim();
    if (!text) continue;
    const t =
      Number(m[1]) * 60 + Number(m[2]) + fracToSec(m[3] || '');
    if (Number.isFinite(t)) times.push(t);
  }
  times.sort((a, b) => a - b);
  let monotone = true;
  for (let i = 1; i < times.length; i++) {
    if (times[i] + 0.001 < times[i - 1]) {
      monotone = false;
      break;
    }
  }
  const firstTs = times[0] ?? 0;
  const lastTs = times[times.length - 1] ?? 0;
  const dur = durationSec && durationSec > 0 ? durationSec : 0;
  const coverRatio = dur > 0 ? Math.min(1, lastTs / dur) : times.length >= 5 ? 0.8 : 0;
  const ok =
    times.length >= 5 &&
    monotone &&
    (dur <= 0 || (lastTs <= dur + 12 && coverRatio >= 0.45));
  return {
    timedCount: times.length,
    lastTs,
    firstTs,
    monotone,
    coverRatio,
    ok,
  };
}

export type LyricMatchInput = {
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
};

export type LyricMatchHit = {
  id: string;
  name: string;
  artists: { name: string }[];
  albumName?: string;
  duration?: number;
  source: string;
  hasSynced?: boolean;
};

export type ScoredLyricHit = LyricMatchHit & {
  score: number;
  titleSim: number;
  artistSim: number;
  durationDiff?: number;
};

/** Score a search hit before fetching full lyric (0~1). */
export function scoreLyricHit(
  music: LyricMatchInput,
  hit: LyricMatchHit,
): ScoredLyricHit {
  const titleSim = stringSimilarity(music.title, hit.name);
  const artistLeft = music.artist || '';
  const artistRight = (hit.artists || []).map((a) => a.name).join(' ');
  const artistSim = artistLeft
    ? stringSimilarity(artistLeft, artistRight)
    : 0.55;

  let durationScore = 0.55;
  let durationDiff: number | undefined;
  if (
    music.duration != null &&
    music.duration > 0 &&
    hit.duration != null &&
    hit.duration > 0
  ) {
    durationDiff = Math.abs(music.duration - hit.duration);
    if (durationDiff <= 1.5) durationScore = 1;
    else if (durationDiff <= 3) durationScore = 0.85;
    else if (durationDiff <= 5) durationScore = 0.55;
    else if (durationDiff <= 10) durationScore = 0.25;
    else durationScore = 0.05;
  }

  const syncedBonus = hit.hasSynced ? 0.12 : 0;
  const sourceBonus = hit.source === 'LRCLIB' ? 0.04 : 0;
  const albumBonus =
    music.album && hit.albumName
      ? stringSimilarity(music.album, hit.albumName) * 0.06
      : 0;

  const base =
    titleSim * 0.4 + artistSim * 0.28 + durationScore * 0.2 + syncedBonus + sourceBonus + albumBonus;

  // Hard penalty: clearly different duration
  let score = Math.min(1, base);
  if (durationDiff != null && durationDiff > 8) {
    score *= 0.35;
  }

  return {
    ...hit,
    score,
    titleSim,
    artistSim,
    durationDiff,
  };
}

/** Re-score after fetching lyric content. */
export function scoreWithLyricContent(
  music: LyricMatchInput,
  hit: ScoredLyricHit,
  content: string,
): ScoredLyricHit & { syncedOk: boolean; timedCount: number } {
  const stats = analyzeSyncedLyric(content, music.duration);
  let score = hit.score;
  if (stats.ok) {
    score = Math.min(1, score + 0.1 + stats.coverRatio * 0.06);
  } else if (stats.timedCount === 0) {
    score *= 0.55; // plain text only
  } else if (!stats.monotone || stats.timedCount < 5) {
    score *= 0.7;
  } else if (music.duration && stats.coverRatio < 0.4) {
    score *= 0.65;
  }
  return {
    ...hit,
    score,
    syncedOk: stats.ok,
    timedCount: stats.timedCount,
  };
}

/** Thresholds for silent auto-apply. */
export const LYRIC_AUTO_APPLY_MIN_SCORE = 0.78;
export const LYRIC_AUTO_APPLY_MIN_TIMED = 5;
