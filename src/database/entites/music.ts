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

@Entity()
export class Music {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  path: string;
  @Column()
  title: string;

  @Column()
  duration: number;

  @ManyToMany(() => Artist, (artist) => artist.music,{
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  static deleteMusic = async (id: string | number) => {
    const repository = await getRepository(Music);
    const music = await repository.findOne(id, { relations: ['album'] });
    if (music === undefined) {
      return;
    }
    await repository.delete(music.id);
    if (music?.album?.id) {
      await Album.recycle(music.album.id);
    }
  };
}
