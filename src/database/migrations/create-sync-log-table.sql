-- 创建同步日志表的 SQL 迁移文件
-- 这个文件展示了如何手动创建同步日志表，如果使用 TypeORM 自动迁移则不需要

CREATE TABLE IF NOT EXISTS `sync_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `libraryId` int NOT NULL,
  `type` enum('FULL_SCAN','INCREMENTAL_SCAN','FORCE_THUMBNAIL','META_UPDATE') NOT NULL DEFAULT 'FULL_SCAN',
  `status` enum('STARTED','RUNNING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'STARTED',
  `userId` varchar(255) DEFAULT NULL,
  `startTime` datetime NOT NULL,
  `endTime` datetime DEFAULT NULL,
  `durationMs` int DEFAULT NULL,
  `statistics` json DEFAULT NULL,
  `errors` json DEFAULT NULL,
  `progress` json DEFAULT NULL,
  `summary` text DEFAULT NULL,
  `configuration` json DEFAULT NULL,
  `errorMessage` text DEFAULT NULL,
  `errorStack` text DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `IDX_SYNC_LOG_LIBRARY_START_TIME` (`libraryId`,`startTime`),
  KEY `IDX_SYNC_LOG_STATUS_START_TIME` (`status`,`startTime`),
  CONSTRAINT `FK_SYNC_LOG_LIBRARY` FOREIGN KEY (`libraryId`) REFERENCES `media_library` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 添加注释
ALTER TABLE `sync_log` COMMENT = '音乐库同步日志表，记录扫描任务的详细信息、进度和错误';

-- 为 JSON 字段添加注释
ALTER TABLE `sync_log` 
  MODIFY COLUMN `statistics` json COMMENT '同步统计信息：文件数量、处理时间等',
  MODIFY COLUMN `errors` json COMMENT '错误详情数组',
  MODIFY COLUMN `progress` json COMMENT '当前进度信息',
  MODIFY COLUMN `configuration` json COMMENT '同步任务配置参数';
