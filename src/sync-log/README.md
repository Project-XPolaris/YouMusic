# 同步日志系统使用指南

## 概述

同步日志系统为 YouMusic 提供了详尽的音乐库扫描过程记录功能，包括：

- 📊 **详细统计**: 文件处理数量、错误计数、性能指标
- 🔍 **错误跟踪**: 完整的错误信息、堆栈跟踪、重试次数
- ⏱️ **进度监控**: 实时进度、阶段信息、剩余时间估算
- 📈 **性能分析**: 处理时间、批次效率、并发性能
- 🗂️ **历史记录**: 同步历史、趋势分析、对比报告

## 数据库结构

### SyncLog 实体字段

| 字段名 | 类型 | 描述 |
|--------|------|------|
| `id` | number | 主键ID |
| `libraryId` | number | 关联的媒体库ID |
| `type` | SyncLogType | 同步类型（全量/增量/强制缩略图等） |
| `status` | SyncLogStatus | 状态（开始/运行中/完成/失败/取消） |
| `userId` | string | 触发用户ID |
| `startTime` | Date | 开始时间 |
| `endTime` | Date | 结束时间 |
| `durationMs` | number | 持续时间（毫秒） |
| `statistics` | SyncStatistics | 统计信息对象 |
| `errors` | SyncError[] | 错误详情数组 |
| `progress` | SyncProgress | 进度信息 |
| `summary` | string | 总结描述 |
| `configuration` | object | 配置参数 |

### 统计信息 (SyncStatistics)

```typescript
interface SyncStatistics {
  totalFiles: number;           // 总文件数
  processedFiles: number;       // 已处理文件数
  newFiles: number;            // 新增文件数
  updatedFiles: number;        // 更新文件数
  deletedFiles: number;        // 删除文件数
  errorFiles: number;          // 错误文件数
  skippedFiles: number;        // 跳过文件数
  processedAlbums: number;     // 处理的专辑数
  processedArtists: number;    // 处理的艺术家数
  processedGenres: number;     // 处理的流派数
  processedTags: number;       // 处理的标签数
  generatedCovers: number;     // 生成的封面数
  processingTimeMs: number;    // 总处理时间
  avgFileProcessingTimeMs: number; // 平均文件处理时间
}
```

### 错误信息 (SyncError)

```typescript
interface SyncError {
  filePath: string;           // 错误文件路径
  errorType: string;          // 错误类型
  errorMessage: string;       // 错误消息
  errorStack?: string;        // 错误堆栈
  timestamp: Date;            // 错误时间
  retryCount?: number;        // 重试次数
}
```

### 进度信息 (SyncProgress)

```typescript
interface SyncProgress {
  phase: string;                    // 当前阶段
  currentFile?: string;             // 当前处理文件
  currentBatch?: number;            // 当前批次
  totalBatches?: number;            // 总批次数
  percentage: number;               // 完成百分比
  estimatedTimeRemainingMs?: number; // 预估剩余时间
}
```

## 使用方法

### 1. 在扫描任务中集成

```typescript
// 在 TaskService 中
const syncLogger = await this.syncLogService.createSyncLogger({
  libraryId: library.id,
  type: SyncLogType.FULL_SCAN,
  userId: uid,
  configuration: {
    forceThumbnail,
    batchSize: this.BATCH_SIZE,
    concurrentLimit: this.CONCURRENT_LIMIT,
    timeoutMs: 30000,
  },
});

try {
  // 开始扫描阶段
  await syncLogger.startPhase('scanning');
  
  // 设置总文件数
  await syncLogger.setTotalFiles(totalFiles);
  
  // 记录文件处理
  await syncLogger.logFileProcessed(filePath, processingTime, isNew);
  
  // 记录错误
  await syncLogger.logError(filePath, 'FILE_PROCESSING', error);
  
  // 记录实体处理
  await syncLogger.logEntityProcessed('album', albumName);
  
  // 完成同步
  await syncLogger.complete(true);
} catch (error) {
  await syncLogger.complete(false, undefined, error);
}
```

