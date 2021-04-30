import { Injectable, UploadedFile } from '@nestjs/common';
import { getRepository } from 'typeorm';
import { Album } from '../database/entites/album';
import { PageFilter } from '../database/utils/type.filter';
import { publicUid } from '../vars';
import { UpdateAlbumDto } from './dto/update-album.dto';
import * as fs from 'fs';
import { Promise as id3Promise } from 'node-id3';
import * as path from 'path';

export type AlbumQueryFilter = {
  artistId: number;
  order: { [key: string]: 'ASC' | 'DESC' };
  uid: string;
  search: string;
} & PageFilter;

@Injectable()
export class AlbumService {
  async findAll(filter: AlbumQueryFilter) {
    const albumRepository = getRepository(Album);
    let queryBuilder = albumRepository.createQueryBuilder('album');
    queryBuilder = queryBuilder
      .offset((filter.page - 1) * filter.pageSize)
      .take(filter.pageSize);
    if (filter.artistId > 0) {
      queryBuilder.where('artist.id = :id', { id: filter.artistId });
    }
    if (filter.search.length > 0) {
      queryBuilder.andWhere('album.name like :search', {
        search: `%${filter.search}%`,
      });
    }
    const order = {};
    Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
      order[`album.${fieldName}`] = filter.order[fieldName];
    });
    queryBuilder = queryBuilder
      .leftJoin('album.users', 'users')
      .andWhere('users.uid in (:...uid)', { uid: [publicUid, filter.uid] });
    queryBuilder = queryBuilder.leftJoinAndSelect('album.artist', 'artist');
    queryBuilder.orderBy(order);
    return await queryBuilder.getManyAndCount();
  }

  async findOne(id: number, uid: string) {
    const albumRepository = getRepository(Album);
    const queryBuilder = albumRepository.createQueryBuilder('album');
    queryBuilder
      .leftJoin('album.users', 'users')
      .leftJoinAndSelect('album.music', 'music')
      .leftJoinAndSelect('album.artist', 'artist')
      .leftJoinAndSelect('music.artist', 'musicArtist')
      .where('album.id = :id', { id })
      .andWhere('users.uid in (:...uid)', { uid: [publicUid, uid] });
    return queryBuilder.getOne();
  }

  async updateAlbum(id: number, data: UpdateAlbumDto) {
    let album = await getRepository(Album).findOne(id, {
      relations: ['music'],
    });
    if (!album) {
      throw new Error('album not found');
    }
    if (data.name) {
      album.name = data.name;
      for (const music of album.music) {
        const file = await fs.promises.readFile(music.path);
        const buf = await id3Promise.update({ album: album.name }, file);
        await fs.promises.writeFile(music.path, buf);
      }
    }
    album = await getRepository(Album).save(album);
    return album;
  }

  async updateCoverFromFile(id: number, file: any) {
    let album = await getRepository(Album).findOne(id, {
      relations: ['music'],
    });
    if (!album) {
      throw new Error('album not found');
    }
    await album.setCover(file.buffer);
    const mime = path.extname(file.originalname).replace('.', '');
    for (const music of album.music) {
      await music.writeMusicFileCover(mime, file.buffer);
    }
    album = await getRepository(Album).save(album);
    return album;
  }
}
