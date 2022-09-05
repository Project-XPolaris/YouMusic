import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { PlaylistService } from './playlist.service';
import { CreatePlaylistDto } from './dto/create';
import { PlaylistTemplate } from '../template/playlist';
import { getOrderFromQueryString } from '../utils/query';

@Controller('playlist')
export class PlaylistController {
  constructor(private playlistService: PlaylistService) {}
  @Post('/')
  async create(
    @Body() body: CreatePlaylistDto,
    @Req() req: Request & { uid: string },
  ) {
    const playlist = await this.playlistService.createPlaylist({
      ...body,
      uid: req.uid,
    });
    return new PlaylistTemplate(playlist);
  }
  @Get('/')
  async getPlaylistList(
    @Query('name') name: string | undefined,
    @Query('nameSearch') nameSearch: string | undefined,
    @Query('random') random: string | undefined,
    @Query('order') order = '',
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Req() req: Request & { uid: string },
  ) {
    const [playlists, count] = await this.playlistService.getPlaylistList({
      name,
      nameSearch,
      uid: req.uid,
      random: random == '1',
      order: getOrderFromQueryString(order, {}),
      page: Number(page),
      pageSize: Number(pageSize),
    });
    return {
      count,
      data: playlists.map((playlist) => new PlaylistTemplate(playlist)),
    };
  }
  @Delete('/:id')
  async delete(@Param('id') id: number, @Req() req: Request & { uid: string }) {
    const playlist = await this.playlistService.deletePlaylist({
      id: id.toString(),
      uid: req.uid,
    });
    return new PlaylistTemplate(playlist);
  }
  @Post('/:id/music')
  async addMusic(
    @Param('id') id: number,
    @Body() body: { musicIds: string[] },
    @Req() req: Request & { uid: string },
  ) {
    const playlist = await this.playlistService.addMusicToPlaylist({
      musicIds: body.musicIds,
      uid: req.uid,
      playlistId: id.toString(),
    });
    return new PlaylistTemplate(playlist);
  }
}
