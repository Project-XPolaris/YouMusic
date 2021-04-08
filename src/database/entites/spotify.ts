import {
  Column,
  CreateDateColumn,
  Entity,
  getRepository,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Artist } from './artist';
import { Album } from './album';
import { MediaLibrary } from './library';
import { User } from './user';
import { Genre } from './genre';

@Entity()
export class SpotifyAuth {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  uid: string;
  @Column()
  exp: number;
  @Column()
  accessToken: string;
  @Column()
  scope: string;
  @Column()
  refresh_token: string;

  @OneToOne(() => User, (user) => user.spotifyAuth,{nullable:true})
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
