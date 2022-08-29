import { Controller, Param, Post, Req } from '@nestjs/common';
import { FavoriteService } from './favorite.service';

@Controller('favorite')
export class FavoriteController {
  constructor(private readonly favoriteService: FavoriteService) {}

  @Post('/artist/:id')
  async addArtist(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    await this.favoriteService.addArtistToFavourite(+id, req.uid);
    return {
      success: true,
    };
  }
  @Post('/album/:id')
  async addAlbum(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    await this.favoriteService.addAlbumToFavourite(+id, req.uid);
    return {
      success: true,
    };
  }
}
