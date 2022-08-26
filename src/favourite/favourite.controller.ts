import { Controller, Param, Post, Req } from '@nestjs/common';
import { FavouriteService } from './favourite.service';

@Controller('music')
export class FavouriteController {
  constructor(private readonly favouriteService: FavouriteService) {}

  @Post('/favourote/artist/:id')
  async findAll(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    return {};
  }
}
