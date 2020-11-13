import { Injectable } from '@nestjs/common';
import { CreateArtistDto } from './dto/create-artist.dto';
import { UpdateArtistDto } from './dto/update-artist.dto';
import { getRepository } from 'typeorm';
import { Music } from '../database/entites/music';
import { Artist } from '../database/entites/artist';
import { PageFilter } from '../database/utils/type.filter';
import { filterByPage } from '../database/utils/page.filter';

export type ArtistFilter = PageFilter;
@Injectable()
export class ArtistService {
  async findAll(filter: ArtistFilter) {
    const artistRepository = getRepository(Artist);
    let queryBuilder = artistRepository.createQueryBuilder('artist');
    queryBuilder = filterByPage<Artist>(filter, queryBuilder);
    return await queryBuilder.getManyAndCount();
  }

  async findOne(id: number) {
    const artistRepository = getRepository(Artist);
    return await artistRepository.findOne(id);
  }
}
