import { Controller, Get } from '@nestjs/common';
import { MeilisearchService } from './meilisearch.service';

@Controller('search/index')
export class MeilisearchController {
  constructor(private readonly meili: MeilisearchService) {}

  @Get('status')
  async status() {
    const data = await this.meili.getStatus();
    return { success: true, data };
  }
}
