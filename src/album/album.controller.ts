import { Controller, Get, Param, Query } from '@nestjs/common';
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
  ) {
    const [list, count] = await this.albumService.findAll({
      page,
      pageSize,
      artistId,
      order: getOrderFromQueryString(order, {}),
    });
    return {
      count,
      data: list.map((album) => new BaseAlbumTemplate(album)),
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const album = await this.albumService.findOne(+id);
    return new BaseAlbumTemplate(album);
  }
}
