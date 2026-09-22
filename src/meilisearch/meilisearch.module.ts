import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MeilisearchService } from './meilisearch.service';
import { MeilisearchController } from './meilisearch.controller';

@Module({
  imports: [ConfigModule],
  providers: [MeilisearchService],
  controllers: [MeilisearchController],
  exports: [MeilisearchService],
})
export class MeilisearchModule {}
