import { PartialType } from '@nestjs/mapped-types';
import { CreateMusicDto } from './create-music.dto';

export class UpdateMusicDto extends PartialType(CreateMusicDto) {
  title?: string;
  artist?: string[];
  album?: string;
  year?: number;
  track?: number;
  genre?: string[];
  disc?: number;
  coverUrl?: string;
}

export class SetMusicCoverFromUrlRequestBody {
  url: string;
}

export class UpdateMusicLyricDto {
  content: string;
}
