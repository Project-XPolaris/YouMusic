import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { DataSource } from 'typeorm';
import { Artist } from '../database/entites/artist';
import { Music } from '../database/entites/music';
import { Album } from '../database/entites/album';
import { PageFilter } from '../database/utils/type.filter';
import { filterByPage } from '../database/utils/page.filter';
import { v4 } from 'uuid';
import * as db from 'mime-db';
import { ApplicationConfig } from '../config';
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { getArrayBufferFromUrl } from '../utils/request';
import {
  ApplyArtistAvatarDto,
  AvatarCandidate,
  UpdateArtistDTO,
} from './dto/update-artist.dto';
import { MediaLibrary } from '../database/entites/library';
import { NeteasemusicService } from '../neteasemusic/neteasemusic.service';
import { SearchType } from 'NeteaseCloudMusicApi';
import { stringSimilarity } from '../utils/lyric-match';
import { mbApi } from '../mb';
import {
  ARTISTS_INDEX,
  MeilisearchService,
} from '../meilisearch/meilisearch.service';
import Jimp = require('jimp');

export type ArtistFilter = PageFilter & {
  order: { [key: string]: 'ASC' | 'DESC' };
  uid: string;
  search: string;
  random: boolean;
  followUid?: string;
  id: number;
  missingAvatar?: boolean;
  missingBio?: boolean;
};

export type AutoAvatarResult = {
  artist: Artist;
  source: 'local' | 'itunes' | 'deezer' | 'netease' | 'exists' | 'none';
  score?: number;
};

export type ArtistScrapeResult = {
  artistId: number;
  status: 'applied' | 'partial' | 'exists' | 'not_found' | 'error';
  avatarSource?: AutoAvatarResult['source'];
  metaFilled?: string[];
  message?: string;
  artist?: Artist;
};

