import { Injectable } from '@nestjs/common';
import { MediaLibrary } from '../database/entites/library';
import { scanFile, readMetaJson } from '../services/scan';
import * as mm from 'music-metadata';
import { Album } from '../database/entites/album';
import {
  getOrCreateAlbum,
  getOrCreateArtist,
  getOrCreateMusic,
} from '../services/music';
import { uniq, chunk } from 'lodash';
import { Artist } from '../database/entites/artist';
import { ServiceError } from '../error';
import * as path from 'path';
import * as fs from 'fs';
import { Genre } from '../database/entites/genre';
import { Music } from '../database/entites/music';
import { Tag } from '../database/entites/tag';
import {
  extractEmbeddedLyrics,
  readLrcIfExists,
  writeLrcBesideAudio,
} from '../utils/lyric';
import { ThumbnailService } from '../thumbnail/thumbnail.service';
import { LogService } from '../log/log.service';
import { v4 as uuidv4 } from 'uuid';
import * as db from 'mime-db';
import { encodeImageToBlurhash } from '../utils/blurhash';
import { getAverageColor } from 'fast-average-color-node';
import { StorageService } from '../storage/storage.service';
import { DataSource } from 'typeorm';
import * as os from 'os';
import { SyncLogService, SyncLogger } from '../sync-log/sync-log.service';
import { SyncLogType } from '../database/entites/sync-log';
import { YouPlusService } from '../youplus/youplus.service';
import { Optional, Inject, forwardRef } from '@nestjs/common';
import { AudioEmbedService } from '../audioembed/audioembed.service';
import { MeilisearchService } from '../meilisearch/meilisearch.service';

export enum TaskStatus {
  Running = 'Running',
  Done = 'Done',
  Err = 'Error',
}

export type TaskOutput = ScanLibraryOutput;

export interface Task {
  id: string;
  libraryId: number;
  status: TaskStatus;
  type: string;
  output: TaskOutput;
  created: string;
  startTime?: string;
  cancelled?: boolean;
}

export interface ScanLibraryOutput {
  libraryId: number;
  total: number;
  current: number;
}

export const TaskErrors = {
  OnlyOneTask: 'OnlyOneTask',
  LibraryNotFound: 'LibraryNotFound',
};

@Injectable()
export class TaskService {
  tasks: Array<Task> = [];
  private readonly BATCH_SIZE = 50; // 批量处理大小
  private readonly CONCURRENT_LIMIT = Math.min(os.cpus().length * 2, 8); // 并发限制
  
  constructor(
    private thumbnailService: ThumbnailService,
    private logService: LogService,
    private storageService: StorageService,
    private dataSource: DataSource,
    private syncLogService: SyncLogService,
    private youPlusService: YouPlusService,
    private meili: MeilisearchService,
    @Optional()
    @Inject(forwardRef(() => AudioEmbedService))
    private audioEmbedService?: AudioEmbedService,
  ) {}

  // 添加取消任务的方法
  cancelTask(libraryId: number): boolean {
    const task = this.getTaskByLibraryId(libraryId);
    if (task && task.status === TaskStatus.Running) {
      task.cancelled = true;
      task.status = TaskStatus.Err;
      this.logService.info({
        content: `Task for library ${libraryId} has been cancelled`,
      });
      return true;
    }
    return false;
  }

  // 检查任务是否被取消
  private isTaskCancelled(libraryId: number): boolean {
    const task = this.getTaskByLibraryId(libraryId);
    return task?.cancelled === true;
  }

  // 获取所有任务
  getTasks(): Task[] {
    return this.tasks;
  }

  // 获取特定库的任务
  getTaskByLibraryId(libraryId: number): Task | undefined {
    return this.tasks.find((it) => it.libraryId === libraryId);
  }

