import {
  CreateDateColumn,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Music } from './music';
import { User } from './user';

@Entity()
export class Group {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToMany(() => Music, (music) => music.genre, { onDelete: 'CASCADE' })
  musics: Music[];

  @ManyToMany(() => Music, (music) => music.genre, { onDelete: 'CASCADE' })
  users: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
