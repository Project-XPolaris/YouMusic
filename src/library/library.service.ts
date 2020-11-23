import { Injectable } from '@nestjs/common';
import { CreateLibraryDto } from './dto/create-library.dto';
import { UpdateLibraryDto } from './dto/update-library.dto';
import { getRepository } from 'typeorm';
import { PageFilter } from '../database/utils/type.filter';
import { Music } from '../database/entites/music';
import { filterByPage } from '../database/utils/page.filter';
import { MediaLibrary } from '../database/entites/library';

export type LibraryQueryFilter = PageFilter;

@Injectable()
export class LibraryService {
  async create(createLibraryDto: CreateLibraryDto) {
    const repo = getRepository(MediaLibrary);
    const newLibrary = new MediaLibrary();
    newLibrary.path = createLibraryDto.libraryPath;
    await repo.save<MediaLibrary>(newLibrary);
    return newLibrary;
  }

  async findAll(filter: LibraryQueryFilter) {
    const libraryRepository = getRepository(MediaLibrary);
    let queryBuilder = libraryRepository.createQueryBuilder('library');
    queryBuilder = filterByPage<MediaLibrary>(filter, queryBuilder);
    return await queryBuilder.getManyAndCount();
  }

  async findOne(id: number) {
    const libraryRepository = getRepository(MediaLibrary);
    return await libraryRepository.findOne(id);
  }

  remove(id: number) {
    return `This action removes a #${id} library`;
  }
}
