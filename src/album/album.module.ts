import { Module } from '@nestjs/common';
import { AlbumService } from './album.service';
import { AlbumController } from './album.controller';
import { ThumbnailModule } from '../thumbnail/thumbnail.module';

@Module({
  controllers: [AlbumController],
  providers: [AlbumService],
  imports: [ThumbnailModule],
})
export class AlbumModule {}
