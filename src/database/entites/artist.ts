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

  @ManyToMany(() => Music, (music) => music.artist, { onDelete: 'CASCADE' })
  music: Music[];

  @ManyToMany(() => Album, (album) => album.artist, { onDelete: 'CASCADE' })
  album: Album[];

  @ManyToMany(() => User, (user) => user.followArtist,{ onDelete: 'CASCADE' })
  @JoinTable()
  follow: User[];

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

  static async recycleIfEmpty(id: string | number): Promise<boolean> {
    const repository = await getRepository(Artist);
    const artist = await repository.findOne({
      where: { id: +id },
      relations: ['music'],
    });
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
    const repository = await getRepository<Artist>(Artist);
    const artist = await repository.findOne({
      where: { id: this.id },
      relations: ['music'],
    });
    artist.music = [];
    artist.album = [];
    await repository.save(artist);
    await getRepository(Artist).delete(this.id);
  }
}
