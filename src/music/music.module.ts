import { HttpModule, Module } from '@nestjs/common';
import { MusicService } from './music.service';
import { MusicController } from './music.controller';
import { MetaModule } from '../meta/meta.module';
import { ThumbnailModule } from '../thumbnail/thumbnail.module';

@Module({
  controllers: [MusicController],
  providers: [MusicService],
  imports: [HttpModule, MetaModule, ThumbnailModule],
})
export class MusicModule {}
