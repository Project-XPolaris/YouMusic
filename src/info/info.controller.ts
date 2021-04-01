import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('app')
export class InfoController {
  constructor(private configService: ConfigService) {}
  @Get('/info')
  async getInfo() {
    return {
      name: 'YouMusic Service',
      authUrl: this.configService.get('authUrl'),
    };
  }
}
