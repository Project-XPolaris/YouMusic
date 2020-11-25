import { Controller, Get, Param, Query } from '@nestjs/common';
import { AlbumService } from './album.service';

@Controller('album')
export class AlbumController {
  constructor(private readonly albumService: AlbumService) {}
  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('artist') artistId = 0,
  ) {
    const [list, count] = await this.albumService.findAll({
      page,
      pageSize,
      artistId,
    });
    return {
      count,
      data: list.map((album) => {
        if (album.cover === null) {
          album.cover = undefined;
        } else {
          album.cover = `/covers/${album.cover}`;
        }
        return {
          ...album,
        };
      }),
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const album = await this.albumService.findOne(+id);
    if (album.cover === null) {
      album.cover = undefined;
    }else{
      album.cover = `/covers/${album.cover}`
    }
    album.artist = album.artist.map((artist) => {
      if (artist.avatar == null) {
        artist.avatar = undefined;
      } else {
        artist.avatar = `/covers/${artist.avatar}`;
      }
      return {
        ...artist,
      };
    });
    return {
      ...album,
      cover: `/covers/${album.cover}`,
    };
  }
}
