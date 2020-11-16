import { Controller, Get, Param, Query } from '@nestjs/common';
import { AlbumService } from './album.service';

@Controller('album')
export class AlbumController {
  constructor(private readonly albumService: AlbumService) {}
  @Get()
  async findAll(@Query('page') page = 1, @Query('pageSize') pageSize = 10) {
    const [list, count] = await this.albumService.findAll({ page, pageSize });
    return {
      count,
      data: list.map((album) => ({
        ...album,
        cover: `/covers/${album.id}.jpg`,
      })),
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const album = await this.albumService.findOne(+id);
    return {
      ...album,
      cover: `/covers/${album.id}.jpg`,
    };
  }
}
