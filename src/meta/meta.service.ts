import { Injectable } from '@nestjs/common';
import { SearchAlbumEntity, SearchMusicEntity } from './meta.entites';
import { NeteasemusicService } from '../neteasemusic/neteasemusic.service';
import { SearchType } from 'NeteaseCloudMusicApi';

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
  constructor(private neteaseMusicService: NeteasemusicService) {}

  async searchAlbum(key: string): Promise<SearchAlbumEntity[]> {
    const {
      albums,
    }: {
      albums: NeteaseSearchAlbumResult[];
    } = await this.neteaseMusicService.search(key, { type: SearchType.album });

    return albums.map((it) => ({
      name: it.name,
      cover: it.picUrl,
      artists: it.artist?.name,
    }));
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
  async getLyricFromSearchMusic(searchMusic: SearchMusicEntity): Promise<any> {
    if (searchMusic.source === 'NeteaseMusic') {
      return this.neteaseMusicService.getLyric(searchMusic.id);
    } else {
      throw new Error('target source unsupport get lyric');
    }
  }
}
