import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, In } from 'typeorm';
import { MeiliSearch, Index } from 'meilisearch';
import { Music } from '../database/entites/music';
import { Album } from '../database/entites/album';
import { Artist } from '../database/entites/artist';
import { MediaLibrary } from '../database/entites/library';

export const TRACKS_INDEX = 'youmusic_tracks';
export const ALBUMS_INDEX = 'youmusic_albums';
export const ARTISTS_INDEX = 'youmusic_artists';

const SEARCH_LIMIT = 1000;
const UPSERT_BATCH = 500;

export type TrackDoc = {
  id: number;
  title: string;
  albumName: string;
  artistNames: string[];
  path: string;
  genreNames: string[];
  tagNames: string[];
  vocalType: string | null;
  libraryId: number;
  albumId: number | null;
  artistIds: number[];
  year: number | null;
  hasLyric: boolean;
  plainLyric?: string;
};

export type AlbumDoc = {
  id: number;
  name: string;
  albumArtist: string;
  libraryId: number | null;
};

export type ArtistDoc = {
  id: number;
  name: string;
};

export type LibraryIndexStatus = {
  libraryId: number;
  name: string;
  path: string;
  trackDb: number;
  trackIndex: number;
  albumDb: number;
  albumIndex: number;
  status: 'synced' | 'drift' | 'unavailable' | string;
};

export type SearchIndexStatus = {
  enable: boolean;
  searchEngine: string;
  healthy: boolean;
  health: string;
  host: string;
  trackIndexTotal: number;
  albumIndexTotal: number;
  artistIndexTotal: number;
  driftCount: number;
  libraries: LibraryIndexStatus[];
  message?: string;
};

