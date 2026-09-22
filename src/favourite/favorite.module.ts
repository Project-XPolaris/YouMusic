import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FavoriteService } from './favorite.service';
import { ArtistModule } from '../artist/artist.module';
import { FavoriteController } from './favorite.controller';
import { AlbumModule } from '../album/album.module';
import { TagService } from '../tag/tag.service';
import { GenreService } from '../genre/genre.service';
import { GenreModule } from '../genre/genre.module';

@Module({
  controllers: [FavoriteController],
  providers: [FavoriteService, TagService, GenreService],
  imports: [ArtistModule, HttpModule, AlbumModule, GenreModule],
})
export class FavoriteModule {}
