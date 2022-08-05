import { Global, Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { ThumbnailModule } from '../thumbnail/thumbnail.module';
import { LogModule } from '../log/log.module';
import { StorageService } from '../storage/storage.service';
import { StorageModule } from '../storage/storage.module';
@Global()
@Module({
  imports: [ConfigModule, ThumbnailModule, LogModule, StorageModule],
  providers: [TaskService, StorageService],
  exports: [TaskService],
  controllers: [TaskController],
})
export class TaskModule {}
