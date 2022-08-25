import { Module } from '@nestjs/common';
import { GenreController } from './genre.controller';
import { GenreService } from './genre.service';

@Module({
  controllers: [GenreController],
  providers: [GenreService],
  imports: [],
})
export class GenreModule {}
