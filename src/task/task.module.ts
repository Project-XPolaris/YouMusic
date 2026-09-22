import { Global, Module, forwardRef } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { ThumbnailModule } from '../thumbnail/thumbnail.module';
import { LogModule } from '../log/log.module';
import { StorageService } from '../storage/storage.service';
import { StorageModule } from '../storage/storage.module';
import { SyncLogModule } from '../sync-log/sync-log.module';
import { YouPlusService } from '../youplus/youplus.service';
import { AudioEmbedModule } from '../audioembed/audioembed.module';
import { MeilisearchModule } from '../meilisearch/meilisearch.module';
@Global()
@Module({
  imports: [
    ConfigModule,
    ThumbnailModule,
    LogModule,
    StorageModule,
    SyncLogModule,
    MeilisearchModule,
    forwardRef(() => AudioEmbedModule),
  ],
  providers: [TaskService, StorageService, YouPlusService],
  exports: [TaskService],
  controllers: [TaskController],
})
export class TaskModule {}
