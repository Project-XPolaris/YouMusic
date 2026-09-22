import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
  DataSource,
} from 'typeorm';
import { MediaLibrary } from './library';

export enum SyncLogStatus {
  STARTED = 'STARTED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum SyncLogType {
  FULL_SCAN = 'FULL_SCAN',
  INCREMENTAL_SCAN = 'INCREMENTAL_SCAN',
  FORCE_THUMBNAIL = 'FORCE_THUMBNAIL',
  META_UPDATE = 'META_UPDATE',
}

export interface SyncStatistics {
  totalFiles: number;
  processedFiles: number;
  newFiles: number;
  updatedFiles: number;
  deletedFiles: number;
  errorFiles: number;
  skippedFiles: number;
  processedAlbums: number;
  processedArtists: number;
  processedGenres: number;
  processedTags: number;
  generatedCovers: number;
  processingTimeMs: number;
  avgFileProcessingTimeMs: number;
}

export interface SyncError {
  filePath: string;
  errorType: string;
  errorMessage: string;
  errorStack?: string;
  timestamp: Date;
  retryCount?: number;
}

export interface SyncProgress {
  phase: string; // 'scanning', 'processing', 'saving', 'covers', 'cleanup'
  currentFile?: string;
  currentBatch?: number;
  totalBatches?: number;
  percentage: number;
  estimatedTimeRemainingMs?: number;
}

