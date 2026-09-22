import { Controller, Get, Param, Query, Delete } from '@nestjs/common';
import { SyncLogService } from './sync-log.service';
import { SyncLog } from '../database/entites/sync-log';

@Controller('sync-logs')
export class SyncLogController {
  constructor(private readonly syncLogService: SyncLogService) {}

  // 获取库的同步历史
  @Get('library/:libraryId/history')
  async getSyncHistory(
    @Param('libraryId') libraryId: number,
    @Query('limit') limit?: number,
  ): Promise<SyncLog[]> {
    return await this.syncLogService.getSyncHistory(libraryId, limit || 10);
  }

  // 获取正在运行的同步任务
  @Get('library/:libraryId/running')
  async getRunningSync(
    @Param('libraryId') libraryId: number,
  ): Promise<SyncLog | null> {
    return await this.syncLogService.getRunningSync(libraryId);
  }

  // 获取同步统计摘要
  @Get('library/:libraryId/stats')
  async getSyncStats(
    @Param('libraryId') libraryId: number,
    @Query('days') days?: number,
  ) {
    return await this.syncLogService.getSyncStatsSummary(libraryId, days || 30);
  }

  // 获取所有库的同步状态概览
  @Get('overview')
  async getAllLibrariesSyncStatus() {
    return await this.syncLogService.getAllLibrariesSyncStatus();
  }

  // 清理旧日志
  @Delete('library/:libraryId/cleanup')
  async cleanupOldLogs(
    @Param('libraryId') libraryId: number,
    @Query('keepDays') keepDays?: number,
  ): Promise<{ deletedCount: number }> {
    const deletedCount = await this.syncLogService.cleanupOldLogs(
      libraryId,
      keepDays || 90,
    );
    return { deletedCount };
  }

  // 获取特定同步日志的详细信息
  @Get(':syncLogId')
  async getSyncLogDetails(
    @Param('syncLogId') syncLogId: number,
  ): Promise<SyncLog | null> {
    return await this.syncLogService.findById(+syncLogId);
  }
}
