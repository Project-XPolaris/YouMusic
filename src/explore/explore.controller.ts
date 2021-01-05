import { Controller, Get, Query } from '@nestjs/common';
import { readdir } from 'fs/promises';
import { Dirent } from 'fs';
import * as path from 'path';
import * as os from 'os';

@Controller('explore')
export class ExploreController {
  @Get('/read')
  async getFileList(@Query('path') readPath = os.homedir()) {
    const files: Dirent[] = await readdir(readPath, { withFileTypes: true });
    return {
      path: readPath,
      sep: path.sep,
      files: files.map((diren) => ({
        name: diren.name,
        path: path.join(readPath, diren.name),
        type: diren.isDirectory() ? 'Directory' : 'File',
      })),
    };
  }
}
