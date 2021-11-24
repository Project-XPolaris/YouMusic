import {
  Column,
  CreateDateColumn,
  Entity,
  getRepository,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Artist } from './artist';
import { Music } from './music';
import * as path from 'path';
import { ApplicationConfig } from '../../config';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Buffer } from 'buffer';
import { MediaLibrary } from './library';
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

  @ManyToMany(() => Artist, (artist) => artist.album)
  @JoinTable()
  artist: Artist[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => MediaLibrary, (library) => library.albums)
  library: MediaLibrary;

  /**
   * recycle album if music is empty
   * @param id album id
   */
  static async recycle(id: string | number): Promise<boolean> {
    const repository = await getRepository(Album);
    const album = await repository.findOne(id, { relations: ['music'] });
    if (album === undefined) {
      // no album
      return true;
    }
    if (album.music.length === 0) {
      await album.delete();
      return true;
    }
    return false;
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
  async refreshArtist() {
    const musicList = await getRepository(Artist)
      .createQueryBuilder('artist')
      .leftJoinAndSelect('artist.music', 'music')
      .where('music.albumId = :id', { id: this.id })
      .getMany();
    this.artist = musicList;
    await getRepository(Album).save(this);
  }
}
