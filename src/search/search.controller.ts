import { Controller, Get, Param, Query } from '@nestjs/common';
import { mbApi } from '../mb';
import { MusicBrainService } from '../mb/MusicBrain.service';
import { SearchAlbumResult } from './entities/searchAlbumResult';

@Controller('search')
export class SearchController {
  constructor(private musicBrain: MusicBrainService) {}
  @Get('/mb/album')
  async searchWithAlbum(
    @Query('name') name = '',
    @Query('artistname') artistname = '',
  ): Promise<SearchAlbumResult[]> {
    const result: any = await this.musicBrain.searchAlbum({
      release: name,
      artistname,
      inc: 'release',
    });
    return result.releases.map((release) => ({
      id: release.id,
      title: release.title,
      artists: release['artist-credit'].map((artist) => artist.name),
      date: release.date,
      country: release.country,
    }));
  }
  @Get('mb/album/:id')
  async getAlbumWithMB(@Param('id') id: string) {
    const result: any = await this.musicBrain.getRelease(id);
    return {
      id: result.id,
      title: result.title,
      data: result.date,
      country: result.country,
      media: result.media.map((media) => ({
        position: media.position,
        tracks: media.tracks.map((track) => ({
          position: track.position,
          title: track.title,
        })),
      })),
    };
  }
  @Get('mb/release/art/:id')
  async getAlbumArt(@Param('id') id: string) {
    const result: any = await this.musicBrain.getReleaseArt(id);
    return result;
  }
}
