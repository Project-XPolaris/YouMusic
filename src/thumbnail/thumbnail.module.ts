import { Global, LoggerService, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { ThumbnailService } from './thumbnail.service';
import { ConfigService } from '@nestjs/config';
import { ThumbnailClient } from './client';
import { JimpThumbnailGenerator } from './jimp';
import { LogService } from '../log/log.service';
import { LogModule } from '../log/log.module';

@Global()
@Module({
  imports: [ConfigModule, LogModule],
  exports: [ThumbnailService],
  providers: [
    ThumbnailService,
    {
      inject: [ConfigService, LogService],
      provide: 'ENGINE',
      useFactory: async (
        configService: ConfigService,
        loggerService: LogService,
      ) => {
        const engineType = configService.get('thumbnail.engine');
        loggerService.info({
          content: `Using thumbnail engine: ${engineType}`,
          scope: 'thumbnail',
        });
        switch (engineType) {
          case 'thumbnailservice':
            loggerService.info({
              content: 'Using thumbnail service',
              scope: 'thumbnail',
              extra: {
                url: configService.get('thumbnail.url'),
              },
            });
            return new ThumbnailClient(configService.get('thumbnail.url'));
          default:
            return new JimpThumbnailGenerator();
        }
      },
    },
  ],
})
export class ThumbnailModule {}
