import {
  Column,
  CreateDateColumn,
  Entity,
  getRepository,
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

  @OneToMany(() => Album, (album) => album.library)
  albums: Album[];

  @OneToMany(() => Artist, (artist) => artist.library)
  artists: Artist[];

  @ManyToMany(() => User, { onDelete: 'CASCADE' })
  @JoinTable()
  users: User[];

  async delete() {
    for (const libraryMusic of this.music) {
      await Music.deleteMusic(libraryMusic.id);
    }
    const repo = await getRepository(MediaLibrary);
    await repo.delete(this.id);
  }
  static async deleteById(id: number | string): Promise<boolean> {
    const repo = await getRepository(MediaLibrary);
    const library = await repo.findOne(id, { relations: ['music', 'users'] });
    if (library === undefined) {
      return false;
    }
    await library.delete();
  }
  static async getLibraryByUid(uid: string) {
    const libraryRepository = getRepository(MediaLibrary);
    let queryBuilder = libraryRepository.createQueryBuilder('library');
    queryBuilder = queryBuilder
      .leftJoin('library.users', 'users')
      .where('users.uid in (:...uids)', { uids: [uid, publicUid] });
    return await queryBuilder.getMany();
  }
}
