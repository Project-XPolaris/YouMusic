import { Column, Entity, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Album } from './album';
import { Music } from './music';

@Entity()
export class Artist {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;

  @ManyToMany(() => Album, (album) => album.artist)
  Albums: Album[];

  @ManyToMany(() => Music, (music) => music.artist)
  Music: Album[];
}
