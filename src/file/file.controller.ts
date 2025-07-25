import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { Music } from '../database/entites/music';
import { ServerResponse } from 'http';
import { getImageFromID3 } from '../utils/id3';

@Controller('file')
export class FileController {
  constructor(private dataSource: DataSource) {}

  @Get('audio/:id')
  @Header('Content-Type', 'audio/mpeg')
  async audioHandler(@Param('id') id: string, @Res() res: ServerResponse) {
    const music = await this.dataSource.getRepository(Music).findOne({ where: { id: +id } });
    const stat = fs.statSync(music.path);
    const stream = fs.createReadStream(music.path);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');
    stream.pipe(res);
  }

  @Get('music/:id/cover')
  async musicCoverHandler(@Param('id') id: string, @Res() res: ServerResponse) {
    const music = await this.dataSource.getRepository(Music).findOne({ where: { id: +id } });
    if (!music) {
      throw new NotFoundException();
    }
    const pic = await getImageFromID3(music.path);
    res.setHeader('Content-Type', pic.format);
    res.end(pic.data);
  }

  @Get('lrc/:id')
  async lyricHandler(@Param('id') id: string, @Res() res: ServerResponse) {
    const music = await this.dataSource.getRepository(Music).findOne({ where: { id: +id } });
    if (!music.lyric) {
      throw new NotFoundException();
    }
    const stat = fs.statSync(music.lyric);
    const stream = fs.createReadStream(music.lyric);
    res.setHeader('Content-Length', stat.size);
    stream.pipe(res);
  }
}
