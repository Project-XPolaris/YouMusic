import { Injectable } from '@nestjs/common';
import { CreateLibraryDto } from './dto/create-library.dto';
import { UpdateLibraryDto } from './dto/update-library.dto';
import { getRepository } from 'typeorm';
import { PageFilter } from '../database/utils/type.filter';
import { Music } from '../database/entites/music';
import { filterByPage } from '../database/utils/page.filter';
import { MediaLibrary } from '../database/entites/library';
import { User } from '../database/entites/user';
import { publicUid } from '../vars';

export type LibraryQueryFilter = PageFilter;

@Injectable()
export class LibraryService {
  async create(createLibraryDto: CreateLibraryDto, uid: string) {
    const repo = getRepository(MediaLibrary);
    const newLibrary = new MediaLibrary();
    newLibrary.path = createLibraryDto.libraryPath;
    const userRepo = await getRepository(User);
    const user: User = await userRepo.findOne({ uid });
    if (!user) {
      throw new Error(`userid = ${uid} not exist`);
    }
    newLibrary.users = [user];
    await repo.save<MediaLibrary>(newLibrary);
    return newLibrary;
  }

  async findAll(filter: LibraryQueryFilter, uid: string) {
    const libraryRepository = getRepository(MediaLibrary);
    let queryBuilder = libraryRepository.createQueryBuilder('library');
    queryBuilder = filterByPage<MediaLibrary>(filter, queryBuilder);
    queryBuilder = queryBuilder
      .leftJoin('library.users', 'users')
      .where('users.uid in (:...uids)', { uids: [uid, publicUid] });
    return await queryBuilder.getManyAndCount();
  }

  async findOne(id: number) {
    const libraryRepository = getRepository(MediaLibrary);
    return await libraryRepository.findOne(id);
  }

  remove(id: number) {
    return MediaLibrary.deleteById(id);
  }

  async checkAccessible(libraryId: number, uid: string) {
    const repo = await getRepository(MediaLibrary);
    const count = await repo
      .createQueryBuilder('library')
      .leftJoin('library.users', 'users')
      .where('library.id = :id', { id: libraryId })
      .where('users.uid in (:...uids)',{ uids: [uid, publicUid] })
      .getCount();
    return count > 0;
  }
}
