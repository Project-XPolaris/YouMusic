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
import { Music } from './music';
import { MediaLibrary } from './library';
import { User } from './user';

@Entity()
export class Tag {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;

  @ManyToMany(() => Music, (music) => music.tags, {
    cascade: true,
  })
  music: Music[];

  @ManyToMany(() => User, (user) => user.followTag, { onDelete: 'CASCADE' })
  @JoinTable()
  follow: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
  static async createOrGet(name: string, library: MediaLibrary) {
    const repo = await getRepository(Tag);
    let tag = await repo
      .createQueryBuilder('genre')
      .where('tag.name = :name', { name })
      .getOne();
    if (tag) {
      return tag;
    }
    tag = new Tag();
    tag.name = name;
    tag = await getRepository(Tag).save(tag);
    return tag;
  }
  // static async recycleEmptyMusicTag() {
  //   const tags = await getRepository(Tag).find({
  //     relations: ['music'],
  //   });
  //   for (const tag of tags) {
  //     if (tag.music.length === 0) {
  //       await tag.recycle();
  //     }
  //   }
  // }
}
