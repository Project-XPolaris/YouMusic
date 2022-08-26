import { Module } from '@nestjs/common';
import { FavouriteController } from './favourite.controller';
import { FavouriteService } from './favourite.service';

@Module({
  controllers: [FavouriteController],
  providers: [FavouriteService],
  imports: [],
})
export class FavouriteModule {}
