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
import { Artist } from './artist';
import { Music } from './music';
import * as path from 'path';
import { ApplicationConfig } from '../../config';

import * as fs from 'fs';
import { User } from './user';

@Entity()
export class Album {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;

  @Column({ nullable: true })
  cover: string;

  @ManyToMany(() => Artist)
  @JoinTable()
  artist: Artist[];

  @OneToMany(() => Music, (music) => music.album)
  music: Music[];

  @ManyToMany(() => User)
  @JoinTable()
  users: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  static async recycle(id: string | number) {
    const repository = await getRepository(Album);
    const album = await repository.findOne(id, { relations: ['music'] });
    if (album === undefined) {
      return;
    }
    if (album.music.length === 0) {
      await album.delete();
    }
  }
  async delete() {
    const repository = await getRepository(Album);
    await repository.delete(this.id);
    if (this.cover !== null) {
      const artistRepo = await getRepository(Artist);
      const artistAvatarUsage = await artistRepo.count({ avatar: this.cover });
      if (artistAvatarUsage === 0) {
        await fs.unlinkSync(path.join(ApplicationConfig.coverDir, this.cover));
      }
    }
  }
}
