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
import { v4 as uuidv4 } from 'uuid';
import { Buffer } from 'buffer';
import sharp = require('sharp');

@Entity()
export class Album {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;

  @Column({ nullable: true })
  cover: string;

  @OneToMany(() => Music, (music) => music.album)
  music: Music[];

  @ManyToMany(() => User)
  @JoinTable()
  users: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * recycle album if music is empty
   * @param id album id
   */
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
  async duplicateCover(): Promise<string> {
    const ext = path.extname(this.cover);
    const newFilename = `${uuidv4()}${ext}`;
    const file = await fs.promises.readFile(
      path.join(ApplicationConfig.coverDir, this.cover),
    );
    await fs.promises.writeFile(
      path.join(ApplicationConfig.coverDir, newFilename),
      file,
    );
    return newFilename;
  }
  async setCover(fileBuffer: Buffer) {
    const coverFilename = `${uuidv4()}.jpg`;
    await sharp(fileBuffer)
      .resize({ width: 512 })
      .toFile(path.join(ApplicationConfig.coverDir, coverFilename));
    this.cover = coverFilename;
  }
}
