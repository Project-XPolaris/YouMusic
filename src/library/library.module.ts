import { Module } from '@nestjs/common';
import { LibraryService } from './library.service';
import { LibraryController } from './library.controller';
import { InternalLibraryController } from './internal.controller';
import { TaskModule } from '../task/task.module';
import { ConfigService } from '@nestjs/config';
import { YouPlusService } from '../youplus/youplus.service';
import { MeilisearchModule } from '../meilisearch/meilisearch.module';
import { InternalTokenGuard } from '../internal/internal.guard';
import { AudioEmbedModule } from '../audioembed/audioembed.module';

@Module({
  controllers: [LibraryController, InternalLibraryController],
  providers: [LibraryService, ConfigService, YouPlusService, InternalTokenGuard],
  imports: [TaskModule, MeilisearchModule, AudioEmbedModule],
})
export class LibraryModule {}
