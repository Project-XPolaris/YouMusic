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
import { MediaLibrary } from './library';
import { Album } from './album';
import { Music } from './music';
import { Artist } from './artist';
import { Genre } from './genre';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  uid: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToMany(() => MediaLibrary)
  libraries: MediaLibrary[];

  @ManyToMany(() => Album)
  albums: Album[];

  @ManyToMany(() => Music)
  music: Music[];

  @ManyToMany(() => Artist)
  artist: Artist[];

  @ManyToMany(() => Genre, (genre) => genre.users)
  genre: Genre[];

  async createOrGet() {
    const repo = await getRepository(User);
    const count = await repo.count({ uid: this.uid });
    if (count === 0) {
      await repo.save(this);
    }
  }
}
