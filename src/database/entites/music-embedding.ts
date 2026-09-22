import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('music_embedding')
export class MusicEmbedding {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  musicId: number;

  /** L2-normalized embedding as JSON array string */
  @Column('text')
  embedding: string;

  @Column({ default: 'laion/clap-htsat-fused' })
  model: string;

  /** Music.lastModify at embed time; used for invalidation */
  @Column({ type: 'datetime', nullable: true })
  sourceMtime: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
