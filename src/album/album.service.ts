import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { DataSource } from 'typeorm';
import { Album } from '../database/entites/album';
import { PageFilter } from '../database/utils/type.filter';
import { UpdateAlbumDto } from './dto/update-album.dto';
import * as fs from 'fs';
import { Promise as id3Promise } from 'node-id3';
import * as path from 'path';
import { Music } from '../database/entites/music';
import { MediaLibrary } from '../database/entites/library';
import { ThumbnailService } from '../thumbnail/thumbnail.service';
import { v4 as uuidv4 } from 'uuid';
import { ApplicationConfig } from '../config';
import { migrateAlbumIdentities } from '../services/album-migrate';
import { MetaService } from '../meta/meta.service';
import { getArrayBufferFromUrl } from '../utils/request';
import { stringSimilarity } from '../utils/lyric-match';
import { encodeImageToBlurhash } from '../utils/blurhash';
import { getAverageColor } from 'fast-average-color-node';
import { SearchAlbumEntity } from '../meta/meta.entites';
import {
  ALBUMS_INDEX,
  MeilisearchService,
} from '../meilisearch/meilisearch.service';

export type AlbumQueryFilter = {
  artistId: number;
  order: { [key: string]: 'ASC' | 'DESC' };
  uid: string;
  search: string;
  albumArtist?: string;
  yearFrom?: number;
  yearTo?: number;
  tag: string;
  genre: string[];
  random: boolean;
  followUid?: string;
  id: number;
  missingCover?: boolean;
  missingDescription?: boolean;
  libraryId?: number;
} & PageFilter;

export type AutoCoverResult = {
  album: Album;
  source: 'local' | 'netease' | 'musicbrainz' | 'exists' | 'none';
  score?: number;
};

export type AlbumScrapeResult = {
  albumId: number;
  status: 'applied' | 'partial' | 'exists' | 'not_found' | 'error';
  coverSource?: AutoCoverResult['source'];
  metaFilled?: string[];
  message?: string;
  album?: Album;
};

export type AlbumScrapeJob = {
  id: string;
  uid: string;
  status: 'Running' | 'Done' | 'Error';
  total: number;
  current: number;
  applied: number;
  skipped: number;
  failed: number;
  cancelled?: boolean;
  createdAt: string;
  finishedAt?: string;
};

const LOCAL_COVER_NAMES = [
  'cover.jpg',
  'cover.jpeg',
  'cover.png',
  'folder.jpg',
  'folder.jpeg',
  'folder.png',
  'Front.jpg',
  'front.jpg',
  'AlbumArt.jpg',
  'AlbumArtSmall.jpg',
];

const AUTO_COVER_MIN_NAME_SIM = 0.9;
const AUTO_COVER_MIN_ARTIST_SIM = 0.75;
const AUTO_COVER_MIN_SCORE = 0.85;

@Injectable()
export class AlbumService implements OnModuleInit {
  private readonly logger = new Logger(AlbumService.name);
  private readonly scrapeJobs = new Map<string, AlbumScrapeJob>();
  private batchRunning = false;

  constructor(
    private thumbnailService: ThumbnailService,
    private dataSource: DataSource,
    private metaService: MetaService,
    private httpService: HttpService,
    private meili: MeilisearchService,
  ) {}

