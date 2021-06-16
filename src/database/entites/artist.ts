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
import { Album } from './album';
import { Music } from './music';
import { User } from './user';

@Entity()
export class Artist {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;
  @Column({ nullable: true })
  avatar: string;

  @ManyToMany(() => Music, (music) => music.artist)
  music: Music[];

  @ManyToMany(() => User, (user) => user.artist)
  @JoinTable()
  users: User[];

  @ManyToMany(() => Album, (album) => album.artist)
  album: Album[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  static async recycleEmptyMusicArtist() {
    const artists = await getRepository(Artist).find({
      relations: ['music', 'album'],
    });
    for (const artist of artists) {
      if (artist.music.length === 0) {
        await artist.recycle();
      }
    }
  }
  async recycle() {
    await getRepository(Artist).delete(this.id);
  }
}
