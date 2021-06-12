import { Module } from '@nestjs/common';
import { LibraryService } from './library.service';
import { LibraryController } from './library.controller';
import { TaskModule } from '../task/task.module';
import { ConfigService } from '@nestjs/config';
import { YouPlusService } from '../youplus/youplus.service';

@Module({
  controllers: [LibraryController],
  providers: [LibraryService, ConfigService, YouPlusService],
  imports: [TaskModule],
})
export class LibraryModule {}
