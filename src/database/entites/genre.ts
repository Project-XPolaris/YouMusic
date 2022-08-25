import {
  Column,
  CreateDateColumn,
  Entity,
  getRepository,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Music } from './music';
import { MediaLibrary } from './library';

@Entity()
export class Genre {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;

  @ManyToMany(() => Music, (music) => music.genre, { onDelete: 'CASCADE' })
  music: Music[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
  @ManyToOne(() => MediaLibrary, (library) => library.albums)
  library: MediaLibrary;
  static async createOrGet(name: string, library: MediaLibrary) {
    const repo = await getRepository(Genre);
    let genre = await repo
      .createQueryBuilder('genre')
      .where('genre.name = :name', { name })
      .andWhere('genre.libraryId = :id', { id: library.id })
      .getOne();
    if (genre) {
      return genre;
    }
    genre = new Genre();
    genre.name = name;
    genre.library = library;
    genre = await getRepository(Genre).save(genre);
    return genre;
  }
}
