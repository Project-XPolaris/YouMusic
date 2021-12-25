import { Controller, Delete, Get, Query, Req } from '@nestjs/common';
import { SpotifyService } from './spotify.service';
import { NotificationService } from '../notification/notification.service';

@Controller('spotify')
export class SpotifyController {
  constructor(
    private spotifyService: SpotifyService,
    private notificationService: NotificationService,
  ) {}

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
    @Req() req: Request & { uid: string; nid: string },
  ) {
    await this.spotifyService.refreshToken(code, req.uid);
    await this.notificationService.spotifyRefreshEvent(req.nid);
    return {
      success: true,
    };
  }

  @Delete('login')
  async unlinkSpotify(@Req() req: Request & { uid: string }) {
    await this.spotifyService.unlink(req.uid);
    return {
      success: true,
    };
  }
}