  async onModuleInit() {
    try {
      // Drop legacy unique(name) if still present (synchronize does not always remove it).
      await this.dataSource.query(
        'ALTER TABLE album DROP INDEX IDX_65a8cb530a4c10f87feaf6891b',
      ).catch(() => undefined);
      await this.dataSource.query(
        'ALTER TABLE album DROP INDEX name',
      ).catch(() => undefined);

      const result = await migrateAlbumIdentities(this.dataSource);
      if (result.updated || result.merged) {
        this.logger.log(
          `Album identity migration: updated=${result.updated} merged=${result.merged}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Album identity migration skipped: ${(err as Error).message}`,
      );
    }
  }

  async findAll(filter: AlbumQueryFilter) {
    const libraries = await MediaLibrary.getLibraryByUid(filter.uid, this.dataSource);
    const albumRepository = this.dataSource.getRepository(Album);
    let queryBuilder = albumRepository.createQueryBuilder('album');
    queryBuilder = queryBuilder
      .skip((filter.page - 1) * filter.pageSize)
      .take(filter.pageSize);
    const accessibleIds = libraries.map((it) => it.id);
    if (filter.libraryId && filter.libraryId > 0) {
      if (!accessibleIds.includes(filter.libraryId)) {
        return [[], 0] as [Album[], number];
      }
      queryBuilder = queryBuilder.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('music.albumId')
          .from(Music, 'music')
          .where('music.libraryId = :filterLid', {
            filterLid: filter.libraryId,
          })
          .getQuery();
        return 'album.id IN ' + subQuery;
      });
    } else if (accessibleIds.length > 0) {
      // Filter via subquery — joining music without DISTINCT/GROUP BY duplicates
      // one album row per track (artist list already uses groupBy).
      queryBuilder = queryBuilder.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('music.albumId')
          .from(Music, 'music')
          .where('music.libraryId IN (:...libraryIds)', {
            libraryIds: accessibleIds,
          })
          .getQuery();
        return 'album.id IN ' + subQuery;
      });
    }
    if (Number(filter.artistId) > 0) {
      // Match albums via track artists (same as artist detail albumCount),
      // not the optional album↔artist M2M which may be stale.
      queryBuilder.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('DISTINCT album.id')
          .from(Album, 'album')
          .innerJoin('album.music', 'music')
          .innerJoin('music.artist', 'artist')
          .where('artist.id = :aid', { aid: Number(filter.artistId) });
        if (libraries.length > 0) {
          subQuery.andWhere('music.libraryId IN (:...lid)', {
            lid: libraries.map((it) => it.id),
          });
        }
        return 'album.id IN ' + subQuery.getQuery();
      });
    }
    if (filter.tag) {
      queryBuilder.where((qb) => {
        const subQuery = qb
          .subQuery()
          .select('album.id')
          .from(Album, 'album')
          .leftJoin('album.music', 'music')
          .leftJoin('music.tags', 'tags')
          .where('tags.id = :tag', { tag: filter.tag })
          .andWhere('music.libraryId in (:...lid)', {
            lid: libraries.map((it) => it.id),
          })
          .getQuery();
        return 'album.id IN ' + subQuery;
      });
    }
    if (filter.genre.length > 0 && filter.genre[0] !== '') {
      queryBuilder.where((qb) => {
        const subQuery = qb
          .subQuery()
          .select('album.id')
          .from(Album, 'album')
          .leftJoin('album.music', 'music')
          .leftJoin('music.genre', 'genre')
          .where('genre.id in (:...genres)', { genres: filter.genre })
          .andWhere('music.libraryId in (:...lid)', {
            lid: libraries.map((it) => it.id),
          })
          .getQuery();
        return 'album.id IN ' + subQuery;
      });
    }
    if (filter.followUid && filter.followUid.length > 0) {
      queryBuilder
        .leftJoinAndSelect('album.follow', 'follow')
        .andWhere('follow.uid = :uid', { uid: filter.followUid });
    }
    if (filter.id > 0) {
      queryBuilder.andWhere('album.id = :aid', { aid: filter.id });
    }
    if (filter.missingCover) {
      queryBuilder.andWhere(
        '(album.cover IS NULL OR album.cover = :emptyCover)',
        { emptyCover: '' },
      );
    }
    if (filter.missingDescription) {
      queryBuilder.andWhere(
        '(album.description IS NULL OR album.description = :emptyDesc)',
        { emptyDesc: '' },
      );
    }
    if (filter.random) {
      if (this.dataSource.options.type === 'sqlite') {
        queryBuilder.orderBy('RANDOM()');
      } else {
        queryBuilder.orderBy('RAND()');
      }
    } else {
      const order = {};
      Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
        order[`album.${fieldName}`] = filter.order[fieldName];
      });
      queryBuilder.orderBy(order);
    }
    if (filter.search.length > 0) {
      const meiliIds = await this.meili.searchIds(ALBUMS_INDEX, filter.search);
      if (meiliIds !== null) {
        if (meiliIds.length === 0) {
          return [[], 0] as [Album[], number];
        }
        queryBuilder.andWhere('album.id IN (:...meiliIds)', { meiliIds });
        const orderCase = this.meili.buildIdOrderCase('album', meiliIds);
        if (orderCase && !filter.random) {
          queryBuilder.orderBy(orderCase, 'ASC');
        }
      } else {
        queryBuilder.andWhere('album.name like :search', {
          search: `%${filter.search}%`,
        });
      }
    }
    if (filter.albumArtist && filter.albumArtist.length > 0) {
      queryBuilder.andWhere('album.albumArtist like :albumArtist', {
        albumArtist: `%${filter.albumArtist}%`,
      });
    }
    if (filter.yearFrom && filter.yearFrom > 0) {
      queryBuilder.andWhere('album.year >= :yearFrom', {
        yearFrom: filter.yearFrom,
      });
    }
    if (filter.yearTo && filter.yearTo > 0) {
      queryBuilder.andWhere('album.year <= :yearTo', {
        yearTo: filter.yearTo,
      });
    }
    queryBuilder = queryBuilder
      .leftJoinAndSelect('album.artist', 'artist')
      .loadRelationCountAndMap('album.musicCount', 'album.music');

    return await queryBuilder.getManyAndCount();
  }

  async findOne(id: number, uid: string) {
    const libraries = await MediaLibrary.getLibraryByUid(uid, this.dataSource);
    const albumRepository = this.dataSource.getRepository(Album);
    let queryBuilder = albumRepository.createQueryBuilder('album');
    queryBuilder
      .leftJoinAndSelect('album.music', 'music')
      .leftJoinAndSelect('album.artist', 'artist')
      .leftJoinAndSelect('music.artist', 'musicArtist')
      .where('album.id = :id', { id });
    if (libraries.length > 0) {
      queryBuilder = queryBuilder.andWhere('music.libraryId in (:...lid)', {
        lid: libraries.map((it) => it.id),
      });
    }
    return queryBuilder.getOne();
  }

  async checkAccessible(id: number, uid: string): Promise<boolean> {
    const album = await this.findOne(id, uid);
    return !!album;
  }

  async updateAlbum(id: number, data: UpdateAlbumDto) {
    let album = await this.dataSource.getRepository(Album).findOne({
      where: { id },
      relations: ['music'],
    });
    if (!album) {
      throw new Error('album not found');
    }
    if (data.name) {
      album.name = data.name;
      for (const music of album.music) {
        const file = await fs.promises.readFile(music.path);
        const buf = await id3Promise.update({ album: album.name }, file);
        await fs.promises.writeFile(music.path, buf);
      }
    }
    if (data.albumArtist !== undefined) {
      album.albumArtist = data.albumArtist;
    }
    if (data.year !== undefined) {
      album.year = data.year;
    }
    if (data.description !== undefined) {
      album.description = data.description;
    }
    album = await this.dataSource.getRepository(Album).save(album);
    this.meili.notifyAlbumUpsert(album.id);
    if (data.name && album.music?.length) {
      this.meili.notifyTrackUpsert(...album.music.map((m) => m.id));
    }
    return album;
  }
  async applyAlbumMeta(
    id: number,
    uid: string,
    data: {
      name?: string;
      albumArtist?: string;
      year?: number;
      description?: string;
      neteaseId?: string;
      mbid?: string;
      coverUrl?: string;
    },
  ): Promise<Album> {
    if (!(await this.checkAccessible(id, uid))) {
      throw new Error('not accessible');
    }
    let album = await this.dataSource.getRepository(Album).findOne({
      where: { id },
      relations: ['music'],
    });
    if (!album) {
      throw new Error('album not found');
    }

    if (data.name && data.name !== album.name) {
      album.name = data.name;
      for (const music of album.music || []) {
        try {
          const file = await fs.promises.readFile(music.path);
          const buf = await id3Promise.update({ album: album.name }, file);
          await fs.promises.writeFile(music.path, buf);
        } catch {
          // ignore per-track tag failures
        }
      }
    }
    if (data.albumArtist !== undefined) {
      album.albumArtist = data.albumArtist;
    }
    if (data.year !== undefined && data.year > 0) {
      album.year = data.year;
    }
    if (data.description !== undefined) {
      album.description = data.description?.slice(0, 8000) || undefined;
    }
    if (data.neteaseId) {
      album.neteaseId = data.neteaseId;
    }
    if (data.mbid) {
      album.mbid = data.mbid;
    }
    album.scrapedAt = new Date();
    album = await this.dataSource.getRepository(Album).save(album);

    if (data.coverUrl) {
      const withCover = await this.updateCoverFromUrl(id, data.coverUrl);
      if (withCover) album = withCover;
    }

    return (
      (await this.dataSource.getRepository(Album).findOne({
        where: { id },
        relations: ['artist'],
      })) || album
    );
  }

  async updateCoverFromFile(id: number, file: any) {
    let album = await this.dataSource.getRepository(Album).findOne({
      where: { id },
      relations: ['music'],
    });
    if (!album) {
      throw new Error('album not found');
    }
    const coverFilename = `${uuidv4()}.jpg`;
    await this.thumbnailService.generate(file.buffer, coverFilename);
    album.cover = coverFilename;
    await this.applyCoverMeta(album, file.buffer);
    const mime = path.extname(file.originalname).replace('.', '');
    for (const music of album.music) {
      await music.writeMusicFileCover(mime, file.buffer);
    }
    album = await this.dataSource.getRepository(Album).save(album);
    return album;
  }

  async updateCoverFromBuffer(
    id: number,
    buf: Buffer,
    opts?: { writeTags?: boolean },
  ): Promise<Album | null> {
    let album = await this.dataSource.getRepository(Album).findOne({
      where: { id },
      relations: ['music'],
    });
    if (!album) return null;
    const coverFilename = `${uuidv4()}.jpg`;
    await this.thumbnailService.generate(buf, coverFilename);
    album.cover = coverFilename;
    await this.applyCoverMeta(album, buf);
    if (opts?.writeTags !== false && album.music?.length) {
      for (const music of album.music) {
        try {
          await music.writeMusicFileCover('jpg', buf);
        } catch {
          // ignore tag write failures
        }
      }
    }
    album = await this.dataSource.getRepository(Album).save(album);
    return album;
  }

  async updateCoverFromUrl(id: number, url: string): Promise<Album | null> {
    const { buf } = await getArrayBufferFromUrl(this.httpService, url);
    return this.updateCoverFromBuffer(id, buf);
  }

  private async applyCoverMeta(album: Album, buf: Buffer) {
    try {
      album.blurHash = await encodeImageToBlurhash(buf);
    } catch {
      // optional
    }
    try {
      const color = await getAverageColor(buf);
      album.domainColor = color.hex;
    } catch {
      // optional
    }
  }

  /**
   * Prefer missing cover: local folder art → high-confidence meta cover.
   */
  async autoFillCover(
    id: number,
    opts?: { force?: boolean },
  ): Promise<AutoCoverResult> {
    const repo = this.dataSource.getRepository(Album);
    let album = await repo.findOne({
      where: { id },
      relations: ['artist', 'music', 'music.artist'],
    });
    if (!album) throw new Error('album not found');

    if (album.cover && !opts?.force) {
      return { album, source: 'exists' };
    }

    // 1) Local cover beside album / tracks
    const localPath = await this.findLocalCoverPath(album);
    if (localPath) {
      try {
        const buf = await fs.promises.readFile(localPath);
        const saved = await this.updateCoverFromBuffer(id, buf);
        if (saved) {
          return { album: saved, source: 'local', score: 1 };
        }
      } catch (e) {
        this.logger.warn(
          `local cover album=${id}: ${(e as Error).message}`,
        );
      }
    }

    // 2) High-confidence remote meta cover (Netease preferred, then MB)
    const hit = await this.findBestAlbumMetaHit(album);
    if (hit && hit.score >= AUTO_COVER_MIN_SCORE) {
      try {
        const detail = await this.metaService.getAlbumDetail(
          hit.source === 'NeteaseMusic'
            ? { nemId: hit.id }
            : { mbId: hit.id },
        );
        const coverUrl = detail.cover || hit.cover;
        if (coverUrl) {
          const saved = await this.updateCoverFromUrl(id, coverUrl);
          if (saved) {
            // stash ids if empty (non-force)
            if (hit.source === 'NeteaseMusic' && !saved.neteaseId) {
              saved.neteaseId = hit.id;
              await repo.save(saved);
            }
            if (hit.source === 'MusicBrain' && !saved.mbid) {
              saved.mbid = hit.id;
              await repo.save(saved);
            }
            return {
              album: saved,
              source:
                hit.source === 'NeteaseMusic' ? 'netease' : 'musicbrainz',
              score: hit.score,
            };
          }
        }
      } catch (e) {
        this.logger.warn(
          `remote cover album=${id}: ${(e as Error).message}`,
        );
      }
    }

    album = await repo.findOne({ where: { id } });
    return { album: album!, source: 'none' };
  }

  /**
   * Cover (if missing) + year / ids / description for empty fields only.
   * Bio/description prefers Netease.
   */
  async scrapeAlbum(
    id: number,
    uid: string,
    opts?: { forceCover?: boolean; forceMeta?: boolean },
  ): Promise<AlbumScrapeResult> {
    if (!(await this.checkAccessible(id, uid))) {
      return { albumId: id, status: 'error', message: 'not accessible' };
    }
    try {
      const cover = await this.autoFillCover(id, {
        force: !!opts?.forceCover,
      });
      const meta = await this.fillAlbumMeta(id, {
        force: !!opts?.forceMeta,
      });
      const album = await this.dataSource.getRepository(Album).findOne({
        where: { id },
        relations: ['artist'],
      });
      const filledCover =
        cover.source !== 'exists' && cover.source !== 'none';
      const filledMeta = (meta.filled || []).length > 0;
      if (!filledCover && !filledMeta && cover.source === 'exists') {
        return {
          albumId: id,
          status: 'exists',
          coverSource: cover.source,
          metaFilled: meta.filled,
          album: album || undefined,
        };
      }
      if (!filledCover && !filledMeta && cover.source === 'none') {
        return {
          albumId: id,
          status: meta.filled?.length ? 'partial' : 'not_found',
          coverSource: cover.source,
          metaFilled: meta.filled,
          album: album || undefined,
        };
      }
      return {
        albumId: id,
        status: filledCover && filledMeta ? 'applied' : 'partial',
        coverSource: cover.source,
        metaFilled: meta.filled,
        album: album || undefined,
      };
    } catch (e) {
      this.logger.warn(`scrape album=${id}: ${(e as Error).message}`);
      return {
        albumId: id,
        status: 'error',
        message: (e as Error).message,
      };
    }
  }

  async fillAlbumMeta(
    id: number,
    opts?: { force?: boolean },
  ): Promise<{ album: Album; filled: string[] }> {
    const repo = this.dataSource.getRepository(Album);
    let album = await repo.findOne({
      where: { id },
      relations: ['artist', 'music', 'music.artist'],
    });
    if (!album) throw new Error('album not found');
    const force = !!opts?.force;
    const filled: string[] = [];

    const needMeta =
      force ||
      !album.neteaseId ||
      !album.mbid ||
      !album.year ||
      !album.description?.trim();

    if (!needMeta) {
      return { album, filled };
    }

    // Prefer Netease for description; search once and reuse.
    let best = await this.findBestAlbumMetaHit(album);

    // If we already have neteaseId, still fetch detail for empty fields
    if (album.neteaseId && (!album.description?.trim() || !album.year || force)) {
      try {
        const detail = await this.metaService.getAlbumDetail({
          nemId: album.neteaseId,
        });
        if (detail.description && (!album.description?.trim() || force)) {
          album.description = detail.description.slice(0, 8000);
          filled.push('description');
        }
        if (detail.year && (!album.year || force)) {
          album.year = detail.year;
          filled.push('year');
        }
      } catch (e) {
        this.logger.warn(
          `netease detail album=${id}: ${(e as Error).message}`,
        );
      }
    }

    if (best && best.score >= AUTO_COVER_MIN_SCORE) {
      if (best.source === 'NeteaseMusic' && (!album.neteaseId || force)) {
        album.neteaseId = best.id;
        filled.push('neteaseId');
      }
      if (best.source === 'MusicBrain' && (!album.mbid || force)) {
        album.mbid = best.id;
        filled.push('mbid');
      }

      // Year from search hit when available
      if (best.releaseDate && (!album.year || force)) {
        const ym = String(best.releaseDate).match(/^(\d{4})/);
        if (ym) {
          album.year = Number(ym[1]);
          filled.push('year');
        }
      }

      // Netease detail for description (prefer)
      if (
        best.source === 'NeteaseMusic' &&
        (!album.description?.trim() || force)
      ) {
        try {
          const detail = await this.metaService.getAlbumDetail({
            nemId: best.id,
          });
          if (detail.description) {
            album.description = detail.description.slice(0, 8000);
            filled.push('description');
          }
          if (detail.year && (!album.year || force)) {
            album.year = detail.year;
            filled.push('year');
          }
        } catch (e) {
          this.logger.warn(
            `netease fill album=${id}: ${(e as Error).message}`,
          );
        }
      }

      // MB detail for mbid / year if still missing
      if (
        best.source === 'MusicBrain' &&
        ((!album.year || force) || (!album.mbid || force))
      ) {
        try {
          const detail = await this.metaService.getAlbumDetail({
            mbId: best.id,
          });
          if (detail.year && (!album.year || force)) {
            album.year = detail.year;
            filled.push('year');
          }
        } catch (e) {
          this.logger.warn(`mb fill album=${id}: ${(e as Error).message}`);
        }
      }
    }

    // Also try the other source for missing ids
    if ((!album.neteaseId || !album.mbid) && best) {
      try {
        const otherSource =
          best.source === 'NeteaseMusic' ? 'MusicBrainz' : 'NeteaseMusic';
        const hits = await this.metaService.searchAlbum(album.name, {
          artist: album.albumArtist || this.artistsLabel(album),
          source: otherSource,
        });
        const scored = hits
          .map((h) => ({ ...h, score: this.scoreAlbumHit(album!, h) }))
          .filter((h) => h.score >= AUTO_COVER_MIN_SCORE)
          .sort((a, b) => b.score - a.score);
        const other = scored[0];
        if (other) {
          if (other.source === 'NeteaseMusic' && (!album.neteaseId || force)) {
            album.neteaseId = other.id;
            filled.push('neteaseId');
            if (!album.description?.trim() || force) {
              const detail = await this.metaService.getAlbumDetail({
                nemId: other.id,
              });
              if (detail.description) {
                album.description = detail.description.slice(0, 8000);
                filled.push('description');
              }
              if (detail.year && (!album.year || force)) {
                album.year = detail.year;
                filled.push('year');
              }
            }
          }
          if (other.source === 'MusicBrain' && (!album.mbid || force)) {
            album.mbid = other.id;
            filled.push('mbid');
          }
        }
      } catch (e) {
        this.logger.warn(
          `cross-source fill album=${id}: ${(e as Error).message}`,
        );
      }
    }

    // Fallback year from tracks (only when still empty)
    if (!album.year) {
      const trackYears = (album.music || [])
        .map((m) => Number(m.year))
        .filter((y) => y > 1900 && y < 2100);
      if (trackYears.length) {
        trackYears.sort((a, b) => a - b);
        album.year = trackYears[Math.floor(trackYears.length / 2)];
        filled.push('year');
      }
    }

    if (filled.length > 0) {
      album.scrapedAt = new Date();
      album = await repo.save(album);
    }
    return { album, filled: [...new Set(filled)] };
  }

  getAlbumScrapeJob(jobId: string): AlbumScrapeJob | undefined {
    return this.scrapeJobs.get(jobId);
  }

  async startBatchAlbumScrape(
    uid: string,
    opts?: {
      limit?: number;
      force?: boolean;
      ids?: number[];
      missingCoverOnly?: boolean;
    },
  ): Promise<AlbumScrapeJob> {
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
    let ids = (opts?.ids || []).filter((n) => Number.isFinite(n) && n > 0);
    const missingCoverOnly = opts?.missingCoverOnly !== false;

    if (ids.length === 0) {
      const [list] = await this.findAll({
        page: 1,
        pageSize: limit,
        artistId: 0,
        order: { id: 'DESC' },
        uid,
        search: '',
        tag: '',
        genre: [],
        random: false,
        followUid: undefined,
        id: 0,
        missingCover: missingCoverOnly,
      });
      ids = list.map((a) => a.id);
    } else {
      ids = ids.slice(0, limit);
    }

    const job: AlbumScrapeJob = {
      id: uuidv4(),
      uid,
      status: 'Running',
      total: ids.length,
      current: 0,
      applied: 0,
      skipped: 0,
      failed: 0,
      createdAt: new Date().toISOString(),
    };
    this.scrapeJobs.set(job.id, job);
    void this.runBatchAlbumScrape(job, ids, !!opts?.force);
    return job;
  }

  private async runBatchAlbumScrape(
    job: AlbumScrapeJob,
    ids: number[],
    force: boolean,
  ) {
    while (this.batchRunning) {
      await new Promise((r) => setTimeout(r, 500));
      if (job.cancelled) {
        job.status = 'Error';
        job.finishedAt = new Date().toISOString();
        return;
      }
    }
    this.batchRunning = true;
    try {
      for (const id of ids) {
        if (job.cancelled) break;
        try {
          const result = await this.scrapeAlbum(id, job.uid, {
            forceCover: force,
            forceMeta: force,
          });
          if (result.status === 'applied' || result.status === 'partial') {
            if (
              result.coverSource &&
              result.coverSource !== 'exists' &&
              result.coverSource !== 'none'
            ) {
              job.applied += 1;
            } else if ((result.metaFilled || []).length > 0) {
              job.applied += 1;
            } else {
              job.skipped += 1;
            }
          } else if (result.status === 'exists') {
            job.skipped += 1;
          } else {
            job.failed += 1;
          }
        } catch {
          job.failed += 1;
        }
        job.current += 1;
        await new Promise((r) => setTimeout(r, 1200));
      }
      job.status = job.cancelled ? 'Error' : 'Done';
      job.finishedAt = new Date().toISOString();
    } catch (e) {
      job.status = 'Error';
      job.finishedAt = new Date().toISOString();
      this.logger.warn(`batch album scrape: ${(e as Error).message}`);
    } finally {
      this.batchRunning = false;
    }
  }

  private artistsLabel(album: Album): string {
    if (album.albumArtist?.trim()) return album.albumArtist.trim();
    const fromAlbum = (album.artist || []).map((a) => a.name).filter(Boolean);
    if (fromAlbum.length) return fromAlbum.join('/');
    const fromTracks = new Set<string>();
    for (const m of album.music || []) {
      for (const a of m.artist || []) {
        if (a.name) fromTracks.add(a.name);
      }
    }
    return [...fromTracks].join('/');
  }

  private scoreAlbumHit(album: Album, hit: SearchAlbumEntity): number {
    const nameSim = stringSimilarity(album.name || '', hit.name || '');
    const artistLeft = this.artistsLabel(album);
    const artistRight = hit.artists || '';
    const artistSim =
      artistLeft && artistRight
        ? stringSimilarity(artistLeft, artistRight)
        : artistLeft || artistRight
          ? 0.4
          : 0.7;
    if (nameSim < AUTO_COVER_MIN_NAME_SIM) {
      return nameSim * 0.55 + artistSim * 0.45;
    }
    if (artistLeft && artistSim < AUTO_COVER_MIN_ARTIST_SIM) {
      return nameSim * 0.55 + artistSim * 0.45;
    }
    return nameSim * 0.55 + artistSim * 0.45;
  }

  private async findBestAlbumMetaHit(
    album: Album,
  ): Promise<(SearchAlbumEntity & { score: number }) | null> {
    try {
      const hits = await this.metaService.searchAlbum(album.name, {
        artist: this.artistsLabel(album) || undefined,
      });
      if (!hits?.length) return null;
      const scored = hits
        .map((h) => ({ ...h, score: this.scoreAlbumHit(album, h) }))
        .sort((a, b) => {
          // Prefer Netease when scores are close (description source)
          if (Math.abs(a.score - b.score) < 0.02) {
            if (a.source === 'NeteaseMusic' && b.source !== 'NeteaseMusic')
              return -1;
            if (b.source === 'NeteaseMusic' && a.source !== 'NeteaseMusic')
              return 1;
          }
          return b.score - a.score;
        });
      const best = scored[0];
      if (!best || best.score < AUTO_COVER_MIN_SCORE) return null;
      return best;
    } catch (e) {
      this.logger.warn(
        `search album meta id=${album.id}: ${(e as Error).message}`,
      );
      return null;
    }
  }

  private async findLocalCoverPath(album: Album): Promise<string | null> {
    const dirs = new Set<string>();
    if (album.rootPath) dirs.add(album.rootPath);
    for (const m of album.music || []) {
      if (m.path) dirs.add(path.dirname(m.path));
    }
    for (const dir of dirs) {
      for (const name of LOCAL_COVER_NAMES) {
        const p = path.join(dir, name);
        try {
          if (fs.existsSync(p)) return p;
        } catch {
          // ignore
        }
      }
    }
    return null;
  }
}
