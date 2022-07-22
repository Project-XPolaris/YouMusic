import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { getOrderFromQueryString } from '../utils/query';
import { TagService } from './tag.service';
import { TagTemplate } from '../template/tag';

@Controller('tag')
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Get()
  async findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('ids') ids = '',
    @Query('music') music = '',
    @Query('album') album = '',
    @Query('order') order = '',
    @Query('search') search = '',
    @Req() req: Request & { uid: string },
  ) {
    const [list, count] = await this.tagService.findAll({
      page: Number(page),
      pageSize: Number(pageSize),
      ids: ids.split(','),
      order: getOrderFromQueryString(order, {}),
      uid: req.uid,
      musicId: +music,
      search,
      albumId: +album,
    });
    return {
      count,
      data: list.map((tag) => new TagTemplate(tag)),
    };
  }
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    const tag = await this.tagService.findOne(+id, req.uid);
    if (tag === undefined) {
      throw new BadRequestException('Invalid tag');
    }
    return new TagTemplate(tag);
  }
}
