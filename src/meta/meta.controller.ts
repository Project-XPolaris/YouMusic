import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { MetaService } from './meta.service';
import { SearchMusicEntity } from './meta.entites';

@Controller('meta')
export class MetaController {
  constructor(private metaService: MetaService) {}
  @Get('search/album')
  async SearchAlbum(@Query() key: string) {
    return await this.metaService.searchAlbum(key);
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
}
