import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserAuthDto } from './dto/user-auth.dto';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post('/user/auth')
  async userAuth(@Body() userAuthDto: UserAuthDto) {
    const response = await this.authService.client.userAuth(
      userAuthDto.username,
      userAuthDto.password,
    );
    return {
      success: true,
      data: {
        username: response.uid,
        accessToken: response.token,
      },
    };
  }
  @Get('/user/auth')
  async checkAuth(@Query('token') token: string) {
    try {
      const user = await this.authService.checkAuth(token);
      if (!user) {
        return {
          success: false,
          err: 'no user',
        };
      }
      return {
        success: true,
      };
    } catch (e) {
      return {
        success: false,
        err: e.message,
      };
    }
  }
  @Get(`/oauth/youauth`)
  async generateYouAuthToken(@Query('code') code: string) {
    const data = await this.authService.generateYouAuthToken(code);
    return {
      success: true,
      data: {
        accessToken: data.oauth.accessToken,
        username: data.username,
      },
    };
  }
  @Post(`/oauth/youauth/password`)
  async generateYouAuthTokenByPassword(
    @Body('username') username: string,
    @Body('password') password: string,
  ) {
    const data = await this.authService.generateYouAuthPasswordToken(
      username,
      password,
    );
    return {
      success: true,
      data: {
        accessToken: data.oauth.accessToken,
        username: data.username,
      },
    };
  }
}
