import { Controller, Get, Query } from '@nestjs/common';
import { SpotifyService } from '../spotify/spotify.service';

@Controller('/spotify')
export class SpotifyController {
  constructor(private spotifyService: SpotifyService) {}
  @Get('search')
  async searchA(@Query('q') q, @Query('type') type) {
    return await this.spotifyService.search(q, type);
  }
}
