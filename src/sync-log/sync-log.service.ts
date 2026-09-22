import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { 
  SyncLog, 
  SyncLogStatus, 
  SyncLogType, 
  SyncStatistics, 
  SyncError, 
  SyncProgress 
} from '../database/entites/sync-log';
import { LogService } from '../log/log.service';

export interface SyncLoggerOptions {
  libraryId: number;
  type: SyncLogType;
  userId?: string;
  configuration?: {
    forceThumbnail: boolean;
    batchSize: number;
    concurrentLimit: number;
    timeoutMs: number;
  };
}

@Injectable()
export class SyncLogService {
  constructor(
    private dataSource: DataSource,
    private logService: LogService,
  ) {}

  // 创建新的同步日志记录器
  async createSyncLogger(options: SyncLoggerOptions): Promise<SyncLogger> {
    const syncLog = await SyncLog.createSyncLog(
      options.libraryId,
      options.type,
      options.userId,
      options.configuration,
      this.dataSource,
    );

    this.logService.info({
      content: `Created sync log ${syncLog.id} for library ${options.libraryId}`,
    });

    return new SyncLogger(syncLog, this.dataSource, this.logService);
  }

  // 获取库的同步历史
  async getSyncHistory(libraryId: number, limit: number = 10): Promise<SyncLog[]> {
    return await SyncLog.getRecentSyncLogs(libraryId, limit, this.dataSource);
  }

  // 获取正在运行的同步任务
  async getRunningSync(libraryId: number): Promise<SyncLog | null> {
    return await SyncLog.getRunningSync(libraryId, this.dataSource);
  }

  // 获取同步统计摘要
  async getSyncStatsSummary(libraryId: number, days: number = 30) {
    return await SyncLog.getSyncStatsSummary(libraryId, days, this.dataSource);
  }

  // 清理旧日志
  async cleanupOldLogs(libraryId: number, keepDays: number = 90): Promise<number> {
    const deletedCount = await SyncLog.cleanupOldLogs(libraryId, keepDays, this.dataSource);
    this.logService.info({
      content: `Cleaned up ${deletedCount} old sync logs for library ${libraryId}`,
    });
    return deletedCount;
  }

  async findById(syncLogId: number): Promise<SyncLog | null> {
    if (!syncLogId || Number.isNaN(syncLogId)) {
      return null;
    }
    return await this.dataSource.getRepository(SyncLog).findOne({
      where: { id: syncLogId },
    });
  }

  // 获取所有库的同步状态概览
  async getAllLibrariesSyncStatus(): Promise<Array<{
    libraryId: number;
    lastSyncTime?: Date;
    lastSyncStatus?: SyncLogStatus;
    isRunning: boolean;
    errorCount: number;
  }>> {
    const query = `
      SELECT 
        l.id as libraryId,
        latest.lastSyncTime,
        latest.lastSyncStatus,
        CASE WHEN running.id IS NOT NULL THEN 1 ELSE 0 END as isRunning,
        COALESCE(error_stats.errorCount, 0) as errorCount
      FROM media_library l
      LEFT JOIN (
        SELECT 
          libraryId,
          MAX(startTime) as lastSyncTime,
          (SELECT status FROM sync_log WHERE libraryId = sl.libraryId ORDER BY startTime DESC LIMIT 1) as lastSyncStatus
        FROM sync_log sl
        GROUP BY libraryId
      ) latest ON l.id = latest.libraryId
      LEFT JOIN (
        SELECT libraryId, id
        FROM sync_log 
        WHERE status IN ('STARTED', 'RUNNING')
      ) running ON l.id = running.libraryId
      LEFT JOIN (
        SELECT 
          libraryId,
          SUM(JSON_LENGTH(COALESCE(errors, '[]'))) as errorCount
        FROM sync_log 
        WHERE startTime >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY libraryId
      ) error_stats ON l.id = error_stats.libraryId
    `;

    return await this.dataSource.query(query);
  }
}

