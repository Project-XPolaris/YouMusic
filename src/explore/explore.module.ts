import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { ExploreService } from './explore.service';
import { ExploreController } from './explore.controller';
import { YouPlusService } from '../youplus/youplus.service';

@Global()
@Module({
  controllers: [ExploreController],
  imports: [ConfigModule],
  providers: [ExploreService, YouPlusService],
  exports: [ExploreService],
})
export class ExploreModule {}
