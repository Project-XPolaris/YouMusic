import {
  Column,
  CreateDateColumn,
  Entity,
  getRepository,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MediaLibrary } from './library';
import { Album } from './album';
import { Music } from './music';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  uid: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToMany(() => MediaLibrary)
  libraries: MediaLibrary[];

  @ManyToMany(() => Album)
  albums: Album[];

  @ManyToMany(() => Music)
  music: Music[];

  async createOrGet() {
    const repo = await getRepository(User);
    const count = await repo.count({ uid: this.uid });
    if (count === 0) {
      await repo.save(this);
    }
  }
}
