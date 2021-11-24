import { HttpService, Injectable } from '@nestjs/common';
import { getRepository } from 'typeorm';
import { Album } from '../database/entites/album';
import { PageFilter } from '../database/utils/type.filter';
import { publicUid } from '../vars';
import { UpdateAlbumDto } from './dto/update-album.dto';
import * as fs from 'fs';
import { Promise as id3Promise } from 'node-id3';
import * as path from 'path';
import { Artist } from '../database/entites/artist';
import { LibraryService } from '../library/library.service';
import { MediaLibrary } from '../database/entites/library';

export type AlbumQueryFilter = {
  artistId: number;
  order: { [key: string]: 'ASC' | 'DESC' };
  uid: string;
  search: string;
} & PageFilter;

@Injectable()
export class AlbumService {
  async findAll(filter: AlbumQueryFilter) {
    const libraries = await MediaLibrary.getLibraryByUid(filter.uid);
    const albumRepository = getRepository(Album);
    let queryBuilder = albumRepository.createQueryBuilder('album');
    queryBuilder = queryBuilder
      .skip((filter.page - 1) * filter.pageSize)
      .take(filter.pageSize);
    queryBuilder = queryBuilder.where('album.libraryId in (:...id)', {
      id: libraries.map((it) => it.id),
    });
    if (filter.artistId > 0) {
      queryBuilder.where((qb) => {
        const subQuery = qb
          .subQuery()
          .select('album.id')
          .from(Artist, 'artist')
          .leftJoin('artist.album', 'album')
          .where('artist.id = :aid', { aid: filter.artistId })
          .getQuery();
        return 'album.id IN ' + subQuery;
      });
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
    queryBuilder = queryBuilder.leftJoinAndSelect('album.artist', 'artist');
    queryBuilder.orderBy(order);

    return await queryBuilder.getManyAndCount();
  }

  async findOne(id: number, uid: string) {
    const libraries = await MediaLibrary.getLibraryByUid(uid);
    const albumRepository = getRepository(Album);
    const queryBuilder = albumRepository.createQueryBuilder('album');
    queryBuilder
      .leftJoinAndSelect('album.music', 'music')
      .leftJoinAndSelect('album.artist', 'artist')
      .leftJoinAndSelect('music.artist', 'musicArtist')
      .where('album.id = :id', { id })
      .andWhere('album.libraryId in (:...lid)', {
        lid: libraries.map((it) => it.id),
      });
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
