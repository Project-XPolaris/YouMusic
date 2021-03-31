import { Injectable } from '@nestjs/common';
import { getRepository } from 'typeorm';
import { Artist } from '../database/entites/artist';
import { PageFilter } from '../database/utils/type.filter';
import { filterByPage } from '../database/utils/page.filter';
import { publicUid } from '../vars';

export type ArtistFilter = PageFilter & {
  order: { [key: string]: 'ASC' | 'DESC' };
  uid: string;
};
@Injectable()
export class ArtistService {
  async findAll(filter: ArtistFilter) {
    const artistRepository = getRepository(Artist);
    let queryBuilder = artistRepository.createQueryBuilder('artist');
    queryBuilder = filterByPage<Artist>(filter, queryBuilder);
    const order = {};
    Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
      order[`artist.${fieldName}`] = filter.order[fieldName];
    });
    queryBuilder = queryBuilder
      .leftJoin('artist.users', 'users')
      .andWhere('users.uid in (:...uid)', { uid: [publicUid, filter.uid] });
    return await queryBuilder.getManyAndCount();
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
}
