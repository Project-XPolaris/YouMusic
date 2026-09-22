import { Injectable, Logger } from '@nestjs/common';

import {
  AlbumMeta,
  SearchAlbumEntity,
  SearchMusicEntity,
} from './meta.entites';
import { NeteasemusicService } from '../neteasemusic/neteasemusic.service';
import { SearchType } from 'NeteaseCloudMusicApi';
import { mbApi } from '../mb';
import { HttpService } from '@nestjs/axios';
import { LrclibService } from '../lrclib/lrclib.service';
import {
  LYRIC_AUTO_APPLY_MIN_SCORE,
  LYRIC_AUTO_APPLY_MIN_TIMED,
  scoreLyricHit,
  scoreWithLyricContent,
} from '../utils/lyric-match';

interface NeteaseSearchSongResult {
  id: number;
  name: string;
  artists: { name: string }[];
}

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);

  constructor(
    private neteaseMusicService: NeteasemusicService,
    private http: HttpService,
    private lrclibService: LrclibService,
  ) {}

  async searchAlbum(
    key: string,
    { artist, source }: { artist?: string; source?: string },
  ): Promise<SearchAlbumEntity[]> {
    const result: SearchAlbumEntity[] = [];
    if (source === undefined || source === 'NeteaseMusic') {
      const neteaseResult = await this.neteaseMusicService.search(key, {
        type: SearchType.album,
        artist,
      });
      const neteaseMusicResult = neteaseResult.albums.map((it) => ({
        id: it.id.toString(),
        name: it.name,
        cover: it.picUrl,
        artists: it.artist?.name,
        source: 'NeteaseMusic',
      }));
      result.push(...neteaseMusicResult);
    }
    if (source === undefined || source === 'MusicBrainz') {
      const mbResult = await mbApi.searchRelease({
        query: key,
        artist: artist,
      });
      const mbMusicResult: SearchAlbumEntity[] = mbResult.releases.map(
        (it) => ({
          id: it.id,
          name: it.title,
          artists: it['artist-credit'].map((artist) => artist.name).join('/'),
          source: 'MusicBrain',
          releaseDate: it.date,
        }),
      );
      result.push(...mbMusicResult);
    }
    return result;
  }
  async getAlbumDetail(ids: {
    mbId?: string;
    nemId?: string;
  }): Promise<AlbumMeta> {
    const album: AlbumMeta = {};
    if (ids.mbId) {
      album.mbId = ids.mbId;
      const mbAlbum = await mbApi.lookupRelease(ids.mbId, ['artists']);
      album.name = mbAlbum.title;
      album.artist = mbAlbum['artist-credit'].map((it) => it.name).join('/');
      const dateStr = String((mbAlbum as any).date || '').trim();
      const yearMatch = dateStr.match(/^(\d{4})/);
      if (yearMatch) {
        album.year = Number(yearMatch[1]);
      }
      try {
        const response = await this.http
          .get(`http://coverartarchive.org/release/${ids.mbId}`, {
            proxy: {
              protocol: 'http',
              host: '127.0.0.1',
              port: 7890,
            },
          })
          .toPromise();
        const images = response.data?.images || [];
        let coverImage = images.find((it: any) => it.front);
        if (!coverImage && images.length) {
          coverImage = images[0];
        }
        if (coverImage) {
          album.cover = coverImage.image;
        }
      } catch (e) {
        this.logger.warn(
          `cover art archive mb=${ids.mbId}: ${(e as Error).message}`,
        );
      }
      return album;
    }
    if (ids.nemId) {
      album.nemId = ids.nemId;
      const nemAlbum = await this.neteaseMusicService.getAlbumWithId(ids.nemId);
      const data = nemAlbum?.body?.album;
      if (data) {
        album.name = data.name;
        album.artist = data.artist?.name;
        album.cover = data.picUrl;
        const desc = String(data.description || data.briefDesc || '').trim();
        if (desc) {
          album.description = desc.slice(0, 8000);
        }
        if (data.publishTime) {
          const y = new Date(Number(data.publishTime)).getFullYear();
          if (y > 1900 && y < 2100) album.year = y;
        } else if (data.year) {
          const y = Number(data.year);
          if (y > 1900 && y < 2100) album.year = y;
        }
      }
      return album;
    }
    return album;
  }

  async searchArtist(key: string) {
    const result = await this.neteaseMusicService.search(key, {
      type: SearchType.artist,
    });
    return result;
  }

  async searchMusic(
    name: string,
    opts?: {
      artist?: string;
      album?: string;
      sources?: string[];
    },
  ): Promise<SearchMusicEntity[]> {
    const musicResult: SearchMusicEntity[] = [];
    const sources = opts?.sources?.length
      ? opts.sources
      : ['LRCLIB', 'NeteaseMusic'];
    const query = [name, opts?.artist].filter(Boolean).join(' ').trim();

    if (sources.includes('LRCLIB')) {
      const lrclibHits = await this.lrclibService.search(
        opts?.artist || opts?.album
          ? {
              trackName: name,
              artistName: opts?.artist,
              albumName: opts?.album,
            }
          : {
              q: query || name,
              trackName: name,
              artistName: opts?.artist,
              albumName: opts?.album,
            },
      );
      musicResult.push(...lrclibHits);
    }

    if (sources.includes('NeteaseMusic')) {
      try {
        const {
          songs,
        }: {
          songs: NeteaseSearchSongResult[];
        } = await this.neteaseMusicService.search(query || name, {
          type: SearchType.single,
        });
        if (songs) {
          musicResult.push(
            ...songs.map((it) => ({
              id: it.id.toString(),
              name: it.name,
              artists: it.artists.map((itArtist) => ({ name: itArtist.name })),
              source: 'NeteaseMusic',
            })),
          );
        }
      } catch (err) {
        this.logger.warn(
          `Netease music search failed: ${(err as Error).message}`,
        );
      }
    }

    return musicResult;
  }

  async getLyricFromSearchMusic(
    searchMusic: SearchMusicEntity,
  ): Promise<string> {
    if (searchMusic.source === 'NeteaseMusic') {
      return await this.neteaseMusicService.getLyric(searchMusic.id);
    }
    if (searchMusic.source === 'LRCLIB') {
      return await this.lrclibService.getLyric(searchMusic.id);
    }
    throw new Error('target source unsupport get lyric');
  }

  /**
   * Search online lyric providers, score by title/artist/duration/synced quality.
   * Returns ranked candidates; `best` is set when auto-apply threshold is met.
   */
  async findBestOnlineLyric(input: {
    title: string;
    artist?: string;
    album?: string;
    duration?: number;
  }): Promise<{
    best?: {
      content: string;
      source: string;
      score: number;
      trackName: string;
      artists: string;
      timedCount: number;
    };
    candidates: Array<{
      id: string;
      source: string;
      name: string;
      artists: string;
      albumName?: string;
      duration?: number;
      score: number;
      hasSynced?: boolean;
      timedCount?: number;
      syncedOk?: boolean;
    }>;
  }> {
    const hits = await this.searchMusic(input.title, {
      artist: input.artist,
      album: input.album,
      sources: ['LRCLIB', 'NeteaseMusic'],
    });

    const scored = hits
      .map((hit) => scoreLyricHit(input, hit))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const candidates: Array<{
      id: string;
      source: string;
      name: string;
      artists: string;
      albumName?: string;
      duration?: number;
      score: number;
      hasSynced?: boolean;
      timedCount?: number;
      syncedOk?: boolean;
      content?: string;
    }> = [];

    // Fetch lyrics for top hits to refine score (prefer already-synced LRCLIB).
    const fetchBudget = Math.min(5, scored.length);
    for (let i = 0; i < fetchBudget; i++) {
      const hit = scored[i];
      try {
        const content = (await this.getLyricFromSearchMusic(hit)).trim();
        if (!content) continue;
        const refined = scoreWithLyricContent(input, hit, content);
        candidates.push({
          id: refined.id,
          source: refined.source,
          name: refined.name,
          artists: (refined.artists || []).map((a) => a.name).join(', '),
          albumName: refined.albumName,
          duration: refined.duration,
          score: refined.score,
          hasSynced: refined.hasSynced || refined.syncedOk,
          timedCount: refined.timedCount,
          syncedOk: refined.syncedOk,
          content,
        });
      } catch (err) {
        this.logger.warn(
          `fetch lyric failed ${hit.source}/${hit.id}: ${(err as Error).message}`,
        );
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    const top = candidates[0];
    let best: {
      content: string;
      source: string;
      score: number;
      trackName: string;
      artists: string;
      timedCount: number;
    } | undefined;

    if (
      top?.content &&
      top.score >= LYRIC_AUTO_APPLY_MIN_SCORE &&
      (top.timedCount || 0) >= LYRIC_AUTO_APPLY_MIN_TIMED &&
      top.syncedOk
    ) {
      best = {
        content: top.content,
        source: top.source,
        score: top.score,
        trackName: top.name,
        artists: top.artists,
        timedCount: top.timedCount || 0,
      };
    }

    return {
      best,
      candidates: candidates.map(({ content: _c, ...rest }) => rest),
    };
  }
}
