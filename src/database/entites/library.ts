import {
  Column,
  CreateDateColumn,
  DataSource,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Album } from './album';
import { Music } from './music';
import { User } from './user';
import { Artist } from './artist';
import { publicUid } from '../../vars';
import { Tag } from './tag';
import { Genre } from './genre';

@Entity()
export class MediaLibrary {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  path: string;

  @OneToMany(() => Music, (music) => music.library)
  music: Music[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToMany(() => User, { onDelete: 'CASCADE' })
  @JoinTable()
  users: User[];

  async delete(dataSource:DataSource) {
    for (const libraryMusic of this.music) {
      await Music.deleteMusic(libraryMusic.id,dataSource);
    }
    const repo = await dataSource.getRepository(MediaLibrary);
    await repo.delete(this.id);
  }
  static async deleteById(id: number | string,dataSource:DataSource): Promise<boolean> {
    await dataSource.transaction(async (transactionalEntityManager) => {
      const libraryRepo =
        transactionalEntityManager.getRepository(MediaLibrary);
      const library = await libraryRepo.findOne({
        where: { id: +id },
      });
      // remove music
      const musicRepo = transactionalEntityManager.getRepository(Music);
      await musicRepo.delete({ library: library });
      // remove library
      await libraryRepo.delete(id);
    });
    return true;
  }
  static async getLibraryByUid(uid: string,dataSource:DataSource) {
    const libraryRepository = dataSource.getRepository(MediaLibrary);
    let queryBuilder = libraryRepository.createQueryBuilder('library');
    queryBuilder = queryBuilder
      .leftJoin('library.users', 'users')
      .where('users.uid in (:...uids)', { uids: [uid, publicUid] });
    return await queryBuilder.getMany();
  }
}
