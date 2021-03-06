import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('app')
export class InfoController {
  constructor(private configService: ConfigService) {}
  @Get('/info')
  async getInfo() {
    return {
      name: 'YouMusic Service',
      authEnable: this.configService.get('auth.enable'),
      authUrl: this.configService.get('auth.url'),
    };
  }
}
