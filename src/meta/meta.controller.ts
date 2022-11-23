import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { MetaService } from './meta.service';
import { SearchMusicEntity } from './meta.entites';

@Controller('meta')
export class MetaController {
  constructor(private metaService: MetaService) {}
  @Get('search/album')
  async SearchAlbum(
    @Query('key') key: string,
    @Query('artist') artist?: string,
    @Query('source') source?: string,
  ) {
    return {
      success: true,
      data: await this.metaService.searchAlbum(key, { artist }),
    };
  }
  @Get('search/artist')
  async SearchArtist(@Query() key: string) {
    return await this.metaService.searchArtist(key);
  }
  @Get('search/music')
  async SearchLyric(@Query() key: string) {
    return await this.metaService.searchMusic(key);
  }
  @Post('lyric')
  async getLyricFromSearchMusic(@Body() searchMusic: SearchMusicEntity) {
    return {
      lyric: await this.metaService.getLyricFromSearchMusic(searchMusic),
    };
  }
  @Get('album')
  async getAlbumDetail(
    @Query('mbId') mbId?: string,
    @Query('nemId') nemId?: string,
  ) {
    try {
      const data = await this.metaService.getAlbumDetail({ mbId, nemId });
      return {
        success: true,
        data: data,
      };
    } catch (e) {
      return {
        success: false,
        error: e.message,
      };
    }
  }
}
