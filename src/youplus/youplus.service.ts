import { Injectable } from '@nestjs/common';
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
}