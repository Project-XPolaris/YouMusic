import { Controller, Get, Query, Redirect, Req } from '@nestjs/common';
import { SpotifyService } from './spotify.service';

@Controller('spotify')
export class SpotifyController {
  constructor(private spotifyService: SpotifyService) {}

  @Get('search')
  async search(@Query('q') q, @Query('type') type) {
    return await this.spotifyService.search(q, type);
  }

  @Get('login')
  @Redirect('', 302)
  async spotifyLogin() {
    return {
      url:
        'https://accounts.spotify.com/authorize' +
        '?response_type=code' +
        '&client_id=' +
        '210f3d41c0af4aefb8115b57524a2155' +
        '&redirect_uri=http://localhost:3000/spotify/login/callback',
    };
  }

  @Get('login/callback')
  async spotifyLoginCallback(
    @Query('code') code: string,
    @Req() req: Request & { uid: string },
  ) {
    await this.spotifyService.refreshToken(code, req.uid);
    return {
      success: true,
    };
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
