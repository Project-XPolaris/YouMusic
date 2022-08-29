import {
  Column,
  CreateDateColumn,
  Entity,
  getRepository,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Music } from './music';
import { MediaLibrary } from './library';
import { User } from './user';

@Entity()
export class Genre {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
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

  static async createOrGet(name: string, library: MediaLibrary) {
    const repo = await getRepository(Genre);
    let genre = await repo
      .createQueryBuilder('genre')
      .where('genre.name = :name', { name })
      .getOne();
    if (genre) {
      return genre;
    }
    genre = new Genre();
    genre.name = name;
    genre = await getRepository(Genre).save(genre);
    return genre;
  }
}
