import { HttpModule, Module } from '@nestjs/common';
import { FavoriteService } from './favorite.service';
import { ArtistModule } from '../artist/artist.module';
import { ArtistService } from '../artist/artist.service';
import { FavoriteController } from './favorite.controller';
import { AlbumModule } from '../album/album.module';
import { AlbumService } from '../album/album.service';
import { TagService } from '../tag/tag.service';
import { GenreService } from '../genre/genre.service';
import { GenreModule } from '../genre/genre.module';

@Module({
  controllers: [FavoriteController],
  providers: [
    FavoriteService,
    ArtistService,
    AlbumService,
    TagService,
    GenreService,
  ],
  imports: [ArtistModule, HttpModule, AlbumModule, GenreModule],
})
export class FavoriteModule {}
