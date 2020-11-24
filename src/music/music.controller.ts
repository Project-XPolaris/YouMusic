import {
  Controller,
  Get,
  Body,
  Put,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { MusicService } from './music.service';
import { UpdateMusicDto } from './dto/update-music.dto';

@Controller('music')
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('artist') artistId = 0,
    @Query('album') albumId = 0,
  ) {
    const [list, count] = await this.musicService.findAll({
      page,
      pageSize,
      artistId,
      albumId,
    });
    return {
      count,
      data: list.map((music) => {
        if (music.album === null) {
          music.album = undefined;
        }
        if (music.album?.cover) {
          music.album.cover = `/covers/${music.album?.cover}`;
        }
        return {
          ...music,
        };
      }),
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.musicService.findOne(+id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateMusicDto: UpdateMusicDto) {
    return this.musicService.update(+id, updateMusicDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.musicService.remove(+id);
  }
}
