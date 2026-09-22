import {
  Column,
  CreateDateColumn,
  Entity,
  DataSource,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Music } from './music';
import { MediaLibrary } from './library';
import { User } from './user';
import { isDuplicateKeyError } from '../../utils/db-error';

@Entity()
export class Genre {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @ManyToMany(() => Music, (music) => music.genre, { onDelete: 'CASCADE' })
  music: Music[];

  @ManyToMany(() => User, (user) => user.followGenre, { onDelete: 'CASCADE' })
  @JoinTable()
  follow: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  static async createOrGet(
    name: string,
    _library: MediaLibrary,
    dataSource: DataSource,
  ) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('genre name is empty');
    }
    const repo = dataSource.getRepository(Genre);
    let genre = await repo
      .createQueryBuilder('genre')
      .where('genre.name = :name', { name: trimmed })
      .getOne();
    if (genre) {
      return genre;
    }
    genre = new Genre();
    genre.name = trimmed;
    try {
      return await repo.save(genre);
    } catch (err) {
      if (!isDuplicateKeyError(err)) {
        throw err;
      }
      genre = await repo
        .createQueryBuilder('genre')
        .where('genre.name = :name', { name: trimmed })
        .getOne();
      if (!genre) {
        throw err;
      }
      return genre;
    }
  }
}
