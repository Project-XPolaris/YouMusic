import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AudioEmbedService } from './audioembed.service';
import { AudioEmbedController } from './audioembed.controller';
import { MusicSearchController } from './music-search.controller';
import { LlmModule } from '../llm/llm.module';
import { TaskModule } from '../task/task.module';
import { MeilisearchModule } from '../meilisearch/meilisearch.module';

@Module({
  imports: [ConfigModule, LlmModule, MeilisearchModule, forwardRef(() => TaskModule)],
  providers: [AudioEmbedService],
  controllers: [AudioEmbedController, MusicSearchController],
  exports: [AudioEmbedService],
})
export class AudioEmbedModule {}
