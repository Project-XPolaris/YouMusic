import { Tag } from '../database/entites/tag';

export class TagTemplate {
  id: number;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  musicCount?: number;
  
  constructor(tag: Tag & { musicCount?: number }) {
    this.id = tag.id;
    this.name = tag.name;
    this.createdAt = tag.createdAt?.toISOString();
    this.updatedAt = tag.updatedAt?.toISOString();
    
    // 如果有音乐数量，包含它
    if (tag.musicCount !== undefined) {
      this.musicCount = tag.musicCount;
    }
  }
}
