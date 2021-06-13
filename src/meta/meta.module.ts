import { Module } from '@nestjs/common';
import { MetaService } from './meta.service';
import { MetaController } from './meta.controller';
import { NeteasemusicService } from '../neteasemusic/neteasemusic.service';

@Module({
  controllers: [MetaController],
  providers: [MetaService, NeteasemusicService],
  exports: [MetaService],
})
export class MetaModule {}
