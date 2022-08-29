import { HttpModule, Module } from '@nestjs/common';
import { FavoriteService } from './favorite.service';
import { ArtistModule } from '../artist/artist.module';
import { ArtistService } from '../artist/artist.service';
import { FavoriteController } from './favorite.controller';
import { AlbumModule } from '../album/album.module';
import { AlbumService } from '../album/album.service';
import { TagService } from '../tag/tag.service';

@Module({
  controllers: [FavoriteController],
  providers: [FavoriteService, ArtistService, AlbumService, TagService],
  imports: [ArtistModule, HttpModule, AlbumModule],
})
export class FavoriteModule {}
