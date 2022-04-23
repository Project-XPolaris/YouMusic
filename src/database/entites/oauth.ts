import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user';

@Entity()
export class Oauth {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ unique: true })
  accessToken: string;
  @Column()
  refreshToken: string;
  @Column({ nullable: true })
  provider: string;
  @Column({ nullable: true })
  uid: string;

  @ManyToOne(() => User, (user) => user.tokens)
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
