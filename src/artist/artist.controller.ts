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
      data: data.map((artist) => {
        if (artist.avatar == null) {
          artist.avatar = undefined;
        } else {
          artist.avatar = `/covers/${artist.avatar}`;
        }
        return {
          ...artist,
        };
      }),
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const artist = await this.artistService.findOne(+id);
    return {
      ...artist,
      avatar:
        artist.avatar !== undefined ? `/covers/${artist.avatar}` : undefined,
    };
  }
}
