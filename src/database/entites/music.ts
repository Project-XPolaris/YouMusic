import {
  Column,
  CreateDateColumn,
  DataSource,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Artist } from './artist';
import { Album } from './album';
import { MediaLibrary } from './library';
import { Genre } from './genre';
import * as fs from 'fs';
import NodeID3, { Promise as id3Promise } from 'node-id3';
import { Buffer } from 'buffer';
import { Tag } from './tag';
import { Playlist } from './playlist';

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
  @Column()
  size: number;
  @Column({ nullable: true })
  bitrate: number;
  @Column({ nullable: true })
  sampleRate: number;
  @Column({ nullable: true })
  lossless: boolean;
  @ManyToMany(() => Artist, (artist) => artist.music, {
    onDelete: 'CASCADE',
  })
  @JoinTable()
  artist: Artist[];

  @ManyToOne(() => Album, (album) => album.music, { nullable: true })
  album?: Album;

  @Column({ nullable: true })
  albumId: number;

  @ManyToOne(() => MediaLibrary, (library) => library.music)
  library: MediaLibrary;
  @ManyToMany(() => Genre, (genre) => genre.music, {
    cascade: true,
  })
  @JoinTable()
  genre: Genre[];

  @ManyToMany(() => Tag, (tag) => tag.music, {
    onDelete: 'CASCADE',
  })
  @ManyToMany(() => Playlist, (playlist) => playlist.music, {
    cascade: true,
  })
  playlist: Playlist[];
  @ManyToMany(() => Tag, (tag) => tag.music, {
  })
  @JoinTable()
  tags: Tag[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  static deleteMusic = async (id: string | number,dataSource:DataSource) => {
    const repository = await dataSource.getRepository(Music);
    const music = await repository.findOne({
      where: { id: +id },
      relations: ['album', 'artist', 'tags'],
    });
    if (music === undefined) {
      return;
    }
    music.artist = [];
    music.tags = [];
    await repository.save(music);
    await repository.delete(music.id);
    if (music?.album?.id) {
      await Album.recycle(music.album.id,dataSource);
    }
    for (const musicArtist of music?.artist ?? []) {
      await Artist.recycleIfEmpty(musicArtist.id,dataSource);
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

  async save(dataSource:DataSource) {
    return await dataSource.getRepository(Music).save(this);
  }
}
