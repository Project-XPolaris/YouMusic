import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  getRepository,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Album } from './album';
import { Music } from './music';
import { Library } from '../../library/entities/library.entity';
import { User } from './user';

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

  @ManyToOne(() => Album, (album) => album.music)
  album: Album;

  @ManyToMany(() => User)
  @JoinTable()
  users: User[];

  async delete() {
    for (const libraryMusic of this.music) {
      await Music.deleteMusic(libraryMusic.id);
    }
    const repo = await getRepository(MediaLibrary);
    repo.delete(this.id);
  }
  static async deleteById(id: number | string): Promise<boolean> {
    const repo = await getRepository(MediaLibrary);
    const library = await repo.findOne(id, { relations: ['music'] });
    if (library === undefined) {
      return false;
    }
    library.delete();
  }
}
