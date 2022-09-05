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
import { Artist } from './artist';
import { Album } from './album';
import { Tag } from './tag';
import { Genre } from './genre';
import { Playlist } from './playlist';

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

  @ManyToMany(() => Artist, (artist) => artist.follow, { cascade: true })
  followArtist: Artist[];

  @ManyToMany(() => Album, (album) => album.follow, { cascade: true })
  followAlbum: Album[];

  @ManyToMany(() => Tag, (tag) => tag.follow, { cascade: true })
  followTag: Tag[];

  @ManyToMany(() => Genre, (genre) => genre.follow, { cascade: true })
  followGenre: Genre[];

  @ManyToMany(() => Playlist, (playlist) => playlist.follow, { cascade: true })
  followPlaylist: Playlist[];

  @OneToMany(() => Playlist, (playlist) => playlist.owner)
  ownPlaylist: Playlist[];

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
