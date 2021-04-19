import { HttpModule, Module } from '@nestjs/common';
import { MusicService } from './music.service';
import { MusicController } from './music.controller';

@Module({
  controllers: [MusicController],
  providers: [MusicService],
  imports:[HttpModule]
})
export class MusicModule {}
