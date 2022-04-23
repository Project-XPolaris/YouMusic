import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { YouAuthService } from '../youauth/youauth.service';
@Global()
@Module({
  controllers: [AuthController],
  imports: [ConfigModule],
  providers: [AuthService, YouAuthService],
  exports: [AuthService],
})
export class AuthModule {}
