import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { AuthService } from './auth.service';
@Global()
@Module({
  imports: [ConfigModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
