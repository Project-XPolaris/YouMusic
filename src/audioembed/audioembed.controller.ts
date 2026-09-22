import { Body, Controller, Get, Post } from '@nestjs/common';
import { AudioEmbedService } from './audioembed.service';

@Controller('audioembed')
export class AudioEmbedController {
  constructor(private readonly audioEmbedService: AudioEmbedService) {}

  @Get('state')
  async state() {
    return { success: true, data: await this.audioEmbedService.getState() };
  }

  @Post('enable')
  async enable(@Body() body: { enable: boolean }) {
    const data = await this.audioEmbedService.setEnabled(Boolean(body?.enable));
    return { success: true, data };
  }

  @Post('semantic-rewrite')
  async semanticRewrite(@Body() body: { enable: boolean }) {
    const data = await this.audioEmbedService.setSemanticRewrite(
      Boolean(body?.enable),
    );
    return { success: true, data };
  }

  @Post('scan')
  async scan(
    @Body()
    body: {
      musicId?: number;
      albumId?: number;
      libraryId?: number;
      force?: boolean;
    },
  ) {
    const task = await this.audioEmbedService.startScanTask({
      musicId: body?.musicId,
      albumId: body?.albumId,
      libraryId: body?.libraryId,
      force: body?.force,
    });
    return { success: true, data: task };
  }

  @Post('delete')
  async remove(
    @Body()
    body: {
      musicId?: number;
      albumId?: number;
      libraryId?: number;
    },
  ) {
    const data = await this.audioEmbedService.deleteEmbeddings({
      musicId: body?.musicId,
      albumId: body?.albumId,
      libraryId: body?.libraryId,
    });
    return { success: true, data };
  }

  @Post('tag')
  async tag(
    @Body()
    body: {
      musicId?: number | number[];
      musicIds?: number[];
      albumId?: number;
      libraryId?: number;
      threshold?: number;
    },
  ) {
    const task = await this.audioEmbedService.startTagTask({
      musicId: body?.musicId,
      musicIds: body?.musicIds,
      albumId: body?.albumId,
      libraryId: body?.libraryId,
      threshold: body?.threshold,
    });
    return { success: true, data: task };
  }

  @Post('tag/sync')
  async tagSync(
    @Body()
    body: {
      musicId: number;
      threshold?: number;
    },
  ) {
    const data = await this.audioEmbedService.tagSingleMusic(
      body.musicId,
      body.threshold,
    );
    return { success: true, data };
  }

  @Post('tag/clear')
  async clearTags(
    @Body()
    body: {
      musicId?: number;
      albumId?: number;
      libraryId?: number;
    },
  ) {
    const data = await this.audioEmbedService.clearTags({
      musicId: body?.musicId,
      albumId: body?.albumId,
      libraryId: body?.libraryId,
    });
    return { success: true, data };
  }
}
