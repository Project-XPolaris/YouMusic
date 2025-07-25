import { HttpService, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Artist } from '../database/entites/artist';
import { PageFilter } from '../database/utils/type.filter';
import { filterByPage } from '../database/utils/page.filter';
import { v4 } from 'uuid';
import * as db from 'mime-db';
import { ApplicationConfig } from '../config';
import * as path from 'path';
import * as fs from 'fs';
import { getArrayBufferFromUrl } from '../utils/request';
import { UpdateArtistDTO } from './dto/update-artist.dto';
import { MediaLibrary } from '../database/entites/library';

export type ArtistFilter = PageFilter & {
  order: { [key: string]: 'ASC' | 'DESC' };
  uid: string;
  search: string;
  random: boolean;
  followUid: string;
  id: number;
};

@Injectable()
export class ArtistService {
  constructor(private httpService: HttpService, private dataSource: DataSource) {}

  async findAll(filter: ArtistFilter) {
    const libraries = await MediaLibrary.getLibraryByUid(filter.uid, this.dataSource);
    const artistRepository = this.dataSource.getRepository(Artist);
    let queryBuilder = artistRepository.createQueryBuilder('artist');
    queryBuilder = filterByPage<Artist>(filter, queryBuilder);
    if (filter.random) {
      if (this.dataSource.options.type === 'sqlite') {
        queryBuilder.orderBy('RANDOM()');
      } else {
        queryBuilder.orderBy('RAND()');
      }
    } else {
      const order = {};
      Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
        order[`artist.${fieldName}`] = filter.order[fieldName];
      });
      queryBuilder.orderBy(order);
    }
    if (filter.search.length > 0) {
      queryBuilder = queryBuilder.andWhere('artist.name like :search', {
        search: `%${filter.search}%`,
      });
    }
    if (filter.id > 0) {
      queryBuilder = queryBuilder.andWhere('artist.id = :aid', {
        aid: filter.id,
      });
    }
    if (libraries.length > 0) {
      queryBuilder = queryBuilder
        .leftJoin('artist.music', 'music')
        .groupBy('artist.id')
        .andWhere('music.libraryId in (:...id)', {
          id: libraries.map((it) => it.id),
        });
    }
    if (filter.followUid && filter.followUid.length > 0) {
      queryBuilder = queryBuilder
        .leftJoin('artist.follow', 'follow')
        .andWhere('follow.uid = :uid', { uid: filter.uid });
    }
    return await queryBuilder.getManyAndCount();
  }

  async findOne(id: number, uid: string) {
    const artistRepository = this.dataSource.getRepository(Artist);
    const libraries = await MediaLibrary.getLibraryByUid(uid, this.dataSource);
    return await artistRepository
      .createQueryBuilder('artist')
      // .leftJoin('artist.library', 'library')
      .andWhereInIds([id])
      // .andWhere('artist.libraryId in (:...lid)', {
      //   lid: libraries.map((it) => it.id),
      // })
      .getOne();
  }

  async updateArtistAvatarFromUrl(id: number, url: string) {
    const artist = await this.dataSource.getRepository(Artist).findOne({
      where: { id },
    });
    if (!artist) {
      return;
    }
    const { response, buf } = await getArrayBufferFromUrl(
      this.httpService,
      url,
    );
    const saveFilename = `${v4()}.${
      db[response.headers['content-type']].extensions[0]
    }`;
    const savePath = path.join(ApplicationConfig.coverDir, saveFilename);
    await fs.promises.writeFile(savePath, buf);
    if (artist.avatar) {
      await fs.promises.unlink(
        path.join(ApplicationConfig.coverDir, artist.avatar),
      );
    }
    artist.avatar = saveFilename;
    return await this.dataSource.getRepository(Artist).save(artist);
  }

  async checkAccessible(id: number, uid: string): Promise<boolean> {
    const libraries = await MediaLibrary.getLibraryByUid(uid, this.dataSource);
    const artist = await this.dataSource.getRepository(Artist)
      .createQueryBuilder('artist')
      .leftJoin('artist.music', 'music')
      .where('music.libraryId in (:...lid)', {
        lid: libraries.map((it) => it.id),
      });
    return Boolean(artist);
  }

  async updateArtist(id: number, data: UpdateArtistDTO) {
    let artist = await this.dataSource.getRepository(Artist).findOne({
      where: { id },
      relations: ['music', 'music.artist'],
    });
    if (data.name) {
      const oldName = artist.name;
      artist.name = data.name;
      for (const music of artist.music) {
        await music.writeMusicID3({
          artist: [
            ...music.artist.map((it) => it.name).filter((it) => it !== oldName),
            data.name,
          ].join(';'),
        });
      }
    }
    artist = await this.dataSource.getRepository(Artist).save(artist);
    return artist;
  }
}
