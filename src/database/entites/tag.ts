import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  DataSource,
} from 'typeorm';
import { Music } from './music';
import { MediaLibrary } from './library';
import { User } from './user';
import { isDuplicateKeyError } from '../../utils/db-error';

@Entity()
export class Tag {
  @PrimaryGeneratedColumn()
  id: number;

  /** Tag names are unique — same label is the same tag. */
  @Column({ unique: true })
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

  static async createOrGet(
    name: string,
    _library: MediaLibrary,
    dataSource: DataSource,
  ) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('tag name is empty');
    }
    const repo = dataSource.getRepository(Tag);
    let tag = await repo
      .createQueryBuilder('tag')
      .where('tag.name = :name', { name: trimmed })
      .getOne();
    if (tag) {
      return tag;
    }
    tag = new Tag();
    tag.name = trimmed;
    try {
      return await repo.save(tag);
    } catch (err) {
      if (!isDuplicateKeyError(err)) {
        throw err;
      }
      tag = await repo
        .createQueryBuilder('tag')
        .where('tag.name = :name', { name: trimmed })
        .getOne();
      if (!tag) {
        throw err;
      }
      return tag;
    }
  }
}
