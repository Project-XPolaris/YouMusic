import { Injectable } from '@nestjs/common';
import { getRepository } from 'typeorm';
import { Album } from '../database/entites/album';
import { filterByPage } from '../database/utils/page.filter';
import { PageFilter } from '../database/utils/type.filter';
import { publicUid } from '../vars';

export type AlbumQueryFilter = {
  artistId: number;
  order: { [key: string]: 'ASC' | 'DESC' };
  uid: string;
} & PageFilter;

@Injectable()
export class AlbumService {
  async findAll(filter: AlbumQueryFilter) {
    const albumRepository = getRepository(Album);
    let queryBuilder = albumRepository.createQueryBuilder('album');
    queryBuilder = filterByPage<Album>(filter, queryBuilder);
    if (filter.artistId > 0) {
      queryBuilder.where('artist.id = :id', { id: filter.artistId });
    }
    const order = {};
    Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
      order[`album.${fieldName}`] = filter.order[fieldName];
    });
    queryBuilder = queryBuilder
      .leftJoin('album.users', 'users')
      .andWhere('users.uid in (:...uid)', { uid: [publicUid, filter.uid] });
    queryBuilder = queryBuilder
      .leftJoinAndSelect('album.music', 'music')
      .leftJoinAndSelect('music.artist', 'artist');
    queryBuilder.orderBy(order);
    return queryBuilder.getManyAndCount();
  }

  async findOne(id: number, uid: string) {
    const albumRepository = getRepository(Album);
    const queryBuilder = albumRepository.createQueryBuilder('album');
    queryBuilder
      .leftJoin('album.users', 'users')
      .leftJoinAndSelect('album.music', 'music')
      .leftJoinAndSelect('music.artist', 'musicArtist')
      .where('album.id = :id', { id })
      .andWhere('users.uid in (:...uid)', { uid: [publicUid, uid] });
    return queryBuilder.getOne();
  }
}
