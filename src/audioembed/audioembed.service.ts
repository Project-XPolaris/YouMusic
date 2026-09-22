import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, In } from 'typeorm';
import { exec } from 'child_process';
import { promisify } from 'util';
import { AudioEmbedClient } from './client';
import { MusicEmbedding } from '../database/entites/music-embedding';
import { Music } from '../database/entites/music';
import { MediaLibrary } from '../database/entites/library';
import { persistYamlSectionField } from '../utils/yaml-config';
import { LlmService } from '../llm/llm.service';
import { BaseMusicTemplate } from '../template/music';
import { TaskService, TaskStatus } from '../task/task.service';
import { Tag } from '../database/entites/tag';
import {
  MeilisearchService,
  TRACKS_INDEX,
} from '../meilisearch/meilisearch.service';
import {
  diversifyByArtist,
  lexicalBoost,
  prepareClapQuery,
} from './clap-query';

const execAsync = promisify(exec);

const MODEL_NAME = 'laion/clap-htsat-fused';
const UNIT = 'polaris-audioembed.service';

export type EmbedTaskOutput = {
  total: number;
  current: number;
  done: number;
  failed: number;
};

@Injectable()
export class AudioEmbedService implements OnModuleInit {
  private readonly logger = new Logger(AudioEmbedService.name);
  private client: AudioEmbedClient;
  private enabled = false;
  private semanticRewrite = true;
  private clipSec = 10;

  constructor(
    private configService: ConfigService,
    private dataSource: DataSource,
    private llmService: LlmService,
    @Inject(forwardRef(() => TaskService))
    private taskService: TaskService,
    private meiliService: MeilisearchService,
  ) {}

