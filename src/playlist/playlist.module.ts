import { Module, HttpModule } from '@nestjs/common';
import { PlaylistController } from './playlist.controller';
import { PlaylistService } from './playlist.service';
import { MusicModule } from '../music/music.module';
import { MusicService } from '../music/music.service';

@Module({
  controllers: [PlaylistController],
  providers: [PlaylistService, MusicService],
  imports: [MusicModule, HttpModule],
})
export class PlaylistModule {}
