import { Injectable } from '@nestjs/common';
import { getRepository } from 'typeorm';
import { Album } from '../database/entites/album';
import { filterByPage } from '../database/utils/page.filter';
import { PageFilter } from '../database/utils/type.filter';
export type AlbumQueryFilter = {
  artistId: number,
  order: { [key: string]: 'ASC' | 'DESC' }
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
    queryBuilder.orderBy(order);
    return queryBuilder
      .leftJoinAndSelect('album.artist', 'artist')
      .getManyAndCount();
  }

  async findOne(id: number) {
    const albumRepository = getRepository(Album);
    const queryBuilder = albumRepository.createQueryBuilder('album');
    queryBuilder
      .whereInIds([id])
      .leftJoinAndSelect('album.music', 'music')
      .leftJoinAndSelect('album.artist', 'artist')
      .leftJoinAndSelect('music.artist', 'musicArtist');
    return queryBuilder.getOne();
  }
}
