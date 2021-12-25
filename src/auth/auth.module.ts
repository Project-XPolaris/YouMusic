import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
@Global()
@Module({
  controllers: [AuthController],
  imports: [ConfigModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
