import { Controller, Get, Param, Query } from '@nestjs/common';
import { ArtistService } from './artist.service';
import { BaseArtistTemplate } from '../template/artist';

@Controller('artist')
export class ArtistController {
  constructor(private readonly artistService: ArtistService) {}
  @Get()
  async findAll(@Query('page') page = 1, @Query('pageSize') pageSize = 20) {
    const [data, count] = await this.artistService.findAll({ page, pageSize });
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
