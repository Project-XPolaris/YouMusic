import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { YouPlusService } from '../youplus/youplus.service';
import { Dirent } from 'fs';
import { readdir } from 'fs/promises';
import * as path from 'path';

export interface ReadDirItem {
  name: string;
  path: string;
  type: string;
}

@Injectable()
export class ExploreService {
  constructor(
    private configService: ConfigService,
    private youPlusService: YouPlusService,
  ) {}

  async readDir(target: string, token: string): Promise<ReadDirItem[]> {
    if (!this.configService.get('youplus.enablePath')) {
      const files: Dirent[] = await readdir(target, { withFileTypes: true });
      return files.map((it) => ({
        name: it.name,
        type: it.isDirectory() ? 'Directory' : 'File',
        path: path.join(target, it.name),
      }));
    }
    const items = await this.youPlusService.readDir(target, token);
    return items.map((it) => ({
      name: path.basename(it.path),
      path: it.path,
      type: it.type,
    }));
  }
}
