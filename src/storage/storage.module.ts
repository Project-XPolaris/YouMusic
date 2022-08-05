import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { LogModule } from '../log/log.module';
@Global()
@Module({
  imports: [ConfigModule, LogModule],
  exports: [StorageService],
  providers: [StorageService],
})
export class StorageModule {}
