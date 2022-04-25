import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';

export interface ThumbnailGenerator {
  generate(buffer: Buffer, output: string): Promise<void>;
}

@Injectable({})
export class ThumbnailService {
  constructor(
    private configService: ConfigService,
    @Inject('ENGINE')
    private engine: ThumbnailGenerator,
  ) {}
  generate(buffer: Buffer, output: string): Promise<void> {
    if (buffer.length > 1024 * 500) {
      // 500kb
      fs.writeFileSync(output, buffer);
      return;
    }
    return this.engine.generate(buffer, output);
  }
}