  // 并发控制器 - 限制同时处理的文件数量
  private async processConcurrently<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number = this.CONCURRENT_LIMIT
  ): Promise<R[]> {
    const results: R[] = [];
    const batches = chunk(items, concurrency);
    
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(item => processor(item).catch(err => {
          this.logService.error({
            content: `Concurrent processing error: ${err.message}`,
          });
          return null;
        }))
      );
      results.push(...batchResults.filter(result => result !== null));
    }
    
    return results;
  }

  // 批量数据库操作优化
  private async batchSaveMusics(musics: Music[]): Promise<void> {
    if (musics.length === 0) return;
    
    const batches = chunk(musics, this.BATCH_SIZE);
    for (const batch of batches) {
      try {
        await this.dataSource.getRepository(Music).save(batch);
      } catch (error) {
        this.logService.error({
          content: `Batch save failed, falling back to individual saves: ${error.message}`,
        });
        // 如果批量保存失败，回退到单个保存
        for (const music of batch) {
          try {
            await this.dataSource.getRepository(Music).save(music);
          } catch (individualError) {
            this.logService.error({
              content: `Individual save failed for music ${music.path}: ${individualError.message}`,
            });
          }
        }
      }
    }
  }

  // 处理 meta.json 标签的独立方法
  private async processMetaJsonTags(
    music: Music, 
    musicFilePath: string, 
    library: MediaLibrary
  ): Promise<boolean> {
    try {
      const musicDir = path.dirname(musicFilePath);
      const metaData = await readMetaJson(musicDir);
      if (metaData && metaData.tags && metaData.tags.length > 0) {
        const tags: Tag[] = [];
        for (const tagName of metaData.tags) {
          const tag = await Tag.createOrGet(tagName, library, this.dataSource);
          tags.push(tag);
        }
        
        // 检查是否有新标签需要添加
        const existingTagNames = music.tags ? music.tags.map(t => t.name) : [];
        const newTags = tags.filter(tag => !existingTagNames.includes(tag.name));
        
        if (newTags.length > 0) {
          // 合并现有标签和新标签
          music.tags = [...(music.tags || []), ...newTags];
          this.logService.info({
            content: `Added ${newTags.length} new tags from meta.json to music: ${musicFilePath}`,
          });
          return true; // 表示有更新
        } else {
          this.logService.info({
            content: `No new tags to add from meta.json for music: ${musicFilePath}`,
          });
        }
      }
    } catch (err) {
      this.logService.error({
        content: `Failed to process meta.json for music: ${musicFilePath}`,
        extra: err,
      });
    }
    return false; // 表示没有更新
  }

  // 带日志记录的单个文件处理方法
  private async processSingleMusicFileWithLogging(
    musicFilePath: string, 
    library: MediaLibrary, 
    forceThumbnail: boolean,
    syncLogger: SyncLogger
  ): Promise<{ music: Music; album?: Album; coverTask?: { album: Album; coverData: Buffer; coverFormat: string } } | null> {
    const fileStartTime = Date.now();
    
    try {
      const result = await this.processSingleMusicFile(musicFilePath, library, forceThumbnail);
      
      if (result) {
        const processingTime = Date.now() - fileStartTime;
        await syncLogger.logFileProcessed(musicFilePath, processingTime, true); // 假设是新文件
        
        // 记录相关实体
        if (result.album) {
          await syncLogger.logEntityProcessed('album', result.album.name);
        }
      }
      
      return result;
    } catch (error) {
      await syncLogger.logError(musicFilePath, 'FILE_PROCESSING', error);
      return null;
    }
  }

  // 处理单个音乐文件的优化方法
  private async processSingleMusicFile(
    musicFilePath: string, 
    library: MediaLibrary, 
    forceThumbnail: boolean
  ): Promise<{ music: Music; album?: Album; coverTask?: { album: Album; coverData: Buffer; coverFormat: string } } | null> {
    try {
      const readFileStart = Date.now();
      
      // 添加超时控制，避免单个文件处理卡住
      const fileProcessPromise = async () => {
        const fileStat = await fs.promises.stat(musicFilePath);
        const musicID3 = await mm.parseFile(musicFilePath);
        return { fileStat, musicID3 };
      };
      
      const { fileStat, musicID3 } = await Promise.race([
        fileProcessPromise(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`File processing timeout: ${musicFilePath}`)), 30000)
        )
      ]) as { fileStat: fs.Stats, musicID3: any };
      
      const readFileEnd = Date.now();
      this.logService.info({
        content: `Read file ${musicFilePath} complete in ${readFileEnd - readFileStart}ms`,
      });
      
      // 处理专辑信息（有标签用标签身份；无标签则按目录成专辑）
      const albumArtistTag =
        musicID3.common.albumartist ||
        (Array.isArray(musicID3.common.albumartists)
          ? musicID3.common.albumartists[0]
          : undefined) ||
        musicID3.common.artist;
      const album = await getOrCreateAlbum({
        name: musicID3.common.album,
        albumArtist: albumArtistTag,
        musicbrainzAlbumId: musicID3.common.musicbrainz_albumid,
        filePath: musicFilePath,
        library,
        dataSource: this.dataSource,
      });
      
      // 处理艺术家信息
      let rawArtists = [];
      if (musicID3.common.artist) {
        rawArtists.push(musicID3.common.artist);
      }
      if (musicID3.common.artists) {
        rawArtists.push(...musicID3.common.artists);
      }
      rawArtists = uniq(rawArtists);
      
      const artists: Array<Artist> = [];
      for (const rawArtist of rawArtists) {
        const artist = await getOrCreateArtist(rawArtist, library, this.dataSource);
        artists.push(artist);
      }
      
      // 获取标题
      let title = path.basename(musicFilePath).replace(path.extname(musicFilePath), '');
      if (musicID3.common && musicID3.common.title && musicID3.common.title.trim() !== '') {
        title = musicID3.common.title.trim();
      }
      // 确保title不为空
      if (!title || title.trim() === '') {
        title = path.basename(musicFilePath).replace(path.extname(musicFilePath), '') || 'Unknown Title';
      }
      
      // 获取时长
      let duration = 0;
      if (musicID3.format.duration) {
        duration = musicID3.format.duration;
      }

      // 获取流派
      const genres: Genre[] = [];
      const v1 = musicID3.native.ID3v1;
      if (v1) {
        const genreTag = v1.find((it) => it.id === 'genre');
        if (genreTag) {
          const genre = await Genre.createOrGet(genreTag.value, library, this.dataSource);
          genres.push(genre);
        }
      }

      // 创建音乐记录
      const music = await getOrCreateMusic({
        title,
        musicFilePath,
        library,
        duration,
        year: musicID3.common.year,
        track: musicID3.common.track?.no,
        disc: musicID3.common.disk?.no,
        lastModify: fileStat?.mtime,
        lossless: musicID3.format.lossless,
        bitrate: musicID3.format.bitrate,
        sampleRate: musicID3.format.sampleRate,
        size: fileStat?.size,
        dataSource: this.dataSource,
      });
      
      music.artist = artists;
      music.genre = genres;
      music.album = album;
      
      // 歌词：旁路 .lrc 优先，否则抽出嵌入歌词写成同名 .lrc
      try {
        const existingLrc = await readLrcIfExists(musicFilePath);
        if (existingLrc) {
          music.lyric = existingLrc.path;
        } else {
          const embedded = extractEmbeddedLyrics(musicID3.common || {});
          if (embedded) {
            music.lyric = await writeLrcBesideAudio(musicFilePath, embedded);
          }
        }
      } catch (err) {
        // 歌词探测失败不阻断扫库
      }

      // 处理同目录下的 meta.json 文件中的标签
      await this.processMetaJsonTags(music, musicFilePath, library);

      // 准备封面处理任务（如果需要）
      let coverTask = null;
      const pics = musicID3.common.picture;
      if ((pics && pics.length > 0 && album) || forceThumbnail) {
        let isExist = false;
        if (!forceThumbnail && album?.cover) {
          isExist = await this.storageService.existCover(album.cover);
        }
        if (!isExist && pics && pics.length > 0) {
          const cover = pics[0];
          const mime = db[cover.format];
          if (mime) {
            coverTask = {
              album,
              coverData: cover.data,
              coverFormat: cover.format
            };
          }
        }
      }
      
      return { music, album, coverTask };
      
    } catch (e) {
      this.logService.error({
        content: `Process music file ${musicFilePath} failed with err: ${e}`,
      });
      if (e instanceof Error) {
        this.logService.error({
          content: `Error stack: ${e.stack}`,
        });
      }
      return null;
    }
  }

  // 异步处理专辑封面
  private async processAlbumCoversAsync(
    coverTasks: Array<{ album: Album; coverData: Buffer; coverFormat: string }>,
    syncLogger?: SyncLogger
  ): Promise<void> {
    // 按专辑去重，避免重复处理同一专辑的封面
    const uniqueTasks = new Map<number, { album: Album; coverData: Buffer; coverFormat: string }>();
    for (const task of coverTasks) {
      if (!uniqueTasks.has(task.album.id)) {
        uniqueTasks.set(task.album.id, task);
      }
    }
    
    // 并发处理封面生成
    await this.processConcurrently(
      Array.from(uniqueTasks.values()),
      async (task) => {
        try {
          const { album, coverData, coverFormat } = task;
          const mime = db[coverFormat];
          if (mime) {
            const ext = mime.extensions[0];
            const coverFilename = `${uuidv4()}.${ext}`;
            
            // 并行处理缩略图生成、blurhash和颜色提取
            const [, hash, color] = await Promise.all([
              this.thumbnailService.generate(coverData, coverFilename),
              encodeImageToBlurhash(coverData),
              getAverageColor(coverData)
            ]);
            
            album.cover = coverFilename;
            album.blurHash = hash;
            album.domainColor = color.hex;
            
            await this.dataSource.getRepository(Album).save(album);
            
            if (syncLogger) {
              await syncLogger.logEntityProcessed('cover', album.name);
            }
            
            this.logService.info({
              content: `Generated cover for album: ${album.name}`,
            });
          }
        } catch (error) {
          if (syncLogger) {
            await syncLogger.logError(task.album.name, 'COVER_GENERATION', error);
          }
          
          this.logService.error({
            content: `Failed to process cover for album ${task.album.name}: ${error.message}`,
          });
        }
      },
      Math.min(this.CONCURRENT_LIMIT, 4) // 封面处理使用较小的并发数
    );
  }
  private async scanProcess(
    library: MediaLibrary,
    uid: string,
    forceThumbnail: boolean,
    {
      onAnalyzeComplete,
      onCurrentUpdate,
    }: {
      onAnalyzeComplete: (total: number) => void;
      onCurrentUpdate: (current: number) => void;
    },
  ) {
    // 创建同步日志记录器
    const syncLogger = await this.syncLogService.createSyncLogger({
      libraryId: library.id,
      type: forceThumbnail ? SyncLogType.FORCE_THUMBNAIL : SyncLogType.FULL_SCAN,
      userId: uid,
      configuration: {
        forceThumbnail,
        batchSize: this.BATCH_SIZE,
        concurrentLimit: this.CONCURRENT_LIMIT,
        timeoutMs: 30000,
      },
    });

    try {
      // 开始文件扫描阶段
      await syncLogger.startPhase('scanning');
      
      const startScanTime = Date.now();
      const scanRoot = await this.youPlusService.resolveLogicalPath(library.path);
      const result = await scanFile(scanRoot);
      const endScanTime = Date.now();
      
      await syncLogger.setTotalFiles(result.length);
      
      this.logService.info({
        content: `Scan ${library.path} (${scanRoot}) complete in ${
          endScanTime - startScanTime
        }ms, found ${result.length} files`,
      });
      onAnalyzeComplete(result.length);
    
      // 开始文件状态分析阶段
      await syncLogger.startPhase('analyzing', result.length);
      
      // 优化：使用 Map 提高查找效率
      const musicRepo = this.dataSource.getRepository(Music);
      let musics = await musicRepo
        .createQueryBuilder('music')
        .where('music.libraryId = :libraryId', {
          libraryId: library.id,
        })
        .getMany();
      
      const musicPathMap = new Map<string, Music>();
      musics.forEach(music => musicPathMap.set(music.path, music));
      
      const scanResult: string[] = [];
      const getSyncListStart = Date.now();
    
    // 批量处理文件状态检查，避免逐个 await
    const fileStatPromises = result.map(async (musicFilePath) => {
      const targetMusic = musicPathMap.get(musicFilePath);
      if (!targetMusic) {
        // 新文件
        return { path: musicFilePath, shouldScan: true, music: null };
      }
      
      try {
        // 添加超时控制，避免卡住
        const fileStat = await Promise.race([
          fs.promises.stat(targetMusic.path),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('File stat timeout')), 5000)
          )
        ]) as fs.Stats;
        
        if (!fileStat || fileStat.size === 0) {
          return { path: musicFilePath, shouldScan: false, music: targetMusic };
        }
        
        // 检查文件是否有更新
        const shouldScan = fileStat.mtime.getTime() !== targetMusic.lastModify.getTime();
        return { 
          path: musicFilePath, 
          shouldScan, 
          music: shouldScan ? null : targetMusic 
        };
      } catch (error) {
        this.logService.error({
          content: `Failed to stat file ${musicFilePath}: ${error.message}`,
        });
        // 如果无法获取文件状态，跳过该文件
        return { path: musicFilePath, shouldScan: false, music: targetMusic };
      }
    });
    
    // 等待所有文件状态检查完成
    const fileStatResults = await Promise.all(
      fileStatPromises.map(promise => 
        promise.then(
          value => ({ status: 'fulfilled' as const, value }),
          reason => ({ status: 'rejected' as const, reason })
        )
      )
    );
    
    // 存量文件需要检查 meta.json 标签的列表
    const existingFilesForTagCheck: { music: Music; path: string }[] = [];
    
    for (const result of fileStatResults) {
      if (result.status === 'fulfilled') {
        const { path, shouldScan, music } = result.value;
        if (shouldScan) {
          scanResult.push(path);
        } else if (music) {
          // 从待删除列表中移除（文件未更新）
          musics = musics.filter((m) => m.id !== music.id);
          // 添加到存量文件标签检查列表
          existingFilesForTagCheck.push({ music, path });
        }
      } else {
        this.logService.error({
          content: `File stat check failed: ${result.reason}`,
        });
      }
    }
    const getSyncListEnd = Date.now();
    this.logService.info({
      content: `Get sync list complete in ${
        getSyncListEnd - getSyncListStart
      }ms`,
    });
      // 删除不存在的音乐文件记录
      await syncLogger.startPhase('cleanup', musics.length);
      
      const removeNotExistStart = Date.now();
      for (const music of musics) {
        await Music.deleteMusic(music.id, this.dataSource);
      }
      const removeNotExistEnd = Date.now();
      
      await syncLogger.logFilesDeleted(musics.length);
      
      this.logService.info({
        content: `Remove not exist music complete in ${
          removeNotExistEnd - removeNotExistStart
        }ms`,
      });

      // 处理存量文件的 meta.json 标签
      await syncLogger.startPhase('updating_existing_tags', existingFilesForTagCheck.length);
      
      const processExistingTagsStart = Date.now();
      let existingFilesUpdated = 0;
      this.logService.info({
        content: `Starting to check meta.json tags for ${existingFilesForTagCheck.length} existing files`,
      });
    
    for (let idx = 0; idx < existingFilesForTagCheck.length; idx++) {
      // 检查任务是否被取消
      if (this.isTaskCancelled(library.id)) {
        this.logService.info({
          content: `Tag check for existing files was cancelled at ${idx}/${existingFilesForTagCheck.length}`,
        });
        break;
      }
      
      const { music, path } = existingFilesForTagCheck[idx];
      
      // 需要先加载音乐的标签关系
      const musicWithTags = await this.dataSource.getRepository(Music)
        .findOne({
          where: { id: music.id },
          relations: ['tags']
        });
      
      if (musicWithTags) {
        const hasUpdates = await this.processMetaJsonTags(musicWithTags, path, library);
        if (hasUpdates) {
          await this.dataSource.getRepository(Music).save(musicWithTags);
          existingFilesUpdated++;
        }
      }
      
      // 更新进度（这里可以复用 onCurrentUpdate，但要注意不要和新文件处理的进度混淆）
      if (idx % 100 === 0) {
        this.logService.info({
          content: `Processed ${idx}/${existingFilesForTagCheck.length} existing files for meta.json tags`,
        });
      }
    }
    
    const processExistingTagsEnd = Date.now();
    this.logService.info({
      content: `Process existing files meta.json tags complete in ${
        processExistingTagsEnd - processExistingTagsStart
      }ms, updated ${existingFilesUpdated} files`,
    });
      // 开始处理新文件和更新文件
      await syncLogger.startPhase('processing_files', scanResult.length);
      
      // refresh music file meta - 使用并发处理优化
      let updatedAlbums: Album[] = [];
      const processedMusics: Music[] = [];
      const albumCoverTasks: Array<{ album: Album; coverData: Buffer; coverFormat: string }> = [];
      
      this.logService.info({
        content: `Starting to process ${scanResult.length} files with concurrency limit ${this.CONCURRENT_LIMIT}`,
      });
      
      // 将文件分批处理，每批使用并发
      const fileBatches = chunk(scanResult, this.BATCH_SIZE);
      let processedCount = 0;
    
      for (const batch of fileBatches) {
        // 检查任务是否被取消
        if (this.isTaskCancelled(library.id)) {
          await syncLogger.cancel('User cancelled the sync task');
          throw new Error('Task cancelled by user');
        }
        
        const batchStartTime = Date.now();
        
        // 并发处理当前批次的文件
        const batchResults = await this.processConcurrently(
          batch,
          async (musicFilePath: string) => {
            return await this.processSingleMusicFileWithLogging(musicFilePath, library, forceThumbnail, syncLogger);
          },
          this.CONCURRENT_LIMIT
        );
        
        const batchEndTime = Date.now();
      
        // 收集处理结果
        for (const result of batchResults) {
          if (result) {
            const { music, album, coverTask } = result;
            processedMusics.push(music);
            
            if (album && !updatedAlbums.find(a => a.id === album.id)) {
              updatedAlbums.push(album);
            }
            
            if (coverTask) {
              albumCoverTasks.push(coverTask);
            }
          }
        }
        
        processedCount += batch.length;
        onCurrentUpdate(processedCount);
        
        // 记录批次完成
        await syncLogger.logBatchCompleted(
          fileBatches.indexOf(batch) + 1,
          batch.length,
          batchEndTime - batchStartTime
        );
      }
    
      // 批量保存阶段
      await syncLogger.startPhase('saving', processedMusics.length);
      
      this.logService.info({
        content: `Batch saving ${processedMusics.length} music records`,
      });
      await this.batchSaveMusics(processedMusics);

      // CLAP embeddings for newly processed / updated tracks (async, non-blocking)
      if (this.audioEmbedService?.isEnabled() && processedMusics.length > 0) {
        const libRow = await this.dataSource
          .getRepository(MediaLibrary)
          .findOne({ where: { id: library.id } });
        if (libRow?.clapScan === false) {
          this.logService.info({
            content: `Skip CLAP embed for library ${library.id} (clapScan off)`,
          });
        } else {
          const embedIds = processedMusics
            .map((m) => m.id)
            .filter((id) => typeof id === 'number' && id > 0);
          this.audioEmbedService.scheduleEmbedAfterScan(embedIds);
        }
      }

      // Meili incremental for scanned tracks; full library sync on scan complete
      if (this.meili.enable && processedMusics.length > 0) {
        this.meili.notifyTrackUpsert(
          ...processedMusics
            .map((m) => m.id)
            .filter((id) => typeof id === 'number' && id > 0),
        );
      }
      
      // 异步处理封面生成任务，不阻塞主流程
      if (albumCoverTasks.length > 0) {
        await syncLogger.startPhase('generating_covers', albumCoverTasks.length);
        
        this.logService.info({
          content: `Processing ${albumCoverTasks.length} album covers asynchronously`,
        });
        // 不等待封面处理完成，让它在后台运行
        this.processAlbumCoversAsync(albumCoverTasks, syncLogger).catch(err => {
          syncLogger.logError('', 'COVER_PROCESSING', err);
        });
      }
      
      // 更新专辑艺术家关系
      await syncLogger.startPhase('updating_album_artists', updatedAlbums.length);
      for (const updatedAlbum of updatedAlbums) {
        await updatedAlbum.refreshArtist(this.dataSource);
        await syncLogger.logEntityProcessed('album', updatedAlbum.name);
      }
      
      // 完成同步
      await syncLogger.complete(true);
      
      return result;
    } catch (error) {
      // 记录错误并完成同步日志
      await syncLogger.complete(false, undefined, error as Error);
      throw error;
    }
  }

  async newScanTask(
    libraryId: number,
    uid: string,
    forceThumbnail: boolean,
    { onComplete }: { onComplete?: (library: MediaLibrary) => void },
  ): Promise<Task> {
    const library = await this.dataSource.getRepository(MediaLibrary).findOne({
      where: { id: libraryId },
    });
    if (library === undefined) {
      // no library found
      throw new ServiceError(
        `library id = ${libraryId} not found`,
        TaskErrors.LibraryNotFound,
      );
    }
    
    // 改进任务状态检查，避免竞态条件
    let task = this.getTaskByLibraryId(library.id);
    const nowIso = new Date().toISOString();
    if (task && task.status === TaskStatus.Running) {
      // 检查任务是否真的在运行（可能因为异常而卡住）
      const startedMs = task.startTime ? Date.parse(task.startTime) : 0;
      const taskAge = Date.now() - startedMs;
      if (taskAge > 300000) { // 5分钟超时
        this.logService.info({
          content: `Task for library ${library.id} appears to be stuck, resetting...`,
        });
        task.status = TaskStatus.Err;
      } else {
        throw new ServiceError(
          'library scanner running',
          TaskErrors.OnlyOneTask,
        );
      }
    }
    
    if (task) {
      task.status = TaskStatus.Running;
      task.output = { libraryId: library.id, total: 0, current: 0 };
      task.startTime = nowIso;
      task.created = task.created || nowIso;
      task.cancelled = false;
    } else {
      task = {
        id: String(library.id),
        libraryId: library.id,
        status: TaskStatus.Running,
        type: 'ScanLibrary',
        output: {
          libraryId: library.id,
          total: 0,
          current: 0,
        },
        created: nowIso,
        startTime: nowIso,
      };
      this.tasks.push(task);
    }
    this.scanProcess(library, uid, forceThumbnail, {
      onAnalyzeComplete: (total) => {
        task.output.total = total;
      },
      onCurrentUpdate: (current) => {
        task.output.current = current + 1;
      },
    })
      .then(() => {
        this.tasks = this.tasks.map((it) => {
          if (it.libraryId === library.id) {
            return {
              ...it,
              status: TaskStatus.Done,
            };
          }
          return it;
        });
        if (onComplete) {
          onComplete(library);
        }
        void this.meili.syncLibrary(library.id).catch((e) => {
          this.logService.info({
            content: `meili sync after scan failed: ${(e as Error).message}`,
          });
        });
      })
      .catch((e) => {
        console.log(e);
        this.tasks = this.tasks.map((it) => {
          if (it.libraryId === library.id) {
            return {
              ...it,
              status: TaskStatus.Err,
            };
          }
          return it;
        });
      });
    return task;
  }
}
