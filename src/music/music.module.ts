import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MusicService } from './music.service';
import { MusicController } from './music.controller';
import { MetaModule } from '../meta/meta.module';
import { ThumbnailModule } from '../thumbnail/thumbnail.module';
import { StorageModule } from '../storage/storage.module';
import { ConfigModule } from '@nestjs/config';
import { LogModule } from '../log/log.module';
import { AudioEmbedModule } from '../audioembed/audioembed.module';
import { MeilisearchModule } from '../meilisearch/meilisearch.module';

@Module({
  controllers: [MusicController],
  providers: [MusicService],
  imports: [
    LogModule,
    HttpModule,
    MetaModule,
    ThumbnailModule,
    StorageModule,
    ConfigModule,
    MeilisearchModule,
    forwardRef(() => AudioEmbedModule),
  ],
})
export class MusicModule {}
