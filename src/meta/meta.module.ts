import { Module } from '@nestjs/common';
import { MetaService } from './meta.service';
import { MetaController } from './meta.controller';
import { NeteasemusicService } from '../neteasemusic/neteasemusic.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  controllers: [MetaController],
  providers: [MetaService, NeteasemusicService],
  exports: [MetaService],
  imports: [HttpModule],
})
export class MetaModule {}
