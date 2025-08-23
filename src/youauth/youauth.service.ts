import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  GenerateTokenResult,
  GetCurrentUserResponse,
  YouAuthClient,
} from './client';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NacosNamingClient } = require('nacos');

@Injectable()
export class YouAuthService implements OnModuleInit {
  client: YouAuthClient;
  private initialized: Promise<void>;

  constructor(private configService: ConfigService) {
    this.initialized = this.initClient();
  }

  async onModuleInit() {
    await this.initialized;
  }

  private async initClient() {
    const appId = this.configService.get('oauth.appid');
    const secret = this.configService.get('oauth.secret');

    let authUrl = this.configService.get('oauth.url');

    const youauthNacos = this.configService.get('auth.youauth.nacos');
    const nacosGlobal = this.configService.get('nacos');

    if (youauthNacos && youauthNacos.enable && nacosGlobal && nacosGlobal.server) {
      const namespace = nacosGlobal.namespaceId || '';
      const username = nacosGlobal.username || '';
      const password = nacosGlobal.password || '';
      const serviceName = youauthNacos.serviceName || 'youauth-service';
      const groupName = youauthNacos.group || 'DEFAULT_GROUP';
      const scheme = youauthNacos.scheme || 'http';

      const client = new NacosNamingClient({
        logger: console,
        serverList: nacosGlobal.server,
        namespace,
        username,
        password,
      });
      try {
        await client.ready();
        const list = await client.getAllInstances(serviceName, groupName);
        const instances = (list || []).filter((it: any) => it.healthy !== false && it.enabled !== false);
        const target = instances[0];
        if (target && target.ip && target.port) {
          authUrl = `${scheme}://${target.ip}:${target.port}`;
        }
      } catch (e) {
        // fallback to config oauth.url
      }
    }

    this.client = new YouAuthClient(authUrl, appId, secret);
  }

  async generateToken(authCode: string): Promise<GenerateTokenResult> {
    await this.initialized;
    return this.client.generateToken(authCode);
  }

  async getCurrentUser(token: string): Promise<GetCurrentUserResponse> {
    await this.initialized;
    return this.client.getCurrentUser(token);
  }

  async generateTokenByPassword(
    username: string,
    password: string,
  ): Promise<GenerateTokenResult> {
    await this.initialized;
    return this.client.generateTokenByPassword(username, password);
  }
}
