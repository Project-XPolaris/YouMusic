import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SearchMusicEntity } from '../meta/meta.entites';

type LrcLibSearchHit = {
  id: number;
  trackName?: string;
  name?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

@Injectable()
export class LrclibService {
  private readonly logger = new Logger(LrclibService.name);
  private readonly baseUrl = 'https://lrclib.net';
  private readonly userAgent =
    'PolarisYouMusic/1.0 (https://github.com/ProjectXPolaris)';

  constructor(private readonly http: HttpService) {}

  async search(params: {
    q?: string;
    trackName?: string;
    artistName?: string;
    albumName?: string;
  }): Promise<SearchMusicEntity[]> {
    const query: Record<string, string> = {};
    if (params.q?.trim()) {
      query.q = params.q.trim();
    } else if (params.trackName?.trim()) {
      query.track_name = params.trackName.trim();
      if (params.artistName?.trim()) {
        query.artist_name = params.artistName.trim();
      }
      if (params.albumName?.trim()) {
        query.album_name = params.albumName.trim();
      }
    } else {
      return [];
    }

    try {
      const response = await firstValueFrom(
        this.http.get<LrcLibSearchHit[]>(`${this.baseUrl}/api/search`, {
          params: query,
          headers: { 'User-Agent': this.userAgent },
          timeout: 15000,
        }),
      );
      const hits = Array.isArray(response.data) ? response.data : [];
      return hits
        .filter((hit) => hit?.id != null && !hit.instrumental)
        .filter((hit) => !!(hit.syncedLyrics || hit.plainLyrics))
        .map((hit) => ({
          id: String(hit.id),
          name: hit.trackName || hit.name || '',
          artists: hit.artistName
            ? [{ name: hit.artistName }]
            : [],
          albumName: hit.albumName,
          duration: hit.duration,
          hasSynced: !!hit.syncedLyrics?.trim(),
          source: 'LRCLIB',
        }));
    } catch (err) {
      this.logger.warn(`LRCLIB search failed: ${(err as Error).message}`);
      return [];
    }
  }

  async getLyric(id: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.get<LrcLibSearchHit>(`${this.baseUrl}/api/get/${id}`, {
          headers: { 'User-Agent': this.userAgent },
          timeout: 15000,
        }),
      );
      const data = response.data;
      const synced = data?.syncedLyrics?.trim();
      if (synced) return synced;
      const plain = data?.plainLyrics?.trim();
      if (plain) return plain;
      return '';
    } catch (err) {
      this.logger.warn(`LRCLIB getLyric failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
