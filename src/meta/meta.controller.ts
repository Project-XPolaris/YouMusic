import { Controller, Get, Query } from '@nestjs/common';
import { MetaService } from './meta.service';

@Controller('meta')
export class MetaController {
  constructor(private metaService: MetaService) {}
  @Get('search/album')
  async SearchAlbum(@Query() key: string) {
    return await this.metaService.searchAlbum(key);
  }
}
