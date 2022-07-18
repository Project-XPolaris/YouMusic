import { Tag } from '../database/entites/tag';

export class TagTemplate {
  id: number;
  name: string;
  constructor(tag: Tag) {
    this.id = tag.id;
    this.name = tag.name;
  }
}
