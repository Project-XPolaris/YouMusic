import {
  Column,
  CreateDateColumn,
  Entity,
  getRepository,
  ManyToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MediaLibrary } from './library';
import { Album } from './album';
import { Music } from './music';
import { Artist } from './artist';
import { Genre } from './genre';
import { SpotifyAuth } from './spotify';

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

  @ManyToMany(() => Artist)
  artist: Artist[];

  @ManyToMany(() => Genre, (genre) => genre.users)
  genre: Genre[];

  @OneToOne(() => SpotifyAuth, (auth) => auth.user,{nullable:true})
  spotifyAuth: SpotifyAuth;
  async createOrGet() {
    const repo = await getRepository(User);
    const count = await repo.count({ uid: this.uid });
    if (count === 0) {
      await repo.save(this);
    }
  }
}
