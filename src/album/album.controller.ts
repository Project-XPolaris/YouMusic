import { BadRequestException, Controller, Get, Param, Query, Req } from '@nestjs/common';
import { AlbumService } from './album.service';
import { BaseAlbumTemplate } from '../template/album';
import { getOrderFromQueryString } from '../utils/query';

@Controller('album')
export class AlbumController {
  constructor(private readonly albumService: AlbumService) {}
  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('artist') artistId = 0,
    @Query('order') order = '',
    @Req() req: Request & { uid: string },
  ) {
    const [list, count] = await this.albumService.findAll({
      page,
      pageSize,
      artistId,
      order: getOrderFromQueryString(order, {}),
      uid: req.uid,
    });
    return {
      count,
      data: list.map((album) => new BaseAlbumTemplate(album)),
    };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    const album = await this.albumService.findOne(+id, req.uid);
    if (album === undefined) {
      throw new BadRequestException('Invalid album');
    }
    return new BaseAlbumTemplate(album);
  }
}