// 同步日志记录器类，用于在扫描过程中记录详细信息
export class SyncLogger {
  private startTime: Date;
  private phaseStartTime: Date;
  private currentPhase: string = 'initializing';

  constructor(
    private syncLog: SyncLog,
    private dataSource: DataSource,
    private logService: LogService,
  ) {
    this.startTime = new Date();
    this.phaseStartTime = new Date();
  }

  // 获取同步日志ID
  getId(): number {
    return this.syncLog.id;
  }

  // 开始新阶段
  async startPhase(phase: string, totalItems?: number): Promise<void> {
    this.currentPhase = phase;
    this.phaseStartTime = new Date();
    
    await this.updateProgress({
      phase,
      percentage: 0,
      ...(totalItems && { totalBatches: totalItems }),
    });

    this.logService.info({
      content: `Sync ${this.syncLog.id}: Started phase '${phase}'${totalItems ? ` with ${totalItems} items` : ''}`,
    });
  }

  // 更新进度
  async updateProgress(progress: Partial<SyncProgress>): Promise<void> {
    try {
      await this.syncLog.updateProgress(progress, this.dataSource);
    } catch (error) {
      this.logService.error({
        content: `Failed to update progress for sync ${this.syncLog.id}: ${error.message}`,
      });
    }
  }

  // 更新统计信息
  async updateStats(stats: Partial<SyncStatistics>): Promise<void> {
    try {
      // 计算处理时间
      if (stats.processedFiles !== undefined) {
        const currentTime = Date.now();
        const processingTime = currentTime - this.startTime.getTime();
        stats.processingTimeMs = processingTime;
      }

      await this.syncLog.updateStatistics(stats, this.dataSource);
    } catch (error) {
      this.logService.error({
        content: `Failed to update statistics for sync ${this.syncLog.id}: ${error.message}`,
      });
    }
  }

  // 增加统计计数
  async incrementStats(field: keyof SyncStatistics, count: number = 1): Promise<void> {
    const currentStats = this.syncLog.statistics || {} as SyncStatistics;
    const newStats = { ...currentStats };
    
    if (typeof newStats[field] === 'number') {
      (newStats[field] as number) += count;
    } else {
      (newStats[field] as number) = count;
    }

    await this.updateStats(newStats);
  }

  // 记录错误
  async logError(
    filePath: string,
    errorType: string,
    error: Error,
    retryCount?: number,
  ): Promise<void> {
    const syncError: Omit<SyncError, 'timestamp'> = {
      filePath,
      errorType,
      errorMessage: error.message,
      errorStack: error.stack,
      retryCount,
    };

    try {
      await this.syncLog.addError(syncError, this.dataSource);
      
      this.logService.error({
        content: `Sync ${this.syncLog.id}: Error processing ${filePath} - ${error.message}`,
        extra: { errorType, retryCount },
      });
    } catch (logError) {
      this.logService.error({
        content: `Failed to log error for sync ${this.syncLog.id}: ${logError.message}`,
      });
    }
  }

  // 记录文件处理成功
  async logFileProcessed(
    filePath: string,
    processingTimeMs: number,
    isNew: boolean = false,
    isUpdated: boolean = false,
  ): Promise<void> {
    await this.incrementStats('processedFiles');
    
    if (isNew) {
      await this.incrementStats('newFiles');
    } else if (isUpdated) {
      await this.incrementStats('updatedFiles');
    }

    // 每100个文件记录一次详细日志
    const currentStats = this.syncLog.statistics;
    if (currentStats && currentStats.processedFiles % 100 === 0) {
      this.logService.info({
        content: `Sync ${this.syncLog.id}: Processed ${currentStats.processedFiles} files, latest: ${filePath} (${processingTimeMs}ms)`,
      });
    }
  }