@Injectable()
export class MeilisearchService implements OnModuleInit {
  private readonly logger = new Logger(MeilisearchService.name);
  private client: MeiliSearch | null = null;
  enable = false;
  host = '';
  searchEngine = 'database';

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.initClient();
    if (!this.enable) {
      return;
    }
    void this.reconcileAll().catch((e) =>
      this.logger.warn(`startup reconcile failed: ${(e as Error).message}`),
    );
  }

  private parseBool(v: unknown, fallback = false): boolean {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(s)) return true;
      if (['0', 'false', 'no', 'off', ''].includes(s)) return false;
    }
    return fallback;
  }

  private async initClient() {
    this.searchEngine =
      this.configService.get<string>('searchEngine') || 'database';
    this.enable = this.parseBool(
      this.configService.get('meilisearch.enable'),
      false,
    );
    this.host = this.configService.get<string>('meilisearch.host') || '';
    const apiKey =
      this.configService.get<string>('meilisearch.apiKey') ||
      this.configService.get<string>('meilisearch.apikey') ||
      '';

    if (!this.enable || !this.host) {
      this.enable = false;
      this.logger.log('meilisearch disabled');
      return;
    }

    try {
      this.client = new MeiliSearch({ host: this.host, apiKey });
      const health = await this.client.health();
      this.logger.log(`meilisearch connected: ${health.status} @ ${this.host}`);
      await this.ensureIndexes();
    } catch (e) {
      this.enable = false;
      this.client = null;
      this.logger.warn(
        `meilisearch init failed, fallback to database: ${(e as Error).message}`,
      );
    }
  }

  private async ensureIndexes() {
    if (!this.client) return;
    const specs: Array<{
      uid: string;
      searchable: string[];
      filterable: string[];
    }> = [
      {
        uid: TRACKS_INDEX,
        searchable: [
          'title',
          'albumName',
          'artistNames',
          'genreNames',
          'tagNames',
          'vocalType',
          'plainLyric',
          'path',
        ],
        filterable: [
          'libraryId',
          'albumId',
          'artistIds',
          'year',
          'hasLyric',
          'vocalType',
          'tagNames',
          'genreNames',
        ],
      },
      {
        uid: ALBUMS_INDEX,
        searchable: ['name', 'albumArtist'],
        filterable: ['libraryId'],
      },
      {
        uid: ARTISTS_INDEX,
        searchable: ['name'],
        filterable: [],
      },
    ];

    for (const spec of specs) {
      try {
        await this.client.createIndex(spec.uid, { primaryKey: 'id' });
      } catch {
        // already exists
      }
      const index = this.client.index(spec.uid);
      await index.updateSearchableAttributes(spec.searchable);
      if (spec.filterable.length > 0) {
        await index.updateFilterableAttributes(spec.filterable);
      }
    }
  }

  private index(uid: string): Index | null {
    if (!this.enable || !this.client) return null;
    return this.client.index(uid);
  }

  /** Search and return matching document ids (relevance order). */
  async searchIds(
    indexUid: string,
    query: string,
    opts?: { filter?: string | string[]; limit?: number },
  ): Promise<number[] | null> {
    const idx = this.index(indexUid);
    if (!idx) return null;
    const q = (query || '').trim();
    if (!q) return null;
    try {
      const res = await idx.search(q, {
        limit: opts?.limit ?? SEARCH_LIMIT,
        filter: opts?.filter,
        attributesToRetrieve: ['id'],
      });
      return (res.hits || [])
        .map((h: any) => Number(h.id))
        .filter((id) => Number.isFinite(id) && id > 0);
    } catch (e) {
      this.logger.warn(
        `meili search ${indexUid} failed: ${(e as Error).message}`,
      );
      return null;
    }
  }

  /** Detailed search on tracks with snippet & highlight */
  async searchTracksDetailed(
    query: string,
    opts?: { filter?: string | string[]; limit?: number },
  ): Promise<Array<{ id: number; snippet?: string }> | null> {
    const idx = this.index(TRACKS_INDEX);
    if (!idx) return null;
    const q = (query || '').trim();
    if (!q) return null;
    try {
      const res = await idx.search(q, {
        limit: opts?.limit ?? 50,
        filter: opts?.filter,
        attributesToRetrieve: ['id', 'title', 'plainLyric'],
        attributesToHighlight: ['plainLyric'],
      });
      return (res.hits || [])
        .map((h: any) => ({
          id: Number(h.id),
          snippet: (h._formatted?.plainLyric || h.plainLyric || '').trim() || undefined,
        }))
        .filter((item: any) => Number.isFinite(item.id) && item.id > 0);
    } catch (e) {
      this.logger.warn(
        `meili search tracks detailed failed: ${(e as Error).message}`,
      );
      return null;
    }
  }

  notifyTrackUpsert(...ids: number[]) {
    if (!this.enable || ids.length === 0) return;
    void this.upsertTracksByIds(ids).catch((e) =>
      this.logger.warn(`track upsert failed: ${(e as Error).message}`),
    );
  }

  notifyTrackDelete(...ids: number[]) {
    if (!this.enable || ids.length === 0) return;
    void this.deleteDocs(TRACKS_INDEX, ids).catch((e) =>
      this.logger.warn(`track delete failed: ${(e as Error).message}`),
    );
  }

  notifyAlbumUpsert(...ids: number[]) {
    if (!this.enable || ids.length === 0) return;
    void this.upsertAlbumsByIds(ids).catch((e) =>
      this.logger.warn(`album upsert failed: ${(e as Error).message}`),
    );
  }

  notifyAlbumDelete(...ids: number[]) {
    if (!this.enable || ids.length === 0) return;
    void this.deleteDocs(ALBUMS_INDEX, ids).catch((e) =>
      this.logger.warn(`album delete failed: ${(e as Error).message}`),
    );
  }

  notifyArtistUpsert(...ids: number[]) {
    if (!this.enable || ids.length === 0) return;
    void this.upsertArtistsByIds(ids).catch((e) =>
      this.logger.warn(`artist upsert failed: ${(e as Error).message}`),
    );
  }

  notifyArtistDelete(...ids: number[]) {
    if (!this.enable || ids.length === 0) return;
    void this.deleteDocs(ARTISTS_INDEX, ids).catch((e) =>
      this.logger.warn(`artist delete failed: ${(e as Error).message}`),
    );
  }

  private async deleteDocs(indexUid: string, ids: number[]) {
    const idx = this.index(indexUid);
    if (!idx || ids.length === 0) return;
    await idx.deleteDocuments(ids.map(String));
  }

  private stripLrc(lrc: string): string {
    if (!lrc) return '';
    return lrc
      .replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private musicToDoc(m: Music): TrackDoc {
    const rawLyric = (m.lyric || '').trim();
    const plainLyric = this.stripLrc(rawLyric);
    return {
      id: m.id,
      title: m.title || '',
      albumName: m.album?.name || '',
      artistNames: (m.artist || []).map((a) => a.name).filter(Boolean),
      path: m.path || '',
      genreNames: (m.genre || []).map((g) => g.name).filter(Boolean),
      tagNames: (m.tags || []).map((t) => t.name).filter(Boolean),
      vocalType: m.vocalType || null,
      libraryId: m.libraryId,
      albumId: m.albumId ?? null,
      artistIds: (m.artist || []).map((a) => a.id),
      year: m.year ?? null,
      hasLyric: rawLyric.length > 0,
      plainLyric: plainLyric ? plainLyric.slice(0, 4000) : '',
    };
  }

  private albumToDoc(a: Album): AlbumDoc {
    return {
      id: a.id,
      name: a.name || '',
      albumArtist: a.albumArtist || '',
      libraryId: a.libraryId ?? null,
    };
  }

  private artistToDoc(a: Artist): ArtistDoc {
    return {
      id: a.id,
      name: a.name || '',
    };
  }

  async upsertTracksByIds(ids: number[]) {
    const idx = this.index(TRACKS_INDEX);
    if (!idx || ids.length === 0) return;
    const unique = [...new Set(ids.filter((id) => id > 0))];
    const rows = await this.dataSource.getRepository(Music).find({
      where: { id: In(unique) },
      relations: ['album', 'artist', 'genre', 'tags'],
    });
    if (rows.length === 0) return;
    const docs = rows.map((m) => this.musicToDoc(m));
    for (let i = 0; i < docs.length; i += UPSERT_BATCH) {
      await idx.addDocuments(docs.slice(i, i + UPSERT_BATCH));
    }
  }

  async upsertAlbumsByIds(ids: number[]) {
    const idx = this.index(ALBUMS_INDEX);
    if (!idx || ids.length === 0) return;
    const unique = [...new Set(ids.filter((id) => id > 0))];
    const rows = await this.dataSource.getRepository(Album).find({
      where: { id: In(unique) },
    });
    if (rows.length === 0) return;
    await idx.addDocuments(rows.map((a) => this.albumToDoc(a)));
  }

  async upsertArtistsByIds(ids: number[]) {
    const idx = this.index(ARTISTS_INDEX);
    if (!idx || ids.length === 0) return;
    const unique = [...new Set(ids.filter((id) => id > 0))];
    const rows = await this.dataSource.getRepository(Artist).find({
      where: { id: In(unique) },
    });
    if (rows.length === 0) return;
    await idx.addDocuments(rows.map((a) => this.artistToDoc(a)));
  }

  async syncLibrary(libraryId: number): Promise<void> {
    if (!this.enable || !this.client) {
      throw new Error('meilisearch not enabled');
    }
    this.logger.log(`sync library ${libraryId}: begin`);
    const musicRepo = this.dataSource.getRepository(Music);
    const albumRepo = this.dataSource.getRepository(Album);

    // Tracks
    const trackIdx = this.client.index(TRACKS_INDEX);
    const musics = await musicRepo.find({
      where: { libraryId },
      relations: ['album', 'artist', 'genre', 'tags'],
    });
    const trackDocs = musics.map((m) => this.musicToDoc(m));
    const dbTrackIds = new Set(trackDocs.map((d) => d.id));
    for (let i = 0; i < trackDocs.length; i += UPSERT_BATCH) {
      await trackIdx.addDocuments(trackDocs.slice(i, i + UPSERT_BATCH));
    }
    const orphanTracks = await this.listIndexIdsByFilter(
      TRACKS_INDEX,
      `libraryId = ${libraryId}`,
    );
    const delTracks = orphanTracks.filter((id) => !dbTrackIds.has(id));
    if (delTracks.length > 0) {
      await trackIdx.deleteDocuments(delTracks.map(String));
    }

    // Albums linked to this library (direct libraryId or via music)
    const albums = await albumRepo
      .createQueryBuilder('album')
      .where('album.libraryId = :lid', { lid: libraryId })
      .orWhere((qb) => {
        const sub = qb
          .subQuery()
          .select('music.albumId')
          .from(Music, 'music')
          .where('music.libraryId = :lid', { lid: libraryId })
          .getQuery();
        return `album.id IN ${sub}`;
      })
      .getMany();
    const albumDocs = albums.map((a) => this.albumToDoc(a));
    const albumIdx = this.client.index(ALBUMS_INDEX);
    for (let i = 0; i < albumDocs.length; i += UPSERT_BATCH) {
      await albumIdx.addDocuments(albumDocs.slice(i, i + UPSERT_BATCH));
    }

    // Artists: global — upsert those touched by this library's tracks
    const artistIds = [
      ...new Set(musics.flatMap((m) => (m.artist || []).map((a) => a.id))),
    ];
    if (artistIds.length > 0) {
      await this.upsertArtistsByIds(artistIds);
    }

    this.logger.log(
      `sync library ${libraryId}: done tracks=${trackDocs.length} albums=${albumDocs.length} artists=${artistIds.length}`,
    );
  }

  async reconcileAll(): Promise<void> {
    if (!this.enable) return;
    this.logger.log('startup reconcile: begin');
    const libraries = await this.dataSource.getRepository(MediaLibrary).find();
    for (const lib of libraries) {
      try {
        await this.syncLibrary(lib.id);
      } catch (e) {
        this.logger.warn(
          `reconcile library ${lib.id} failed: ${(e as Error).message}`,
        );
      }
    }
    // Full artist index reconcile (global names)
    const artists = await this.dataSource.getRepository(Artist).find();
    const artistIdx = this.index(ARTISTS_INDEX);
    if (artistIdx && artists.length > 0) {
      const docs = artists.map((a) => this.artistToDoc(a));
      for (let i = 0; i < docs.length; i += UPSERT_BATCH) {
        await artistIdx.addDocuments(docs.slice(i, i + UPSERT_BATCH));
      }
      const orphan = await this.listIndexIdsByFilter(ARTISTS_INDEX, '');
      const keep = new Set(docs.map((d) => d.id));
      const del = orphan.filter((id) => !keep.has(id));
      if (del.length > 0) {
        await artistIdx.deleteDocuments(del.map(String));
      }
    }
    this.logger.log('startup reconcile: done');
  }

  private async listIndexIdsByFilter(
    indexUid: string,
    filter: string,
  ): Promise<number[]> {
    const idx = this.index(indexUid);
    if (!idx) return [];
    const ids: number[] = [];
    let offset = 0;
    const limit = 1000;
    for (;;) {
      const res = await idx.search('', {
        filter: filter || undefined,
        limit,
        offset,
        attributesToRetrieve: ['id'],
      });
      const page = (res.hits || [])
        .map((h: any) => Number(h.id))
        .filter((id) => Number.isFinite(id));
      ids.push(...page);
      if (page.length < limit) break;
      offset += limit;
      if (offset > 500000) break;
    }
    return ids;
  }

  private async countIndex(filter?: string, indexUid = TRACKS_INDEX) {
    const idx = this.index(indexUid);
    if (!idx) return 0;
    const res = await idx.search('', {
      filter,
      limit: 1,
      attributesToRetrieve: ['id'],
    });
    return res.estimatedTotalHits ?? 0;
  }

  async getStatus(): Promise<SearchIndexStatus> {
    const status: SearchIndexStatus = {
      enable: this.enable,
      searchEngine: this.searchEngine,
      healthy: false,
      health: this.enable ? 'unknown' : 'disabled',
      host: this.host,
      trackIndexTotal: 0,
      albumIndexTotal: 0,
      artistIndexTotal: 0,
      driftCount: 0,
      libraries: [],
    };

    const libraries = await this.dataSource
      .getRepository(MediaLibrary)
      .find({ order: { id: 'ASC' } });

    if (!this.enable || !this.client) {
      status.message = 'Meilisearch 未启用，搜索将回落数据库';
      for (const lib of libraries) {
        const item: LibraryIndexStatus = {
          libraryId: lib.id,
          name: lib.path?.split('/').pop() || `库 #${lib.id}`,
          path: lib.path,
          trackDb: 0,
          trackIndex: 0,
          albumDb: 0,
          albumIndex: 0,
          status: 'unavailable',
        };
        item.trackDb = await this.dataSource
          .getRepository(Music)
          .count({ where: { libraryId: lib.id } });
        item.albumDb = await this.dataSource
          .getRepository(Album)
          .count({ where: { libraryId: lib.id } });
        status.libraries.push(item);
      }
      return status;
    }

    try {
      const health = await this.client.health();
      status.health = health.status;
      status.healthy = health.status === 'available';
    } catch (e) {
      status.health = 'unreachable';
      status.message = (e as Error).message;
    }

    try {
      const stats = await this.client.getStats();
      status.trackIndexTotal =
        stats.indexes?.[TRACKS_INDEX]?.numberOfDocuments ?? 0;
      status.albumIndexTotal =
        stats.indexes?.[ALBUMS_INDEX]?.numberOfDocuments ?? 0;
      status.artistIndexTotal =
        stats.indexes?.[ARTISTS_INDEX]?.numberOfDocuments ?? 0;
    } catch {
      // ignore
    }

    for (const lib of libraries) {
      const item: LibraryIndexStatus = {
        libraryId: lib.id,
        name: lib.path?.split('/').pop() || `库 #${lib.id}`,
        path: lib.path,
        trackDb: await this.dataSource
          .getRepository(Music)
          .count({ where: { libraryId: lib.id } }),
        trackIndex: 0,
        albumDb: await this.dataSource
          .getRepository(Album)
          .count({ where: { libraryId: lib.id } }),
        albumIndex: 0,
        status: 'unavailable',
      };
      if (!status.healthy) {
        status.libraries.push(item);
        continue;
      }
      try {
        item.trackIndex = await this.countIndex(
          `libraryId = ${lib.id}`,
          TRACKS_INDEX,
        );
        item.albumIndex = await this.countIndex(
          `libraryId = ${lib.id}`,
          ALBUMS_INDEX,
        );
        if (
          item.trackDb === item.trackIndex &&
          item.albumDb === item.albumIndex
        ) {
          item.status = 'synced';
        } else {
          item.status = 'drift';
          status.driftCount += 1;
        }
      } catch (e) {
        item.status = 'unavailable';
        status.message = (e as Error).message;
      }
      status.libraries.push(item);
    }

    return status;
  }

  /** Helper for services: apply relevance order CASE expression. */
  buildIdOrderCase(alias: string, ids: number[]): string | null {
    if (!ids.length) return null;
    const whens = ids
      .map((id, i) => `WHEN ${Number(id)} THEN ${i}`)
      .join(' ');
    return `CASE ${alias}.id ${whens} ELSE ${ids.length} END`;
  }
}
