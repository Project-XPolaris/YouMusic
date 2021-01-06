import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  getRepository,
} from 'typeorm';
import { Album } from './album';
import { Music } from './music';

@Entity()
export class MediaLibrary {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  path: string;

  @OneToMany(() => Music, (music) => music.library)
  music: Music[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  async delete() {
    for (const libraryMusic of this.music) {
      await Music.deleteMusic(libraryMusic.id);
    }
    const repo = await getRepository(MediaLibrary);
    repo.delete(this.id);
  }
  static async deleteById(id: number | string): Promise<boolean> {
    const repo = await getRepository(MediaLibrary);
    const library = await repo.findOne(id, { relations: ['music'] });
    if (library === undefined) {
      return false;
    }
    library.delete();
  }
}
