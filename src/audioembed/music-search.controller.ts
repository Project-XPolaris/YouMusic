import { Body, Controller, Post, Req } from '@nestjs/common';
import { AudioEmbedService } from '../audioembed/audioembed.service';

@Controller('music/search')
export class MusicSearchController {
  constructor(private readonly audioEmbedService: AudioEmbedService) {}

  @Post('semantic')
  async semantic(
    @Body()
    body: {
      query: string;
      limit?: number;
      libraryId?: number;
      rewrite?: boolean;
    },
    @Req() req: Request & { uid: string },
  ) {
    return this.audioEmbedService.semanticSearch({
      query: body?.query,
      limit: body?.limit,
      libraryId: body?.libraryId,
      rewrite: body?.rewrite,
      uid: req.uid,
    });
  }
}