@Entity()
@Index(['libraryId', 'startTime'])
@Index(['status', 'startTime'])
export class SyncLog {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => MediaLibrary, { onDelete: 'CASCADE' })
  library: MediaLibrary;

  @Column()
  libraryId: number;

  @Column({
    type: 'simple-enum',
    enum: SyncLogType,
    default: SyncLogType.FULL_SCAN,
  })
  type: SyncLogType;

  @Column({
    type: 'simple-enum',
    enum: SyncLogStatus,
    default: SyncLogStatus.STARTED,
  })
  status: SyncLogStatus;

  @Column({ nullable: true })
  userId?: string;

  @Column({ type: 'datetime' })
  startTime: Date;

  @Column({ type: 'datetime', nullable: true })
  endTime?: Date;

  @Column({ nullable: true })
  durationMs?: number;

  @Column({ type: 'json', nullable: true })
  statistics?: SyncStatistics;

  @Column({ type: 'json', nullable: true })
  errors?: SyncError[];

  @Column({ type: 'json', nullable: true })
  progress?: SyncProgress;

  @Column({ type: 'text', nullable: true })
  summary?: string;

  @Column({ type: 'json', nullable: true })
  configuration?: {
    forceThumbnail: boolean;
    batchSize: number;
    concurrentLimit: number;
    timeoutMs: number;
  };

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ type: 'text', nullable: true })
  errorStack?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // 静态方法：创建新的同步日志
  static async createSyncLog(
    libraryId: number,
    type: SyncLogType,
    userId?: string,
    configuration?: any,
    dataSource?: DataSource,
  ): Promise<SyncLog> {
    const syncLog = new SyncLog();
    syncLog.libraryId = libraryId;
    syncLog.type = type;
    syncLog.status = SyncLogStatus.STARTED;
    syncLog.userId = userId;
    syncLog.startTime = new Date();
    syncLog.configuration = configuration;
    syncLog.statistics = {
      totalFiles: 0,
      processedFiles: 0,
      newFiles: 0,
      updatedFiles: 0,
      deletedFiles: 0,
      errorFiles: 0,
      skippedFiles: 0,
      processedAlbums: 0,
      processedArtists: 0,
      processedGenres: 0,
      processedTags: 0,
      generatedCovers: 0,
      processingTimeMs: 0,
      avgFileProcessingTimeMs: 0,
    };
    syncLog.errors = [];
    syncLog.progress = {
      phase: 'initializing',
      percentage: 0,
    };

    if (dataSource) {
      return await dataSource.getRepository(SyncLog).save(syncLog);
    }
    return syncLog;
  }

  // 更新进度
  async updateProgress(
    progress: Partial<SyncProgress>,
    dataSource: DataSource,
  ): Promise<void> {
    this.progress = { ...this.progress, ...progress };
    this.updatedAt = new Date();
    await dataSource.getRepository(SyncLog).save(this);
  }

  // 更新统计信息
  async updateStatistics(
    statistics: Partial<SyncStatistics>,
    dataSource: DataSource,
  ): Promise<void> {
    this.statistics = { ...this.statistics, ...statistics };
    this.updatedAt = new Date();
    await dataSource.getRepository(SyncLog).save(this);
  }

  // 添加错误
  async addError(
    error: Omit<SyncError, 'timestamp'>,
    dataSource: DataSource,
  ): Promise<void> {
    if (!this.errors) {
      this.errors = [];
    }
    this.errors.push({
      ...error,
      timestamp: new Date(),
    });
    
    // 更新错误文件计数
    if (this.statistics) {
      this.statistics.errorFiles = this.errors.length;
    }
    
    this.updatedAt = new Date();
    await dataSource.getRepository(SyncLog).save(this);
  }

  // 完成同步
  async complete(
    status: SyncLogStatus.COMPLETED | SyncLogStatus.FAILED | SyncLogStatus.CANCELLED,
    summary?: string,
    errorMessage?: string,
    errorStack?: string,
    dataSource?: DataSource,
  ): Promise<void> {
    this.status = status;
    this.endTime = new Date();
    this.durationMs = this.endTime.getTime() - this.startTime.getTime();
    this.summary = summary;
    this.errorMessage = errorMessage;
    this.errorStack = errorStack;

    // 计算平均处理时间
    if (this.statistics && this.statistics.processedFiles > 0) {
      this.statistics.avgFileProcessingTimeMs = 
        this.statistics.processingTimeMs / this.statistics.processedFiles;
    }

    // 设置最终进度
    this.progress = {
      ...this.progress,
      phase: status === SyncLogStatus.COMPLETED ? 'completed' : 'failed',
      percentage: 100,
    };

    this.updatedAt = new Date();
    
    if (dataSource) {
      await dataSource.getRepository(SyncLog).save(this);
    }
  }

  // 获取库的最近同步日志
  static async getRecentSyncLogs(
    libraryId: number,
    limit: number = 10,
    dataSource: DataSource,
  ): Promise<SyncLog[]> {
    return await dataSource
      .getRepository(SyncLog)
      .createQueryBuilder('syncLog')
      .where('syncLog.libraryId = :libraryId', { libraryId })
      .orderBy('syncLog.startTime', 'DESC')
      .limit(limit)
      .getMany();
  }

  // 获取正在运行的同步任务
  static async getRunningSync(
    libraryId: number,
    dataSource: DataSource,
  ): Promise<SyncLog | null> {
    return await dataSource
      .getRepository(SyncLog)
      .createQueryBuilder('syncLog')
      .where('syncLog.libraryId = :libraryId', { libraryId })
      .andWhere('syncLog.status IN (:...statuses)', {
        statuses: [SyncLogStatus.STARTED, SyncLogStatus.RUNNING],
      })
      .orderBy('syncLog.startTime', 'DESC')
      .getOne();
  }

  // 获取同步统计摘要
  static async getSyncStatsSummary(
    libraryId: number,
    days: number = 30,
    dataSource: DataSource,
  ): Promise<{
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    avgDurationMs: number;
    totalFilesProcessed: number;
    totalErrors: number;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const logs = await dataSource
      .getRepository(SyncLog)
      .createQueryBuilder('syncLog')
      .where('syncLog.libraryId = :libraryId', { libraryId })
      .andWhere('syncLog.startTime >= :since', { since })
      .getMany();

    const totalSyncs = logs.length;
    const successfulSyncs = logs.filter(log => log.status === SyncLogStatus.COMPLETED).length;
    const failedSyncs = logs.filter(log => log.status === SyncLogStatus.FAILED).length;
    const avgDurationMs = logs.reduce((sum, log) => sum + (log.durationMs || 0), 0) / totalSyncs || 0;
    const totalFilesProcessed = logs.reduce((sum, log) => sum + (log.statistics?.processedFiles || 0), 0);
    const totalErrors = logs.reduce((sum, log) => sum + (log.errors?.length || 0), 0);

    return {
      totalSyncs,
      successfulSyncs,
      failedSyncs,
      avgDurationMs,
      totalFilesProcessed,
      totalErrors,
    };
  }

  // 清理旧的同步日志
  static async cleanupOldLogs(
    libraryId: number,
    keepDays: number = 90,
    dataSource: DataSource,
  ): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);

    const result = await dataSource
      .getRepository(SyncLog)
      .createQueryBuilder()
      .delete()
      .where('libraryId = :libraryId', { libraryId })
      .andWhere('startTime < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }
}
