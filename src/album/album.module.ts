import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AlbumService } from './album.service';
import { AlbumController } from './album.controller';
import { ThumbnailModule } from '../thumbnail/thumbnail.module';
import { StorageModule } from '../storage/storage.module';
import { MetaModule } from '../meta/meta.module';
import { MeilisearchModule } from '../meilisearch/meilisearch.module';
import { AudioEmbedModule } from '../audioembed/audioembed.module';

@Module({
  controllers: [AlbumController],
  providers: [AlbumService],
  imports: [
    ThumbnailModule,
    StorageModule,
    MetaModule,
    HttpModule,
    MeilisearchModule,
    AudioEmbedModule,
  ],
  exports: [AlbumService],
})
export class AlbumModule {}
