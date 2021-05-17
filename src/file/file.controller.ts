import { Controller, Get, Header, NotFoundException, Param, Res } from '@nestjs/common';
import * as fs from 'fs';
import { getRepository } from 'typeorm';
import { Music } from '../database/entites/music';
import { ServerResponse } from 'http';
@Controller('file')
export class FileController {
  @Get('audio/:id')
  @Header('Content-Type', 'audio/mpeg')
  async audioHandler(@Param('id') id: string, @Res() res: ServerResponse) {
    const music = await getRepository(Music).findOne(id);
    const stat = fs.statSync(music.path);
    const stream = fs.createReadStream(music.path);
    res.setHeader('Content-Length', stat.size);
    stream.pipe(res);
  }
  @Get('lrc/:id')
  async lyricHandler(@Param('id') id: string, @Res() res: ServerResponse) {
    const music = await getRepository(Music).findOne(id);
    if (!music.lyric) {
      throw new NotFoundException();
    }
    const stat = fs.statSync(music.lyric);
    const stream = fs.createReadStream(music.lyric);
    res.setHeader('Content-Length', stat.size);
    stream.pipe(res);
  }
}
