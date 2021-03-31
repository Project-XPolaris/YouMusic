import {
  Controller,
  Get,
  Body,
  Put,
  Param,
  Delete,
  Query,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { MusicService } from './music.service';
import { UpdateMusicDto } from './dto/update-music.dto';
import { BaseMusicTemplate } from '../template/music';
import { getOrderFromQueryString } from '../utils/query';

@Controller('music')
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('artist') artistId = 0,
    @Query('album') albumId = 0,
    @Query('ids') ids = '',
    @Query('order') order = '',
    @Req() req: Request & { uid: string },
  ) {
    const [list, count] = await this.musicService.findAll({
      page,
      pageSize,
      artistId,
      albumId,
      ids: ids.split(','),
      order: getOrderFromQueryString(order, {}),
      uid: req.uid,
    });
    return {
      count,
      data: list.map((music) => new BaseMusicTemplate(music)),
    };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    const music = await this.musicService.findOne(+id, req.uid);
    if (music === undefined) {
      throw new BadRequestException('Invalid music');
    }
    return music;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.musicService.remove(+id);
  }
}
