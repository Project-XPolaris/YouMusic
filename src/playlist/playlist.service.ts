import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Playlist } from '../database/entites/playlist';
import { DataSource } from 'typeorm';
import { User } from '../database/entites/user';
import { Music } from '../database/entites/music';
import { MediaLibrary } from '../database/entites/library';
import { PageFilter } from '../database/utils/type.filter';

export type PlaylistFilter = {
  uid: string;
  name?: string;
  nameSearch?: string;
  random: boolean;
  order: { [key: string]: 'ASC' | 'DESC' };
} & PageFilter;

@Injectable()
export class PlaylistService {
  constructor(private dataSource: DataSource) {}

  private async requireOwnedPlaylist(
    id: number,
    uid: string,
    relations: string[] = ['owner'],
  ) {
    const repository = this.dataSource.getRepository(Playlist);
    const playlist = await repository.findOne({
      where: { id },
      relations,
    });
    if (!playlist) {
      throw new NotFoundException('playlist not found');
    }
    if (!playlist.owner || playlist.owner.uid !== uid) {
      throw new BadRequestException('you are not the owner of this playlist');
    }
    return playlist;
  }

  async getPlaylistList(filter: PlaylistFilter) {
    const repository = this.dataSource.getRepository(Playlist);
    const query = repository
      .createQueryBuilder('playlist')
      .leftJoinAndSelect('playlist.owner', 'owner')
      .loadRelationCountAndMap('playlist.musicCount', 'playlist.music')
      .where('owner.uid = :uid', { uid: filter.uid })
      .andWhere('playlist.name LIKE :name', {
        name: `%${filter.nameSearch || filter.name || ''}%`,
      });
    if (filter.random) {
      if (this.dataSource.options.type === 'sqlite') {
        query.orderBy('RANDOM()');
      } else {
        query.orderBy('RAND()');
      }
    } else if (Object.keys(filter.order || {}).length) {
      const order: Record<string, 'ASC' | 'DESC'> = {};
      Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
        order[`playlist.${fieldName}`] = filter.order[fieldName];
      });
      query.orderBy(order);
    } else {
      query.orderBy('playlist.updatedAt', 'DESC');
    }
    query.take(filter.pageSize).skip((filter.page - 1) * filter.pageSize);
    return query.getManyAndCount();
  }

  async createPlaylist({
    name,
    uid,
  }: {
    name: string;
    uid: string;
  }): Promise<Playlist> {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new BadRequestException('name is required');
    }
    const repository = this.dataSource.getRepository(Playlist);
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { uid } });
    if (!user) {
      throw new BadRequestException('user not found');
    }
    const existingPlaylist = await repository.findOne({
      where: { name: trimmed, owner: { id: user.id } },
      relations: ['owner'],
    });
    if (existingPlaylist) {
      return existingPlaylist;
    }
    const playlist = new Playlist();
    playlist.name = trimmed;
    playlist.owner = user;
    await repository.save(playlist);
    return playlist;
  }

  async updatePlaylist({
    id,
    name,
    uid,
  }: {
    id: number;
    name: string;
    uid: string;
  }): Promise<Playlist> {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new BadRequestException('name is required');
    }
    const playlist = await this.requireOwnedPlaylist(id, uid, ['owner']);
    playlist.name = trimmed;
    return this.dataSource.getRepository(Playlist).save(playlist);
  }

  async deletePlaylist({
    id,
    uid,
  }: {
    id: number;
    uid: string;
  }): Promise<Playlist> {
    const repository = this.dataSource.getRepository(Playlist);
    const playlist = await this.requireOwnedPlaylist(id, uid, ['owner']);
    await repository.remove(playlist);
    return playlist;
  }

  private async loadOwnedMusic(uid: string, musicIds: Array<string | number>) {
    const ids = musicIds.map(String).filter(Boolean);
    if (!ids.length) return [] as Music[];
    const libraries = await MediaLibrary.getLibraryByUid(uid, this.dataSource);
    if (libraries.length === 0) {
      throw new BadRequestException('you have no library');
    }
    const musicRepository = this.dataSource.getRepository(Music);
    const music = await musicRepository
      .createQueryBuilder('music')
      .leftJoin('music.library', 'library', 'library.id = music.libraryId')
      .leftJoinAndSelect('music.album', 'album', 'album.id = music.albumId')
      .leftJoinAndSelect('music.artist', 'artist')
      .where('library.id IN (:...libraries)', {
        libraries: libraries.map((l) => l.id),
      })
      .andWhere('music.id IN (:...musicIds)', { musicIds: ids })
      .getMany();
    const byId = new Map(music.map((m) => [String(m.id), m]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as Music[];
  }

  async addMusicToPlaylist({
    musicIds,
    uid,
    playlistId,
  }: {
    musicIds: string[];
    uid: string;
    playlistId: number;
  }) {
    const repository = this.dataSource.getRepository(Playlist);
    const playlist = await this.requireOwnedPlaylist(playlistId, uid, [
      'music',
      'owner',
    ]);
    const music = await this.loadOwnedMusic(uid, musicIds);
    playlist.music = [...(playlist.music || []), ...music];
    playlist.music = playlist.music.filter(
      (m, i, self) => self.findIndex((t) => t.id === m.id) === i,
    );
    await repository.save(playlist);
    return this.getPlaylistById(playlist.id);
  }

  async removeMusicFromPlaylist({
    musicIds,
    uid,
    playlistId,
  }: {
    musicIds: string[];
    uid: string;
    playlistId: number;
  }) {
    const repository = this.dataSource.getRepository(Playlist);
    const playlist = await this.requireOwnedPlaylist(playlistId, uid, [
      'music',
      'owner',
    ]);
    const removeSet = new Set(musicIds.map((id) => String(id)));
    playlist.music = (playlist.music || []).filter(
      (m) => !removeSet.has(String(m.id)),
    );
    await repository.save(playlist);
    return this.getPlaylistById(playlist.id);
  }

  /** Replace playlist tracks in given order (also used for reorder). */
  async setPlaylistMusic({
    musicIds,
    uid,
    playlistId,
  }: {
    musicIds: Array<string | number>;
    uid: string;
    playlistId: number;
  }) {
    const repository = this.dataSource.getRepository(Playlist);
    const playlist = await this.requireOwnedPlaylist(playlistId, uid, [
      'music',
      'owner',
    ]);
    playlist.music = await this.loadOwnedMusic(uid, musicIds);
    await repository.save(playlist);
    return this.getPlaylistById(playlist.id);
  }

  async getPlaylistById(id: number) {
    const repository = this.dataSource.getRepository(Playlist);
    const playlist = await repository.findOne({
      where: { id },
      relations: ['music', 'owner', 'music.album', 'music.artist'],
    });
    if (!playlist) {
      throw new NotFoundException('playlist not found');
    }
    return playlist;
  }
}
