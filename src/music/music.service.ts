import { Injectable } from '@nestjs/common';
import { CreateMusicDto } from './dto/create-music.dto';
import { UpdateMusicDto } from './dto/update-music.dto';
import { getRepository } from 'typeorm';
import { Music } from 'src/database/entites/music';
import { PageFilter } from '../database/utils/type.filter';
import { filterByPage } from '../database/utils/page.filter';

export type MusicQueryFilter = PageFilter;
@Injectable()
export class MusicService {
  async findAll(filter: MusicQueryFilter) {
    const musicRepository = getRepository(Music);
    let queryBuilder = musicRepository.createQueryBuilder('music');
    queryBuilder = filterByPage<Music>(filter, queryBuilder);

    // with album

    return queryBuilder
      .leftJoinAndSelect('music.album', 'album')
      .leftJoinAndSelect('music.artist', 'artist')
      .getManyAndCount();
  }

  async findOne(id: number) {
    const musicRepository = getRepository(Music);
    return await musicRepository.findOne(id);
  }

  update(id: number, updateMusicDto: UpdateMusicDto) {}

  async remove(id: number) {
    const musicRepository = getRepository(Music);
    return await musicRepository.delete(id);
  }
}
