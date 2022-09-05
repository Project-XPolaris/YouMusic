import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Music } from './music';
import { User } from './user';
@Entity()
export class Playlist {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;

  @ManyToMany(() => Music, (music) => music.playlist)
  @JoinTable()
  music: Music[];

  @ManyToMany(() => User, (user) => user.followPlaylist, {
    onDelete: 'CASCADE',
  })
  @JoinTable()
  follow: User[];

  @ManyToOne(() => User, (user) => user.ownPlaylist, { onDelete: 'CASCADE' })
  owner?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
