import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

@Controller()
export class InfoController {
  constructor(private configService: ConfigService) {}
  @Get('/info')
  async getInfo() {
    const oauthConfig = this.configService.get('oauth');
    const oauthEnabled = Boolean(oauthConfig);
    const oauthUrl = new URL(oauthConfig.url);
    oauthUrl.searchParams.set('appid', oauthConfig.appid);
    oauthUrl.pathname = path.join(oauthUrl.pathname, '/login');
    const authObj = this.configService.get('auth');
    const auths = [];
    Object.getOwnPropertyNames(authObj).forEach((key: string) => {
      const enable = authObj[key].enable;
      if (!enable) {
        return;
      }
      const authType = authObj[key].type;
      switch (authType) {
        case 'youauth':
          auths.push({
            name: 'YouAuth',
            type: 'weboauth',
            url: oauthUrl.toString(),
          });
          break;
        case 'youplus':
          auths.push({
            name: 'YouPlus',
            type: 'base',
            url: '/user/auth',
          });
          break;
        case 'anonymous':
          auths.push({
            name: 'Anonymous',
            type: 'anonymous',
            url: '',
          });
      }
    });
    return {
      success: true,
      name: 'YouMusic Service',
      authEnable: this.configService.get('auth.enable'),
      authUrl: this.configService.get('auth.url'),
      oauth: oauthEnabled,
      oauthUrl: oauthUrl.toString(),
      auth: auths,
    };
  }
}
