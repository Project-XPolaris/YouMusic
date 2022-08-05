import {
  Column,
  CreateDateColumn,
  Entity,
  getRepository,
  ManyToMany,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MediaLibrary } from './library';
import { SpotifyAuth } from './spotify';
import { Oauth } from './oauth';

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

  @ManyToMany(() => MediaLibrary, { cascade: true })
  libraries: MediaLibrary[];

  @OneToMany(() => Oauth, (oauth) => oauth.user)
  tokens: Oauth[];

  @OneToOne(() => SpotifyAuth, (auth) => auth.user, { nullable: true })
  spotifyAuth: SpotifyAuth;
  async createOrGet() {
    const repo = await getRepository(User);
    const count = await repo.count({ where: { uid: this.uid } });
    if (count === 0) {
      await repo.save(this);
    }
  }
}
