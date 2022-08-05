import { Module } from '@nestjs/common';
import { AlbumService } from './album.service';
import { AlbumController } from './album.controller';
import { ThumbnailModule } from '../thumbnail/thumbnail.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  controllers: [AlbumController],
  providers: [AlbumService],
  imports: [ThumbnailModule, StorageModule],
})
export class AlbumModule {}
