import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class MediaLibrary {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  path: string;
}
