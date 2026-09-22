import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { UpdateMusicDto } from './dto/update-music.dto';
import { In, DataSource } from 'typeorm';
import { Music } from 'src/database/entites/music';
import { MusicEmbedding } from 'src/database/entites/music-embedding';
import { PageFilter } from '../database/utils/type.filter';
import { MediaLibrary } from '../database/entites/library';
import * as fs from 'fs';
import { Promise as id3Promise } from 'node-id3';
import { Artist } from '../database/entites/artist';
import {
  getOrCreateAlbum,
  getOrCreateArtist,
  saveMusicCoverFile,
} from '../services/music';
import { Album } from '../database/entites/album';
import * as mm from 'music-metadata';
import * as path from 'path';
import * as Path from 'path';
import { Genre } from '../database/entites/genre';
import { ApplicationConfig } from '../config';
import { v4 as uuidv4, v4 } from 'uuid';
import { getImageFromContentType } from '../utils/image';
import { ThumbnailService } from '../thumbnail/thumbnail.service';
import { Tag } from '../database/entites/tag';
import { StorageService } from '../storage/storage.service';
import { LogService } from '../log/log.service';
import { encodeImageToBlurhash } from '../utils/blurhash';
import * as db from 'mime-db';
import { getAverageColor } from 'fast-average-color-node';
import {
  extractEmbeddedLyrics,
  readLrcIfExists,
  resolveLrcPath,
  writeLrcBesideAudio,
} from '../utils/lyric';
import { MetaService } from '../meta/meta.service';
import {
  MeilisearchService,
  TRACKS_INDEX,
} from '../meilisearch/meilisearch.service';

export type MusicQueryFilter = {
  artistId: number;
  albumId: number;
  ids: string[];
  tags: string[];
  genre: string[];
  order: { [key: string]: 'ASC' | 'DESC' };
  uid: string;
  search: string;
  title: string;
  path: string;
  pathSearch: string;
  random: boolean;
  playlistIds: string[];
  albumSearch: string;
  artistSearch: string;
  withTags: boolean;
  followUid?: string;
  yearFrom?: number;
  yearTo?: number;
  /** undefined = any; true = has lyric text; false = empty/null lyric */
  hasLyric?: boolean;
  /** undefined = any; true = has CLAP embedding; false = not embedded */
  hasClap?: boolean;
  vocalType?: string;
  libraryId?: number;
} & PageFilter;

