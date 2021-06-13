import { Column, CreateDateColumn, Entity, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user';

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
  @Column({ nullable: true })
  scope: string;
  @Column()
  refresh_token: string;

  @OneToOne(() => User, (user) => user.spotifyAuth, { nullable: true })
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
