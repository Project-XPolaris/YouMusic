import { Injectable } from '@nestjs/common';
import { SearchAlbumEntity } from './meta.entites';
import { NeteasemusicService } from '../neteasemusic/neteasemusic.service';
import { SearchType } from 'NeteaseCloudMusicApi';

interface NeteaseSearchAlbumResult {
  name: string;
  picUrl: string;
  artist: { name: string };
}
@Injectable()
export class MetaService {
  constructor(private neteaseMusicService: NeteasemusicService) {}
  async searchAlbum(key: string): Promise<SearchAlbumEntity[]> {
    const {
      albums,
    }: {
      albums: NeteaseSearchAlbumResult[];
    } = await this.neteaseMusicService.search(key, SearchType.album);

    return albums.map((it) => ({
      name: it.name,
      cover: it.picUrl,
      artists: it.artist?.name,
    }));
  }
}
