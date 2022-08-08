import {
  Column,
  CreateDateColumn,
  Entity,
  getConnection,
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

  @OneToMany(() => Album, (album) => album.library)
  albums: Album[];

  @OneToMany(() => Artist, (artist) => artist.library)
  artists: Artist[];
  @OneToMany(() => Tag, (tag) => tag.library)
  tags: Tag[];

  @ManyToMany(() => User, { onDelete: 'CASCADE' })
  @JoinTable()
  users: User[];

  async delete() {
    for (const libraryMusic of this.music) {
      await Music.deleteMusic(libraryMusic.id);
    }
    for (const tag of this.tags) {
      await getRepository(Tag).delete(tag.id);
    }
    for (const artist of this.artists) {
      await getRepository(Artist).delete(artist.id);
    }
    const repo = await getRepository(MediaLibrary);
    await repo.delete(this.id);
  }
  static async deleteById(id: number | string): Promise<boolean> {
    await getConnection().transaction(async (transactionalEntityManager) => {
      const libraryRepo =
        transactionalEntityManager.getRepository(MediaLibrary);
      const library = await libraryRepo.findOne({
        where: { id: +id },
      });
      // remove music
      const musicRepo = transactionalEntityManager.getRepository(Music);
      await musicRepo.delete({ library: library });
      // remove tags
      const tagRepo = transactionalEntityManager.getRepository(Tag);
      await tagRepo.delete({ library: library });
      // remove artists
      const artistRepo = transactionalEntityManager.getRepository(Artist);
      await artistRepo.delete({ library: library });
      // remove albums
      const albumRepo = transactionalEntityManager.getRepository(Album);
      await albumRepo.delete({ library: library });
      // remove genre
      const genreRepo = transactionalEntityManager.getRepository(Genre);
      await genreRepo.delete({ library: library });
      // remove library
      await libraryRepo.delete(id);
    });
    return true;
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
