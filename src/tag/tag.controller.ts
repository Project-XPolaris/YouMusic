import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
    @Query('random') random = '',
    @Query('follow') follow = '0',
    @Query('withMusicCount') withMusicCount = '0',
    @Req() req: Request & { uid: string },
  ) {
    const parseMusicId = (value: string): number => {
      if (!value || value === '') return 0;
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? 0 : parsed;
    };

    const parseAlbumId = (value: string): number => {
      if (!value || value === '') return 0;
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? 0 : parsed;
    };

    const result = await this.tagService.findAll({
      page: Number(page),
      pageSize: Number(pageSize),
      ids: ids.split(','),
      order: getOrderFromQueryString(order, {}),
      uid: req.uid,
      musicId: parseMusicId(music),
      search,
      albumId: parseAlbumId(album),
      random: random === '1',
      followUid: follow === '1' ? req.uid : undefined,
      withMusicCount: withMusicCount === '1',
    });

    const [list, count] = result;
    return {
      count,
      data: list.map((tag) => new TagTemplate(tag)),
    };
  }

  @Get('statistics')
  async statistics(@Req() req: Request & { uid: string }) {
    return this.tagService.getStatistics(req.uid);
  }

  @Post()
  async create(@Body() body: { name?: string }) {
    const tag = await this.tagService.create(body?.name || '');
    return new TagTemplate(tag);
  }

  @Delete('batch')
  async removeBatch(@Body() body: { ids?: number[] }) {
    await this.tagService.removeMany(body?.ids || []);
    return { success: true };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: { name?: string }) {
    const tag = await this.tagService.update(+id, body?.name || '');
    return new TagTemplate(tag);
  }

  @Post(':id/merge')
  async merge(
    @Param('id') id: string,
    @Body() body: { targetId?: number },
  ) {
    if (!body?.targetId) {
      throw new BadRequestException('targetId is required');
    }
    const tag = await this.tagService.merge(+id, +body.targetId);
    return new TagTemplate(tag);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.tagService.remove(+id);
    return { success: true };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    const tag = await this.tagService.findOne(+id, req.uid);
    if (!tag) {
      throw new BadRequestException('Invalid tag');
    }
    return new TagTemplate(tag);
  }
}
