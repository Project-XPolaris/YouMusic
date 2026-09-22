import * as fs from 'fs';
import * as path from 'path';
import { replaceExt } from './string';

/** LRC path always matches the audio basename: song.mp3 -> song.lrc */
export function resolveLrcPath(musicFilePath: string): string {
  return replaceExt(musicFilePath, '.lrc');
}

/**
 * music-metadata v7 exposes common.lyrics as string[].
 * Newer shapes may nest text; be defensive.
 */
export function extractEmbeddedLyrics(common: {
  lyrics?: unknown;
}): string | undefined {
  const raw = common?.lyrics;
  if (!raw) return undefined;

  const parts: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) parts.push(trimmed);
      return;
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (typeof obj.text === 'string' && obj.text.trim()) {
        parts.push(obj.text.trim());
      } else if (typeof obj.lyrics === 'string' && obj.lyrics.trim()) {
        parts.push(obj.lyrics.trim());
      }
    }
  };

  if (Array.isArray(raw)) {
    for (const item of raw) push(item);
  } else {
    push(raw);
  }

  if (parts.length === 0) return undefined;
  return parts.join('\n\n');
}

export async function writeLrcBesideAudio(
  musicFilePath: string,
  content: string,
): Promise<string> {
  const lrcPath = resolveLrcPath(musicFilePath);
  await fs.promises.mkdir(path.dirname(lrcPath), { recursive: true });
  await fs.promises.writeFile(lrcPath, content, 'utf8');
  return lrcPath;
}

export async function readLrcIfExists(
  musicFilePath: string,
): Promise<{ path: string; content: string } | null> {
  const lrcPath = resolveLrcPath(musicFilePath);
  try {
    if (!fs.existsSync(lrcPath)) return null;
    const content = await fs.promises.readFile(lrcPath, 'utf8');
    if (!content.trim()) return null;
    return { path: lrcPath, content };
  } catch {
    return null;
  }
}
