import { Controller, Delete, Param, Post, Req } from '@nestjs/common';
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
  @Delete('/artist/:id')
  async removeArtist(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    await this.favoriteService.removeArtistFromFavorite(+id, req.uid);
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
  @Delete('/album/:id')
  async removeAlbum(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    await this.favoriteService.removeAlbumFromFavourite(+id, req.uid);
    return {
      success: true,
    };
  }

  @Post('/tag/:id')
  async addTag(@Param('id') id: string, @Req() req: Request & { uid: string }) {
    await this.favoriteService.addTagToFavourite(+id, req.uid);
    return {
      success: true,
    };
  }
  @Delete('/tag/:id')
  async removeTag(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    await this.favoriteService.removeTagFromFavourite(+id, req.uid);
    return {
      success: true,
    };
  }
  @Post('/genre/:id')
  async addGenre(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    await this.favoriteService.addGenreToFavourite(+id, req.uid);
    return {
      success: true,
    };
  }
  @Delete('/genre/:id')
  async removeGenre(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    await this.favoriteService.removeGenreFromFavourite(+id, req.uid);
    return {
      success: true,
    };
  }
}
