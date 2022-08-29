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
import { v4 as uuidv4 } from 'uuid';
import { Buffer } from 'buffer';
import { makeThumbnail } from '../../utils/image';
import { User } from './user';

@Entity()
export class Album {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;
  @Column({ nullable: true })
  blurHash: string;
  @Column({ nullable: true })
  domainColor: string;
  @Column({ nullable: true })
  cover?: string;

  @OneToMany(() => Music, (music) => music.album, { onDelete: 'CASCADE' })
  music: Music[];

  @ManyToMany(() => Artist, (artist) => artist.album, { onDelete: 'CASCADE' })
  @JoinTable()
  artist: Artist[];

  @ManyToMany(() => User, (user) => user.followAlbum, { onDelete: 'CASCADE' })
  @JoinTable()
  follow: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * recycle album if music is empty
   * @param id album id
   */
  static async recycle(id: string | number): Promise<boolean> {
    const repository = await getRepository(Album);
    const album = await repository.findOne({
      where: { id: +id },
      relations: ['music'],
    });
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
      const artistAvatarUsage = await artistRepo.count({
        where: { avatar: this.cover },
      });
      if (artistAvatarUsage === 0) {
        const coverPath = path.join(ApplicationConfig.coverDir, this.cover);
        const isExist = await fs.existsSync(coverPath);
        if (isExist) {
          await fs.unlinkSync(coverPath);
        }
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
    await makeThumbnail(
      fileBuffer,
      path.join(ApplicationConfig.coverDir, coverFilename),
    );
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
