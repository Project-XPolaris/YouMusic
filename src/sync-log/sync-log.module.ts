import { Module } from '@nestjs/common';
import { SyncLogService } from './sync-log.service';
import { SyncLogController } from './sync-log.controller';
import { LogModule } from '../log/log.module';

@Module({
  imports: [LogModule],
  providers: [SyncLogService],
  controllers: [SyncLogController],
  exports: [SyncLogService],
})
export class SyncLogModule {}
