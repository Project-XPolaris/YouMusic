import {
  Controller,
  Get,
  Body,
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
  AddMusicTags,
  SetMusicCoverFromUrlRequestBody,
  UpdateMusicDto,
  UpdateMusicLyricDto,
} from './dto/update-music.dto';
import { BaseMusicTemplate } from '../template/music';
import { getOrderFromQueryString } from '../utils/query';
import { Patch } from '@nestjs/common/decorators/http/request-mapping.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { MetaService } from '../meta/meta.service';

@Controller('music')
export class MusicController {
  constructor(
    private readonly musicService: MusicService,
    private metaService: MetaService,
  ) {}

  @Get()
  async findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('artist') artistId = 0,
    @Query('album') albumId = 0,
    @Query('ids') ids = '',
    @Query('order') order = '',
    @Query('search') search = '',
    @Query('name') title = '',
    @Query('path') path = '',
    @Query('tag') tag = '',
    @Query('pathSearch') pathSearch = '',
    @Query('random') random = '',
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
      title,
      path,
      tags: tag.split(','),
      pathSearch,
      random: random === '1',
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
  @UseInterceptors(FileInterceptor('file', { limits: { fieldSize: 50000000 } }))
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

  @Post(':id/lyric')
  async updateLyric(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
    @Body() dto: UpdateMusicLyricDto,
  ) {
    const music = await this.musicService.updateLyric(
      +id,
      req.uid,
      dto.content,
    );
    return music;
  }

  @Post(':id/tags')
  async addTags(@Body() dto: AddMusicTags, @Param('id') id: string) {
    await this.musicService.addMusicTags(dto.names, +id);
    return {
      success: true,
    };
  }
}
