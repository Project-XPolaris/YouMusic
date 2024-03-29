import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { UpdateAlbumDto } from './dto/update-album.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from '../storage/storage.service';
import { ServerResponse } from 'http';
import { Readable } from 'stream';

@Controller('album')
export class AlbumController {
  constructor(
    private readonly albumService: AlbumService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('artist') artistId = 0,
    @Query('order') order = '',
    @Query('search') search = '',
    @Query('tag') tag = '',
    @Query('genre') genre = '',
    @Query('random') random = '',
    @Query('follow') follow = '0',
    @Query('id') id = '0',
    @Req() req: Request & { uid: string },
  ) {
    const [list, count] = await this.albumService.findAll({
      page: Number(page),
      pageSize: Number(pageSize),
      artistId,
      order: getOrderFromQueryString(order, {}),
      uid: req.uid,
      search,
      tag,
      random: random === '1',
      genre: genre.split(','),
      followUid: follow === '1' ? req.uid : undefined,
      id: +id,
    });
    return {
      count,
      data: list.map((album) => new BaseAlbumTemplate(album)),
    };
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
    if (album === undefined) {
      throw new BadRequestException('Invalid album');
    }
    const data = await this.storageService.getCover(album.cover);
    if (data instanceof Readable) {
      data.pipe(res);
    }
  }
}
