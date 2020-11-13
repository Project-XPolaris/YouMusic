import { Controller, Get, Param, Query } from '@nestjs/common';
import { ArtistService } from './artist.service';

@Controller('artist')
export class ArtistController {
  constructor(private readonly artistService: ArtistService) {}
  @Get()
  async findAll(@Query('page') page = 1, @Query('pageSize') pageSize = 20) {
    const [data, count] = await this.artistService.findAll({ page, pageSize });
    return {
      count,
      data,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.artistService.findOne(+id);
  }
}
