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
import { FileController } from './file/file.controller';
import { LibraryModule } from './library/library.module';
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
import { ConfigService } from '@nestjs/config';
import { Oauth } from './database/entites/oauth';
import { Tag } from './database/entites/tag';
import { TagModule } from './tag/tag.module';
import { GenreModule } from './genre/genre.module';
import { AppLoggerMiddleware } from './log.middleware';
import { FavoriteModule } from './favourite/favorite.module';
import { PlaylistModule } from './playlist/playlist.module';
import { Playlist } from './database/entites/playlist';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const entities = [
          MediaLibrary,
          Music,
          Artist,
          Album,
          User,
          Genre,
          SpotifyAuth,
          Oauth,
          Tag,
          Playlist,
        ];
        const datasource = configService.get('datasource.type');
        switch (datasource) {
          case 'sqlite':
            return {
              type: 'sqlite',
              database: configService.get('datasource.path'),
              entities,
              synchronize: true,
            };
          case 'mysql':
            return {
              type: 'mysql',
              host: configService.get('datasource.host'),
              port: configService.get('datasource.port'),
              username: configService.get('datasource.username'),
              password: configService.get('datasource.password'),
              database: configService.get('datasource.database'),
              retryAttempts: 3,
              entities,
              synchronize: true,
            };
        }
      },
    }),
    HttpModule,
    NotificationModule,
    LogModule,
    TaskModule,
    ArtistModule,
    AlbumModule,
    LibraryModule,
    MusicModule,
    AuthModule,
    AccountModule,
    ExploreModule,
    MetaModule,
    TagModule,
    GenreModule,
    FavoriteModule,
    PlaylistModule,
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
    consumer.apply(AppLoggerMiddleware).forRoutes('*');
  }
}
