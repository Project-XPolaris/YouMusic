import { HttpService, Injectable } from '@nestjs/common';
import { getRepository } from 'typeorm';
import { Artist } from '../database/entites/artist';
import { PageFilter } from '../database/utils/type.filter';
import { filterByPage } from '../database/utils/page.filter';
import { publicUid } from '../vars';
import { v4 } from 'uuid';
import * as db from 'mime-db';
import { ApplicationConfig } from '../config';
import * as path from 'path';
import * as fs from 'fs';
import { getArrayBufferFromUrl } from '../utils/request';
import { UpdateArtistDTO } from './dto/update-artist.dto';

export type ArtistFilter = PageFilter & {
  order: { [key: string]: 'ASC' | 'DESC' };
  uid: string;
  search: string;
};

@Injectable()
export class ArtistService {
  constructor(private httpService: HttpService) {}

  async findAll(filter: ArtistFilter) {
    const artistRepository = getRepository(Artist);
    let queryBuilder = artistRepository.createQueryBuilder('artist');
    queryBuilder = filterByPage<Artist>(filter, queryBuilder);
    const order = {};
    Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
      order[`artist.${fieldName}`] = filter.order[fieldName];
    });
    queryBuilder.orderBy(order)
    if (filter.search.length > 0) {
      queryBuilder = queryBuilder.andWhere('artist.name like :search', {
        search: `%${filter.search}%`,
      });
    }
    queryBuilder = queryBuilder
      .leftJoin('artist.users', 'users')
      .andWhere('users.uid in (:...uid)', { uid: [publicUid, filter.uid] });
    return await queryBuilder.orderBy(order).getManyAndCount();
  }

  async findOne(id: number, uid: string) {
    const artistRepository = getRepository(Artist);
    return await artistRepository
      .createQueryBuilder('artist')
      .leftJoin('artist.users', 'users')
      .andWhereInIds([id])
      .andWhere('users.uid in (:...uid)', { uid: [publicUid, uid] })
      .getOne();
  }

  async updateArtistAvatarFromUrl(id: number, url: string) {
    const artist = await getRepository(Artist).findOne(id);
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
    return await getRepository(Artist).save(artist);
  }

  async checkAccessible(id: number, uid: string): Promise<boolean> {
    const artist = await getRepository(Artist).findOne(id, {
      relations: ['users'],
    });
    if (!artist) {
      return false;
    }
    return Boolean(artist.users.find((it) => it.uid === uid));
  }

  async updateArtist(id: number, data: UpdateArtistDTO) {
    let artist = await getRepository(Artist).findOne(id, {
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
    artist = await getRepository(Artist).save(artist);
    return artist;
  }
}