  onModuleInit() {
    this.reloadSettings();
    // Config is source of truth across reboots / re-provision; reconcile systemd.
    void this.reconcileUnit().catch((e) =>
      this.logger.warn(`audioembed reconcile on boot failed (dev ok): ${e}`),
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

  reloadSettings() {
    this.enabled = this.parseBool(this.configService.get('audioembed.enable'));
    this.semanticRewrite = this.parseBool(
      this.configService.get('audioembed.semantic_rewrite'),
      true,
    );
    this.clipSec = Number(this.configService.get('audioembed.clip_sec') || 10);
    const host =
      this.configService.get('audioembed.host') || 'http://127.0.0.1:8613';
    const timeout = Number(
      this.configService.get('audioembed.timeout_ms') || 120000,
    );
    this.client = new AudioEmbedClient(host, timeout);
  }

  /** Keep polaris-audioembed enabled/started in sync with yaml `audioembed.enable`. */
  private async reconcileUnit() {
    if (this.enabled) {
      await execAsync(`systemctl enable ${UNIT}`).catch(() => undefined);
      // Docker may still be coming up after host reboot — retry briefly.
      let lastErr: unknown;
      for (let i = 0; i < 6; i++) {
        try {
          await execAsync(`systemctl start ${UNIT}`);
          return;
        } catch (e) {
          lastErr = e;
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
      throw lastErr;
    }
    await execAsync(`systemctl disable --now ${UNIT}`).catch(() => undefined);
  }

  isEnabled() {
    return this.enabled;
  }

  /** Music IDs that already have a CLAP embedding. */
  async clapMusicIds(ids: number[]): Promise<Set<number>> {
    if (!ids.length) return new Set();
    const rows = await this.dataSource.getRepository(MusicEmbedding).find({
      where: { musicId: In(ids) },
      select: ['musicId'],
    });
    return new Set(rows.map((r) => r.musicId));
  }

  getClient() {
    return this.client;
  }

  async getState() {
    this.reloadSettings();
    let serviceUp = false;
    try {
      serviceUp = await this.client.isUp();
    } catch {
      serviceUp = false;
    }
    const musicRepo = this.dataSource.getRepository(Music);
    const covered = await musicRepo
      .createQueryBuilder('music')
      .innerJoin(MusicEmbedding, 'emb', 'emb.musicId = music.id')
      .getCount();
    const total = await musicRepo.count();
    return {
      enabled: this.enabled,
      serviceUp,
      host: this.client.host,
      semanticRewrite: this.semanticRewrite,
      covered,
      total,
      model: MODEL_NAME,
    };
  }

  async setEnabled(enable: boolean) {
    this.enabled = enable;
    persistYamlSectionField('audioembed', 'enable', String(enable));
    // Update in-memory ConfigService nested value for subsequent reads
    try {
      (this.configService as any).set?.('audioembed.enable', enable);
    } catch {
      /* ignore */
    }
    try {
      if (enable) {
        await execAsync(`systemctl enable --now ${UNIT}`);
      } else {
        await execAsync(`systemctl disable --now ${UNIT}`).catch(
          () => undefined,
        );
      }
    } catch (e) {
      this.logger.warn(`systemctl audioembed failed (dev ok): ${e}`);
    }
    return this.getState();
  }

  async setSemanticRewrite(enable: boolean) {
    this.semanticRewrite = enable;
    persistYamlSectionField('audioembed', 'semantic_rewrite', String(enable));
    try {
      (this.configService as any).set?.('audioembed.semantic_rewrite', enable);
    } catch {
      /* ignore */
    }
    return { semanticRewrite: enable };
  }

  decodeEmbedding(raw: string): number[] {
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map(Number);
    } catch {
      return [];
    }
  }

  cosineSim(a: number[], b: number[]): number {
    if (!a.length || a.length !== b.length) return -1;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  async ensureEmbedding(music: Music, force = false): Promise<MusicEmbedding | null> {
    if (!this.enabled) return null;
    const repo = this.dataSource.getRepository(MusicEmbedding);
    const existing = await repo.findOne({ where: { musicId: music.id } });
    const mtime = music.lastModify ? new Date(music.lastModify) : null;
    if (
      !force &&
      existing &&
      existing.model === MODEL_NAME &&
      ((!mtime && !existing.sourceMtime) ||
        (mtime &&
          existing.sourceMtime &&
          existing.sourceMtime.getTime() === mtime.getTime()))
    ) {
      return existing;
    }
    const up = await this.client.isUp();
    if (!up) {
      throw new Error('audioembed service not ready');
    }
    const result = await this.client.embedAudio({
      path: music.path,
      duration_sec: this.clipSec,
    });
    if (!result?.embedding?.length) {
      throw new Error('empty embedding');
    }
    const row =
      existing ||
      repo.create({
        musicId: music.id,
      });
    row.embedding = JSON.stringify(result.embedding);
    row.model = result.model || MODEL_NAME;
    row.sourceMtime = mtime;
    return repo.save(row);
  }

  /** Enqueue or run embed for a list of music ids (serial). */
  async embedMusicIds(
    musicIds: number[],
    force = false,
    onProgress?: (out: EmbedTaskOutput) => void,
  ): Promise<EmbedTaskOutput> {
    const output: EmbedTaskOutput = {
      total: musicIds.length,
      current: 0,
      done: 0,
      failed: 0,
    };
    if (!this.enabled || !musicIds.length) {
      onProgress?.(output);
      return output;
    }
    const musicRepo = this.dataSource.getRepository(Music);
    for (let i = 0; i < musicIds.length; i++) {
      output.current = i + 1;
      onProgress?.(output);
      const music = await musicRepo.findOne({ where: { id: musicIds[i] } });
      if (!music) {
        output.failed++;
        onProgress?.(output);
        continue;
      }
      try {
        await this.ensureEmbedding(music, force);
        output.done++;
      } catch (e) {
        output.failed++;
        this.logger.warn(`embed music ${music.id} failed: ${e}`);
      }
      onProgress?.(output);
    }
    return output;
  }

  /**
   * Called after library scan — fire-and-forget embed for changed tracks.
   */
  scheduleEmbedAfterScan(musicIds: number[]) {
    if (!this.enabled || !musicIds.length) return;
    setImmediate(() => {
      this.embedMusicIds(musicIds, false).catch((e) =>
        this.logger.warn(`post-scan embed failed: ${e}`),
      );
    });
  }

  private async resolveMusicIds(opts: {
    musicId?: number | number[];
    musicIds?: number[];
    albumId?: number;
    libraryId?: number;
  }): Promise<number[]> {
    const musicRepo = this.dataSource.getRepository(Music);
    const mIds = opts.musicIds || (Array.isArray(opts.musicId) ? opts.musicId : (opts.musicId ? [opts.musicId] : []));
    if (mIds.length > 0) {
      const rows = await musicRepo
        .createQueryBuilder('music')
        .select(['music.id'])
        .where('music.id IN (:...ids)', { ids: mIds })
        .getMany();
      if (!rows.length) {
        throw new BadRequestException('music not found');
      }
      return rows.map((r) => r.id);
    }
    if (opts.albumId) {
      const rows = await musicRepo.find({
        where: { albumId: opts.albumId },
        select: ['id'],
      });
      return rows.map((r) => r.id);
    }
    if (opts.libraryId) {
      const rows = await musicRepo.find({
        where: { libraryId: opts.libraryId },
        select: ['id'],
      });
      return rows.map((r) => r.id);
    }
    const rows = await musicRepo
      .createQueryBuilder('music')
      .select(['music.id'])
      .innerJoin(MediaLibrary, 'lib', 'lib.id = music.libraryId')
      .andWhere('lib.clapScan = :on', { on: true })
      .getMany();
    return rows.map((r) => r.id);
  }

  async startScanTask(opts: {
    musicId?: number;
    albumId?: number;
    libraryId?: number;
    force?: boolean;
  }): Promise<{ id: string; type: string; status: string }> {
    if (!this.enabled) {
      throw new BadRequestException('audioembed is disabled');
    }
    const ids = await this.resolveMusicIds(opts);

    const taskId = `embed-${Date.now()}`;
    const task = {
      id: taskId,
      libraryId: opts.libraryId || 0,
      status: TaskStatus.Running,
      type: 'EmbedMusic',
      output: {
        libraryId: opts.libraryId || 0,
        albumId: opts.albumId || 0,
        musicId: opts.musicId || 0,
        total: ids.length,
        current: 0,
        done: 0,
        failed: 0,
      } as any,
      created: new Date().toISOString(),
      startTime: new Date().toISOString(),
      error: '',
    };
    this.taskService.tasks.push(task as any);

    setImmediate(async () => {
      try {
        const result = await this.embedMusicIds(
          ids,
          Boolean(opts.force),
          (out) => {
            task.output.current = out.current;
            task.output.total = out.total;
            task.output.done = out.done;
            task.output.failed = out.failed;
          },
        );
        task.output.current = result.current;
        task.output.total = result.total;
        task.output.done = result.done;
        task.output.failed = result.failed;
        if (result.total > 0 && result.done === 0) {
          task.status = TaskStatus.Err;
          task.error = `CLAP 全部失败 ${result.failed}/${result.total}`;
        } else {
          task.status = TaskStatus.Done;
        }
      } catch (e) {
        task.status = TaskStatus.Err;
        task.error = String(e);
      }
    });

    return { id: taskId, type: 'EmbedMusic', status: TaskStatus.Running };
  }

  async deleteEmbeddings(opts: {
    musicId?: number;
    albumId?: number;
    libraryId?: number;
  }): Promise<{ deleted: number }> {
    if (!opts.musicId && !opts.albumId && !opts.libraryId) {
      throw new BadRequestException('musicId, albumId or libraryId required');
    }
    let ids: number[] = [];
    try {
      ids = await this.resolveMusicIds(opts);
    } catch (e) {
      if (opts.musicId) {
        return { deleted: 0 };
      }
      throw e;
    }
    if (!ids.length) {
      return { deleted: 0 };
    }
    const repo = this.dataSource.getRepository(MusicEmbedding);
    const result = await repo.delete({ musicId: In(ids) });
    return { deleted: result.affected || 0 };
  }

  async tagSingleMusic(musicId: number, threshold = 0.22) {
    if (!this.enabled) {
      throw new BadRequestException('audioembed is disabled');
    }
    const up = await this.client.isUp();
    if (!up) {
      throw new BadRequestException('audioembed service not ready');
    }
    const musicRepo = this.dataSource.getRepository(Music);
    const music = await musicRepo.findOne({
      where: { id: musicId },
      relations: ['tags', 'genre', 'library', 'album', 'artist'],
    });
    if (!music) {
      throw new BadRequestException('music not found');
    }

    const tagResult = await this.client.tagAudio({
      path: music.path,
      threshold,
    });

    if (tagResult.vocal?.type) {
      music.vocalType = tagResult.vocal.type;
    }

    const currentTags = music.tags || [];
    const currentTagNames = new Set(currentTags.map((t) => t.name.toLowerCase()));
    const newTagEntities: Tag[] = [...currentTags];

    for (const tagName of tagResult.all_tags || []) {
      const trimmed = tagName.trim();
      if (!trimmed || currentTagNames.has(trimmed.toLowerCase())) continue;
      const tagEntity = await Tag.createOrGet(trimmed, music.library, this.dataSource);
      newTagEntities.push(tagEntity);
      currentTagNames.add(trimmed.toLowerCase());
    }
    music.tags = newTagEntities;
    await musicRepo.save(music);

    if (this.meiliService?.enable) {
      this.meiliService.notifyTrackUpsert(music.id);
    }

    return {
      music: new BaseMusicTemplate(music),
      tags: tagResult,
    };
  }

  async tagMusicIds(
    musicIds: number[],
    threshold = 0.22,
    onProgress?: (out: EmbedTaskOutput) => void,
  ): Promise<EmbedTaskOutput> {
    const output: EmbedTaskOutput = {
      total: musicIds.length,
      current: 0,
      done: 0,
      failed: 0,
    };
    if (!this.enabled || !musicIds.length) {
      onProgress?.(output);
      return output;
    }
    for (let i = 0; i < musicIds.length; i++) {
      output.current = i + 1;
      onProgress?.(output);
      try {
        await this.tagSingleMusic(musicIds[i], threshold);
        output.done++;
      } catch (e) {
        output.failed++;
        this.logger.warn(`tag music ${musicIds[i]} failed: ${e}`);
      }
      onProgress?.(output);
    }
    return output;
  }

  async startTagTask(opts: {
    musicId?: number | number[];
    musicIds?: number[];
    albumId?: number;
    libraryId?: number;
    threshold?: number;
  }): Promise<{ id: string; type: string; status: string }> {
    if (!this.enabled) {
      throw new BadRequestException('audioembed is disabled');
    }
    const ids = await this.resolveMusicIds(opts);

    const taskId = `tag-${Date.now()}`;
    const task = {
      id: taskId,
      libraryId: opts.libraryId || 0,
      status: TaskStatus.Running,
      type: 'TagMusic',
      output: {
        libraryId: opts.libraryId || 0,
        albumId: opts.albumId || 0,
        musicId: opts.musicId || 0,
        total: ids.length,
        current: 0,
        done: 0,
        failed: 0,
      } as any,
      created: new Date().toISOString(),
      startTime: new Date().toISOString(),
      error: '',
    };
    this.taskService.tasks.push(task as any);

    setImmediate(async () => {
      try {
        const result = await this.tagMusicIds(
          ids,
          opts.threshold ?? 0.22,
          (out) => {
            task.output.current = out.current;
            task.output.total = out.total;
            task.output.done = out.done;
            task.output.failed = out.failed;
          },
        );
        task.output.current = result.current;
        task.output.total = result.total;
        task.output.done = result.done;
        task.output.failed = result.failed;
        if (result.total > 0 && result.done === 0) {
          task.status = TaskStatus.Err;
          task.error = `打标全部失败 ${result.failed}/${result.total}`;
        } else {
          task.status = TaskStatus.Done;
        }
      } catch (e) {
        task.status = TaskStatus.Err;
        task.error = String(e);
        this.logger.error(`tag task ${taskId} error: ${e}`);
      }
    });

    return { id: task.id, type: task.type, status: task.status };
  }

  async clearTags(opts: {
    musicId?: number;
    albumId?: number;
    libraryId?: number;
  }) {
    let ids: number[] = [];
    try {
      ids = await this.resolveMusicIds(opts);
    } catch (e) {
      if (opts.musicId) return { deleted: 0 };
      throw e;
    }
    if (!ids.length) return { deleted: 0 };
    const musicRepo = this.dataSource.getRepository(Music);
    const musics = await musicRepo.find({
      where: { id: In(ids) },
      relations: ['tags'],
    });

    for (const m of musics) {
      m.vocalType = null as any;
      m.tags = [];
      await musicRepo.save(m);
      if (this.meiliService?.enable) {
        this.meiliService.notifyTrackUpsert(m.id);
      }
    }
    return { deleted: musics.length };
  }

  async findSimilar(
    musicId: number,
    limit = 20,
    uid?: string,
  ): Promise<{ count: number; data: Array<{ music: BaseMusicTemplate; score: number }> }> {
    if (!this.enabled) {
      throw new BadRequestException('audioembed is disabled');
    }
    const musicRepo = this.dataSource.getRepository(Music);
    const music = await musicRepo.findOne({
      where: { id: musicId },
      relations: ['artist', 'album', 'library'],
    });
    if (!music) {
      throw new BadRequestException('music not found');
    }

    let embRow = await this.dataSource
      .getRepository(MusicEmbedding)
      .findOne({ where: { musicId } });
    if (!embRow) {
      embRow = await this.ensureEmbedding(music, false);
    }
    if (!embRow) {
      return { count: 0, data: [] };
    }
    const queryEmb = this.decodeEmbedding(embRow.embedding);
    if (!queryEmb.length) {
      return { count: 0, data: [] };
    }

    let libraryFilter: number[] | null = null;
    if (uid) {
      const libs = await MediaLibrary.getLibraryByUid(uid, this.dataSource);
      libraryFilter = libs.map((l) => l.id);
    }

    const embRepo = this.dataSource.getRepository(MusicEmbedding);
    let embs = await embRepo.find();
    // hydrate music for library filter
    const musicIds = embs.map((e) => e.musicId).filter((id) => id !== musicId);
    if (!musicIds.length) {
      return { count: 0, data: [] };
    }
    let musics = await musicRepo.find({
      where: { id: In(musicIds) },
      relations: ['artist', 'album'],
    });
    if (libraryFilter) {
      const allow = new Set(libraryFilter);
      musics = musics.filter((m) => allow.has(m.libraryId));
    }
    // Prefer same library
    const sameLib = musics.filter((m) => m.libraryId === music.libraryId);
    const candidates = sameLib.length ? sameLib : musics;
    const byId = new Map(embs.map((e) => [e.musicId, e]));

    const scored = candidates
      .map((m) => {
        const row = byId.get(m.id);
        if (!row) return null;
        const vec = this.decodeEmbedding(row.embedding);
        const score = this.cosineSim(queryEmb, vec);
        return { music: m, score };
      })
      .filter(Boolean) as Array<{ music: Music; score: number }>;

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(1, limit));
    return {
      count: top.length,
      data: top.map((s) => ({
        music: new BaseMusicTemplate(s.music, true),
        score: Number(s.score.toFixed(4)),
      })),
    };
  }

  async semanticSearch(opts: {
    query: string;
    limit?: number;
    libraryId?: number;
    rewrite?: boolean | null;
    uid?: string;
  }) {
    const query = (opts.query || '').trim();
    if (!query) {
      throw new BadRequestException('query required');
    }

    let libraryIds: number[] | null = null;
    if (opts.libraryId) {
      libraryIds = [opts.libraryId];
    } else if (opts.uid) {
      const libs = await MediaLibrary.getLibraryByUid(opts.uid, this.dataSource);
      libraryIds = libs.map((l) => l.id);
    }

    const musicRepo = this.dataSource.getRepository(Music);
    const embRepo = this.dataSource.getRepository(MusicEmbedding);

    // 1. Channel 1: Metadata & MusiCNN Tags Retrieval
    const metaRanks = new Map<number, { rank: number; reasons: string[]; isTag: boolean }>();
    try {
      const tokens = query
        .split(/[\s,，、]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      let qb = musicRepo
        .createQueryBuilder('music')
        .leftJoinAndSelect('music.artist', 'artist')
        .leftJoinAndSelect('music.album', 'album')
        .leftJoinAndSelect('music.genre', 'genre')
        .leftJoinAndSelect('music.tags', 'tag');

      if (libraryIds?.length) {
        qb = qb.andWhere('music.libraryId IN (:...libIds)', { libIds: libraryIds });
      }

      if (tokens.length > 1) {
        qb = qb.andWhere(
          tokens
            .map(
              (_, i) =>
                `(music.title LIKE :t${i} OR artist.name LIKE :t${i} OR album.name LIKE :t${i} OR genre.name LIKE :t${i} OR tag.name LIKE :t${i} OR music.vocalType LIKE :t${i})`,
            )
            .join(' OR '),
          tokens.reduce((acc, t, i) => ({ ...acc, [`t${i}`]: `%${t}%` }), {}),
        );
      } else {
        qb = qb.andWhere(
          '(music.title LIKE :q OR artist.name LIKE :q OR album.name LIKE :q OR genre.name LIKE :q OR tag.name LIKE :q OR music.vocalType LIKE :q)',
          { q: `%${query}%` },
        );
      }

      const rows = await qb.take(80).getMany();
      rows.forEach((m, idx) => {
        const reasons: string[] = [];
        let isTag = false;
        const allText = [query, ...tokens];
        allText.forEach((tk) => {
          const tkLower = tk.toLowerCase();
          if (m.title?.toLowerCase().includes(tkLower) && !reasons.includes('歌名')) reasons.push('歌名');
          if (m.artist?.some((a) => a.name?.toLowerCase().includes(tkLower)) && !reasons.includes('歌手')) reasons.push('歌手');
          if (m.album?.name?.toLowerCase().includes(tkLower) && !reasons.includes('专辑')) reasons.push('专辑');
          if (m.tags?.some((t) => t.name?.toLowerCase().includes(tkLower)) && !reasons.includes('标签')) {
            reasons.push('标签');
            isTag = true;
          }
          if (m.genre?.some((g) => g.name?.toLowerCase().includes(tkLower)) && !reasons.includes('流派')) {
            reasons.push('流派');
            isTag = true;
          }
          if (m.vocalType && (tk.includes(m.vocalType) || m.vocalType.includes(tk)) && !reasons.includes('人声')) {
            reasons.push('人声');
            isTag = true;
          }
        });
        metaRanks.set(m.id, { rank: idx, reasons, isTag });
      });
    } catch (e) {
      this.logger.warn(`meta search failed: ${e}`);
    }

    // 2. Channel 2: Lyrics Full-Text Retrieval
    const lyricRanks = new Map<number, { rank: number; snippet?: string }>();
    try {
      let qb = musicRepo.createQueryBuilder('music');
      if (libraryIds?.length) {
        qb = qb.andWhere('music.libraryId IN (:...libIds)', { libIds: libraryIds });
      }
      qb = qb.andWhere('music.lyric IS NOT NULL AND music.lyric != ""');

      const allMusicsWithLyric = await qb.select(['music.id', 'music.lyric']).getMany();
      const fs = await import('fs');

      const cleanQ = query.trim();
      const lyricTokens = cleanQ
        .split(/[\s,，、'".!！?？]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3);

      const matchedTracks: Array<{ id: number; snippet: string; score: number }> = [];

      for (const m of allMusicsWithLyric) {
        let content = m.lyric;
        if (m.lyric.endsWith('.lrc') || m.lyric.includes('/')) {
          try {
            if (fs.existsSync(m.lyric)) {
              content = fs.readFileSync(m.lyric, 'utf-8');
            }
          } catch {
            // ignore read error
          }
        }

        const snippet = this.extractLyricSnippet(content, query);
        if (snippet) {
          let score = 1;
          if (content.toLowerCase().includes(cleanQ.toLowerCase())) {
            score = 3;
          }
          matchedTracks.push({ id: m.id, snippet, score });
        }
      }

      matchedTracks.sort((a, b) => b.score - a.score);
      matchedTracks.slice(0, 50).forEach((item, idx) => {
        lyricRanks.set(item.id, { rank: idx, snippet: item.snippet });
      });
    } catch (e) {
      this.logger.warn(`lyric search failed: ${e}`);
    }

    // 3. Channel 3: CLAP Audio Vector Embedding Retrieval
    const audioRanks = new Map<number, { rank: number; similarity: number }>();
    let rewrittenQuery = query;
    let rewrote = false;

    if (this.enabled) {
      try {
        const shouldRewrite =
          opts.rewrite !== undefined && opts.rewrite !== null
            ? Boolean(opts.rewrite)
            : this.semanticRewrite;

        if (shouldRewrite) {
          const rw = await this.llmService.rewriteSemanticQuery(query);
          rewrittenQuery = rw.rewritten;
          rewrote = rw.rewrote;
        }

        const prepared = prepareClapQuery(query, rewrittenQuery);
        rewrittenQuery = prepared.display;
        rewrote = rewrote || prepared.expanded;

        const up = await this.client.isUp();
        if (up) {
          const textEmb = await this.client.embedText(prepared.embedText);
          const queryVec = textEmb.embedding;
          if (queryVec?.length) {
            let embs = await embRepo.find();
            if (libraryIds?.length) {
              const allow = new Set(libraryIds);
              const musicLibRows = await musicRepo.find({
                where: { id: In(embs.map((e) => e.musicId)) },
                select: ['id', 'libraryId'],
              });
              const libMap = new Map(musicLibRows.map((r) => [r.id, r.libraryId]));
              embs = embs.filter((e) => {
                const lid = libMap.get(e.musicId);
                return lid !== undefined && allow.has(lid);
              });
            }

            const scoredAudio = embs
              .map((e) => {
                const vec = this.decodeEmbedding(e.embedding);
                const sim = this.cosineSim(queryVec, vec);
                return { musicId: e.musicId, sim };
              })
              .filter((x) => x.sim > 0.05);

            scoredAudio.sort((a, b) => b.sim - a.sim);
            scoredAudio.slice(0, 80).forEach((item, idx) => {
              audioRanks.set(item.musicId, { rank: idx, similarity: item.sim });
            });
          }
        }
      } catch (e) {
        this.logger.warn(`audio CLAP retrieval failed: ${e}`);
      }
    }

    // 4. Multi-Channel Fusion (Reciprocal Rank Fusion)
    const allCandidateIds = Array.from(
      new Set([
        ...metaRanks.keys(),
        ...lyricRanks.keys(),
        ...audioRanks.keys(),
      ]),
    );

    if (allCandidateIds.length === 0) {
      return {
        query,
        rewrittenQuery,
        rewrote,
        count: 0,
        data: [],
      };
    }

    const musics = await musicRepo.find({
      where: { id: In(allCandidateIds) },
      relations: ['artist', 'album', 'genre', 'tags', 'library'],
    });
    const musicMap = new Map(musics.map((m) => [m.id, m]));

    const fusedItems: Array<{
      music: Music;
      score: number;
      sources: string[];
      matchReasons: string[];
      lyricSnippet?: string;
      clapScore?: number;
    }> = [];

    const k = 60;
    const W_META = 1.3;
    const W_LYRIC = 1.1;
    const W_AUDIO = 1.0;

    for (const id of allCandidateIds) {
      const music = musicMap.get(id);
      if (!music) continue;

      const metaMatch = metaRanks.get(id);
      const lyricMatch = lyricRanks.get(id);
      const audioMatch = audioRanks.get(id);

      const sources: string[] = [];
      const matchReasons: string[] = [];
      let rrfScore = 0;

      if (metaMatch) {
        rrfScore += W_META / (k + metaMatch.rank + 1);
        if (metaMatch.isTag) {
          sources.push('tag');
        } else {
          sources.push('meta');
        }
        if (metaMatch.reasons?.length) {
          matchReasons.push(...metaMatch.reasons);
        }
      }

      let lyricSnippet: string | undefined = undefined;
      if (lyricMatch) {
        rrfScore += W_LYRIC / (k + lyricMatch.rank + 1);
        sources.push('lyric');
        matchReasons.push('歌词命中');
        lyricSnippet = lyricMatch.snippet || this.extractLyricSnippet(music.lyric, query);
      }

      let clapScore: number | undefined = undefined;
      if (audioMatch) {
        rrfScore += W_AUDIO / (k + audioMatch.rank + 1);
        sources.push('audio');
        clapScore = Number(audioMatch.similarity.toFixed(4));
        const pct = Math.round(audioMatch.similarity * 100);
        matchReasons.push(`AI 听感 ${pct}%`);
      }

      fusedItems.push({
        music,
        score: Number(rrfScore.toFixed(4)),
        sources: Array.from(new Set(sources)),
        matchReasons: Array.from(new Set(matchReasons)),
        lyricSnippet,
        clapScore,
      });
    }

    fusedItems.sort((a, b) => b.score - a.score);
    const limit = opts.limit && opts.limit > 0 ? opts.limit : 50;
    const top = fusedItems.slice(0, limit);

    return {
      query,
      rewrittenQuery,
      rewrote,
      count: top.length,
      data: top.map((item) => ({
        music: new BaseMusicTemplate(
          item.music,
          item.sources.includes('audio') || Boolean(item.clapScore),
        ),
        score: item.score,
        sources: item.sources,
        matchReasons: item.matchReasons,
        lyricSnippet: item.lyricSnippet,
        clapScore: item.clapScore,
      })),
    };
  }

  private extractLyricSnippet(lyric: string, query: string): string | undefined {
    if (!lyric || !query) return undefined;
    const clean = lyric.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '\n');
    const lines = clean
      .split(/[\r\n]+/)
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.length > 0 &&
          !l.startsWith('/') &&
          !l.endsWith('.lrc') &&
          !l.startsWith('ti:') &&
          !l.startsWith('ar:') &&
          !l.startsWith('al:') &&
          !l.startsWith('by:') &&
          !l.startsWith('offset:'),
      );

    const qLower = query.toLowerCase().trim();
    for (const line of lines) {
      if (line.toLowerCase().includes(qLower)) {
        return line;
      }
    }

    const tokens = query
      .split(/[\s,，、'".!！?？]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3);
    if (tokens.length > 0) {
      for (const line of lines) {
        const lineLower = line.toLowerCase();
        let matchCount = 0;
        for (const t of tokens) {
          if (lineLower.includes(t.toLowerCase())) {
            matchCount++;
          }
        }
        if (matchCount >= 2 || (tokens.length === 1 && matchCount === 1)) {
          return line;
        }
      }
    }
    return undefined;
  }
}
