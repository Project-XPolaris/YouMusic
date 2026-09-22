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
import { applyClapFlags, BaseMusicTemplate } from '../template/music';
import { getOrderFromQueryString } from '../utils/query';
import { FileInterceptor } from '@nestjs/platform-express';
import { MetaService } from '../meta/meta.service';
import { AudioEmbedService } from '../audioembed/audioembed.service';

@Controller('music')
export class MusicController {
  constructor(
    private readonly musicService: MusicService,
    private metaService: MetaService,
    private audioEmbedService: AudioEmbedService,
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
    @Query('genre') genre = '',
    @Query('pathSearch') pathSearch = '',
    @Query('random') random = '',
    @Query('playlist') playlist = '',
    @Query('albumSearch') albumSearch = '',
    @Query('artistSearch') artistSearch = '',
    @Query('withTag') withTags = '',
    @Query('follow') follow = '0',
    @Query('yearFrom') yearFrom = '',
    @Query('yearTo') yearTo = '',
    @Query('hasLyric') hasLyric = '',
    @Query('hasClap') hasClap = '',
    @Query('vocalType') vocalType = '',
    @Query('library') library = '',
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
      genre: genre.split(','),
      pathSearch,
      random: random === '1',
      playlistIds: playlist.split(','),
      albumSearch,
      artistSearch,
      withTags: withTags == '1',
      followUid: follow === '1' ? req.uid : undefined,
      yearFrom: yearFrom === '' ? undefined : Number(yearFrom),
      yearTo: yearTo === '' ? undefined : Number(yearTo),
      hasLyric:
        hasLyric === '1' ? true : hasLyric === '0' ? false : undefined,
      hasClap:
        hasClap === '1' ? true : hasClap === '0' ? false : undefined,
      vocalType: vocalType || undefined,
      libraryId: library === '' ? undefined : Number(library),
    });
    const data = list.map((music) => new BaseMusicTemplate(music));
    const clapIds = await this.audioEmbedService.clapMusicIds(
      data.map((it) => it.id),
    );
    applyClapFlags(data, clapIds);
    return {
      count,
      data,
    };
  }

  @Get(':id/similar')
  async findSimilar(
    @Param('id') id: string,
    @Query('limit') limit = '20',
    @Req() req: Request & { uid: string },
  ) {
    return this.audioEmbedService.findSimilar(
      +id,
      Number(limit) || 20,
      req.uid,
    );
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    const music = await this.musicService.findOne(+id, req.uid);
    if (music === undefined || music === null) {
      throw new BadRequestException('Invalid music');
    }
    const clapIds = await this.audioEmbedService.clapMusicIds([music.id]);
    return new BaseMusicTemplate(music, clapIds.has(music.id));
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.musicService.remove(+id);
  }

  @Post(':id/tag')
  async tagMusic(
    @Param('id') id: string,
    @Body() body: { threshold?: number } = {},
  ) {
    const data = await this.audioEmbedService.tagSingleMusic(
      +id,
      body?.threshold,
    );
    return { success: true, data };
  }

  @Post(':id/tag/clear')
  @Delete(':id/tags/ai')
  async clearMusicAiTags(@Param('id') id: string) {
    const data = await this.audioEmbedService.clearTags({ musicId: +id });
    return { success: true, data };
  }

  @Post(':id/file')
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

  @Post('lyric/scrape/batch')
  async scrapeLyricBatch(
    @Req() req: Request & { uid: string },
    @Body()
    body: {
      limit?: number;
      force?: boolean;
      ids?: number[];
    } = {},
  ) {
    const job = await this.musicService.startBatchLyricScrape(req.uid, body);
    return { success: true, data: job };
  }

  @Get('lyric/scrape/jobs/:jobId')
  async getLyricScrapeJob(@Param('jobId') jobId: string) {
    const job = this.musicService.getLyricScrapeJob(jobId);
    if (!job) {
      throw new BadRequestException('job not found');
    }
    return { success: true, data: job };
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

  @Get(':id/lyric')
  async getLyric(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    const result = await this.musicService.getLyricContent(+id, req.uid);
    if (result?.missing) {
      return { content: '', hasLyric: false, missing: true };
    }
    if (!result) {
      return { content: '', hasLyric: false };
    }
    return { content: result.content, hasLyric: true, path: result.path };
  }

  @Post(':id/lyric/probe')
  async probeLyric(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    return this.musicService.probeLyric(+id, req.uid);
  }

  @Post(':id/lyric/scrape')
  async scrapeLyric(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
    @Query('force') force = '',
    @Query('apply') apply = '1',
  ) {
    return this.musicService.scrapeLyric(+id, req.uid, {
      force: force === '1',
      apply: apply !== '0',
    });
  }

  @Post(':id/tags')
  async addTags(
    @Body() dto: AddMusicTags,
    @Param('id') id: string,
    @Query('replace') replace = '',
  ) {
    await this.musicService.addMusicTags(dto.names, +id, replace === '1');
    return {
      success: true,
    };
  }
}
