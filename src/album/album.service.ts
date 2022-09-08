import { Injectable } from '@nestjs/common';
import { getConnection, getRepository } from 'typeorm';
import { Album } from '../database/entites/album';
import { PageFilter } from '../database/utils/type.filter';
import { UpdateAlbumDto } from './dto/update-album.dto';
import * as fs from 'fs';
import { Promise as id3Promise } from 'node-id3';
import * as path from 'path';
import { Artist } from '../database/entites/artist';
import { MediaLibrary } from '../database/entites/library';
import { ThumbnailService } from '../thumbnail/thumbnail.service';
import { v4 as uuidv4 } from 'uuid';
import { ApplicationConfig } from '../config';

export type AlbumQueryFilter = {
  artistId: number;
  order: { [key: string]: 'ASC' | 'DESC' };
  uid: string;
  search: string;
  tag: string;
  genre: string[];
  random: boolean;
  followUid: string;
  id: number;
} & PageFilter;

@Injectable()
export class AlbumService {
  constructor(private thumbnailService: ThumbnailService) {}
  async findAll(filter: AlbumQueryFilter) {
    const libraries = await MediaLibrary.getLibraryByUid(filter.uid);
    const albumRepository = getRepository(Album);
    let queryBuilder = albumRepository.createQueryBuilder('album');
    queryBuilder = queryBuilder
      .skip((filter.page - 1) * filter.pageSize)
      .take(filter.pageSize);
    if (libraries.length > 0) {
      queryBuilder = queryBuilder
        .leftJoin('album.music', 'music')
        // .groupBy('album.id')
        .andWhere('music.libraryId in (:...id)', {
          id: libraries.map((it) => it.id),
        });
    }
    if (filter.artistId > 0) {
      queryBuilder.where((qb) => {
        const subQuery = qb
          .subQuery()
          .select('album.id')
          .from(Artist, 'artist')
          .leftJoin('artist.album', 'album')
          .where('artist.id = :aid', { aid: filter.artistId })
          .andWhere('music.libraryId in (:...lid)', {
            lid: libraries.map((it) => it.id),
          })
          .getQuery();
        return 'album.id IN ' + subQuery;
      });
    }
    if (filter.tag) {
      queryBuilder.where((qb) => {
        const subQuery = qb
          .subQuery()
          .select('album.id')
          .from(Album, 'album')
          .leftJoin('album.music', 'music')
          .leftJoin('music.tags', 'tags')
          .where('tags.id = :tag', { tag: filter.tag })
          .andWhere('music.libraryId in (:...lid)', {
            lid: libraries.map((it) => it.id),
          })
          .getQuery();
        return 'album.id IN ' + subQuery;
      });
    }
    if (filter.genre.length > 0 && filter.genre[0] !== '') {
      queryBuilder.where((qb) => {
        const subQuery = qb
          .subQuery()
          .select('album.id')
          .from(Album, 'album')
          .leftJoin('album.music', 'music')
          .leftJoin('music.genre', 'genre')
          .where('genre.id in (:...genres)', { genres: filter.genre })
          .andWhere('music.libraryId in (:...lid)', {
            lid: libraries.map((it) => it.id),
          })
          .getQuery();
        return 'album.id IN ' + subQuery;
      });
    }
    if (filter.followUid && filter.followUid.length > 0) {
      queryBuilder
        .leftJoinAndSelect('album.follow', 'follow')
        .andWhere('follow.uid = :uid', { uid: filter.followUid });
    }
    if (filter.id > 0) {
      queryBuilder.andWhere('album.id = :aid', { aid: filter.id });
    }
    if (filter.random) {
      if (getConnection().options.type === 'sqlite') {
        queryBuilder.orderBy('RANDOM()');
      } else {
        queryBuilder.orderBy('RAND()');
      }
    } else {
      const order = {};
      Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
        order[`album.${fieldName}`] = filter.order[fieldName];
      });
      queryBuilder.orderBy(order);
    }
    if (filter.search.length > 0) {
      queryBuilder.andWhere('album.name like :search', {
        search: `%${filter.search}%`,
      });
    }
    queryBuilder = queryBuilder.leftJoinAndSelect('album.artist', 'artist');

    return await queryBuilder.getManyAndCount();
  }

  async findOne(id: number, uid: string) {
    const libraries = await MediaLibrary.getLibraryByUid(uid);
    const albumRepository = getRepository(Album);
    let queryBuilder = albumRepository.createQueryBuilder('album');
    queryBuilder
      .leftJoinAndSelect('album.music', 'music')
      .leftJoinAndSelect('album.artist', 'artist')
      .leftJoinAndSelect('music.artist', 'musicArtist')
      .where('album.id = :id', { id });
    if (libraries.length > 0) {
      queryBuilder = queryBuilder.andWhere('music.libraryId in (:...lid)', {
        lid: libraries.map((it) => it.id),
      });
    }
    return queryBuilder.getOne();
  }

  async updateAlbum(id: number, data: UpdateAlbumDto) {
    let album = await getRepository(Album).findOne({
      where: { id },
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
    let album = await getRepository(Album).findOne({
      where: { id },
      relations: ['music'],
    });
    if (!album) {
      throw new Error('album not found');
    }
    const coverFilename = `${uuidv4()}.jpg`;
    await this.thumbnailService.generate(
      file.b,
      path.join(ApplicationConfig.coverDir, coverFilename),
    );
    album.cover = coverFilename;
    const mime = path.extname(file.originalname).replace('.', '');
    for (const music of album.music) {
      await music.writeMusicFileCover(mime, file.buffer);
    }
    album = await getRepository(Album).save(album);
    return album;
  }
}
