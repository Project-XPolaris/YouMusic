import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Patch,
} from '@nestjs/common';
import { ArtistService } from './artist.service';
import { BaseArtistTemplate } from '../template/artist';
import { getOrderFromQueryString } from '../utils/query';
import {
  UpdateArtistAvatarFromUrl,
  UpdateArtistDTO,
} from './dto/update-artist.dto';

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
    @Req() req: Request & { uid: string },
  ) {
    const [data, count] = await this.artistService.findAll({
      page,
      pageSize,
      order: getOrderFromQueryString(order, {}),
      uid: req.uid,
      search,
      random: random === '1',
    });
    return {
      count,
      data: data.map((artist) => new BaseArtistTemplate(artist)),
    };
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
}
