import {
  HttpModule,
  MiddlewareConsumer,
  Module,
  NestModule,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import configuration from './config/configuration';
import { AuthMiddleware } from './auth.middleware';
import { User } from './database/entites/user';
import { AuthModule } from './auth/auth.module';
import { MusicBrainService } from './mb/MusicBrain.service';
import { SearchController } from './search/search.controller';
import { SpotifyService } from './spotify/spotify.service';
import { InfoController } from './info/info.controller';
import { TaskModule } from './task/task.module';
import { Genre } from './database/entites/genre';
import { SpotifyController } from './spotify/spotify.controller';
import { SpotifyAuth } from './database/entites/spotify';
import { AccountModule } from './account/account.module';
import { NotificationModule } from './notification/notification.module';
import { ExploreModule } from './explore/explore.module';
import { NeteaseMusicController } from './neteasemusic/neteaseMusic.controller';
import { NeteasemusicService } from './neteasemusic/neteasemusic.service';
import { MetaModule } from './meta/meta.module';
import { LogModule } from './log/log.module';
import { LogService } from './log/log.service';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: path.join(__dirname, '../', 'static'),
    }),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: './data/ym_db.sqlite',
      logging: true,
      entities: [MediaLibrary, Music, Artist, Album, User, Genre, SpotifyAuth],
      synchronize: true,
    }),
    ConfigModule.forRoot({
      load: [configuration],
    }),
    HttpModule,
    NotificationModule,
    LogModule,
    TaskModule,
    MusicModule,
    ArtistModule,
    AlbumModule,
    LibraryModule,
    AuthModule,
    AccountModule,
    ExploreModule,
    MetaModule,
  ],
  controllers: [
    AppController,
    FileController,
    SearchController,
    SpotifyController,
    InfoController,
    NeteaseMusicController,
  ],
  providers: [
    AppService,
    MusicBrainService,
    SpotifyService,
    NeteasemusicService,
  ],
})
export class AppModule implements NestModule, OnApplicationBootstrap {
  constructor(private logService: LogService) {}
  onApplicationBootstrap() {
    this.logService.info({ content: 'Service starting', scope: 'boot' });
  }
  configure(consumer: MiddlewareConsumer): any {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
