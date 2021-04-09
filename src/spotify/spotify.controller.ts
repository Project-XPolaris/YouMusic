import { Controller, Get, Query, Redirect, Req } from '@nestjs/common';
import { SpotifyService } from './spotify.service';

@Controller('spotify')
export class SpotifyController {
  constructor(private spotifyService: SpotifyService) {}

  @Get('search')
  async search(
    @Query('q') q,
    @Query('type') type,
    @Req() req: Request & { uid: string },
  ) {
    return await this.spotifyService.search(q, type, req.uid);
  }

  @Get('client/code')
  async codeFormClient(
    @Query('code') code: string,
    @Req() req: Request & { uid: string },
  ) {
    await this.spotifyService.refreshToken(code, req.uid);
    return {
      success: true,
    };
  }
}
