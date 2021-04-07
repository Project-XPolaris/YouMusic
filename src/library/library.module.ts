import { Module } from '@nestjs/common';
import { LibraryService } from './library.service';
import { LibraryController } from './library.controller';
import { TaskModule } from '../task/task.module';

@Module({
  controllers: [LibraryController],
  providers: [LibraryService],
  imports: [TaskModule],
})
export class LibraryModule {}
