import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { getOrderFromQueryString } from '../utils/query';
import { GenreService } from './genre.service';
import { GenreTemplate } from '../template/genre';

@Controller('genre')
export class GenreController {
  constructor(private readonly genreService: GenreService) {}

  @Get()
  async findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('ids') ids = '',
    @Query('music') music = '',
    @Query('album') album = '',
    @Query('order') order = '',
    @Query('search') search = '',
    @Query('random') random = '',
    @Req() req: Request & { uid: string },
  ) {
    const [list, count] = await this.genreService.findAll({
      page: Number(page),
      pageSize: Number(pageSize),
      ids: ids.split(','),
      order: getOrderFromQueryString(order, {}),
      uid: req.uid,
      musicId: +music,
      search,
      albumId: +album,
      random: random === '1',
    });
    return {
      count,
      data: list.map((genre) => new GenreTemplate(genre)),
    };
  }
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    const genre = await this.genreService.findOne(+id, req.uid);
    if (genre === undefined) {
      throw new BadRequestException('Invalid genre');
    }
    return new GenreTemplate(genre);
  }
}
