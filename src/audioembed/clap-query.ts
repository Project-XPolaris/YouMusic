/** Map short genre/mood words to CLAP-friendly English acoustic captions. */
const STYLE_CAPTIONS: Record<string, string> = {
  rock: 'rock music, electric guitar, drums, energetic band',
  摇滚: 'rock music, electric guitar, drums, energetic band',
  硬摇滚: 'heavy rock guitar riff, drums, energetic band',
  metal: 'heavy metal, distorted guitar, fast drums',
  金属: 'heavy metal, distorted guitar, fast drums',
  重金属: 'heavy metal, distorted guitar, fast drums',
  pop: 'pop music, catchy melody, polished vocal',
  流行: 'pop music, catchy melody, polished vocal',
  jazz: 'jazz music, saxophone, piano, swing rhythm',
  爵士: 'jazz music, saxophone, piano, swing rhythm',
  folk: 'acoustic folk, guitar, intimate vocal',
  民谣: 'acoustic folk, guitar, intimate vocal',
  blues: 'blues music, electric guitar, soulful vocal',
  布鲁斯: 'blues music, electric guitar, soulful vocal',
  punk: 'punk rock, fast drums, electric guitar, shout vocal',
  朋克: 'punk rock, fast drums, electric guitar, shout vocal',
  classical: 'classical orchestra, strings, symphony',
  古典: 'classical orchestra, strings, symphony',
  electronic: 'electronic dance music, synthesizer, beat',
  电子: 'electronic dance music, synthesizer, beat',
  hiphop: 'hip hop, rap vocal, beat, bass',
  'hip hop': 'hip hop, rap vocal, beat, bass',
  'hip-hop': 'hip hop, rap vocal, beat, bass',
  说唱: 'hip hop, rap vocal, beat, bass',
  rap: 'hip hop, rap vocal, beat, bass',
  ambient: 'ambient music, atmospheric pads, calm',
  氛围: 'ambient music, atmospheric pads, calm',
  asmr: 'whispered close-up voice, intimate spoken audio',
  音声: 'whispered japanese voice, intimate spoken audio',
};

export type PreparedClapQuery = {
  /** Caption shown in UI (no CLAP template prefix). */
  display: string;
  /** Text actually sent to embed-text. */
  embedText: string;
  expanded: boolean;
};

function dictCaption(raw: string): string | undefined {
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return STYLE_CAPTIONS[key] || STYLE_CAPTIONS[raw.trim()];
}

function wrapSoundOf(text: string): string {
  const t = text.trim().replace(/[.。]+$/, '');
  if (/^this is a sound of\b/i.test(t)) {
    return t.endsWith('.') ? t : `${t}.`;
  }
  return `This is a sound of ${t}.`;
}

/**
 * Turn a user query into text CLAP actually understands.
 * One-word "rock" matches spoken/ASMR audio; "rock music + guitar/drums"
 * ranks real bands.
 */
export function prepareClapQuery(
  original: string,
  llmRewritten?: string,
): PreparedClapQuery {
  const q = (original || '').trim();
  const llm = (llmRewritten || '').trim();
  const fromDict = dictCaption(q);

  let display = q;
  let expanded = false;

  const llmUseful =
    llm &&
    llm.toLowerCase() !== q.toLowerCase() &&
    (llm.split(/\s+/).length >= 3 || llm.length >= 12);

  if (llmUseful) {
    display = llm;
    expanded = true;
  } else if (fromDict) {
    display = fromDict;
    expanded = true;
  } else if (/^[A-Za-z][A-Za-z-]{1,16}$/.test(q) && !/\bmusic\b/i.test(q)) {
    display = `${q} music`;
    expanded = true;
  }

  return {
    display,
    embedText: wrapSoundOf(display),
    expanded: expanded || display !== q,
  };
}

export function lexicalBoost(
  originalQuery: string,
  fields: Array<string | undefined | null>,
): number {
  const q = (originalQuery || '').trim().toLowerCase();
  if (!q) return 0;
  const tokens = q
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 3);
  if (/[\u4e00-\u9fff]/.test(q) && q.length >= 2 && !tokens.includes(q)) {
    tokens.push(q);
  }
  if (!tokens.length) return 0;
  const hay = fields
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  let boost = 0;
  for (const t of tokens) {
    if (hay.includes(t)) boost += 0.08;
  }
  return Math.min(0.2, boost);
}

export function diversifyByArtist<
  T extends { music: { id: number; artist?: Array<{ name?: string }> } },
>(items: T[], limit: number, maxPerArtist = 3): T[] {
  if (items.length <= limit) {
    // still cap so one artist cannot fill a short list
  }
  const picked: T[] = [];
  const leftover: T[] = [];
  const counts = new Map<string, number>();
  const artistKey = (m: T['music']) => {
    const name = (m.artist || []).map((a) => a.name).find(Boolean);
    return name || `id:${m.id}`;
  };
  for (const item of items) {
    const key = artistKey(item.music);
    const n = counts.get(key) || 0;
    if (n < maxPerArtist) {
      picked.push(item);
      counts.set(key, n + 1);
      if (picked.length >= limit) return picked;
    } else {
      leftover.push(item);
    }
  }
  for (const item of leftover) {
    if (picked.length >= limit) break;
    picked.push(item);
  }
  return picked;
}