export type LyricScrapeResult = {
  musicId: number;
  status:
    | 'exists'
    | 'applied'
    | 'candidates'
    | 'not_found'
    | 'cooldown'
    | 'error';
  source?: string;
  score?: number;
  preview?: string;
  message?: string;
  candidates?: Array<{
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
};

export type LyricScrapeJob = {
  id: string;
  uid: string;
  status: 'Running' | 'Done' | 'Error';
  total: number;
  current: number;
  applied: number;
  skipped: number;
  failed: number;
  createdAt: string;
  finishedAt?: string;
  cancelled?: boolean;
};

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);
  /** Fail cooldown to avoid hammering providers (ms). */
  private readonly scrapeCooldownMs = 24 * 60 * 60 * 1000;
  private readonly scrapeFailAt = new Map<number, number>();
  private readonly scrapeJobs = new Map<string, LyricScrapeJob>();
  private batchRunning = false;

  constructor(
    private httpService: HttpService,
    private thumbnailService: ThumbnailService,
    private storageService: StorageService,
    private logService: LogService,
    private dataSource: DataSource,
    private metaService: MetaService,
    private meili: MeilisearchService,
  ) {}

  async findAll(filter: MusicQueryFilter) {
    const libraries = await MediaLibrary.getLibraryByUid(filter.uid, this.dataSource);
    const musicRepository = this.dataSource.getRepository(Music);
    const queryBuilder = musicRepository.createQueryBuilder('music');
    queryBuilder
      .leftJoinAndSelect('music.album', 'album')
      .leftJoinAndSelect('music.artist', 'artist')
      .leftJoinAndSelect('music.genre', 'genre')
      .take(filter.pageSize)
      .skip((filter.page - 1) * filter.pageSize);
    const accessibleIds = libraries.map((it) => it.id);
    if (filter.libraryId && filter.libraryId > 0) {
      if (!accessibleIds.includes(filter.libraryId)) {
        return [[], 0] as [Music[], number];
      }
      queryBuilder.where('music.libraryId = :filterLid', {
        filterLid: filter.libraryId,
      });
    } else if (accessibleIds.length > 0) {
      queryBuilder.where('music.libraryId in (:...lid)', {
        lid: accessibleIds,
      });
    }
    if (filter.albumId > 0) {
      queryBuilder.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('music.id')
          .from(Album, 'album')
          .leftJoin('album.music', 'music')
          .where('album.id = :aid', { aid: filter.albumId })
          .getQuery();
        return 'music.id IN ' + subQuery;
      });
    }
    if (filter.artistId > 0) {
      queryBuilder.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('music.id')
          .from(Artist, 'artist')
          .leftJoin('artist.music', 'music')
          .where('artist.id = :aid', { aid: filter.artistId })
          .getQuery();
        return 'music.id IN ' + subQuery;
      });
    }
    if (filter.playlistIds.length > 0 && filter.playlistIds[0] !== '') {
      queryBuilder.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('music.id')
          .from(Music, 'music')
          .leftJoin('music.playlist', 'playlist')
          .where('playlist.id in (:...pid)', { pid: filter.playlistIds })
          .getQuery();
        return 'music.id IN ' + subQuery;
      });
    }
    if (filter.ids.length > 0 && filter.ids[0] !== '') {
      const ids = filter.ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);
      if (ids.length > 0) {
        queryBuilder.andWhere('music.id IN (:...ids)', { ids });
      }
    }
    if (filter.followUid && filter.followUid.length > 0) {
      queryBuilder
        .leftJoin('music.follow', 'followUser')
        .andWhere('followUser.uid = :followUid', {
          followUid: filter.followUid,
        });
    }
    let meiliOrderedIds: number[] | null = null;
    if (filter.search.length > 0) {
      const meiliIds = await this.meili.searchIds(TRACKS_INDEX, filter.search, {
        filter:
          libraries.length > 0
            ? libraries.map((l) => `libraryId = ${l.id}`).join(' OR ')
            : undefined,
      });
      if (meiliIds !== null) {
        if (meiliIds.length === 0) {
          return [[], 0] as [Music[], number];
        }
        meiliOrderedIds = meiliIds;
        queryBuilder.andWhere('music.id IN (:...meiliIds)', { meiliIds });
      } else {
        queryBuilder.andWhere('music.title like :search', {
          search: `%${filter.search}%`,
        });
      }
    }
    if (filter.albumSearch.length > 0) {
      queryBuilder.andWhere('album.name like :albumSearch', {
        albumSearch: `%${filter.albumSearch}%`,
      });
    }
    if (filter.artistSearch.length > 0) {
      queryBuilder.andWhere('artist.name like :artistSearch', {
        artistSearch: `%${filter.artistSearch}%`,
      });
    }
    if (filter.pathSearch.length > 0) {
      queryBuilder.andWhere('music.path like :pathSearch', {
        pathSearch: `%${filter.pathSearch}%`,
      });
    }
    if (filter.title.length > 0) {
      queryBuilder.andWhere('music.title = :title', {
        title: filter.title,
      });
    }
    if (filter.path.length > 0) {
      queryBuilder.andWhere('music.path = :path', {
        path: filter.path,
      });
    }
    const hasTagFilter = filter.tags.length > 0 && filter.tags[0] !== '';
    if (filter.withTags || hasTagFilter) {
      queryBuilder.leftJoinAndSelect('music.tags', 'tag');
    }
    if (hasTagFilter) {
      queryBuilder.andWhere('tag.id in (:...tags)', { tags: filter.tags });
    }
    if (filter.genre.length > 0 && filter.genre[0] !== '') {
      queryBuilder.andWhere('genre.id in (:...genres)', { genres: filter.genre });
    }
    if (filter.yearFrom != null && !Number.isNaN(filter.yearFrom)) {
      queryBuilder.andWhere('music.year >= :yearFrom', {
        yearFrom: filter.yearFrom,
      });
    }
    if (filter.yearTo != null && !Number.isNaN(filter.yearTo)) {
      queryBuilder.andWhere('music.year <= :yearTo', {
        yearTo: filter.yearTo,
      });
    }
    if (filter.hasLyric === true) {
      queryBuilder.andWhere(
        "music.lyric IS NOT NULL AND TRIM(music.lyric) <> ''",
      );
    } else if (filter.hasLyric === false) {
      queryBuilder.andWhere(
        "(music.lyric IS NULL OR TRIM(music.lyric) = '')",
      );
    }
    if (filter.hasClap === true) {
      queryBuilder.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('1')
          .from(MusicEmbedding, 'me')
          .where('me.musicId = music.id')
          .getQuery();
        return 'EXISTS ' + subQuery;
      });
    } else if (filter.hasClap === false) {
      queryBuilder.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('1')
          .from(MusicEmbedding, 'me')
          .where('me.musicId = music.id')
          .getQuery();
        return 'NOT EXISTS ' + subQuery;
      });
    }
    if (filter.vocalType) {
      queryBuilder.andWhere('music.vocalType = :vocalType', {
        vocalType: filter.vocalType,
      });
    }
    if (filter.random) {
      if (this.dataSource.options.type === 'sqlite') {
        queryBuilder.orderBy('RANDOM()');
      } else {
        queryBuilder.orderBy('RAND()');
      }
    } else if (meiliOrderedIds && meiliOrderedIds.length > 0) {
      const orderCase = this.meili.buildIdOrderCase('music', meiliOrderedIds);
      if (orderCase) {
        queryBuilder.orderBy(orderCase, 'ASC');
      }
    } else {
      const order = {};
      Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
        order[`music.${fieldName}`] = filter.order[fieldName];
      });
      if (Object.keys(order).length > 0) {
        queryBuilder.orderBy(order);
      } else {
        queryBuilder.orderBy('music.id', 'DESC');
      }
    }
    return queryBuilder.getManyAndCount();
  }

  async findOne(id: number, uid: string) {
    const libraries = await MediaLibrary.getLibraryByUid(uid, this.dataSource);
    const musicRepository = this.dataSource.getRepository(Music);
    let query = musicRepository
      .createQueryBuilder('music')
      .leftJoinAndSelect('music.album', 'album')
      .leftJoinAndSelect('music.artist', 'artist')
      .leftJoinAndSelect('music.genre', 'genre')
      .leftJoinAndSelect('music.tags', 'tag')
      .where('music.id = :id', { id });
    if (libraries.length > 0) {
      query = query.andWhere('music.libraryId in (:...lid)', {
        lid: libraries.map((it) => it.id),
      });
    }
    return await query.getOne();
  }

  async remove(id: number) {
    const result = await Music.deleteMusic(id, this.dataSource);
    this.meili.notifyTrackDelete(id);
    return result;
  }

  async updateMusicFile(id: number, uid: string, dto: UpdateMusicDto) {
    const repo = this.dataSource.getRepository(Music);
    const queryMusicStartTime = Date.now();
    const music = await repo.findOne({
      where: { id },
      relations: ['album', 'library'],
    });
    const queryMusicEndTime = Date.now();
    this.logService.info({
      content: `query music time: ${queryMusicEndTime - queryMusicStartTime}ms`,
    });
    if (music === undefined || music === null) {
      throw new Error('music not exist');
    }
    const tags: { [key: string]: string | number } = {};
    if (dto.title) {
      tags['title'] = dto.title;
      music.title = dto.title;
    }
    const updateArtistStartTime = Date.now();
    const artists: Artist[] = [];
    if (dto.artist) {
      for (const artistName of dto.artist) {
        const artist = await getOrCreateArtist(artistName, music.library, this.dataSource);
        artists.push(artist);
      }
      music.artist = artists;

      tags['artist'] = dto.artist.join(';');
    }
    const updateArtistEndTime = Date.now();
    this.logService.info({
      content: `update artist time: ${
        updateArtistEndTime - updateArtistStartTime
      }ms`,
    });
    let prevAlbum: Album;
    if (dto.album) {
      if (music.album) {
        prevAlbum = music.album;
      }
      const updateAlbumStartTime = Date.now();
      const albumArtistName =
        artists[0]?.name ||
        music.artist?.[0]?.name ||
        music.album?.albumArtist;
      music.album = await getOrCreateAlbum({
        name: dto.album,
        albumArtist: albumArtistName,
        filePath: music.path,
        library: music.library,
        dataSource: this.dataSource,
      });
      const updateAlbumEndTime = Date.now();
      this.logService.info({
        content: `update album time: ${
          updateAlbumEndTime - updateAlbumStartTime
        }`,
      });

      // generate cover
      if (music.album.cover === null || music.album.cover.length === 0) {
        let isExist = false;
        if (music.album?.cover) {
          isExist = await this.storageService.existCover(music.album.cover);
        }
        if (!isExist) {
          const meta = await mm.parseFile(music.path);
          const cover = meta.common.picture[0];
          const mime = db[cover.format];
          if (mime) {
            const ext = mime.extensions[0];
            const coverFilename = `${uuidv4()}.${ext}`;
            await this.thumbnailService.generate(cover.data, coverFilename);
            const hash = await encodeImageToBlurhash(cover.data);
            music.album.cover = coverFilename;
            music.album.blurHash = hash;
            // get domain color
            const color = await getAverageColor(cover.data);
            music.album.domainColor = color.hex;
            await this.dataSource.getRepository(Album).save(music.album);
          }
        }
        await this.dataSource.getRepository(Album).save(music.album);
      }
      tags['album'] = dto.album;
    }
    if (dto.year) {
      tags['year'] = dto.year;
      music.year = dto.year;
    }

    if (dto.track) {
      tags['trackNumber'] = dto.track;
      music.track = dto.track;
    }

    if (dto.genre) {
      const genres: Genre[] = [];
      for (const genreName of dto.genre) {
        const genre = await Genre.createOrGet(genreName, music.library, this.dataSource);
        genres.push(genre);
      }
      music.genre = genres;
      tags['genre'] = dto.genre.join(';');
    }

    if (dto.disc) {
      tags['partOfSet'] = dto.disc;
    }
    const updateMusicStartTime = Date.now();
    const file = await fs.promises.readFile(music.path);
    const buf = await id3Promise.update(tags, file);
    await fs.promises.writeFile(music.path, buf);
    const updateMusicEndTime = Date.now();
    this.logService.info({
      content: `update music time: ${
        updateMusicEndTime - updateMusicStartTime
      }`,
    });
    await this.dataSource.getRepository(Music).save(music);
    this.meili.notifyTrackUpsert(music.id);
    if (music.album?.id) {
      this.meili.notifyAlbumUpsert(music.album.id);
    }
    if (artists.length > 0) {
      this.meili.notifyArtistUpsert(...artists.map((a) => a.id));
    }
    // recycle old album
    if (prevAlbum) {
      const refreshArtistStartTime = Date.now();
      await prevAlbum.refreshArtist(this.dataSource);
      const refreshArtistEndTime = Date.now();
      this.logService.info({
        content: `refresh artist time: ${
          refreshArtistEndTime - refreshArtistStartTime
        }`,
      });
      const refreshGenreStartTime = Date.now();
      await Album.recycle(prevAlbum.id, this.dataSource);
      const refreshGenreEndTime = Date.now();
      this.logService.info({
        content: `refresh genre time: ${
          refreshGenreEndTime - refreshGenreStartTime
        }`,
      });
    }
    if (music.album) {
      await music.album.refreshArtist(this.dataSource);
    }
    if (dto.coverUrl) {
      await this.setMusicCoverFromUrl(music.id, dto.coverUrl);
    }
  }

  async updateMusicCover(id: number, coverfile: any) {
    const music = await this.dataSource.getRepository(Music).findOne({
      where: { id },
      relations: ['album', 'album.music'],
    });
    if (music === undefined || music === null) {
      throw new Error('music not exist');
    }
    const mime = path.extname(coverfile.originalname).replace('.', '');
    const tags = {
      image: {
        mime,
        type: {
          id: 3,
          name: 'front cover',
        },
        description: 'cover',
        imageBuffer: coverfile.buffer,
      },
    };
    const file = await fs.promises.readFile(music.path);
    const buf = await id3Promise.update(tags, file);
    await fs.promises.writeFile(music.path, buf);
    if (music.album) {
      // save album cover
      const coverFilename = `${uuidv4()}.jpg`;
      await this.thumbnailService.generate(
        coverfile.buffer as any,
        coverFilename,
      );
      music.album.cover = coverFilename;
      await this.dataSource.getRepository(Album).save(music.album);
    }
  }

  async setMusicCoverFromUrl(musicId: number, url: string) {
    const response = await this.httpService
      .request({
        url,
        method: 'GET',
        responseType: 'arraybuffer',
      })
      .toPromise();
    const imageBuf = Buffer.from(response.data, 'binary');

    const contentType = String(response.headers['content-type'] || '');
    const ext = getImageFromContentType(contentType);
    if (!ext) {
      return;
    }
    const music = await this.dataSource.getRepository(Music).findOne({
      where: { id: musicId },
      relations: ['album'],
    });
    if (!music.album.cover) {
      const saveFilename = `${v4()}.${ext}`;

      const savePath = Path.join(ApplicationConfig.coverDir, saveFilename);
      await fs.promises.writeFile(savePath, imageBuf);
      music.album.cover = saveFilename;
      await this.dataSource.getRepository(Album).save(music.album);
    }
    const tags = {
      image: {
        mime: contentType,
        type: {
          id: 3,
          name: 'front cover',
        },
        description: 'cover',
        imageBuffer: imageBuf,
      },
    };
    const file = await fs.promises.readFile(music.path);
    const buf = await id3Promise.update(tags, file);
    await fs.promises.writeFile(music.path, buf);
  }

  async updateLyric(id: number, uid: string, content: string): Promise<Music> {
    const music = await this.findOne(id, uid);
    if (!music) {
      return;
    }
    const trimmed = (content || '').trim();
    if (!trimmed) {
      throw new Error('lyric content is empty');
    }
    const nextPath = resolveLrcPath(music.path);
    if (
      music.lyric &&
      music.lyric.length !== 0 &&
      fs.existsSync(music.lyric) &&
      path.resolve(music.lyric) !== path.resolve(nextPath)
    ) {
      await fs.promises.unlink(music.lyric);
    }
    music.lyric = await writeLrcBesideAudio(music.path, trimmed);
    return music.save(this.dataSource);
  }

  async probeLyric(id: number, uid: string): Promise<{
    found: boolean;
    source?: 'LocalFile' | 'Embedded';
    path?: string;
    preview?: string;
    applied: boolean;
  }> {
    const music = await this.findOne(id, uid);
    if (!music) {
      return { found: false, applied: false };
    }

    const existing = await readLrcIfExists(music.path);
    if (existing) {
      const alreadyLinked =
        music.lyric && path.resolve(music.lyric) === path.resolve(existing.path);
      if (!alreadyLinked) {
        music.lyric = existing.path;
        await music.save(this.dataSource);
      }
      return {
        found: true,
        source: 'LocalFile',
        path: existing.path,
        preview: existing.content.slice(0, 4000),
        applied: true,
      };
    }

    try {
      const meta = await mm.parseFile(music.path);
      const embedded = extractEmbeddedLyrics(meta.common || {});
      if (embedded) {
        const lrcPath = await writeLrcBesideAudio(music.path, embedded);
        music.lyric = lrcPath;
        await music.save(this.dataSource);
        return {
          found: true,
          source: 'Embedded',
          path: lrcPath,
          preview: embedded.slice(0, 4000),
          applied: true,
        };
      }
    } catch {
      // ignore parse errors
    }

    return { found: false, applied: false };
  }

  private async hasUsableLyric(music: Music): Promise<boolean> {
    if (music.lyric && fs.existsSync(music.lyric)) {
      try {
        const content = await fs.promises.readFile(music.lyric, 'utf8');
        if (content.trim()) return true;
      } catch {
        // fall through
      }
    }
    const beside = await readLrcIfExists(music.path);
    return !!beside?.content?.trim();
  }

  /**
   * Auto scrape lyric: local probe → online match → high-confidence apply.
   */
  async scrapeLyric(
    id: number,
    uid: string,
    opts?: { force?: boolean; apply?: boolean },
  ): Promise<LyricScrapeResult> {
    const force = !!opts?.force;
    const apply = opts?.apply !== false;
    const music = await this.findOne(id, uid);
    if (!music) {
      return { musicId: id, status: 'error', message: 'music not found' };
    }

    if (!force && (await this.hasUsableLyric(music))) {
      const content = await this.getLyricContent(id, uid);
      return {
        musicId: id,
        status: 'exists',
        source: 'Local',
        preview: content?.content?.slice(0, 4000),
      };
    }

    const probed = await this.probeLyric(id, uid);
    if (probed.found) {
      this.scrapeFailAt.delete(id);
      return {
        musicId: id,
        status: 'applied',
        source: probed.source,
        preview: probed.preview,
        message: 'from local/embedded',
      };
    }

    if (!force) {
      const failedAt = this.scrapeFailAt.get(id);
      if (failedAt && Date.now() - failedAt < this.scrapeCooldownMs) {
        return {
          musicId: id,
          status: 'cooldown',
          message: 'recently failed; pass force=1 to retry',
        };
      }
    }

    try {
      const artist = (music.artist || []).map((a) => a.name).filter(Boolean)[0];
      const match = await this.metaService.findBestOnlineLyric({
        title: music.title,
        artist,
        album: music.album?.name,
        duration: music.duration,
      });

      if (apply && match.best) {
        await this.updateLyric(id, uid, match.best.content);
        this.scrapeFailAt.delete(id);
        this.logger.log(
          `lyric auto-applied music=${id} source=${match.best.source} score=${match.best.score.toFixed(3)}`,
        );
        return {
          musicId: id,
          status: 'applied',
          source: match.best.source,
          score: match.best.score,
          preview: match.best.content.slice(0, 4000),
          candidates: match.candidates.slice(0, 5),
        };
      }

      if (match.candidates.length > 0) {
        this.scrapeFailAt.set(id, Date.now());
        return {
          musicId: id,
          status: 'candidates',
          message: 'no high-confidence synced lyric; candidates available',
          candidates: match.candidates.slice(0, 5),
          score: match.candidates[0]?.score,
        };
      }

      this.scrapeFailAt.set(id, Date.now());
      return { musicId: id, status: 'not_found' };
    } catch (err) {
      this.scrapeFailAt.set(id, Date.now());
      this.logger.warn(
        `lyric scrape failed music=${id}: ${(err as Error).message}`,
      );
      return {
        musicId: id,
        status: 'error',
        message: (err as Error).message,
      };
    }
  }

  getLyricScrapeJob(jobId: string): LyricScrapeJob | undefined {
    return this.scrapeJobs.get(jobId);
  }

  async startBatchLyricScrape(
    uid: string,
    opts?: { limit?: number; force?: boolean; ids?: number[] },
  ): Promise<LyricScrapeJob> {
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
    let ids = (opts?.ids || []).filter((n) => Number.isFinite(n) && n > 0);

    if (ids.length === 0) {
      const libraries = await MediaLibrary.getLibraryByUid(uid, this.dataSource);
      const qb = this.dataSource
        .getRepository(Music)
        .createQueryBuilder('music')
        .select('music.id', 'id')
        .where("(music.lyric IS NULL OR TRIM(music.lyric) = '')")
        .orderBy('music.id', 'DESC')
        .take(limit);
      if (libraries.length > 0) {
        qb.andWhere('music.libraryId in (:...lid)', {
          lid: libraries.map((it) => it.id),
        });
      }
      const rows = await qb.getRawMany<{ id: number }>();
      ids = rows.map((r) => Number(r.id)).filter(Boolean);
    } else {
      ids = ids.slice(0, limit);
    }

    const job: LyricScrapeJob = {
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

    // Fire-and-forget background worker
    void this.runBatchLyricScrape(job, ids, !!opts?.force);
    return job;
  }

  private async runBatchLyricScrape(
    job: LyricScrapeJob,
    ids: number[],
    force: boolean,
  ) {
    if (this.batchRunning) {
      // Simple serialization: wait until free
      while (this.batchRunning) {
        await new Promise((r) => setTimeout(r, 500));
        if (job.cancelled) {
          job.status = 'Error';
          job.finishedAt = new Date().toISOString();
          return;
        }
      }
    }
    this.batchRunning = true;
    try {
      for (const id of ids) {
        if (job.cancelled) break;
        try {
          const result = await this.scrapeLyric(id, job.uid, {
            force,
            apply: true,
          });
          if (result.status === 'applied') job.applied += 1;
          else if (
            result.status === 'exists' ||
            result.status === 'cooldown' ||
            result.status === 'candidates'
          ) {
            job.skipped += 1;
          } else {
            job.failed += 1;
          }
        } catch {
          job.failed += 1;
        }
        job.current += 1;
        // gentle rate limit for external providers
        await new Promise((r) => setTimeout(r, 1200));
      }
      job.status = job.cancelled ? 'Error' : 'Done';
      job.finishedAt = new Date().toISOString();
    } catch (err) {
      job.status = 'Error';
      job.finishedAt = new Date().toISOString();
      this.logger.warn(`batch lyric scrape error: ${(err as Error).message}`);
    } finally {
      this.batchRunning = false;
    }
  }

  async getLyricContent(
    id: number,
    uid: string,
  ): Promise<{ content: string; path?: string; missing?: boolean } | null> {
    const music = await this.findOne(id, uid);
    if (!music) {
      return { content: '', missing: true };
    }
    if (!music.lyric || !fs.existsSync(music.lyric)) {
      return null;
    }
    const content = await fs.promises.readFile(music.lyric, 'utf8');
    return { content, path: music.lyric };
  }

  async addMusicTags(names: string[], musicId: number, replace: boolean) {
    const music = await this.dataSource.getRepository(Music).findOne({
      where: { id: musicId },
      relations: ['library', 'tags'],
    });
    const tags = await this.dataSource.getRepository(Tag).find({
      where: {
        name: In(names),
      },
    });
    // get not exist tags
    const notExistTags = names.filter((name) => {
      return tags.find((tag) => tag.name === name) === undefined;
    });
    if (notExistTags.length !== 0) {
      const newTags = await this.dataSource.getRepository(Tag).save(
        notExistTags.map((name) => {
          return {
            name,
            library: music.library,
          };
        }),
      );
      tags.push(...newTags);
    }
    if (replace) {
      music.tags = tags;
    } else {
      music.tags = [...music.tags, ...tags];
    }
    await this.dataSource.getRepository(Music).save(music);
  }
}
