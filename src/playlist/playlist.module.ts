import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PlaylistController } from './playlist.controller';
import { PlaylistService } from './playlist.service';

@Module({
  controllers: [PlaylistController],
  providers: [PlaylistService],
  imports: [HttpModule],
})
export class PlaylistModule {}
