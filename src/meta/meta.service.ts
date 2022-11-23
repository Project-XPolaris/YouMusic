import { Injectable } from '@nestjs/common';
import {
  AlbumMeta,
  SearchAlbumEntity,
  SearchMusicEntity,
} from './meta.entites';
import { NeteasemusicService } from '../neteasemusic/neteasemusic.service';
import { SearchType } from 'NeteaseCloudMusicApi';
import { mbApi } from '../mb';
import { HttpService } from '@nestjs/axios';

interface NeteaseSearchAlbumResult {
  name: string;
  picUrl: string;
  artist: { name: string };
}

interface NeteaseSearchSongResult {
  id: number;
  name: string;
  artists: { name: string }[];
}

@Injectable()
export class MetaService {
  constructor(
    private neteaseMusicService: NeteasemusicService,
    private http: HttpService,
  ) {}

  async searchAlbum(
    key: string,
    { artist, source }: { artist?: string; source?: string },
  ): Promise<SearchAlbumEntity[]> {
    const result: SearchAlbumEntity[] = [];
    if (source === undefined || source === 'NeteaseMusic') {
      const neteaseResult = await this.neteaseMusicService.search(key, {
        type: SearchType.album,
        artist,
      });
      const neteaseMusicResult = neteaseResult.albums.map((it) => ({
        id: it.id.toString(),
        name: it.name,
        cover: it.picUrl,
        artists: it.artist?.name,
        source: 'NeteaseMusic',
      }));
      result.push(...neteaseMusicResult);
    }
    if (source === undefined || source === 'MusicBrainz') {
      const mbResult = await mbApi.searchRelease({
        query: key,
        artist: artist,
      });
      const mbMusicResult: SearchAlbumEntity[] = mbResult.releases.map(
        (it) => ({
          id: it.id,
          name: it.title,
          artists: it['artist-credit'].map((artist) => artist.name).join('/'),
          source: 'MusicBrain',
          releaseDate: it.date,
        }),
      );
      result.push(...mbMusicResult);
    }
    return result;
  }
  async getAlbumDetail(ids: {
    mbId?: string;
    nemId?: string;
  }): Promise<AlbumMeta> {
    const album: AlbumMeta = {};
    if (ids.mbId) {
      album.mbId = ids.mbId;
      const mbAlbum = await mbApi.lookupRelease(ids.mbId, ['artists']);
      album.name = mbAlbum.title;
      album.artist = mbAlbum['artist-credit'].map((it) => it.name).join('/');
      const response = await this.http
        .get(`http://coverartarchive.org/release/${ids.mbId}`, {
          proxy: {
            protocol: 'http',
            host: '127.0.0.1',
            port: 7890,
          },
        })
        .toPromise();
      const images = response.data.images;
      let coverImage = images.find((it) => it.front);
      if (!coverImage && images.length) {
        coverImage = images[0];
      }
      if (coverImage) {
        album.cover = coverImage.image;
      }
      return album;
    }
    if (ids.nemId) {
      album.nemId = ids.nemId;
      const nemAlbum = await this.neteaseMusicService.getAlbumWithId(ids.nemId);
      const data = nemAlbum?.body?.album;
      if (data) {
        album.name = data.name;
        album.artist = data.artist?.name;
        album.cover = data.picUrl;
      }
      return album;
    }
    return album;
  }

  async searchArtist(key: string) {
    const result = await this.neteaseMusicService.search(key, {
      type: SearchType.artist,
    });
    return result;
  }

  async searchMusic(name: string): Promise<SearchMusicEntity[]> {
    const musicResult: SearchMusicEntity[] = [];
    const {
      songs,
    }: {
      songs: NeteaseSearchSongResult[];
    } = await this.neteaseMusicService.search(name, {
      type: SearchType.single,
    });
    if (songs) {
      musicResult.push(
        ...songs.map((it) => ({
          id: it.id.toString(),
          name: it.name,
          artists: it.artists.map((itArtist) => ({ name: itArtist.name })),
          source: 'NeteaseMusic',
        })),
      );
    }
    return musicResult;
  }

  async getLyricFromSearchMusic(
    searchMusic: SearchMusicEntity,
  ): Promise<string> {
    if (searchMusic.source === 'NeteaseMusic') {
      const { lyric }: { lyric: string } =
        await this.neteaseMusicService.getLyric(searchMusic.id);
      return lyric;
    } else {
      throw new Error('target source unsupport get lyric');
    }
  }
}
