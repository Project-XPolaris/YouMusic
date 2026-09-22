import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateLibraryDto } from './dto/create-library.dto';
import { DataSource } from 'typeorm';
import * as path from 'path';
import { PageFilter } from '../database/utils/type.filter';
import { filterByPage } from '../database/utils/page.filter';
import { MediaLibrary } from '../database/entites/library';
import { Music } from '../database/entites/music';
import { Album } from '../database/entites/album';
import { User } from '../database/entites/user';
import { publicUid } from '../vars';
import { ConfigService } from '@nestjs/config';
import { YouPlusService } from '../youplus/youplus.service';

export type LibraryQueryFilter = PageFilter & {
  search?: string;
  order?: { [key: string]: 'ASC' | 'DESC' };
};

@Injectable()
export class LibraryService {
  constructor(
    private configService: ConfigService,
    private youPlusService: YouPlusService,
    private dataSource: DataSource,
  ) {}

  async create(createLibraryDto: CreateLibraryDto, uid: string, token: string) {
    const repo = this.dataSource.getRepository(MediaLibrary);
    const logicalPath = (createLibraryDto.libraryPath || '').trim();
    if (!logicalPath) {
      throw new BadRequestException('library path is empty');
    }
    if (this.configService.get('youplus.enablePath')) {
      if (logicalPath === '/' || logicalPath === '.') {
        throw new BadRequestException(
          'library path must be under a share, not /',
        );
      }
      // Validate ACL / existence; store logical Share path (not physical).
      const physical = await this.youPlusService.resolveLogicalPath(
        logicalPath,
        token,
      );
      if (!physical) {
        throw new BadRequestException('library path not accessible');
      }
    }

    const newLibrary = new MediaLibrary();
    newLibrary.path = logicalPath;

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
    let queryBuilder = libraryRepository
      .createQueryBuilder('library')
      .leftJoin('library.users', 'users')
      .loadRelationCountAndMap('library.musicCount', 'library.music')
      .where('users.uid in (:...uids)', { uids: [uid, publicUid] });

    const search = (filter.search || '').trim();
    if (search) {
      queryBuilder = queryBuilder.andWhere('library.path LIKE :search', {
        search: `%${search}%`,
      });
    }

    const orderKeys = Object.keys(filter.order || {});
    if (orderKeys.length) {
      const order: Record<string, 'ASC' | 'DESC'> = {};
      for (const fieldName of orderKeys) {
        if (['id', 'path', 'createdAt', 'updatedAt'].includes(fieldName)) {
          order[`library.${fieldName}`] = filter.order![fieldName];
        }
      }
      if (Object.keys(order).length) {
        queryBuilder = queryBuilder.orderBy(order);
      } else {
        queryBuilder = queryBuilder.orderBy('library.updatedAt', 'DESC');
      }
    } else {
      queryBuilder = queryBuilder.orderBy('library.updatedAt', 'DESC');
    }

    queryBuilder = filterByPage<MediaLibrary>(filter, queryBuilder);
    return await queryBuilder.getManyAndCount();
  }

  async findOne(id: number) {
    const libraryRepository = this.dataSource.getRepository(MediaLibrary);
    return await libraryRepository.findOne({
      where: { id },
    });
  }

  async findOneDetail(id: number) {
    const library = await this.findOneWithUsers(id);
    if (!library) {
      return null;
    }
    const musicRepo = this.dataSource.getRepository(Music);
    const albumRepo = this.dataSource.getRepository(Album);
    const musicCount = await musicRepo.count({ where: { libraryId: id } });
    const albumCount = await albumRepo
      .createQueryBuilder('album')
      .where('album.libraryId = :id', { id })
      .orWhere(
        'album.id IN (SELECT music.albumId FROM music WHERE music.libraryId = :id)',
        { id },
      )
      .getCount();
    return {
      id: library.id,
      path: library.path,
      name: path.basename(library.path),
      musicCount,
      albumCount,
      clapScan: library.clapScan !== false,
      createdAt: library.createdAt,
      updatedAt: library.updatedAt,
      users: (library.users || []).map((u) => ({ uid: u.uid })),
    };
  }

  async findOneWithUsers(id: number) {
    const libraryRepository = this.dataSource.getRepository(MediaLibrary);
    return await libraryRepository.findOne({
      where: { id },
      relations: ['users'],
    });
  }

  async listAllInternal() {
    const libraryRepository = this.dataSource.getRepository(MediaLibrary);
    const libraries = await libraryRepository.find({ relations: ['users'] });
    const out: {
      id: number;
      path: string;
      physicalPath: string;
      ownerUid: string;
    }[] = [];
    for (const lib of libraries) {
      let physicalPath = '';
      try {
        physicalPath = await this.youPlusService.resolveLogicalPath(lib.path);
      } catch {
        physicalPath = '';
      }
      const owner =
        (lib.users || []).find((u) => u.uid && u.uid !== publicUid)?.uid ||
        publicUid;
      out.push({
        id: lib.id,
        path: lib.path,
        physicalPath,
        ownerUid: owner,
      });
    }
    return out;
  }

  async remove(id: number) {
    await MediaLibrary.deleteById(id, this.dataSource);
  }

  async updateClapScan(id: number, clapScan: boolean) {
    const repo = this.dataSource.getRepository(MediaLibrary);
    const library = await repo.findOne({ where: { id } });
    if (!library) {
      throw new BadRequestException('library not found');
    }
    library.clapScan = clapScan;
    await repo.save(library);
    return {
      id: library.id,
      clapScan: library.clapScan !== false,
    };
  }

  async checkAccessible(libraryId: number, uid: string) {
    const repo = this.dataSource.getRepository(MediaLibrary);
    const count = await repo
      .createQueryBuilder('library')
      .leftJoin('library.users', 'users')
      .where('library.id = :id', { id: libraryId })
      .andWhere('users.uid in (:...uids)', { uids: [uid, publicUid] })
      .getCount();
    return count > 0;
  }
}
