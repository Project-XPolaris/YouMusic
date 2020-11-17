import {
  Column,
  CreateDateColumn,
  Entity,
  getRepository,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Album } from './album';
import { Music } from './music';

@Entity()
export class Artist {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;
  @Column({ nullable: true })
  avatar: string;
  @ManyToMany(() => Album, (album) => album.artist)
  albums: Album[];

  @ManyToMany(() => Music, (music) => music.artist)
  music: Album[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
