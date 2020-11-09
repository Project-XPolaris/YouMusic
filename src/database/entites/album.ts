import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Artist } from './artist';
import { Music } from './music';

@Entity()
export class Album {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;

  @ManyToMany(() => Artist)
  @JoinTable()
  artist: Artist[];

  @ManyToMany(() => Music)
  @JoinTable()
  music: Music[];

  @OneToMany(() => Music, (music) => music.album)
  album: Album[];
}
