import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { YouPlusClient } from '../youplus/client';

@Injectable()
export class AuthService {
  client: YouPlusClient;
  constructor(private configService: ConfigService) {
    const authUrl = configService.get('youplus');
    this.client = new YouPlusClient(authUrl);
  }
  async check(token: string): Promise<{ uid: string } | undefined> {
    const response = await this.client.checkAuth(token);
    if (!response.success) {
      return undefined;
    }
    return {
      uid: response.uid,
    };
  }
}
