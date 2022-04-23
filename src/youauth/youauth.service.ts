import { Injectable } from '@nestjs/common';
import {
  GenerateTokenResult,
  GetCurrentUserResponse,
  YouAuthClient,
} from './client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class YouAuthService {
  client: YouAuthClient;
  constructor(private configService: ConfigService) {
    const authUrl = configService.get('oauth.url');
    const appId = configService.get('oauth.appid');
    const secret = configService.get('oauth.secret');
    this.client = new YouAuthClient(authUrl, appId, secret);
  }
  async generateToken(authCode: string): Promise<GenerateTokenResult> {
    return this.client.generateToken(authCode);
  }
  async getCurrentUser(token: string): Promise<GetCurrentUserResponse> {
    return this.client.getCurrentUser(token);
  }
}
