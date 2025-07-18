import { Injectable } from '@nestjs/common';
import { CreateLibraryDto } from './dto/create-library.dto';
import { DataSource } from 'typeorm';
import { PageFilter } from '../database/utils/type.filter';
import { filterByPage } from '../database/utils/page.filter';
import { MediaLibrary } from '../database/entites/library';
import { User } from '../database/entites/user';
import { publicUid } from '../vars';
import { Artist } from '../database/entites/artist';
import { ConfigService } from '@nestjs/config';
import { YouPlusService } from '../youplus/youplus.service';

export type LibraryQueryFilter = PageFilter;

@Injectable()
export class LibraryService {
  constructor(
    private configService: ConfigService,
    private youPlusService: YouPlusService,
    private dataSource: DataSource,
  ) {}

  async create(createLibraryDto: CreateLibraryDto, uid: string, token: string) {
    const repo = this.dataSource.getRepository(MediaLibrary);
    const newLibrary = new MediaLibrary();
    newLibrary.path = createLibraryDto.libraryPath;
    if (this.configService.get('youplus.enablePath')) {
      const result = await this.youPlusService.getRealpath(
        createLibraryDto.libraryPath,
        token,
      );
      newLibrary.path = result.path;
    }

    const userRepo = this.dataSource.getRepository(User);
    const user: User = await userRepo.findOne({ where: { uid } });
    if (!user) {
      throw new Error(`userid = ${uid} not exist`);
    }
    newLibrary.users = [user];
    await repo.save<MediaLibrary>(newLibrary);
    return newLibrary;
  }

  async findAll(filter: LibraryQueryFilter, uid: string) {
    const libraryRepository = this.dataSource.getRepository(MediaLibrary);
    let queryBuilder = libraryRepository.createQueryBuilder('library');
    queryBuilder = filterByPage<MediaLibrary>(filter, queryBuilder);
    queryBuilder = queryBuilder
      .leftJoin('library.users', 'users')
      .where('users.uid in (:...uids)', { uids: [uid, publicUid] });
    return await queryBuilder.getManyAndCount();
  }

  async findOne(id: number) {
    const libraryRepository = this.dataSource.getRepository(MediaLibrary);
    return await libraryRepository.findOne({
      where: { id },
    });
  }

  async remove(id: number) {
    await MediaLibrary.deleteById(id, this.dataSource);
  }

  async checkAccessible(libraryId: number, uid: string) {
    const repo = this.dataSource.getRepository(MediaLibrary);
    const count = await repo
      .createQueryBuilder('library')
      .leftJoin('library.users', 'users')
      .where('library.id = :id', { id: libraryId })
      .where('users.uid in (:...uids)', { uids: [uid, publicUid] })
      .getCount();
    return count > 0;
  }
}
