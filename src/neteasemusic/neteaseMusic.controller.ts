import { Body, Controller, Post } from '@nestjs/common';
import { NeteasemusicService } from './neteasemusic.service';

class LoginWithPhoneResponseBody {
  phone: string;
  password: string;
}

@Controller('netease')
export class NeteaseMusicController {
  constructor(private neteaseMusicService: NeteasemusicService) {}
  @Post('/phone/login')
  async LoginWithPhone(@Body() body: LoginWithPhoneResponseBody) {
    await this.neteaseMusicService.login(body.phone, body.password);
    return {
      success: true,
    };
  }
}
