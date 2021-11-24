import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { AlbumService } from './album.service';
import { BaseAlbumTemplate } from '../template/album';
import { getOrderFromQueryString } from '../utils/query';
import { Patch } from '@nestjs/common/decorators/http/request-mapping.decorator';
import { UpdateAlbumDto } from './dto/update-album.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('album')
export class AlbumController {
  constructor(private readonly albumService: AlbumService) {}
  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('artist') artistId = 0,
    @Query('order') order = '',
    @Query('search') search = '',
    @Req() req: Request & { uid: string },
  ) {
    const [list, count] = await this.albumService.findAll({
      page: Number(page),
      pageSize: Number(pageSize),
      artistId,
      order: getOrderFromQueryString(order, {}),
      uid: req.uid,
      search,
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

  @Patch(':id')
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
}
