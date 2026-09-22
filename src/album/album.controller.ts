import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { AlbumService } from './album.service';
import { BaseAlbumTemplate } from '../template/album';
import { getOrderFromQueryString } from '../utils/query';
import { ApplyAlbumMetaDto, UpdateAlbumDto } from './dto/update-album.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from '../storage/storage.service';
import { ServerResponse } from 'http';
import { Readable } from 'stream';
import { pipeReadableSafely } from '../utils/stream';
import { AudioEmbedService } from '../audioembed/audioembed.service';

@Controller('album')
export class AlbumController {
  constructor(
    private readonly albumService: AlbumService,
    private readonly storageService: StorageService,
    private readonly audioEmbedService: AudioEmbedService,
  ) {}

  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('artist') artistId = 0,
    @Query('order') order = '',
    @Query('search') search = '',
    @Query('albumArtist') albumArtist = '',
    @Query('yearFrom') yearFrom = '',
    @Query('yearTo') yearTo = '',
    @Query('tag') tag = '',
    @Query('genre') genre = '',
    @Query('random') random = '',
    @Query('follow') follow = '0',
    @Query('id') id = '0',
    @Query('missingCover') missingCover = '',
    @Query('missingDescription') missingDescription = '',
    @Query('library') library = '',
    @Req() req: Request & { uid: string },
  ) {
    const [list, count] = await this.albumService.findAll({
      page: Number(page),
      pageSize: Number(pageSize),
      artistId: Number(artistId),
      order: getOrderFromQueryString(order, {}),
      uid: req.uid,
      search,
      albumArtist,
      yearFrom: yearFrom ? Number(yearFrom) : undefined,
      yearTo: yearTo ? Number(yearTo) : undefined,
      tag,
      random: random === '1',
      genre: genre.split(','),
      followUid: follow === '1' ? req.uid : undefined,
      id: +id,
      missingCover: missingCover === '1',
      missingDescription: missingDescription === '1',
      libraryId: library === '' ? undefined : Number(library),
    });
    return {
      count,
      data: list.map((album) => new BaseAlbumTemplate(album)),
    };
  }

  @Post('scrape/batch')
  async scrapeAlbumBatch(
    @Req() req: Request & { uid: string },
    @Body()
    body: {
      limit?: number;
      force?: boolean;
      ids?: number[];
      missingCoverOnly?: boolean;
    } = {},
  ) {
    const job = await this.albumService.startBatchAlbumScrape(req.uid, body);
    return { success: true, data: job };
  }

  @Get('scrape/jobs/:jobId')
  async getAlbumScrapeJob(@Param('jobId') jobId: string) {
    const job = this.albumService.getAlbumScrapeJob(jobId);
    if (!job) {
      throw new BadRequestException('job not found');
    }
    return { success: true, data: job };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
  ) {
    const album = await this.albumService.findOne(+id, req.uid);
    if (album === undefined) {
      throw new BadRequestException('Invalid album');
    }
    return new BaseAlbumTemplate(album);
  }

  @Post(':id/scrape')
  async scrapeAlbum(
    @Param('id') id: string,
    @Query('force') force = '',
    @Req() req: Request & { uid: string },
  ) {
    const result = await this.albumService.scrapeAlbum(+id, req.uid, {
      forceCover: force === '1',
      forceMeta: force === '1',
    });
    return {
      success: result.status !== 'error',
      ...result,
      data: result.album
        ? new BaseAlbumTemplate(result.album)
        : undefined,
    };
  }

  @Post(':id/meta/apply')
  async applyAlbumMeta(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
    @Body() body: ApplyAlbumMetaDto,
  ) {
    try {
      const album = await this.albumService.applyAlbumMeta(+id, req.uid, body);
      return {
        success: true,
        data: new BaseAlbumTemplate(album),
      };
    } catch (e) {
      throw new BadRequestException(e?.message || 'apply meta failed');
    }
  }

  @Post(':id/tag')
  async tagAlbum(
    @Param('id') id: string,
    @Body() body: { threshold?: number } = {},
  ) {
    const task = await this.audioEmbedService.startTagTask({
      albumId: +id,
      threshold: body?.threshold,
    });
    return { success: true, data: task };
  }

  @Post(':id/tag/clear')
  async clearAlbumTags(@Param('id') id: string) {
    const data = await this.audioEmbedService.clearTags({ albumId: +id });
    return { success: true, data };
  }

  @Post(':id')
  async update(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
    @Body() body: UpdateAlbumDto,
  ) {
    let album = await this.albumService.findOne(+id, req.uid);
    if (album === undefined) {
      throw new BadRequestException('Invalid album');
    }
    album = await this.albumService.updateAlbum(+id, body);
    return new BaseAlbumTemplate(album);
  }

  @Post(':id/cover')
  @UseInterceptors(FileInterceptor('file'))
  async updateCoverFromFile(
    @Param('id') id: string,
    @Req() req: Request & { uid: string },
    @UploadedFile() file: any,
  ) {
    let album = await this.albumService.findOne(+id, req.uid);
    if (album === undefined) {
      throw new BadRequestException('Invalid album');
    }
    album = await this.albumService.updateCoverFromFile(+id, file);
    return new BaseAlbumTemplate(album);
  }

  @Get(':id/cover')
  async getCoverImage(
    @Param('id') id: string,
    @Res() res: ServerResponse,
    @Req() req: Request & { uid: string },
  ) {
    const album = await this.albumService.findOne(+id, req.uid);
    if (!album) {
      throw new NotFoundException('Invalid album');
    }
    if (!album.cover) {
      throw new NotFoundException('cover not found');
    }
    try {
      if (!(await this.storageService.existCover(album.cover))) {
        throw new NotFoundException('cover not found');
      }
      const data = await this.storageService.getCover(album.cover);
      if (data instanceof Readable) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        pipeReadableSafely(data, res);
        return;
      }
      throw new NotFoundException('cover not found');
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      throw new NotFoundException('cover not found');
    }
  }
}
