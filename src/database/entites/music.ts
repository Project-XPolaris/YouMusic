import {
  Column,
  CreateDateColumn,
  Entity,
  getRepository,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Artist } from './artist';
import { Album } from './album';
import { MediaLibrary } from './library';
import { User } from './user';
import { Genre } from './genre';
import * as fs from 'fs';
import NodeID3, { Promise as id3Promise } from 'node-id3';
import { Buffer } from 'buffer';

@Entity()
export class Music {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ unique: true })
  path: string;
  @Column()
  title: string;
  @Column({ nullable: true })
  year: number;
  @Column({ nullable: true })
  track: number;
  @Column()
  duration: number;
  @Column({ nullable: true })
  disc: number;
  @Column({ nullable: true })
  lyric: string;
  @Column({ nullable: true })
  lastModify: Date;

  @ManyToMany(() => Artist, (artist) => artist.music, {
    cascade: true,
  })
  @JoinTable()
  artist: Artist[];

  @ManyToOne(() => Album, (album) => album.music)
  album: Album;

  @ManyToOne(() => MediaLibrary, (library) => library.music)
  library: MediaLibrary;

  @ManyToMany(() => User)
  @JoinTable()
  users: User[];

  @ManyToMany(() => Genre, (genre) => genre.music, {
    cascade: true,
  })
  @JoinTable()
  genre: Genre[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  static deleteMusic = async (id: string | number) => {
    const repository = await getRepository(Music);
    const music = await repository.findOne(id, {
      relations: ['album', 'artist'],
    });
    if (music === undefined) {
      return;
    }
    await repository.delete(music.id);
    if (music?.album?.id) {
      await Album.recycle(music.album.id);
    }
    for (const musicArtist of music?.artist ?? []) {
      await Artist.recycleIfEmpty(musicArtist.id);
    }
  };
  writeMusicFileCover = async (mime: string, imageBuf: Buffer) => {
    const tags = {
      image: {
        mime,
        type: {
          id: 3,
          name: 'front cover',
        },
        description: 'cover',
        imageBuffer: imageBuf,
      },
    };
    const file = await fs.promises.readFile(this.path);
    const buf = await id3Promise.update(tags, file);
    await fs.promises.writeFile(this.path, buf);
  };

  readMusicID3 = async (tags: NodeID3.Tags) => {
    const file = await fs.promises.readFile(this.path);
    const buf = await id3Promise.update(tags, file);
    await fs.promises.writeFile(this.path, buf);
  };

  writeMusicID3 = async (tags: NodeID3.Tags) => {
    const file = await fs.promises.readFile(this.path);
    const buf = await id3Promise.update(tags, file);
    await fs.promises.writeFile(this.path, buf);
  };
  async save() {
    return await getRepository(Music).save(this);
  }
}
