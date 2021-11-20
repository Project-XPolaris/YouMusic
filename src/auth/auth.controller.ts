import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserAuthDto } from './dto/user-auth.dto';

@Controller('user')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post('auth')
  async userAuth(@Body() userAuthDto: UserAuthDto) {
    return await this.authService.client.userAuth(
      userAuthDto.username,
      userAuthDto.password,
    );
  }
  @Get('auth')
  async checkAuth(@Query('token') token: string) {
    return await this.authService.client.checkAuth(token);
  }
}
