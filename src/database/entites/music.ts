import {
  Column,
  CreateDateColumn,
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

  @ManyToMany(() => Artist)
  @JoinTable()
  artist: Artist[];

  @ManyToOne(() => Album, (album) => album.music)
  album: Album;

  @ManyToOne(() => MediaLibrary, (library) => library.music)
  library: MediaLibrary;
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
