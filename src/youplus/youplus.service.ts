import { BadRequestException, Injectable } from '@nestjs/common';
import { DirItem, YouPlusClient } from './client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class YouPlusService {
  client: YouPlusClient;
  constructor(private configService: ConfigService) {
    const authUrl = configService.get('youplus.url');
    this.client = new YouPlusClient(authUrl);
  }
  async readDir(target: string, token: string): Promise<DirItem[]> {
    return this.client.readDir(target, token);
  }
  async getRealpath(target: string, token: string): Promise<{ path: string }> {
    return this.client.getRealPath(target, token);
  }

  /** Resolve Share logical path to physical (user token or internal). */
  async resolveLogicalPath(
    logical: string,
    token?: string,
  ): Promise<string> {
    const trimmed = (logical || '').trim();
    if (!trimmed) {
      throw new BadRequestException('library path is empty');
    }
    if (trimmed === '/' || trimmed === '.') {
      throw new BadRequestException(
        'library path must be under a share, not /',
      );
    }
    if (!this.configService.get('youplus.enablePath')) {
      return trimmed;
    }
    if (token) {
      const result = await this.client.getRealPath(trimmed, token);
      if (!result?.path?.trim()) {
        throw new Error(`resolve logical path failed: empty result for ${trimmed}`);
      }
      return result.path;
    }
    const internalToken = (
      this.configService.get<string>('youplus.internal_token') || ''
    ).trim();
    if (!internalToken) {
      throw new Error('youplus.internal_token not configured');
    }
    const result = await this.client.getRealPathInternal(
      trimmed,
      internalToken,
    );
    if (!result?.path?.trim()) {
      throw new Error(`resolve logical path failed: empty result for ${trimmed}`);
    }
    return result.path;
  }
}