import { Controller, Get, Query, Req } from '@nestjs/common';
import * as path from 'path';
import { ExploreService, ReadDirItem } from './explore.service';

@Controller('explore')
export class ExploreController {
  constructor(private readonly exploreService: ExploreService) {}
  @Get('/read')
  async getFileList(
    @Query('path') readPath = '/',
    @Req() req: Request & { token: string },
  ) {
    const files: ReadDirItem[] = await this.exploreService.readDir(
      readPath,
      req.token,
    );
    return {
      path: readPath,
      sep: path.sep,
      files: files.map((diren) => ({
        name: diren.name,
        path: diren.path,
        type: diren.type,
      })),
    };
  }
}
