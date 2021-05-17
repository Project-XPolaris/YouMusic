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
  Post,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { MusicService } from './music.service';
import {
  SetMusicCoverFromUrlRequestBody,
  UpdateMusicDto,
} from './dto/update-music.dto';
import { BaseMusicTemplate } from '../template/music';
import { getOrderFromQueryString } from '../utils/query';
import { Patch } from '@nestjs/common/decorators/http/request-mapping.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('music')
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  @Get()
  async findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('artist') artistId = 0,
    @Query('album') albumId = 0,
    @Query('ids') ids = '',
    @Query('order') order = '',
    @Query('search') search = '',
    @Req() req: Request & { uid: string },
  ) {
    const [list, count] = await this.musicService.findAll({
      page: Number(page),
      pageSize: Number(pageSize),
      artistId: Number(artistId),
      albumId,
      ids: ids.split(','),
      order: getOrderFromQueryString(order, {}),
      uid: req.uid,
      search,
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
  @Patch(':id/file')
  async updateMusicFile(
    @Param('id') id: number,
    @Req() req: Request & { uid: string },
    @Body() dto: UpdateMusicDto,
  ) {
    await this.musicService.updateMusicFile(id, req.uid, dto);
    return {
      success: true,
    };
  }

  @Post(':id/cover')
  @UseInterceptors(FileInterceptor('file'))
  async updateMusicCover(
    @Param('id') id: number,
    @Req() req: Request & { uid: string },
    @UploadedFile() file: any,
  ) {
    await this.musicService.updateMusicCover(id, file);
    return {
      success: true,
    };
  }

  @Post(':id/cover/url')
  async setCoverFromUrl(
    @Param('id') id: number,
    @Body() body: SetMusicCoverFromUrlRequestBody,
  ) {
    await this.musicService.setMusicCoverFromUrl(id, body.url);
    return {
      success: true,
    };
  }
}
