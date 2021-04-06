import {
  Column,
  CreateDateColumn,
  Entity,
  getConnection,
  getManager,
  getRepository,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Album } from './album';
import { Music } from './music';
import { User } from './user';
import { uniq } from 'lodash';
import * as fs from 'fs';
import * as path from 'path';
import { ApplicationConfig } from '../../config';
@Entity()
export class Artist {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;
  @Column({ nullable: true })
  avatar: string;
  @ManyToMany(() => Album, (album) => album.artist)
  albums: Album[];

  @ManyToMany(() => Music, (music) => music.artist)
  music: Music[];

  @ManyToMany(() => User, (user) => user.artist)
  @JoinTable()
  users: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  static async recycleEmptyMusicArtist() {
    const artists = await getRepository(Artist).find({
      relations: ['music', 'albums'],
    });
    for (const artist of artists) {
      if (artist.albums.length === 0 && artist.music.length === 0) {
        await artist.recycle();
      }
    }
  }
  async recycle() {
    if (this.avatar && this.avatar.length > 0) {
      await fs.promises.unlink(
        path.join(ApplicationConfig.coverDir, this.avatar),
      );
    }
    await getRepository(Artist).delete(this.id);
  }
}
