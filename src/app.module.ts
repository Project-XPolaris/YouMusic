import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScanController } from './scan/scan.controller';
import { Music } from './database/entites/music';
import { Artist } from './database/entites/artist';
import { Album } from './database/entites/album';
import { MusicModule } from './music/music.module';
import { ArtistModule } from './artist/artist.module';
import { AlbumModule } from './album/album.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { FileController } from './file/file.controller';
import { LibraryModule } from './library/library.module';
import * as path from 'path';
import { MediaLibrary } from './database/entites/library';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { ExploreController } from './explore/explore.controller';
import { SearchController } from './search/search.controller';
import configuration from './config/configuration';
import { AuthMiddleware } from './auth.middleware';
import { User } from './database/entites/user';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: path.join(__dirname, '../', 'static'),
    }),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'ym_db.sqlite',
      logging: true,
      entities: [MediaLibrary, Music, Artist, Album, User],
      synchronize: true,
    }),
    ConfigModule.forRoot({
      load: [configuration],
    }),
    MusicModule,
    ArtistModule,
    AlbumModule,
    LibraryModule,
  ],
  controllers: [
    AppController,
    ScanController,
    FileController,
    ExploreController,
    SearchController,
  ],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): any {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
