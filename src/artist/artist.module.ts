import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ArtistService } from './artist.service';
import { ArtistController } from './artist.controller';
import { NeteasemusicService } from '../neteasemusic/neteasemusic.service';
import { MeilisearchModule } from '../meilisearch/meilisearch.module';

@Module({
  controllers: [ArtistController],
  providers: [ArtistService, NeteasemusicService],
  imports: [HttpModule, MeilisearchModule],
  exports: [ArtistService],
})
export class ArtistModule {}
