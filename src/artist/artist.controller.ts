import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  Patch,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ServerResponse } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { ArtistService } from './artist.service';
import { BaseArtistTemplate } from '../template/artist';
import { getOrderFromQueryString } from '../utils/query';
import {
  ApplyArtistAvatarDto,
  UpdateArtistAvatarFromUrl,
  UpdateArtistDTO,
} from './dto/update-artist.dto';
import { pipeReadableSafely } from '../utils/stream';
@Controller('artist')
export class ArtistController {
  constructor(private readonly artistService: ArtistService) {}

  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('order') order = '',
    @Query('search') search = '',
    @Query('random') random = '',
    @Query('follow') follow = '0',
    @Query('id') id = '0',
    @Query('missingAvatar') missingAvatar = '',
    @Query('missingBio') missingBio = '',
    @Req() req: Request & { uid: string },
  ) {
    const [data, count] = await this.artistService.findAll({
      page,
      pageSize,
      order: getOrderFromQueryString(order, {}),
      uid: req.uid,
      search,
      random: random === '1',
      followUid: follow === '1' ? req.uid : undefined,
      id: +id,
      missingAvatar: missingAvatar === '1',
      missingBio: missingBio === '1',
    });
    return {
      count,
      data: data.map((artist) => new BaseArtistTemplate(artist)),
    };
  }

  @Post('scrape/batch')
  async scrapeArtistBatch(
    @Req() req: Request & { uid: string },
    @Body()
    body: {
      limit?: number;
      force?: boolean;
      ids?: number[];
      missingAvatarOnly?: boolean;
    } = {},
  ) {
    const job = await this.artistService.startBatchArtistScrape(req.uid, body);
    return { success: true, data: job };
  }

  @Get('scrape/jobs/:jobId')
  async getArtistScrapeJob(@Param('jobId') jobId: string) {
    const job = this.artistService.getArtistScrapeJob(jobId);
    if (!job) {
      throw new BadRequestException('job not found');
    }
    return { success: true, data: job };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: number,
    @Req() req: Request & { uid: string },
  ) {
    if (!(await this.artistService.checkAccessible(id, req.uid))) {
      throw new HttpException(
        {
          status: HttpStatus.NOT_FOUND,
          error: 'artist not accessible',
        },
        HttpStatus.NOT_FOUND,
      );
    }
    const artist = await this.artistService.findOne(+id, req.uid);
    if (artist === undefined) {
      throw new BadRequestException('Invalid artist');
    }
    return new BaseArtistTemplate(artist);
  }

  @Get(':id/stats')
  async findOneWithStats(
    @Param('id') id: number,
    @Req() req: Request & { uid: string },
  ) {
    if (!(await this.artistService.checkAccessible(id, req.uid))) {
      throw new HttpException(
        {
          status: HttpStatus.NOT_FOUND,
          error: 'artist not accessible',
        },
        HttpStatus.NOT_FOUND,
      );
    }
    const artist = await this.artistService.findOneWithStats(+id, req.uid);
    if (artist === undefined) {
      throw new BadRequestException('Invalid artist');
    }
    const { musicCount, albumCount, ...pureArtist } = artist;
    return {
      ...new BaseArtistTemplate(pureArtist as any),
      musicCount,
      albumCount,
    };
  }

  @Get(':id/avatar/candidates')
  async searchAvatarCandidates(
    @Param('id') id: number,
    @Query('keyword') keyword = '',
    @Req() req: Request & { uid: string },
  ) {
    if (!(await this.artistService.checkAccessible(+id, req.uid))) {
      throw new HttpException(
        {
          status: HttpStatus.NOT_FOUND,
          error: 'artist not accessible',
        },
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      const data = await this.artistService.searchAvatarCandidates(+id, keyword);
      return { success: true, data };
    } catch (e) {
      throw new BadRequestException(e?.message || 'search avatar candidates failed');
    }
  }

  @Get(':id/avatar')
  async getAvatarImage(
    @Param('id') id: number,
    @Res() res: ServerResponse,
  ) {
    const filePath = await this.artistService.getAvatarFilePath(+id);
    if (!filePath) {
      throw new NotFoundException('avatar not found');
    }
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      throw new NotFoundException('avatar not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    pipeReadableSafely(fs.createReadStream(filePath), res);
  }

  @Post(':id/avatar/apply')
  async applyAvatarCandidate(
    @Param('id') id: number,
    @Body() body: ApplyArtistAvatarDto,
    @Req() req: Request & { uid: string },
  ) {
    if (!(await this.artistService.checkAccessible(+id, req.uid))) {
      throw new HttpException(
        {
          status: HttpStatus.NOT_FOUND,
          error: 'artist not accessible',
        },
        HttpStatus.NOT_FOUND,
      );
    }
    if (!body?.source) {
      throw new BadRequestException('source required');
    }
    try {
      const artist = await this.artistService.applyAvatarCandidate(+id, body);
      return {
        success: true,
        data: new BaseArtistTemplate(artist),
      };
    } catch (e) {
      throw new BadRequestException(e?.message || 'apply avatar failed');
    }
  }

  @Patch(':id')
  async updateArtist(
    @Param('id') id: number,
    @Req() req: Request & { uid: string },
    @Body() body: UpdateArtistDTO,
  ) {
    if (!(await this.artistService.checkAccessible(id, req.uid))) {
      throw new HttpException(
        {
          status: HttpStatus.NOT_FOUND,
          error: 'artist not accessible',
        },
        HttpStatus.NOT_FOUND,
      );
    }
    const artist = await this.artistService.updateArtist(+id, body);
    return new BaseArtistTemplate(artist);
  }

  @Post(':id/avatar/url')
  async setAvatarFromUrl(
    @Body() body: UpdateArtistAvatarFromUrl,
    @Param('id') id: number,
    @Req() req: Request & { uid: string },
  ) {
    if (!(await this.artistService.checkAccessible(id, req.uid))) {
      throw new HttpException(
        {
          status: HttpStatus.NOT_FOUND,
          error: 'artist not accessible',
        },
        HttpStatus.NOT_FOUND,
      );
    }
    const artist = await this.artistService.updateArtistAvatarFromUrl(
      id,
      body.url,
    );
    return {
      success: true,
      data: new BaseArtistTemplate(artist),
    };
  }

  @Post(':id/avatar/auto')
  async autoFillAvatar(
    @Param('id') id: number,
    @Query('force') force = '',
    @Req() req: Request & { uid: string },
  ) {
    if (!(await this.artistService.checkAccessible(+id, req.uid))) {
      throw new HttpException(
        {
          status: HttpStatus.NOT_FOUND,
          error: 'artist not accessible',
        },
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      const result = await this.artistService.autoFillAvatar(+id, {
        force: force === '1',
      });
      return {
        success: true,
        source: result.source,
        score: result.score,
        data: new BaseArtistTemplate(result.artist),
      };
    } catch (e) {
      throw new BadRequestException(e?.message || 'auto avatar failed');
    }
  }

  @Post(':id/scrape')
  async scrapeArtist(
    @Param('id') id: number,
    @Query('force') force = '',
    @Req() req: Request & { uid: string },
  ) {
    const result = await this.artistService.scrapeArtist(+id, req.uid, {
      forceAvatar: force === '1',
      forceMeta: force === '1',
    });
    return {
      success: result.status !== 'error',
      ...result,
      data: result.artist
        ? new BaseArtistTemplate(result.artist)
        : undefined,
    };
  }

  @Post(':id/avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @Param('id') id: number,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string },
    @Req() req: Request & { uid: string },
  ) {
    if (!(await this.artistService.checkAccessible(id, req.uid))) {
      throw new HttpException(
        {
          status: HttpStatus.NOT_FOUND,
          error: 'artist not accessible',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const artist = await this.artistService.updateArtistAvatarFromFile(
      id,
      file,
    );
    return {
      success: true,
      data: new BaseArtistTemplate(artist),
    };
  }
}
