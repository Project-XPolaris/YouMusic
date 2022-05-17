import { Global, Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { ThumbnailModule } from '../thumbnail/thumbnail.module';
import { LogModule } from '../log/log.module';
@Global()
@Module({
  imports: [ConfigModule, ThumbnailModule, LogModule],
  providers: [TaskService],
  exports: [TaskService],
  controllers: [TaskController],
})
export class TaskModule {}
