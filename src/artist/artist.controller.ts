import { Controller, Get, Param, Query } from '@nestjs/common';
import { ArtistService } from './artist.service';
import { BaseArtistTemplate } from '../template/artist';
import { getOrderFromQueryString } from '../utils/query';

@Controller('artist')
export class ArtistController {
  constructor(private readonly artistService: ArtistService) {}
  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('order') order = '',
  ) {
    const [data, count] = await this.artistService.findAll({
      page,
      pageSize,
      order: getOrderFromQueryString(order, {}),
    });
    return {
      count,
      data: data.map((artist) => new BaseArtistTemplate(artist)),
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const artist = await this.artistService.findOne(+id);
    return new BaseArtistTemplate(artist);
  }
}