### 2. 查询同步历史

```typescript
// 获取库的同步历史
const history = await syncLogService.getSyncHistory(libraryId, 10);

// 获取正在运行的同步
const runningSync = await syncLogService.getRunningSync(libraryId);

// 获取统计摘要
const stats = await syncLogService.getSyncStatsSummary(libraryId, 30);
```

### 3. REST API 使用

```bash
# 获取同步历史
GET /sync-logs/library/1/history?limit=10

# 获取运行中的任务
GET /sync-logs/library/1/running

# 获取统计信息
GET /sync-logs/library/1/stats?days=30

# 获取所有库概览
GET /sync-logs/overview

# 清理旧日志
DELETE /sync-logs/library/1/cleanup?keepDays=90
```

## 同步阶段说明

系统将扫描过程分为以下阶段：

1. **initializing** - 初始化
2. **scanning** - 文件扫描
3. **analyzing** - 文件状态分析
4. **cleanup** - 清理不存在的记录
5. **updating_existing_tags** - 更新存量文件标签
6. **processing_files** - 处理新文件和更新文件
7. **saving** - 批量保存数据
8. **generating_covers** - 生成专辑封面
9. **updating_album_artists** - 更新专辑艺术家关系
10. **completed/failed** - 完成或失败

## 错误类型分类

- **FILE_PROCESSING** - 文件处理错误
- **METADATA_PARSING** - 元数据解析错误
- **DATABASE_ERROR** - 数据库操作错误
- **COVER_GENERATION** - 封面生成错误
- **TIMEOUT_ERROR** - 超时错误
- **PERMISSION_ERROR** - 权限错误
- **DISK_SPACE_ERROR** - 磁盘空间错误

## 性能监控指标

### 关键性能指标 (KPI)

1. **处理速度**: 文件/秒
2. **错误率**: 错误文件数 / 总文件数
3. **平均处理时间**: 总时间 / 文件数
4. **并发效率**: 实际并发数 vs 配置并发数
5. **内存使用**: 批次大小 vs 内存占用

### 性能优化建议

1. **调整批次大小**: 根据内存和磁盘性能调整 `BATCH_SIZE`
2. **优化并发数**: 根据 CPU 核心数调整 `CONCURRENT_LIMIT`
3. **监控错误率**: 高错误率可能表示磁盘或网络问题
4. **分析慢文件**: 识别处理时间异常的文件类型

## 日志维护

### 自动清理

系统提供自动清理功能，建议：

- 保留最近 90 天的详细日志
- 保留最近 1 年的统计摘要
- 定期清理错误详情以节省空间

### 手动维护

```typescript
// 清理 90 天前的日志
await syncLogService.cleanupOldLogs(libraryId, 90);

// 获取存储使用情况
const stats = await syncLogService.getStorageStats(libraryId);
```

## 故障排查

### 常见问题

1. **同步卡住**: 检查 `running` 状态的任务，可能需要手动取消
2. **高错误率**: 检查文件权限、磁盘空间、网络连接
3. **性能下降**: 分析平均处理时间趋势，检查系统资源

### 调试信息

每个同步日志包含完整的配置信息和错误堆栈，便于问题定位：

```json
{
  "configuration": {
    "forceThumbnail": false,
    "batchSize": 50,
    "concurrentLimit": 8,
    "timeoutMs": 30000
  },
  "errors": [
    {
      "filePath": "/path/to/file.mp3",
      "errorType": "FILE_PROCESSING",
      "errorMessage": "Permission denied",
      "errorStack": "Error: EACCES...",
      "timestamp": "2024-01-01T12:00:00Z"
    }
  ]
}
```

## 扩展功能

系统设计支持未来扩展：

- 📧 **邮件通知**: 同步完成或失败时发送通知
- 📱 **移动推送**: 实时进度推送到移动端
- 📊 **图表展示**: 可视化性能趋势和统计数据
- 🔔 **告警系统**: 错误率或性能异常时自动告警
- 📋 **报告生成**: 定期生成同步报告
