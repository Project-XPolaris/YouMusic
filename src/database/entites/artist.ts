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
import { Album } from './album';
import { Music } from './music';
import { MediaLibrary } from './library';

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

  @ManyToMany(() => Album, (album) => album.artist)
  album: Album[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => MediaLibrary, (library) => library.albums)
  library: MediaLibrary;

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
  static async recycleIfEmpty(id: string | number): Promise<boolean> {
    const repository = await getRepository(Artist);
    const artist = await repository.findOne(id, { relations: ['music'] });
    if (artist === undefined) {
      // no artist
      return true;
    }
    if (artist.music.length === 0) {
      await artist.recycle();
      return true;
    }
    return false;
  }
  async recycle() {
    const repository = await getRepository(Artist);
    const artist = await repository.findOne(this.id, { relations: ['music'] });
    artist.music = [];
    artist.album = [];
    await getRepository(Artist).delete(this.id);
  }
}