  // 记录批次处理完成
  async logBatchCompleted(
    batchIndex: number,
    batchSize: number,
    processingTimeMs: number,
  ): Promise<void> {
    const percentage = this.syncLog.statistics?.totalFiles 
      ? Math.round((this.syncLog.statistics.processedFiles / this.syncLog.statistics.totalFiles) * 100)
      : 0;

    await this.updateProgress({
      currentBatch: batchIndex,
      percentage,
      currentFile: undefined, // 清除当前文件信息
    });

    this.logService.info({
      content: `Sync ${this.syncLog.id}: Completed batch ${batchIndex}, processed ${batchSize} files in ${processingTimeMs}ms (${percentage}%)`,
    });
  }

  // 记录专辑/艺术家等实体处理
  async logEntityProcessed(
    entityType: 'album' | 'artist' | 'genre' | 'tag' | 'cover',
    entityName: string,
    count: number = 1,
  ): Promise<void> {
    const statField = `processed${entityType.charAt(0).toUpperCase() + entityType.slice(1)}s` as keyof SyncStatistics;
    
    if (entityType === 'cover') {
      await this.incrementStats('generatedCovers', count);
    } else {
      await this.incrementStats(statField, count);
    }

    this.logService.info({
      content: `Sync ${this.syncLog.id}: Processed ${entityType} '${entityName}'`,
    });
  }

  // 设置总文件数
  async setTotalFiles(total: number): Promise<void> {
    await this.updateStats({ totalFiles: total });
    this.logService.info({
      content: `Sync ${this.syncLog.id}: Found ${total} files to process`,
    });
  }

  // 记录删除的文件
  async logFilesDeleted(count: number): Promise<void> {
    await this.updateStats({ deletedFiles: count });
    this.logService.info({
      content: `Sync ${this.syncLog.id}: Deleted ${count} obsolete music records`,
    });
  }

  // 完成同步
  async complete(success: boolean = true, summary?: string, error?: Error): Promise<void> {
    const status = success ? SyncLogStatus.COMPLETED : SyncLogStatus.FAILED;
    const endTime = new Date();
    const duration = endTime.getTime() - this.startTime.getTime();

    let finalSummary = summary;
    if (!finalSummary && this.syncLog.statistics) {
      const stats = this.syncLog.statistics;
      finalSummary = `Processed ${stats.processedFiles} files (${stats.newFiles} new, ${stats.updatedFiles} updated, ${stats.deletedFiles} deleted) in ${Math.round(duration / 1000)}s. Generated ${stats.generatedCovers} covers. ${stats.errorFiles} errors.`;
    }

    try {
      await this.syncLog.complete(
        status,
        finalSummary,
        error?.message,
        error?.stack,
        this.dataSource,
      );

      this.logService.info({
        content: `Sync ${this.syncLog.id}: ${success ? 'Completed successfully' : 'Failed'} - ${finalSummary}`,
      });
    } catch (completeError) {
      this.logService.error({
        content: `Failed to complete sync log ${this.syncLog.id}: ${completeError.message}`,
      });
    }
  }

  // 取消同步
  async cancel(reason?: string): Promise<void> {
    const summary = reason ? `Cancelled: ${reason}` : 'Cancelled by user';
    
    try {
      await this.syncLog.complete(
        SyncLogStatus.CANCELLED,
        summary,
        undefined,
        undefined,
        this.dataSource,
      );

      this.logService.info({
        content: `Sync ${this.syncLog.id}: ${summary}`,
      });
    } catch (error) {
      this.logService.error({
        content: `Failed to cancel sync log ${this.syncLog.id}: ${error.message}`,
      });
    }
  }

  // 获取当前统计信息
  getStats(): SyncStatistics | undefined {
    return this.syncLog.statistics;
  }

  // 获取当前进度
  getProgress(): SyncProgress | undefined {
    return this.syncLog.progress;
  }

  // 估算剩余时间
  estimateRemainingTime(): number | undefined {
    const stats = this.syncLog.statistics;
    if (!stats || stats.processedFiles === 0 || stats.totalFiles === 0) {
      return undefined;
    }

    const elapsed = Date.now() - this.startTime.getTime();
    const avgTimePerFile = elapsed / stats.processedFiles;
    const remainingFiles = stats.totalFiles - stats.processedFiles;
    
    return Math.round(remainingFiles * avgTimePerFile);
  }
}
