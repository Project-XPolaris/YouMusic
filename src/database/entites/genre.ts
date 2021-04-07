import {
  Column,
  CreateDateColumn,
  Entity,
  getRepository,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user';
import { Music } from './music';

@Entity()
export class Genre {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;

  @ManyToMany(() => Music, (music) => music.genre)
  music: Music[];

  @ManyToMany(() => User)
  @JoinTable()
  users: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  static async createOrGet(name: string, user: User) {
    const repo = await getRepository(Genre);
    let genre = await repo
      .createQueryBuilder('genre')
      .leftJoin('genre.users', 'user')
      .where('genre.name = :name', { name })
      .andWhere('user.uid = :uid', { uid: user.uid })
      .getOne();
    if (genre) {
      return genre;
    }
    genre = new Genre();
    genre.name = name;
    genre.users = [user];
    genre = await getRepository(Genre).save(genre);
    return genre;
  }
}