export type ArtistScrapeJob = {
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

const LOCAL_AVATAR_NAMES = [
  'artist.jpg',
  'artist.jpeg',
  'artist.png',
  'artist.webp',
  'folder.jpg',
  'folder.jpeg',
  'folder.png',
  'cover.jpg',
  'cover.jpeg',
  'cover.png',
];

/** High-confidence remote avatar: exact name or near-exact similarity. */
const AUTO_AVATAR_MIN_SIM = 0.92;

@Injectable()
export class ArtistService {
  private readonly logger = new Logger(ArtistService.name);
  private readonly scrapeJobs = new Map<string, ArtistScrapeJob>();
  private batchRunning = false;

  constructor(
    private httpService: HttpService,
    private dataSource: DataSource,
    private neteaseMusicService: NeteasemusicService,
    private meili: MeilisearchService,
  ) {}

  async findAll(filter: ArtistFilter) {
    const libraries = await MediaLibrary.getLibraryByUid(filter.uid, this.dataSource);
    const artistRepository = this.dataSource.getRepository(Artist);
    let queryBuilder = artistRepository.createQueryBuilder('artist');
    queryBuilder = filterByPage<Artist>(filter, queryBuilder);
    let meiliOrderedIds: number[] | null = null;
    if (filter.search.length > 0) {
      const meiliIds = await this.meili.searchIds(ARTISTS_INDEX, filter.search);
      if (meiliIds !== null) {
        if (meiliIds.length === 0) {
          return [[], 0] as [Artist[], number];
        }
        meiliOrderedIds = meiliIds;
        queryBuilder = queryBuilder.andWhere('artist.id IN (:...meiliIds)', {
          meiliIds,
        });
      } else {
        queryBuilder = queryBuilder.andWhere('artist.name like :search', {
          search: `%${filter.search}%`,
        });
      }
    }
    if (filter.random) {
      if (this.dataSource.options.type === 'sqlite') {
        queryBuilder.orderBy('RANDOM()');
      } else {
        queryBuilder.orderBy('RAND()');
      }
    } else if (meiliOrderedIds?.length) {
      const orderCase = this.meili.buildIdOrderCase('artist', meiliOrderedIds);
      if (orderCase) {
        queryBuilder.orderBy(orderCase, 'ASC');
      }
    } else {
      const order = {};
      Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
        order[`artist.${fieldName}`] = filter.order[fieldName];
      });
      queryBuilder.orderBy(order);
    }
    if (filter.id > 0) {
      queryBuilder = queryBuilder.andWhere('artist.id = :aid', {
        aid: filter.id,
      });
    }
    if (filter.missingAvatar) {
      queryBuilder = queryBuilder.andWhere(
        "(artist.avatar IS NULL OR TRIM(artist.avatar) = '')",
      );
    }
    if (filter.missingBio) {
      queryBuilder = queryBuilder.andWhere(
        "(artist.bio IS NULL OR TRIM(artist.bio) = '')",
      );
    }
    if (libraries.length > 0) {
      queryBuilder = queryBuilder
        .leftJoin('artist.music', 'music')
        .groupBy('artist.id')
        .andWhere('music.libraryId in (:...id)', {
          id: libraries.map((it) => it.id),
        });
    }
    if (filter.followUid && filter.followUid.length > 0) {
      queryBuilder = queryBuilder
        .leftJoin('artist.follow', 'follow')
        .andWhere('follow.uid = :uid', { uid: filter.uid });
    }
    return await queryBuilder.getManyAndCount();
  }

  async findOne(id: number, uid: string) {
    const artistRepository = this.dataSource.getRepository(Artist);
    return await artistRepository
      .createQueryBuilder('artist')
      .andWhereInIds([id])
      .getOne();
  }

  async findOneWithStats(id: number, uid: string) {
    const artist = await this.findOne(id, uid);
    if (!artist) {
      return undefined;
    }
    const musicCount = await this.dataSource
      .getRepository(Music)
      .createQueryBuilder('music')
      .leftJoin('music.artist', 'artist')
      .where('artist.id = :id', { id })
      .getCount();
    const albumCount = await this.dataSource
      .getRepository(Album)
      .createQueryBuilder('album')
      .innerJoin('album.music', 'music')
      .innerJoin('music.artist', 'artist')
      .where('artist.id = :id', { id })
      .distinct(true)
      .getCount();
    return {
      ...artist,
      musicCount,
      albumCount,
    };
  }

  async getAvatarFilePath(id: number): Promise<string | undefined> {
    const artist = await this.dataSource.getRepository(Artist).findOne({
      where: { id },
    });
    if (!artist?.avatar) {
      return undefined;
    }
    const full = path.join(ApplicationConfig.coverDir, artist.avatar);
    try {
      await fs.promises.access(full, fs.constants.R_OK);
      return full;
    } catch {
      return undefined;
    }
  }

  async updateArtistAvatarFromUrl(id: number, url: string) {
    const artist = await this.dataSource.getRepository(Artist).findOne({
      where: { id },
    });
    if (!artist) {
      return;
    }
    const { response, buf } = await getArrayBufferFromUrl(
      this.httpService,
      url,
    );
    const contentType = String(response.headers['content-type'] || '');
    const saveFilename = `${v4()}.${db[contentType]?.extensions?.[0] || 'jpg'}`;
    const savePath = path.join(ApplicationConfig.coverDir, saveFilename);
    await fs.promises.mkdir(ApplicationConfig.coverDir, { recursive: true });
    await fs.promises.writeFile(savePath, buf);
    if (artist.avatar) {
      try {
        await fs.promises.unlink(
          path.join(ApplicationConfig.coverDir, artist.avatar),
        );
      } catch {
        // ignore missing old avatar
      }
    }
    artist.avatar = saveFilename;
    return await this.dataSource.getRepository(Artist).save(artist);
  }

  async updateArtistAvatarFromFile(
    id: number,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    const artist = await this.dataSource.getRepository(Artist).findOne({
      where: { id },
    });
    if (!artist) {
      return;
    }
    const contentType = file.mimetype || 'image/jpeg';
    const ext =
      db[contentType]?.extensions?.[0] ||
      path.extname(file.originalname).replace('.', '') ||
      'jpg';
    const saveFilename = `${v4()}.${ext}`;
    const savePath = path.join(ApplicationConfig.coverDir, saveFilename);
    await fs.promises.mkdir(ApplicationConfig.coverDir, { recursive: true });
    await fs.promises.writeFile(savePath, file.buffer);
    if (artist.avatar) {
      try {
        await fs.promises.unlink(
          path.join(ApplicationConfig.coverDir, artist.avatar),
        );
      } catch {
        // ignore missing old avatar
      }
    }
    artist.avatar = saveFilename;
    return await this.dataSource.getRepository(Artist).save(artist);
  }

  async updateArtistAvatarFromBuffer(
    id: number,
    buf: Buffer,
    ext = 'jpg',
  ): Promise<Artist | undefined> {
    const artist = await this.dataSource.getRepository(Artist).findOne({
      where: { id },
    });
    if (!artist) {
      return;
    }
    const saveFilename = `${v4()}.${ext}`;
    const savePath = path.join(ApplicationConfig.coverDir, saveFilename);
    await fs.promises.mkdir(ApplicationConfig.coverDir, { recursive: true });
    await fs.promises.writeFile(savePath, buf);
    if (artist.avatar) {
      try {
        await fs.promises.unlink(
          path.join(ApplicationConfig.coverDir, artist.avatar),
        );
      } catch {
        // ignore
      }
    }
    artist.avatar = saveFilename;
    return await this.dataSource.getRepository(Artist).save(artist);
  }

  private async buildLocalAvatarBuffer(artistId: number): Promise<Buffer | null> {
    const albums = await this.dataSource
      .getRepository(Album)
      .createQueryBuilder('album')
      .innerJoin('album.music', 'music')
      .innerJoin('music.artist', 'artist')
      .where('artist.id = :id', { id: artistId })
      .andWhere('album.cover IS NOT NULL')
      .andWhere("album.cover != ''")
      .orderBy('album.id', 'DESC')
      .take(4)
      .getMany();

    const files: string[] = [];
    for (const album of albums) {
      if (!album.cover) continue;
      const full = path.join(ApplicationConfig.coverDir, album.cover);
      try {
        await fs.promises.access(full);
        files.push(full);
      } catch {
        // skip missing files
      }
    }
    if (files.length === 0) return null;

    const size = 512;
    const canvas = await new Jimp(size, size, 0xff222222);
    const images = await Promise.all(files.slice(0, 4).map((f) => Jimp.read(f)));

    if (images.length === 1) {
      const img = images[0].cover(size, size);
      return await img.quality(90).getBufferAsync(Jimp.MIME_JPEG);
    }

    if (images.length === 2) {
      const w = Math.floor(size / 2);
      images[0].cover(w, size);
      images[1].cover(w, size);
      canvas.composite(images[0], 0, 0);
      canvas.composite(images[1], w, 0);
      return await canvas.quality(90).getBufferAsync(Jimp.MIME_JPEG);
    }

    const cell = Math.floor(size / 2);
    const positions = [
      [0, 0],
      [cell, 0],
      [0, cell],
      [cell, cell],
    ] as const;
    for (let i = 0; i < 4; i++) {
      const img = images[Math.min(i, images.length - 1)].clone().cover(cell, cell);
      canvas.composite(img, positions[i][0], positions[i][1]);
    }
    return await canvas.quality(90).getBufferAsync(Jimp.MIME_JPEG);
  }

  private async fetchItunesArtistImageUrl(
    artistName: string,
  ): Promise<string | null> {
    const term = encodeURIComponent(artistName.trim());
    if (!term) return null;
    const url = `https://itunes.apple.com/search?term=${term}&entity=album&attribute=artistTerm&limit=8`;
    try {
      const response = await this.httpService.axiosRef.get(url, {
        timeout: 12000,
      });
      const results: Array<{ artistName?: string; artworkUrl100?: string }> =
        response.data?.results || [];
      const normalized = artistName.trim().toLowerCase();
      const ranked = [...results].sort((a, b) => {
        const aMatch = (a.artistName || '').toLowerCase() === normalized ? 0 : 1;
        const bMatch = (b.artistName || '').toLowerCase() === normalized ? 0 : 1;
        return aMatch - bMatch;
      });
      for (const item of ranked) {
        const art = item.artworkUrl100;
        if (!art) continue;
        return art.replace('100x100bb', '600x600bb');
      }
    } catch (e) {
      console.error('itunes artist image failed', e);
    }
    return null;
  }

  async autoFillAvatar(
    id: number,
    opts?: { force?: boolean },
  ): Promise<AutoAvatarResult> {
    const artist = await this.dataSource.getRepository(Artist).findOne({
      where: { id },
    });
    if (!artist) {
      throw new Error('artist not found');
    }

    if (artist.avatar && !opts?.force) {
      return { artist, source: 'exists' };
    }

    // 1) Local file beside music (artist.jpg etc.)
    try {
      const candidates = await this.searchAvatarCandidates(id);
      const localFile = candidates.find((c) => c.source === 'local' && c.localPath);
      if (localFile) {
        const saved = await this.applyAvatarCandidate(id, {
          source: 'local',
          localPath: localFile.localPath,
        });
        return { artist: saved, source: 'local', score: localFile.score };
      }

      // 2) High-confidence Deezer / Netease
      const remoteHit = candidates.find(
        (c) =>
          (c.source === 'deezer' || c.source === 'netease') &&
          !!c.imageUrl &&
          this.isHighConfidenceArtistName(artist.name, c.name),
      );
      if (remoteHit) {
        const saved = await this.applyAvatarCandidate(id, {
          source: remoteHit.source,
          imageUrl: remoteHit.imageUrl,
          externalId: remoteHit.externalId,
          name: remoteHit.name,
        });
        if (remoteHit.source === 'deezer' && remoteHit.externalId) {
          saved.deezerId = saved.deezerId || remoteHit.externalId;
          await this.dataSource.getRepository(Artist).save(saved);
        }
        if (remoteHit.source === 'netease' && remoteHit.externalId) {
          saved.neteaseId = saved.neteaseId || remoteHit.externalId;
          await this.dataSource.getRepository(Artist).save(saved);
        }
        return {
          artist: saved,
          source: remoteHit.source,
          score: remoteHit.score,
        };
      }
    } catch (e) {
      this.logger.warn(
        `avatar candidates failed artist=${id}: ${(e as Error).message}`,
      );
    }

    // 3) Collage from album covers
    const localBuf = await this.buildLocalAvatarBuffer(id);
    if (localBuf) {
      const saved = await this.updateArtistAvatarFromBuffer(id, localBuf, 'jpg');
      return { artist: saved!, source: 'local' };
    }

    // 4) iTunes fallback
    const remote = await this.fetchItunesArtistImageUrl(artist.name);
    if (!remote) {
      return { artist, source: 'none' };
    }
    const saved = await this.updateArtistAvatarFromUrl(id, remote);
    if (!saved) {
      throw new Error('failed to save avatar');
    }
    return { artist: saved, source: 'itunes' };
  }

  private isHighConfidenceArtistName(query: string, candidate: string): boolean {
    const score = this.scoreNameMatch(query, candidate);
    if (score >= 100) return true;
    const sim = stringSimilarity(query, candidate);
    return sim >= AUTO_AVATAR_MIN_SIM && score >= 80;
  }

  /**
   * Scrape avatar (if missing) + bio / external ids (empty fields only).
   */
  async scrapeArtist(
    id: number,
    uid: string,
    opts?: { forceAvatar?: boolean; forceMeta?: boolean },
  ): Promise<ArtistScrapeResult> {
    if (!(await this.checkAccessible(id, uid))) {
      return { artistId: id, status: 'error', message: 'not accessible' };
    }
    try {
      const avatar = await this.autoFillAvatar(id, {
        force: !!opts?.forceAvatar,
      });
      const meta = await this.fillArtistMeta(id, {
        force: !!opts?.forceMeta,
      });
      const artist = await this.dataSource.getRepository(Artist).findOne({
        where: { id },
      });
      const filledAvatar =
        avatar.source !== 'exists' && avatar.source !== 'none';
      const filledMeta = (meta.filled || []).length > 0;
      if (!filledAvatar && !filledMeta && avatar.source === 'exists') {
        return {
          artistId: id,
          status: 'exists',
          avatarSource: avatar.source,
          metaFilled: meta.filled,
          artist: artist || undefined,
        };
      }
      if (!filledAvatar && !filledMeta && avatar.source === 'none') {
        return {
          artistId: id,
          status: meta.filled?.length ? 'partial' : 'not_found',
          avatarSource: avatar.source,
          metaFilled: meta.filled,
          artist: artist || undefined,
        };
      }
      return {
        artistId: id,
        status: filledAvatar && filledMeta ? 'applied' : 'partial',
        avatarSource: avatar.source,
        metaFilled: meta.filled,
        artist: artist || undefined,
      };
    } catch (e) {
      this.logger.warn(`scrape artist=${id}: ${(e as Error).message}`);
      return {
        artistId: id,
        status: 'error',
        message: (e as Error).message,
      };
    }
  }

  async fillArtistMeta(
    id: number,
    opts?: { force?: boolean },
  ): Promise<{ artist: Artist; filled: string[] }> {
    const repo = this.dataSource.getRepository(Artist);
    let artist = await repo.findOne({ where: { id } });
    if (!artist) throw new Error('artist not found');
    const force = !!opts?.force;
    const filled: string[] = [];

    // Netease: id + bio
    try {
      let nemId = artist.neteaseId;
      if (!nemId || force) {
        const result = await this.neteaseMusicService.search(artist.name, {
          type: SearchType.artist,
          limit: 8,
        });
        const artists: Array<{ id?: number; name?: string }> =
          result?.artists || [];
        const hit = artists.find((a) =>
          this.isHighConfidenceArtistName(artist!.name, a.name || ''),
        );
        if (hit?.id != null) {
          nemId = String(hit.id);
          if (!artist.neteaseId || force) {
            artist.neteaseId = nemId;
            filled.push('neteaseId');
          }
        }
      }
      if (nemId && (!artist.bio?.trim() || force)) {
        let bio = await this.neteaseMusicService.getArtistDesc(nemId);
        if (!bio) {
          const detail = await this.neteaseMusicService.getArtistDetail(nemId);
          bio = String(detail?.briefDesc || '').trim();
        }
        if (bio) {
          artist.bio = bio.slice(0, 8000);
          filled.push('bio');
        }
      }
    } catch (e) {
      this.logger.warn(
        `netease meta artist=${id}: ${(e as Error).message}`,
      );
    }

    // Deezer id
    try {
      if (!artist.deezerId || force) {
        const response = await this.httpService.axiosRef.get(
          'https://api.deezer.com/search/artist',
          {
            params: { q: artist.name, limit: 8 },
            timeout: 12000,
          },
        );
        const data: Array<{ id?: number; name?: string }> =
          response.data?.data || [];
        const hit = data.find((a) =>
          this.isHighConfidenceArtistName(artist!.name, a.name || ''),
        );
        if (hit?.id != null && (!artist.deezerId || force)) {
          artist.deezerId = String(hit.id);
          filled.push('deezerId');
        }
      }
    } catch (e) {
      this.logger.warn(`deezer meta artist=${id}: ${(e as Error).message}`);
    }

    // MusicBrainz: mbid + country
    try {
      if (!artist.mbid || !artist.country || force) {
        let artists: Array<{
          id?: string;
          name?: string;
          country?: string;
        }> = [];
        try {
          const mb = await (mbApi as any).searchArtist(artist.name, 5);
          artists = mb?.artists || [];
        } catch {
          const mb = await mbApi.search('artist', {
            query: artist.name,
            limit: 5,
          } as any);
          artists = (mb as any)?.artists || [];
        }
        const hit = artists.find((a) =>
          this.isHighConfidenceArtistName(artist!.name, a.name || ''),
        );
        if (hit?.id && (!artist.mbid || force)) {
          artist.mbid = hit.id;
          filled.push('mbid');
        }
        if (hit?.country && (!artist.country || force)) {
          artist.country = hit.country;
          filled.push('country');
        }
      }
    } catch (e) {
      this.logger.warn(`mb meta artist=${id}: ${(e as Error).message}`);
    }

    if (filled.length > 0) {
      artist.scrapedAt = new Date();
      artist = await repo.save(artist);
    }
    return { artist, filled: [...new Set(filled)] };
  }

  getArtistScrapeJob(jobId: string): ArtistScrapeJob | undefined {
    return this.scrapeJobs.get(jobId);
  }

  async startBatchArtistScrape(
    uid: string,
    opts?: {
      limit?: number;
      force?: boolean;
      ids?: number[];
      missingAvatarOnly?: boolean;
    },
  ): Promise<ArtistScrapeJob> {
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
    let ids = (opts?.ids || []).filter((n) => Number.isFinite(n) && n > 0);
    const missingAvatarOnly = opts?.missingAvatarOnly !== false;

    if (ids.length === 0) {
      const [list] = await this.findAll({
        page: 1,
        pageSize: limit,
        order: { id: 'DESC' },
        uid,
        search: '',
        random: false,
        followUid: undefined,
        id: 0,
        missingAvatar: missingAvatarOnly,
      });
      ids = list.map((a) => a.id);
    } else {
      ids = ids.slice(0, limit);
    }

    const job: ArtistScrapeJob = {
      id: v4(),
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
    void this.runBatchArtistScrape(job, ids, !!opts?.force);
    return job;
  }

  private async runBatchArtistScrape(
    job: ArtistScrapeJob,
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
          const result = await this.scrapeArtist(id, job.uid, {
            forceAvatar: force,
            forceMeta: force,
          });
          if (result.status === 'applied' || result.status === 'partial') {
            if (
              result.avatarSource &&
              result.avatarSource !== 'exists' &&
              result.avatarSource !== 'none'
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
      this.logger.warn(`batch artist scrape: ${(e as Error).message}`);
    } finally {
      this.batchRunning = false;
    }
  }

  private scoreNameMatch(query: string, name: string): number {
    const q = query.trim().toLowerCase();
    const n = (name || '').trim().toLowerCase();
    if (!q || !n) return 0;
    if (q === n) return 100;
    if (n.includes(q) || q.includes(n)) return 80;
    return 50;
  }

  private candidateId(source: string, key: string): string {
    return createHash('sha1').update(`${source}:${key}`).digest('hex').slice(0, 16);
  }

  private mimeFromExt(ext: string): string {
    const e = ext.replace('.', '').toLowerCase();
    if (e === 'png') return 'image/png';
    if (e === 'webp') return 'image/webp';
    if (e === 'gif') return 'image/gif';
    return 'image/jpeg';
  }

  private async collectArtistMusicDirs(artistId: number): Promise<string[]> {
    const musics = await this.dataSource
      .getRepository(Music)
      .createQueryBuilder('music')
      .innerJoin('music.artist', 'artist')
      .where('artist.id = :id', { id: artistId })
      .select(['music.id', 'music.path'])
      .take(80)
      .getMany();

    const dirs = new Set<string>();
    for (const music of musics) {
      if (!music.path) continue;
      const dir = path.dirname(music.path);
      dirs.add(dir);
      dirs.add(path.dirname(dir));
    }
    return [...dirs];
  }

  private async findLocalAvatarCandidates(
    artistId: number,
    artistName: string,
  ): Promise<AvatarCandidate[]> {
    const dirs = await this.collectArtistMusicDirs(artistId);
    const found = new Map<string, AvatarCandidate>();
    const nameVariants = [
      ...LOCAL_AVATAR_NAMES,
      `${artistName}.jpg`,
      `${artistName}.jpeg`,
      `${artistName}.png`,
      `${artistName}.webp`,
    ];

    for (const dir of dirs) {
      for (const filename of nameVariants) {
        const full = path.join(dir, filename);
        try {
          await fs.promises.access(full, fs.constants.R_OK);
        } catch {
          continue;
        }
        const resolved = path.resolve(full);
        if (found.has(resolved)) continue;
        const ext = path.extname(resolved).slice(1) || 'jpg';
        const buf = await fs.promises.readFile(resolved);
        if (buf.length > 8 * 1024 * 1024) continue;
        const dataUrl = `data:${this.mimeFromExt(ext)};base64,${buf.toString(
          'base64',
        )}`;
        found.set(resolved, {
          id: this.candidateId('local', resolved),
          source: 'local',
          name: artistName,
          imageUrl: dataUrl,
          thumbnailUrl: dataUrl,
          score: this.scoreNameMatch(artistName, artistName) + 20,
          localPath: resolved,
        });
      }
    }
    return [...found.values()];
  }

  private async findDeezerAvatarCandidates(
    keyword: string,
  ): Promise<AvatarCandidate[]> {
    const q = keyword.trim();
    if (!q) return [];
    try {
      const response = await this.httpService.axiosRef.get(
        'https://api.deezer.com/search/artist',
        {
          params: { q, limit: 12 },
          timeout: 12000,
        },
      );
      const data: Array<{
        id?: number;
        name?: string;
        picture_medium?: string;
        picture_xl?: string;
        picture_big?: string;
      }> = response.data?.data || [];
      return data
        .filter((item) => item.picture_xl || item.picture_big || item.picture_medium)
        .map((item) => {
          const imageUrl =
            item.picture_xl || item.picture_big || item.picture_medium || '';
          const thumbnailUrl = item.picture_medium || imageUrl;
          return {
            id: this.candidateId('deezer', String(item.id || imageUrl)),
            source: 'deezer' as const,
            name: item.name || q,
            imageUrl,
            thumbnailUrl,
            score: this.scoreNameMatch(q, item.name || ''),
            externalId: item.id != null ? String(item.id) : undefined,
          };
        });
    } catch (e) {
      console.error('deezer artist search failed', e);
      return [];
    }
  }

  private async findNeteaseAvatarCandidates(
    keyword: string,
  ): Promise<AvatarCandidate[]> {
    const q = keyword.trim();
    if (!q) return [];
    try {
      const result = await this.neteaseMusicService.search(q, {
        type: SearchType.artist,
        limit: 12,
      });
      const artists: Array<{
        id?: number;
        name?: string;
        picUrl?: string;
        img1v1Url?: string;
      }> = result?.artists || [];
      return artists
        .map((item) => {
          const raw = item.picUrl || item.img1v1Url || '';
          if (!raw) return null;
          const imageUrl = raw.includes('?')
            ? raw.replace(/param=\d+y\d+/i, 'param=600y600')
            : `${raw}?param=600y600`;
          const thumbnailUrl = raw.includes('?')
            ? raw.replace(/param=\d+y\d+/i, 'param=200y200')
            : `${raw}?param=200y200`;
          return {
            id: this.candidateId('netease', String(item.id || imageUrl)),
            source: 'netease' as const,
            name: item.name || q,
            imageUrl,
            thumbnailUrl,
            score: this.scoreNameMatch(q, item.name || ''),
            externalId: item.id != null ? String(item.id) : undefined,
          };
        })
        .filter(Boolean) as AvatarCandidate[];
    } catch (e) {
      console.error('netease artist search failed', e);
      return [];
    }
  }

  async searchAvatarCandidates(
    artistId: number,
    keyword?: string,
  ): Promise<AvatarCandidate[]> {
    const artist = await this.dataSource.getRepository(Artist).findOne({
      where: { id: artistId },
    });
    if (!artist) {
      throw new Error('artist not found');
    }
    const q = (keyword || artist.name || '').trim();
    if (!q) {
      throw new Error('empty keyword');
    }

    const [local, deezer, netease] = await Promise.all([
      this.findLocalAvatarCandidates(artistId, artist.name),
      this.findDeezerAvatarCandidates(q),
      this.findNeteaseAvatarCandidates(q),
    ]);

    const merged = [...local, ...deezer, ...netease];
    const seen = new Set<string>();
    const uniq: AvatarCandidate[] = [];
    for (const item of merged) {
      const key = `${item.source}:${item.externalId || item.localPath || item.imageUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(item);
    }
    uniq.sort((a, b) => b.score - a.score || a.source.localeCompare(b.source));
    return uniq;
  }

  private async assertLocalPathAllowed(
    artistId: number,
    localPath: string,
  ): Promise<string> {
    const resolved = path.resolve(localPath);
    const dirs = await this.collectArtistMusicDirs(artistId);
    const allowed = dirs.some((dir) => {
      const base = path.resolve(dir);
      return resolved === base || resolved.startsWith(base + path.sep);
    });
    if (!allowed) {
      throw new Error('local path not allowed');
    }
    await fs.promises.access(resolved, fs.constants.R_OK);
    return resolved;
  }

  async applyAvatarCandidate(
    artistId: number,
    body: ApplyArtistAvatarDto,
  ): Promise<Artist> {
    if (body.source === 'local') {
      if (!body.localPath) {
        throw new Error('localPath required');
      }
      const resolved = await this.assertLocalPathAllowed(artistId, body.localPath);
      const buf = await fs.promises.readFile(resolved);
      const ext = path.extname(resolved).replace('.', '') || 'jpg';
      const saved = await this.updateArtistAvatarFromBuffer(artistId, buf, ext);
      if (!saved) throw new Error('artist not found');
      return saved;
    }

    const url = body.imageUrl?.trim();
    if (!url || url.startsWith('data:')) {
      throw new Error('imageUrl required');
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('invalid imageUrl');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('invalid imageUrl protocol');
    }
    const saved = await this.updateArtistAvatarFromUrl(artistId, url);
    if (!saved) throw new Error('artist not found');
    return saved;
  }

  async checkAccessible(id: number, uid: string): Promise<boolean> {
    const libraries = await MediaLibrary.getLibraryByUid(uid, this.dataSource);
    const artist = await this.dataSource
      .getRepository(Artist)
      .createQueryBuilder('artist')
      .leftJoin('artist.music', 'music')
      .where('music.libraryId in (:...lid)', {
        lid: libraries.map((it) => it.id),
      });
    return Boolean(artist);
  }

  async updateArtist(id: number, data: UpdateArtistDTO) {
    let artist = await this.dataSource.getRepository(Artist).findOne({
      where: { id },
      relations: ['music', 'music.artist'],
    });
    if (!artist) {
      throw new Error('artist not found');
    }
    if (data.name) {
      const oldName = artist.name;
      artist.name = data.name;
      for (const music of artist.music) {
        await music.writeMusicID3({
          artist: [
            ...music.artist.map((it) => it.name).filter((it) => it !== oldName),
            data.name,
          ].join(';'),
        });
      }
    }
    if (data.bio !== undefined) {
      artist.bio = data.bio?.trim() || undefined;
    }
    artist = await this.dataSource.getRepository(Artist).save(artist);
    this.meili.notifyArtistUpsert(artist.id);
    if (data.name && artist.music?.length) {
      this.meili.notifyTrackUpsert(...artist.music.map((m) => m.id));
    }
    return artist;
  }
}
