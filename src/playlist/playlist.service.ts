import { Injectable } from '@nestjs/common';
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
  constructor(
    private dataSource: DataSource
  ) {}

  async getPlaylistList(filter: PlaylistFilter) {
    const repository = this.dataSource.getRepository(Playlist);
    const query = repository
      .createQueryBuilder('playlist')
      .leftJoinAndSelect('playlist.owner', 'owner')
      .where('owner.uid = :uid', { uid: filter.uid })
      .andWhere('playlist.name LIKE :name', {
        name: `%${filter.nameSearch || filter.name || ''}%`,
      })
      .orderBy('playlist.name', 'ASC');
    if (filter.random) {
      if (this.dataSource.options.type === 'sqlite') {
        query.orderBy('RANDOM()');
      } else {
        query.orderBy('RAND()');
      }
    } else {
      const order = {};
      Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
        order[`playlist.${fieldName}`] = filter.order[fieldName];
      });
      query.orderBy(order);
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
    const repository = this.dataSource.getRepository(Playlist);
    const playlist = new Playlist();
    playlist.name = name;
    // get user
    const user = await this.dataSource.getRepository(User).findOne({ where: { uid } });
    // check if playlist already exists
    const existingPlaylist = await repository.findOne({
      where: { name, owner: user },
      relations: ['owner'],
    });
    if (existingPlaylist) {
      return existingPlaylist;
    }
    playlist.owner = user;
    await repository.save(playlist);
    return playlist;
  }

  async deletePlaylist({
    id,
    uid,
  }: {
    id: number;
    uid: string;
  }): Promise<Playlist> {
    const repository = this.dataSource.getRepository(Playlist);
    const playlist = await repository.findOne({
      where: { id },
      relations: ['owner'],
    });
    if (!playlist) {
      throw new Error('playlist not found');
    }
    if (playlist.owner.uid !== uid) {
      throw new Error('you are not the owner of this playlist');
    }
    await repository.remove(playlist);
    return playlist;
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
    const playlist = await repository.findOne({
      where: { id: playlistId },
      relations: ['music', 'owner'],
    });
    if (!playlist) {
      throw new Error('playlist not found');
    }
    if (playlist.owner.uid !== uid) {
      throw new Error('you are not the owner of this playlist');
    }
    const libraries = await MediaLibrary.getLibraryByUid(uid, this.dataSource);
    if (libraries.length === 0) {
      throw new Error('you have no library');
    }
    const musicRepository = this.dataSource.getRepository(Music);
    const music = await musicRepository
      .createQueryBuilder('music')
      .leftJoin('music.library', 'library', 'library.id = music.libraryId')
      .leftJoinAndSelect('music.album', 'album', 'album.id = music.albumId')
      .where('library.id IN (:...libraries)', {
        libraries: libraries.map((l) => l.id),
      })
      .andWhere('music.id IN (:...musicIds)', { musicIds })
      .getMany();
    playlist.music = [...playlist.music, ...music];
    // remove duplicate music
    playlist.music = playlist.music.filter(
      (m, i, self) => self.findIndex((t) => t.id === m.id) === i,
    );
    await repository.save(playlist);
    return playlist;
  }

  async getPlaylistById(id: number) {
    const repository = this.dataSource.getRepository(Playlist);
    const playlist = await repository.findOne({
      where: { id },
      relations: ['music', 'owner', 'music.album', 'music.artist'],
    });
    if (!playlist) {
      throw new Error('playlist not found');
    }
    return playlist;
  }
}
