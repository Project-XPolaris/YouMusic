import { HttpModule, Module } from '@nestjs/common';
import { FavoriteService } from './favorite.service';
import { ArtistModule } from '../artist/artist.module';
import { ArtistService } from '../artist/artist.service';
import { FavoriteController } from './favorite.controller';
import { AlbumModule } from '../album/album.module';
import { AlbumService } from '../album/album.service';

@Module({
  controllers: [FavoriteController],
  providers: [FavoriteService, ArtistService, AlbumService],
  imports: [ArtistModule, HttpModule, AlbumModule],
})
export class FavoriteModule {}
